import { extrairTextoPdf } from "../parsers/pdfDocumento";
import { ocrImagem } from "../parsers/ocrImagem";
import { extrairCamposXmlNota, pareceSerXmlNota } from "./parseNFe";
import { classificarDocumentoComIA } from "./classificarComIA";
import { avaliarQualidadeTexto } from "../ia/qualidadeOcr";
import type { TipoDocumento } from "../types";

const REGEX_VALOR = /(?:R\$\s?)?(\d{1,3}(?:\.\d{3})*,\d{2})/;
const REGEX_DATA = /(\d{2}\/\d{2}\/\d{4})/;
const REGEX_CNPJ = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/;
const REGEX_CPF = /(\d{3}\.\d{3}\.\d{3}-\d{2})/;
const REGEX_LINHA_DIGITAVEL = /\d{5}\.\d{5}\s?\d{5}\.\d{6}\s?\d{5}\.\d{6}\s?\d\s?\d{14}/;

// Rótulos comuns em boletos/faturas brasileiros que antecedem o nome da contraparte —
// heurística determinística (sem IA), captura o texto até o fim da linha. Nunca é a única
// fonte: sempre revisável/editável no formulário antes de salvar, igual a valor/data/CNPJ.
const REGEX_ROTULO_CONTRAPARTE = /(?:CEDENTE|BENEFICI[ÁA]RIO|RAZ[ÃA]O SOCIAL|FAVORECIDO|EMITENTE|PRESTADORA? DE SERVI[ÇC]OS?)\s*[:-]?\s*([^\n\r]{4,80})/i;

