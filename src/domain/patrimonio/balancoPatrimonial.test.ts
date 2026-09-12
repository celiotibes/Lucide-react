import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar } from "../../db/connection";
import {
  calcularAlavancagemPorImovel,
  calcularPatrimonioLiquido,
  calcularComprometimentoRenda,
  calcularLiquidezCorrente,
  calcularVPLDivida,
  calcularVPLDoEndividamento,
} from "./balancoPatrimonial";

async function bancoBase() {
  const db = await criarBancoDeTeste();
  executar(db, "INSERT INTO contas_bancarias (id, banco, numero, titular, tipo) VALUES (1, 'Banco Teste', '000-0', 'Célio', 'corrente')");
  return db;
}

describe("calcularAlavancagemPorImovel", () => {
  it("sem valor_venal_atual cadastrado: percentualAlavancagem fica null (nunca estimado)", async () => {
    const db = await bancoBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, regime_patrimonial) VALUES (1, 'Kitnet 1', 'kitnet', 'proprio')");

    const [linha] = calcularAlavancagemPorImovel(db, "2026-06-01");

    expect(linha.valorVenal).toBeNull();
    expect(linha.percentualAlavancagem).toBeNull();
    expect(linha.saldoDevedor).toBe(0);
  });

  it("financiamento 'OUTRO' sem saldo_devedor_manual: sinaliza saldoDevedorIncompleto em vez de contar como zero", async () => {
    const db = await bancoBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, regime_patrimonial, valor_venal_atual) VALUES (1, 'Kitnet 1', 'kitnet', 'proprio', 200000)");
    executar(
      db,
      `INSERT INTO financiamentos (id, imovel_id, instituicao, sistema, valor_contratado, data_contrato, parcelas_total)
       VALUES (1, 1, 'Consórcio XYZ', 'OUTRO', 100000, '2025-01-01', 120)`,
    );

    const [linha] = calcularAlavancagemPorImovel(db, "2026-06-01");

    expect(linha.saldoDevedorIncompleto).toBe(true);
    expect(linha.saldoDevedor).toBe(0); // não conta como zero "de verdade" — é sinalizado, não somado
  });

  it("imóvel em gestão de terceiros nunca entra na alavancagem do usuário", async () => {
    const db = await bancoBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, regime_patrimonial, valor_venal_atual) VALUES (1, 'Avani', 'apartamento', 'gestao_terceiros', 500000)");

    const linhas = calcularAlavancagemPorImovel(db, "2026-06-01");
    expect(linhas).toEqual([]);
  });
});

describe("calcularPatrimonioLiquido", () => {
  it("soma ativo (valor venal) menos passivo de financiamentos e dívidas de consumo", async () => {
    const db = await bancoBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, regime_patrimonial, valor_venal_atual) VALUES (1, 'Kitnet 1', 'kitnet', 'proprio', 300000)");
    executar(
      db,
      `INSERT INTO financiamentos (id, imovel_id, instituicao, sistema, valor_contratado, data_contrato, parcelas_total)
       VALUES (1, 1, 'Consórcio XYZ', 'OUTRO', 100000, '2025-01-01', 120)`,
    );
    executar(db, "UPDATE financiamentos SET saldo_devedor_manual = 60000 WHERE id = 1");
    executar(
      db,
      "INSERT INTO dividas_consumo (id, tipo, instituicao, saldo_devedor_atual, parcela_mensal, data_referencia_saldo) VALUES (1, 'consignado', 'Banco X', 20000, 500, '2026-06-01')",
    );

    const resultado = calcularPatrimonioLiquido(db, "2026-06-01");

    expect(resultado.ativoImobiliario).toBe(300000);
    expect(resultado.passivoFinanciamentos).toBe(60000);
    expect(resultado.passivoConsumo).toBe(20000);
    expect(resultado.patrimonioLiquido).toBe(300000 - 60000 - 20000);
    expect(resultado.imoveisSemValorVenal).toEqual([]);
    expect(resultado.financiamentosSemSaldoDevedor).toEqual([]);
  });

  it("imóvel próprio sem valor venal fica de fora da soma do ativo, mas é listado (nunca some sem aviso)", async () => {
    const db = await bancoBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, regime_patrimonial, valor_venal_atual) VALUES (1, 'Kitnet 1', 'kitnet', 'proprio', 300000)");
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, regime_patrimonial) VALUES (2, 'Kitnet 2', 'kitnet', 'proprio')");

    const resultado = calcularPatrimonioLiquido(db, "2026-06-01");

    expect(resultado.ativoImobiliario).toBe(300000); // só o imóvel 1 entrou na soma
    expect(resultado.imoveisSemValorVenal).toEqual(["Kitnet 2"]);
  });

  it("financiamento 'OUTRO' sem saldo_devedor_manual: passivo não conta o financiamento como zero, mas o lista", async () => {
    const db = await bancoBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, regime_patrimonial, valor_venal_atual) VALUES (1, 'Kitnet 1', 'kitnet', 'proprio', 300000)");
    executar(
      db,
      `INSERT INTO financiamentos (id, imovel_id, instituicao, sistema, valor_contratado, data_contrato, parcelas_total)
       VALUES (1, 1, 'Consórcio XYZ', 'OUTRO', 100000, '2025-01-01', 120)`,
    );

    const resultado = calcularPatrimonioLiquido(db, "2026-06-01");

    expect(resultado.passivoFinanciamentos).toBe(0);
    expect(resultado.financiamentosSemSaldoDevedor).toEqual(["Consórcio XYZ — Kitnet 1"]);
    // Patrimônio líquido não engole silenciosamente essa dívida não informada como zero:
    // ela está fora da conta, sinalizada, em vez de artificialmente inflar o resultado.
    expect(resultado.patrimonioLiquido).toBe(300000);
  });

  it("imóvel em gestão de terceiros não entra no ativo nem no passivo do usuário", async () => {
    const db = await bancoBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, regime_patrimonial, valor_venal_atual) VALUES (1, 'Avani', 'apartamento', 'gestao_terceiros', 900000)");
    executar(
      db,
      `INSERT INTO financiamentos (id, imovel_id, instituicao, sistema, valor_contratado, data_contrato, parcelas_total)
       VALUES (1, 1, 'Banco Y', 'PRICE', 500000, '2020-01-01', 360)`,
    );

    const resultado = calcularPatrimonioLiquido(db, "2026-06-01");

    expect(resultado.ativoImobiliario).toBe(0);
    expect(resultado.passivoFinanciamentos).toBe(0);
    expect(resultado.patrimonioLiquido).toBe(0);
  });
});

