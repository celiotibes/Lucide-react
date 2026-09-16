/**
 * RelatorioBuilder - Foundation Layer for Report Generation
 *
 * Provides fluent API for building reports with chaining methods,
 * multiple output formats (JSON, CSV, PDF), and template support.
 *
 * Base infrastructure for Phase 3b/3c/3d reporting systems.
 *
 * @example
 * const relatorio = new RelatorioBuilder('Relatório de Apontamentos')
 *   .comPeriodo(2026, 1)
 *   .comFiltroOrigem('apontamento_prestador')
 *   .comCentroCusto('CC-001')
 *   .comFormatacao({ moeda: 'BRL', dataFormat: 'DD/MM/YYYY' })
 *   .gerarJSON();
 */

import type { Database } from "sql.js";

/** Configuração de período contábil */
export interface ConfiguracaoPeriodo {
  ano: number;
  mes: number;
  dataInicio?: string;
  dataFim?: string;
}

/** Filtros de origem de dados */
export interface FiltroOrigem {
  modulo: string;
  origem_id?: number;
  descricao?: string;
}

/** Configuração de centro de custo */
export interface ConfiguracaoCentroCusto {
  id: string;
  nome?: string;
  recursivar?: boolean;
}

/** Configuração de formatação */
export interface ConfiguracaoFormatacao {
  moeda?: "BRL" | "USD" | "EUR";
  dataFormat?: "DD/MM/YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY";
  percentualPrecisao?: number;
  casasDecimais?: number;
  incluirHashAuditoria?: boolean;
}

/** Coluna de relatório */
export interface ColunasRelatorio {
  nome: string;
  tipo: "texto" | "moeda" | "data" | "percentual" | "inteiro";
  largura?: number;
  alinhamento?: "esquerda" | "centro" | "direita";
  formatador?: (valor: any) => string;
}

/** Agregação de dados */
export interface Agregacao {
  tipo: "SUM" | "AVG" | "COUNT" | "MAX" | "MIN";
  campo: string;
  alias: string;
  condicao?: string;
}

/** Validação de dados */
export interface Validacao {
  campo: string;
  tipo: "requerido" | "faixa" | "formato" | "customizado";
  parametros?: any;
  mensagem?: string;
}

/** Estrutura de header do relatório */
export interface HeaderRelatorio {
  titulo: string;
  subtitulo?: string;
  empresa?: string;
  periodo?: string;
  dataGeracao?: string;
  usuario?: string;
  versao?: string;
}

/** Estrutura de metadata do relatório */
export interface MetadadosRelatorio {
  modulo: string;
  versao: string;
  tipoRelatorio: string;
  dataGeracao: string;
  usuario?: string;
  totalRegistros: number;
  hashAuditoria?: string;
  parametrosFiltro: Record<string, any>;
}

/** Estrutura de summary/resumo */
export interface SummaryRelatorio {
  totalLinhas: number;
  totalValor?: number;
  totalDebito?: number;
  totalCredito?: number;
  saldoFinal?: number;
  mediaPorRegistro?: number;
  agregacoes?: Record<string, any>;
}

/** Estrutura de footer do relatório */
export interface FooterRelatorio {
  mensagemFinal?: string;
  assinatura?: string;
  carimboDado?: string;
  dataHora?: string;
  versaoSistema?: string;
}

/** Estrutura completa do relatório */
export interface EstrutuuraRelatorio {
  header: HeaderRelatorio;
  metadata: MetadadosRelatorio;
  colunas: ColunasRelatorio[];
  corpo: Array<Record<string, any>>;
  summary: SummaryRelatorio;
  footer: FooterRelatorio;
}

/**
 * RelatorioBuilder - Classe base para construção de relatórios
 *
 * Implementa padrão Builder com API fluente para definir:
 * - Período contábil
 * - Filtros de origem
 * - Centro de custo
 * - Formatação de dados
 *
 * Suporta saída em múltiplos formatos: JSON, CSV, PDF
 */
export class RelatorioBuilder {
  private titulo: string;
  private periodo?: ConfiguracaoPeriodo;
  private filtroOrigem?: FiltroOrigem;
  private centroCusto?: ConfiguracaoCentroCusto;
  private formatacao: ConfiguracaoFormatacao;
  private colunas: ColunasRelatorio[] = [];
  private agregacoes: Agregacao[] = [];
  private validacoes: Validacao[] = [];
  private corpoRelatorio: Array<Record<string, any>> = [];
  private db?: Database;

