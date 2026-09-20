import type { TipoDocumento } from "../types";
import { chamarComRoteamento, type AvaliacaoQualidadeTexto } from "../ia/roteador";
import { registroProveniencia } from "../ia/proveniencia";

export interface ResultadoClassificacaoIA {
  tipo?: TipoDocumento;
  nomeContraparte?: string;
  confianca?: "alta" | "media" | "baixa";
  explicacao?: string;
  /** Proveniência da chamada que produziu este resultado — provedor, modelo e quando,
   * para responder "qual regra classificou este valor" com algo verificável em vez de
   * "a IA achou". Ausente quando nenhuma chamada de IA foi feita (heurística bastou). */
  provedor?: string;
  modelo?: string;
}

const TIPOS_VALIDOS: TipoDocumento[] = [
  "boleto",
  "contrato",
  "recibo",
  "fatura",
  "nota_fiscal",
  "pedido_comercial",
  "outro",
];

function montarPrompt(textoLimitado: string): string {
  return `Você é um especialista em classificação de documentos fiscais brasileiros.
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
}

/**
 * Classifica um documento usando o roteador multi-provedor de IA (src/domain/ia/) quando a
 * heurística determinística não consegue extrair tipo/fornecedor.
 *
 * Princípios preservados (não relaxar ao mexer aqui):
 * - Enviado para classificação: máximo 1000 caracteres do texto do documento (minimiza dados
 *   sensíveis expostos a terceiro).
 * - Nunca envia: CPF/CNPJ em separado, nomes completos além do necessário, saldos,
 *   transações — só o texto bruto (já truncado) do próprio documento.
 * - Sempre requer revisão manual do usuário antes de salvar (ver extrairCampos.ts e a
 *   triagem de importação — nenhum resultado daqui vira dado definitivo sozinho).
 *
 * `avaliacaoQualidade`, quando informada, decide se o roteador escalona direto para um
 * provedor pago (texto de OCR ruim) ou tenta primeiro o caminho barato (Ollama local) — ver
 * src/domain/ia/roteador.ts e qualidadeOcr.ts para o critério.
 */
export async function classificarDocumentoComIA(
  textoExtraido: string,
  apiKeyLegado?: string,
  avaliacaoQualidade?: AvaliacaoQualidadeTexto,
): Promise<ResultadoClassificacaoIA> {
  const textoLimitado = textoExtraido.slice(0, 1000);
  const prompt = montarPrompt(textoLimitado);

  try {
    // Compat: backend de classificação específico já suportado antes deste roteador existir
    // (contrato documentado em .env.example — recebe {texto}, devolve o resultado já
    // classificado). Preservado tal como estava: quem já tinha isso configurado continua
    // funcionando sem migrar para a tela de configuração de IA. É INDEPENDENTE do
    // `enderecoBackend` genérico do roteador (src/domain/ia/config.ts), que serve os 4
    // provedores com um contrato prompt-in/texto-out — este aqui é só para Anthropic/
    // classificação de documento, e continua tendo prioridade quando configurado.
    const endpointLegado = import.meta.env.VITE_CLASIFICACAO_BACKEND || "";
    if (endpointLegado) {
      const resposta = await fetch(endpointLegado, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: textoLimitado }),
      });
      if (!resposta.ok) throw new Error(`Backend de classificação retornou ${resposta.status}`);
      return (await resposta.json()) as ResultadoClassificacaoIA;
    }

    const resultado = await chamarComRoteamento(
      prompt,
      { avaliacaoQualidade },
      // `apiKeyLegado`, quando passado pelo chamador (compat com assinatura anterior),
      // injeta a chave só no provedor Anthropic — mantém quem já usava esta função com uma
      // chave direta funcionando sem precisar migrar para a tela de configuração.
      apiKeyLegado
        ? {
            config: {
              preferido: "anthropic",
              ordemRodizio: ["anthropic"],
              provedores: {
                anthropic: { ativo: true, modelo: "claude-haiku-4-5", apiKey: apiKeyLegado },
                openai: { ativo: false, modelo: "" },
                google: { ativo: false, modelo: "" },
                ollama: { ativo: false, modelo: "" },
              },
            },
          }
        : {},
    );

    const match = resultado.texto.match(/\{[\s\S]*\}/);
    if (!match) return {};

    const parseado = JSON.parse(match[0]) as ResultadoClassificacaoIA;
    if (parseado.tipo && !TIPOS_VALIDOS.includes(parseado.tipo)) {
      parseado.tipo = undefined;
    }
    // O roteador registrou a chamada (provedor, modelo, quando, tokens/custo) antes de saber
    // o resultado — só agora, com o JSON parseado, sabemos a confiança que o próprio modelo
    // reportou. Completa o mesmo registro em vez de criar um novo, para "qual regra
    // classificou este valor" apontar para uma única linha de proveniência por chamada.
    registroProveniencia.atualizarConfianca(resultado.registro.id, parseado.confianca);
    return { ...parseado, provedor: resultado.provedor, modelo: resultado.modelo };
  } catch (erro) {
    // Nunca deixa a UI travada por falha de IA: heurística determinística já rodou antes de
    // chegar aqui (ver extrairCampos.ts), então a ausência de sinal de IA só significa que o
    // formulário fica com menos campos pré-preenchidos — não impede o usuário de preencher
    // à mão e revisar, que é sempre exigido antes de salvar.
    console.error("classificarDocumentoComIA erro:", erro);
    return {};
  }
}
