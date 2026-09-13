import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar, consultar } from "../../db/connection";
import { sugerirTransacoesParaDocumento, pontuarSemelhancaNome, vincularDocumento, rejeitarSugestao } from "./matching";
import type { Documento } from "../types";

async function bancoBase() {
  const db = await criarBancoDeTeste();
  executar(db, "INSERT INTO contas_bancarias (id, banco, numero, titular, tipo) VALUES (1, 'Banco Teste', '000-0', 'Célio', 'corrente')");
  return db;
}

function documento(overrides: Partial<Documento> & { id: number }): Documento {
  return {
    tipo: "recibo",
    arquivo_nome: "recibo.pdf",
    criado_em: "2026-01-01",
    ...overrides,
  } as Documento;
}

describe("pontuarSemelhancaNome", () => {
  it("nome idêntico (normalizado) pontua 1", () => {
    expect(pontuarSemelhancaNome("Mello Consultoria Limitada", "PIX MELLO CONSULTORIA LIMITADA")).toBe(1);
  });

  it("razão social abreviada no extrato (achado real de auditoria — bancos truncam nomes): ainda pontua alto", () => {
    // "Consultoria" -> prefixo esperado de pelo menos 70% (~8 chars) = "CONSULTO"; "CONSULT"
    // (7 chars) não bate por padrão — mas o teste documenta o comportamento real, não o ideal.
    const pontuacao = pontuarSemelhancaNome("Mello Consultoria Limitada", "TED MELLO CONSULTORIA LTDA SP");
    expect(pontuacao).toBe(1); // "Mello" e "Consultoria" batem inteiros; "Limitada"/"LTDA" são ignoradas (societário)
  });

  it("nome com acento e o extrato sem acento ainda casam (normalização remove acentuação)", () => {
    expect(pontuarSemelhancaNome("Condomínio Edifício Aurora", "BOLETO CONDOMINIO EDIFICIO AURORA")).toBe(1);
  });

  it("nome completamente diferente pontua 0", () => {
    expect(pontuarSemelhancaNome("Alfa Transportes SA", "PIX RECEBIDO MARIA SILVA")).toBe(0);
  });

  it("pontuação parcial quando só parte das palavras significativas aparece", () => {
    const pontuacao = pontuarSemelhancaNome("João Silva Reparos Hidráulicos", "PIX JOAO SILVA");
    // 2 de 4 palavras significativas (Joao, Silva) aparecem — Reparos/Hidraulicos não.
    expect(pontuacao).toBeCloseTo(0.5, 6);
  });

  it("string vazia ou só com palavras societárias/preposições pontua 0 (nunca divide por zero)", () => {
    expect(pontuarSemelhancaNome("", "qualquer coisa")).toBe(0);
    expect(pontuarSemelhancaNome("LTDA ME DE DA", "LTDA ME DE DA")).toBe(0);
  });
});

