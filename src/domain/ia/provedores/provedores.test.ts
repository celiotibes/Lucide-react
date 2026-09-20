import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { provedorAnthropic } from "./anthropic";
import { provedorOpenAI } from "./openai";
import { provedorGemini } from "./gemini";
import { provedorOllama } from "./ollama";

/** Nenhum destes testes chama uma API de verdade — `fetch` é sempre um `vi.fn()`. O formato
 * de cada requisição/resposta abaixo replica o que foi confirmado via Context7 (ver
 * comentário no topo de cada provedor); estes testes travam esse formato contra regressão. */

function mockFetchOk(corpoResposta: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => corpoResposta,
    text: async () => JSON.stringify(corpoResposta),
  });
}

function mockFetchErro(status: number, corpo = "erro") {
  return vi.fn().mockResolvedValue({ ok: false, status, text: async () => corpo });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("provedorAnthropic", () => {
  it("monta a requisição no formato da Messages API e extrai texto + tokens da resposta", async () => {
    const fetchMock = mockFetchOk({
      content: [{ type: "text", text: '{"tipo":"boleto"}' }],
      usage: { input_tokens: 120, output_tokens: 15 },
    });
    vi.stubGlobal("fetch", fetchMock);

    const resposta = await provedorAnthropic.chamar("classifique isto", {
      modelo: "claude-haiku-4-5",
      apiKey: "sk-ant-teste",
    });

    expect(resposta).toEqual({ texto: '{"tipo":"boleto"}', tokensEntrada: 120, tokensSaida: 15 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe("sk-ant-teste");
    expect(init.headers["anthropic-version"]).toBe("2023-06-01");
    const corpo = JSON.parse(init.body);
    expect(corpo.model).toBe("claude-haiku-4-5");
    expect(corpo.messages).toEqual([{ role: "user", content: "classifique isto" }]);
  });

  it("lança erro claro quando a chave não está configurada", async () => {
    await expect(provedorAnthropic.chamar("x", { modelo: "m" })).rejects.toThrow(/chave de API/);
  });

  it("lança erro com o status HTTP quando o provedor responde com falha (ex: 429)", async () => {
    vi.stubGlobal("fetch", mockFetchErro(429, "rate limited"));
    await expect(provedorAnthropic.chamar("x", { modelo: "m", apiKey: "k" })).rejects.toThrow(/429/);
  });
});

describe("provedorOpenAI", () => {
  it("monta a requisição no formato de /v1/chat/completions e extrai a mensagem da resposta", async () => {
    const fetchMock = mockFetchOk({
      choices: [{ message: { content: '{"tipo":"fatura"}' } }],
      usage: { prompt_tokens: 80, completion_tokens: 12 },
    });
    vi.stubGlobal("fetch", fetchMock);

    const resposta = await provedorOpenAI.chamar("classifique isto", { modelo: "gpt-4o-mini", apiKey: "sk-teste" });

    expect(resposta).toEqual({ texto: '{"tipo":"fatura"}', tokensEntrada: 80, tokensSaida: 12 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer sk-teste");
    const corpo = JSON.parse(init.body);
    expect(corpo.model).toBe("gpt-4o-mini");
    expect(corpo.messages).toEqual([{ role: "user", content: "classifique isto" }]);
  });

  it("lança erro claro quando a chave não está configurada", async () => {
    await expect(provedorOpenAI.chamar("x", { modelo: "m" })).rejects.toThrow(/chave de API/);
  });
});

describe("provedorGemini", () => {
  it("monta a requisição no formato de generateContent e extrai o texto do candidate", async () => {
    const fetchMock = mockFetchOk({
      candidates: [{ content: { parts: [{ text: '{"tipo":"contrato"}' }] } }],
      usageMetadata: { promptTokenCount: 60, candidatesTokenCount: 10 },
    });
    vi.stubGlobal("fetch", fetchMock);

    const resposta = await provedorGemini.chamar("classifique isto", { modelo: "gemini-2.5-flash", apiKey: "goog-teste" });

    expect(resposta).toEqual({ texto: '{"tipo":"contrato"}', tokensEntrada: 60, tokensSaida: 10 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
    expect(init.headers["x-goog-api-key"]).toBe("goog-teste");
    const corpo = JSON.parse(init.body);
    expect(corpo.contents).toEqual([{ parts: [{ text: "classifique isto" }] }]);
  });

  it("lança erro claro quando a chave não está configurada", async () => {
    await expect(provedorGemini.chamar("x", { modelo: "m" })).rejects.toThrow(/chave de API/);
  });
});

describe("provedorOllama", () => {
  it("monta a requisição no formato de /api/chat (stream:false) e extrai message.content", async () => {
    const fetchMock = mockFetchOk({
      message: { content: '{"tipo":"recibo"}' },
      prompt_eval_count: 30,
      eval_count: 8,
    });
    vi.stubGlobal("fetch", fetchMock);

    const resposta = await provedorOllama.chamar("classifique isto", { modelo: "llama3.2" });

    expect(resposta).toEqual({ texto: '{"tipo":"recibo"}', tokensEntrada: 30, tokensSaida: 8 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:11434/api/chat");
    const corpo = JSON.parse(init.body);
    expect(corpo).toEqual({ model: "llama3.2", messages: [{ role: "user", content: "classifique isto" }], stream: false });
  });

  it("não exige chave de API (servidor local)", async () => {
    vi.stubGlobal("fetch", mockFetchOk({ message: { content: "ok" } }));
    await expect(provedorOllama.chamar("x", { modelo: "llama3.2" })).resolves.toEqual({
      texto: "ok",
      tokensEntrada: undefined,
      tokensSaida: undefined,
    });
  });

  it("respeita `baseUrl` customizado (ex: Ollama num host diferente de localhost)", async () => {
    const fetchMock = mockFetchOk({ message: { content: "ok" } });
    vi.stubGlobal("fetch", fetchMock);
    await provedorOllama.chamar("x", { modelo: "llama3.2", baseUrl: "http://192.168.0.10:11434" });
    expect(fetchMock.mock.calls[0][0]).toBe("http://192.168.0.10:11434/api/chat");
  });
});
