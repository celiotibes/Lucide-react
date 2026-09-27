import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { consultar, executar } from "../../db/connection";
import {
  aplicarDeducaoNaCaucao,
  calcularValorDepreciadoLinear,
  contestarRadAvaliacao,
  emitirRadAvaliacao,
  gerarRadAvaliacao,
  obterRadAvaliacaoAtual,
  rejeitarItemRad,
  supersederRadAvaliacao,
} from "./radAvaliacao";

function anosEntre(inicio: string, fim: string): number {
  const ms = new Date(fim + "T00:00:00").getTime() - new Date(inicio + "T00:00:00").getTime();
  return ms / (365.25 * 24 * 60 * 60 * 1000);
}

// Mesma taxa reaproveitada em radAvaliacao.ts (ver comentário lá sobre por que é uma
// constante repetida, e não importada de integracao-patrimonio.ts).
const TAXA_DEPRECIACAO_ANUAL_PADRAO = 0.05;

async function bancoComContratoEImovel() {
  const db = await criarBancoDeTeste();
  executar(db, "INSERT INTO imoveis (id, apelido, tipo) VALUES (1, 'Kitnet 1', 'kitnet')");
  executar(
    db,
    `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio)
     VALUES (1, 1, 'Locatário Teste', 'residencial_fixo', 1000, '2020-01-01')`,
  );
  return db;
}

describe("calcularValorDepreciadoLinear", () => {
  it("deprecia linearmente reaproveitando a mesma taxa de integracao-patrimonio.ts (TAXA_DEPRECIACAO_ANUAL_PADRAO)", () => {
    const anos = anosEntre("2020-01-01", "2026-01-01");
    const esperado = 1000 * (1 - TAXA_DEPRECIACAO_ANUAL_PADRAO * anos);

    expect(calcularValorDepreciadoLinear(1000, "2020-01-01", "2026-01-01")).toBeCloseTo(esperado, 6);
    // Sanity: ~6 anos a 5% a.a. deixa o item em torno de 70% do valor original.
    expect(esperado).toBeGreaterThan(650);
    expect(esperado).toBeLessThan(750);
  });

  it("nunca fica negativo, mesmo com data de vistoria muito antiga", () => {
    expect(calcularValorDepreciadoLinear(500, "1990-01-01", "2026-01-01")).toBe(0);
  });

  it("sem data_vistoria conhecida, não deprecia (não presume o que não foi registrado)", () => {
    expect(calcularValorDepreciadoLinear(500, null, "2026-01-01")).toBe(500);
    expect(calcularValorDepreciadoLinear(500, undefined, "2026-01-01")).toBe(500);
  });
});

