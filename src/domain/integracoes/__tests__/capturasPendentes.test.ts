import { describe, expect, it, beforeEach, vi } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { consultar } from "../../../db/connection";
import {
  buscarCapturasPendentes,
  importarCapturaParaTriagem,
  type CapturasApiClient,
  type CapturaTelegramPendente,
} from "../capturasPendentes";

// A extração de campos (heurística + fallback de IA) e o OCR já são testados em
// src/domain/documentos/extrairCampos.test.ts e src/domain/documentos/classificarComIA.test.ts
// — mockados aqui para manter este teste determinístico e sem rede/CDN (OCR real via
// tesseract.js faz download de pacote de idioma na primeira execução).
vi.mock("../../documentos/extrairCampos", () => ({
  extrairTextoDocumento: vi.fn(async () => "RECIBO\nValor: R$ 150,00\nData: 01/10/2026"),
  extrairCamposDeTexto: vi.fn(async (texto: string) => {
    if (texto.includes("150,00")) {
      return { tipo: "recibo", valor: 150, data: "2026-10-01", usouIA: false };
    }
    return {};
  }),
}));

let db: Database;

beforeEach(async () => {
  db = await criarBancoDeTeste();
  vi.clearAllMocks();
});

function criarCapturaFake(overrides: Partial<CapturaTelegramPendente> = {}): CapturaTelegramPendente {
  return {
    id: "evt_1",
    tipo: "captura_telegram",
    usuarioId: "user_titular_1",
    payload: {
      chatId: "555",
      mensagemTelegramId: 10,
      dataMensagem: "2026-10-01T12:00:00.000Z",
      texto: "Paguei 150,00 de conserto hoje",
    },
    recebidoEm: "2026-10-01T12:00:05.000Z",
    consumido: false,
    consumidoEm: null,
    ...overrides,
  };
}

function criarApiClientFake(capturas: CapturaTelegramPendente[] = []): CapturasApiClient & {
  idsConsumidos: string[];
} {
  const idsConsumidos: string[] = [];
  return {
    idsConsumidos,
    listarPendentes: vi.fn(async () => capturas),
    marcarConsumido: vi.fn(async (id: string) => {
      idsConsumidos.push(id);
    }),
  };
}

describe("buscarCapturasPendentes", () => {
  it("devolve o que o apiClient.listarPendentes devolver", async () => {
    const captura = criarCapturaFake();
    const apiClient = criarApiClientFake([captura]);

    const resultado = await buscarCapturasPendentes(apiClient);

    expect(resultado).toEqual([captura]);
    expect(apiClient.listarPendentes).toHaveBeenCalledTimes(1);
  });

  it("devolve lista vazia quando não há capturas pendentes", async () => {
    const apiClient = criarApiClientFake([]);
    expect(await buscarCapturasPendentes(apiClient)).toEqual([]);
  });
});

describe("importarCapturaParaTriagem", () => {
  it("insere a captura de texto em `documentos`, pré-preenchida pela extração, e marca consumido", async () => {
    const captura = criarCapturaFake();
    const apiClient = criarApiClientFake();

    const resultado = await importarCapturaParaTriagem(db, apiClient, captura);

    const [documento] = consultar<{ id: number; tipo: string; valor: number | null; observacoes: string }>(
      db,
      "SELECT * FROM documentos WHERE id = ?",
      [resultado.documentoId],
    );
    expect(documento).toBeTruthy();
    expect(documento.tipo).toBe("recibo");
    expect(documento.valor).toBe(150);
    expect(documento.observacoes).toContain("Telegram");
    expect(documento.observacoes).toContain("Nenhum campo foi confirmado");

    expect(apiClient.marcarConsumido).toHaveBeenCalledWith("evt_1");
    expect(apiClient.idsConsumidos).toEqual(["evt_1"]);
  });

  it("NUNCA classifica automaticamente como fato: o documento criado não tem nenhuma transação vinculada", async () => {
    const captura = criarCapturaFake();
    const apiClient = criarApiClientFake();

    const resultado = await importarCapturaParaTriagem(db, apiClient, captura);

    const vinculos = consultar(db, "SELECT * FROM documento_transacoes WHERE documento_id = ?", [resultado.documentoId]);
    expect(vinculos).toHaveLength(0);
  });

  it("captura só com foto: baixa OCR, extrai campos do texto reconhecido e importa", async () => {
    const captura = criarCapturaFake({
      id: "evt_foto",
      payload: {
        chatId: "555",
        mensagemTelegramId: 11,
        dataMensagem: "2026-10-01T12:05:00.000Z",
        foto: { fileId: "file_1", mimeType: "image/jpeg", base64: Buffer.from("conteudo-fake-da-foto").toString("base64") },
      },
    });
    const apiClient = criarApiClientFake();

    const resultado = await importarCapturaParaTriagem(db, apiClient, captura);

    expect(resultado.usouOCR).toBe(true);
    const [documento] = consultar<{ tipo: string; valor: number | null; arquivo_nome: string }>(
      db,
      "SELECT tipo, valor, arquivo_nome FROM documentos WHERE id = ?",
      [resultado.documentoId],
    );
    expect(documento.tipo).toBe("recibo");
    expect(documento.valor).toBe(150);
    expect(documento.arquivo_nome).toBe("telegram-evt_foto.jpg");
  });

  it("recusa um evento que não seja do tipo 'captura_telegram'", async () => {
    const captura = criarCapturaFake({ tipo: "captura_telegram" });
    const apiClient = criarApiClientFake();
    await expect(
      importarCapturaParaTriagem(db, apiClient, { ...captura, tipo: "webhook_asaas" as "captura_telegram" }),
    ).rejects.toThrow(/captura_telegram/);
  });

  it("importa mesmo sem nenhum campo extraído (texto vazio): entra como 'outro', revisável na tela", async () => {
    const captura = criarCapturaFake({
      id: "evt_vazio",
      payload: { chatId: "555", mensagemTelegramId: 12, dataMensagem: "2026-10-01T12:10:00.000Z", texto: "oi" },
    });
    const apiClient = criarApiClientFake();

    const resultado = await importarCapturaParaTriagem(db, apiClient, captura);

    const [documento] = consultar<{ tipo: string; valor: number | null }>(db, "SELECT tipo, valor FROM documentos WHERE id = ?", [
      resultado.documentoId,
    ]);
    expect(documento.tipo).toBe("outro");
    expect(documento.valor).toBeNull();
  });
});
