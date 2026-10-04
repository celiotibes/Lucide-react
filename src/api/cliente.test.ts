import { describe, expect, it, vi } from "vitest";
import { criarClienteApi, montarUrlApi } from "./cliente";

type Resposta = { status?: number; corpo?: unknown; xsrf?: string };

/** Servidor simulado: devolve respostas em fila por rota, sempre com XSRF-TOKEN quando informado. */
function criarServidor(base: string, respostas: Record<string, Resposta[]>) {
  const chamadas: { url: string; init: RequestInit & { headers: Headers } }[] = [];
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    chamadas.push({ url, init: { ...init, headers } });
    const rota = url.replace(base, "");
    const r = (respostas[`${init.method} ${rota}`] ?? []).shift() ?? { status: 200, corpo: {} };
    const h = new Headers();
    if (r.xsrf) h.set("XSRF-TOKEN", r.xsrf);
    return new Response(JSON.stringify(r.corpo ?? {}), { status: r.status ?? 200, headers: h });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, chamadas };
}

describe("montarUrlApi", () => {
  it("base vazia = mesmo domínio; base preenchida remove barras sobrantes", () => {
    expect(montarUrlApi("", "/api/x")).toBe("/api/x");
    expect(montarUrlApi("", "api/x")).toBe("/api/x");
    expect(montarUrlApi("https://api.exemplo.com/", "/api/x")).toBe("https://api.exemplo.com/api/x");
    expect(montarUrlApi("https://api.exemplo.com", "https://outro.com/y")).toBe("https://outro.com/y");
  });
});

describe("apiFetch", () => {
  it("GET usa credentials 'include', não manda CSRF e memoriza o token da resposta", async () => {
    const s = criarServidor("", { "GET /api/a": [{ xsrf: "tok-1" }], "POST /api/b": [{}] });
    const c = criarClienteApi({ baseUrl: () => "", fetchImpl: () => s.fetchImpl });
    await c.apiFetch("/api/a");
    expect(s.chamadas[0].init.credentials).toBe("include");
    expect(s.chamadas[0].init.headers.has("X-XSRF-TOKEN")).toBe(false);
    await c.apiFetch("/api/b", { method: "POST", body: "{}" });
    expect(s.chamadas).toHaveLength(2); // sem GET extra: o token já veio da resposta anterior
    expect(s.chamadas[1].init.headers.get("X-XSRF-TOKEN")).toBe("tok-1");
  });

  it("método mutável sem token busca um antes (GET /api/auth/me) e usa VITE_API_URL como base", async () => {
    const base = "https://api.exemplo.com";
    const s = criarServidor(base, { "GET /api/auth/me": [{ status: 401, xsrf: "tok-9" }], "DELETE /api/c": [{}] });
    const c = criarClienteApi({ baseUrl: () => base, fetchImpl: () => s.fetchImpl });
    await c.apiFetch("/api/c", { method: "delete" });
    expect(s.chamadas.map((x) => `${x.init.method} ${x.url}`)).toEqual([
      `GET ${base}/api/auth/me`,
      `DELETE ${base}/api/c`,
    ]);
    expect(s.chamadas[0].init.credentials).toBe("include");
    expect(s.chamadas[1].init.headers.get("X-XSRF-TOKEN")).toBe("tok-9");
  });

  it("token CSRF vencido (403 EBADCSRFTOKEN): renova e repete uma única vez", async () => {
    const s = criarServidor("", {
      "GET /api/auth/me": [{ xsrf: "velho" }, { xsrf: "novo" }],
      "PUT /api/d": [{ status: 403, corpo: { codigo: "EBADCSRFTOKEN" } }, { status: 200 }],
    });
    const c = criarClienteApi({ baseUrl: () => "", fetchImpl: () => s.fetchImpl });
    const r = await c.apiFetch("/api/d", { method: "PUT" });
    expect(r.status).toBe(200);
    const puts = s.chamadas.filter((x) => x.init.method === "PUT");
    expect(puts.map((p) => p.init.headers.get("X-XSRF-TOKEN"))).toEqual(["velho", "novo"]);
  });

  it("não repete indefinidamente: segundo 403 de CSRF é devolvido como está", async () => {
    const csrf = { status: 403, corpo: { codigo: "EBADCSRFTOKEN" } };
    const s = criarServidor("", { "GET /api/auth/me": [{ xsrf: "a" }, { xsrf: "b" }], "POST /api/e": [csrf, csrf] });
    const c = criarClienteApi({ baseUrl: () => "", fetchImpl: () => s.fetchImpl });
    expect((await c.apiFetch("/api/e", { method: "POST" })).status).toBe(403);
    expect(s.chamadas.filter((x) => x.init.method === "POST")).toHaveLength(2);
  });

  it("401 dispara o evento de logout; semEventoLogout e o cancelamento do ouvinte são respeitados", async () => {
    const s = criarServidor("", { "GET /api/f": [{ status: 401 }, { status: 401 }, { status: 401 }] });
    const c = criarClienteApi({ baseUrl: () => "", fetchImpl: () => s.fetchImpl });
    const ouvinte = vi.fn();
    const cancelar = c.aoSessaoExpirar(ouvinte);
    await c.apiFetch("/api/f");
    expect(ouvinte).toHaveBeenCalledTimes(1);
    await c.apiFetch("/api/f", { semEventoLogout: true });
    expect(ouvinte).toHaveBeenCalledTimes(1);
    cancelar();
    await c.apiFetch("/api/f");
    expect(ouvinte).toHaveBeenCalledTimes(1);
  });

  it("nunca grava token/credencial em localStorage ou sessionStorage", async () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { setItem, getItem: () => null });
    vi.stubGlobal("sessionStorage", { setItem, getItem: () => null });
    try {
      const s = criarServidor("", { "GET /api/auth/me": [{ xsrf: "segredo" }], "POST /api/g": [{ xsrf: "segredo2" }] });
      const c = criarClienteApi({ baseUrl: () => "", fetchImpl: () => s.fetchImpl });
      await c.apiFetch("/api/g", { method: "POST" });
      expect(setItem).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("sem cabeçalho XSRF-TOKEN do servidor, a chamada mutável falha com erro claro (não envia sem token)", async () => {
    const s = criarServidor("", { "GET /api/auth/me": [{ status: 404 }] });
    const c = criarClienteApi({ baseUrl: () => "", fetchImpl: () => s.fetchImpl });
    await expect(c.apiFetch("/api/h", { method: "POST" })).rejects.toThrow(/token CSRF/);
    expect(s.chamadas.some((x) => x.init.method === "POST")).toBe(false);
  });
});
