import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { consultar, executar } from "../../db/connection";
import { criarEntidadeLegal, sincronizarRazao } from "./entidadeLegal";
import { gerarExportacaoECD } from "./ecd-export";

/** Exportação ECD — o arquivo que vai para a Receita.
 *
 * Este módulo estava há tempos sem nenhum teste, e foi exatamente por isso que um defeito
 * grave passou despercebido: `const [contas] = consultar(...)` pegava a PRIMEIRA CONTA e a
 * tratava como se fosse a lista inteira. O `Array.isArray(contas)` logo abaixo dava sempre
 * falso — era um objeto, não um array — e o laço que monta os lançamentos NUNCA rodava.
 * A exportação saía sempre com o cabeçalho e nenhum lançamento, em silêncio, e um arquivo
 * fiscal vazio é pior que erro: parece pronto.
 *
 * É a 14ª ocorrência do mesmo padrão neste repositório (desestruturar array sobre
 * `consultar()` extrai uma linha, não a lista). O teste abaixo existe sobretudo para que a
 * 15ª não volte aqui sem ser vista.
 */

let db: Database;
let entidade_id: number;
let periodo_id: number;

const CPF_TESTE = "52998224725";

beforeEach(async () => {
  db = await criarBancoDeTeste();
  executar(
    db,
    "INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo) VALUES (1, 'Teste', '0001', '12345', 'Titular', 'corrente')",
  );
  const r = criarEntidadeLegal(db, { nome: "Titular de Teste", cpf_cnpj: CPF_TESTE });
  if (!r.entidade_id) throw new Error(`Fixture não criou a entidade: ${r.mensagem}`);
  entidade_id = r.entidade_id;

  // Duas transações em março/2024 → quatro pernas no razão, em duas contas distintas.
  // Duas contas importam: com uma só, o defeito de pegar "a primeira linha" seria
  // indistinguível de pegar a lista inteira.
  for (const [id, data, valor, codigo, descricao] of [
    [1, "2024-03-10", 2500, "1.1.01", "ALUGUEL KITNET 101"],
    [2, "2024-03-15", -430.5, "2.1.01", "CONDOMINIO ED AURORA"],
  ] as const) {
    executar(
      db,
      `INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo)
       VALUES (?, 1, ?, ?, ?, ?)`,
      [id, data, valor, descricao, codigo],
    );
  }
  sincronizarRazao(db, entidade_id);

  periodo_id = consultar<{ id: number }>(
    db,
    "SELECT id FROM periodos_contabeis WHERE entidade_id = ? AND ano = 2024 AND mes = 3",
    [entidade_id],
  )[0].id;
});

describe("exportação ECD", () => {
  it("exporta os lançamentos do período — não só o cabeçalho", () => {
    const ecd = gerarExportacaoECD(db, entidade_id, periodo_id);

    // O defeito produzia exatamente 0 lançamentos com o cabeçalho presente.
    expect(ecd.total_lancamentos).toBeGreaterThan(0);
    const lancamentos = ecd.registros.filter((r) => r.tipo_registro !== "0000" && r.tipo_registro !== "9999");
    expect(lancamentos.length).toBe(ecd.total_lancamentos);
  });

  it("cobre TODAS as contas movimentadas, não apenas a primeira", () => {
    const contasNoRazao = consultar<{ n: number }>(
      db,
      "SELECT COUNT(DISTINCT conta_id) AS n FROM ledger_entries WHERE periodo_id = ?",
      [periodo_id],
    )[0].n;

    // Caixa + receita de aluguel + despesa de condomínio: mais de uma conta, senão o
    // teste não distingue "primeira linha" de "lista inteira".
    expect(contasNoRazao).toBeGreaterThan(1);

    const ecd = gerarExportacaoECD(db, entidade_id, periodo_id);
    const lancamentosDoRazao = consultar<{ n: number }>(
      db,
      "SELECT COUNT(*) AS n FROM ledger_entries WHERE periodo_id = ?",
      [periodo_id],
    )[0].n;
    expect(ecd.total_lancamentos).toBe(lancamentosDoRazao);
  });

  it("débitos e créditos batem, e o relatório declara isso", () => {
    const ecd = gerarExportacaoECD(db, entidade_id, periodo_id);

    expect(ecd.total_debitos).toBeCloseTo(ecd.total_creditos, 2);
    expect(ecd.total_debitos).toBeCloseTo(2930.5, 2);
    expect(ecd.balanceado).toBe(true);
  });

  it("identifica o contribuinte com o CPF/CNPJ gravado, sem máscara", () => {
    const ecd = gerarExportacaoECD(db, entidade_id, periodo_id);

    expect(ecd.nome_contribuinte).toBe("Titular de Teste");
    expect(ecd.cnpj_contribuinte).toBe(CPF_TESTE);
  });

  it("período sem lançamento nenhum não mente: zero, e não um número herdado", () => {
    executar(
      db,
      "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2024, 4, 'aberto')",
      [entidade_id],
    );
    const vazio = consultar<{ id: number }>(
      db,
      "SELECT id FROM periodos_contabeis WHERE entidade_id = ? AND ano = 2024 AND mes = 4",
      [entidade_id],
    )[0].id;

    const ecd = gerarExportacaoECD(db, entidade_id, vazio);
    expect(ecd.total_lancamentos).toBe(0);
    expect(ecd.total_debitos).toBe(0);
    expect(ecd.total_creditos).toBe(0);
  });
});
