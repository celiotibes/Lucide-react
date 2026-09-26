import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classificarDocumentoComIA } from "./classificarComIA";
import { registroProveniencia } from "../ia/proveniencia";

beforeEach(() => {
  registroProveniencia.limpar();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("classificarDocumentoComIA — integração com o roteador e a proveniência", () => {
  it("completa o registro de proveniência com a confiança reportada pelo modelo (nenhuma API real é chamada)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [
            {
              type: "text",
              text: '{"tipo":"boleto","nomeContraparte":"Empresa X","confianca":"alta","explicacao":"linha digitável presente"}',
            },
          ],
          usage: { input_tokens: 50, output_tokens: 10 },
        }),
      }),
    );

    const resultado = await classificarDocumentoComIA("texto qualquer do documento", "sk-ant-teste");

    expect(resultado.tipo).toBe("boleto");
    expect(resultado.confianca).toBe("alta");
    expect(resultado.provedor).toBe("anthropic");

    // É este registro que responde "qual regra classificou este valor" com "o modelo X, em
    // tal data, com confiança alta" em vez de só "a IA achou".
    const registros = registroProveniencia.listar();
    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({ provedor: "anthropic", sucesso: true, confianca: "alta" });
  });

  it("usa o backend legado (VITE_CLASIFICACAO_BACKEND) quando configurado, sem passar pelo roteador multi-provedor", async () => {
    vi.stubEnv("VITE_CLASIFICACAO_BACKEND", "https://backend-legado.exemplo/classificar");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ tipo: "recibo", confianca: "media" }) });
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await classificarDocumentoComIA("texto qualquer");

    expect(resultado).toEqual({ tipo: "recibo", confianca: "media" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://backend-legado.exemplo/classificar",
      expect.objectContaining({ method: "POST" }),
    );
    // Caminho legado é independente do roteador — não cria proveniência de roteador.
    expect(registroProveniencia.listar()).toHaveLength(0);
  });

  it("nunca lança/trava a UI quando todos os provedores falham — devolve objeto vazio para o formulário seguir editável", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => "quota excedida" }));
    const resultado = await classificarDocumentoComIA("texto qualquer do documento", "sk-ant-teste");
    expect(resultado).toEqual({});
  });
});