describe("calcularComprometimentoRenda", () => {
  it("percentualComprometido é null quando salarioMensal <= 0 (nunca divide por zero silenciosamente)", async () => {
    const db = await bancoBase();
    const resultado = calcularComprometimentoRenda(db, "2026-06-01", 0);
    expect(resultado.percentualComprometido).toBeNull();
  });

  it("soma parcelas de financiamento próprio + dívida de consumo sobre o salário informado", async () => {
    const db = await bancoBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, regime_patrimonial) VALUES (1, 'Kitnet 1', 'kitnet', 'proprio')");
    executar(
      db,
      `INSERT INTO financiamentos (id, imovel_id, instituicao, sistema, valor_contratado, data_contrato, parcelas_total)
       VALUES (1, 1, 'Consórcio XYZ', 'OUTRO', 100000, '2025-01-01', 120)`,
    );
    executar(db, "UPDATE financiamentos SET parcela_mensal_manual = 1000 WHERE id = 1");
    executar(
      db,
      "INSERT INTO dividas_consumo (id, tipo, instituicao, saldo_devedor_atual, parcela_mensal, data_referencia_saldo) VALUES (1, 'cartao_parcelado', 'Banco X', 5000, 500, '2026-06-01')",
    );

    const resultado = calcularComprometimentoRenda(db, "2026-06-01", 3000);

    expect(resultado.parcelasFinanciamentos).toBe(1000);
    expect(resultado.parcelasConsumo).toBe(500);
    expect(resultado.totalParcelas).toBe(1500);
    expect(resultado.percentualComprometido).toBeCloseTo(50, 6);
  });

  it("financiamento de imóvel em gestão de terceiros não entra no comprometimento de renda pessoal", async () => {
    const db = await bancoBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, regime_patrimonial) VALUES (1, 'Avani', 'apartamento', 'gestao_terceiros')");
    executar(
      db,
      `INSERT INTO financiamentos (id, imovel_id, instituicao, sistema, valor_contratado, data_contrato, parcelas_total)
       VALUES (1, 1, 'Banco Y', 'PRICE', 500000, '2020-01-01', 360)`,
    );

    const resultado = calcularComprometimentoRenda(db, "2026-06-01", 3000);
    expect(resultado.parcelasFinanciamentos).toBe(0);
    expect(resultado.percentualComprometido).toBe(0);
  });
});

