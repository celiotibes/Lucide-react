/**
 * Relatorio Formatacoes - Formatting utilities for report data
 *
 * Provides formatters for:
 * - Moeda (BRL, USD, EUR)
 * - Data (multiple formats)
 * - Percentual
 * - Saldo
 * - Hash de Auditoria
 *
 * All formatters support locale-aware formatting for pt-BR
 */

/**
 * Interface base para formatadores
 */
export interface IFormatador {
  formatar(valor: any): string;
  desformatar?(valor: string): any;
}

/**
 * FormatadorMoeda - Formatação de valores monetários
 *
 * Suporta: BRL, USD, EUR
 * Inclui símbolo de moeda, casas decimais, separadores
 */
export class FormatadorMoeda implements IFormatador {
  private moeda: "BRL" | "USD" | "EUR";
  private casasDecimais: number;
  private incluirSimbolo: boolean;
  private locale: string;

  constructor(
    moeda: "BRL" | "USD" | "EUR" = "BRL",
    casasDecimais: number = 2,
    incluirSimbolo: boolean = true,
  ) {
    this.moeda = moeda;
    this.casasDecimais = casasDecimais;
    this.incluirSimbolo = incluirSimbolo;
    this.locale = "pt-BR";
  }

  /**
   * Formata valor numérico como moeda
   *
   * @param valor - Número a formatar
   * @returns String formatada como moeda
   *
   * @example
   * new FormatadorMoeda('BRL').formatar(1500.50)
   * // Retorna: "R$ 1.500,50"
   */
  formatar(valor: any): string {
    if (valor === null || valor === undefined) {
      return "";
    }

    const num = Number(valor);
    if (isNaN(num)) {
      return String(valor);
    }

    const simbolos: Record<string, string> = {
      BRL: "R$",
      USD: "$",
      EUR: "€",
    };

    const opcoes: Intl.NumberFormatOptions = {
      style: "currency",
      currency: this.moeda,
      minimumFractionDigits: this.casasDecimais,
      maximumFractionDigits: this.casasDecimais,
    };

    try {
      return new Intl.NumberFormat(this.locale, opcoes).format(num);
    } catch {
      // Fallback para formatação manual
      const sinal = num < 0 ? "-" : "";
      const absoluto = Math.abs(num);
      const partes = absoluto.toFixed(this.casasDecimais).split(".");
      const inteira = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      const decimal = partes[1] || "00";
      const simbolo = this.incluirSimbolo ? simbolos[this.moeda] : "";

      return `${sinal}${simbolo} ${inteira},${decimal}`;
    }
  }

  /**
   * Remove formatação de moeda e retorna número
   *
   * @param valor - String formatada como moeda
   * @returns Número
   */
  desformatar(valor: string): number {
    const limpo = valor
      .replace(/[R$USD€\s]/g, "")
      .replace(/\./g, "")
      .replace(/,/g, ".");
    return parseFloat(limpo);
  }

  /**
   * Define número de casas decimais
   */
  comCasasDecimais(casas: number): FormatadorMoeda {
    this.casasDecimais = casas;
    return this;
  }
}

/**
 * FormatadorData - Formatação de datas
 *
 * Suporta múltiplos formatos:
 * - DD/MM/YYYY
 * - YYYY-MM-DD
 * - DD de Mês de YYYY
 */
export class FormatadorData implements IFormatador {
  private formato: "DD/MM/YYYY" | "YYYY-MM-DD" | "longBR" = "DD/MM/YYYY";
  private locale: string;

  constructor(formato: "DD/MM/YYYY" | "YYYY-MM-DD" | "longBR" = "DD/MM/YYYY") {
    this.formato = formato;
    this.locale = "pt-BR";
  }

  /**
   * Formata data conforme configuração
   *
   * @param valor - Data em string ou Date
   * @returns String formatada
   *
   * @example
   * new FormatadorData('DD/MM/YYYY').formatar('2026-01-15')
   * // Retorna: "15/01/2026"
   */
  formatar(valor: any): string {
    if (!valor) {
      return "";
    }

    let data: Date;

    try {
      if (typeof valor === "string") {
        data = new Date(valor + "T00:00:00Z");
      } else if (valor instanceof Date) {
        data = valor;
      } else {
        return String(valor);
      }

      if (isNaN(data.getTime())) {
        return String(valor);
      }

      switch (this.formato) {
        case "DD/MM/YYYY": {
          const dia = String(data.getUTCDate()).padStart(2, "0");
          const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
          const ano = data.getUTCFullYear();
          return `${dia}/${mes}/${ano}`;
        }

        case "YYYY-MM-DD": {
          const ano = data.getUTCFullYear();
          const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
          const dia = String(data.getUTCDate()).padStart(2, "0");
          return `${ano}-${mes}-${dia}`;
        }

        case "longBR": {
          return data.toLocaleDateString(this.locale, {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          });
        }

        default:
          return data.toLocaleDateString(this.locale);
      }
    } catch {
      return String(valor);
    }
  }