  /**
   * Cria nova instância de RelatorioBuilder
   *
   * @param titulo - Título do relatório
   * @param db - Instância do banco de dados (opcional)
   */
  constructor(titulo: string, db?: Database) {
    this.titulo = titulo;
    this.db = db;
    this.formatacao = {
      moeda: "BRL",
      dataFormat: "DD/MM/YYYY",
      casasDecimais: 2,
      percentualPrecisao: 2,
      incluirHashAuditoria: true,
    };
  }

  /**
   * Define o período contábil para o relatório
   *
   * @param ano - Ano fiscal
   * @param mes - Mês (1-12)
   * @param dataInicio - Data de início (opcional)
   * @param dataFim - Data de fim (opcional)
   * @returns this para encadeamento
   */
  comPeriodo(
    ano: number,
    mes: number,
    dataInicio?: string,
    dataFim?: string,
  ): RelatorioBuilder {
    this.periodo = {
      ano,
      mes,
      dataInicio,
      dataFim,
    };
    return this;
  }

  /**
   * Define filtro de origem de dados
   *
   * @param modulo - Módulo de origem (e.g., 'apontamento_prestador', 'advocacia')
   * @param origemId - ID específico de origem (opcional)
   * @param descricao - Descrição do filtro (opcional)
   * @returns this para encadeamento
   */
  comFiltroOrigem(
    modulo: string,
    origemId?: number,
    descricao?: string,
  ): RelatorioBuilder {
    this.filtroOrigem = {
      modulo,
      origem_id: origemId,
      descricao,
    };
    return this;
  }

  /**
   * Define filtro de centro de custo
   *
   * @param id - ID ou código do centro de custo
   * @param nome - Nome do centro de custo (opcional)
   * @param recursivo - Incluir sub-centros (opcional, default: false)
   * @returns this para encadeamento
   */
  comCentroCusto(
    id: string,
    nome?: string,
    recursivo: boolean = false,
  ): RelatorioBuilder {
    this.centroCusto = {
      id,
      nome,
      recursivar: recursivo,
    };
    return this;
  }

  /**
   * Define formatação de dados do relatório
   *
   * @param formatacao - Configurações de formatação
   * @returns this para encadeamento
   */
  comFormatacao(formatacao: Partial<ConfiguracaoFormatacao>): RelatorioBuilder {
    this.formatacao = {
      ...this.formatacao,
      ...formatacao,
    };
    return this;
  }

  /**
   * Define colunas do relatório
   *
   * @param colunas - Array de definições de coluna
   * @returns this para encadeamento
   */
  comColunas(colunas: ColunasRelatorio[]): RelatorioBuilder {
    this.colunas = colunas;
    return this;
  }

  /**
   * Adiciona coluna única ao relatório
   *
   * @param coluna - Definição de coluna
   * @returns this para encadeamento
   */
  adicionarColuna(coluna: ColunasRelatorio): RelatorioBuilder {
    this.colunas.push(coluna);
    return this;
  }

  /**
   * Define agregações de dados
   *
   * @param agregacoes - Array de agregações
   * @returns this para encadeamento
   */
  comAgregacoes(agregacoes: Agregacao[]): RelatorioBuilder {
    this.agregacoes = agregacoes;
    return this;
  }

  /**
   * Adiciona agregação única
   *
   * @param agregacao - Definição de agregação
   * @returns this para encadeamento
   */
  adicionarAgregacao(agregacao: Agregacao): RelatorioBuilder {
    this.agregacoes.push(agregacao);
    return this;
  }

  /**
   * Define validações de dados
   *
   * @param validacoes - Array de validações
   * @returns this para encadeamento
   */
  comValidacoes(validacoes: Validacao[]): RelatorioBuilder {
    this.validacoes = validacoes;
    return this;
  }

  /**
   * Adiciona validação única
   *
   * @param validacao - Definição de validação
   * @returns this para encadeamento
   */
  adicionarValidacao(validacao: Validacao): RelatorioBuilder {
    this.validacoes.push(validacao);
    return this;
  }

  /**
   * Define corpo/dados do relatório
   *
   * @param dados - Array de linhas do relatório
   * @returns this para encadeamento
   */
  comDados(dados: Array<Record<string, any>>): RelatorioBuilder {
    this.corpoRelatorio = dados;
    return this;
  }

