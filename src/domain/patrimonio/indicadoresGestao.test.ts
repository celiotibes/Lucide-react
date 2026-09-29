import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar, consultar } from "../../db/connection";
import { criarEntidadeLegal } from "../erp/entidadeLegal";
import { registrarLancamentoContabil } from "../erp/ledger";
import { registrarContaAPagar } from "../contasAPagar/contasAPagar";
import {
  calcularLiquidezCorrenteGestao,
  calcularIndiceEndividamentoGestao,
  calcularMargemLiquidaConsolidada,
  calcularConsumoMedioMensalCaixa,
  calcularInadimplenciaConsolidada,
  calcularTaxaOcupacaoPortfolio,
} from "./indicadoresGestao";

const CPF_TESTE = "52998224725";

let db: Database;
let entidade_id: number;
let origemIdSeq = 1;

async function prepararBanco() {
  db = await criarBancoDeTeste();
  const r = criarEntidadeLegal(db, { nome: "Titular de Teste", cpf_cnpj: CPF_TESTE });
  if (!r.entidade_id) throw new Error(`Fixture não conseguiu criar a entidade: ${r.mensagem}`);
  entidade_id = r.entidade_id;
  origemIdSeq = 1;
}

function criarPeriodo(ano: number, mes: number): number {
  executar(db, "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, ?, ?, 'aberto')", [
    entidade_id,
    ano,
    mes,
  ]);
  return consultar<{ id: number }>(db, "SELECT id FROM periodos_contabeis WHERE entidade_id = ? AND ano = ? AND mes = ?", [
    entidade_id,
    ano,
    mes,
  ])[0].id;
}

/** Lança um par débito/crédito simples (conta_debito recebe valor_debito, conta_credito
 * recebe valor_credito) no período informado — atalho para montar cenários de teste sem
 * repetir os 8 campos de registrarLancamentoContabil duas vezes por lançamento. */
function lancarPar(periodo_id: number, contaDebito: number, contaCredito: number, valor: number, data: string) {
  const origem_id = origemIdSeq++;
  registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: contaDebito,
    data_lancamento: data,
    valor_debito: valor,
    descricao: "Lançamento de teste",
    origem_modulo: "manual",
    origem_id,
    referencia_documento: `TESTE-${origem_id}D`,
  });
  registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: contaCredito,
    data_lancamento: data,
    valor_credito: valor,
    descricao: "Lançamento de teste",
    origem_modulo: "manual",
    origem_id,
    referencia_documento: `TESTE-${origem_id}C`,
  });
}

describe("calcularIndiceEndividamentoGestao", () => {
  beforeEach(prepararBanco);

  it("passivo total / ativo total, reaproveitando gerarBalanco()", async () => {
    const periodo_id = criarPeriodo(2026, 1);
    // Ativo: caixa 10.000 contra capital social (PL) — não entra no passivo.
    lancarPar(periodo_id, 1101, 2101, 10000, "2026-01-05");
    // Passivo: uma despesa incorrida mas não paga (débito despesa, crédito contas a pagar).
    lancarPar(periodo_id, 6201, 3102, 4000, "2026-01-10");

    const resultado = calcularIndiceEndividamentoGestao(db, entidade_id, periodo_id);

    expect(resultado.ativo_total).toBeCloseTo(10000, 2);
    expect(resultado.passivo_total).toBeCloseTo(4000, 2);
    expect(resultado.indice).toBeCloseTo(0.4, 4);
    expect(resultado.motivo_nulo).toBeNull();
    expect(resultado.formula).toContain("Passivo total");
    expect(resultado.fonte_dados).toContain("gerarBalanco");
  });

  it("ativo total zero: índice null com motivo, nunca 0/NaN fabricado", async () => {
    const periodo_id = criarPeriodo(2026, 1);
    const resultado = calcularIndiceEndividamentoGestao(db, entidade_id, periodo_id);

    expect(resultado.ativo_total).toBe(0);
    expect(resultado.indice).toBeNull();
    expect(resultado.motivo_nulo).toMatch(/ativo total/i);
  });
});