  /**
   * Converte string formatada para Date
   *
   * @param valor - String em formato configurado
   * @returns Date ou null
   */
  desformatar(valor: string): Date | null {
    try {
      let partes: string[];
      let dia, mes, ano;

      if (this.formato === "DD/MM/YYYY") {
        partes = valor.split("/");
        dia = parseInt(partes[0], 10);
        mes = parseInt(partes[1], 10);
        ano = parseInt(partes[2], 10);
      } else if (this.formato === "YYYY-MM-DD") {
        partes = valor.split("-");
        ano = parseInt(partes[0], 10);
        mes = parseInt(partes[1], 10);
        dia = parseInt(partes[2], 10);
      } else {
        return new Date(valor);
      }

      return new Date(ano, mes - 1, dia);
    } catch {
      return null;
    }
  }

  /**
   * Define formato de data
   */
  comFormato(
    formato: "DD/MM/YYYY" | "YYYY-MM-DD" | "longBR",
  ): FormatadorData {
    this.formato = formato;
    return this;
  }
}

/**
 * FormatadorPercentual - Formatação de percentuais
 *
 * Suporta precisão configurável e símbolo %
 */
export class FormatadorPercentual implements IFormatador {
  private precisao: number;
  private incluirSimbolo: boolean;
  private multiplicar: boolean; // 0.5 -> 50% ou 0.5 -> 0.5%

  constructor(
    precisao: number = 2,
    incluirSimbolo: boolean = true,
    multiplicar: boolean = true,
  ) {
    this.precisao = precisao;
    this.incluirSimbolo = incluirSimbolo;
    this.multiplicar = multiplicar;
  }

  /**
   * Formata valor como percentual
   *
   * @param valor - Valor decimal (0.5 = 50%)
   * @returns String formatada como percentual
   *
   * @example
   * new FormatadorPercentual().formatar(0.75)
   * // Retorna: "75.00%"
   */
  formatar(valor: any): string {
    if (valor === null || valor === undefined) {
      return "";
    }

    const num = Number(valor);
    if (isNaN(num)) {
      return String(valor);
    }

    const multiplo = this.multiplicar ? num * 100 : num;
    const formatado = multiplo.toFixed(this.precisao);
    const simbolo = this.incluirSimbolo ? "%" : "";

    return `${formatado}${simbolo}`;
  }

  /**
   * Remove formatação de percentual e retorna decimal
   *
   * @param valor - String formatada como percentual
   * @returns Número decimal
   */
  desformatar(valor: string): number {
    const limpo = valor.replace(/[%\s]/g, "");
    const num = parseFloat(limpo);
    return this.multiplicar ? num / 100 : num;
  }

  /**
   * Define precisão
   */
  comPrecisao(precisao: number): FormatadorPercentual {
    this.precisao = precisao;
    return this;
  }
}

/**
 * FormatadorSaldo - Formatação de saldos contábeis
 *
 * Suporta:
 * - Negativo em vermelho (simulado com prefixo)
 * - Formatação de moeda
 * - Indicador de positivo/negativo
 */
export class FormatadorSaldo implements IFormatador {
  private moeda: "BRL" | "USD" | "EUR";
  private casasDecimais: number;
  private indicarSinal: boolean;

  constructor(
    moeda: "BRL" | "USD" | "EUR" = "BRL",
    casasDecimais: number = 2,
    indicarSinal: boolean = true,
  ) {
    this.moeda = moeda;
    this.casasDecimais = casasDecimais;
    this.indicarSinal = indicarSinal;
  }

  /**
   * Formata saldo com indicação de positivo/negativo
   *
   * @param valor - Valor do saldo
   * @returns String formatada com indicação
   *
   * @example
   * new FormatadorSaldo().formatar(-1500)
   * // Retorna: "R$ -1.500,00" ou "DEV R$ 1.500,00"
   */
  formatar(valor: any): string {
    if (valor === null || valor === undefined) {
      return "";
    }

    const num = Number(valor);
    if (isNaN(num)) {
      return String(valor);
    }

    const formatador = new FormatadorMoeda(this.moeda, this.casasDecimais);
    const sinal = num < 0 ? "-" : "";
    const absoluto = Math.abs(num);
    const formatado = formatador.formatar(absoluto);

    if (this.indicarSinal) {
      return num < 0 ? `DEV ${formatado}` : `CRE ${formatado}`;
    }

    return `${sinal}${formatado}`;
  }

  /**
   * Remove formatação de saldo
   */
  desformatar(valor: string): number {
    const formatador = new FormatadorMoeda(this.moeda, this.casasDecimais);
    const limpo = valor.replace(/^(DEV|CRE)\s+/, "");
    return valor.startsWith("DEV") ? -formatador.desformatar(limpo) : formatador.desformatar(limpo);
  }
}