describe("gerarRadAvaliacao", () => {
  it("gera a partir do inventário real do imóvel, depreciando até a data da vistoria de saída", async () => {
    const db = await bancoComContratoEImovel();
    executar(
      db,
      "INSERT INTO imovel_inventario_bens (id, imovel_id, descricao, valor_reposicao, data_vistoria) VALUES (1, 1, 'Ar-condicionado split', 1000, '2020-01-01')",
    );
    executar(
      db,
      "INSERT INTO vistorias (id, imovel_id, contrato_id, data_realizada, status) VALUES (1, 1, 1, '2026-01-01', 'concluida')",
    );

    const { radAvaliacaoId, valorTotal } = gerarRadAvaliacao(db, { contratoId: 1, vistoriaSaidaId: 1 });

    const esperado = calcularValorDepreciadoLinear(1000, "2020-01-01", "2026-01-01");
    expect(valorTotal).toBeCloseTo(esperado, 6);

    const [avaliacao] = consultar<{ versao: number; status: string; contrato_id: number }>(
      db,
      "SELECT versao, status, contrato_id FROM rad_avaliacoes WHERE id = ?",
      [radAvaliacaoId],
    );
    expect(avaliacao.versao).toBe(1);
    expect(avaliacao.status).toBe("rascunho");
    expect(avaliacao.contrato_id).toBe(1);

    const itens = consultar<{ descricao: string; valor_referencia: number; valor_depreciado: number; aceito: number }>(
      db,
      "SELECT descricao, valor_referencia, valor_depreciado, aceito FROM rad_avaliacao_itens WHERE rad_avaliacao_id = ?",
      [radAvaliacaoId],
    );
    expect(itens).toHaveLength(1);
    expect(itens[0].descricao).toBe("Ar-condicionado split");
    expect(itens[0].valor_referencia).toBe(1000);
    expect(itens[0].valor_depreciado).toBeCloseTo(esperado, 6);
    expect(itens[0].aceito).toBe(1);
  });

  it("item com vistoria muito antiga entra com valor depreciado zerado, nunca negativo", async () => {
    const db = await bancoComContratoEImovel();
    executar(
      db,
      "INSERT INTO imovel_inventario_bens (id, imovel_id, descricao, valor_reposicao, data_vistoria) VALUES (1, 1, 'Sofá', 500, '1990-01-01')",
    );
    executar(db, "INSERT INTO vistorias (id, imovel_id, contrato_id, data_realizada, status) VALUES (1, 1, 1, '2026-01-01', 'concluida')");

    const { valorTotal } = gerarRadAvaliacao(db, { contratoId: 1, vistoriaSaidaId: 1 });

    expect(valorTotal).toBe(0);
  });

  it("versiona: cada nova geração para o mesmo contrato incrementa a versão", async () => {
    const db = await bancoComContratoEImovel();
    executar(
      db,
      "INSERT INTO imovel_inventario_bens (id, imovel_id, descricao, valor_reposicao, data_vistoria) VALUES (1, 1, 'Fogão', 800, '2024-01-01')",
    );

    const primeira = gerarRadAvaliacao(db, { contratoId: 1 });
    const segunda = gerarRadAvaliacao(db, { contratoId: 1 });

    const [v1] = consultar<{ versao: number }>(db, "SELECT versao FROM rad_avaliacoes WHERE id = ?", [primeira.radAvaliacaoId]);
    const [v2] = consultar<{ versao: number }>(db, "SELECT versao FROM rad_avaliacoes WHERE id = ?", [segunda.radAvaliacaoId]);
    expect(v1.versao).toBe(1);
    expect(v2.versao).toBe(2);
  });

  it("lança erro claro para contrato inexistente", async () => {
    const db = await bancoComContratoEImovel();
    expect(() => gerarRadAvaliacao(db, { contratoId: 999 })).toThrow(/999/);
  });
});

describe("rejeitarItemRad", () => {
  it("exige motivo não vazio", async () => {
    const db = await bancoComContratoEImovel();
    executar(
      db,
      "INSERT INTO imovel_inventario_bens (id, imovel_id, descricao, valor_reposicao, data_vistoria) VALUES (1, 1, 'Micro-ondas', 400, '2024-01-01')",
    );
    const { radAvaliacaoId } = gerarRadAvaliacao(db, { contratoId: 1 });
    const [item] = consultar<{ id: number }>(db, "SELECT id FROM rad_avaliacao_itens WHERE rad_avaliacao_id = ?", [radAvaliacaoId]);

    expect(() => rejeitarItemRad(db, item.id, "")).toThrow(/motivo/i);
    expect(() => rejeitarItemRad(db, item.id, "   ")).toThrow(/motivo/i);
  });

  it("com motivo válido, marca aceito=0 e grava o motivo", async () => {
    const db = await bancoComContratoEImovel();
    executar(
      db,
      "INSERT INTO imovel_inventario_bens (id, imovel_id, descricao, valor_reposicao, data_vistoria) VALUES (1, 1, 'Micro-ondas', 400, '2024-01-01')",
    );
    const { radAvaliacaoId } = gerarRadAvaliacao(db, { contratoId: 1 });
    const [item] = consultar<{ id: number }>(db, "SELECT id FROM rad_avaliacao_itens WHERE rad_avaliacao_id = ?", [radAvaliacaoId]);

    rejeitarItemRad(db, item.id, "Item já estava danificado na entrada do locatário");

    const [atualizado] = consultar<{ aceito: number; motivo: string }>(
      db,
      "SELECT aceito, motivo FROM rad_avaliacao_itens WHERE id = ?",
      [item.id],
    );
    expect(atualizado.aceito).toBe(0);
    expect(atualizado.motivo).toBe("Item já estava danificado na entrada do locatário");
  });

  it("não permite rejeitar item de avaliação já emitida", async () => {
    const db = await bancoComContratoEImovel();
    executar(
      db,
      "INSERT INTO imovel_inventario_bens (id, imovel_id, descricao, valor_reposicao, data_vistoria) VALUES (1, 1, 'Micro-ondas', 400, '2024-01-01')",
    );
    const { radAvaliacaoId } = gerarRadAvaliacao(db, { contratoId: 1 });
    const [item] = consultar<{ id: number }>(db, "SELECT id FROM rad_avaliacao_itens WHERE rad_avaliacao_id = ?", [radAvaliacaoId]);
    emitirRadAvaliacao(db, radAvaliacaoId);

    expect(() => rejeitarItemRad(db, item.id, "Motivo qualquer")).toThrow(/rascunho/i);
  });
});

