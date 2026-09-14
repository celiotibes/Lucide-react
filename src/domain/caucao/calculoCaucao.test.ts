import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar } from "../../db/connection";
import { calcularCaucao } from "./calculoCaucao";

async function bancoComContratoBase() {
  const db = await criarBancoDeTeste();
  executar(db, "INSERT INTO contas_bancarias (id, banco, numero, titular, tipo) VALUES (1, 'Banco Teste', '000-0', 'Célio', 'corrente')");
  executar(db, "INSERT INTO imoveis (id, apelido, tipo) VALUES (1, 'Kitnet 1', 'kitnet')");
  executar(
    db,
    `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio)
     VALUES (1, 1, 'Locatário Teste', 'residencial_fixo', 1000, '2026-01-01')`,
  );
  return db;
}

describe("calcularCaucao", () => {
  it("índice 'nenhum': saldo corrigido é o valor inicial, sem nenhuma composição mensal", async () => {
    const db = await bancoComContratoBase();
    executar(
      db,
      "INSERT INTO caucoes (id, contrato_id, valor_inicial, data_deposito, indice_correcao) VALUES (1, 1, 1000, '2026-01-01', 'nenhum')",
    );

    const resultado = calcularCaucao(db, 1, "2026-06-01");

    expect(resultado.saldoCorrigido).toBe(1000);
    expect(resultado.valorADevolver).toBe(1000);
    expect(resultado.mesesSemIndiceDisponivel).toEqual([]);
  });

  it("índice 'nenhum' com dedução registrada: valorADevolver desconta a dedução, saldoCorrigido não", async () => {
    const db = await bancoComContratoBase();
    executar(
      db,
      "INSERT INTO caucoes (id, contrato_id, valor_inicial, data_deposito, indice_correcao, deducoes_valor) VALUES (1, 1, 1000, '2026-01-01', 'nenhum', 150)",
    );

    const resultado = calcularCaucao(db, 1, "2026-06-01");

    expect(resultado.saldoCorrigido).toBe(1000);
    expect(resultado.valorADevolver).toBe(850);
  });

  it("compõe mês a mês pela série cadastrada em indices_economicos", async () => {
    const db = await bancoComContratoBase();
    executar(
      db,
      "INSERT INTO caucoes (id, contrato_id, valor_inicial, data_deposito, indice_correcao) VALUES (1, 1, 1000, '2026-01-15', 'igpm')",
    );
    executar(db, "INSERT INTO indices_economicos (indice, mes_referencia, taxa_mensal) VALUES ('igpm', '2026-01-01', 1.0)");
    executar(db, "INSERT INTO indices_economicos (indice, mes_referencia, taxa_mensal) VALUES ('igpm', '2026-02-01', 2.0)");

    // Referência em 2026-03-01: compõe os meses de referência 2026-01 e 2026-02 (o laço para
    // antes do mês da própria data final) — 1000 * 1.01 * 1.02.
    const resultado = calcularCaucao(db, 1, "2026-03-01");

    expect(resultado.saldoCorrigido).toBeCloseTo(1000 * 1.01 * 1.02, 6);
    expect(resultado.mesesSemIndiceDisponivel).toEqual([]);
  });

  it("mês sem taxa cadastrada NUNCA é inventado — fica de fora da composição e é listado", async () => {
    const db = await bancoComContratoBase();
    executar(
      db,
      "INSERT INTO caucoes (id, contrato_id, valor_inicial, data_deposito, indice_correcao) VALUES (1, 1, 1000, '2026-01-01', 'ipca')",
    );
    // Só janeiro tem taxa cadastrada — fevereiro fica sem.
    executar(db, "INSERT INTO indices_economicos (indice, mes_referencia, taxa_mensal) VALUES ('ipca', '2026-01-01', 0.5)");

    const resultado = calcularCaucao(db, 1, "2026-03-01");

    // Só o mês com taxa foi composto — fevereiro (sem taxa) não multiplicou o saldo por nada.
    expect(resultado.saldoCorrigido).toBeCloseTo(1000 * 1.005, 6);
    expect(resultado.mesesSemIndiceDisponivel).toEqual(["2026-02"]);
  });

  it("usa data_devolucao como data final quando a caução já foi devolvida, ignorando a data de referência", async () => {
    const db = await bancoComContratoBase();
    executar(
      db,
      "INSERT INTO caucoes (id, contrato_id, valor_inicial, data_deposito, indice_correcao, data_devolucao) VALUES (1, 1, 1000, '2026-01-01', 'igpm', '2026-02-01')",
    );
    executar(db, "INSERT INTO indices_economicos (indice, mes_referencia, taxa_mensal) VALUES ('igpm', '2026-01-01', 1.0)");
    // Taxa de meses posteriores à devolução não deveria nunca ser composta, mesmo estando cadastrada.
    executar(db, "INSERT INTO indices_economicos (indice, mes_referencia, taxa_mensal) VALUES ('igpm', '2026-06-01', 5.0)");

    // dataReferencia bem no futuro — não deve importar, pois a caução já foi devolvida em 2026-02-01.
    const resultado = calcularCaucao(db, 1, "2026-12-01");

    expect(resultado.saldoCorrigido).toBeCloseTo(1000 * 1.01, 6);
  });

  it("lança erro claro para caução inexistente, em vez de devolver um resultado vazio/zerado", async () => {
    const db = await bancoComContratoBase();
    expect(() => calcularCaucao(db, 999, "2026-06-01")).toThrow(/999/);
  });
});
