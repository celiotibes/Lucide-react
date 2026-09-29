/**
 * integracao-contratos.ts contra o schema real (criarBancoDeTeste()). Reconstrução parcial
 * do balde B (docs/dominios-a-reconstruir.md, seção 5) — leia o comentário completo no topo
 * de integracao-contratos.ts antes de mexer neste arquivo: ele documenta por que só 1 das 5
 * funções originais (devolução de caução) foi reconstruída aqui, e por que as outras 4
 * duplicariam aluguel-competencias.ts / integracao-vistorias.ts (já vivos) ou não têm
 * contrapartida contábil válida no plano real.
 */
import { describe, expect, it, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { consultar, executar } from "../../../db/connection";
import { criarEntidadeLegal } from "../entidadeLegal";
import { contabilizarDevolucaoCaucao } from "../integracao-contratos";

const CPF_TESTE = "52998224725";
const CONTA_CAIXA_ERP = 1101;
const CONTA_CAUCAO_A_DEVOLVER_ERP = 3301;

let db: Database;
let entidade_id: number;
let imovel_id: number;
let contrato_id: number;
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
    `INSERT INTO contratos_locacao (imovel_id, locatario, tipo, valor_referencia, dia_vencimento, data_inicio)
     VALUES (?, 'Locatário Teste', 'residencial_fixo', 1000, 5, '2025-01-01')`,
    [imovel_id],
  );
  contrato_id = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id")[0].id;

  executar(
    db,
    "INSERT INTO contas_bancarias (banco, agencia, numero, titular, tipo) VALUES ('Banco Teste', '0001', '11111', 'Titular', 'corrente')",
  );
  conta_bancaria_id = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id")[0].id;
});

function criarCaucao(overrides: Partial<{
  valor_inicial: number;
  data_deposito: string;
  indice_correcao: string;
  deducoes_valor: number;
}> = {}): number {
  const campos = {
    valor_inicial: 1000,
    data_deposito: "2025-01-01",
    indice_correcao: "nenhum",
    deducoes_valor: 0,
    ...overrides,
  };
  executar(
    db,
    `INSERT INTO caucoes (contrato_id, valor_inicial, data_deposito, indice_correcao, deducoes_valor)
     VALUES (?, ?, ?, ?, ?)`,
    [contrato_id, campos.valor_inicial, campos.data_deposito, campos.indice_correcao, campos.deducoes_valor],
  );
  return consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id")[0].id;
}

function saldoConta(conta_id: number): { debito: number; credito: number } {
  const [r] = consultar<{ d: number; c: number }>(
    db,
    "SELECT COALESCE(SUM(valor_debito),0) d, COALESCE(SUM(valor_credito),0) c FROM ledger_entries WHERE conta_id = ?",
    [conta_id],
  );
  return { debito: r.d, credito: r.c };
}

function caucaoBruta(caucao_id: number) {
  return consultar<{ data_devolucao: string | null; valor_devolvido: number | null }>(
    db,
    "SELECT data_devolucao, valor_devolvido FROM caucoes WHERE id = ?",
    [caucao_id],
  )[0];
}