describe("emitirRadAvaliacao", () => {
  it("trava o valor total considerando itens rejeitados antes da emissão", async () => {
    const db = await bancoComContratoEImovel();
    executar(
      db,
      "INSERT INTO imovel_inventario_bens (id, imovel_id, descricao, valor_reposicao, data_vistoria) VALUES (1, 1, 'Item A', 500, '2024-01-01')",
    );
    executar(
      db,
      "INSERT INTO imovel_inventario_bens (id, imovel_id, descricao, valor_reposicao, data_vistoria) VALUES (2, 1, 'Item B', 300, '2024-01-01')",
    );
    const { radAvaliacaoId } = gerarRadAvaliacao(db, { contratoId: 1 });

    const itens = consultar<{ id: number; descricao: string; valor_depreciado: number }>(
      db,
      "SELECT id, descricao, valor_depreciado FROM rad_avaliacao_itens WHERE rad_avaliacao_id = ? ORDER BY id",
      [radAvaliacaoId],
    );
    const itemB = itens.find((i) => i.descricao === "Item B")!;
    rejeitarItemRad(db, itemB.id, "Desgaste natural, não é dano imputável ao locatário");

    const total = emitirRadAvaliacao(db, radAvaliacaoId);

    const itemA = itens.find((i) => i.descricao === "Item A")!;
    expect(total).toBeCloseTo(itemA.valor_depreciado, 6);

    const [avaliacao] = consultar<{ status: string; valor_total_deducao: number; emitido_em: string | null }>(
      db,
      "SELECT status, valor_total_deducao, emitido_em FROM rad_avaliacoes WHERE id = ?",
      [radAvaliacaoId],
    );
    expect(avaliacao.status).toBe("emitido");
    expect(avaliacao.valor_total_deducao).toBeCloseTo(itemA.valor_depreciado, 6);
    expect(avaliacao.emitido_em).not.toBeNull();
  });

  it("não permite emitir a mesma avaliação duas vezes", async () => {
    const db = await bancoComContratoEImovel();
    executar(
      db,
      "INSERT INTO imovel_inventario_bens (id, imovel_id, descricao, valor_reposicao, data_vistoria) VALUES (1, 1, 'Item A', 500, '2024-01-01')",
    );
    const { radAvaliacaoId } = gerarRadAvaliacao(db, { contratoId: 1 });
    emitirRadAvaliacao(db, radAvaliacaoId);

    expect(() => emitirRadAvaliacao(db, radAvaliacaoId)).toThrow(/rascunho/i);
  });
});

