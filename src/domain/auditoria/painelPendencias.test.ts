import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar } from "../../db/connection";
import { gerarPainelPendencias } from "./painelPendencias";

async function bancoComContaBase() {
  const db = await criarBancoDeTeste();
  executar(db, "INSERT INTO contas_bancarias (id, banco, numero, titular, tipo) VALUES (1, 'Banco Teste', '000-0', 'Célio', 'corrente')");
  return db;
}

const HOJE = "2026-06-15";

describe("gerarPainelPendencias", () => {
  it("banco totalmente vazio (sem nenhuma transação) não gera nenhuma pendência", async () => {
    const db = await criarBancoDeTeste();

    expect(gerarPainelPendencias(db, HOJE)).toEqual([]);
  });

  it("transação sem plano_conta_codigo gera a pendência 'transacoes-sem-categoria'", async () => {
    const db = await bancoComContaBase();
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original) VALUES (1, 1, '2026-06-01', -100, 'PIX SEM CATEGORIA')");

    const itens = gerarPainelPendencias(db, HOJE);
    const item = itens.find((i) => i.id === "transacoes-sem-categoria");

    expect(item).toBeDefined();
    expect(item?.titulo).toContain("1 transação");
    expect(item?.severidade).toBe("atencao");
    expect(item?.aba).toBe("transacoes");
  });

  it("transação já categorizada não entra em 'transacoes-sem-categoria'", async () => {
    const db = await bancoComContaBase();
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, 1, '2026-06-01', -100, 'ALUGUEL RECEBIDO', '1.1.01')",
    );

    const itens = gerarPainelPendencias(db, HOJE);

    expect(itens.find((i) => i.id === "transacoes-sem-categoria")).toBeUndefined();
  });

  it("lançamentos duplicados geram a pendência 'transacoes-duplicadas'", async () => {
    const db = await bancoComContaBase();
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original) VALUES (1, 1, '2026-06-01', -540, 'PIX PORTARIA')");
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original) VALUES (2, 1, '2026-06-01', -540, 'PIX PORTARIA')");

    const itens = gerarPainelPendencias(db, HOJE);
    const item = itens.find((i) => i.id === "transacoes-duplicadas");

    expect(item).toBeDefined();
    expect(item?.titulo).toContain("1 possível");
    expect(item?.aba).toBe("auditoria");
  });

  it("nenhum backup exportado ainda gera 'backup-nunca-feito' sempre que há transações (localStorage indisponível em ambiente node)", async () => {
    const db = await bancoComContaBase();
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, 1, '2026-06-01', 100, 'ALUGUEL', '1.1.01')");

    const itens = gerarPainelPendencias(db, HOJE);
    const item = itens.find((i) => i.id === "backup-nunca-feito");

    expect(item).toBeDefined();
    expect(item?.severidade).toBe("atencao");
    expect(item?.aba).toBeNull();
  });

  it("imóvel próprio com co-titular sem percentual confirmado gera 'copropriedade-percentual-pendente'", async () => {
    const db = await bancoComContaBase();
    executar(
      db,
      "INSERT INTO imoveis (id, apelido, tipo, regime_patrimonial, co_titular_nome) VALUES (1, 'Casa da Praia', 'outro', 'proprio', 'Maria Teste')",
    );
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, 1, '2026-06-01', 100, 'ALUGUEL', '1.1.01')");

    const itens = gerarPainelPendencias(db, HOJE);
    const item = itens.find((i) => i.id === "copropriedade-percentual-pendente");

    expect(item).toBeDefined();
    expect(item?.titulo).toContain("1 imóvel");
    expect(item?.descricao).toContain("Casa da Praia");
    expect(item?.descricao).toContain("Maria Teste");
    expect(item?.aba).toBe("imoveis");
  });

  it("imóvel 'gestao_terceiros' com co_titular_nome não entra em 'copropriedade-percentual-pendente' (a condição exige regime 'proprio')", async () => {
    const db = await bancoComContaBase();
    executar(
      db,
      "INSERT INTO imoveis (id, apelido, tipo, regime_patrimonial, co_titular_nome, proprietario_nome) VALUES (1, 'Avani', 'apartamento', 'gestao_terceiros', 'Outro Nome', 'Terceiro')",
    );
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, 1, '2026-06-01', 100, 'ALUGUEL', '1.1.01')");

    const itens = gerarPainelPendencias(db, HOJE);

    expect(itens.find((i) => i.id === "copropriedade-percentual-pendente")).toBeUndefined();
  });

  it("financiamento 'OUTRO' sem parcela mensal manual gera 'financiamentos-outro-sem-parcela'", async () => {
    const db = await bancoComContaBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo) VALUES (1, 'Kitnet A', 'kitnet')");
    executar(
      db,
      "INSERT INTO financiamentos (id, imovel_id, instituicao, sistema, valor_contratado, data_contrato, parcelas_total) VALUES (1, 1, 'Banco XYZ', 'OUTRO', 50000, '2024-01-01', 120)",
    );
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, 1, '2026-06-01', 100, 'ALUGUEL', '1.1.01')");

    const itens = gerarPainelPendencias(db, HOJE);
    const item = itens.find((i) => i.id === "financiamentos-outro-sem-parcela");

    expect(item).toBeDefined();
    expect(item?.severidade).toBe("critica");
    expect(item?.descricao).toContain("Banco XYZ");
    expect(item?.descricao).toContain("Kitnet A");
  });

  it("financiamento 'OUTRO' com parcela mensal manual informada não gera a pendência", async () => {
    const db = await bancoComContaBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo) VALUES (1, 'Kitnet A', 'kitnet')");
    executar(
      db,
      "INSERT INTO financiamentos (id, imovel_id, instituicao, sistema, valor_contratado, data_contrato, parcelas_total, parcela_mensal_manual) VALUES (1, 1, 'Banco XYZ', 'OUTRO', 50000, '2024-01-01', 120, 450)",
    );
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, 1, '2026-06-01', 100, 'ALUGUEL', '1.1.01')");

    const itens = gerarPainelPendencias(db, HOJE);

    expect(itens.find((i) => i.id === "financiamentos-outro-sem-parcela")).toBeUndefined();
  });

  it("dívida de consumo sem nenhum rateio de destino cadastrado gera 'dividas-rateio-destino-incompleto'", async () => {
    const db = await bancoComContaBase();
    executar(
      db,
      "INSERT INTO dividas_consumo (id, tipo, instituicao, saldo_devedor_atual, parcela_mensal, data_referencia_saldo) VALUES (1, 'consignado', 'Banco ABC', 10000, 300, '2026-06-01')",
    );
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, 1, '2026-06-01', 100, 'ALUGUEL', '1.1.01')");

    const itens = gerarPainelPendencias(db, HOJE);
    const item = itens.find((i) => i.id === "dividas-rateio-destino-incompleto");

    expect(item).toBeDefined();
    expect(item?.descricao).toContain("0% classificado");
    expect(item?.aba).toBe("cadastros");
  });

  it("ordena os itens por severidade: 'critica' sempre antes de 'atencao'", async () => {
    const db = await bancoComContaBase();
    // Gera 'financiamentos-outro-sem-parcela' (crítica) e 'transacoes-sem-categoria' (atenção)
    // no mesmo banco, nessa ordem de inserção propositalmente invertida.
    executar(db, "INSERT INTO imoveis (id, apelido, tipo) VALUES (1, 'Kitnet A', 'kitnet')");
    executar(
      db,
      "INSERT INTO financiamentos (id, imovel_id, instituicao, sistema, valor_contratado, data_contrato, parcelas_total) VALUES (1, 1, 'Banco XYZ', 'OUTRO', 50000, '2024-01-01', 120)",
    );
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original) VALUES (1, 1, '2026-06-01', -100, 'SEM CATEGORIA')");

    const itens = gerarPainelPendencias(db, HOJE);
    const indiceCritica = itens.findIndex((i) => i.id === "financiamentos-outro-sem-parcela");
    const indiceAtencao = itens.findIndex((i) => i.id === "transacoes-sem-categoria");

    expect(indiceCritica).toBeGreaterThanOrEqual(0);
    expect(indiceAtencao).toBeGreaterThanOrEqual(0);
    expect(indiceCritica).toBeLessThan(indiceAtencao);
    for (let i = 1; i < itens.length; i++) {
      const ordem: Record<string, number> = { critica: 0, atencao: 1, info: 2 };
      expect(ordem[itens[i - 1].severidade]).toBeLessThanOrEqual(ordem[itens[i].severidade]);
    }
  });
});
