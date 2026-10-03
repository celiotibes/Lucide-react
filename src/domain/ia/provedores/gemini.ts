/** Provedor Google (Gemini) — formato confirmado via Context7 (/websites/ai_google_dev_api):
 * POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent,
 * header `x-goog-api-key: <chave>`, corpo `{ contents: [{ parts: [{ text }] }] }`. Resposta:
 * `candidates[0].content.parts[0].text` e `usageMetadata.{promptTokenCount,candidatesTokenCount}`.
 *
 * Ver anthropic.ts sobre por que este arquivo usa `fetch` em vez de um SDK oficial.
 */

import type { DefinicaoProvedorIA, RespostaProvedorIA } from "../tipos";

const BASE_PADRAO = "https://generativelanguage.googleapis.com/v1beta/models";

interface RespostaGemini {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

async function chamarGemini(
  prompt: string,
  opcoes: { modelo: string; apiKey?: string; baseUrl?: string; maxTokens?: number; sinal?: AbortSignal },
): Promise<RespostaProvedorIA> {
  if (!opcoes.apiKey) throw new Error("Gemini: nenhuma chave de API configurada.");

  const base = opcoes.baseUrl ?? BASE_PADRAO;
  const url = `${base}/${opcoes.modelo}:generateContent`;

  const resposta = await fetch(url, {
    method: "POST",
    headers: {
      "x-goog-api-key": opcoes.apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      ...(opcoes.maxTokens ? { generationConfig: { maxOutputTokens: opcoes.maxTokens } } : {}),
    }),
    signal: opcoes.sinal,
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new Error(`Gemini retornou ${resposta.status}: ${corpo.slice(0, 300)}`);
  }

  const dados = (await resposta.json()) as RespostaGemini;
  const texto = dados.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return {
    texto,
    tokensEntrada: dados.usageMetadata?.promptTokenCount,
    tokensSaida: dados.usageMetadata?.candidatesTokenCount,
  };
}

export const provedorGemini: DefinicaoProvedorIA = {
  id: "google",
  nome: "Google (Gemini)",
  local: false,
  modeloPadrao: "gemini-2.5-flash",
  chamar: chamarGemini,
};
