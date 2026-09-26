/** Provedor OpenAI (ChatGPT) — formato confirmado via Context7 (/websites/developers_openai_api_reference):
 * POST https://api.openai.com/v1/chat/completions, header `Authorization: Bearer <chave>`,
 * corpo `{ model, messages: [{role, content}] }`. Resposta:
 * `choices[0].message.content` e `usage.{prompt_tokens,completion_tokens}`.
 *
 * Ver anthropic.ts sobre por que este arquivo usa `fetch` em vez de um SDK oficial.
 */

import type { DefinicaoProvedorIA, RespostaProvedorIA } from "../tipos";

const ENDPOINT_PADRAO = "https://api.openai.com/v1/chat/completions";

interface RespostaOpenAI {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

async function chamarOpenAI(
  prompt: string,
  opcoes: { modelo: string; apiKey?: string; baseUrl?: string; maxTokens?: number; sinal?: AbortSignal },
): Promise<RespostaProvedorIA> {
  if (!opcoes.apiKey) throw new Error("OpenAI: nenhuma chave de API configurada.");

  const resposta = await fetch(opcoes.baseUrl ?? ENDPOINT_PADRAO, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opcoes.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: opcoes.modelo,
      messages: [{ role: "user", content: prompt }],
      max_tokens: opcoes.maxTokens,
    }),
    signal: opcoes.sinal,
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new Error(`OpenAI retornou ${resposta.status}: ${corpo.slice(0, 300)}`);
  }

  const dados = (await resposta.json()) as RespostaOpenAI;
  const texto = dados.choices?.[0]?.message?.content ?? "";
  return {
    texto,
    tokensEntrada: dados.usage?.prompt_tokens,
    tokensSaida: dados.usage?.completion_tokens,
  };
}

export const provedorOpenAI: DefinicaoProvedorIA = {
  id: "openai",
  nome: "OpenAI (ChatGPT)",
  local: false,
  // Não confirmado via Context7 (a consulta ao catálogo de modelos atuais não retornou
  // resultado) — placeholder razoável, mas o dono do produto deve conferir/trocar na tela
  // de configuração contra o catálogo vigente da OpenAI antes de usar em produção.
  modeloPadrao: "gpt-4o-mini",
  chamar: chamarOpenAI,
};
