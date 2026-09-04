import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar } from "../../db/connection";
import { detectarCaucoesSemTransacao, detectarDuplicatas, testeBenford } from "./auditoriaForense";

async function bancoComContaBase() {
  const db = await criarBancoDeTeste();
  executar(db, "INSERT INTO contas_bancarias (id, banco, numero, titular, tipo) VALUES (1, 'Banco Teste', '000-0', 'Célio', 'corrente')");
  return db;
}

describe("detectarDuplicatas", () => {
  it("agrupa lançamentos com mesma conta, data, valor e descrição, listando os IDs envolvidos", async () => {
    const db = await bancoComContaBase();
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original) VALUES (1, 1, '2026-04-06', -540, 'PIX PORTARIA')");
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original) VALUES (2, 1, '2026-04-06', -540, 'PIX PORTARIA')");
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original) VALUES (3, 1, '2026-04-07', -300, 'OUTRO PIX')");

    const duplicatas = detectarDuplicatas(db);

    expect(duplicatas).toHaveLength(1);
    expect(duplicatas[0].ocorrencias).toBe(2);
    expect(duplicatas[0].transacaoIds.sort()).toEqual([1, 2]);
  });

  it("não sinaliza lançamentos únicos, mesmo com valores parecidos", async () => {
    const db = await bancoComContaBase();
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original) VALUES (1, 1, '2026-04-06', -540, 'PIX PORTARIA')");
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original) VALUES (2, 1, '2026-04-07', -540, 'PIX PORTARIA')");

    expect(detectarDuplicatas(db)).toHaveLength(0);
  });
});

describe("detectarCaucoesSemTransacao", () => {
  async function bancoComContrato(db: Awaited<ReturnType<typeof criarBancoDeTeste>>) {
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, financiado) VALUES (1, 'Kitnet A', 'kitnet', 0)");
    executar(
      db,
      "INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio) VALUES (1, 1, 'Fulano', 'residencial_fixo', 1000, '2026-01-01')",
    );
  }

  it("sinaliza caução cadastrada sem nenhum depósito (código 9.0.02) correspondente no extrato", async () => {
    const db = await bancoComContaBase();
    await bancoComContrato(db);
    executar(
      db,
      "INSERT INTO caucoes (id, contrato_id, valor_inicial, data_deposito, indice_correcao) VALUES (1, 1, 2000, '2026-02-01', 'ipca')",
    );

    const achados = detectarCaucoesSemTransacao(db);

    expect(achados).toHaveLength(1);
    expect(achados[0]).toMatchObject({ caucaoId: 1, imovelId: 1, valorInicial: 2000, dataDeposito: "2026-02-01" });
  });

  it("não sinaliza quando existe uma transação código 9.0.02 dentro de ±30 dias da data de depósito", async () => {
    const db = await bancoComContaBase();
    await bancoComContrato(db);
    executar(
      db,
      "INSERT INTO caucoes (id, contrato_id, valor_inicial, data_deposito, indice_correcao) VALUES (1, 1, 2000, '2026-02-01', 'ipca')",
    );
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (1, 1, '2026-02-05', 2000, 'DEPOSITO CAUCAO', '9.0.02', 1)",
    );

    expect(detectarCaucoesSemTransacao(db)).toHaveLength(0);
  });

  it("ainda sinaliza quando a transação código 9.0.02 existe, mas fora da janela de ±30 dias", async () => {
    const db = await bancoComContaBase();
    await bancoComContrato(db);
    executar(
      db,
      "INSERT INTO caucoes (id, contrato_id, valor_inicial, data_deposito, indice_correcao) VALUES (1, 1, 2000, '2026-02-01', 'ipca')",
    );
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (1, 1, '2026-06-01', 2000, 'DEPOSITO CAUCAO TARDIO', '9.0.02', 1)",
    );

    expect(detectarCaucoesSemTransacao(db)).toHaveLength(1);
  });
});

describe("testeBenford", () => {
  it("frequência esperada de cada dígito segue log10(1 + 1/d)", () => {
    const resultado = testeBenford([100, 200, 300, 400, 500, 600, 700, 800, 900, 111]);
    const digito1 = resultado.find((r) => r.digito === 1)!;
    expect(digito1.frequenciaEsperada).toBeCloseTo(Math.log10(2), 6);
  });

  it("ignora valores com módulo menor que 1 e retorna array vazio sem nenhum valor válido", () => {
    expect(testeBenford([0.5, 0.1, 0])).toEqual([]);
    expect(testeBenford([])).toEqual([]);
  });

  it("frequência observada soma 1 entre os 9 dígitos", () => {
    const resultado = testeBenford([123, 456, 789, 111, 222, 333]);
    const soma = resultado.reduce((acc, r) => acc + r.frequenciaObservada, 0);
    expect(soma).toBeCloseTo(1, 6);
  });
});
