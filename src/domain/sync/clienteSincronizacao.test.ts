import { afterEach, describe, expect, it, vi } from "vitest";
import {
  obterEstadoServidor, baixarBancoDoServidor, enviarBancoAoServidor, ConflitoSincronizacaoError,
} from "./clienteSincronizacao";

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("clienteSincronizacao", () => {
  it("obterEstadoServidor manda X-API-Key e devolve o JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaJson({ versao: 3, atualizadoEm: "2026-01-01T00:00:00Z", hashSha256: "abc", tamanhoBytes: 10, dispositivo: "A" }));
    vi.stubGlobal("fetch", fetchMock);

    const estado = await obterEstadoServidor("http://localhost:8788", "chave-x");
    expect(estado.versao).toBe(3);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8788/api/sync/estado");
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe("chave-x");
  });

  it("baixarBancoDoServidor lança mensagem clara em 404 (nenhum banco enviado ainda)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(baixarBancoDoServidor("http://localhost:8788", "chave-x")).rejects.toThrow(/Nenhum banco/);
  });

  it("enviarBancoAoServidor manda versaoBase e dispositivo na query string", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaJson({ versao: 4, atualizadoEm: "2026-01-02T00:00:00Z", hashSha256: "def", tamanhoBytes: 20, dispositivo: "B" }));
    vi.stubGlobal("fetch", fetchMock);

    const estado = await enviarBancoAoServidor("http://localhost:8788", "chave-x", new Uint8Array([1, 2, 3]), 3, "Notebook");
    expect(estado.versao).toBe(4);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("versaoBase=3");
    expect(url).toContain("dispositivo=Notebook");
    expect(init.method).toBe("POST");
  });

  it("enviarBancoAoServidor lança ConflitoSincronizacaoError em 409, sem perder o estado do servidor", async () => {
    const estadoServidor = { versao: 5, atualizadoEm: "2026-01-03T00:00:00Z", hashSha256: "ghi", tamanhoBytes: 30, dispositivo: "OutroDispositivo" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respostaJson({ erro: "conflito", estadoServidor }, 409)));

    try {
      await enviarBancoAoServidor("http://localhost:8788", "chave-x", new Uint8Array([1]), 3, "Notebook");
      expect.unreachable("deveria ter lançado ConflitoSincronizacaoError");
    } catch (e) {
      expect(e).toBeInstanceOf(ConflitoSincronizacaoError);
      expect((e as ConflitoSincronizacaoError).estadoServidor.versao).toBe(5);
      expect((e as ConflitoSincronizacaoError).estadoServidor.dispositivo).toBe("OutroDispositivo");
    }
  });
});
