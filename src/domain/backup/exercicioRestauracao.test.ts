import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar } from "../../db/connection";
import { criarEntidadeLegal, sincronizarRazao } from "../erp/entidadeLegal";
import {
  concluirExecucaoComFalha,
  concluirExecucaoComSucesso,
  iniciarExecucao,
  listarExercicios,
  obterExercicioComExecucoes,
  planejarExercicio,
  relatorioConformidadeRestauracao,
  revisarExercicio,
} from "./exercicioRestauracao";

/** Simula corrupção de ARQUIVO (disco/atacante): remove os triggers de imutabilidade do razão,
 * que bloqueiam alteração pela aplicação, para poder estragar os dados como o teste precisa. */
function simularCorrupcaoDoRazao(db: { run: (sql: string) => void }) {
  db.run("DROP TRIGGER IF EXISTS tg_ledger_entries_no_delete");
  db.run("DROP TRIGGER IF EXISTS tg_ledger_entries_no_update_dados");
}

/** O WASM do sql.js vem de node_modules no Node e de `/sql-wasm.wasm` no navegador — mesmo
 * resolvedor que `verificarBackup.test.ts` usa, repassado através de `exercicioRestauracao`
 * até `verificarBackup`. */
const WASM_NODE = (arquivo: string) => `node_modules/sql.js/dist/${arquivo}`;

const CPF_TESTE = "52998224725";

let db: Database;

/** Monta um banco VÁLIDO (razão balanceado) — mesma técnica de setup de
 * `verificarBackup.test.ts`, reaproveitada aqui em vez de inventada de novo. */
async function montarBancoValido(): Promise<Database> {
  const novoDb = await criarBancoDeTeste();
  executar(
    novoDb,
    "INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo) VALUES (1, 'Teste', '0001', '12345', 'Titular', 'corrente')",
  );
  executar(novoDb, "INSERT INTO imoveis (id, apelido, tipo) VALUES (1, 'Kitnet 101', 'kitnet')");
  const r = criarEntidadeLegal(novoDb, { nome: "Titular de Teste", cpf_cnpj: CPF_TESTE });
  const entidade_id = r.entidade_id!;

  for (const [id, data, valor, codigo] of [
    [1, "2024-03-10", 2500, "1.1.01"],
    [2, "2024-03-15", -430.5, "2.1.01"],
  ] as const) {
    executar(
      novoDb,
      `INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo)
       VALUES (?, 1, ?, ?, ?, ?)`,
      [id, data, valor, `Lançamento ${id}`, codigo],
    );
  }
  sincronizarRazao(novoDb, entidade_id);
  return novoDb;
}

/** Move `iniciado_em` de uma execução recém-criada para um timestamp controlado — permite
 * calcular RPO/RTO esperados com exatidão em vez de comparar contra "algum número positivo". */
function forcarInicioEm(alvo: Database, execucaoId: number, iso: string): void {
  executar(alvo, "UPDATE exercicios_restauracao_execucoes SET iniciado_em = ? WHERE id = ?", [iso, execucaoId]);
}

