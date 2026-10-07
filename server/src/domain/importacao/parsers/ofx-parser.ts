/**
 * Parser para arquivos OFX (Open Financial Exchange)
 *
 * Suporta:
 * - OFX 1.x (formato texto com tags)
 * - OFX 2.x (formato XML)
 * - Extração de STMTTRN (statement transactions)
 * - Normalização de campos bancários
 *
 * Exemplo OFX 1.x:
 * <STMTTRN>
 * <TRNTYPE>DEBIT
 * <DTPOSTED>20231215
 * <TRNAMT>-150.00
 * <FITID>1001
 * <NAME>Descrição da transação
 * </STMTTRN>
 */

import type {
  TransacaoBruta,
  ParserResult,
  ParserOptions,
} from "../tipos.js";
import { XMLParser } from "fast-xml-parser";
import { parseISO, isValid, format } from "date-fns";

interface OFXTransaction {
  TRNTYPE?: string;
  DTPOSTED?: string;
  TRNAMT?: string | number;
  FITID?: string;
  NAME?: string;
  MEMO?: string;
}

/**
 * Detecta se é OFX 1.x (texto) ou OFX 2.x (XML)
 */
function detectarVersaoOFX(conteudo: string): "1.x" | "2.x" {
  // OFX 2.x começará com XML declaration
  if (conteudo.includes("<?xml")) {
    return "2.x";
  }
  // OFX 1.x usa tags sem XML declaration
  if (conteudo.includes("<OFX>") || conteudo.includes("<ofx>")) {
    return "1.x";
  }
  // Default para 1.x
  return "1.x";
}

/**
 * Converte OFX 1.x (formato texto) para XML bem-formado
 * Remove headers OFXHEADER e converte tags
 */
function converterOFX1xParaXML(conteudo: string): string {
  let xml = conteudo;

  // Remover header OFX
  xml = xml.replace(/^OFXHEADER:.*$/m, "");
  xml = xml.replace(/^OFXVERSION:.*$/m, "");
  xml = xml.replace(/^SECURITY:.*$/m, "");
  xml = xml.replace(/^ENCODING:.*$/m, "");
  xml = xml.replace(/^CHARSET:.*$/m, "");
  xml = xml.replace(/^COMPRESSION:.*$/m, "");
  xml = xml.replace(/^OLDFILEFORMAT:.*$/m, "");
  xml = xml.replace(/^NEWFILEFORMAT:.*$/m, "");

  // Remover linhas em branco extras
  xml = xml.replace(/\n\n+/g, "\n");

  // Envolver em tags raiz se não tiver
  if (!xml.includes("<OFX>") && !xml.includes("<ofx>")) {
    xml = `<OFX>\n${xml}\n</OFX>`;
  }

  return xml;
}

/**
 * Extrai transações do XML parseado
 */
function extrairTransacoesDoXML(
  xmlObj: Record<string, unknown>,
): OFXTransaction[] {
  const transacoes: OFXTransaction[] = [];

  // Navegar na estrutura do XML
  // OFX 2.x: ofx -> bankmsgsrsv1 -> stmttrs -> stmtrs -> banktranlist -> stmttrn
  // OFX 1.x: ofx -> bankmsgsrsv1 -> stmttrs -> stmtrs -> banktranlist -> stmttrn

  const navegar = (obj: unknown, chaves: string[]): OFXTransaction[] => {
    let atual = obj as Record<string, unknown>;

    for (const chave of chaves) {
      if (typeof atual !== "object" || atual === null) {
        return [];
      }

      // Tentar com chave exata e lowercase
      let valor = atual[chave] || atual[chave.toLowerCase()];

      if (!valor && typeof atual === "object") {
        // Procurar recursivamente
        for (const k of Object.keys(atual)) {
          if (k.toLowerCase() === chave.toLowerCase()) {
            valor = atual[k];
            break;
          }
        }
      }

      if (!valor) {
        return [];
      }

      atual = valor as Record<string, unknown>;
    }

    // Chegar aqui significa que encontramos a lista de transações
    if (Array.isArray(atual)) {
      return atual.filter(
        (t) => typeof t === "object",
      ) as OFXTransaction[];
    } else if (typeof atual === "object" && atual !== null) {
      return [atual as OFXTransaction];
    }

    return [];
  };

  // Tentar múltiplos caminhos de navegação
  const caminhos = [
    ["OFX", "BANKMSGSRSV1", "STMTTRS", "STMTRS", "BANKTRANLIST", "STMTTRN"],
    [
      "ofx",
      "bankmsgsrsv1",
      "stmttrs",
      "stmtrs",
      "banktranlist",
      "stmttrn",
    ],
    ["stmttrn"],
    ["STMTTRN"],
  ];

  for (const caminho of caminhos) {
    const resultado = navegar(xmlObj, caminho);
    if (resultado.length > 0) {
      return resultado;
    }
  }

  return transacoes;
}

/**
 * Normaliza data OFX (formato YYYYMMDD) para YYYY-MM-DD
 */
