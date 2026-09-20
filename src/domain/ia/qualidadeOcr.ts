/** Critério objetivo de "OCR/texto ruim" — a decisão central deste módulo.
 *
 * A extração de documento (extrairCampos.ts) já roda o caminho barato antes de cogitar IA:
 * OCR local (tesseract.js, ver ocrImagem.ts) ou texto de PDF/arquivo puro. A pergunta que
 * este arquivo responde é: "esse texto está bom o suficiente para confiar na extração por
 * regex, ou vale a pena pagar por um modelo melhor para tentar entender o que o OCR
 * embaralhou?".
 *
 * CRITÉRIO ESCOLHIDO E POR QUÊ — três sinais, todos calculados só a partir do texto (sem
 * depender de tesseract.js expor sua própria confiança interna):
 *
 *   1. Tamanho útil mínimo: texto vazio ou quase vazio (< TAMANHO_MINIMO_UTIL caracteres
 *      após trim) indica falha total do OCR (imagem ilegível, worker travou parcialmente) —
 *      não há o que avaliar além disso, então já é reprovado sozinho.
 *
 *   2. Proporção de caracteres fora do alfabeto esperado de um documento financeiro
 *      brasileiro (letras com acentuação, dígitos, pontuação comum, R$/%/()). OCR malsucedido
 *      tipicamente produz ruído visualmente identificável: símbolos soltos, caracteres de
 *      controle, glifos que o motor não conseguiu mapear. Uma proporção alta desses
 *      caracteres é um sinal direto e barato de imagem mal reconhecida.
 *
 *   3. Ausência de qualquer padrão que um documento financeiro deveria conter — data
 *      (DD/MM/AAAA), valor monetário (R$ 000,00) ou CNPJ/CPF. Este é o critério mais
 *      relevante dos três porque é o MESMO tipo de padrão que extrairCamposDeTexto() tenta
 *      casar por regex logo em seguida: se nenhum desses padrões sobrevive no texto, a
 *      extração determinística vai falhar de qualquer forma, e é exatamente aí que faz
 *      sentido escalar para um modelo mais capaz (que pode entender o documento mesmo com
 *      ruído) em vez de insistir em regex sobre texto comprovadamente degradado.
 *
 * Por que não usar a confiança média que o próprio tesseract.js reporta (a alternativa mais
 * óbvia, e citada como critério válido pelo pedido): ocrImagem.ts (src/domain/parsers/) só
 * retorna `data.text`, descartando `data.confidence` — e este módulo está fora do escopo de
 * arquivos que esta tarefa pode editar (ocrImagem.ts não está na lista de arquivos
 * permitidos). Expor a confiança do tesseract exigiria mudar a assinatura de retorno de
 * ocrImagem() e do call site em extrairTextoDocumento(), o que pertence a outra frente de
 * trabalho. Os três critérios acima, calculados só do texto, têm a vantagem adicional de
 * também se aplicarem a texto vindo de PDF ou arquivo puro (que não passam por tesseract e
 * portanto não teriam confiança nenhuma para reportar) — cobrindo todo `extrairTextoDocumento`
 * com um único critério, não só o caminho de imagem.
 */

const TAMANHO_MINIMO_UTIL = 15;

// >12% de caracteres fora do alfabeto esperado é o limiar escolhido: abaixo disso é normal
// (nome próprio com apóstrofo, um caractere OCR errou por linha em texto longo); acima,
// passa a ser mais ruído do que sinal. Ajustável — não há verdade absoluta aqui, é uma
// linha de corte prática; documentar a intenção importa mais que o número exato.
const LIMIAR_PROPORCAO_RUIDO = 0.12;

const ALFABETO_ESPERADO = /[a-zA-ZÀ-ÖØ-öø-ÿ0-9\s.,;:/\-R$%()'"°ºª\n\r]/;

const REGEX_DATA = /\d{2}\/\d{2}\/\d{2,4}/;
const REGEX_VALOR = /(?:R\$\s?)?\d{1,3}(?:\.\d{3})*,\d{2}/;
const REGEX_CNPJ_CPF = /\d{2,3}\.\d{3}\.\d{3}[/-]?\d{0,4}-?\d{0,2}/;

export interface AvaliacaoQualidadeTexto {
  /** 0 (péssimo) a 1 (ótimo) — usado só para exibição/ordenação; a decisão de escalonar usa
   * o campo `ruim`, não um limiar arbitrário sobre a pontuação. */
  pontuacao: number;
  ruim: boolean;
  /** Explicação legível de cada critério que reprovou o texto — é o que permite responder
   * "por que escalou para IA paga" em vez de só "a qualidade estava baixa". */
  motivos: string[];
  proporcaoCaracteresRuido: number;
  encontrouPadraoEsperado: boolean;
}

export function avaliarQualidadeTexto(texto: string): AvaliacaoQualidadeTexto {
  const limpo = (texto ?? "").trim();
  const motivos: string[] = [];

  if (limpo.length < TAMANHO_MINIMO_UTIL) {
    motivos.push(
      `Texto extraído tem só ${limpo.length} caractere(s) úteis — curto demais para qualquer extração confiável (mínimo considerado: ${TAMANHO_MINIMO_UTIL}).`,
    );
    return {
      pontuacao: 0,
      ruim: true,
      motivos,
      proporcaoCaracteresRuido: limpo.length === 0 ? 1 : 0,
      encontrouPadraoEsperado: false,
    };
  }

  const semEspacos = limpo.replace(/\s/g, "");
  const caracteresRuido = [...semEspacos].filter((c) => !ALFABETO_ESPERADO.test(c)).length;
  const proporcaoCaracteresRuido = semEspacos.length > 0 ? caracteresRuido / semEspacos.length : 0;

  const encontrouPadraoEsperado =
    REGEX_DATA.test(limpo) || REGEX_VALOR.test(limpo) || REGEX_CNPJ_CPF.test(limpo);

  if (proporcaoCaracteresRuido > LIMIAR_PROPORCAO_RUIDO) {
    motivos.push(
      `${(proporcaoCaracteresRuido * 100).toFixed(0)}% dos caracteres estão fora do alfabeto esperado de um documento em português (letras, dígitos, pontuação comum) — típico de OCR malsucedido.`,
    );
  }
  if (!encontrouPadraoEsperado) {
    motivos.push(
      "Nenhum padrão de data, valor monetário ou CNPJ/CPF foi reconhecido no texto — um documento financeiro deveria conter ao menos um.",
    );
  }

  const ruim = proporcaoCaracteresRuido > LIMIAR_PROPORCAO_RUIDO || !encontrouPadraoEsperado;
  const pontuacaoBruta = 1 - proporcaoCaracteresRuido * 2 - (encontrouPadraoEsperado ? 0 : 0.5);
  const pontuacao = Math.max(0, Math.min(1, pontuacaoBruta));

  return { pontuacao, ruim, motivos, proporcaoCaracteresRuido, encontrouPadraoEsperado };
}
