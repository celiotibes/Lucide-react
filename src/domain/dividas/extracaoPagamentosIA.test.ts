import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar, consultar } from "../../db/connection";
import { reiniciarRodizioIA } from "../ia/roteador";
import { registroProveniencia } from "../ia/proveniencia";
import type { ConfiguracaoIA } from "../ia/config";
import { CONFIGURACAO_PADRAO } from "../ia/config";
import type { DefinicaoProvedorIA } from "../ia/tipos";
import {
  vincularDocumentoADivida,
  extrairPagamentosDeDocumento,
  confirmarPagamentoExtraido,
  rejeitarPagamentoExtraido,
  registrarPagamentoManual,
  listarPagamentosPendentesConfirmacao,
  listarPagamentosConfirmados,
} from "./extracaoPagamentosIA";

// Mesmo mecanismo de injeção de provedor falso usado em ia/roteador.test.ts — nenhuma API
// real é chamada, e nenhum `fetch` global precisa ser mockado.
function provedorFalso(chamar: DefinicaoProvedorIA["chamar"]): DefinicaoProvedorIA {
  return { id: "anthropic", nome: "anthropic", local: false, modeloPadrao: "modelo-teste", chamar };
}

function configComAnthropic(): ConfiguracaoIA {
  return {
    ...structuredClone(CONFIGURACAO_PADRAO),
    ordemRodizio: ["anthropic"],
    provedores: {
      anthropic: { ativo: true, modelo: "modelo-teste", apiKey: "chave-teste" },
      openai: { ativo: false, modelo: "x" },
      google: { ativo: false, modelo: "x" },
      ollama: { ativo: false, modelo: "x" },
    },
  };
}

function opcoesComResposta(texto: string) {
  return {
    roteador: {
      config: configComAnthropic(),
      provedores: { anthropic: provedorFalso(vi.fn().mockResolvedValue({ texto })) },
    },
  };
}

async function criarDocumento(db: Database, textoExtraido: string | null = "texto qualquer com R$ 100,00"): Promise<number> {
  executar(
    db,
    "INSERT INTO documentos (tipo, arquivo_nome, texto_extraido, criado_em) VALUES ('contrato', 'contrato.pdf', ?, ?)",
    [textoExtraido, "2026-09-29"],
  );
  return consultar<{ id: number }>(db, "SELECT last_insert_rowid() as id")[0].id;
}

async function criarDividaConsumo(db: Database): Promise<number> {
  executar(
    db,
    "INSERT INTO dividas_consumo (tipo, instituicao, saldo_devedor_atual, parcela_mensal, data_referencia_saldo) VALUES ('consignado', 'Banco X', 10000, 500, '2026-09-01')",
  );
  return consultar<{ id: number }>(db, "SELECT last_insert_rowid() as id")[0].id;
}

let db: Database;

