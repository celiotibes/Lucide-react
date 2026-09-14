import type { TipoDocumento } from "../types";

export interface ResultadoClassificacaoIA {
  tipo?: TipoDocumento;
  nomeContraparte?: string;
  confianca?: "alta" | "media" | "baixa";
  explicacao?: string;
}

/**
 * Classifica um documento usando Claude API quando a heurística não consegue extrair tipo/fornecedor.
 * Enviado para classificação: máximo 1000 caracteres do texto do documento (minimiza dados sensíveis).
 * Nunca envia: CPF/CNPJ em separado, nomes completos além do necessário, saldos, transações.
 * Retorna {tipo?, nomeContraparte?, confianca?, explicacao?} — undefined = sem sinal claro.
 * Sempre requer revisão manual do usuário antes de salvar.
 */
export async function classificarDocumentoComIA(
  textoExtraido: string,
  apiKey?: string,
): Promise<ResultadoClassificacaoIA> {
  const textoLimitado = textoExtraido.slice(0, 1000);

  const prompt = `Você é um especialista em classificação de documentos fiscais brasileiros.
Analize o seguinte texto de documento e extraia APENAS se houver sinais claros:
- Tipo do documento: deve ser um de: boleto, contrato, recibo, fatura, nota_fiscal, pedido_comercial, outro
- Nome da contraparte (empresa ou pessoa que emitiu/recebe o documento)

Retorne um objeto JSON simples:
{
  "tipo": "<tipo ou null se não há sinal claro>",
  "nomeContraparte": "<nome ou null se não há sinal claro>",
  "confianca": "<alta|media|baixa>",
  "explicacao": "<breve razão da classificação>"
}

IMPORTANTE:
- Nunca adivinhe. Se não houver sinal claro, retorne null.
- Confiança alta: sinais inequívocos (ex: "LINHA DIGITÁVEL" para boleto).
- Confiança média: heurísticas razoáveis mas não 100% certas.
- Confiança baixa: pista fraca ou ambígua.

Texto do documento:
${textoLimitado}`;

  try {
    // Tenta usar backend endpoint se disponível
    const endpoint = import.meta.env.VITE_CLASIFICACAO_BACKEND || "";
    if (endpoint) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: textoLimitado }),
      });

      if (!response.ok) throw new Error(`Backend retornou ${response.status}`);
      const resultado = (await response.json()) as ResultadoClassificacaoIA;
      return resultado;
    }

    // Fallback: tenta usar API key local (apenas desenvolvimento/demo)
    const chave = apiKey || import.meta.env.VITE_ANTHROPIC_API_KEY || "";
    if (!chave) {
      console.warn("IA: sem backend nem API key configurada. Retornando resultado vazio.");
      return {};
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": chave,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("IA API erro:", response.status, err);
      return {};
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    const texto = data.content[0]?.text || "{}";

    // Parse JSON response
    const match = texto.match(/\{[\s\S]*\}/);
    if (!match) return {};

    const resultado = JSON.parse(match[0]) as ResultadoClassificacaoIA;

    // Valida tipo se presente
    if (
      resultado.tipo &&
      ![
        "boleto",
        "contrato",
        "recibo",
        "fatura",
        "nota_fiscal",
        "pedido_comercial",
        "outro",
      ].includes(resultado.tipo)
    ) {
      resultado.tipo = undefined;
    }

    return resultado;
  } catch (erro) {
    console.error("classificarDocumentoComIA erro:", erro);
    return {};
  }
}
