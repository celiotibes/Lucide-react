import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar, consultar } from "../../db/connection";
import { sugerirAjusteRateio, aplicarAjusteRateio } from "./ajusteAnual";
import type { ContratoLocacao } from "../types";

async function bancoComContratoBase() {
  const db = await criarBancoDeTeste();
  executar(db, "INSERT INTO contas_bancarias (id, banco, numero, titular, tipo) VALUES (1, 'Banco Teste', '000-0', 'Célio', 'corrente')");
  executar(db, "INSERT INTO imoveis (id, apelido, tipo, financiado) VALUES (1, 'Kitnet 02', 'kitnet', 0)");
  executar(
    db,
    `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio, percentual_aluguel_efetivo)
     VALUES (1, 1, 'Locatário Teste', 'residencial_fixo', 1000, '2026-01-01', 60)`,
  );
  const [contrato] = consultar<ContratoLocacao>(db, "SELECT * FROM contratos_locacao WHERE id = 1");
  return { db, contrato };
}

/** Lança 2 meses de aluguel (financia a arrecadação do rateio via percentual_aluguel_efetivo)
 * e 2 meses de despesa de custeio coletivo — os mesmos números usados em todos os testes
 * abaixo, para que os percentuais sugeridos sejam fáceis de conferir à mão:
 * arrecadado = 1000*0.4 + 1000*0.4 = 800; despendido = 300 + 300 = 600; saldo = +200 (superávit). */
function lancarCicloBase(db: Awaited<ReturnType<typeof criarBancoDeTeste>>) {
  executar(db, "INSERT INTO transacoes (id, conta_id, contrato_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, 1, 1, '2026-01-05', 1000, 'ALUGUEL JAN', '1.1.01')");
  executar(db, "INSERT INTO transacoes (id, conta_id, contrato_id, data, valor, descricao_original, plano_conta_codigo) VALUES (2, 1, 1, '2026-02-05', 1000, 'ALUGUEL FEV', '1.1.01')");
  executar(db, "INSERT INTO transacoes (id, conta_id, imovel_id, data, valor, descricao_original, plano_conta_codigo) VALUES (3, 1, 1, '2026-01-10', -300, 'CONDOMINIO JAN', '2.1.01')");
  executar(db, "INSERT INTO transacoes (id, conta_id, imovel_id, data, valor, descricao_original, plano_conta_codigo) VALUES (4, 1, 1, '2026-02-10', -300, 'MANUTENCAO FEV', '2.1.02')");
}