/**
 * FormatadorHashAuditoria - Formatação de hash para auditoria
 *
 * Formata hash hexadecimal com:
 * - Segmentação visual (grupos de 8 caracteres)
 * - Conversão para maiúsculas
 * - Validação de integridade
 */
export class FormatadorHashAuditoria implements IFormatador {
  private comprimento: number;
  private segmentar: boolean;

  constructor(comprimento: number = 32, segmentar: boolean = true) {
    this.comprimento = comprimento;
    this.segmentar = segmentar;
  }

  /**
   * Formata hash para apresentação
   *
   * @param valor - String hash
   * @returns Hash formatado
   *
   * @example
   * new FormatadorHashAuditoria().formatar('abc123def456')
   * // Retorna: "ABC123DE F456    "
   */
  formatar(valor: any): string {
    if (!valor) {
      return "";
    }

    const str = String(valor).toUpperCase();

    if (!this.segmentar) {
      return str;
    }

    // Agrupar em segmentos de 8 caracteres
    const segmentos: string[] = [];
    for (let i = 0; i < str.length; i += 8) {
      segmentos.push(str.substring(i, i + 8));
    }

    return segmentos.join(" ");
  }

  /**
   * Remove formatação de hash
   */
  desformatar(valor: string): string {
    return valor.replace(/\s+/g, "").toUpperCase();
  }

  /**
   * Valida se hash é válido (hexadecimal)
   */
  validar(valor: string): boolean {
    const hash = this.desformatar(valor);
    return /^[0-9A-F]*$/.test(hash);
  }

  /**
   * Calcula checksum do hash para validação
   */
  calcularChecksum(valor: string): string {
    const hash = this.desformatar(valor);
    let checksum = 0;

    for (let i = 0; i < hash.length; i++) {
      const char = hash.charCodeAt(i);
      checksum = (checksum << 5) - checksum + char;
      checksum = checksum & checksum; // 32-bit
    }

    return Math.abs(checksum).toString(16).toUpperCase();
  }
}

/**
 * FormatadorInteiro - Formatação de números inteiros
 *
 * Suporta separador de milhar
 */
export class FormatadorInteiro implements IFormatador {
  private incluirSeparador: boolean;

  constructor(incluirSeparador: boolean = true) {
    this.incluirSeparador = incluirSeparador;
  }

  /**
   * Formata número inteiro com separador de milhar
   *
   * @param valor - Número inteiro
   * @returns String formatada
   *
   * @example
   * new FormatadorInteiro().formatar(1500)
   * // Retorna: "1.500"
   */
  formatar(valor: any): string {
    if (valor === null || valor === undefined) {
      return "";
    }

    const num = Number(valor);
    if (isNaN(num)) {
      return String(valor);
    }

    const inteiro = Math.floor(num);

    if (!this.incluirSeparador) {
      return String(inteiro);
    }

    return inteiro.toLocaleString("pt-BR");
  }

  /**
   * Remove formatação
   */
  desformatar(valor: string): number {
    const limpo = valor.replace(/\./g, "");
    return parseInt(limpo, 10);
  }
}

/**
 * Factory de formatadores
 */
export class FormatadorFactory {
  static criar(tipo: string, opcoes?: any): IFormatador {
    switch (tipo.toLowerCase()) {
      case "moeda":
        return new FormatadorMoeda(opcoes?.moeda, opcoes?.casasDecimais);
      case "data":
        return new FormatadorData(opcoes?.formato);
      case "percentual":
        return new FormatadorPercentual(opcoes?.precisao, opcoes?.simbolo);
      case "saldo":
        return new FormatadorSaldo(opcoes?.moeda, opcoes?.casasDecimais);
      case "hash":
        return new FormatadorHashAuditoria(opcoes?.comprimento);
      case "inteiro":
        return new FormatadorInteiro(opcoes?.separador);
      default:
        throw new Error(`Formatador desconhecido: ${tipo}`);
    }
  }

  /**
   * Retorna formatador padrão para tipo de coluna
   */
  static paraTipoColunaRelatorio(
    tipo: "moeda" | "data" | "percentual" | "inteiro" | "texto",
  ): IFormatador | null {
    switch (tipo) {
      case "moeda":
        return new FormatadorMoeda("BRL", 2);
      case "data":
        return new FormatadorData("DD/MM/YYYY");
      case "percentual":
        return new FormatadorPercentual(2);
      case "inteiro":
        return new FormatadorInteiro(true);
      case "texto":
      default:
        return null;
    }
  }
}

export default {
  FormatadorMoeda,
  FormatadorData,
  FormatadorPercentual,
  FormatadorSaldo,
  FormatadorHashAuditoria,
  FormatadorInteiro,
  FormatadorFactory,
};
