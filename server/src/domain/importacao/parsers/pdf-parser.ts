/**
 * Parser para arquivos PDF
 *
 * Funcionalidades:
 * - Extração de tabelas simples do PDF
 * - Fallback para extração de texto com regex patterns
 * - Busca por palavras-chave (data, valor, descrição)
 * - Suporte a PDFs de extrato bancário e notas fiscais
 * - Tratamento de PDFs com e sem estrutura de tabela
 */

import type {
  TransacaoBruta,
  ParserResult,
  ParserOptions,
} from "../tipos.js";
import { parseISO, parse as dateParse, isValid, format } from "date-fns";

/**
 * Extrai texto bruto do PDF
 * Esta é uma implementação simplificada que usa regex
 * Para uso em produção, considerar usar biblioteca como pdf-parse
 */
async function extrairTextoPDF(buffer: Buffer): Promise<string> {
  // Converter PDF to text usando regex pattern
  // Esta é uma abordagem simplificada
  const text = buffer.toString("binary");

  // Tentar extrair stream de texto (PDFs geralmente têm conteúdo em streams)
  const matches = text.match(/BT([\s\S]*?)ET/g);
  if (matches) {
    return matches
      .join("\n")
      .replace(/[^\x20-\x7E\n]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return text;
}

/**
 * Detecta padrões de datas em texto
 */
function detectarDatas(texto: string): RegExpMatchArray | null {
  const padroesData = [
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/g, // DD/MM/YYYY
    /(\d{4})-(\d{1,2})-(\d{1,2})/g, // YYYY-MM-DD
    /(\d{1,2})-(\d{1,2})-(\d{4})/g, // DD-MM-YYYY
    /(\d{1,2})\.(\d{1,2})\.(\d{4})/g, // DD.MM.YYYY (formato europeu)
  ];

  for (const padrao of padroesData) {
    const matches = texto.match(padrao);
    if (matches) return matches;
  }

  return null;
}

/**
 * Detecta valores monetários em texto
 */
function detectarValores(texto: string): RegExpMatchArray | null {
  const padroesValor = [
    /R\$\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?)/g, // R$ 1.234,56
    /\$\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?)/g, // $ 1,234.56
    /([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?)$/gm, // 1.234,56 ou 1234,56
  ];

  for (const padrao of padroesValor) {
    const matches = texto.match(padrao);
    if (matches) return matches;
  }

  return null;
}

/**
 * Extrai tabelas simples do texto em formato de linhas/colunas
 */
function extrairTabelasDeTexto(texto: string): string[][] {
  const linhas = texto.split("\n");
  const tabelas: string[][] = [];
  let tabelaAtual: string[] = [];

  for (const linha of linhas) {
    const colunas = linha.split(/\s{2,}/).filter((c) => c.trim());

    if (colunas.length >= 3) {
      tabelaAtual.push(...colunas);

      // Se temos pelo menos 3 "linhas" de dados, consideramos uma tabela
      if (tabelaAtual.length >= 3) {
        tabelas.push([...tabelaAtual]);
        tabelaAtual = [];
      }
    }
  }

  return tabelas;
}

/**
 * Normaliza uma data para o formato YYYY-MM-DD
 */
function normalizarData(valor: string | undefined): string | null {
  if (!valor) return null;

  const valor_trim = valor.trim();

  // Tentar parse ISO primeiro
  try {
    const data = parseISO(valor_trim);
    if (isValid(data)) {
      return format(data, "yyyy-MM-dd");
    }
  } catch {
    // Continuar
  }

  // Padrão DD/MM/YYYY
  const matchDDMMYYYY = valor_trim.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (matchDDMMYYYY) {
    const [, dia, mes, ano] = matchDDMMYYYY;
    const data = new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
    if (isValid(data)) {
      return format(data, "yyyy-MM-dd");
    }
  }

  // Padrão DD.MM.YYYY
  const matchDDMMYYYYDot = valor_trim.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (matchDDMMYYYYDot) {
    const [, dia, mes, ano] = matchDDMMYYYYDot;
    const data = new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
    if (isValid(data)) {
      return format(data, "yyyy-MM-dd");
    }
  }

  return null;
}

/**
 * Normaliza valor monetário
 */
function normalizarValor(valor: string | undefined): number | null {
  if (!valor) return null;

  let valor_norm = valor.trim();

  // Remover símbolos de moeda
  valor_norm = valor_norm.replace(/[R$\s]/g, "");

  // Detectar separadores e normalizar
  if (valor_norm.includes(",")) {
    // Formato brasileiro: 1.234,56
    valor_norm = valor_norm.replace(".", "").replace(",", ".");
  }

  const numero = parseFloat(valor_norm);
  return isNaN(numero) ? null : numero;
}

/**
 * Parse de PDF - abordagem simplificada
 * Para produção, usar pdf-parse ou similar
 */
export async function parsePDF(
  buffer: Buffer,
  options: ParserOptions = {},
): Promise<ParserResult> {
  const resultado: ParserResult = {
    sucesso: false,
    transacoes: [],
    erros: [],
    linhas_descartadas: 0,
    avisos: ["Parser PDF em modo simplificado (text extraction)"],
    estatisticas: {
      total_linhas: 0,
      linhas_vazias: 0,
      linhas_processadas: 0,
      linhas_com_erro: 0,
    },
  };

  const origem = options.origem || "pdf";

  try {
    // Extrair texto do PDF
    let texto = await extrairTextoPDF(buffer);

    if (!texto || texto.length === 0) {
      resultado.avisos?.push("Não foi possível extrair texto do PDF");
      return resultado;
    }

    // Tentar extrair tabelas
    const tabelas = extrairTabelasDeTexto(texto);

    if (tabelas.length === 0) {
      resultado.avisos?.push(
        "Nenhuma tabela estruturada encontrada, usando pattern matching",
      );
    }

    // Procurar por padrões de transações
    const linhas = texto.split("\n");
    resultado.estatisticas!.total_linhas = linhas.length;

    let numeroLinha = 0;

    for (const linha of linhas) {
      numeroLinha++;

      if (!linha || linha.trim().length === 0) {
        resultado.estatisticas!.linhas_vazias++;
        continue;
      }

      try {
        // Procurar por padrões de data e valor na mesma linha
        const datas = linha.match(
          /(\d{1,2})\/(\d{1,2})\/(\d{4})|(\d{1,2})\.(\d{1,2})\.(\d{4})/,
        );
        const valores = linha.match(
          /R\$\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?)|([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?)/,
        );

        if (datas && valores) {
          const dataStr = datas[0];
          const valorStr = valores[1] || valores[2];

          const dataNormalizada = normalizarData(dataStr);
          const valorNormalizado = normalizarValor(valorStr);

          if (dataNormalizada && valorNormalizado) {
            // Extrair descrição (texto entre data e valor ou depois do valor)
            const descricao = linha
              .replace(dataStr, "")
              .replace(valorStr, "")
              .trim()
              .substring(0, 200);

            // Inferir tipo de transação
            const tipoTransacao =
              valorNormalizado >= 0 ? "entrada" : "saida";

            const transacao: TransacaoBruta = {
              data: dataNormalizada,
              valor: Math.abs(valorNormalizado),
              descricao: descricao || "Transação importada de PDF",
              tipo_transacao: tipoTransacao,
              origem_modulo: origem,
              numero_linha: numeroLinha,
            };

            resultado.transacoes.push(transacao);
            resultado.estatisticas!.linhas_processadas++;
          }
        }

        if (options.maxLinhas && numeroLinha >= options.maxLinhas) {
          break;
        }
      } catch (erro) {
        resultado.estatisticas!.linhas_com_erro++;
        resultado.erros.push({
          linha: numeroLinha,
          motivo: erro instanceof Error ? erro.message : String(erro),
          valor_original: linha.substring(0, 100),
        });

        if (!options.tolerarErros) {
          break;
        }
      }
    }

    resultado.sucesso = resultado.transacoes.length > 0;
    resultado.linhas_descartadas =
      resultado.estatisticas!.total_linhas -
      resultado.estatisticas!.linhas_processadas -
      resultado.estatisticas!.linhas_vazias;
  } catch (erro) {
    resultado.erros.push({
      linha: 0,
      motivo: `Erro crítico ao processar PDF: ${erro instanceof Error ? erro.message : String(erro)}`,
    });
  }

  return resultado;
}

/**
 * Parser com preview (para validação)
 */
export async function previewPDF(buffer: Buffer, linhasPreview: number = 10) {
  const resultado = await parsePDF(buffer, {
    maxLinhas: linhasPreview,
  });

  return {
    ...resultado,
    preview: resultado.transacoes.slice(0, linhasPreview),
  };
}