describe("supersederRadAvaliacao", () => {
  it("não permite superar uma avaliação em rascunho (deve ser editada/regerada diretamente)", async () => {
    const db = await bancoComContratoEImovel();
    executar(
      db,
      "INSERT INTO imovel_inventario_bens (id, imovel_id, descricao, valor_reposicao, data_vistoria) VALUES (1, 1, 'Item A', 500, '2024-01-01')",
    );
    const { radAvaliacaoId } = gerarRadAvaliacao(db, { contratoId: 1 });

    expect(() => supersederRadAvaliacao(db, radAvaliacaoId, 1)).toThrow(/rascunho/i);
  });

  it("supera uma avaliação emitida com uma nova versão, marcando a antiga como 'superado'", async () => {
    const db = await bancoComContratoEImovel();
    executar(
      db,
      "INSERT INTO imovel_inventario_bens (id, imovel_id, descricao, valor_reposicao, data_vistoria) VALUES (1, 1, 'Item A', 500, '2024-01-01')",
    );
    const { radAvaliacaoId: idAntiga } = gerarRadAvaliacao(db, { contratoId: 1 });
    emitirRadAvaliacao(db, idAntiga);

    const { radAvaliacaoId: idNova } = supersederRadAvaliacao(db, idAntiga, 1);

    const [antiga] = consultar<{ status: string; superado_por_id: number }>(
      db,
      "SELECT status, superado_por_id FROM rad_avaliacoes WHERE id = ?",
      [idAntiga],
    );
    expect(antiga.status).toBe("superado");
    expect(antiga.superado_por_id).toBe(idNova);

    const [nova] = consultar<{ versao: number; status: string }>(db, "SELECT versao, status FROM rad_avaliacoes WHERE id = ?", [idNova]);
    expect(nova.versao).toBe(2);
    expect(nova.status).toBe("rascunho");
  });
});

describe("obterRadAvaliacaoAtual", () => {
  it("ignora versões 'superado' e retorna a de maior versão vigente, com seus itens", async () => {
    const db = await bancoComContratoEImovel();
    executar(
      db,
      "INSERT INTO imovel_inventario_bens (id, imovel_id, descricao, valor_reposicao, data_vistoria) VALUES (1, 1, 'Item A', 500, '2024-01-01')",
    );
    const { radAvaliacaoId: idV1 } = gerarRadAvaliacao(db, { contratoId: 1 });
    emitirRadAvaliacao(db, idV1);
    const { radAvaliacaoId: idV2 } = supersederRadAvaliacao(db, idV1, 1);

    const atual = obterRadAvaliacaoAtual(db, 1);

    expect(atual).not.toBeNull();
    expect(atual!.id).toBe(idV2);
    expect(atual!.versao).toBe(2);
    expect(atual!.status).toBe("rascunho");
    expect(atual!.itens).toHaveLength(1);
  });

  it("retorna null quando o contrato não tem nenhuma avaliação", async () => {
    const db = await bancoComContratoEImovel();
    expect(obterRadAvaliacaoAtual(db, 1)).toBeNull();
  });
});

describe("contestarRadAvaliacao", () => {
  it("muda o status para 'contestado' apenas a partir de 'emitido'", async () => {
    const db = await bancoComContratoEImovel();
    executar(
      db,
      "INSERT INTO imovel_inventario_bens (id, imovel_id, descricao, valor_reposicao, data_vistoria) VALUES (1, 1, 'Item A', 500, '2024-01-01')",
    );
    const { radAvaliacaoId } = gerarRadAvaliacao(db, { contratoId: 1 });

    expect(() => contestarRadAvaliacao(db, radAvaliacaoId, "Discordo do valor")).toThrow(/emitido/i);

    emitirRadAvaliacao(db, radAvaliacaoId);
    contestarRadAvaliacao(db, radAvaliacaoId, "Discordo do valor apurado");

    const [avaliacao] = consultar<{ status: string }>(db, "SELECT status FROM rad_avaliacoes WHERE id = ?", [radAvaliacaoId]);
    expect(avaliacao.status).toBe("contestado");
  });

  it("exige motivo não vazio", async () => {
    const db = await bancoComContratoEImovel();
    executar(
      db,
      "INSERT INTO imovel_inventario_bens (id, imovel_id, descricao, valor_reposicao, data_vistoria) VALUES (1, 1, 'Item A', 500, '2024-01-01')",
    );
    const { radAvaliacaoId } = gerarRadAvaliacao(db, { contratoId: 1 });
    emitirRadAvaliacao(db, radAvaliacaoId);

    expect(() => contestarRadAvaliacao(db, radAvaliacaoId, "")).toThrow(/motivo/i);
  });
});

