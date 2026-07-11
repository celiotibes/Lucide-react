import { extrairTextoPdf } from "../parsers/pdfDocumento";
import { ocrImagem } from "../parsers/ocrImagem";
import { extrairCamposXmlNota, pareceSerXmlNota } from "./parseNFe";

const REGEX_VALOR = /(?:R\$\s?)?(\d{1,3}(?:\.\d{3})*,\d{2})/;
const REGEX_DATA = /(\d{2}\/\d{2}\/\d{4})/;
const REGEX_CNPJ = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/;
const REGEX_CPF = /(\d{3}\.\d{3}\.\d{3}-\d{2})/;

/** Extrai o texto bruto de um documento de suporte (contrato, recibo, fatura, nota fiscal,
 * pedido comercial, boleto) — PDF com camada de texto usa pdfjs-dist, imagem usa OCR local,
 * qualquer outro tipo cai para leitura de texto puro. Tudo roda no navegador. */
export async function extrairTextoDocumento(arquivo: File): Promise<string> {
  const nome = arquivo.name.toLowerCase();
  if (arquivo.type === "application/pdf" || nome.endsWith(".pdf")) {
    const linhas = await extrairTextoPdf(arquivo);
    return linhas.join("\n");
  }
  if (arquivo.type.startsWith("image/")) {
    return await ocrImagem(arquivo);
  }
  return await arquivo.text();
}

export interface CamposExtraidosDocumento {
  valor?: number;
  data?: string;
  cnpjCpf?: string;
  nomeContraparte?: string;
  descricaoProdutoServico?: string;
  numeroDocumento?: string;
}

/** Extração de valor, data, CNPJ/CPF (e, quando XML de nota fiscal, também nome da
 * contraparte, descrição do produto/serviço e número da nota) do texto do documento —
 * usada para sugerir automaticamente a que transação bancária o documento se refere (ver
 * matching.ts). XML de NF-e/NFS-e é extraído por tag (estruturado, mais confiável);
 * qualquer outro texto (PDF/OCR) cai para regex determinística. Não tenta reconhecer
 * produto/serviço em texto livre não estruturado; isso fica para o usuário preencher (ou,
 * opcionalmente, uma chave de IA própria — ver DocumentosView). */
export function extrairCamposDeTexto(texto: string): CamposExtraidosDocumento {
  if (pareceSerXmlNota(texto)) {
    const campos = extrairCamposXmlNota(texto);
    if (campos) return campos;
    // XML não reconhecido (layout de NFS-e não coberto) — cai para o regex genérico abaixo.
  }

  const valorCasado = texto.match(REGEX_VALOR);
  const dataCasada = texto.match(REGEX_DATA);
  const cnpjCasado = texto.match(REGEX_CNPJ);
  const cpfCasado = texto.match(REGEX_CPF);

  const valor = valorCasado ? Number.parseFloat(valorCasado[1].replace(/\./g, "").replace(",", ".")) : undefined;
  const data = dataCasada ? `${dataCasada[1].split("/")[2]}-${dataCasada[1].split("/")[1]}-${dataCasada[1].split("/")[0]}` : undefined;
  const cnpjCpf = cnpjCasado?.[1] ?? cpfCasado?.[1];

  return { valor, data, cnpjCpf };
}
