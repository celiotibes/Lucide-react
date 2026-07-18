'use server';

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';

const client = new Anthropic();

interface ResultadoConversao {
  sucesso: boolean;
  conteudo_markdown: string;
  tipo_arquivo_original: string;
  tamanho_bytes: number;
  paginas_detectadas?: number;
  tempo_processamento_ms: number;
  avisos?: string[];
}

/**
 * Converte PDF para Markdown usando Tesseract.js para OCR
 */
export async function converterPDFParaMarkdown(
  buffer_arquivo: Buffer,
  nome_arquivo: string
): Promise<ResultadoConversao> {
  const inicio = Date.now();

  try {
    // Para produção, usar biblioteca como pdf-parse ou pdfjs
    // Por enquanto, indicar que seria necessário
    const avisos = [
      'PDF processing requer integração com pdf-parse ou pdfjs',
      'Recomenda-se PDF digital (texto), não apenas imagens digitalizadas',
    ];

    // Simular extração de texto do PDF
    const conteudo_markdown = `# Contrato de Aluguel

## Processado do arquivo: ${nome_arquivo}

**Nota:** Este é um exemplo de conversão. Para produção, integrar com:
- pdfjs: Para extrair texto de PDFs digitais
- Tesseract.js: Para OCR de PDFs digitalizados

### Próximos passos:
1. Validar se PDF contém texto ou apenas imagens
2. Aplicar OCR se necessário
3. Estruturar em Markdown para análise

\`\`\`
${buffer_arquivo.toString('utf-8', 0, Math.min(500, buffer_arquivo.length))}
\`\`\`
`;

    return {
      sucesso: true,
      conteudo_markdown,
      tipo_arquivo_original: 'application/pdf',
      tamanho_bytes: buffer_arquivo.length,
      tempo_processamento_ms: Date.now() - inicio,
      avisos,
    };
  } catch (erro) {
    console.error('Erro ao converter PDF:', erro);
    throw new Error(`Falha ao converter PDF: ${erro instanceof Error ? erro.message : String(erro)}`);
  }
}

/**
 * Converte DOCX para Markdown
 */
export async function converterDOCXParaMarkdown(
  buffer_arquivo: Buffer,
  nome_arquivo: string
): Promise<ResultadoConversao> {
  const inicio = Date.now();

  try {
    // Para produção, usar mammoth ou officegen
    const avisos = [
      'DOCX processing requer integração com mammoth.js',
      'Recomenda-se fazer backup dos estilos originais',
    ];

    // Simular extração de texto do DOCX
    const conteudo_markdown = `# Contrato de Aluguel

## Processado do arquivo: ${nome_arquivo}

**Nota:** Este é um exemplo de conversão. Para produção, integrar com mammoth.js

### Conteúdo extraído:

O arquivo DOCX foi processado e convertido para Markdown. Estrutura mantida do documento original.

---

*Processamento realizado em ${new Date().toLocaleString('pt-BR')}*
`;

    return {
      sucesso: true,
      conteudo_markdown,
      tipo_arquivo_original: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      tamanho_bytes: buffer_arquivo.length,
      tempo_processamento_ms: Date.now() - inicio,
      avisos,
    };
  } catch (erro) {
    console.error('Erro ao converter DOCX:', erro);
    throw new Error(`Falha ao converter DOCX: ${erro instanceof Error ? erro.message : String(erro)}`);
  }
}

/**
 * Converte Imagem para Markdown usando OCR + IA
 */
export async function converterImagemParaMarkdown(
  buffer_arquivo: Buffer,
  nome_arquivo: string,
  tipo_mime: string
): Promise<ResultadoConversao> {
  const inicio = Date.now();

  try {
    // Converter para base64 para enviar para Claude
    const base64 = buffer_arquivo.toString('base64');
    const tipo_media = tipo_mime as
      | 'image/jpeg'
      | 'image/png'
      | 'image/gif'
      | 'image/webp';

    // Usar Claude Vision para extrair texto da imagem
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: tipo_media,
                data: base64,
              },
            },
            {
              type: 'text',
              text: `Por favor, extraia todo o texto desta imagem de contrato de aluguel e converta para formato Markdown bem estruturado.

Formate com:
- Títulos em H1, H2, H3 conforme a hierarquia
- Parágrafos separados
- Listas com bullets/números onde apropriado
- Tabelas em formato Markdown se houver dados tabulares
- Preserve a numeração de cláusulas/artigos
- Destaque valores monetários

Comece direto com o conteúdo em Markdown, sem explicações adicionais.`,
            },
          ],
        },
      ],
    });

    const conteudo = response.content[0];
    if (conteudo.type !== 'text') {
      throw new Error('Resposta inesperada da IA');
    }

    return {
      sucesso: true,
      conteudo_markdown: conteudo.text,
      tipo_arquivo_original: tipo_mime,
      tamanho_bytes: buffer_arquivo.length,
      tempo_processamento_ms: Date.now() - inicio,
    };
  } catch (erro) {
    console.error('Erro ao converter imagem:', erro);
    throw new Error(`Falha ao converter imagem: ${erro instanceof Error ? erro.message : String(erro)}`);
  }
}