describe("aplicarDeducaoNaCaucao", () => {
  it("só permite aplicar dedução de avaliação emitida", async () => {
    const db = await bancoComContratoEImovel();
    executar(
      db,
      "INSERT INTO caucoes (id, contrato_id, valor_inicial, data_deposito, indice_correcao) VALUES (1, 1, 1000, '2020-01-01', 'nenhum')",
    );
    executar(
      db,
      "INSERT INTO imovel_inventario_bens (id, imovel_id, descricao, valor_reposicao, data_vistoria) VALUES (1, 1, 'Item A', 500, '2024-01-01')",
    );
    const { radAvaliacaoId } = gerarRadAvaliacao(db, { contratoId: 1 });

    expect(() => aplicarDeducaoNaCaucao(db, radAvaliacaoId, 1)).toThrow(/emitido/i);
  });

  it("soma ao valor já existente na caução, sem sobrescrever cegamente", async () => {
    const db = await bancoComContratoEImovel();
    executar(
      db,
      "INSERT INTO caucoes (id, contrato_id, valor_inicial, data_deposito, indice_correcao, deducoes_valor, deducoes_descricao) VALUES (1, 1, 1000, '2020-01-01', 'nenhum', 150, 'Dedução anterior — pintura')",
    );
    executar(
      db,
      "INSERT INTO imovel_inventario_bens (id, imovel_id, descricao, valor_reposicao, data_vistoria) VALUES (1, 1, 'Item A', 500, '2024-01-01')",
    );
    const { radAvaliacaoId } = gerarRadAvaliacao(db, { contratoId: 1 });
    const total = emitirRadAvaliacao(db, radAvaliacaoId);

    const resultado = aplicarDeducaoNaCaucao(db, radAvaliacaoId, 1);

    expect(resultado.deducoesValor).toBeCloseTo(150 + total, 6);
    expect(resultado.deducoesDescricao).toContain("Dedução anterior — pintura");
    expect(resultado.deducoesDescricao).toContain("RAD v1");

    const [caucao] = consultar<{ deducoes_valor: number; deducoes_descricao: string }>(
      db,
      "SELECT deducoes_valor, deducoes_descricao FROM caucoes WHERE id = ?",
      [1],
    );
    expect(caucao.deducoes_valor).toBeCloseTo(150 + total, 6);
    expect(caucao.deducoes_descricao).toBe(resultado.deducoesDescricao);
  });

  it("aplicar duas vezes (ex: RAD superado depois reemitido) soma as duas deduções, não substitui", async () => {
    const db = await bancoComContratoEImovel();
    executar(
      db,
      "INSERT INTO caucoes (id, contrato_id, valor_inicial, data_deposito, indice_correcao) VALUES (1, 1, 1000, '2020-01-01', 'nenhum')",
    );
    executar(
      db,
      "INSERT INTO imovel_inventario_bens (id, imovel_id, descricao, valor_reposicao, data_vistoria) VALUES (1, 1, 'Item A', 500, '2024-01-01')",
    );
    const { radAvaliacaoId: idV1 } = gerarRadAvaliacao(db, { contratoId: 1 });
    const totalV1 = emitirRadAvaliacao(db, idV1);
    aplicarDeducaoNaCaucao(db, idV1, 1);

    const { radAvaliacaoId: idV2 } = supersederRadAvaliacao(db, idV1, 1);
    const totalV2 = emitirRadAvaliacao(db, idV2);
    const resultado = aplicarDeducaoNaCaucao(db, idV2, 1);

    expect(resultado.deducoesValor).toBeCloseTo(totalV1 + totalV2, 6);
  });
});