  /**
   * Calcula agregações (SUM, AVG, COUNT, MAX, MIN)
   *
   * @returns Objeto com resultados das agregações
   */
  private calcularAgregacoes(): Record<string, any> {
    const resultado: Record<string, any> = {};

    for (const agregacao of this.agregacoes) {
      let valor: any;

      switch (agregacao.tipo) {
        case "SUM":
          valor = this.corpoRelatorio.reduce((acc, row) => {
            const v = row[agregacao.campo];
            return acc + (typeof v === "number" ? v : 0);
          }, 0);
          break;

        case "AVG":
          const soma = this.corpoRelatorio.reduce((acc, row) => {
            const v = row[agregacao.campo];
            return acc + (typeof v === "number" ? v : 0);
          }, 0);
          valor = this.corpoRelatorio.length > 0 ? soma / this.corpoRelatorio.length : 0;
          break;

        case "COUNT":
          valor = this.corpoRelatorio.filter((row) => {
            if (!agregacao.condicao) return true;
            // Avaliação simples de condição
            return row[agregacao.campo] !== null && row[agregacao.campo] !== undefined;
          }).length;
          break;

        case "MAX":
          valor = Math.max(
            ...this.corpoRelatorio.map((row) => {
              const v = row[agregacao.campo];
              return typeof v === "number" ? v : Number.NEGATIVE_INFINITY;
            }),
          );
          break;

        case "MIN":
          valor = Math.min(
            ...this.corpoRelatorio.map((row) => {
              const v = row[agregacao.campo];
              return typeof v === "number" ? v : Number.POSITIVE_INFINITY;
            }),
          );
          break;
      }

      resultado[agregacao.alias] = valor;
    }

    return resultado;
  }

