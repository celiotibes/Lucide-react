import { describe, expect, it, vi } from "vitest";
import { consultarSessao, entrar, sair, type DepsSessao } from "./sessao";

function deps(resposta: () => Response | Promise<Response>): DepsSessao & { chamadas: [string, (RequestInit & { semEventoLogout?: boolean }) | undefined][] } {
  const chamadas: [string, (RequestInit & { semEventoLogout?: boolean }) | undefined][] = [];
  return {
    chamadas,
    apiFetch: vi.fn(async (caminho: string, init?: RequestInit & { semEventoLogout?: boolean }) => {
      chamadas.push([caminho, init]);
      return resposta();
    }) as unknown as DepsSessao["apiFetch"],
    esquecerTokenCsrf: vi.fn(),
  };
}
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });
const usuario = { id: "u1", nome: "Ana", email: "ana@x.com", role: "titular" };

describe("consultarSessao (GET /api/auth/me)", () => {
  it("200 com usuário => autenticado", async () => {
    expect(await consultarSessao(deps(() => json({ usuario })))).toEqual({ status: "autenticado", usuario });
  });
  it("401 => anônimo, sem disparar logout", async () => {
    const d = deps(() => json({ erro: "x" }, 401));
    expect(await consultarSessao(d)).toEqual({ status: "anonimo" });
    expect(d.chamadas[0][1].semEventoLogout).toBe(true);
  });
  it("sem servidor (rede cai), 404, 5xx ou HTML de fallback => indisponível, sem lançar", async () => {
    expect((await consultarSessao(deps(() => Promise.reject(new TypeError("Failed to fetch"))))).status).toBe("indisponivel");
    expect((await consultarSessao(deps(() => json({}, 404)))).status).toBe("indisponivel");
    expect((await consultarSessao(deps(() => json({}, 502)))).status).toBe("indisponivel");
    expect((await consultarSessao(deps(() => new Response("<html></html>", { status: 200 })))).status).toBe("indisponivel");
  });
});

describe("entrar (POST /api/auth/login)", () => {
  it("sucesso: devolve o usuário, manda e-mail aparado + senha só no corpo e renova o CSRF", async () => {
    const d = deps(() => json({ usuario, csrfToken: "x" }));
    const r = await entrar("  ana@x.com ", "s3nha", d);
    expect(r).toEqual({ ok: true, usuario });
    const [caminho, init] = d.chamadas[0];
    expect(caminho).toBe("/api/auth/login");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ email: "ana@x.com", senha: "s3nha" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((init as any)?.semEventoLogout).toBe(true);
    expect(d.esquecerTokenCsrf).toHaveBeenCalled();
  });
  it("401 => mensagem do servidor, sem vazar qual campo errou", async () => {
    const r = await entrar("a@x.com", "errada", deps(() => json({ erro: "Credenciais inválidas" }, 401)));
    expect(r).toEqual({ ok: false, tipo: "credenciais", mensagem: "Credenciais inválidas" });
  });
  it("429 => limite; rede/HTML => indisponível", async () => {
    const r429 = await entrar("a@x.com", "s", deps(() => json({}, 429)));
    expect(r429.tipo).toBe("limite");
    const rede = await entrar("a@x.com", "s", deps(() => Promise.reject(new TypeError("x"))));
    expect(rede.tipo).toBe("indisponivel");
    const html = await entrar("a@x.com", "s", deps(() => new Response("<html>", { status: 200 })));
    expect(html.tipo).toBe("indisponivel");
  });
});

describe("sair (POST /api/auth/logout)", () => {
  it("chama o logout real e esquece o CSRF; falha de rede não lança", async () => {
    const d = deps(() => json({ ok: true }));
    await sair(d);
    expect(d.chamadas[0][0]).toBe("/api/auth/logout");
    expect(d.chamadas[0][1].method).toBe("POST");
    expect(d.esquecerTokenCsrf).toHaveBeenCalled();
    await expect(sair(deps(() => Promise.reject(new TypeError("x"))))).resolves.toBeUndefined();
  });
});
