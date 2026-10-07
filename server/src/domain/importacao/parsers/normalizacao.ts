/**
 * Utilitários para normalização de transações
 *
 * Converte TransacaoBruta para formato padronizado interno
 * Aplica validações, limpezas e extrações de metadados
 */

import type { TransacaoBruta, LinhaImportacao } from "../tipos.js";

/**
 * Padrões para extrair documentos (CNPJ/CPF)
 */
const PADRAO_CNPJ = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{14}/g;
const PADRAO_CPF = /\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11}/g;

/**
 * Tipo de transação com inferência inteligente
 */
export enum TipoTransacao {
  ENTRADA = "entrada",
  SAIDA = "saida",
}

/**
 * Normalizador de transações
 */
export class NormalizadorTransacao {
  /**
   * Normaliza uma data para ISO 8601
   */
  static normalizarData(data: string | undefined): string | null {
    if (!data) return null;

    const d = data.trim();

    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const partes = d.split("-");
      const date = new Date(
        parseInt(partes[0]),
        parseInt(partes[1]) - 1,
        parseInt(partes[2]),
      );
      return this.dataValida(date) ? d : null;
    }

    // DD/MM/YYYY
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) {
      const partes = d.split("/");
      const date = new Date(
        parseInt(partes[2]),
        parseInt(partes[1]) - 1,
        parseInt(partes[0]),
      );
      return this.dataValida(date)
        ? `${partes[2]}-${partes[1].padStart(2, "0")}-${partes[0].padStart(2, "0")}`
        : null;
    }

    // YYYYMMDD
    if (/^\d{8}$/.test(d)) {
      const ano = d.substring(0, 4);
      const mes = d.substring(4, 6);
      const dia = d.substring(6, 8);
      const date = new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
      return this.dataValida(date) ? `${ano}-${mes}-${dia}` : null;
    }

    // YYMMDD (assumir 20XX)
    if (/^\d{6}$/.test(d)) {
      const yy = parseInt(d.substring(0, 2));
      const ano = yy > 50 ? 1900 + yy : 2000 + yy;
      const mes = d.substring(2, 4);
      const dia = d.substring(4, 6);
      const date = new Date(ano, parseInt(mes) - 1, parseInt(dia));
      return this.dataValida(date)
        ? `${ano}-${mes}-${dia}`
        : null;
    }

    return null;
  }

  /**
   * Valida se data é válida
   */
  private static dataValida(date: Date): boolean {
    return date instanceof Date && !isNaN(date.getTime());
  }

  /**
   * Normaliza valor monetário
   */
  static normalizarValor(
    valor: number | string | undefined,
    separadorDecimal: string = ".",
  ): number | null {
    if (valor === undefined || valor === null || valor === "") return null;

    // Já é número
    if (typeof valor === "number") {
      return isNaN(valor) ? null : valor;
    }

    let v = String(valor).trim();

    // Remover parênteses e símbolos de moeda
    v = v.replace(/[R$€£¥()]/g, "").trim();

    // Detectar sinal
    const negativo = v.startsWith("-");
    v = v.replace(/^-/, "");

    // Normalizar separadores
    // Substituir último ponto por decimal se houver vírgula depois
    const ultimaPontoIdx = v.lastIndexOf(".");
    const ultimaVirgulaIdx = v.lastIndexOf(",");

    if (ultimaVirgulaIdx > ultimaPontoIdx) {
      // Vírgula é decimal
      v = v.replace(/\./g, "").replace(",", ".");
    } else if (ultimaPontoIdx > -1) {
      // Ponto é decimal
      v = v.replace(/,/g, "");
    }

    const num = parseFloat(v);
    if (isNaN(num)) return null;

    return negativo ? -Math.abs(num) : Math.abs(num);
  }

  /**
   * Normaliza descrição (máx 500 caracteres, sem caracteres especiais excessivos)
   */
  static normalizarDescricao(desc: string | undefined): string {
    if (!desc) return "";

    let normalizado = desc.trim();

    // Remover quebras de linha extras
    normalizado = normalizado.replace(/\s+/g, " ");

    // Normalizar caracteres especiais
    normalizado = normalizado
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      .replace(/–/g, "-");

    // Limitar a 500 caracteres
    if (normalizado.length > 500) {
      normalizado = normalizado.substring(0, 497) + "...";
    }

    return normalizado;
  }

  /**
   * Extrai CNPJ ou CPF da descrição
   */
  static extrairDocumento(desc: string): { tipo: "CNPJ" | "CPF"; valor: string } | null {
    if (!desc) return null;

    // Procurar CNPJ
    const cnpjMatch = desc.match(PADRAO_CNPJ);
    if (cnpjMatch) {
      const cnpj = cnpjMatch[0];
      // Validar CNPJ básico
      if (this.validarCNPJ(cnpj)) {
        return { tipo: "CNPJ", valor: cnpj };
      }
    }

    // Procurar CPF
    const cpfMatch = desc.match(PADRAO_CPF);
    if (cpfMatch) {
      const cpf = cpfMatch[0];
      // Validar CPF básico
      if (this.validarCPF(cpf)) {
        return { tipo: "CPF", valor: cpf };
      }
    }

    return null;
  }

  /**
   * Valida CNPJ (verificação básica de dígitos)
   */
  private static validarCNPJ(cnpj: string): boolean {
    const numeros = cnpj.replace(/\D/g, "");
    return numeros.length === 14 && /^\d+$/.test(numeros);
  }

  /**
   * Valida CPF (verificação básica de dígitos)
   */
  private static validarCPF(cpf: string): boolean {
    const numeros = cpf.replace(/\D/g, "");
    return numeros.length === 11 && /^\d+$/.test(numeros);
  }

  /**
   * Detecta tipo de transação automaticamente
   */
  static detectarTipo(
    desc: string,
    valorOriginal?: number,
  ): TipoTransacao {
    const lower = desc.toLowerCase();

    // Palavras-chave para entrada
    const palavrasEntrada = [
      "credito",
      "deposito",
      "credit",
      "entrada",
      "pix recebido",
      "ted recebido",
      "doc recebido",
      "transferencia recebida",
      "saque negado",
      "devolução",
      "reembolso",
      "juros",
      "rendimento",
    ];

    // Palavras-chave para saída
    const palavrasSaida = [
      "debito",
      "saque",
      "debit",
      "saida",
      "pix enviado",
      "ted enviado",
      "doc enviado",
      "transferencia",
      "pagamento",
      "boleto",
      "tarifa",
      "taxa",
      "juros sobre",
      "emprestimo",
      "compra",
    ];

    for (const palavra of palavrasEntrada) {
      if (lower.includes(palavra)) {
        return TipoTransacao.ENTRADA;
      }
    }

    for (const palavra of palavrasSaida) {
      if (lower.includes(palavra)) {
        return TipoTransacao.SAIDA;
      }
    }

    // Inferir do sinal do valor se fornecido
    if (valorOriginal !== undefined) {
      return valorOriginal >= 0 ? TipoTransacao.ENTRADA : TipoTransacao.SAIDA;
    }

    // Default: saida
    return TipoTransacao.SAIDA;
  }

  /**
   * Extrai categoria provável da descrição
   */
  static extrairCategoria(desc: string): string | null {
    const lower = desc.toLowerCase();

    const categorias: Record<string, string[]> = {
      "Alimentação": [
        "restaurante",
        "pizzaria",
        "padaria",
        "lanchonete",
        "mercado",
        "supermercado",
        "açougue",
      ],
      "Transporte": [
        "uber",
        "taxi",
        "ônibus",
        "metrô",
        "táxi",
        "gasolina",
        "combustível",
        "estacionamento",
        "pedágio",
      ],
      "Moradia": [
        "aluguel",
        "condomínio",
        "agua",
        "energia",
        "luz",
        "telefone",
        "internet",
      ],
      "Saúde": [
        "farmácia",
        "medicamento",
        "médico",
        "hospital",
        "dentista",
        "clinica",
      ],
      "Educação": [
        "escola",
        "universidade",
        "cursos",
        "livros",
        "materiais escolares",
      ],
      "Lazer": [
        "cinema",
        "bar",
        "shows",
        "viagem",
        "hotel",
        "passeio",
        "spotify",
        "netflix",
      ],
    };

    for (const [categoria, palavras] of Object.entries(categorias)) {
      if (palavras.some((p) => lower.includes(p))) {
        return categoria;
      }
    }

    return null;
  }

  /**
   * Normaliza transação bruta para formato de linha de importação
   */
  static normalizarParaLinha(
    bruta: TransacaoBruta,
    loteId: string,
    usuarioId: string,
  ): Omit<LinhaImportacao, "id" | "criado_em"> {
    return {
      lote_id: loteId,
      usuario_id: usuarioId,
      numero_linha: bruta.numero_linha || 0,

      data_transacao: bruta.data,
      valor: bruta.valor,
      descricao: this.normalizarDescricao(bruta.descricao),
      tipo_operacao: bruta.tipo_transacao,
      categoria: this.extrairCategoria(bruta.descricao),
      conta_bancaria: bruta.campos_adicionais?.conta_bancaria as string || undefined,

      status: "pendente",
      validacoes_executadas: JSON.stringify([]),
      erros_validacao: JSON.stringify([]),

      score_duplicata: 0,
      suspeita_duplicata: 0,

      atualizado_em: new Date().toISOString(),
    };
  }
}

/**
 * Funções de conveniência
 */
export const normalizarData = (data: string | undefined) =>
  NormalizadorTransacao.normalizarData(data);

export const normalizarValor = (
  valor: number | string | undefined,
  separador?: string,
) => NormalizadorTransacao.normalizarValor(valor, separador);

export const normalizarDescricao = (desc: string | undefined) =>
  NormalizadorTransacao.normalizarDescricao(desc);

export const extrairDocumento = (desc: string) =>
  NormalizadorTransacao.extrairDocumento(desc);

export const detectarTipo = (desc: string, valor?: number) =>
  NormalizadorTransacao.detectarTipo(desc, valor);

export const extrairCategoria = (desc: string) =>
  NormalizadorTransacao.extrairCategoria(desc);
