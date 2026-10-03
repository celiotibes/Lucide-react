import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chamarComRoteamento, reiniciarRodizioIA } from "./roteador";
import { avaliarQualidadeTexto } from "./qualidadeOcr";
import { registroProveniencia } from "./proveniencia";
import { CONFIGURACAO_PADRAO } from "./config";
import type { ConfiguracaoIA } from "./config";
import type { DefinicaoProvedorIA } from "./tipos";

// Provedores nunca são chamados de verdade nestes testes — cada um é um `vi.fn()` injetado
// via `opcoes.provedores`, exatamente o mecanismo que roteador.ts documenta para teste.
function provedorFalso(
  id: DefinicaoProvedorIA["id"],
  local: boolean,
  chamar: DefinicaoProvedorIA["chamar"],
): DefinicaoProvedorIA {
  return { id, nome: id, local, modeloPadrao: `modelo-${id}`, chamar };
}

function configBase(overrides: Partial<ConfiguracaoIA> = {}): ConfiguracaoIA {
  return {
    ...structuredClone(CONFIGURACAO_PADRAO),
    ordemRodizio: ["anthropic", "openai"],
    provedores: {
      anthropic: { ativo: true, modelo: "modelo-anthropic", apiKey: "chave-anthropic" },
      openai: { ativo: true, modelo: "modelo-openai", apiKey: "chave-openai" },
      google: { ativo: false, modelo: "modelo-google" },
      ollama: { ativo: false, modelo: "modelo-ollama" },
    },
    ...overrides,
  };
}

beforeEach(() => {
  reiniciarRodizioIA();
  registroProveniencia.limpar();
});

describe("escalonamento por qualidade (o critério central do roteador)", () => {
  it("qualidade BOA: tenta o caminho barato local (Ollama) e nunca chama provedor pago", async () => {
    const chamarOllama = vi.fn().mockResolvedValue({ texto: '{"tipo":"boleto"}' });
    const chamarAnthropic = vi.fn().mockResolvedValue({ texto: '{"tipo":"outro"}' });

    const config = configBase({ provedores: { ...configBase().provedores, ollama: { ativo: true, modelo: "llama3.2" } } });
    const avaliacao = avaliarQualidadeTexto("CEDENTE: EMPRESA LTDA\nValor: R$ 100,00\n01/01/2026");
    expect(avaliacao.ruim).toBe(false); // pré-condição do teste

    const resultado = await chamarComRoteamento(
      "prompt qualquer",
      { avaliacaoQualidade: avaliacao },
      {
        config,
        provedores: {
          ollama: provedorFalso("ollama", true, chamarOllama),
          anthropic: provedorFalso("anthropic", false, chamarAnthropic),
        },
      },
    );

    expect(chamarOllama).toHaveBeenCalledTimes(1);
    expect(chamarAnthropic).not.toHaveBeenCalled();
    expect(resultado.provedor).toBe("ollama");
  });

  it("qualidade RUIM: pula o caminho local e escalona direto para o provedor pago", async () => {
    const chamarOllama = vi.fn().mockResolvedValue({ texto: '{"tipo":"boleto"}' });
    const chamarAnthropic = vi.fn().mockResolvedValue({ texto: '{"tipo":"boleto"}' });

    const config = configBase({ provedores: { ...configBase().provedores, ollama: { ativo: true, modelo: "llama3.2" } } });
    // Texto sem nenhum padrão de data/valor/CNPJ e nada mais — reprovado pelo critério de
    // qualidade (ver qualidadeOcr.ts).
    const avaliacao = avaliarQualidadeTexto("Prezado cliente, segue o documento em anexo para conferência geral.");
    expect(avaliacao.ruim).toBe(true); // pré-condição do teste

    const resultado = await chamarComRoteamento(
      "prompt qualquer",
      { avaliacaoQualidade: avaliacao },
      {
        config,
        provedores: {
          ollama: provedorFalso("ollama", true, chamarOllama),
          anthropic: provedorFalso("anthropic", false, chamarAnthropic),
        },
      },
    );

    expect(chamarOllama).not.toHaveBeenCalled();
    expect(chamarAnthropic).toHaveBeenCalledTimes(1);
    expect(resultado.provedor).toBe("anthropic");

    const registros = registroProveniencia.listar();
    expect(registros).toHaveLength(1);
    expect(registros[0].motivo).toMatch(/^escalonado_por_qualidade_baixa:/);
  });
});

