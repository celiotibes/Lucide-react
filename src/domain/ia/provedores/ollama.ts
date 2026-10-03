/** Provedor Ollama (Llama local) — formato confirmado via Context7 (/websites/ollama_api):
 * POST {baseUrl}/api/chat, corpo `{ model, messages: [{role, content}], stream: false }`.
 * Resposta: `message.content`. Sem chave de API (servidor local) e sem `usage` em tokens
 * pagos equivalentes — Ollama reporta `prompt_eval_count`/`eval_count` (contagem de tokens,
 * não custo: é local e gratuito), que aqui viram tokensEntrada/tokensSaida só para
 * completude do registro de proveniência, nunca para estimativa de custo (ver
 * proveniencia.ts, que já trata "ollama" como sem preço por token).
 *
 * Ver anthropic.ts sobre por que este arquivo usa `fetch` em vez de um SDK — aqui vale ainda
 * mais: Ollama não tem SDK oficial de navegador.
 */

import type { DefinicaoProvedorIA, RespostaProvedorIA } from "../tipos";

const BASE_PADRAO = "http://localhost:11434";

interface RespostaOllama {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

async function chamarOllama(
  prompt: string,
  opcoes: { modelo: string; apiKey?: string; baseUrl?: string; maxTokens?: number; sinal?: AbortSignal },
): Promise<RespostaProvedorIA> {
  const base = opcoes.baseUrl ?? BASE_PADRAO;

  const resposta = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: opcoes.modelo,
      messages: [{ role: "user", content: prompt }],
      stream: false,
    }),
    signal: opcoes.sinal,
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new Error(`Ollama retornou ${resposta.status}: ${corpo.slice(0, 300)}`);
  }

  const dados = (await resposta.json()) as RespostaOllama;
  return {
    texto: dados.message?.content ?? "",
    tokensEntrada: dados.prompt_eval_count,
    tokensSaida: dados.eval_count,
  };
}

export const provedorOllama: DefinicaoProvedorIA = {
  id: "ollama",
  nome: "Ollama (Llama local)",
  local: true,
  modeloPadrao: "llama3.2",
  chamar: chamarOllama,
};