describe("sugerirAjusteRateio", () => {
  it("contrato sem transações no período (DSS existe, mas zerado): sugere 0% de rateio, nunca divide por zero", async () => {
    const { db, contrato } = await bancoComContratoBase();

    const sugestao = sugerirAjusteRateio(db, contrato, "2026-01-01", "2026-03-01");

    expect(sugestao).not.toBeNull();
    expect(sugestao!.despesaMediaMensal).toBe(0);
    expect(sugestao!.saldoAcumulado).toBe(0);
    expect(sugestao!.percentualRateioSugerido).toBe(0);
  });

  it("contrato inexistente no banco: gerarDss não acha o contrato e a sugestão vem null", async () => {
    const { db } = await bancoComContratoBase();
    const contratoFantasma = { id: 999 } as ContratoLocacao;

    expect(sugerirAjusteRateio(db, contratoFantasma, "2026-01-01", "2026-03-01")).toBeNull();
  });

  it("superávit: reduz a arrecadação necessária e o percentual de rateio sugerido cai proporcionalmente", async () => {
    const { db, contrato } = await bancoComContratoBase();
    lancarCicloBase(db);

    // arrecadado 800, despendido 600, saldo +200 (superávit) ao longo de 2 meses;
    // amortizado em 12 meses => saldoPorMes ≈ 16.667; despesaMedia = 300;
    // arrecadacaoNecessaria ≈ 283.333; valorVigente = 1000 (sem reajuste) => 28.333%.
    const sugestao = sugerirAjusteRateio(db, contrato, "2026-01-01", "2026-03-01");

    expect(sugestao).not.toBeNull();
    expect(sugestao!.percentualAluguelEfetivoAtual).toBe(60);
    expect(sugestao!.percentualRateioAtual).toBe(40);
    expect(sugestao!.despesaMediaMensal).toBeCloseTo(300, 6);
    expect(sugestao!.saldoAcumulado).toBeCloseTo(200, 6);
    expect(sugestao!.valorMensalVigente).toBe(1000);
    expect(sugestao!.percentualRateioSugerido).toBeCloseTo((300 - 200 / 12) / 1000 * 100, 6);
    expect(sugestao!.percentualAluguelEfetivoSugerido).toBeCloseTo(100 - sugestao!.percentualRateioSugerido, 6);
  });

  it("déficit: AUMENTA a arrecadação necessária e o percentual de rateio sugerido, nunca reduz", async () => {
    const { db, contrato } = await bancoComContratoBase();
    // Mesma arrecadação (800), mas despesa maior que o arrecadado: déficit de 400.
    executar(db, "INSERT INTO transacoes (id, conta_id, contrato_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, 1, 1, '2026-01-05', 1000, 'ALUGUEL JAN', '1.1.01')");
    executar(db, "INSERT INTO transacoes (id, conta_id, contrato_id, data, valor, descricao_original, plano_conta_codigo) VALUES (2, 1, 1, '2026-02-05', 1000, 'ALUGUEL FEV', '1.1.01')");
    executar(db, "INSERT INTO transacoes (id, conta_id, imovel_id, data, valor, descricao_original, plano_conta_codigo) VALUES (3, 1, 1, '2026-01-10', -600, 'CONDOMINIO JAN', '2.1.01')");
    executar(db, "INSERT INTO transacoes (id, conta_id, imovel_id, data, valor, descricao_original, plano_conta_codigo) VALUES (4, 1, 1, '2026-02-10', -600, 'MANUTENCAO FEV', '2.1.02')");

    const sugestao = sugerirAjusteRateio(db, contrato, "2026-01-01", "2026-03-01");

    expect(sugestao!.saldoAcumulado).toBeCloseTo(-400, 6);
    // despesaMedia 600, déficit de 400/12 ≈ 33.33 por mês precisa ser recuperado por cima da despesa.
    expect(sugestao!.percentualRateioSugerido).toBeGreaterThan(60); // mais que a despesa média isolada (60%)
  });

  it("mesesAmortizacao menor concentra a absorção do saldo em menos meses (percentual sugerido mais sensível)", async () => {
    const { db, contrato } = await bancoComContratoBase();
    lancarCicloBase(db);

    const amortizando12 = sugerirAjusteRateio(db, contrato, "2026-01-01", "2026-03-01", 12);
    const amortizando1 = sugerirAjusteRateio(db, contrato, "2026-01-01", "2026-03-01", 1);

    // Superávit de 200 absorvido em 1 mês reduz mais a arrecadação necessária do próximo ciclo
    // do que absorvido em 12 meses — percentual sugerido menor com amortização mais curta.
    expect(amortizando1!.percentualRateioSugerido).toBeLessThan(amortizando12!.percentualRateioSugerido);
  });

  it("nunca sugere percentual de rateio acima de 100%, mesmo com despesa muito maior que o valor vigente", async () => {
    const { db, contrato } = await bancoComContratoBase();
    executar(db, "INSERT INTO transacoes (id, conta_id, contrato_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, 1, 1, '2026-01-05', 100, 'ALUGUEL JAN', '1.1.01')");
    executar(db, "INSERT INTO transacoes (id, conta_id, imovel_id, data, valor, descricao_original, plano_conta_codigo) VALUES (2, 1, 1, '2026-01-10', -5000, 'CONDOMINIO JAN', '2.1.01')");

    const sugestao = sugerirAjusteRateio(db, contrato, "2026-01-01", "2026-02-01");

    expect(sugestao!.percentualRateioSugerido).toBe(100);
    expect(sugestao!.percentualAluguelEfetivoSugerido).toBe(0);
  });
});

describe("aplicarAjusteRateio", () => {
  it("grava o novo percentual_aluguel_efetivo no contrato — decisão do usuário, nunca automática", async () => {
    const { db } = await bancoComContratoBase();

    aplicarAjusteRateio(db, 1, 72.5);

    const [contrato] = consultar<{ percentual_aluguel_efetivo: number }>(
      db,
      "SELECT percentual_aluguel_efetivo FROM contratos_locacao WHERE id = 1",
    );
    expect(contrato.percentual_aluguel_efetivo).toBe(72.5);
  });
});
