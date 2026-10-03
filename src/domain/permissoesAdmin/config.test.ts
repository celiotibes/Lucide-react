import { afterEach, describe, expect, it, vi } from "vitest";
import {
  backendConfigurado,
  carregarConfiguracaoPermissoesAdmin,
  salvarConfiguracaoPermissoesAdmin,
} from "./config";
import type { ConfiguracaoPermissoesAdmin } from "./config";

/** Mesma chave que config.ts usa internamente (não exportada — CHAVE_LOCALSTORAGE é um
 * detalhe de implementação). Hardcoded aqui só para os testes que escrevem diretamente no
 * localStorage simulado antes de chamar carregarConfiguracaoPermissoesAdmin(), replicando o
 * que um reload de página faria. */
const CHAVE_LOCALSTORAGE = "permissoes-admin:config:v1";

/** Ambiente de teste é 'node' (vitest.config.ts), sem `localStorage` global — mesma situação
 * documentada em src/domain/ia/config.test.ts. Aqui simulamos um localStorage real (em
 * memória) via vi.stubGlobal para também cobrir o caminho de leitura/escrita de verdade, não
 * só a queda para o padrão quando o storage não existe. */
class LocalStorageFalso implements Storage {
  private dados = new Map<string, string>();
  get length() {
    return this.dados.size;
  }
  clear(): void {
    this.dados.clear();
  }
  getItem(chave: string): string | null {
    return this.dados.has(chave) ? this.dados.get(chave)! : null;
  }
  key(indice: number): string | null {
    return Array.from(this.dados.keys())[indice] ?? null;
  }
  removeItem(chave: string): void {
    this.dados.delete(chave);
  }
  setItem(chave: string, valor: string): void {
    this.dados.set(chave, valor);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("carregarConfiguracaoPermissoesAdmin / salvarConfiguracaoPermissoesAdmin — sem localStorage disponível", () => {
  it("sem `localStorage` global (ambiente de teste 'node'), volta ao padrão em memória sem lançar", () => {
    const config = carregarConfiguracaoPermissoesAdmin();
    expect(config).toEqual({ enderecoBackend: "", tokenSessao: "" });
  });

  it("cada chamada retorna um objeto novo — mutar o resultado não contamina chamadas seguintes", () => {
    const config1 = carregarConfiguracaoPermissoesAdmin();
    config1.enderecoBackend = "http://mutado";
    const config2 = carregarConfiguracaoPermissoesAdmin();
    expect(config2.enderecoBackend).toBe("");
  });

  it("salvar sem `localStorage` disponível não lança (erro é absorvido, como em qualquer storage bloqueado)", () => {
    expect(() => salvarConfiguracaoPermissoesAdmin({ enderecoBackend: "http://x", tokenSessao: "tok" })).not.toThrow();
  });
});

describe("carregarConfiguracaoPermissoesAdmin / salvarConfiguracaoPermissoesAdmin — com localStorage simulado", () => {
  it("round-trip: salvar e depois carregar devolve exatamente o que foi salvo", () => {
    vi.stubGlobal("localStorage", new LocalStorageFalso());
    const original: ConfiguracaoPermissoesAdmin = { enderecoBackend: "http://localhost:3001", tokenSessao: "Bearer-abc123" };

    salvarConfiguracaoPermissoesAdmin(original);
    const recarregada = carregarConfiguracaoPermissoesAdmin();

    expect(recarregada).toEqual(original);
  });

  it("configuração salva parcialmente (campo faltando) é completada com o padrão ao carregar", () => {
    const fake = new LocalStorageFalso();
    fake.setItem(CHAVE_LOCALSTORAGE, JSON.stringify({ enderecoBackend: "http://api.exemplo" }));
    vi.stubGlobal("localStorage", fake);

    const config = carregarConfiguracaoPermissoesAdmin();
    expect(config).toEqual({ enderecoBackend: "http://api.exemplo", tokenSessao: "" });
  });

  it("JSON corrompido no storage não lança — volta ao padrão", () => {
    const fake = new LocalStorageFalso();
    fake.setItem(CHAVE_LOCALSTORAGE, "{ isto não é json válido");
    vi.stubGlobal("localStorage", fake);

    expect(() => carregarConfiguracaoPermissoesAdmin()).not.toThrow();
    expect(carregarConfiguracaoPermissoesAdmin()).toEqual({ enderecoBackend: "", tokenSessao: "" });
  });

  it("nada gravado ainda (primeira execução) retorna o padrão sem lançar", () => {
    vi.stubGlobal("localStorage", new LocalStorageFalso());
    expect(carregarConfiguracaoPermissoesAdmin()).toEqual({ enderecoBackend: "", tokenSessao: "" });
  });

  it("setItem lançando (quota excedida) não propaga o erro — configuração só não sobrevive a um reload", () => {
    const fake = new LocalStorageFalso();
    vi.spyOn(fake, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    vi.stubGlobal("localStorage", fake);

    expect(() => salvarConfiguracaoPermissoesAdmin({ enderecoBackend: "http://x", tokenSessao: "tok" })).not.toThrow();
  });
});

describe("backendConfigurado", () => {
  it("endereço vazio não é considerado configurado", () => {
    expect(backendConfigurado({ enderecoBackend: "", tokenSessao: "" })).toBe(false);
  });

  it("endereço só com espaços em branco não é considerado configurado", () => {
    expect(backendConfigurado({ enderecoBackend: "   ", tokenSessao: "" })).toBe(false);
  });

  it("endereço não vazio é considerado configurado, independente do token", () => {
    expect(backendConfigurado({ enderecoBackend: "http://localhost:3001", tokenSessao: "" })).toBe(true);
  });
});