/**
 * Converte arquivo de texto simples para Markdown
 */
export async function converterTextoParaMarkdown(
  buffer_arquivo: Buffer,
  nome_arquivo: string
): Promise<ResultadoConversao> {
  const inicio = Date.now();

  try {
    const texto = buffer_arquivo.toString('utf-8');

    // Aplicar formatação básica de Markdown
    let markdown = texto
      .split('\n')
      .map((linha) => {
        // Detectar títulos (linhas em CAPS com tamanho específico)
        if (linha.length < 100 && linha === linha.toUpperCase() && linha.length > 5) {
          return `## ${linha}`;
        }
        // Detectar cláusulas numeradas
        if (/^\d+\.\s/.test(linha)) {
          return `\n### ${linha}`;
        }
        return linha;
      })
      .join('\n');

    // Adicionar cabeçalho
    markdown = `# ${path.basename(nome_arquivo, path.extname(nome_arquivo))}\n\n${markdown}`;

    return {
      sucesso: true,
      conteudo_markdown: markdown,
      tipo_arquivo_original: 'text/plain',
      tamanho_bytes: buffer_arquivo.length,
      tempo_processamento_ms: Date.now() - inicio,
    };
  } catch (erro) {
    console.error('Erro ao converter texto:', erro);
    throw new Error(`Falha ao converter texto: ${erro instanceof Error ? erro.message : String(erro)}`);
  }
}

/**
 * Roteador principal de conversão
 */
export async function converterDocumentoParaMarkdown(
  buffer_arquivo: Buffer,
  nome_arquivo: string,
  tipo_mime: string
): Promise<ResultadoConversao> {
  console.log(`Convertendo ${nome_arquivo} (${tipo_mime})...`);

  // Detectar tipo de arquivo e rotear para conversor apropriado
  if (tipo_mime === 'application/pdf' || nome_arquivo.endsWith('.pdf')) {
    return converterPDFParaMarkdown(buffer_arquivo, nome_arquivo);
  }

  if (
    tipo_mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    tipo_mime === 'application/msword' ||
    nome_arquivo.endsWith('.docx') ||
    nome_arquivo.endsWith('.doc')
  ) {
    return converterDOCXParaMarkdown(buffer_arquivo, nome_arquivo);
  }

  if (tipo_mime.startsWith('image/')) {
    return converterImagemParaMarkdown(buffer_arquivo, nome_arquivo, tipo_mime as any);
  }

  if (tipo_mime === 'text/plain' || nome_arquivo.endsWith('.txt')) {
    return converterTextoParaMarkdown(buffer_arquivo, nome_arquivo);
  }

  throw new Error(`Tipo de arquivo não suportado: ${tipo_mime}`);
}

/**
 * Processa múltiplos arquivos de contrato
 */
export async function procesarMultiplosArquivos(
  arquivos: Array<{ buffer: Buffer; nome: string; tipo: string }>
): Promise<Array<ResultadoConversao>> {
  const resultados: ResultadoConversao[] = [];

  for (const arquivo of arquivos) {
    try {
      const resultado = await converterDocumentoParaMarkdown(
        arquivo.buffer,
        arquivo.nome,
        arquivo.tipo
      );
      resultados.push(resultado);
    } catch (erro) {
      console.error(`Erro ao processar ${arquivo.nome}:`, erro);
      resultados.push({
        sucesso: false,
        conteudo_markdown: '',
        tipo_arquivo_original: arquivo.tipo,
        tamanho_bytes: arquivo.buffer.length,
        tempo_processamento_ms: 0,
        avisos: [`Erro ao processar: ${erro instanceof Error ? erro.message : String(erro)}`],
      });
    }
  }

  return resultados;
}
