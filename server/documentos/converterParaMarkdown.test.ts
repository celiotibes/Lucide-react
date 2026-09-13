import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { converterParaMarkdown } from './converterParaMarkdown';

vi.mock('tesseract.js', () => ({
  default: {
    createWorker: vi.fn(async () => ({
      recognize: vi.fn(async () => ({ data: { text: 'CONTRATO DE LOCACAO\nValor: R$ 1.200,00' } })),
      terminate: vi.fn(async () => undefined),
    })),
  },
}));

function gerarPdfDeTeste(texto: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const pedacos: Buffer[] = [];
    doc.on('data', (pedaco) => pedacos.push(pedaco));
    doc.on('end', () => resolve(Buffer.concat(pedacos)));
    doc.on('error', reject);
    doc.text(texto);
    doc.end();
  });
}

describe('converterParaMarkdown', () => {
  it('extrai texto de um PDF gerado com texto real', async () => {
    const pdf = await gerarPdfDeTeste('Contrato de Locacao - Kitnet 16');
    const resultado = await converterParaMarkdown(pdf, 'application/pdf');
    expect(resultado.sucesso).toBe(true);
    expect(resultado.markdown).toContain('Contrato de Locacao');
  });

  it('devolve falha para PDF corrompido/inválido em vez de lançar', async () => {
    const resultado = await converterParaMarkdown(Buffer.from('isto nao e um pdf valido'), 'application/pdf');
    expect(resultado.sucesso).toBe(false);
    expect(resultado.erro).toBeTruthy();
  });

  it('converte DOCX (lista simples) para markdown com os itens da lista', async () => {
    const docx = fs.readFileSync(path.join(__dirname, '__fixtures__', 'simple-list.docx'));
    const resultado = await converterParaMarkdown(docx, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(resultado.sucesso).toBe(true);
    expect(resultado.markdown).toContain('Apple');
    expect(resultado.markdown).toContain('Banana');
  });

  it('extrai texto de imagem via OCR (tesseract mockado)', async () => {
    const resultado = await converterParaMarkdown(Buffer.from('fake-image-bytes'), 'image/jpeg');
    expect(resultado.sucesso).toBe(true);
    expect(resultado.markdown).toContain('CONTRATO DE LOCACAO');
  });

  it('devolve falha explícita para mime type não suportado', async () => {
    const resultado = await converterParaMarkdown(Buffer.from('x'), 'application/zip');
    expect(resultado.sucesso).toBe(false);
    expect(resultado.erro).toContain('não suportado');
  });
});
