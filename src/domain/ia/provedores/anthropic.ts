/** Provedor Anthropic (Claude) — formato de requisição confirmado na skill claude-api
 * (documentação oficial do provedor mantida atualizada pela própria Anthropic), não
 * inventado: POST https://api.anthropic.com/v1/messages, headers `x-api-key` +
 * `anthropic-version: 2023-06-01`, corpo `{ model, max_tokens, messages: [{role, content}] }`.
 * Resposta: `content[0].text` e `usage.{input_tokens,output_tokens}`.
 *
 * Usa `fetch` puro, não o SDK oficial (`@anthropic-ai/sdk`, já presente no package.json):
 * este arquivo implementa o mesmo contrato `DefinicaoProvedorIA` que openai.ts, gemini.ts e
 * ollama.ts — três provedores sem SDK oficial para navegador (Ollama não tem SDK; a OpenAI
 * e a própria Anthropic marcam suas SDKs como não pensadas para rodar direto no browser sem
 * a flag `dangerouslyAllowBrowser`). Manter os quatro em `fetch` uniforme evita depender de
 * flags "perigosas" espalhadas pelo código para um caminho que já é, por definição, o modo
 * inseguro (chamada direta do navegador — ver aviso em config.ts). O caminho recomendado em
 * produção (chamar via `enderecoBackend`) é onde o SDK oficial deveria de fato ser usado,
 * do lado do servidor — fora do escopo desta tarefa (server/**).
 */

import type { DefinicaoProvedorIA, RespostaProvedorIA } from "../tipos";

const ENDPOINT_PADRAO = "https://api.anthropic.com/v1/messages";

interface RespostaAnthropic {
  content: Array<{ type: string; text: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

async function chamarAnthropic(
  prompt: string,
  opcoes: { modelo: string; apiKey?: string; baseUrl?: string; maxTokens?: number; sinal?: AbortSignal },
): Promise<RespostaProvedorIA> {
  if (!opcoes.apiKey) throw new Error("Anthropic: nenhuma chave de API configurada.");

  const resposta = await fetch(opcoes.baseUrl ?? ENDPOINT_PADRAO, {
    method: "POST",
    headers: {
      "x-api-key": opcoes.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: opcoes.modelo,
      max_tokens: opcoes.maxTokens ?? 256,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: opcoes.sinal,
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new Error(`Anthropic retornou ${resposta.status}: ${corpo.slice(0, 300)}`);
  }

  const dados = (await resposta.json()) as RespostaAnthropic;
  const texto = dados.content?.[0]?.text ?? "";
  return {
    texto,
    tokensEntrada: dados.usage?.input_tokens,
    tokensSaida: dados.usage?.output_tokens,
  };
}

export const provedorAnthropic: DefinicaoProvedorIA = {
  id: "anthropic",
  nome: "Anthropic (Claude)",
  local: false,
  modeloPadrao: "claude-haiku-4-5",
  chamar: chamarAnthropic,
};