describe("fallback automático entre provedores pagos", () => {
  it("quando o primeiro provedor falha (cota/429/rede), tenta o próximo da ordem de rodízio", async () => {
    const chamarAnthropic = vi.fn().mockRejectedValue(new Error("429 rate limit exceeded"));
    const chamarOpenAI = vi.fn().mockResolvedValue({ texto: '{"tipo":"recibo"}', tokensEntrada: 100, tokensSaida: 20 });

    const config = configBase();
    const resultado = await chamarComRoteamento(
      "prompt qualquer",
      {},
      {
        config,
        provedores: {
          anthropic: provedorFalso("anthropic", false, chamarAnthropic),
          openai: provedorFalso("openai", false, chamarOpenAI),
        },
      },
    );

    expect(chamarAnthropic).toHaveBeenCalledTimes(1);
    expect(chamarOpenAI).toHaveBeenCalledTimes(1);
    expect(resultado.provedor).toBe("openai");
    expect(resultado.texto).toBe('{"tipo":"recibo"}');

    const registros = registroProveniencia.listar();
    expect(registros).toHaveLength(2);
    expect(registros[0]).toMatchObject({ provedor: "anthropic", sucesso: false });
    expect(registros[0].erro).toMatch(/429/);
    expect(registros[1]).toMatchObject({ provedor: "openai", sucesso: true, motivo: "fallback_apos_falha:anthropic" });
  });

  it("quando todos os provedores falham, lança erro claro (nunca retorna resultado vazio em silêncio)", async () => {
    const chamarAnthropic = vi.fn().mockRejectedValue(new Error("429 rate limit exceeded"));
    const chamarOpenAI = vi.fn().mockRejectedValue(new Error("network error"));

    const config = configBase();

    await expect(
      chamarComRoteamento(
        "prompt qualquer",
        {},
        {
          config,
          provedores: {
            anthropic: provedorFalso("anthropic", false, chamarAnthropic),
            openai: provedorFalso("openai", false, chamarOpenAI),
          },
        },
      ),
    ).rejects.toThrow(/anthropic.*429.*openai.*network error/s);

    expect(registroProveniencia.listar()).toHaveLength(2);
    expect(registroProveniencia.listar().every((r) => !r.sucesso)).toBe(true);
  });

  it("sem nenhum provedor ativo, lança erro claro em vez de silêncio", async () => {
    const config = configBase({
      provedores: {
        anthropic: { ativo: false, modelo: "x" },
        openai: { ativo: false, modelo: "x" },
        google: { ativo: false, modelo: "x" },
        ollama: { ativo: false, modelo: "x" },
      },
    });

    await expect(chamarComRoteamento("prompt", {}, { config })).rejects.toThrow(/nenhum provedor/i);
  });
});

describe("enderecoBackend (caminho seguro recomendado)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("quando configurado, chama o backend em vez do provedor direto e nunca usa a chave do navegador", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ texto: '{"tipo":"boleto"}', tokensEntrada: 10, tokensSaida: 2 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const chamarAnthropicDireto = vi.fn(); // não deve ser chamado — a chamada deveria ir pro backend
    const config = configBase({ ordemRodizio: ["anthropic"], enderecoBackend: "https://meu-backend.exemplo/api/ia" });

    const resultado = await chamarComRoteamento(
      "prompt",
      {},
      { config, provedores: { anthropic: provedorFalso("anthropic", false, chamarAnthropicDireto) } },
    );

    expect(chamarAnthropicDireto).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://meu-backend.exemplo/api/ia");
    const corpo = JSON.parse(init.body);
    expect(corpo).toEqual({ provedor: "anthropic", modelo: "modelo-anthropic", prompt: "prompt" });
    expect(resultado.texto).toBe('{"tipo":"boleto"}');
  });
});

describe("registro de proveniência", () => {
  it("registra provedor, modelo, quando, tokens e custo estimado de uma chamada bem-sucedida", async () => {
    const chamarAnthropic = vi.fn().mockResolvedValue({ texto: "ok", tokensEntrada: 500, tokensSaida: 50 });
    const config = configBase({ ordemRodizio: ["anthropic"] });

    const antes = Date.now();
    const resultado = await chamarComRoteamento(
      "prompt",
      {},
      { config, provedores: { anthropic: provedorFalso("anthropic", false, chamarAnthropic) } },
    );

    const registro = resultado.registro;
    expect(registro.provedor).toBe("anthropic");
    expect(registro.modelo).toBe("modelo-anthropic");
    expect(new Date(registro.quando).getTime()).toBeGreaterThanOrEqual(antes);
    expect(registro.tokensEntrada).toBe(500);
    expect(registro.tokensSaida).toBe(50);
    // preço configurado para anthropic em proveniencia.ts: entrada 1.0, saída 5.0 (USD/1M tokens)
    expect(registro.custoEstimadoUsd).toBeCloseTo((500 * 1.0 + 50 * 5.0) / 1_000_000, 10);
    expect(registro.sucesso).toBe(true);
    expect(registro.confianca).toBeUndefined(); // o roteador não conhece "confiança" — é a camada de classificação que completa isso
  });

  it("distribui as chamadas entre provedores ativos a cada chamada de nível superior (rodízio)", async () => {
    const chamarAnthropic = vi.fn().mockResolvedValue({ texto: "a" });
    const chamarOpenAI = vi.fn().mockResolvedValue({ texto: "b" });
    const config = configBase();
    const provedores = {
      anthropic: provedorFalso("anthropic", false, chamarAnthropic),
      openai: provedorFalso("openai", false, chamarOpenAI),
    };

    const r1 = await chamarComRoteamento("p1", {}, { config, provedores });
    const r2 = await chamarComRoteamento("p2", {}, { config, provedores });

    expect(r1.provedor).toBe("anthropic");
    expect(r2.provedor).toBe("openai");
  });
});