beforeEach(async () => {
  db = await criarBancoDeTeste();
  reiniciarRodizioIA();
  registroProveniencia.limpar();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("vincularDocumentoADivida", () => {
  it("insere o vínculo em documento_dividas", async () => {
    const documentoId = await criarDocumento(db);
    const dividaId = await criarDividaConsumo(db);

    vincularDocumentoADivida(db, documentoId, "divida_consumo", dividaId);

    const linhas = consultar<{ documento_id: number; divida_tipo: string; divida_id: number }>(
      db,
      "SELECT documento_id, divida_tipo, divida_id FROM documento_dividas",
    );
    expect(linhas).toEqual([{ documento_id: documentoId, divida_tipo: "divida_consumo", divida_id: dividaId }]);
  });

  it("lança erro claro se o documento não existir", () => {
    expect(() => vincularDocumentoADivida(db, 999, "divida_consumo", 1)).toThrow(/999.*não encontrado/i);
  });
});

describe("extrairPagamentosDeDocumento", () => {
  it("insere pagamentos pendentes de confirmação a partir da resposta da IA", async () => {
    const documentoId = await criarDocumento(db, "Extrato de pagamentos:\n01/02/2026 - R$ 500,00\n01/03/2026 - R$ 500,00");
    const dividaId = await criarDividaConsumo(db);
    vincularDocumentoADivida(db, documentoId, "divida_consumo", dividaId);

    const respostaIA = JSON.stringify({
      pagamentos: [
        { data: "2026-02-01", valorPago: 500, valorJuros: 80, valorAmortizacao: 420 },
        { data: "2026-03-01", valorPago: 500, valorJuros: null, valorAmortizacao: null },
      ],
    });

    const ids = await extrairPagamentosDeDocumento(db, documentoId, opcoesComResposta(respostaIA));

    expect(ids).toHaveLength(2);
    const linhas = listarPagamentosPendentesConfirmacao(db, "divida_consumo", dividaId);
    expect(linhas).toHaveLength(2);
    expect(linhas.every((l) => l.confirmado_por_usuario === 0)).toBe(true);
    expect(linhas.every((l) => l.origem === "extraido_ia")).toBe(true);
    expect(linhas.every((l) => l.documento_id === documentoId)).toBe(true);
    const comJuros = linhas.find((l) => l.data_pagamento === "2026-02-01");
    expect(comJuros).toMatchObject({ valor_pago: 500, valor_juros: 80, valor_amortizacao: 420 });
    const semJuros = linhas.find((l) => l.data_pagamento === "2026-03-01");
    expect(semJuros).toMatchObject({ valor_pago: 500, valor_juros: null, valor_amortizacao: null });
  });

  it("registra a proveniência da chamada e a vincula ao documento", async () => {
    const documentoId = await criarDocumento(db, "Extrato com R$ 100,00 em 01/01/2026");
    const dividaId = await criarDividaConsumo(db);
    vincularDocumentoADivida(db, documentoId, "divida_consumo", dividaId);

    await extrairPagamentosDeDocumento(
      db,
      documentoId,
      opcoesComResposta(JSON.stringify({ pagamentos: [{ data: "2026-01-01", valorPago: 100 }] })),
    );

    const chamadas = consultar<{ documento_id: number | null; provedor: string; sucesso: number }>(
      db,
      "SELECT documento_id, provedor, sucesso FROM ia_chamadas",
    );
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]).toMatchObject({ documento_id: documentoId, provedor: "anthropic", sucesso: 1 });
  });

  it("lança erro se o documento não tiver texto extraído, sem chamar a IA", async () => {
    const documentoId = await criarDocumento(db, null);
    const dividaId = await criarDividaConsumo(db);
    vincularDocumentoADivida(db, documentoId, "divida_consumo", dividaId);

    const chamarIA = vi.fn();
    await expect(
      extrairPagamentosDeDocumento(db, documentoId, {
        roteador: { config: configComAnthropic(), provedores: { anthropic: provedorFalso(chamarIA) } },
      }),
    ).rejects.toThrow(/não tem texto extraído/i);
    expect(chamarIA).not.toHaveBeenCalled();
  });

  it("lança erro se o documento não estiver vinculado a nenhuma dívida", async () => {
    const documentoId = await criarDocumento(db);
    await expect(extrairPagamentosDeDocumento(db, documentoId, opcoesComResposta("{}"))).rejects.toThrow(
      /não está vinculado a nenhuma dívida/i,
    );
  });

  describe("parsing defensivo — resposta malformada da IA nunca insere lixo", () => {
    async function prepararDocumentoVinculado(): Promise<{ documentoId: number; dividaId: number }> {
      const documentoId = await criarDocumento(db);
      const dividaId = await criarDividaConsumo(db);
      vincularDocumentoADivida(db, documentoId, "divida_consumo", dividaId);
      return { documentoId, dividaId };
    }

    it("resposta sem JSON reconhecível lança erro e não insere nada", async () => {
      const { documentoId } = await prepararDocumentoVinculado();
      await expect(extrairPagamentosDeDocumento(db, documentoId, opcoesComResposta("desculpe, não consigo ajudar com isso"))).rejects.toThrow(
        /não contém um objeto JSON/i,
      );
      expect(consultar(db, "SELECT * FROM divida_pagamentos_historico")).toHaveLength(0);
    });

    it("JSON sem o campo 'pagamentos' como array lança erro e não insere nada", async () => {
      const { documentoId } = await prepararDocumentoVinculado();
      await expect(extrairPagamentosDeDocumento(db, documentoId, opcoesComResposta('{"resultado": "ok"}'))).rejects.toThrow(
        /array "pagamentos"/i,
      );
      expect(consultar(db, "SELECT * FROM divida_pagamentos_historico")).toHaveLength(0);
    });

    it("item sem valor pago válido lança erro e não insere NENHUM item (mesmo os válidos da mesma resposta)", async () => {
      const { documentoId } = await prepararDocumentoVinculado();
      const resposta = JSON.stringify({
        pagamentos: [
          { data: "2026-01-01", valorPago: 100 },
          { data: "2026-02-01", valorPago: "não sei" },
        ],
      });
      await expect(extrairPagamentosDeDocumento(db, documentoId, opcoesComResposta(resposta))).rejects.toThrow(/valor pago ausente ou inválido/i);
      expect(consultar(db, "SELECT * FROM divida_pagamentos_historico")).toHaveLength(0);
    });

    it("item com data em formato não reconhecido lança erro", async () => {
      const { documentoId } = await prepararDocumentoVinculado();
      const resposta = JSON.stringify({ pagamentos: [{ data: "não é uma data", valorPago: 100 }] });
      await expect(extrairPagamentosDeDocumento(db, documentoId, opcoesComResposta(resposta))).rejects.toThrow(/data ausente ou em formato/i);
      expect(consultar(db, "SELECT * FROM divida_pagamentos_historico")).toHaveLength(0);
    });

    it("lista vazia de pagamentos é válida — não é erro, só não insere nada", async () => {
      const { documentoId } = await prepararDocumentoVinculado();
      const ids = await extrairPagamentosDeDocumento(db, documentoId, opcoesComResposta('{"pagamentos": []}'));
      expect(ids).toEqual([]);
    });
  });
});

