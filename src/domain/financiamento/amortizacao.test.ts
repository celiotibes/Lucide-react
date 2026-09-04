import { describe, expect, it } from "vitest";
import { executar } from "../../db/connection";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { compararComTransacoes, type Financiamento } from "./amortizacao";

describe("compararComTransacoes — anatocismo exige divergência absoluta mínima, não só percentual", () => {
  it("não sinaliza divergência trivial (poucos reais) mesmo que percentualmente grande perto do fim do SAC", async () => {
    const db = await criarBancoDeTeste();
    executar(db, "INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo, ativa_desde) VALUES (1, 'Banco', '1', '1', 'T', 'corrente', '2020-01-01')");
    executar(db, "INSERT INTO imoveis (id, apelido, tipo) VALUES (1, 'Apto', 'apartamento')");

    const financiamento: Financiamento = {
      id: 1,
      imovel_id: 1,
      instituicao: "Banco",
      sistema: "SAC",
      valor_contratado: 300000,
      taxa_juros_mensal: 0.8,
      data_contrato: "2020-01-01",
      parcelas_total: 240,
      saldo_devedor_manual: null,
      parcela_mensal_manual: null,
      data_referencia_saldo_manual: null,
    };

    // Parcela 239 (penúltima) — juro teórico já é pequeno (saldo devedor quase zerado).
    // Lança R$3 a mais que o teórico: divergência pode passar de 5%, mas é trivial em R$.
    executar(
      db,
      `INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id)
       VALUES (1, 1, '2039-11-05', -3, 'juros financiamento pequeno demais para importar', '2.1.05', 1)`,
    );

    const divergencias = compararComTransacoes(db, financiamento);
    const parcelaFinal = divergencias.find((d) => d.mes === "2039-11");
    expect(parcelaFinal).toBeDefined();
    expect(parcelaFinal!.possivelAnatocismo).toBe(false);
  });

  it("ainda sinaliza divergência real (percentual E absoluta relevantes)", async () => {
    const db = await criarBancoDeTeste();
    executar(db, "INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo, ativa_desde) VALUES (1, 'Banco', '1', '1', 'T', 'corrente', '2020-01-01')");
    executar(db, "INSERT INTO imoveis (id, apelido, tipo) VALUES (1, 'Apto', 'apartamento')");

    const financiamento: Financiamento = {
      id: 1,
      imovel_id: 1,
      instituicao: "Banco",
      sistema: "SAC",
      valor_contratado: 300000,
      taxa_juros_mensal: 0.8,
      data_contrato: "2020-01-01",
      parcelas_total: 240,
      saldo_devedor_manual: null,
      parcela_mensal_manual: null,
      data_referencia_saldo_manual: null,
    };

    // Primeira parcela: juro teórico é alto (saldo devedor cheio de R$300.000 a 0,8%/mês =
    // R$2.400) — lançar o dobro é uma divergência real, absoluta e percentualmente.
    executar(
      db,
      `INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id)
       VALUES (1, 1, '2020-02-05', -4800, 'juros financiamento em dobro', '2.1.05', 1)`,
    );

    const divergencias = compararComTransacoes(db, financiamento);
    const primeiraParcela = divergencias.find((d) => d.mes === "2020-02");
    expect(primeiraParcela).toBeDefined();
    expect(primeiraParcela!.possivelAnatocismo).toBe(true);
  });
});