describe("calcularLiquidezCorrenteGestao", () => {
  beforeEach(prepararBanco);

  it("(caixa+banco+aplicações) / (contas a pagar em aberto + parcela de financiamento em 12 meses)", async () => {
    const periodo_id = criarPeriodo(2026, 1);
    // Ativo circulante financeiro: 5.000 em caixa.
    lancarPar(periodo_id, 1101, 2101, 5000, "2026-01-05");

    // Contas a pagar em aberto (tabela contas_a_pagar, não o razão): R$ 1.000, vencendo
    // dentro do próprio período de referência.
    registrarContaAPagar(db, {
      entidade_id,
      fornecedor_nome: "Fornecedor Teste",
      valor: 1000,
      data_vencimento: "2026-01-20",
    });

    // Financiamento 'OUTRO' de um imóvel do portfólio (uso_pessoal=0): saldo 1.000,
    // parcela manual 200 — 5 parcelas restantes (ceil(1000/200)), todas dentro de 12
    // meses, somando 1.000.
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, uso_pessoal) VALUES (1, 'Kitnet 1', 'kitnet', 0)");
    executar(
      db,
      `INSERT INTO financiamentos (id, imovel_id, instituicao, sistema, valor_contratado, data_contrato, parcelas_total, saldo_devedor_manual, parcela_mensal_manual)
       VALUES (1, 1, 'Consórcio XYZ', 'OUTRO', 5000, '2025-01-01', 60, 1000, 200)`,
    );

    const resultado = calcularLiquidezCorrenteGestao(db, entidade_id, periodo_id);

    expect(resultado.data_referencia).toBe("2026-01-31");
    expect(resultado.ativo_circulante_financeiro).toBeCloseTo(5000, 2);
    expect(resultado.contas_a_pagar_em_aberto).toBeCloseTo(1000, 2);
    expect(resultado.parcela_financiamento_proximos_12_meses).toBeCloseTo(1000, 2);
    expect(resultado.passivo_circulante_consolidado).toBeCloseTo(2000, 2);
    expect(resultado.indice).toBeCloseTo(2.5, 4);
    expect(resultado.motivo_nulo).toBeNull();
  });

  it("sem contas a pagar nem financiamento: passivo circulante zero, índice null (não 'infinito')", async () => {
    const periodo_id = criarPeriodo(2026, 1);
    lancarPar(periodo_id, 1101, 2101, 5000, "2026-01-05");

    const resultado = calcularLiquidezCorrenteGestao(db, entidade_id, periodo_id);

    expect(resultado.passivo_circulante_consolidado).toBe(0);
    expect(resultado.indice).toBeNull();
    expect(resultado.motivo_nulo).toMatch(/passivo circulante/i);
  });

  it("período inexistente: todos os campos zerados e motivo explícito", async () => {
    const resultado = calcularLiquidezCorrenteGestao(db, entidade_id, 99999);
    expect(resultado.indice).toBeNull();
    expect(resultado.motivo_nulo).toMatch(/não encontrado/i);
  });
});

describe("calcularMargemLiquidaConsolidada", () => {
  beforeEach(prepararBanco);

  it("resultado líquido / receita bruta, por período, via gerarDRE()", async () => {
    const periodo_id = criarPeriodo(2026, 1);
    // Receita de aluguel: 10.000. Despesa de condomínio: 4.000.
    lancarPar(periodo_id, 1101, 4101, 10000, "2026-01-05");
    lancarPar(periodo_id, 5210, 1101, 4000, "2026-01-10");

    const resultado = calcularMargemLiquidaConsolidada(db, entidade_id);

    expect(resultado.periodos).toHaveLength(1);
    const linha = resultado.periodos[0];
    expect(linha.ano).toBe(2026);
    expect(linha.mes).toBe(1);
    expect(linha.receita_bruta).toBeCloseTo(10000, 2);
    expect(linha.resultado_liquido).toBeCloseTo(6000, 2);
    expect(linha.margem_percentual).toBeCloseTo(60, 2);
    expect(linha.motivo_nulo).toBeNull();
    expect(resultado.formula).toContain("Resultado líquido");
  });

  it("período sem receita: margem_percentual null com motivo, nunca 0 fabricado", async () => {
    const periodo_id = criarPeriodo(2026, 1);
    lancarPar(periodo_id, 5210, 1101, 500, "2026-01-10"); // só despesa, sem receita

    const resultado = calcularMargemLiquidaConsolidada(db, entidade_id);

    expect(resultado.periodos).toHaveLength(1);
    expect(resultado.periodos[0].receita_bruta).toBe(0);
    expect(resultado.periodos[0].margem_percentual).toBeNull();
    expect(resultado.periodos[0].motivo_nulo).toMatch(/receita bruta/i);
  });
});