function limparNomeContraparte(bruto: string): string {
  return bruto
    .replace(/\s*(?:CNPJ|CPF)[\s:./-]*[\d.\-/]*$/i, "") // corta se CNPJ/CPF vier colado no fim da mesma linha
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Nome da contraparte a partir de rótulos comuns (CEDENTE, BENEFICIÁRIO...) ou, na
 * ausência deles, do texto que antecede o CNPJ/CPF na mesma linha (layout comum: "EMPRESA
 * LTDA   CNPJ: 00.000.000/0001-00"). Heurística — pode errar ou vir vazia; sempre editável. */
function extrairNomeContraparte(texto: string, cnpjCpf: string | undefined): string | undefined {
  const porRotulo = texto.match(REGEX_ROTULO_CONTRAPARTE);
  if (porRotulo) {
    const nome = limparNomeContraparte(porRotulo[1]);
    if (nome.length >= 4) return nome;
  }
  if (!cnpjCpf) return undefined;
  const linhaComDocumento = texto.split(/\r?\n/).find((l) => l.includes(cnpjCpf));
  if (!linhaComDocumento) return undefined;
  const antes = limparNomeContraparte(linhaComDocumento.split(cnpjCpf)[0]);
  return antes.length >= 4 && /[A-Za-zÀ-ú]/.test(antes) ? antes : undefined;
}

/** Classifica o tipo do documento por palavras-chave no texto extraído — só retorna um tipo
 * quando há um sinal razoavelmente inequívoco; caso contrário fica indefinido (o formulário
 * mantém "outro", nunca um palpite sem base). NF-e/NFS-e em XML já tem caminho próprio
 * (parseNFe.ts, por tag) — esta heurística cobre o que chega como PDF/OCR de texto livre. */
function classificarTipoPorTexto(texto: string): TipoDocumento | undefined {
  if (REGEX_LINHA_DIGITAVEL.test(texto) || /LINHA DIGIT[ÁA]VEL/i.test(texto)) return "boleto";
  if (/CONTRATO\s+DE\s+LOCA[ÇC][ÃA]O/i.test(texto) || (/LOCAT[ÁA]RIO/i.test(texto) && /LOCADOR/i.test(texto))) return "contrato";
  if (/^\s*RECIBO\b/im.test(texto)) return "recibo";
  if (/\bFATURA\b/i.test(texto)) return "fatura";
  if (/PEDIDO\s+(DE\s+)?COMPRA|OR[ÇC]AMENTO/i.test(texto)) return "pedido_comercial";
  return undefined;
}

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
  tipo?: TipoDocumento;
  usouIA?: boolean;
  confiancaIA?: "alta" | "media" | "baixa";
  /** Proveniência de qual chamada de IA (se houve) produziu tipo/nomeContraparte — ver
   * classificarComIA.ts e src/domain/ia/proveniencia.ts. Ausente quando a heurística
   * determinística bastou (nenhuma IA foi chamada). */
  provedorIA?: string;
  modeloIA?: string;
}

/** Extração de valor, data, CNPJ/CPF, nome da contraparte e tipo do documento do texto —
 * usada para sugerir automaticamente a que transação bancária o documento se refere (ver
 * matching.ts) e para pré-preencher o formulário de revisão. XML de NF-e/NFS-e é extraído
 * por tag (estruturado, mais confiável); qualquer outro texto (PDF/OCR) cai para regex
 * determinística — nome da contraparte e tipo são heurísticas por rótulo/palavra-chave
 * comuns em boleto/contrato/recibo/fatura brasileiros, sempre revisáveis no formulário antes
 * de salvar (nunca aplicadas sem confirmação). Se heurística falha (tipo e nomeContraparte
 * ambos undefined), tenta IA como fallback (requer apiKey ou backend configurado). Nunca envia
 * dados sensíveis completos — apenas máx 1000 caracteres do documento (minimiza risco).
 *
 * Antes de chamar IA, avalia a qualidade do próprio texto (ver src/domain/ia/qualidadeOcr.ts)
 * — é esse critério, não o texto em si, que decide se o roteador de IA (src/domain/ia/roteador.ts)
 * escalona direto para um provedor pago ou tenta primeiro um modelo local (Ollama). */
export async function extrairCamposDeTexto(texto: string, apiKeyIA?: string): Promise<CamposExtraidosDocumento> {
  if (pareceSerXmlNota(texto)) {
    const campos = extrairCamposXmlNota(texto);
    if (campos) return { ...campos, tipo: "nota_fiscal" };
    // XML não reconhecido (layout de NFS-e não coberto) — cai para o regex genérico abaixo.
  }

  const valorCasado = texto.match(REGEX_VALOR);
  const dataCasada = texto.match(REGEX_DATA);
  const cnpjCasado = texto.match(REGEX_CNPJ);
  const cpfCasado = texto.match(REGEX_CPF);

  const valor = valorCasado ? Number.parseFloat(valorCasado[1].replace(/\./g, "").replace(",", ".")) : undefined;
  const data = dataCasada ? `${dataCasada[1].split("/")[2]}-${dataCasada[1].split("/")[1]}-${dataCasada[1].split("/")[0]}` : undefined;
  const cnpjCpf = cnpjCasado?.[1] ?? cpfCasado?.[1];
  const nomeContraparte = extrairNomeContraparte(texto, cnpjCpf);
  const tipo = classificarTipoPorTexto(texto);

  // Fallback para IA se heurística não conseguiu extrair tipo e/ou fornecedor
  if (!tipo || !nomeContraparte) {
    const avaliacaoQualidade = avaliarQualidadeTexto(texto);
    const resultadoIA = await classificarDocumentoComIA(texto, apiKeyIA, avaliacaoQualidade);
    return {
      valor,
      data,
      cnpjCpf,
      nomeContraparte: nomeContraparte || resultadoIA.nomeContraparte,
      tipo: tipo || resultadoIA.tipo,
      usouIA: !!(resultadoIA.tipo || resultadoIA.nomeContraparte),
      confiancaIA: resultadoIA.confianca,
      provedorIA: resultadoIA.provedor,
      modeloIA: resultadoIA.modelo,
    };
  }

  return { valor, data, cnpjCpf, nomeContraparte, tipo };
}
