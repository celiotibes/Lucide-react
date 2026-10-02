import { afterEach, describe, expect, it, vi } from "vitest";
import { buscarMatrizPermissoes, salvarMatrizPermissoes, criarUsuarioAdmin } from "./api";
import type { EntradaPermissao } from "./api";

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buscarMatrizPermissoes", () => {
  it("chama GET /api/auth/permissoes com Bearer e devolve o corpo exatamente como veio", async () => {
    const corpo = {
      matriz: [{ papel: "admin", funcao: "editar", habilitado: true, limite_valor: null }],
      catalogoFuncoes: [{ id: "editar", rotulo: "Editar", descricao: "desc", suportaLimite: false }],
      papeis: ["admin", "titular"],
    };
    const fetchMock = vi.fn().mockResolvedValue(respostaJson(corpo));
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await buscarMatrizPermissoes("http://localhost:3001", "token-abc");

    expect(resultado).toEqual(corpo);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:3001/api/auth/permissoes");
    expect(init.headers.Authorization).toBe("Bearer token-abc");
    expect(init.method).toBeUndefined(); // GET implícito, sem method explícito
  });

  it("em falha HTTP com corpo { erro }, lança com a mensagem exata do backend", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respostaJson({ erro: "token expirado" }, 401)));

    await expect(buscarMatrizPermissoes("http://localhost:3001", "token-velho")).rejects.toThrow("token expirado");
  });

  it("em falha HTTP sem corpo JSON (ex: proxy devolvendo HTML/erro 500), cai na mensagem genérica com o status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Bad Gateway</html>", { status: 502 })));

    await expect(buscarMatrizPermissoes("http://localhost:3001", "token-x")).rejects.toThrow("Falha ao carregar a matriz de permissões (HTTP 502)");
  });
});

describe("salvarMatrizPermissoes", () => {
  it("manda PUT com as entradas no corpo e devolve a matriz atualizada da resposta", async () => {
    const entradas: EntradaPermissao[] = [{ papel: "admin", funcao: "editar", habilitado: false, limite_valor: 1000 }];
    const matrizAtualizada: EntradaPermissao[] = [{ papel: "admin", funcao: "editar", habilitado: false, limite_valor: 1000 }];
    const fetchMock = vi.fn().mockResolvedValue(respostaJson({ matriz: matrizAtualizada }));
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await salvarMatrizPermissoes("http://localhost:3001", "token-abc", entradas);

    expect(resultado).toEqual(matrizAtualizada);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:3001/api/auth/permissoes");
    expect(init.method).toBe("PUT");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers.Authorization).toBe("Bearer token-abc");
    expect(JSON.parse(init.body as string)).toEqual({ entradas });
  });

  it("em falha HTTP, lança com a mensagem do backend quando disponível", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respostaJson({ erro: "limite inválido para esta função" }, 400)));

    await expect(
      salvarMatrizPermissoes("http://localhost:3001", "token-abc", [{ papel: "admin", funcao: "x", habilitado: true, limite_valor: null }]),
    ).rejects.toThrow("limite inválido para esta função");
  });

  it("em falha HTTP sem corpo JSON, cai na mensagem genérica com o status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    await expect(salvarMatrizPermissoes("http://localhost:3001", "token-abc", [])).rejects.toThrow("Falha ao salvar a matriz de permissões (HTTP 500)");
  });
});

describe("criarUsuarioAdmin", () => {
  it("manda POST com os dados do usuário e devolve o usuário criado", async () => {
    const usuario = { id: "u1", nome: "Nova Pessoa", email: "nova@exemplo.com", role: "operador", ativo: true };
    const fetchMock = vi.fn().mockResolvedValue(respostaJson({ usuario }));
    vi.stubGlobal("fetch", fetchMock);

    const dados = { nome: "Nova Pessoa", email: "nova@exemplo.com", senha: "senha-forte-123", role: "operador" };
    const resultado = await criarUsuarioAdmin("http://localhost:3001", "token-abc", dados);

    expect(resultado).toEqual(usuario);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:3001/api/auth/usuarios");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(dados);
    // a senha vai no corpo (HTTPS), nunca em query string ou header
    expect(url).not.toContain("senha");
  });

  it("em falha HTTP (ex: e-mail já cadastrado), lança com a mensagem do backend", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respostaJson({ erro: "e-mail já cadastrado" }, 409)));

    await expect(
      criarUsuarioAdmin("http://localhost:3001", "token-abc", { nome: "X", email: "dup@exemplo.com", senha: "123456", role: "operador" }),
    ).rejects.toThrow("e-mail já cadastrado");
  });

  it("em falha HTTP sem corpo JSON, cai na mensagem genérica com o status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));

    await expect(
      criarUsuarioAdmin("http://localhost:3001", "token-abc", { nome: "X", email: "x@exemplo.com", senha: "123456", role: "operador" }),
    ).rejects.toThrow("Falha ao criar usuário (HTTP 403)");
  });
});