describe("calcularConsumoMedioMensalCaixa", () => {
  beforeEach(prepararBanco);

  it("média das saídas de caixa (créditos em 1.1.01-03) dos últimos períodos disponíveis", async () => {
    const pNov = criarPeriodo(2025, 11);
    const pDez = criarPeriodo(2025, 12);
    const pJan = criarPeriodo(2026, 1);

    // Saída de caixa = crédito na conta de caixa (contrapartida em despesa, débito).
    lancarPar(pNov, 6201, 1101, 100, "2025-11-15");
    lancarPar(pDez, 6201, 1101, 200, "2025-12-15");
    lancarPar(pJan, 6201, 1101, 300, "2026-01-15");

    const resultado = calcularConsumoMedioMensalCaixa(db, entidade_id, 6);

    expect(resultado.meses_considerados).toHaveLength(3);
    expect(resultado.janela_meses_alvo).toBe(6);
    expect(resultado.media_mensal).toBeCloseTo((100 + 200 + 300) / 3, 4);
    expect(resultado.motivo_nulo).toBeNull();
    // Menos períodos que a janela-alvo: a fórmula deve dizer isso, não fingir 6 meses.
    expect(resultado.formula).toMatch(/3 período/);
  });

  it("respeita a janela pedida: só os N períodos mais recentes entram na média", async () => {
    const pNov = criarPeriodo(2025, 11);
    const pDez = criarPeriodo(2025, 12);
    const pJan = criarPeriodo(2026, 1);
    lancarPar(pNov, 6201, 1101, 1000, "2025-11-15"); // fora da janela de 2
    lancarPar(pDez, 6201, 1101, 200, "2025-12-15");
    lancarPar(pJan, 6201, 1101, 300, "2026-01-15");

    const resultado = calcularConsumoMedioMensalCaixa(db, entidade_id, 2);

    expect(resultado.meses_considerados).toHaveLength(2);
    expect(resultado.media_mensal).toBeCloseTo((200 + 300) / 2, 4);
  });

  it("entidade sem nenhum período contábil: média null com motivo, nunca 0 fabricado", async () => {
    const r2 = criarEntidadeLegal(db, { nome: "Outro Titular", cpf_cnpj: "11144477735" });
    const outraEntidade = r2.entidade_id!;

    const resultado = calcularConsumoMedioMensalCaixa(db, outraEntidade);

    expect(resultado.meses_considerados).toEqual([]);
    expect(resultado.media_mensal).toBeNull();
    expect(resultado.motivo_nulo).toMatch(/nenhum período/i);
  });
});

