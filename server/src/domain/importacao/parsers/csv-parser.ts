/**
 * Parser para arquivos CSV
 *
 * Funcionalidades:
 * - Detecção automática de headers
 * - Mapeamento dinâmico de colunas
 * - Suporte a múltiplos formatos de data (DD/MM/YYYY, YYYY-MM-DD, etc.)
 * - Normalização de valores monetários
 * - Tratamento de encoding UTF-8 e latin1
 */

import { parse as csvParse } from "papaparse";
import { parseISO, parse as dateParse, isValid, format } from "date-fns";
import { pt } from "date-fns/locale";
import type {
  TransacaoBruta,
  ParserResult,
  ParserOptions,
  ParseError,
} from "../tipos.js";

interface CSVRow {
  [key: string]: string | undefined;
}

/**
 * Detecta headers automaticamente analisando a primeira linha
 * Procura por palavras-chave comuns em português e inglês
 */
function detectarHeaders(
  primeiraLinha: string[],
  confianca: number = 80,
): { indices: Record<string, number>; confianca: number } {
  const indices: Record<string, number> = {};

  const palavrasChave = {
    data: [
      "data",
      "date",
      "data_transacao",
      "transaction_date",
      "data_mov",
      "data_lançamento",
      "dtmovto",
      "dt",
    ],
    valor: [
      "valor",
      "amount",
      "value",
      "vlr",
      "valor_transacao",
      "transaction_amount",
      "credito",
      "debito",
      "credit",
      "debit",
    ],
    descricao: [
      "descricao",
      "description",
      "desc",
      "memo",
      "historico",
      "details",
      "texto",
      "title",
      "name",
      "nome",
      "motivo",
    ],
    tipo: [
      "tipo",
      "type",
      "categoria",
      "operacao",
      "debit_credit",
      "transacao_tipo",
    ],
  };

  // Mapear headers
  primeiraLinha.forEach((header, idx) => {
    const headerLower = header.toLowerCase().trim();

    for (const [campo, keywords] of Object.entries(palavrasChave)) {
      if (keywords.some((kw) => headerLower.includes(kw))) {
        indices[campo] = idx;
        break;
      }
    }
  });

  // Calcular confiança
  const camposEncontrados = Object.keys(indices).length;
  const confiancaCalculada = (camposEncontrados / 4) * 100;

  return {
    indices,
    confianca: Math.min(confiancaCalculada, 100),
  };
}

/**
 * Normaliza uma data para o formato YYYY-MM-DD
 * Tenta múltiplos formatos conhecidos
 */
function normalizarData(
  valor: string | undefined,
  formatosDatas?: string[],
): string | null {
  if (!valor) return null;

  const valor_trim = valor.trim();

  // Tentar parse ISO primeiro (mais rápido)
  try {
    const data = parseISO(valor_trim);
    if (isValid(data)) {
      return format(data, "yyyy-MM-dd");
    }
  } catch {
    // Continuar com outros formatos
  }

  // Formatos padrão se não especificados
  const formatos = formatosDatas || [
    "dd/MM/yyyy",
    "dd-MM-yyyy",
    "yyyy-MM-dd",
    "yyyy/MM/dd",
    "MM/dd/yyyy",
    "MM-dd-yyyy",
    "dd/MM/yy",
    "MM/dd/yy",
  ];

  for (const fmt of formatos) {
    try {
      const data = dateParse(valor_trim, fmt, new Date(), { locale: pt });
      if (isValid(data)) {
        return format(data, "yyyy-MM-dd");
      }
    } catch {
      // Tentar próximo formato
    }
  }

  // Se nenhum formato funcionou, tentar parse flexível
  try {
    const timestamp = new Date(valor_trim).getTime();
    if (!isNaN(timestamp)) {
      const data = new Date(valor_trim);
      return format(data, "yyyy-MM-dd");
    }
  } catch {
    // Falhou
  }

  return null;
}

/**
 * Normaliza valor monetário para número
 * Suporta diferentes separadores de decimal e milhar
 */
function normalizarValor(
  valor: string | undefined,
  separadorDecimal: string = ".",
  separadorMilhares: string = ",",
): number | null {
  if (!valor) return null;

  let valor_norm = valor.trim();

  // Remove espaços
  valor_norm = valor_norm.replace(/\s/g, "");

  // Identificar qual é o separador de decimal baseado na posição
  // Se houver dois separadores, o último é decimal
  const ultimaPosDecimal = valor_norm.lastIndexOf(separadorDecimal);
  const ultimaPosMilhares = valor_norm.lastIndexOf(separadorMilhares);

  if (ultimaPosDecimal > -1) {
    if (ultimaPosMilhares > -1 && ultimaPosMilhares > ultimaPosDecimal) {
      // Milhares aparece depois de decimal, trocar interpretação
      valor_norm = valor_norm
        .replace(new RegExp(`\\${separadorDecimal}`, "g"), "")
        .replace(new RegExp(`\\${separadorMilhares}`, "g"), ".");
    } else {
      // Caso normal
      valor_norm = valor_norm.replace(
        new RegExp(`\\${separadorMilhares}`, "g"),
        "",
      );
      if (separadorDecimal !== ".") {
        valor_norm = valor_norm.replace(separadorDecimal, ".");
      }
    }
  }

  // Extrair números (incluindo decimal)
  const match = valor_norm.match(/[+-]?\d+\.?\d*/);
  if (!match) return null;

  const numero = parseFloat(match[0]);
  return isNaN(numero) ? null : numero;
}

/**
 * Parse principal do CSV
 * Retorna array de TransacaoBruta normalizadas
 */
