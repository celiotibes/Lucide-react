/**
 * aluguel-competencias.ts contra o schema real (criarBancoDeTeste()) — modelo de
 * COMPETÊNCIA para aluguel, o espelho, do lado da receita, do que contasAPagar.ts já
 * resolveu para o lado da despesa. Recria a intenção do `it.fails` original de
 * integracao-inadimplencia.test.ts ("status evolui por faixa de atraso...") contra a
 * função nova, que corrige a causa raiz (ver comentário no topo de aluguel-competencias.ts).
 */
import { describe, expect, it, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { consultar, executar } from "../../../db/connection";
import { criarEntidadeLegal } from "../entidadeLegal";
import { CONTA_CAIXA_ERP } from "../mapeamentoPlanoApp";
import {
  gerarCompetenciasPendentes,
  baixarCompetencia,
  apurarInadimplenciaContratoPorCompetencia,
} from "../aluguel-competencias";

const CPF_TESTE = "52998224725";
const CONTA_RECEITA_ALUGUEL_ERP = 4101; // "Aluguéis recebidos" (1.1.01)

let db: Database;
let entidade_id: number;
let imovel_id: number;
let conta_bancaria_id: number;

beforeEach(async () => {
  db = await criarBancoDeTeste();
  const r = criarEntidadeLegal(db, { nome: "Titular de Teste", cpf_cnpj: CPF_TESTE });
  if (!r.entidade_id) throw new Error(`Fixture não conseguiu criar a entidade: ${r.mensagem}`);
  entidade_id = r.entidade_id;

  executar(db, "INSERT INTO imoveis (apelido, tipo) VALUES ('Kitnet Teste', 'kitnet')");
  imovel_id = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id")[0].id;

  executar(
    db,
    "INSERT INTO contas_bancarias (banco, agencia, numero, titular, tipo) VALUES ('Banco Teste', '0001', '11111', 'Titular', 'corrente')",
  );
  conta_bancaria_id = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id")[0].id;
});

function criarContrato(
  dia_vencimento: number | null,
  data_inicio: string,
  valor_referencia = 1000,
  overrides: Record<string, number | string> = {},
) {
  const campos = {
    multa_percentual: 2.0,
    multa_ate_dias: 5,
    multa_percentual_substitutiva: 10.0,
    juros_mensal_percentual: 1.0,
    tipo: "residencial_fixo",
    ...overrides,
  };
  executar(
    db,
    `INSERT INTO contratos_locacao
      (imovel_id, locatario, tipo, valor_referencia, dia_vencimento, data_inicio,
       multa_percentual, multa_ate_dias, multa_percentual_substitutiva, juros_mensal_percentual)
     VALUES (?, 'Locatário Teste', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      imovel_id,
      campos.tipo,
      valor_referencia,
      dia_vencimento,
      data_inicio,
      campos.multa_percentual,
      campos.multa_ate_dias,
      campos.multa_percentual_substitutiva,
      campos.juros_mensal_percentual,
    ],
  );
  return consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id")[0].id;
}

function competenciasDoContrato(contrato_id: number) {
  return consultar<{
    id: number;
    ano: number;
    mes: number;
    data_vencimento: string;
    valor_devido: number;
    status: string;
    data_recebimento: string | null;
    ledger_entry_id_baixa: number | null;
  }>(db, "SELECT * FROM aluguel_competencias WHERE contrato_id = ? ORDER BY ano, mes", [contrato_id]);
}

function saldoLedgerConta(conta_id: number): { debito: number; credito: number } {
  const [r] = consultar<{ d: number | null; c: number | null }>(
    db,
    "SELECT SUM(valor_debito) AS d, SUM(valor_credito) AS c FROM ledger_entries WHERE conta_id = ?",
    [conta_id],
  );
  return { debito: r?.d ?? 0, credito: r?.c ?? 0 };
}

function saldoContaBancaria(conta_id: number): number {
  const [r] = consultar<{ s: number | null }>(db, "SELECT SUM(valor) AS s FROM transacoes WHERE conta_id = ?", [
    conta_id,
  ]);
  return r?.s ?? 0;
}

describe("aluguel-competencias: gerarCompetenciasPendentes", () => {
  it("gera uma competência por mês, do início do contrato até ate_data, com vencimento próprio de cada mês", () => {
    const contrato_id = criarContrato(10, "2025-01-15");
    const r = gerarCompetenciasPendentes(db, contrato_id, "2025-04-20");

    expect(r.sucesso).toBe(true);
    expect(r.competencias_criadas_ids).toHaveLength(4); // jan, fev, mar, abr

    const linhas = competenciasDoContrato(contrato_id);
    expect(linhas).toHaveLength(4);
    expect(linhas.map((l) => `${l.ano}-${l.mes}`)).toEqual(["2025-1", "2025-2", "2025-3", "2025-4"]);
    expect(linhas.map((l) => l.data_vencimento)).toEqual([
      "2025-01-10",
      "2025-02-10",
      "2025-03-10",
      "2025-04-10",
    ]);
    expect(linhas.every((l) => l.status === "pendente")).toBe(true);
    expect(linhas.every((l) => l.valor_devido === 1000)).toBe(true);
  });

  it("chamar de novo com a mesma ate_data não duplica nenhuma competência (idempotente)", () => {
    const contrato_id = criarContrato(10, "2025-01-15");
    gerarCompetenciasPendentes(db, contrato_id, "2025-04-20");
    const r2 = gerarCompetenciasPendentes(db, contrato_id, "2025-04-20");

    expect(r2.sucesso).toBe(true);
    expect(r2.competencias_criadas_ids).toHaveLength(0);
    expect(competenciasDoContrato(contrato_id)).toHaveLength(4);
  });

  it("chamar de novo com ate_data mais recente gera só as competências novas, a partir da última já gerada", () => {
    const contrato_id = criarContrato(10, "2025-01-15");
    gerarCompetenciasPendentes(db, contrato_id, "2025-02-20"); // jan, fev
    const r2 = gerarCompetenciasPendentes(db, contrato_id, "2025-04-20"); // mar, abr novas

    expect(r2.competencias_criadas_ids).toHaveLength(2);
    expect(competenciasDoContrato(contrato_id)).toHaveLength(4);
  });

  it("clampa dia_vencimento ao último dia do mês quando o mês não tem esse dia (ex.: 31 em fevereiro)", () => {
    const contrato_id = criarContrato(31, "2024-01-01");
    gerarCompetenciasPendentes(db, contrato_id, "2024-02-15");

    const linhas = competenciasDoContrato(contrato_id);
    expect(linhas.find((l) => l.mes === 1)!.data_vencimento).toBe("2024-01-31");
    expect(linhas.find((l) => l.mes === 2)!.data_vencimento).toBe("2024-02-29"); // 2024 é bissexto
  });

  it("não gera além de data_fim do contrato, mesmo que ate_data seja posterior", () => {
    const contrato_id = criarContrato(10, "2025-01-15");
    executar(db, "UPDATE contratos_locacao SET data_fim = '2025-02-28' WHERE id = ?", [contrato_id]);

    gerarCompetenciasPendentes(db, contrato_id, "2025-06-01");

    const linhas = competenciasDoContrato(contrato_id);
    expect(linhas).toHaveLength(2); // jan, fev — não mar/abr/mai/jun
  });

  it("contrato airbnb/temporada (sem dia_vencimento fixo) recusa geração, sem lançar exceção", () => {
    const contrato_id = criarContrato(null, "2025-01-15", 1000, { tipo: "airbnb_temporada" });
    const r = gerarCompetenciasPendentes(db, contrato_id, "2025-04-20");

    expect(r.sucesso).toBe(false);
    expect(r.competencias_criadas_ids).toHaveLength(0);
    expect(competenciasDoContrato(contrato_id)).toHaveLength(0);
  });

  it("contrato inexistente retorna falha, não lança exceção", () => {
    expect(() => gerarCompetenciasPendentes(db, 999999, "2025-04-20")).not.toThrow();
    expect(gerarCompetenciasPendentes(db, 999999, "2025-04-20").sucesso).toBe(false);
  });
});

describe("aluguel-competencias: baixarCompetencia", () => {
  it("baixa gera lançamento real no razão (débito Caixa/crédito Receita de Aluguel) e move o saldo da conta bancária certa", () => {
    const contrato_id = criarContrato(10, "2025-06-01", 1000);
    gerarCompetenciasPendentes(db, contrato_id, "2025-06-01");
    const [competencia] = competenciasDoContrato(contrato_id);

    const r = baixarCompetencia(db, competencia.id, conta_bancaria_id, "2025-06-10", entidade_id);

    expect(r.sucesso).toBe(true);
    expect(r.transacao_id).toBeDefined();
    expect(r.ledger_entry_id_baixa).toBeDefined();

    expect(saldoLedgerConta(CONTA_CAIXA_ERP).debito).toBeCloseTo(1000, 2);
    expect(saldoLedgerConta(CONTA_RECEITA_ALUGUEL_ERP).credito).toBeCloseTo(1000, 2);
    expect(saldoContaBancaria(conta_bancaria_id)).toBeCloseTo(1000, 2); // entrada, não saída

    const [linha] = competenciasDoContrato(contrato_id);
    expect(linha.status).toBe("recebido");
    expect(linha.data_recebimento).toBe("2025-06-10");
    expect(linha.ledger_entry_id_baixa).toBe(r.ledger_entry_id_baixa);
  });

  it("recusa baixa duplicada de uma competência já recebida", () => {
    const contrato_id = criarContrato(10, "2025-06-01", 1000);
    gerarCompetenciasPendentes(db, contrato_id, "2025-06-01");
    const [competencia] = competenciasDoContrato(contrato_id);

    baixarCompetencia(db, competencia.id, conta_bancaria_id, "2025-06-10", entidade_id);
    const r2 = baixarCompetencia(db, competencia.id, conta_bancaria_id, "2025-06-11", entidade_id);

    expect(r2.sucesso).toBe(false);
    expect(saldoLedgerConta(CONTA_CAIXA_ERP).debito).toBeCloseTo(1000, 2); // não dobrou
  });

  it("recusa baixa de competência cancelada", () => {
    const contrato_id = criarContrato(10, "2025-06-01", 1000);
    gerarCompetenciasPendentes(db, contrato_id, "2025-06-01");
    const [competencia] = competenciasDoContrato(contrato_id);
    executar(db, "UPDATE aluguel_competencias SET status = 'cancelado' WHERE id = ?", [competencia.id]);

    const r = baixarCompetencia(db, competencia.id, conta_bancaria_id, "2025-06-11", entidade_id);
    expect(r.sucesso).toBe(false);
  });

  it("competência inexistente ou conta bancária inexistente retornam falha, não lançam exceção", () => {
    expect(baixarCompetencia(db, 999999, conta_bancaria_id, "2025-06-11", entidade_id).sucesso).toBe(false);

    const contrato_id = criarContrato(10, "2025-06-01", 1000);
    gerarCompetenciasPendentes(db, contrato_id, "2025-06-01");
    const [competencia] = competenciasDoContrato(contrato_id);
    expect(baixarCompetencia(db, competencia.id, 999999, "2025-06-11", entidade_id).sucesso).toBe(false);
  });

  it("pagamento de UMA competência específica não quita as outras do mesmo contrato", () => {
    const contrato_id = criarContrato(10, "2025-01-15", 1000);
    gerarCompetenciasPendentes(db, contrato_id, "2025-03-20"); // jan, fev, mar
    const [jan, fev, mar] = competenciasDoContrato(contrato_id);

    baixarCompetencia(db, fev.id, conta_bancaria_id, "2025-02-10", entidade_id);

    const linhas = competenciasDoContrato(contrato_id);
    expect(linhas.find((l) => l.id === jan.id)!.status).toBe("pendente");
    expect(linhas.find((l) => l.id === fev.id)!.status).toBe("recebido");
    expect(linhas.find((l) => l.id === mar.id)!.status).toBe("pendente");
  });
});

describe("aluguel-competencias: apurarInadimplenciaContratoPorCompetencia", () => {
  it("contrato em dia (todas as competências recebidas) não gera falso-positivo de inadimplência", () => {
    const contrato_id = criarContrato(10, "2025-06-01", 1000);
    gerarCompetenciasPendentes(db, contrato_id, "2025-06-01");
    const [competencia] = competenciasDoContrato(contrato_id);
    baixarCompetencia(db, competencia.id, conta_bancaria_id, "2025-06-09", entidade_id); // pago antes do vencimento

    const r = apurarInadimplenciaContratoPorCompetencia(db, contrato_id, "2025-06-20")!;
    expect(r.dias_atraso).toBe(0);
    expect(r.status).toBe("normal");
    expect(r.valor_total_devido).toBe(0);
    expect(r.competencias_pendentes_ids).toHaveLength(0);
  });

  it("competência ainda não vencida (mês futuro) não conta como devida", () => {
    const contrato_id = criarContrato(20, "2025-06-01", 1000);
    gerarCompetenciasPendentes(db, contrato_id, "2025-06-01");

    const r = apurarInadimplenciaContratoPorCompetencia(db, contrato_id, "2025-06-15")!; // vencimento é dia 20
    expect(r.dias_atraso).toBe(0);
    expect(r.status).toBe("normal");
    expect(r.valor_total_devido).toBe(0);
  });

  /**
   * Recria a intenção do `it.fails` original de integracao-inadimplencia.test.ts
   * ("status evolui por faixa de atraso: com_atraso (≤30) → em_cobranca (31-90) →
   * litigioso (>90)"), contra a função nova, que corrige a causa raiz: aqui
   * `dias_atraso` é contado a partir da competência pendente MAIS ANTIGA, não do mês
   * corrente — por isso ultrapassa 30 dias de verdade conforme os meses se acumulam sem
   * pagamento. Mesmos dias do teste original (24, 65, 136), para a mesma prova.
   */
  it("contrato com 3+ meses seguidos sem pagamento: dias_atraso contado desde o MAIS ANTIGO, evolui com_atraso → em_cobranca → litigioso", () => {
    const contrato_id = criarContrato(1, "2025-06-01", 1000); // vencimento todo dia 1º, começa em junho
    // Gera de uma vez até a última data de checagem — cada checagem intermediária só
    // considera as competências cujo vencimento já passou até aquela data de referência.
    gerarCompetenciasPendentes(db, contrato_id, "2025-10-15");

    const r1 = apurarInadimplenciaContratoPorCompetencia(db, contrato_id, "2025-06-25")!;
    expect(r1.dias_atraso).toBe(24); // só junho venceu (24 dias desde 01/06)
    expect(r1.status).toBe("com_atraso");

    const r2 = apurarInadimplenciaContratoPorCompetencia(db, contrato_id, "2025-08-05")!;
    expect(r2.dias_atraso).toBe(65); // desde 01/06 (jun, jul, ago já venceram)
    expect(r2.status).toBe("em_cobranca");
    expect(r2.valor_aluguel_vencido).toBeCloseTo(3000, 2); // 3 competências pendentes

    const r3 = apurarInadimplenciaContratoPorCompetencia(db, contrato_id, "2025-10-15")!;
    expect(r3.dias_atraso).toBe(136); // desde 01/06 (jun..out já venceram: 5 meses)
    expect(r3.status).toBe("litigioso");
    expect(r3.valor_aluguel_vencido).toBeCloseTo(5000, 2);
    expect(r3.valor_total_devido).toBeGreaterThan(5000); // principal + multa + juros
  });

  it("valor_total_devido soma TODAS as competências pendentes vencidas, não só a mais recente", () => {
    const contrato_id = criarContrato(1, "2025-01-01", 1000);
    gerarCompetenciasPendentes(db, contrato_id, "2025-03-01"); // jan, fev, mar

    const r = apurarInadimplenciaContratoPorCompetencia(db, contrato_id, "2025-03-10")!;
    expect(r.competencias_pendentes_ids).toHaveLength(3);
    expect(r.valor_aluguel_vencido).toBeCloseTo(3000, 2);
  });

  it("pagar a competência mais antiga faz dias_atraso passar a contar da PRÓXIMA mais antiga ainda pendente", () => {
    const contrato_id = criarContrato(1, "2025-06-01", 1000);
    gerarCompetenciasPendentes(db, contrato_id, "2025-08-01"); // jun, jul, ago
    const [jun] = competenciasDoContrato(contrato_id);

    baixarCompetencia(db, jun.id, conta_bancaria_id, "2025-08-05", entidade_id);

    const r = apurarInadimplenciaContratoPorCompetencia(db, contrato_id, "2025-08-05")!;
    expect(r.dias_atraso).toBe(35); // agora conta desde 01/07 (julho), não mais 01/06 (35 dias até 05/08)
    expect(r.valor_aluguel_vencido).toBeCloseTo(2000, 2); // jul + ago, jun já quitado
  });

  it("contrato inexistente retorna null, não lança exceção", () => {
    expect(apurarInadimplenciaContratoPorCompetencia(db, 999999, "2025-06-20")).toBeNull();
  });
});
