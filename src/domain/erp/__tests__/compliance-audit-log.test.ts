/**
 * compliance-audit-log.ts contra o schema real (criarBancoDeTeste()). Módulo órfão hoje
 * (nenhuma tela chama) mas NÃO redundante com src/domain/auditoria/*: aquele é a camada
 * forense de detecção de anomalia (duplicatas, outliers, Lei de Benford, lacunas — lê
 * `log_alteracoes` e as tabelas de negócio); este é o log imutável de acesso/operação com
 * cadeia de hash e assinatura HMAC (lê/escreve `auditoria_log`), o requisito de LGPD/
 * segurança citado desde o início desta auditoria ("immutable hash-chained logs"). Cada
 * um serve a uma pergunta diferente — "algo está estatisticamente estranho no razão?" vs.
 * "quem tocou o quê, e dá para provar que o log não foi adulterado?" — por isso os dois
 * ficam, nenhum substitui o outro.
 *
 * Este arquivo substitui a cobertura fictícia anterior (via test-setup.ts, dentro de
 * integracao-externa-completa.test.ts) por testes contra `criarBancoDeTeste()`.
 */
import { describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import {
  registrarChamadaAPI,
  verificarIntegridade,
  gerarRelatorioAuditoria,
  registrarAcessoLeitura,
  registrarErro,
  exportarLogAuditoria,
  listarAcessosUsuario,
  type RegistroAuditoria,
} from "../compliance-audit-log";

// Espera o fire-and-forget terminar (registrarAcessoLeitura/registrarErro chamam
// registrarChamadaAPI, que é async — várias chamadas reais a crypto.subtle por dentro —
// sem aguardar a Promise). Só microtask (Promise.resolve() encadeado) não basta porque
// crypto.subtle.digest/sign agendam trabalho que não resolve em ordem de microtask pura;
// um tick de macrotask (setTimeout) dá tempo de sobra para a cadeia inteira terminar.
async function aguardarMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

function chamadaBase(overrides: Partial<Parameters<typeof registrarChamadaAPI>[1]> = {}) {
  return {
    timestamp: "2026-01-15T10:00:00",
    usuario_id: 1,
    usuario_nome: "Admin",
    ip_origem: "127.0.0.1",
    modulo_chamador: "api-gateway",
    tipo_operacao: "leitura" as const,
    entidade_afetada: "ledger_entry",
    id_entidade: 1,
    descricao_alteracao: "Leitura de lançamento",
    status: "sucesso" as const,
    tempo_processamento_ms: 45,
    assinado: false,
    ...overrides,
  };
}

describe("compliance-audit-log: registrarChamadaAPI / verificarIntegridade (cadeia de hash)", () => {
  it("registra a chamada com hash, assinatura e data de retenção (7 anos)", async () => {
    const db = await criarBancoDeTeste();
    const registro = await registrarChamadaAPI(db, chamadaBase());

    expect(registro.id).toBeDefined();
    expect(registro.hash_sha256).toHaveLength(64); // SHA-256 em hex
    expect(registro.assinatura_digital).toHaveLength(64); // HMAC-SHA256 em hex
    expect(registro.hash_anterior).toBe(""); // primeiro registro, sem antecessor
    expect(registro.retencao_ate.slice(0, 4)).toBe("2033"); // 2026 + 7 anos
  });

  it("encadeia o hash: o segundo registro referencia o hash do primeiro", async () => {
    const db = await criarBancoDeTeste();
    const r1 = await registrarChamadaAPI(db, chamadaBase({ descricao_alteracao: "Primeira" }));
    const r2 = await registrarChamadaAPI(db, chamadaBase({ descricao_alteracao: "Segunda" }));

    expect(r2.hash_anterior).toBe(r1.hash_sha256);
    expect(r2.hash_sha256).not.toBe(r1.hash_sha256);
  });

  it("verificarIntegridade confirma uma cadeia intacta", async () => {
    const db = await criarBancoDeTeste();
    await registrarChamadaAPI(db, chamadaBase({ descricao_alteracao: "A" }));
    await registrarChamadaAPI(db, chamadaBase({ descricao_alteracao: "B" }));
    await registrarChamadaAPI(db, chamadaBase({ descricao_alteracao: "C" }));

    const verificacao = await verificarIntegridade(db, "2026-01-01", "2026-01-31");
    expect(verificacao.integro).toBe(true);
    expect(verificacao.registros_verificados).toBe(3);
    expect(verificacao.registros_corrompidos).toBe(0);
  });

  it("verificarIntegridade DETECTA adulteração: um hash_sha256 editado direto no banco quebra a cadeia", async () => {
    const db = await criarBancoDeTeste();
    await registrarChamadaAPI(db, chamadaBase({ descricao_alteracao: "A" }));
    const segundo = await registrarChamadaAPI(db, chamadaBase({ descricao_alteracao: "B" }));

    // Simula adulteração: alguém (ou um bug) reescreveu o hash de um registro depois de
    // gravado — o próprio propósito do módulo é entregar isso, não escondê-lo.
    (db as unknown as { run: (sql: string, params: unknown[]) => void }).run(
      "UPDATE auditoria_log SET hash_sha256 = ? WHERE id = ?",
      ["hash-forjado-0000000000000000000000000000000000000000000000000000", segundo.id!],
    );

    const verificacao = await verificarIntegridade(db, "2026-01-01", "2026-01-31");
    expect(verificacao.integro).toBe(false);
    expect(verificacao.registros_corrompidos).toBeGreaterThan(0);
  });

  it("verificarIntegridade com segredo de assinatura diferente do usado ao gravar acusa registro não autenticado", async () => {
    const db = await criarBancoDeTeste();
    await registrarChamadaAPI(db, chamadaBase(), { segredo: "segredo-de-producao" });

    // Confere com um segredo ERRADO — mesmo com o hash intacto (não foi adulterado), a
    // assinatura HMAC não bate, e isso também conta como corrompido/não confiável.
    const verificacao = await verificarIntegridade(db, "2026-01-01", "2026-01-31", {
      segredo: "segredo-errado",
    });
    expect(verificacao.integro).toBe(false);
  });

  it("período sem nenhum registro retorna íntegro=true com zero verificados (vazio não é corrompido)", async () => {
    const db = await criarBancoDeTeste();
    const verificacao = await verificarIntegridade(db, "2020-01-01", "2020-01-31");
    expect(verificacao.integro).toBe(true);
    expect(verificacao.registros_verificados).toBe(0);
    expect(verificacao.registros_corrompidos).toBe(0);
  });
});

describe("compliance-audit-log: relatório, exportação e consulta por usuário", () => {
  async function bancoComTresChamadas(): Promise<Database> {
    const db = await criarBancoDeTeste();
    await registrarChamadaAPI(db, chamadaBase({ usuario_id: 1, usuario_nome: "Ana", modulo_chamador: "api-gateway" }));
    await registrarChamadaAPI(
      db,
      chamadaBase({ usuario_id: 2, usuario_nome: "Bruno", modulo_chamador: "fisco", tipo_operacao: "escrita", status: "erro", mensagem_erro: "timeout" }),
    );
    await registrarChamadaAPI(db, chamadaBase({ usuario_id: 1, usuario_nome: "Ana", modulo_chamador: "api-gateway" }));
    return db;
  }

  it("gerarRelatorioAuditoria soma total, por tipo, por módulo, usuários distintos e erros", async () => {
    const db = await bancoComTresChamadas();
    const relatorio = gerarRelatorioAuditoria(db, "2026-01-01", "2026-01-31");

    expect(relatorio.total_registros).toBe(3);
    expect(relatorio.operacoes_por_tipo["leitura"]).toBe(2);
    expect(relatorio.operacoes_por_tipo["escrita"]).toBe(1);
    expect(relatorio.operacoes_por_modulo["api-gateway"]).toBe(2);
    expect(relatorio.operacoes_por_modulo["fisco"]).toBe(1);
    expect(relatorio.usuarios_ativos).toBe(2); // Ana e Bruno
    expect(relatorio.erros_registrados).toBe(1);
  });

  it("listarAcessosUsuario devolve só os registros do usuário pedido, mais recente primeiro", async () => {
    const db = await bancoComTresChamadas();
    const registros = listarAcessosUsuario(db, 1);

    expect(registros).toHaveLength(2);
    expect(registros.every((r: RegistroAuditoria) => r.usuario_id === 1)).toBe(true);
    // Colunas nomeadas (não SELECT * posicional) — confere que cada campo caiu no lugar
    // certo, não deslocado.
    expect(registros[0].usuario_nome).toBe("Ana");
    expect(registros[0].retencao_ate).toBeTruthy();
    expect(typeof registros[0].assinado).toBe("boolean");
  });

  it("exportarLogAuditoria em JSON produz array parseável com uma linha por registro", async () => {
    const db = await bancoComTresChamadas();
    const json = exportarLogAuditoria(db, "2026-01-01", "2026-01-31", "json");
    const linhas = JSON.parse(json);
    expect(Array.isArray(linhas)).toBe(true);
    expect(linhas).toHaveLength(3);
  });

  it("exportarLogAuditoria em CSV produz cabeçalho e uma linha por registro", async () => {
    const db = await bancoComTresChamadas();
    const csv = exportarLogAuditoria(db, "2026-01-01", "2026-01-31", "csv");
    const linhas = csv.trim().split("\n");
    expect(linhas[0]).toBe("id,timestamp,usuario,modulo,operacao,entidade,descricao,status,hash");
    expect(linhas).toHaveLength(4); // cabeçalho + 3 registros
  });

  it("registrarAcessoLeitura grava uma entrada de leitura sem o chamador precisar montar o objeto inteiro", async () => {
    const db = await criarBancoDeTeste();
    registrarAcessoLeitura(db, 5, "Carla", "10.0.0.1", "documento", 42, 12);
    await aguardarMicrotasks();

    const registros = listarAcessosUsuario(db, 5);
    expect(registros).toHaveLength(1);
    expect(registros[0].tipo_operacao).toBe("leitura");
    expect(registros[0].entidade_afetada).toBe("documento");
    expect(registros[0].status).toBe("sucesso");
  });

  it("registrarErro grava status='erro' com a mensagem original preservada", async () => {
    const db = await criarBancoDeTeste();
    registrarErro(db, 7, "conciliacao", "extrato", "arquivo OFX malformado", "10.0.0.2");
    await aguardarMicrotasks();

    const registros = listarAcessosUsuario(db, 7);
    expect(registros).toHaveLength(1);
    expect(registros[0].status).toBe("erro");
    expect(registros[0].mensagem_erro).toBe("arquivo OFX malformado");
  });
});