export function parseCSV(
  conteudo: string,
  options: ParserOptions = {},
): ParserResult {
  const resultado: ParserResult = {
    sucesso: false,
    transacoes: [],
    erros: [],
    linhas_descartadas: 0,
    avisos: [],
    estatisticas: {
      total_linhas: 0,
      linhas_vazias: 0,
      linhas_processadas: 0,
      linhas_com_erro: 0,
    },
  };

  const origem = options.origem || "csv";
  const separadorDecimal = options.separadorDecimal || ".";
  const separadorMilhares = options.separadorMilhares || ",";

  try {
    // Fazer parse do CSV usando papaparse
    const dados = csvParse(conteudo, {
      header: false,
      skipEmptyLines: false,
      dynamicTyping: false,
      encoding: options.encoding || "utf-8",
    });

    const linhas = (dados.data as string[][]).filter((l) => l && l.length > 0);

    if (linhas.length === 0) {
      resultado.avisos?.push("Arquivo CSV vazio ou sem linhas válidas");
      return resultado;
    }

    resultado.estatisticas!.total_linhas = linhas.length;

    // Detectar headers automaticamente
    const primeiraLinha = linhas[0];
    const deteccao = detectarHeaders(primeiraLinha);

    if (deteccao.confianca < 50) {
      resultado.avisos?.push(
        `Detecção de headers com baixa confiança (${Math.round(deteccao.confianca)}%). Verifique o mapeamento de colunas.`,
      );
    }

    const { indices } = deteccao;

    // Se não detectou índices, pode tentar usar nomes padrão
    if (Object.keys(indices).length === 0) {
      resultado.avisos?.push(
        "Não foi possível detectar automaticamente os headers. Usando posições padrão (0=data, 1=valor, 2=descricao).",
      );
      indices.data = 0;
      indices.valor = 1;
      indices.descricao = 2;
    }

    // Processar linhas de dados (começando da linha 1)
    let numeroLinhaProcessada = 1;
    for (let i = 1; i < linhas.length; i++) {
      if (options.maxLinhas && numeroLinhaProcessada >= options.maxLinhas) {
        break;
      }

      const linha = linhas[i];

      // Verificar se é linha vazia
      if (!linha || linha.every((c) => !c || c.trim() === "")) {
        resultado.estatisticas!.linhas_vazias++;
        resultado.linhas_descartadas++;
        continue;
      }

      try {
        // Extrair campos
        const dataStr = linha[indices.data || 0]?.trim() || "";
        const valorStr = linha[indices.valor || 1]?.trim() || "";
        const descricaoStr = linha[indices.descricao || 2]?.trim() || "";
        const tipoStr = linha[indices.tipo || 3]?.trim() || "";

        // Validar campos obrigatórios
        if (!dataStr) {
          throw new Error("Data não pode estar vazia");
        }
        if (!valorStr) {
          throw new Error("Valor não pode estar vazio");
        }
        if (!descricaoStr) {
          throw new Error("Descrição não pode estar vazia");
        }

        // Normalizar data
        const dataNormalizada = normalizarData(dataStr, options.formatosDatas);
        if (!dataNormalizada) {
          throw new Error(`Data inválida ou não reconhecida: "${dataStr}"`);
        }

        // Normalizar valor
        const valorNormalizado = normalizarValor(
          valorStr,
          separadorDecimal,
          separadorMilhares,
        );
        if (valorNormalizado === null) {
          throw new Error(`Valor não é um número válido: "${valorStr}"`);
        }

        // Determinar tipo de transação
        let tipoTransacao: "entrada" | "saida" = "saida";
        if (tipoStr) {
          const tipoLower = tipoStr.toLowerCase();
          if (
            tipoLower.includes("entrada") ||
            tipoLower.includes("credit") ||
            tipoLower.includes("c")
          ) {
            tipoTransacao = "entrada";
          } else if (
            tipoLower.includes("saida") ||
            tipoLower.includes("debit") ||
            tipoLower.includes("d")
          ) {
            tipoTransacao = "saida";
          }
        } else {
          // Inferir do sinal do valor
          tipoTransacao = valorNormalizado >= 0 ? "entrada" : "saida";
        }

        // Criar transação bruta
        const transacao: TransacaoBruta = {
          data: dataNormalizada,
          valor: Math.abs(valorNormalizado),
          descricao: descricaoStr,
          tipo_transacao: tipoTransacao,
          origem_modulo: origem,
          numero_linha: i + 1, // +1 porque skip na primeira linha (headers)
        };

        resultado.transacoes.push(transacao);
        resultado.estatisticas!.linhas_processadas++;
      } catch (erro) {
        resultado.estatisticas!.linhas_com_erro++;
        resultado.erros.push({
          linha: i + 1,
          motivo: erro instanceof Error ? erro.message : String(erro),
          valor_original: linha.join(",").substring(0, 100),
        });

        if (!options.tolerarErros) {
          break;
        }
      }

      numeroLinhaProcessada++;
    }

    resultado.sucesso = resultado.transacoes.length > 0;
    resultado.linhas_descartadas =
      resultado.estatisticas!.total_linhas -
      resultado.estatisticas!.linhas_processadas -
      resultado.estatisticas!.linhas_vazias;
  } catch (erro) {
    resultado.erros.push({
      linha: 0,
      motivo: `Erro crítico ao processar CSV: ${erro instanceof Error ? erro.message : String(erro)}`,
    });
  }

  return resultado;
}

/**
 * Parser com análise de preview (primeiras linhas)
 * Útil para validação antes de processar arquivo completo
 */
export function previewCSV(conteudo: string, linhasPreview: number = 10) {
  const resultado = parseCSV(conteudo, {
    maxLinhas: linhasPreview,
  });

  return {
    ...resultado,
    preview: resultado.transacoes.slice(0, linhasPreview),
  };
}