describe("confirmarPagamentoExtraido", () => {
  async function inserirPendente(dividaId: number, documentoId: number): Promise<number> {
    executar(
      db,
      `INSERT INTO divida_pagamentos_historico (divida_tipo, divida_id, data_pagamento, valor_pago, valor_juros, valor_amortizacao, origem, confirmado_por_usuario, documento_id)
       VALUES ('divida_consumo', ?, '2026-01-01', 500, 80, 420, 'extraido_ia', 0, ?)`,
      [dividaId, documentoId],
    );
    return consultar<{ id: number }>(db, "SELECT last_insert_rowid() as id")[0].id;
  }

  it("confirma sem ajustes, mantendo os valores extraídos", async () => {
    const dividaId = await criarDividaConsumo(db);
    const documentoId = await criarDocumento(db);
    const pagamentoId = await inserirPendente(dividaId, documentoId);

    confirmarPagamentoExtraido(db, pagamentoId);

    const [linha] = consultar<{ confirmado_por_usuario: number; valor_pago: number }>(
      db,
      "SELECT confirmado_por_usuario, valor_pago FROM divida_pagamentos_historico WHERE id = ?",
      [pagamentoId],
    );
    expect(linha).toEqual({ confirmado_por_usuario: 1, valor_pago: 500 });
  });

  it("confirma aplicando ajustes informados pelo usuário", async () => {
    const dividaId = await criarDividaConsumo(db);
    const documentoId = await criarDocumento(db);
    const pagamentoId = await inserirPendente(dividaId, documentoId);

    confirmarPagamentoExtraido(db, pagamentoId, { valorPago: 550, valorJuros: 90 });

    const [linha] = consultar<{ confirmado_por_usuario: number; valor_pago: number; valor_juros: number; valor_amortizacao: number }>(
      db,
      "SELECT confirmado_por_usuario, valor_pago, valor_juros, valor_amortizacao FROM divida_pagamentos_historico WHERE id = ?",
      [pagamentoId],
    );
    expect(linha).toEqual({ confirmado_por_usuario: 1, valor_pago: 550, valor_juros: 90, valor_amortizacao: 420 });
  });

  it("lança erro se o pagamento não existir", () => {
    expect(() => confirmarPagamentoExtraido(db, 999)).toThrow(/999.*não encontrado/i);
  });

  it("lança erro se o ajuste de valor pago for inválido", async () => {
    const dividaId = await criarDividaConsumo(db);
    const documentoId = await criarDocumento(db);
    const pagamentoId = await inserirPendente(dividaId, documentoId);
    expect(() => confirmarPagamentoExtraido(db, pagamentoId, { valorPago: -10 })).toThrow(/valor pago inválido/i);
  });
});