describe("calcularLiquidezCorrente", () => {
  it("indiceLiquidezCorrente é null quando não há passivo circulante nenhum", async () => {
    const db = await bancoBase();
    const resultado = calcularLiquidezCorrente(db, "2026-06-01");
    expect(resultado.passivoCirculante).toBe(0);
    expect(resultado.indiceLiquidezCorrente).toBeNull();
  });

  it("inclui caução ainda retida (sem data_devolucao) no passivo circulante", async () => {
    const db = await bancoBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo) VALUES (1, 'Kitnet 1', 'kitnet')");
    executar(
      db,
      `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio)
       VALUES (1, 1, 'Locatário', 'residencial_fixo', 1000, '2026-01-01')`,
    );
    executar(
      db,
      "INSERT INTO caucoes (id, contrato_id, valor_inicial, data_deposito, indice_correcao) VALUES (1, 1, 2000, '2026-01-01', 'nenhum')",
    );
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original) VALUES (1, 1, '2026-01-01', 5000, 'saldo inicial')");

    const resultado = calcularLiquidezCorrente(db, "2026-06-01");

    expect(resultado.cauçõesADevolverProximos12Meses).toBe(2000);
    expect(resultado.passivoCirculante).toBe(2000);
    expect(resultado.saldoCaixaAtual).toBe(5000);
    expect(resultado.indiceLiquidezCorrente).toBeCloseTo(5000 / 2000, 6);
  });

  it("caução já devolvida (com data_devolucao) não entra no passivo circulante", async () => {
    const db = await bancoBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo) VALUES (1, 'Kitnet 1', 'kitnet')");
    executar(
      db,
      `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio)
       VALUES (1, 1, 'Locatário', 'residencial_fixo', 1000, '2026-01-01')`,
    );
    executar(
      db,
      "INSERT INTO caucoes (id, contrato_id, valor_inicial, data_deposito, indice_correcao, data_devolucao) VALUES (1, 1, 2000, '2026-01-01', 'nenhum', '2026-05-01')",
    );

    const resultado = calcularLiquidezCorrente(db, "2026-06-01");
    expect(resultado.cauçõesADevolverProximos12Meses).toBe(0);
  });
});

describe("calcularVPLDivida", () => {
  it("valor presente de uma única parcela é a parcela descontada por (1 + taxa)", () => {
    const vpl = calcularVPLDivida([1000], 1); // 1% ao mês
    expect(vpl).toBeCloseTo(1000 / 1.01, 6);
  });

  it("taxa de desconto zero: VPL é a soma nominal das parcelas", () => {
    const vpl = calcularVPLDivida([100, 100, 100], 0);
    expect(vpl).toBeCloseTo(300, 6);
  });

  it("fluxo vazio tem VPL zero", () => {
    expect(calcularVPLDivida([], 1)).toBe(0);
  });
});

describe("calcularVPLDoEndividamento", () => {
  it("financiamento 'OUTRO' sem os dois campos manuais informados fica de fora da lista (nunca projeta VPL sem dado)", async () => {
    const db = await bancoBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, regime_patrimonial) VALUES (1, 'Kitnet 1', 'kitnet', 'proprio')");
    executar(
      db,
      `INSERT INTO financiamentos (id, imovel_id, instituicao, sistema, valor_contratado, data_contrato, parcelas_total)
       VALUES (1, 1, 'Consórcio XYZ', 'OUTRO', 100000, '2025-01-01', 120)`,
    );

    const linhas = calcularVPLDoEndividamento(db, "2026-06-01", 1);
    expect(linhas).toEqual([]);
  });

  it("ordena o demonstrativo por saldo devedor, do maior para o menor", async () => {
    const db = await bancoBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, regime_patrimonial) VALUES (1, 'Kitnet 1', 'kitnet', 'proprio')");
    executar(
      db,
      `INSERT INTO financiamentos (id, imovel_id, instituicao, sistema, valor_contratado, data_contrato, parcelas_total)
       VALUES (1, 1, 'Consórcio Pequeno', 'OUTRO', 10000, '2025-01-01', 120)`,
    );
    executar(db, "UPDATE financiamentos SET saldo_devedor_manual = 5000, parcela_mensal_manual = 500 WHERE id = 1");
    executar(
      db,
      "INSERT INTO dividas_consumo (id, tipo, instituicao, saldo_devedor_atual, parcela_mensal, data_referencia_saldo) VALUES (1, 'consignado', 'Banco Grande', 50000, 1000, '2026-06-01')",
    );

    const linhas = calcularVPLDoEndividamento(db, "2026-06-01", 1);

    expect(linhas).toHaveLength(2);
    expect(linhas[0].descricao).toContain("Banco Grande");
    expect(linhas[0].saldoDevedor).toBe(50000);
    expect(linhas[1].saldoDevedor).toBe(5000);
  });
});