describe("calcularInadimplenciaConsolidada", () => {
  beforeEach(prepararBanco);

  it("soma o valor em atraso (competências vencidas e pendentes) sobre o total esperado até a data de referência", async () => {
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, uso_pessoal) VALUES (1, 'Kitnet 1', 'kitnet', 0)");
    executar(
      db,
      `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, dia_vencimento, data_inicio)
       VALUES (1, 1, 'Inquilino Teste', 'residencial_fixo', 1000, 10, '2025-06-01')`,
    );

    // Competência de janeiro: venceu, nunca foi paga (entra no numerador e no denominador).
    executar(
      db,
      `INSERT INTO aluguel_competencias (contrato_id, imovel_id, ano, mes, data_vencimento, valor_devido, status, criado_em)
       VALUES (1, 1, 2026, 1, '2026-01-10', 1000, 'pendente', '2026-01-01')`,
    );
    // Competência de fevereiro: venceu e foi paga (só entra no denominador).
    executar(
      db,
      `INSERT INTO aluguel_competencias (contrato_id, imovel_id, ano, mes, data_vencimento, valor_devido, data_recebimento, status, criado_em)
       VALUES (1, 1, 2026, 2, '2026-02-10', 1000, '2026-02-09', 'recebido', '2026-02-01')`,
    );
    // Competência de abril: ainda não venceu na data de referência — fora dos dois lados.
    executar(
      db,
      `INSERT INTO aluguel_competencias (contrato_id, imovel_id, ano, mes, data_vencimento, valor_devido, status, criado_em)
       VALUES (1, 1, 2026, 4, '2026-04-10', 1000, 'pendente', '2026-04-01')`,
    );

    const resultado = calcularInadimplenciaConsolidada(db, "2026-03-15");

    expect(resultado.contratos_considerados).toBe(1);
    expect(resultado.valor_em_atraso).toBeCloseTo(1000, 2);
    expect(resultado.valor_total_esperado).toBeCloseTo(2000, 2);
    expect(resultado.taxa_percentual).toBeCloseTo(50, 2);
    expect(resultado.motivo_nulo).toBeNull();
  });

  it("sem contrato residencial (dia_vencimento) no portfólio: null com motivo explícito", async () => {
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, uso_pessoal) VALUES (1, 'Kitnet 1', 'kitnet', 0)");
    executar(
      db,
      `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio)
       VALUES (1, 1, 'Hóspede Airbnb', 'airbnb_temporada', 500, '2025-06-01')`,
    );

    const resultado = calcularInadimplenciaConsolidada(db, "2026-03-15");

    expect(resultado.contratos_considerados).toBe(0);
    expect(resultado.taxa_percentual).toBeNull();
    expect(resultado.motivo_nulo).toMatch(/nenhum contrato residencial/i);
  });
});

describe("calcularTaxaOcupacaoPortfolio", () => {
  beforeEach(prepararBanco);

  it("ocupados / aptos, excluindo uso_pessoal e imóvel com obra ativa na data", async () => {
    // Apto e ocupado: contrato vigente na data de referência.
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, uso_pessoal) VALUES (1, 'Kitnet 1', 'kitnet', 0)");
    executar(
      db,
      `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, dia_vencimento, data_inicio, data_fim)
       VALUES (1, 1, 'Inquilino 1', 'residencial_fixo', 1000, 10, '2025-01-01', NULL)`,
    );

    // Apto e vago: sem contrato nenhum.
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, uso_pessoal) VALUES (2, 'Kitnet 2', 'kitnet', 0)");

    // Uso pessoal: nunca entra no denominador.
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, uso_pessoal) VALUES (3, 'Residência', 'apartamento', 1)");

    // Em obra na data de referência: excluído do denominador (não é "vago").
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, uso_pessoal) VALUES (4, 'Kitnet 4', 'kitnet', 0)");
    executar(
      db,
      `INSERT INTO obras (id, imovel_id, descricao, data_inicio, data_fim, natureza)
       VALUES (1, 4, 'Reforma geral', '2026-01-01', '2026-12-31', 'capex')`,
    );

    const resultado = calcularTaxaOcupacaoPortfolio(db, "2026-06-01");

    expect(resultado.imoveis_aptos).toBe(2); // imóveis 1 e 2
    expect(resultado.imoveis_ocupados).toBe(1); // só imóvel 1
    expect(resultado.imoveis_em_obra_excluidos).toBe(1); // imóvel 4
    expect(resultado.imoveis_uso_pessoal_excluidos).toBe(1); // imóvel 3
    expect(resultado.taxa_percentual).toBeCloseTo(50, 2);
    expect(resultado.motivo_nulo).toBeNull();
  });

  it("nenhum imóvel apto (todos uso pessoal): null com motivo, nunca 0 fabricado", async () => {
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, uso_pessoal) VALUES (1, 'Residência', 'apartamento', 1)");

    const resultado = calcularTaxaOcupacaoPortfolio(db, "2026-06-01");

    expect(resultado.imoveis_aptos).toBe(0);
    expect(resultado.taxa_percentual).toBeNull();
    expect(resultado.motivo_nulo).toMatch(/nenhum imóvel apto/i);
  });
});
