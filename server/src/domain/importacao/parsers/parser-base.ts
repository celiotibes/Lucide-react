/**
 * Interface base para todos os parsers de extratos bancários
 *
 * Define contrato comum para parsing de diferentes formatos:
 * - OFX (US standard)
 * - MT940 (SWIFT standard)
 * - CSV (variações por banco)
 * - PDF (tabulação)
 */

import type { TransacaoBruta, ParserResult, ParserOptions } from "../tipos.js";

/**
 * Interface base que todo parser deve implementar
 */
export interface IParser {
  /**
   * Detecta se este parser pode processar o conteúdo
   * Usado pelo registry para identificar o formato automaticamente
   */
  pode_processar(conteudo: string, extensao?: string): boolean;

  /**
   * Realiza o parsing do conteúdo
   * Retorna resultado normalizado com TransacaoBruta[]
   */
  parse(conteudo: string, options?: ParserOptions): Promise<ParserResult>;

  /**
   * Metadados do parser
   */
  info: {
    nome: string;
    descricao: string;
    versoes_suportadas: string[];
    formatos_entrada: string[];
  };
}

/**
 * Classe base abstrata com funcionalidades comuns
 */
export abstract class ParserBase implements IParser {
  abstract info: {
    nome: string;
    descricao: string;
    versoes_suportadas: string[];
    formatos_entrada: string[];
  };

  /**
   * Detector padrão por extensão de arquivo
   */
  detectarPorExtensao(extensao?: string): boolean {
    if (!extensao) return false;
    const ext = extensao.toLowerCase().replace(/^\./, "");
    return this.info.formatos_entrada.includes(ext);
  }

  /**
   * Função abstrata que subclasses devem implementar
   */
  abstract pode_processar(conteudo: string, extensao?: string): boolean;

  /**
   * Função abstrata que subclasses devem implementar
   */
  abstract parse(
    conteudo: string,
    options?: ParserOptions,
  ): Promise<ParserResult>;

  /**
   * Normaliza uma data para ISO 8601 (YYYY-MM-DD)
   */
  protected normalizarData(valor: string | undefined): string | null {
    if (!valor) return null;
    const v = valor.trim();

    // YYYYMMDD (OFX/MT940)
    if (/^\d{6}$/.test(v)) {
      // YYMMDD
      const yy = parseInt(v.substring(0, 2));
      const ano = yy > 50 ? 1900 + yy : 2000 + yy;
      const mes = v.substring(2, 4);
      const dia = v.substring(4, 6);
      const data = new Date(ano, parseInt(mes) - 1, parseInt(dia));
      if (this.dataValida(data)) {
        return this.formatarData(data);
      }
    }

    // YYYYMMDD
    if (/^\d{8}$/.test(v)) {
      const ano = v.substring(0, 4);
      const mes = v.substring(4, 6);
      const dia = v.substring(6, 8);
      const data = new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
      if (this.dataValida(data)) {
        return this.formatarData(data);
      }
    }

    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const data = new Date(v + "T00:00:00Z");
      if (this.dataValida(data)) return v;
    }

    // DD/MM/YYYY ou DD-MM-YYYY
    if (/^\d{2}[/-]\d{2}[/-]\d{4}$/.test(v)) {
      const partes = v.split(/[/-]/);
      const data = new Date(
        parseInt(partes[2]),
        parseInt(partes[1]) - 1,
        parseInt(partes[0]),
      );
      if (this.dataValida(data)) {
        return this.formatarData(data);
      }
    }

    return null;
  }

  /**
   * Valida se uma data é válida
   */
  protected dataValida(data: Date): boolean {
    return data instanceof Date && !isNaN(data.getTime());
  }

  /**
   * Formata data para YYYY-MM-DD
   */
  protected formatarData(data: Date): string {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, "0");
    const dia = String(data.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  }

  /**
   * Normaliza valor monetário
   */
  protected normalizarValor(
    valor: string | number | undefined,
    separadorDecimal: string = ".",
    separadorMilhares: string = ",",
  ): number | null {
    if (valor === undefined || valor === null || valor === "") return null;

    let num = String(valor).trim();

    // Já é número
    if (typeof valor === "number") {
      return isNaN(valor) ? null : valor;
    }

    // Remove espaços
    num = num.replace(/\s/g, "");

    // Detecta sinal
    const negativo = num.startsWith("-") || num.startsWith("(");
    num = num.replace(/[()]/g, "").replace(/^-/, "");

    // Normaliza separadores
    const ultimaPosDec = num.lastIndexOf(separadorDecimal);
    const ultimaPosMil = num.lastIndexOf(separadorMilhares);

    if (ultimaPosDec > -1 && ultimaPosMil > ultimaPosDec) {
      // Milhares depois de decimal, trocar interpretação
      num = num.replace(new RegExp(`\\${separadorDecimal}`, "g"), "");
      num = num.replace(new RegExp(`\\${separadorMilhares}`, "g"), ".");
    } else {
      num = num.replace(new RegExp(`\\${separadorMilhares}`, "g"), "");
      if (separadorDecimal !== ".") {
        num = num.replace(separadorDecimal, ".");
      }
    }

    // Extrai números
    const match = num.match(/\d+\.?\d*/);
    if (!match) return null;

    let resultado = parseFloat(match[0]);
    if (isNaN(resultado)) return null;

    return negativo ? -resultado : resultado;
  }

  /**
   * Normaliza descrição (máximo 500 caracteres)
   */
  protected normalizarDescricao(desc: string | undefined): string {
    if (!desc) return "";
    let normalizado = desc.trim();
    if (normalizado.length > 500) {
      normalizado = normalizado.substring(0, 497) + "...";
    }
    return normalizado;
  }

  /**
   * Extrai CNPJ ou CPF da descrição
   */
  protected extrairDocumento(desc: string): string | null {
    // CNPJ: XX.XXX.XXX/XXXX-XX ou XXXXXXXXXXXXXXXX
    const cnpj = desc.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{14}/);
    if (cnpj) return cnpj[0];

    // CPF: XXX.XXX.XXX-XX ou XXXXXXXXXXX
    const cpf = desc.match(/\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11}/);
    if (cpf) return cpf[0];

    return null;
  }

  /**
   * Detecta tipo de transação a partir da descrição
   */
  protected detectarTipo(desc: string): "entrada" | "saida" {
    const lower = desc.toLowerCase();

    if (
      lower.includes("credito") ||
      lower.includes("deposito") ||
      lower.includes("credit") ||
      lower.includes("entrada") ||
      lower.includes("pix recebido") ||
      lower.includes("ted recebido")
    ) {
      return "entrada";
    }

    if (
      lower.includes("debito") ||
      lower.includes("saque") ||
      lower.includes("debit") ||
      lower.includes("saida") ||
      lower.includes("pix enviado") ||
      lower.includes("ted enviado")
    ) {
      return "saida";
    }

    return "saida";
  }

  /**
   * Criar resultado padrão vazio
   */
  protected criarResultadoVazio(): ParserResult {
    return {
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
  }
}