  /**
   * Gera hash de auditoria para integridade do relatório
   *
   * @returns String hash SHA-256 simulado
   */
  private gerarHashAuditoria(): string {
    const conteudo = JSON.stringify(this.corpoRelatorio);
    // Simulação simples - em produção usar crypto.subtle.digest()
    let hash = 0;
    for (let i = 0; i < conteudo.length; i++) {
      const char = conteudo.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Converter para 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Cria estrutura completa do relatório
   *
   * @returns Objeto com estrutura completa
   */
  private criarEstrutura(): EstrutuuraRelatorio {
    const agora = new Date();
    const dataGeracao = agora.toISOString();
    const agregacoes = this.calcularAgregacoes();

    // Calcular summary
    const summary: SummaryRelatorio = {
      totalLinhas: this.corpoRelatorio.length,
      agregacoes,
    };

    // Tentar extrair totais comuns
    if (agregacoes.total_valor) {
      summary.totalValor = agregacoes.total_valor;
    }
    if (agregacoes.total_debito) {
      summary.totalDebito = agregacoes.total_debito;
    }
    if (agregacoes.total_credito) {
      summary.totalCredito = agregacoes.total_credito;
    }
    if (agregacoes.saldo_final) {
      summary.saldoFinal = agregacoes.saldo_final;
    }

    const estrutura: EstrutuuraRelatorio = {
      header: {
        titulo: this.titulo,
        periodo: this.periodo
          ? `${String(this.periodo.mes).padStart(2, "0")}/${this.periodo.ano}`
          : undefined,
        dataGeracao,
      },
      metadata: {
        modulo: this.filtroOrigem?.modulo || "generico",
        versao: "1.0",
        tipoRelatorio: this.titulo,
        dataGeracao,
        totalRegistros: this.corpoRelatorio.length,
        hashAuditoria: this.formatacao.incluirHashAuditoria
          ? this.gerarHashAuditoria()
          : undefined,
        parametrosFiltro: {
          periodo: this.periodo,
          filtroOrigem: this.filtroOrigem,
          centroCusto: this.centroCusto,
        },
      },
      colunas: this.colunas,
      corpo: this.corpoRelatorio,
      summary,
      footer: {
        dataHora: new Date().toLocaleString("pt-BR"),
        versaoSistema: "1.0",
      },
    };

    return estrutura;
  }

  /**
   * Gera relatório em formato JSON
   *
   * @returns String JSON com estrutura completa do relatório
   */
  gerarJSON(): string {
    const estrutura = this.criarEstrutura();
    return JSON.stringify(estrutura, null, 2);
  }

  /**
   * Gera relatório em formato CSV
   *
   * @param incluirHeader - Incluir linha de cabeçalho (default: true)
   * @returns String CSV com dados do relatório
   */
  gerarCSV(incluirHeader: boolean = true): string {
    const linhas: string[] = [];

    // Header com metadados
    linhas.push(`# Relatório: ${this.titulo}`);
    linhas.push(`# Período: ${this.periodo?.mes}/${this.periodo?.ano}`);
    linhas.push(`# Data de Geração: ${new Date().toLocaleString("pt-BR")}`);
    linhas.push("");

    // Cabeçalho de colunas
    if (incluirHeader && this.colunas.length > 0) {
      const nomesColunas = this.colunas.map((c) => `"${c.nome}"`);
      linhas.push(nomesColunas.join(","));
    }

    // Dados
    for (const linha of this.corpoRelatorio) {
      const valores = this.colunas.map((coluna) => {
        const valor = linha[coluna.nome];
        if (valor === null || valor === undefined) {
          return "";
        }
        const strValor = String(valor);
        // Escapar aspas duplas
        const escapado = strValor.replace(/"/g, '""');
        return `"${escapado}"`;
      });
      linhas.push(valores.join(","));
    }

    // Footer com resumo
    linhas.push("");
    linhas.push("# RESUMO");
    const agregacoes = this.calcularAgregacoes();
    for (const [chave, valor] of Object.entries(agregacoes)) {
      linhas.push(`# ${chave}: ${valor}`);
    }

    return linhas.join("\n");
  }

  /**
   * Gera relatório em formato PDF (skeleton)
   *
   * Nota: Implementação completa requer biblioteca externa (e.g., PDFKit)
   * Este método fornece estrutura base
   *
   * @returns Objeto com estrutura para PDF
   */
  gerarPDF(): Record<string, any> {
    const estrutura = this.criarEstrutura();
    return {
      tipo: "pdf",
      titulo: this.titulo,
      estrutura: estrutura,
      observacao: "Para gerar PDF, use biblioteca externa como PDFKit ou Puppeteer",
    };
  }

  /**
   * Retorna configuração atual do builder
   *
   * @returns Objeto com todas as configurações
   */
  obterConfiguracao(): Record<string, any> {
    return {
      titulo: this.titulo,
      periodo: this.periodo,
      filtroOrigem: this.filtroOrigem,
      centroCusto: this.centroCusto,
      formatacao: this.formatacao,
      totalColunas: this.colunas.length,
      totalAgregacoes: this.agregacoes.length,
      totalValidacoes: this.validacoes.length,
      totalLinhas: this.corpoRelatorio.length,
    };
  }

  /**
   * Valida dados do relatório
   *
   * @returns Array com erros encontrados (vazio se válido)
   */
  validarDados(): string[] {
    const erros: string[] = [];

    // Validar período
    if (!this.periodo) {
      erros.push("Período não definido");
    }

    // Validar colunas
    if (this.colunas.length === 0 && this.corpoRelatorio.length > 0) {
      erros.push("Nenhuma coluna definida para os dados");
    }

    // Validar dados
    for (const validacao of this.validacoes) {
      for (const linha of this.corpoRelatorio) {
        const valor = linha[validacao.campo];

        switch (validacao.tipo) {
          case "requerido":
            if (valor === null || valor === undefined) {
              erros.push(`Campo obrigatório '${validacao.campo}' não preenchido`);
            }
            break;

          case "faixa":
            if (typeof valor === "number") {
              if (
                validacao.parametros?.min !== undefined &&
                valor < validacao.parametros.min
              ) {
                erros.push(
                  `Campo '${validacao.campo}' abaixo do mínimo: ${validacao.parametros.min}`,
                );
              }
              if (
                validacao.parametros?.max !== undefined &&
                valor > validacao.parametros.max
              ) {
                erros.push(
                  `Campo '${validacao.campo}' acima do máximo: ${validacao.parametros.max}`,
                );
              }
            }
            break;

          case "formato":
            // Validação básica de formato (simplificada)
            if (validacao.parametros?.regex && valor) {
              const regex = new RegExp(validacao.parametros.regex);
              if (!regex.test(String(valor))) {
                erros.push(`Campo '${validacao.campo}' possui formato inválido`);
              }
            }
            break;
        }
      }
    }

    return erros;
  }

  /**
   * Limpa dados e retorna a um estado inicial
   *
   * @returns this para encadeamento
   */
  limpar(): RelatorioBuilder {
    this.corpoRelatorio = [];
    this.colunas = [];
    this.agregacoes = [];
    this.validacoes = [];
    return this;
  }

  /**
   * Clone da instância atual
   *
   * @returns Nova instância com mesmas configurações
   */
  clonar(): RelatorioBuilder {
    const novo = new RelatorioBuilder(this.titulo, this.db);
    novo.periodo = this.periodo ? { ...this.periodo } : undefined;
    novo.filtroOrigem = this.filtroOrigem ? { ...this.filtroOrigem } : undefined;
    novo.centroCusto = this.centroCusto ? { ...this.centroCusto } : undefined;
    novo.formatacao = { ...this.formatacao };
    novo.colunas = JSON.parse(JSON.stringify(this.colunas));
    novo.agregacoes = JSON.parse(JSON.stringify(this.agregacoes));
    novo.validacoes = JSON.parse(JSON.stringify(this.validacoes));
    novo.corpoRelatorio = JSON.parse(JSON.stringify(this.corpoRelatorio));
    return novo;
  }
}

export default RelatorioBuilder;
