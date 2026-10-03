import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar } from "../../db/connection";
import {
  registrarRateioDestino,
  atualizarRateioDestino,
  removerRateioDestino,
  listarRateioDestinos,
  percentualTotalClassificado,
  obterDividasComRateioIncompleto,
  aplicarRateio,
} from "./rateioDividas";

async function criarDividaConsumo(db: Awaited<ReturnType<typeof criarBancoDeTeste>>, instituicao = "Banco X"): Promise<number> {
  executar(
    db,
    "INSERT INTO dividas_consumo (tipo, instituicao, saldo_devedor_atual, parcela_mensal, data_referencia_saldo) VALUES ('consignado', ?, 10000, 500, '2026-01-01')",
    [instituicao],
  );
  return db.exec("SELECT last_insert_rowid() as id")[0].values[0][0] as number;
}

async function criarImovel(db: Awaited<ReturnType<typeof criarBancoDeTeste>>): Promise<number> {
  executar(db, "INSERT INTO imoveis (apelido, tipo, financiado) VALUES ('Kitnet 1', 'kitnet', 1)");
  return db.exec("SELECT last_insert_rowid() as id")[0].values[0][0] as number;
}

async function criarFinanciamento(db: Awaited<ReturnType<typeof criarBancoDeTeste>>): Promise<number> {
  const imovelId = await criarImovel(db);
  executar(
    db,
    "INSERT INTO financiamentos (imovel_id, instituicao, sistema, valor_contratado, data_contrato, parcelas_total) VALUES (?, 'Caixa', 'SAC', 300000, '2020-01-01', 360)",
    [imovelId],
  );
  return db.exec("SELECT last_insert_rowid() as id")[0].values[0][0] as number;
}