describe("integracao-contratos: contabilizarDevolucaoCaucao", () => {
  it("índice 'nenhum', sem dedução: débito Caução a Devolver / crédito Caixa pelo valor cheio, balanceado", () => {
    const caucao_id = criarCaucao({ valor_inicial: 1000 });

    const resultado = contabilizarDevolucaoCaucao(db, caucao_id, conta_bancaria_id, "2025-06-10", entidade_id);

    expect(resultado.sucesso).toBe(true);
    expect(resultado.valor_devolvido).toBeCloseTo(1000, 2);
    expect(saldoConta(CONTA_CAUCAO_A_DEVOLVER_ERP).debito).toBeCloseTo(1000, 2);
    expect(saldoConta(CONTA_CAIXA_ERP).credito).toBeCloseTo(1000, 2);

    const caucao = caucaoBruta(caucao_id);
    expect(caucao.data_devolucao).toBe("2025-06-10");
    expect(caucao.valor_devolvido).toBeCloseTo(1000, 2);
  });

  it("gera uma linha em transacoes (saída) reconciliada com o lançamento — mesmo padrão de baixarCompetencia", () => {
    const caucao_id = criarCaucao({ valor_inicial: 1000 });

    contabilizarDevolucaoCaucao(db, caucao_id, conta_bancaria_id, "2025-06-10", entidade_id);

    const [txn] = consultar<{ valor: number; conta_id: number; contrato_id: number }>(
      db,
      "SELECT valor, conta_id, contrato_id FROM transacoes WHERE contrato_id = ?",
      [contrato_id],
    );
    expect(txn.valor).toBeCloseTo(-1000, 2); // saída de caixa
    expect(txn.conta_id).toBe(conta_bancaria_id);

    const lancamentos = consultar<{ origem_modulo: string; origem_id: number }>(
      db,
      "SELECT origem_modulo, origem_id FROM ledger_entries",
    );
    expect(lancamentos.every((l) => l.origem_modulo === "transacoes")).toBe(true);
  });

  it("desconta deduções: devolve valor líquido, não o valor_inicial", () => {
    const caucao_id = criarCaucao({ valor_inicial: 1000, deducoes_valor: 150 });

    const resultado = contabilizarDevolucaoCaucao(db, caucao_id, conta_bancaria_id, "2025-06-10", entidade_id);

    expect(resultado.sucesso).toBe(true);
    expect(resultado.valor_devolvido).toBeCloseTo(850, 2);
    expect(saldoConta(CONTA_CAUCAO_A_DEVOLVER_ERP).debito).toBeCloseTo(850, 2);
  });

  it("dedução total (valor a devolver = 0): fecha a caução sem lançar nada no razão", () => {
    const caucao_id = criarCaucao({ valor_inicial: 1000, deducoes_valor: 1000 });

    const resultado = contabilizarDevolucaoCaucao(db, caucao_id, conta_bancaria_id, "2025-06-10", entidade_id);

    expect(resultado.sucesso).toBe(true);
    expect(resultado.valor_devolvido).toBe(0);
    expect(consultar(db, "SELECT id FROM ledger_entries")).toHaveLength(0);
    expect(consultar(db, "SELECT id FROM transacoes")).toHaveLength(0);
    expect(caucaoBruta(caucao_id).data_devolucao).toBe("2025-06-10");
  });

  it("dedução maior que o saldo corrigido: recusa (nunca fabrica um valor negativo a pagar)", () => {
    const caucao_id = criarCaucao({ valor_inicial: 1000, deducoes_valor: 1500 });

    const resultado = contabilizarDevolucaoCaucao(db, caucao_id, conta_bancaria_id, "2025-06-10", entidade_id);

    expect(resultado.sucesso).toBe(false);
    expect(consultar(db, "SELECT id FROM ledger_entries")).toHaveLength(0);
    expect(caucaoBruta(caucao_id).data_devolucao).toBeNull();
  });

  it("índice sem série completa cadastrada: recusa (não corrige às cegas)", () => {
    const caucao_id = criarCaucao({ valor_inicial: 1000, indice_correcao: "igpm", data_deposito: "2025-01-15" });
    // Nenhuma linha em indices_economicos para 'igpm' — mesesSemIndiceDisponivel não vazio.

    const resultado = contabilizarDevolucaoCaucao(db, caucao_id, conta_bancaria_id, "2025-06-10", entidade_id);

    expect(resultado.sucesso).toBe(false);
    expect(consultar(db, "SELECT id FROM ledger_entries")).toHaveLength(0);
  });

  it("é idempotente: caução já devolvida recusa uma segunda devolução", () => {
    const caucao_id = criarCaucao({ valor_inicial: 1000 });

    expect(contabilizarDevolucaoCaucao(db, caucao_id, conta_bancaria_id, "2025-06-10", entidade_id).sucesso).toBe(true);
    const segunda = contabilizarDevolucaoCaucao(db, caucao_id, conta_bancaria_id, "2025-07-01", entidade_id);

    expect(segunda.sucesso).toBe(false);
    expect(saldoConta(CONTA_CAUCAO_A_DEVOLVER_ERP).debito).toBeCloseTo(1000, 2); // não dobrou
  });

  it("caução inexistente retorna falha sem lançar nada", () => {
    const resultado = contabilizarDevolucaoCaucao(db, 99999, conta_bancaria_id, "2025-06-10", entidade_id);
    expect(resultado.sucesso).toBe(false);
    expect(consultar(db, "SELECT id FROM ledger_entries")).toHaveLength(0);
  });

  it("conta bancária inexistente retorna falha sem lançar nada", () => {
    const caucao_id = criarCaucao({ valor_inicial: 1000 });
    const resultado = contabilizarDevolucaoCaucao(db, caucao_id, 99999, "2025-06-10", entidade_id);
    expect(resultado.sucesso).toBe(false);
    expect(consultar(db, "SELECT id FROM ledger_entries")).toHaveLength(0);
  });
});