function normalizarDataOFX(valor: string | undefined): string | null {
  if (!valor) return null;

  const valor_trim = valor.trim();

  // Formato OFX padrão: YYYYMMDD
  if (valor_trim.length === 8 && /^\d{8}$/.test(valor_trim)) {
    const ano = valor_trim.substring(0, 4);
    const mes = valor_trim.substring(4, 6);
    const dia = valor_trim.substring(6, 8);
    const data = new Date(
      parseInt(ano),
      parseInt(mes) - 1,
      parseInt(dia),
    );
    if (isValid(data)) {
      return format(data, "yyyy-MM-dd");
    }
  }

  // Tentar parse ISO
  try {
    const data = parseISO(valor_trim);
    if (isValid(data)) {
      return format(data, "yyyy-MM-dd");
    }
  } catch {
    // Continuar
  }

  return null;
}

/**
 * Normaliza valor OFX (sempre número)
 */
function normalizarValorOFX(valor: string | number | undefined): number | null {
  if (valor === undefined || valor === null) return null;

  const numero = typeof valor === "number" ? valor : parseFloat(String(valor));
  return isNaN(numero) ? null : numero;
}

/**
 * Mapeia tipo de transação OFX para nosso modelo
 */
function mapearTipoTransacao(
  tipoOFX: string | undefined,
  valor: number,
): "entrada" | "saida" {
  if (!tipoOFX) {
    return valor >= 0 ? "entrada" : "saida";
  }

  const tipo_lower = tipoOFX.toLowerCase();

  if (
    tipo_lower.includes("debit") ||
    tipo_lower.includes("debit") ||
    tipo_lower.includes("check")
  ) {
    return "saida";
  }

  if (tipo_lower.includes("credit") || tipo_lower.includes("dep")) {
    return "entrada";
  }

  // Inferir do sinal
  return valor >= 0 ? "entrada" : "saida";
}

/**
 * Parse principal de OFX
 */
export function parseOFX(
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

  const origem = options.origem || "ofx";

  try {
    // Detectar versão
    const versao = detectarVersaoOFX(conteudo);
    resultado.avisos?.push(`Processando OFX versão ${versao}`);

    let xml = conteudo;

    // Se OFX 1.x, converter para XML bem-formado
    if (versao === "1.x") {
      xml = converterOFX1xParaXML(conteudo);
    }

    // Parse XML
    const parser = new XMLParser({
      ignoreAttributes: true,
      parseTagValue: true,
    });
    const xmlObj = parser.parse(xml);

    // Extrair transações
    const transacoesOFX = extrairTransacoesDoXML(
      xmlObj as Record<string, unknown>,
    );

    if (transacoesOFX.length === 0) {
      resultado.avisos?.push(
        "Nenhuma transação encontrada no arquivo OFX",
      );
      return resultado;
    }

    resultado.estatisticas!.total_linhas = transacoesOFX.length;

    // Processar cada transação
    let numeroProcessado = 0;
    for (let i = 0; i < transacoesOFX.length; i++) {
      if (options.maxLinhas && numeroProcessado >= options.maxLinhas) {
        break;
      }

      const trn = transacoesOFX[i];

      try {
        // Extrair e validar campos
        const dataStr = trn.DTPOSTED || trn.DTPOSTED;
        const valorStr = trn.TRNAMT;
        const descricao = trn.NAME || trn.MEMO || "Transação OFX";
        const tipoOFX = trn.TRNTYPE;

        if (!dataStr) {
          throw new Error("Data não encontrada (DTPOSTED)");
        }

        if (valorStr === undefined) {
          throw new Error("Valor não encontrado (TRNAMT)");
        }

        // Normalizar data
        const dataNormalizada = normalizarDataOFX(String(dataStr));
        if (!dataNormalizada) {
          throw new Error(`Data inválida ou não reconhecida: "${dataStr}"`);
        }

        // Normalizar valor
        const valorNormalizado = normalizarValorOFX(valorStr);
        if (valorNormalizado === null) {
          throw new Error(`Valor não é um número válido: "${valorStr}"`);
        }

        // Mapear tipo
        const tipoTransacao = mapearTipoTransacao(tipoOFX, valorNormalizado);

        // Criar transação bruta
        const transacao: TransacaoBruta = {
          data: dataNormalizada,
          valor: Math.abs(valorNormalizado),
          descricao: String(descricao).trim(),
          tipo_transacao: tipoTransacao,
          origem_modulo: origem,
          numero_linha: i + 1,
          campos_adicionais: {
            fitid: trn.FITID,
            tipo_ofx: tipoOFX,
          },
        };

        resultado.transacoes.push(transacao);
        resultado.estatisticas!.linhas_processadas++;
      } catch (erro) {
        resultado.estatisticas!.linhas_com_erro++;
        resultado.erros.push({
          linha: i + 1,
          motivo: erro instanceof Error ? erro.message : String(erro),
          valor_original: JSON.stringify(trn).substring(0, 100),
        });

        if (!options.tolerarErros) {
          break;
        }
      }

      numeroProcessado++;
    }

    resultado.sucesso = resultado.transacoes.length > 0;
    resultado.linhas_descartadas =
      resultado.estatisticas!.total_linhas -
      resultado.estatisticas!.linhas_processadas;
  } catch (erro) {
    resultado.erros.push({
      linha: 0,
      motivo: `Erro crítico ao processar OFX: ${erro instanceof Error ? erro.message : String(erro)}`,
    });
  }

  return resultado;
}

/**
 * Parser com preview
 */
export function previewOFX(conteudo: string, linhasPreview: number = 10) {
  const resultado = parseOFX(conteudo, {
    maxLinhas: linhasPreview,
  });

  return {
    ...resultado,
    preview: resultado.transacoes.slice(0, linhasPreview),
  };
}