beforeEach(async () => {
  db = await montarBancoValido();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("fluxo completo: planejado → executado (sucesso) → revisado", () => {
  it("percorre o ciclo de vida e calcula RPO/RTO reais a partir de timestamps controlados", async () => {
    const exercicio = planejarExercicio(db, {
      descricao: "Simulação trimestral de restauração — servidor principal",
      rpoHorasAlvo: 24,
      rtoHorasAlvo: 4,
      planejadoPara: "2024-06-01",
    });
    expect(exercicio.status).toBe("planejado");

    const execucao = iniciarExecucao(db, exercicio.id);
    expect(execucao.exercicio_id).toBe(exercicio.id);
    expect(execucao.concluido_em).toBeNull();

    // Início do exercício: 2024-06-01T10:00:00Z. Último backup conhecido bom: duas horas
    // antes — RPO esperado = 2h. "Agora" (fim da verificação): 30 minutos depois — RTO
    // esperado = 0.5h.
    forcarInicioEm(db, execucao.id, "2024-06-01T10:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-01T10:30:00.000Z"));

    const concluida = await concluirExecucaoComSucesso(
      db,
      execucao.id,
      {
        conteudoSqliteRestaurado: db.export(),
        dataUltimoBackupConhecido: "2024-06-01T08:00:00.000Z",
      },
      WASM_NODE,
    );

    expect(concluida.resultado).toBe("sucesso");
    expect(concluida.rpo_horas_real).toBeCloseTo(2, 5);
    expect(concluida.rto_horas_real).toBeCloseTo(0.5, 5);
    expect(concluida.evidencia_hash).toMatch(/^[0-9a-f]{64}$/);
    // Cadeia de custódia dupla: hash do relatório (JSON de verificarBackup) e hash do
    // arquivo .sqlite restaurado em si — devem ser gravados e ser DIFERENTES entre si (um
    // hasheia o relatório JSON, outro os bytes binários do arquivo).
    expect(concluida.evidencia_hash_arquivo).toMatch(/^[0-9a-f]{64}$/);
    expect(concluida.evidencia_hash_arquivo).not.toBe(concluida.evidencia_hash);
    expect(concluida.concluido_em).toBe("2024-06-01T10:30:00.000Z");

    const exercicioExecutado = listarExercicios(db, { status: "executado" });
    expect(exercicioExecutado.map((e) => e.id)).toContain(exercicio.id);

    const revisado = revisarExercicio(db, exercicio.id, "auditor@example.com");
    expect(revisado.status).toBe("revisado");
    expect(revisado.execucoes).toHaveLength(1);
    expect(revisado.execucoes[0].revisado_por).toBe("auditor@example.com");
    expect(revisado.execucoes[0].revisado_em).not.toBeNull();
  });
});

describe("execução com falha", () => {
  it("verificação que encontra falha não marca sucesso nem calcula RPO/RTO como válidos", async () => {
    // Mesma técnica de dano usada em verificarBackup.test.ts: apaga UMA perna do razão —
    // o período deixa de fechar (débito != crédito).
    simularCorrupcaoDoRazao(db);
    executar(db, "DELETE FROM ledger_entries WHERE id = (SELECT MIN(id) FROM ledger_entries)");

    const exercicio = planejarExercicio(db, {
      descricao: "Exercício com backup corrompido",
      rpoHorasAlvo: 12,
      rtoHorasAlvo: 2,
      planejadoPara: "2024-07-01",
    });
    const execucao = iniciarExecucao(db, exercicio.id);
    forcarInicioEm(db, execucao.id, "2024-07-01T09:00:00.000Z");

    const concluida = await concluirExecucaoComSucesso(
      db,
      execucao.id,
      {
        conteudoSqliteRestaurado: db.export(),
        dataUltimoBackupConhecido: "2024-07-01T07:00:00.000Z",
      },
      WASM_NODE,
    );

    expect(concluida.resultado).toBe("falha");
    expect(concluida.rpo_horas_real).toBeNull();
    expect(concluida.rto_horas_real).toBeNull();
    expect(concluida.evidencia_hash).toBeNull();
    expect(concluida.evidencia_hash_arquivo).toBeNull();
    expect(concluida.observacoes).toMatch(/Balanceamento do razão/);
    expect(concluida.observacoes).toMatch(/não fecham/);
    expect(concluida.concluido_em).not.toBeNull();

    // Mesmo em falha, o exercício sai de "planejado" — houve execução concluída.
    const [depois] = listarExercicios(db, { status: "executado" }).filter((e) => e.id === exercicio.id);
    expect(depois).toBeDefined();
  });

  it("concluirExecucaoComFalha registra falha sem rodar verificarBackup (ex.: arquivo corrompido antes de tentar)", () => {
    const exercicio = planejarExercicio(db, {
      descricao: "Exercício com arquivo de backup inexistente/corrompido no armazenamento",
      rpoHorasAlvo: 12,
      rtoHorasAlvo: 2,
      planejadoPara: "2024-07-10",
    });
    const execucao = iniciarExecucao(db, exercicio.id);

    const concluida = concluirExecucaoComFalha(db, execucao.id, "Arquivo de backup ausente no bucket de armazenamento externo.");

    expect(concluida.resultado).toBe("falha");
    expect(concluida.observacoes).toBe("Arquivo de backup ausente no bucket de armazenamento externo.");
    expect(concluida.rpo_horas_real).toBeNull();
    expect(concluida.rto_horas_real).toBeNull();
    expect(concluida.concluido_em).not.toBeNull();
  });
});

describe("revisão bloqueada antes de executar", () => {
  it("recusa revisar um exercício que ainda está 'planejado'", () => {
    const exercicio = planejarExercicio(db, {
      descricao: "Exercício ainda não rodado",
      rpoHorasAlvo: 24,
      rtoHorasAlvo: 4,
      planejadoPara: "2024-08-01",
    });

    expect(() => revisarExercicio(db, exercicio.id, "auditor@example.com")).toThrow(/planejado/);
  });

  it("iniciarExecucao rejeita exercício inexistente", () => {
    expect(() => iniciarExecucao(db, 999999)).toThrow(/não encontrado/);
  });
});

describe("relatório de conformidade de restauração", () => {
  it("identifica exercício revisado cujo RPO/RTO real ficou FORA da meta, e ignora o que ainda não foi revisado", async () => {
    // Exercício A: dentro da meta (RPO e RTO reais menores que o alvo).
    const exercicioDentro = planejarExercicio(db, {
      descricao: "Dentro da meta",
      rpoHorasAlvo: 24,
      rtoHorasAlvo: 4,
      planejadoPara: "2024-09-01",
    });
    const execA = iniciarExecucao(db, exercicioDentro.id);
    forcarInicioEm(db, execA.id, "2024-09-01T10:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-09-01T11:00:00.000Z")); // RTO real = 1h (alvo 4h)
    await concluirExecucaoComSucesso(
      db,
      execA.id,
      { conteudoSqliteRestaurado: db.export(), dataUltimoBackupConhecido: "2024-09-01T09:00:00.000Z" }, // RPO real = 1h (alvo 24h)
      WASM_NODE,
    );
    vi.useRealTimers();
    revisarExercicio(db, exercicioDentro.id, "auditor@example.com");

    // Exercício B: FORA da meta — RPO real (10h) excede o alvo (2h); RTO real dentro do alvo.
    const exercicioFora = planejarExercicio(db, {
      descricao: "Fora da meta — RPO estourado",
      rpoHorasAlvo: 2,
      rtoHorasAlvo: 4,
      planejadoPara: "2024-09-05",
    });
    const execB = iniciarExecucao(db, exercicioFora.id);
    forcarInicioEm(db, execB.id, "2024-09-05T10:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-09-05T11:00:00.000Z")); // RTO real = 1h (alvo 4h, OK)
    await concluirExecucaoComSucesso(
      db,
      execB.id,
      { conteudoSqliteRestaurado: db.export(), dataUltimoBackupConhecido: "2024-09-05T00:00:00.000Z" }, // RPO real = 10h (alvo 2h, ESTOURA)
      WASM_NODE,
    );
    vi.useRealTimers();
    revisarExercicio(db, exercicioFora.id, "auditor@example.com");

    // Exercício C: teve execução de sucesso mas NUNCA foi revisado — não deve aparecer no relatório.
    const exercicioNaoRevisado = planejarExercicio(db, {
      descricao: "Executado mas não revisado ainda",
      rpoHorasAlvo: 24,
      rtoHorasAlvo: 4,
      planejadoPara: "2024-09-10",
    });
    const execC = iniciarExecucao(db, exercicioNaoRevisado.id);
    forcarInicioEm(db, execC.id, "2024-09-10T10:00:00.000Z");
    await concluirExecucaoComSucesso(
      db,
      execC.id,
      { conteudoSqliteRestaurado: db.export(), dataUltimoBackupConhecido: "2024-09-10T09:00:00.000Z" },
      WASM_NODE,
    );

    const relatorio = relatorioConformidadeRestauracao(db);
    const ids = relatorio.map((a) => a.exercicio_id);

    expect(ids).toContain(exercicioDentro.id);
    expect(ids).toContain(exercicioFora.id);
    expect(ids).not.toContain(exercicioNaoRevisado.id);

    const achadoDentro = relatorio.find((a) => a.exercicio_id === exercicioDentro.id)!;
    expect(achadoDentro.rpo_dentro_da_meta).toBe(true);
    expect(achadoDentro.rto_dentro_da_meta).toBe(true);
    expect(achadoDentro.nao_conformidade).toBe(false);

    const achadoFora = relatorio.find((a) => a.exercicio_id === exercicioFora.id)!;
    expect(achadoFora.rpo_horas_real).toBeCloseTo(10, 5);
    expect(achadoFora.rpo_dentro_da_meta).toBe(false);
    expect(achadoFora.rto_dentro_da_meta).toBe(true);
    expect(achadoFora.nao_conformidade).toBe(true);
  });
});

describe("leitura", () => {
  it("obterExercicioComExecucoes traz o exercício e todas as suas execuções", () => {
    const exercicio = planejarExercicio(db, {
      descricao: "Consulta de leitura",
      rpoHorasAlvo: 24,
      rtoHorasAlvo: 4,
      planejadoPara: "2024-10-01",
    });
    iniciarExecucao(db, exercicio.id);
    iniciarExecucao(db, exercicio.id);

    const completo = obterExercicioComExecucoes(db, exercicio.id)!;
    expect(completo.id).toBe(exercicio.id);
    expect(completo.execucoes).toHaveLength(2);
  });

  it("retorna null para exercício inexistente", () => {
    expect(obterExercicioComExecucoes(db, 999999)).toBeNull();
  });
});
