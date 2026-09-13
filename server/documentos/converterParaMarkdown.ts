// Converte o conteúdo de um documento anexado (PDF, DOCX ou imagem) para
// texto em Markdown, para uso posterior pela IA (Fase 3/4 — extração
// estruturada). Cada formato usa sua própria biblioteca; a função pública
// `converterParaMarkdown` despacha pelo mime_type e devolve sempre a mesma
// forma de resultado, com falha explícita (nunca lança) para que quem chama
// (server/integracao/processarDocumentosAnexados.ts) grave `status_extracao`
// e `erro_extracao` sem precisar de try/catch próprio por formato.

import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import TurndownService from 'turndown';
import Tesseract from 'tesseract.js';

export interface ResultadoConversao {
  sucesso: boolean;
  markdown?: string;
  erro?: string;
}

const turndown = new TurndownService();

export async function converterParaMarkdown(
  arquivo: Buffer,
  mimeType: string,
): Promise<ResultadoConversao> {
  try {
    switch (mimeType) {
      case 'application/pdf':
        return await converterPdf(arquivo);
      case 'application/msword':
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return await converterDocx(arquivo);
      case 'image/jpeg':
      case 'image/png':
      case 'image/webp':
        return await converterImagem(arquivo);
      default:
        return { sucesso: false, erro: `Formato não suportado para conversão: ${mimeType}` };
    }
  } catch (erro) {
    return {
      sucesso: false,
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido ao converter documento',
    };
  }
}

async function converterPdf(arquivo: Buffer): Promise<ResultadoConversao> {
  const parser = new PDFParse({ data: arquivo });
  try {
    const resultado = await parser.getText();
    const texto = resultado.text.trim();
    if (!texto) {
      return { sucesso: false, erro: 'PDF sem texto extraível (possivelmente escaneado sem OCR)' };
    }
    return { sucesso: true, markdown: texto };
  } finally {
    await parser.destroy();
  }
}

async function converterDocx(arquivo: Buffer): Promise<ResultadoConversao> {
  const { value: html } = await mammoth.convertToHtml({ buffer: arquivo });
  const markdown = turndown.turndown(html).trim();
  if (!markdown) {
    return { sucesso: false, erro: 'DOCX sem conteúdo extraível' };
  }
  return { sucesso: true, markdown };
}

async function converterImagem(arquivo: Buffer): Promise<ResultadoConversao> {
  const worker = await Tesseract.createWorker('por');
  try {
    const { data } = await worker.recognize(arquivo);
    const texto = data.text.trim();
    if (!texto) {
      return { sucesso: false, erro: 'Nenhum texto reconhecido na imagem (OCR)' };
    }
    return { sucesso: true, markdown: texto };
  } finally {
    await worker.terminate();
  }
}