describe("rejeitarPagamentoExtraido", () => {
  async function inserirPendente(dividaId: number): Promise<number> {
    executar(
      db,
      `INSERT INTO divida_pagamentos_historico (divida_tipo, divida_id, data_pagamento, valor_pago, origem, confirmado_por_usuario)
       VALUES ('divida_consumo', ?, '2026-01-01', 500, 'extraido_ia', 0)`,
      [dividaId],
    );
    return consultar<{ id: number }>(db, "SELECT last_insert_rowid() as id")[0].id;
  }

  it("remove a linha pendente", async () => {
    const dividaId = await criarDividaConsumo(db);
    const pagamentoId = await inserirPendente(dividaId);

    rejeitarPagamentoExtraido(db, pagamentoId, "valor não confere com o extrato do banco");

    expect(consultar(db, "SELECT * FROM divida_pagamentos_historico WHERE id = ?", [pagamentoId])).toHaveLength(0);
  });

  it("lança erro se o pagamento já estiver confirmado (nunca remove um fato)", async () => {
    const dividaId = await criarDividaConsumo(db);
    const pagamentoId = await inserirPendente(dividaId);
    confirmarPagamentoExtraido(db, pagamentoId);

    expect(() => rejeitarPagamentoExtraido(db, pagamentoId, "mudei de ideia")).toThrow(/já está confirmado/i);
    expect(consultar(db, "SELECT * FROM divida_pagamentos_historico WHERE id = ?", [pagamentoId])).toHaveLength(1);
  });

  it("lança erro se o motivo estiver vazio", async () => {
    const dividaId = await criarDividaConsumo(db);
    const pagamentoId = await inserirPendente(dividaId);
    expect(() => rejeitarPagamentoExtraido(db, pagamentoId, "  ")).toThrow(/motivo/i);
  });

  it("lança erro se o pagamento não existir", () => {
    expect(() => rejeitarPagamentoExtraido(db, 999, "motivo")).toThrow(/999.*não encontrado/i);
  });
});

describe("registrarPagamentoManual", () => {
  it("insere já confirmado, com origem 'manual'", async () => {
    const dividaId = await criarDividaConsumo(db);

    const id = registrarPagamentoManual(db, {
      dividaTipo: "divida_consumo",
      dividaId,
      dataPagamento: "2026-01-05",
      valorPago: 500,
      valorJuros: 80,
      valorAmortizacao: 420,
      observacoes: "extrato de janeiro",
    });

    const [linha] = consultar<{ origem: string; confirmado_por_usuario: number; documento_id: number | null }>(
      db,
      "SELECT origem, confirmado_por_usuario, documento_id FROM divida_pagamentos_historico WHERE id = ?",
      [id],
    );
    expect(linha).toEqual({ origem: "manual", confirmado_por_usuario: 1, documento_id: null });
  });

  it("lança erro para valor pago inválido", async () => {
    const dividaId = await criarDividaConsumo(db);
    expect(() => registrarPagamentoManual(db, { dividaTipo: "divida_consumo", dividaId, dataPagamento: "2026-01-05", valorPago: 0 })).toThrow(
      /valor pago inválido/i,
    );
  });

  it("lança erro para data em formato inválido", async () => {
    const dividaId = await criarDividaConsumo(db);
    expect(() =>
      registrarPagamentoManual(db, { dividaTipo: "divida_consumo", dividaId, dataPagamento: "05/01/2026", valorPago: 100 }),
    ).toThrow(/data de pagamento inválida/i);
  });
});

describe("listarPagamentosPendentesConfirmacao / listarPagamentosConfirmados", () => {
  it("separa pendentes de confirmados, e filtra por dívida quando informado", async () => {
    const dividaId = await criarDividaConsumo(db);
    const outraDividaId = await criarDividaConsumo(db);

    executar(
      db,
      `INSERT INTO divida_pagamentos_historico (divida_tipo, divida_id, data_pagamento, valor_pago, origem, confirmado_por_usuario) VALUES
         ('divida_consumo', ?, '2026-01-01', 100, 'extraido_ia', 0),
         ('divida_consumo', ?, '2026-01-02', 200, 'manual', 1),
         ('divida_consumo', ?, '2026-01-03', 300, 'extraido_ia', 0)`,
      [dividaId, dividaId, outraDividaId],
    );

    const pendentesDaDivida = listarPagamentosPendentesConfirmacao(db, "divida_consumo", dividaId);
    expect(pendentesDaDivida).toHaveLength(1);
    expect(pendentesDaDivida[0].valor_pago).toBe(100);

    const todosPendentes = listarPagamentosPendentesConfirmacao(db);
    expect(todosPendentes).toHaveLength(2);

    const confirmadosDaDivida = listarPagamentosConfirmados(db, "divida_consumo", dividaId);
    expect(confirmadosDaDivida).toHaveLength(1);
    expect(confirmadosDaDivida[0].valor_pago).toBe(200);
  });
});
