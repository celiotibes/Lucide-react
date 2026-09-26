import { describe, expect, it } from "vitest";
import { CONFIGURACAO_PADRAO, obterChaveEfetiva } from "./config";
import type { ConfiguracaoIA } from "./config";

// Ambiente de teste é 'node' (vitest.config.ts) — sem `localStorage` global, então
// carregarConfiguracaoIA()/salvarConfiguracaoIA() sempre caem no catch e voltam ao padrão em
// memória (mesmo comportamento de um navegador com storage bloqueado). O que importa testar
// aqui, sem depender de localStorage, é a prioridade de resolução da chave — o ponto
// central do aviso de segurança do arquivo.

function config(apiKey?: string): ConfiguracaoIA {
  return {
    ...structuredClone(CONFIGURACAO_PADRAO),
    provedores: {
      ...structuredClone(CONFIGURACAO_PADRAO.provedores),
      anthropic: { ativo: true, modelo: "claude-haiku-4-5", apiKey },
    },
  };
}

describe("obterChaveEfetiva", () => {
  it("usa a chave configurada diretamente quando presente", () => {
    expect(obterChaveEfetiva(config("sk-direta"), "anthropic")).toBe("sk-direta");
  });

  it("sem chave direta e sem VITE_ANTHROPIC_API_KEY no ambiente, não inventa uma chave", () => {
    expect(obterChaveEfetiva(config(undefined), "anthropic")).toBeUndefined();
  });

  it("provedores sem chave configurada (ex: openai) retornam undefined, não lançam erro", () => {
    expect(obterChaveEfetiva(config(), "openai")).toBeUndefined();
  });
});
