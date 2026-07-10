import type { TransacaoBruta } from "./ofx";

const TIMEOUT_OCR_MS = 30000;

/** tesseract.js pode travar (nunca resolver nem rejeitar) quando o worker interno falha
 * de um jeito que não vira uma rejeição de Promise normal — visto na prática quando o
 * download do pacote de idioma (CDN, só no primeiro uso) falha por rede indisponível.
 * Sem isso, a UI ficaria presa em "Extraindo texto…" para sempre em vez de mostrar erro. */
function comTimeout<T>(promessa: Promise<T>, ms: number, mensagemErro: string): Promise<T> {
  return Promise.race([
    promessa,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(mensagemErro)), ms)),
  ]);
}

/** Roda OCR (português) sobre uma foto de boleto ou comprovante PIX e retorna o texto bruto.
 * Cada chamada cria e destrói um worker — aceitável para o volume de "centenas de recibos"
 * processados aos poucos; para lotes grandes, reaproveite um worker entre chamadas.
 * tesseract.js só é importado quando uma imagem é de fato enviada — import() dinâmico tira
 * o pacote inteiro (worker + núcleo WASM) do bundle inicial da aplicação. */
export async function ocrImagem(arquivo: File): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  // worker e core rodam de assets locais (public/tesseract) — nenhum dado do usuário sai do
  // navegador. Só o pacote de idioma (por.traineddata) ainda vem de CDN na primeira execução
  // (depois fica em cache) — createWorker já baixa isso durante a inicialização, então o
  // timeout precisa cobrir a criação do worker, não só o reconhecimento em si.
  const worker = await comTimeout(
    createWorker("por", 1, { workerPath: "/tesseract/worker.min.js", corePath: "/tesseract/tesseract-core-simd-lstm.wasm.js" }),
    TIMEOUT_OCR_MS,
    "OCR não conseguiu inicializar a tempo — confira sua conexão (o pacote de idioma português é baixado de uma CDN pública no primeiro uso) e tente novamente.",
  );
  try {
    const {
      data: { text },
    } = await comTimeout(worker.recognize(arquivo), TIMEOUT_OCR_MS, "OCR não respondeu a tempo — tente novamente.");
    worker.terminate().catch(() => {});
    return text;
  } catch (erro) {
    // Não espera terminate() responder: se o worker travou (ex: falha de rede durante o
    // download do pacote de idioma), terminate() pode nunca resolver também — melhor vazar
    // um worker morto do que travar a UI de novo dentro do próprio tratamento de erro.
    worker.terminate().catch(() => {});
    throw erro;
  }
}

const REGEX_VALOR = /(?:R\$\s?)?(\d{1,3}(?:\.\d{3})*,\d{2})/;
const REGEX_DATA = /(\d{2}\/\d{2}\/\d{4})/;
const REGEX_LINHA_DIGITAVEL = /(\d{5}\.\d{5}\s?\d{5}\.\d{6}\s?\d{5}\.\d{6}\s?\d\s?\d{14})/;

export interface ComprovanteExtraido {
  valor?: number;
  data?: string;
  linhaDigitavel?: string;
  textoOriginal: string;
}

/** Extrai valor, data e (quando boleto) linha digitável do texto OCR de um comprovante. */
export function extrairCamposComprovante(textoOcr: string): ComprovanteExtraido {
  const valorCasado = textoOcr.match(REGEX_VALOR);
  const dataCasada = textoOcr.match(REGEX_DATA);
  const linhaCasada = textoOcr.match(REGEX_LINHA_DIGITAVEL);

  const valor = valorCasado ? parseFloat(valorCasado[1].replace(/\./g, "").replace(",", ".")) : undefined;
  const data = dataCasada
    ? `${dataCasada[1].split("/")[2]}-${dataCasada[1].split("/")[1]}-${dataCasada[1].split("/")[0]}`
    : undefined;

  return {
    valor,
    data,
    linhaDigitavel: linhaCasada?.[1]?.replace(/\s/g, ""),
    textoOriginal: textoOcr,
  };
}

/** Converte um comprovante OCR em uma transação bruta, pronta para revisão manual
 * antes de entrar na base — OCR de foto tem taxa de erro real, então o valor
 * de `documentoFonte` (a própria imagem) deve ficar sempre acessível para conferência. */
export function comprovanteParaTransacao(extraido: ComprovanteExtraido, valorNegativo = true): TransacaoBruta | null {
  if (extraido.valor === undefined || extraido.data === undefined) return null;
  const valor = valorNegativo ? -Math.abs(extraido.valor) : Math.abs(extraido.valor);
  const descricaoOriginal = extraido.linhaDigitavel
    ? `Boleto ${extraido.linhaDigitavel}`
    : `Comprovante OCR: ${extraido.textoOriginal.slice(0, 60).replace(/\s+/g, " ")}`;
  return {
    data: extraido.data,
    valor,
    descricaoOriginal,
    fitid: `ocr|${extraido.data}|${valor}|${extraido.linhaDigitavel ?? extraido.textoOriginal.length}`,
  };
}
