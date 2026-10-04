import { afterEach, describe, expect, it, vi } from "vitest";
import { buscarMatrizPermissoes, salvarMatrizPermissoes, criarUsuarioAdmin } from "./api";
import type { EntradaPermissao } from "./api";
import { esquecerTokenCsrf } from "../../api/cliente";

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

/** fetch simulado: GET /api/auth/me só entrega o token CSRF (como o servidor real faz em toda
 * resposta); qualquer outra rota recebe `resposta`. As chamadas reais ficam em `.mock.calls`
 * filtradas por `chamadasDaRota`. */
function simularServidor(resposta: Response | (() => Response)) {
  const mock = vi.fn(async (url: string) => {
    if (String(url).endsWith("/api/auth/me")) return new Response("{}", { status: 401, headers: { "XSRF-TOKEN": "csrf-123" } });
    return typeof resposta === "function" ? resposta() : resposta.clone();
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}
const chamadasDaRota = (mock: ReturnType<typeof simularServidor>) =>
  mock.mock.calls.filter(([url]) => !String(url).endsWith("/api/auth/me"));

afterEach(() => {
  vi.unstubAllGlobals();
  esquecerTokenCsrf();
});

describe("buscarMatrizPermissoes", () => {
  it("chama GET /api/auth/permissoes com a sessão por cookie (sem Bearer) e devolve o corpo exatamente como veio", async () => {
    const corpo = {
      matriz: [{ papel: "admin", funcao: "editar", habilitado: true, limite_valor: null }],
      catalogoFuncoes: [{ id: "editar", rotulo: "Editar", descricao: "desc", suportaLimite: false }],
      papeis: ["admin", "titular"],
    };
    const fetchMock = simularServidor(respostaJson(corpo));

    const resultado = await buscarMatrizPermissoes();

    expect(resultado).toEqual(corpo);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/permissoes");
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
    expect(init.method).toBe("GET");
  });

  it("em falha HTTP com corpo { erro }, lança com a mensagem exata do backend", async () => {
    simularServidor(respostaJson({ erro: "token expirado" }, 401));

    await expect(buscarMatrizPermissoes()).rejects.toThrow("token expirado");
  });

  it("em falha HTTP sem corpo JSON (ex: proxy devolvendo HTML/erro 500), cai na mensagem genérica com o status", async () => {
    simularServidor(new Response("<html>Bad Gateway</html>", { status: 502 }));

    await expect(buscarMatrizPermissoes()).rejects.toThrow("Falha ao carregar a matriz de permissões (HTTP 502)");
  });
});

describe("salvarMatrizPermissoes", () => {
  it("manda PUT com as entradas no corpo e devolve a matriz atualizada da resposta", async () => {
    const entradas: EntradaPermissao[] = [{ papel: "admin", funcao: "editar", habilitado: false, limite_valor: 1000 }];
    const matrizAtualizada: EntradaPermissao[] = [{ papel: "admin", funcao: "editar", habilitado: false, limite_valor: 1000 }];
    const fetchMock = simularServidor(respostaJson({ matriz: matrizAtualizada }));

    const resultado = await salvarMatrizPermissoes(entradas);

    expect(resultado).toEqual(matrizAtualizada);
    const [url, init] = chamadasDaRota(fetchMock)[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/permissoes");
    expect(init.method).toBe("PUT");
    const cabecalhos = new Headers(init.headers);
    expect(cabecalhos.get("Content-Type")).toBe("application/json");
    expect(cabecalhos.get("X-XSRF-TOKEN")).toBe("csrf-123"); // CSRF em método mutável
    expect(cabecalhos.has("Authorization")).toBe(false);
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body as string)).toEqual({ entradas });
  });

  it("em falha HTTP, lança com a mensagem do backend quando disponível", async () => {
    simularServidor(respostaJson({ erro: "limite inválido para esta função" }, 400));

    await expect(
      salvarMatrizPermissoes([{ papel: "admin", funcao: "x", habilitado: true, limite_valor: null }]),
    ).rejects.toThrow("limite inválido para esta função");
  });

  it("em falha HTTP sem corpo JSON, cai na mensagem genérica com o status", async () => {
    simularServidor(new Response(null, { status: 500 }));

    await expect(salvarMatrizPermissoes([])).rejects.toThrow("Falha ao salvar a matriz de permissões (HTTP 500)");
  });
});

describe("criarUsuarioAdmin", () => {
  it("manda POST com os dados do usuário e devolve o usuário criado", async () => {
    const usuario = { id: "u1", nome: "Nova Pessoa", email: "nova@exemplo.com", role: "operador", ativo: true };
    const fetchMock = simularServidor(respostaJson({ usuario }));

    const dados = { nome: "Nova Pessoa", email: "nova@exemplo.com", senha: "senha-forte-123", role: "operador" };
    const resultado = await criarUsuarioAdmin(dados);

    expect(resultado).toEqual(usuario);
    const [url, init] = chamadasDaRota(fetchMock)[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/usuarios");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(dados);
    // a senha vai no corpo (HTTPS), nunca em query string ou header
    expect(url).not.toContain("senha");
  });

  it("em falha HTTP (ex: e-mail já cadastrado), lança com a mensagem do backend", async () => {
    simularServidor(respostaJson({ erro: "e-mail já cadastrado" }, 409));

    await expect(
      criarUsuarioAdmin({ nome: "X", email: "dup@exemplo.com", senha: "123456", role: "operador" }),
    ).rejects.toThrow("e-mail já cadastrado");
  });

  it("em falha HTTP sem corpo JSON, cai na mensagem genérica com o status", async () => {
    simularServidor(new Response(null, { status: 403 }));

    await expect(
      criarUsuarioAdmin({ nome: "X", email: "x@exemplo.com", senha: "123456", role: "operador" }),
    ).rejects.toThrow("Falha ao criar usuário (HTTP 403)");
  });
});