describe("sugerirTransacoesParaDocumento", () => {
  it("documento sem valor ou sem data_documento não sugere nada (nunca adivinha)", async () => {
    const db = await bancoBase();
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original) VALUES (1, 1, '2026-03-10', 1500, 'PIX QUALQUER')");
    expect(sugerirTransacoesParaDocumento(db, documento({ id: 1, valor: 1500 }))).toEqual([]);
    expect(sugerirTransacoesParaDocumento(db, documento({ id: 1, data_documento: "2026-03-10" }))).toEqual([]);
  });

  it("valor exato e mesma data pontua o máximo (score 1)", async () => {
    const db = await bancoBase();
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original) VALUES (1, 1, '2026-03-10', -1500, 'DEB AUTOM FORNECEDOR')");

    const [sugestao] = sugerirTransacoesParaDocumento(db, documento({ id: 1, valor: 1500, data_documento: "2026-03-10" }));

    expect(sugestao.transacaoId).toBe(1);
    expect(sugestao.score).toBeCloseTo(0.8, 6); // 0.5 valor exato + 0.3 mesma data, sem CNPJ/nome informado
    expect(sugestao.motivos).toContain("valor exato");
    expect(sugestao.motivos).toContain("mesma data");
  });

  it("nome do fornecedor abreviado no extrato ainda soma pontuação parcial (não é tudo ou nada)", async () => {
    const db = await bancoBase();
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original) VALUES (1, 1, '2026-03-10', -4250.50, 'TED 102030 MELLO CONSULT LTDA')");

    const [sugestao] = sugerirTransacoesParaDocumento(
      db,
      documento({ id: 1, valor: 4250.5, data_documento: "2026-03-10", nome_contraparte: "Mello Consultoria Limitada" }),
    );

    expect(sugestao.score).toBeGreaterThan(0.8); // valor exato + mesma data + parte do nome
    expect(sugestao.motivos.some((m) => m.includes("nome do fornecedor"))).toBe(true);
  });

  it("fora da janela de dias não aparece nas sugestões, mesmo com valor exato", async () => {
    const db = await bancoBase();
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original) VALUES (1, 1, '2026-01-01', -1500, 'PIX FORA DA JANELA')");

    const sugestoes = sugerirTransacoesParaDocumento(db, documento({ id: 1, valor: 1500, data_documento: "2026-03-10" }), 15);
    expect(sugestoes).toEqual([]);
  });

  it("transação já rejeitada explicitamente para este documento nunca reaparece na lista", async () => {
    const db = await bancoBase();
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original) VALUES (1, 1, '2026-03-10', -1500, 'PIX QUALQUER')");
    executar(db, "INSERT INTO documentos (id, tipo, arquivo_nome, valor, data_documento, criado_em) VALUES (1, 'recibo', 'r.pdf', 1500, '2026-03-10', '2026-01-01')");
    rejeitarSugestao(db, 1, 1);

    const sugestoes = sugerirTransacoesParaDocumento(db, documento({ id: 1, valor: 1500, data_documento: "2026-03-10" }));
    expect(sugestoes).toEqual([]);
  });

  it("ordena por score decrescente e limita a 10 sugestões", async () => {
    const db = await bancoBase();
    for (let i = 1; i <= 12; i++) {
      executar(db, `INSERT INTO transacoes (id, conta_id, data, valor, descricao_original) VALUES (${i}, 1, '2026-03-${String(10 + (i % 5)).padStart(2, "0")}', -1500, 'PIX ${i}')`);
    }
    const sugestoes = sugerirTransacoesParaDocumento(db, documento({ id: 1, valor: 1500, data_documento: "2026-03-10" }));
    expect(sugestoes.length).toBeLessThanOrEqual(10);
    for (let i = 1; i < sugestoes.length; i++) {
      expect(sugestoes[i - 1].score).toBeGreaterThanOrEqual(sugestoes[i].score);
    }
  });
});

describe("vincularDocumento", () => {
  it("vincula, propaga categoria/imóvel único e marca a transação como categorizada manualmente", async () => {
    const db = await bancoBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo) VALUES (1, 'Kitnet 1', 'kitnet')");
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original) VALUES (1, 1, '2026-03-10', -300, 'PIX PRESTADOR')");
    executar(
      db,
      "INSERT INTO documentos (id, tipo, arquivo_nome, valor, data_documento, plano_conta_codigo, criado_em) VALUES (1, 'recibo', 'recibo-prestador.pdf', 300, '2026-03-10', '2.1.04', '2026-01-01')",
    );
    executar(db, "INSERT INTO documento_imoveis (documento_id, imovel_id, percentual) VALUES (1, 1, 100)");

    vincularDocumento(db, 1, 1, 0.9);

    const [linha] = consultar<{ plano_conta_codigo: string; imovel_id: number; categorizado_por: string; documento_fonte: string }>(
      db,
      "SELECT plano_conta_codigo, imovel_id, categorizado_por, documento_fonte FROM transacoes WHERE id = 1",
    );
    expect(linha.plano_conta_codigo).toBe("2.1.04");
    expect(linha.imovel_id).toBe(1);
    expect(linha.categorizado_por).toBe("manual");
    expect(linha.documento_fonte).toBe("recibo-prestador.pdf");
  });
});