describe("rateioDividas", () => {
  it("registrarRateioDestino cobre 100% em uma única linha", async () => {
    const db = await criarBancoDeTeste();
    const dividaId = await criarDividaConsumo(db);

    const linha = registrarRateioDestino(db, { dividaTipo: "divida_consumo", dividaId, destino: "Pessoal", percentual: 100 });
    expect(linha.destino).toBe("Pessoal");
    expect(linha.percentual).toBe(100);
    expect(percentualTotalClassificado(db, "divida_consumo", dividaId)).toBe(100);

    const linhas = listarRateioDestinos(db, "divida_consumo", dividaId);
    expect(linhas).toHaveLength(1);
  });

  it("registrarRateioDestino em múltiplas linhas somando exatamente 100%", async () => {
    const db = await criarBancoDeTeste();
    const dividaId = await criarDividaConsumo(db);

    registrarRateioDestino(db, { dividaTipo: "divida_consumo", dividaId, destino: "Empresa (imóveis de locação/Airbnb)", percentual: 60 });
    registrarRateioDestino(db, { dividaTipo: "divida_consumo", dividaId, destino: "Pessoal", percentual: 20 });
    registrarRateioDestino(db, { dividaTipo: "divida_consumo", dividaId, destino: "Advocacia", percentual: 20, observacoes: "uso do escritório" });

    expect(percentualTotalClassificado(db, "divida_consumo", dividaId)).toBe(100);
    const linhas = listarRateioDestinos(db, "divida_consumo", dividaId);
    expect(linhas).toHaveLength(3);
    expect(linhas.find((l) => l.destino === "Advocacia")?.observacoes).toBe("uso do escritório");
  });

  it("rejeita soma > 100% na criação", async () => {
    const db = await criarBancoDeTeste();
    const dividaId = await criarDividaConsumo(db);

    registrarRateioDestino(db, { dividaTipo: "divida_consumo", dividaId, destino: "Pessoal", percentual: 70 });
    expect(() => registrarRateioDestino(db, { dividaTipo: "divida_consumo", dividaId, destino: "Advocacia", percentual: 40 })).toThrow(
      /Soma dos percentuais ficaria em 110%/,
    );
    // a linha rejeitada não deve ter sido inserida
    expect(percentualTotalClassificado(db, "divida_consumo", dividaId)).toBe(70);
  });

  it("rejeita soma > 100% na atualização (excluindo a própria linha do cálculo antigo)", async () => {
    const db = await criarBancoDeTeste();
    const dividaId = await criarDividaConsumo(db);

    const linha1 = registrarRateioDestino(db, { dividaTipo: "divida_consumo", dividaId, destino: "Pessoal", percentual: 50 });
    registrarRateioDestino(db, { dividaTipo: "divida_consumo", dividaId, destino: "Advocacia", percentual: 30 });

    // atualizar linha1 para 50 (mesmo valor) deve funcionar (não pode contar a si mesma duas vezes)
    const atualizada = atualizarRateioDestino(db, linha1.id, { percentual: 50 });
    expect(atualizada.percentual).toBe(50);

    // atualizar linha1 para 80 estouraria 80 + 30 = 110%
    expect(() => atualizarRateioDestino(db, linha1.id, { percentual: 80 })).toThrow(/Soma dos percentuais ficaria em 110%/);

    // mas atualizar para 70 (70 + 30 = 100) deve passar
    const ajustada = atualizarRateioDestino(db, linha1.id, { percentual: 70, destino: "Pessoal (ajustado)" });
    expect(ajustada.percentual).toBe(70);
    expect(ajustada.destino).toBe("Pessoal (ajustado)");
    expect(percentualTotalClassificado(db, "divida_consumo", dividaId)).toBe(100);
  });

  it("removerRateioDestino remove a linha e libera espaço na soma", async () => {
    const db = await criarBancoDeTeste();
    const dividaId = await criarDividaConsumo(db);
    const linha = registrarRateioDestino(db, { dividaTipo: "divida_consumo", dividaId, destino: "Pessoal", percentual: 100 });

    removerRateioDestino(db, linha.id);
    expect(listarRateioDestinos(db, "divida_consumo", dividaId)).toHaveLength(0);
    expect(percentualTotalClassificado(db, "divida_consumo", dividaId)).toBe(0);

    expect(() => removerRateioDestino(db, linha.id)).toThrow(/não encontrada/);
  });

  it("aplicarRateio distribui valor com resíduo de arredondamento ajustado na última linha", () => {
    const rateios = [
      { destino: "A", percentual: 33.33 },
      { destino: "B", percentual: 33.33 },
      { destino: "C", percentual: 33.34 },
    ];
    const resultado = aplicarRateio(100, rateios);
    expect(resultado).toHaveLength(3);
    const soma = resultado.reduce((acc, r) => acc + r.valor, 0);
    expect(Math.round(soma * 100) / 100).toBe(100);
    // A e B levam a fatia "limpa" (33.33), C absorve o resíduo de arredondamento
    expect(resultado[0].valor).toBe(33.33);
    expect(resultado[1].valor).toBe(33.33);
    expect(resultado[2].valor).toBeCloseTo(33.34, 2);
  });

  it("aplicarRateio com valor vazio de rateios retorna array vazio", () => {
    expect(aplicarRateio(100, [])).toEqual([]);
  });

  it("aplicarRateio com percentuais parciais (< 100%) soma só a fração coberta, não o valor inteiro", () => {
    const resultado = aplicarRateio(250.5, [{ destino: "X", percentual: 10 }, { destino: "Y", percentual: 15 }]);
    const soma = resultado[0].valor + resultado[1].valor;
    expect(Math.round(soma * 100) / 100).toBeCloseTo(62.63, 2); // 25% de 250,50
  });

  it("obterDividasComRateioIncompleto detecta dívida sem nenhum rateio e dívida com rateio parcial", async () => {
    const db = await criarBancoDeTeste();
    const semRateio = await criarDividaConsumo(db, "Banco Sem Rateio");
    const parcial = await criarDividaConsumo(db, "Banco Parcial");
    const completa = await criarDividaConsumo(db, "Banco Completo");
    const financiamentoId = await criarFinanciamento(db);

    registrarRateioDestino(db, { dividaTipo: "divida_consumo", dividaId: parcial, destino: "Pessoal", percentual: 40 });
    registrarRateioDestino(db, { dividaTipo: "divida_consumo", dividaId: completa, destino: "Pessoal", percentual: 100 });

    const pendencias = obterDividasComRateioIncompleto(db);
    const ids = pendencias.map((p) => `${p.dividaTipo}:${p.dividaId}`);

    expect(ids).toContain(`divida_consumo:${semRateio}`);
    expect(ids).toContain(`divida_consumo:${parcial}`);
    expect(ids).toContain(`financiamento:${financiamentoId}`);
    expect(ids).not.toContain(`divida_consumo:${completa}`);

    const itemSemRateio = pendencias.find((p) => p.dividaId === semRateio && p.dividaTipo === "divida_consumo");
    expect(itemSemRateio?.percentualClassificado).toBe(0);
    expect(itemSemRateio?.percentualFaltante).toBe(100);

    const itemParcial = pendencias.find((p) => p.dividaId === parcial && p.dividaTipo === "divida_consumo");
    expect(itemParcial?.percentualClassificado).toBe(40);
    expect(itemParcial?.percentualFaltante).toBe(60);
  });
});
