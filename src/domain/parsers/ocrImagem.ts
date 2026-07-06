import { createWorker } from "tesseract.js";
import type { TransacaoBruta } from "./ofx";

/** Roda OCR (português) sobre uma foto de boleto ou comprovante PIX e retorna o texto bruto.
 * Cada chamada cria e destrói um worker — aceitável para o volume de "centenas de recibos"
 * processados aos poucos; para lotes grandes, reaproveite um worker entre chamadas. */
export async function ocrImagem(arquivo: File): Promise<string> {
  // worker e core rodam de assets locais (public/tesseract) — nenhum dado do usuário
  // sai do navegador. Só o pacote de idioma (por.traineddata) ainda vem de CDN na primeira
  // execução; depois fica em cache no navegador.
  const worker = await createWorker("por", 1, {
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract/tesseract-core-simd-lstm.wasm.js",
  });
  try {
    const {
      data: { text },
    } = await worker.recognize(arquivo);
    return text;
  } finally {
    await worker.terminate();
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
