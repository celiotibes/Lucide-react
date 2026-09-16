/**
 * Analytics & Data Visualization (PHASE 5)
 * Chart generation, drill-down, and comparative analysis
 *
 * Chart Types:
 * - Line: Tendência de KPIs e receita
 * - Bar: Comparação entre períodos, módulos
 * - Pie: Distribuição de custos/receita
 * - Heatmap: Sazonalidade, padrões
 * - Scatter: Correlação entre variáveis
 * - Waterfall: Análise de impacto
 *
 * Análise Comparativa:
 * - Year-over-Year (YoY)
 * - Month-over-Month (MoM)
 * - Budget vs Actual
 * - Forecast com trend lines (linear, exponential)
 */

import { createHash } from "crypto";

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export type TipoGrafico =
  | "linha"
  | "barra"
  | "pizza"
  | "heatmap"
  | "scatter"
  | "waterfall";
export type TipoAnalise = "yoy" | "mom" | "budget_vs_actual" | "forecast";
export type TipoTrendline = "linear" | "exponencial" | "polinomial";

export interface DadosGrafico {
  labels: string[];
  series: {
    nome: string;
    dados: number[];
    cor?: string;
  }[];
  titulo: string;
  unidade?: string;
  data_geracao: string;
}

export interface AnaliseComparativa {
  tipo: TipoAnalise;
  periodo_atual: string;
  periodo_comparacao: string;
  dados_periodo_atual: number[];
  dados_periodo_comparacao: number[];
  variacao_percentual: number[];
  tendencia: string;
  insights: string[];
}

export interface Previsao {
  tipo_trendline: TipoTrendline;
  periodos_futuro: number;
  dados_historicos: number[];
  dados_previstos: number[];
  intervalo_confianca_superior: number[];
  intervalo_confianca_inferior: number[];
  confiabilidade: number;
}

export interface DadosDrillDown {
  nivel_atual: string;
  hierarquia: string[];
  filtros_aplicados: Record<string, any>;
  dados: Record<string, any>;
}

// ============================================================================
// CLASSE: GERENCIADOR DE ANALYTICS
// ============================================================================

export class AnalyticsVisualizacao {
  private cache_graficos: Map<string, DadosGrafico> = new Map();
  private cache_analises: Map<string, AnaliseComparativa> = new Map();
  private cache_previsoes: Map<string, Previsao> = new Map();

  /**
   * Gera gráfico baseado em dados e configuração
   */
  public gerarGrafico(config: {
    tipo: TipoGrafico;
    titulo: string;
    labels: string[];
    series: {
      nome: string;
      dados: number[];
      cor?: string;
    }[];
    unidade?: string;
  }): DadosGrafico {
    // Validação
    if (!config.tipo || !config.labels || !config.series || config.series.length === 0) {
      throw new Error("Configuração de gráfico inválida");
    }

    const grafico: DadosGrafico = {
      titulo: config.titulo,
      labels: config.labels,
      series: config.series.map((s) => ({
        nome: s.nome,
        dados: s.dados,
        cor: s.cor || this.gerarCorAutomatica(),
      })),
      unidade: config.unidade,
      data_geracao: new Date().toISOString(),
    };

    // Aplicar validações específicas do tipo
    this.validarGrafico(grafico, config.tipo);

    // Armazenar em cache
    const cache_key = this.gerarChaveCache(`grafico_${config.tipo}`, config.titulo);
    this.cache_graficos.set(cache_key, grafico);

    return grafico;
  }

  /**
   * Filtra dados para visualização
   */
  public filtrarDados(dados: any[], filtros: Record<string, any>): any[] {
    if (!dados || dados.length === 0) {
      return [];
    }

    let resultado = [...dados];

    // Aplicar filtros
    for (const [campo, valor] of Object.entries(filtros)) {
      if (Array.isArray(valor)) {
        // Filtro de múltiplos valores
        resultado = resultado.filter((item) => valor.includes(item[campo]));
      } else if (typeof valor === "object" && valor !== null) {
        // Filtro de intervalo (min/max)
        if (valor.min !== undefined) {
          resultado = resultado.filter((item) => item[campo] >= valor.min);
        }
        if (valor.max !== undefined) {
          resultado = resultado.filter((item) => item[campo] <= valor.max);
        }
      } else {
        // Filtro simples
        resultado = resultado.filter((item) => item[campo] === valor);
      }
    }

    return resultado;
  }

  /**
   * Análise comparativa (YoY, MoM, etc)
   */
  public analisarComparativamente(config: {
    tipo: TipoAnalise;
    dados_atual: number[];
    dados_anterior: number[];
    labels_periodos: string[];
  }): AnaliseComparativa {
    const variacao_percentual = config.dados_atual.map((valor, idx) => {
      const anterior = config.dados_anterior[idx];
      return anterior !== 0 ? ((valor - anterior) / Math.abs(anterior)) * 100 : 0;
    });

    // Calcular tendência
    const media_variacao = variacao_percentual.reduce((a, b) => a + b, 0) / variacao_percentual.length;
    const tendencia =
      media_variacao > 5
        ? "crescimento"
        : media_variacao < -5
          ? "declínio"
          : "estável";

    // Gerar insights
    const insights = this.gerarInsights(config.tipo, variacao_percentual, media_variacao);

    const analise: AnaliseComparativa = {
      tipo: config.tipo,
      periodo_atual: config.labels_periodos[0],
      periodo_comparacao: config.labels_periodos[1],
      dados_periodo_atual: config.dados_atual,
      dados_periodo_comparacao: config.dados_anterior,
      variacao_percentual,
      tendencia,
      insights,
    };

    // Armazenar em cache
    const cache_key = this.gerarChaveCache(`analise_${config.tipo}`, config.labels_periodos.join("_"));
    this.cache_analises.set(cache_key, analise);

    return analise;
  }

  /**
   * Gera previsão com trend line
   */
  public gerarPrevisao(config: {
    tipo_trendline: TipoTrendline;
    dados_historicos: number[];
    periodos_futuro: number;
  }): Previsao {
    const dados = config.dados_historicos;

    if (dados.length < 2) {
      throw new Error("Dados históricos insuficientes para previsão");
    }

    let dados_previstos: number[] = [];
    let intervalo_confianca_superior: number[] = [];
    let intervalo_confianca_inferior: number[] = [];

    switch (config.tipo_trendline) {
      case "linear":
        const regressao_linear = this.regressaoLinear(dados);
        for (let i = 0; i < config.periodos_futuro; i++) {
          const x = dados.length + i;
          const y = regressao_linear.a + regressao_linear.b * x;
          dados_previstos.push(Math.max(0, y));

          // Intervalo de confiança (±10%)
          intervalo_confianca_superior.push(y * 1.1);
          intervalo_confianca_inferior.push(Math.max(0, y * 0.9));
        }
        break;

      case "exponencial":
        const regressao_exp = this.regressaoExponencial(dados);
        for (let i = 0; i < config.periodos_futuro; i++) {
          const x = dados.length + i;
          const y = regressao_exp.a * Math.exp(regressao_exp.b * x);
          dados_previstos.push(Math.max(0, y));

          intervalo_confianca_superior.push(y * 1.15);
          intervalo_confianca_inferior.push(Math.max(0, y * 0.85));
        }
        break;

      case "polinomial":
        // Regressão polinomial grau 2
        const regressao_poli = this.regressaoPolinomial(dados, 2);
        for (let i = 0; i < config.periodos_futuro; i++) {
          const x = dados.length + i;
          const y =
            regressao_poli.a +
            regressao_poli.b * x +
            regressao_poli.c * Math.pow(x, 2);
          dados_previstos.push(Math.max(0, y));

          intervalo_confianca_superior.push(y * 1.2);
          intervalo_confianca_inferior.push(Math.max(0, y * 0.8));
        }
        break;
    }

    // Calcular confiabilidade
    const confiabilidade = this.calcularConfiabilidade(dados, dados_previstos);

    const previsao: Previsao = {
      tipo_trendline: config.tipo_trendline,
      periodos_futuro: config.periodos_futuro,
      dados_historicos: dados,
      dados_previstos,
      intervalo_confianca_superior,
      intervalo_confianca_inferior,
      confiabilidade,
    };

    // Armazenar em cache
    const cache_key = this.gerarChaveCache(
      `previsao_${config.tipo_trendline}`,
      config.periodos_futuro.toString()
    );
    this.cache_previsoes.set(cache_key, previsao);

    return previsao;
  }

  /**
   * Drill-down: navega através de hierarquia de dados
   * Exemplo: País -> Estado -> Cidade -> Transação
   */
  public drillDown(config: {
    hierarquia: string[];
    nivel_atual: number;
    filtros: Record<string, any>;
    dados_completos: Record<string, any>;
  }): DadosDrillDown {
    if (config.nivel_atual >= config.hierarquia.length) {
      throw new Error("Nível inválido na hierarquia");
    }

    return {
      nivel_atual: config.hierarquia[config.nivel_atual],
      hierarquia: config.hierarquia,
      filtros_aplicados: config.filtros,
      dados: this.extrairDadosNivel(
        config.dados_completos,
        config.hierarquia,
        config.nivel_atual
      ),
    };
  }

  /**
   * Drill-up: volta para nível anterior
   */
  public drillUp(dados_drill_down: DadosDrillDown): DadosDrillDown | null {
    if (dados_drill_down.hierarquia.indexOf(dados_drill_down.nivel_atual) === 0) {
      return null; // Já está no topo
    }

    const nivel_anterior = dados_drill_down.hierarquia.indexOf(dados_drill_down.nivel_atual) - 1;

    return {
      nivel_atual: dados_drill_down.hierarquia[nivel_anterior],
      hierarquia: dados_drill_down.hierarquia,
      filtros_aplicados: dados_drill_down.filtros_aplicados,
      dados: {},
    };
  }

  /**
   * Exporta dados para CSV
   */
  public exportarCSV(grafico: DadosGrafico): string {
    const linhas: string[] = [];

    // Cabeçalho
    const colunas = ["Período", ...grafico.series.map((s) => s.nome)];
    linhas.push(colunas.join(","));

    // Dados
    grafico.labels.forEach((label, idx) => {
      const valores = [label, ...grafico.series.map((s) => s.dados[idx])];
      linhas.push(valores.join(","));
    });

    return linhas.join("\n");
  }

  /**
   * Obtém cache de gráfico
   */
  public obterGraficoCache(tipo: TipoGrafico, titulo: string): DadosGrafico | null {
    const key = this.gerarChaveCache(`grafico_${tipo}`, titulo);
    return this.cache_graficos.get(key) || null;
  }

  /**
   * Limpa cache
   */
  public limparCache(): void {
    this.cache_graficos.clear();
    this.cache_analises.clear();
    this.cache_previsoes.clear();
  }

  // ========================================================================
  // MÉTODOS PRIVADOS
  // ========================================================================

  private regressaoLinear(dados: number[]): { a: number; b: number } {
    const n = dados.length;
    const x_sum = (n * (n - 1)) / 2;
    const y_sum = dados.reduce((a, b) => a + b, 0);
    const xy_sum = dados.reduce((sum, y, i) => sum + i * y, 0);
    const x2_sum = (n * (n - 1) * (2 * n - 1)) / 6;

    const b = (n * xy_sum - x_sum * y_sum) / (n * x2_sum - x_sum * x_sum);
    const a = (y_sum - b * x_sum) / n;

    return { a, b };
  }

  private regressaoExponencial(
    dados: number[]
  ): { a: number; b: number } {
    // y = a * e^(bx)
    // ln(y) = ln(a) + bx -> regressão linear em ln(y)
    const dados_log = dados.map((y) => Math.log(Math.max(y, 0.001)));
    const regressao = this.regressaoLinear(dados_log);

    return {
      a: Math.exp(regressao.a),
      b: regressao.b,
    };
  }

  private regressaoPolinomial(
    dados: number[],
    grau: number
  ): { a: number; b: number; c: number } {
    // Para grau 2: y = a + bx + cx²
    // Usando método de mínimos quadrados
    const n = dados.length;
    let sum_x = 0,
      sum_y = 0,
      sum_x2 = 0,
      sum_x3 = 0,
      sum_x4 = 0,
      sum_xy = 0,
      sum_x2y = 0;

    for (let i = 0; i < n; i++) {
      const x = i;
      const y = dados[i];
      sum_x += x;
      sum_y += y;
      sum_x2 += x * x;
      sum_x3 += x * x * x;
      sum_x4 += x * x * x * x;
      sum_xy += x * y;
      sum_x2y += x * x * y;
    }

    // Resolver sistema linear
    const matrix = [
      [n, sum_x, sum_x2],
      [sum_x, sum_x2, sum_x3],
      [sum_x2, sum_x3, sum_x4],
    ];

    const vector = [sum_y, sum_xy, sum_x2y];
    const resultado = this.resolverSistemaLinear(matrix, vector);

    return {
      a: resultado[0],
      b: resultado[1],
      c: resultado[2],
    };
  }

  private resolverSistemaLinear(
    matrix: number[][],
    vector: number[]
  ): number[] {
    // Eliminação de Gauss simples
    const n = matrix.length;
    const A = matrix.map((row) => [...row]);
    const b = [...vector];

    // Forward elimination
    for (let i = 0; i < n; i++) {
      let max_row = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(A[k][i]) > Math.abs(A[max_row][i])) {
          max_row = k;
        }
      }

      [A[i], A[max_row]] = [A[max_row], A[i]];
      [b[i], b[max_row]] = [b[max_row], b[i]];

      for (let k = i + 1; k < n; k++) {
        const c = A[k][i] / A[i][i];
        for (let j = i; j < n; j++) {
          if (i === j) {
            A[k][j] = 0;
          } else {
            A[k][j] -= c * A[i][j];
          }
        }
        b[k] -= c * b[i];
      }
    }

    // Back substitution
    const x = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
      x[i] = b[i] / A[i][i];
      for (let k = i - 1; k >= 0; k--) {
        b[k] -= A[k][i] * x[i];
      }
    }

    return x;
  }

  private calcularConfiabilidade(
    dados_historicos: number[],
    dados_previstos: number[]
  ): number {
    // Calcular R² simplificado
    const media = dados_historicos.reduce((a, b) => a + b, 0) / dados_historicos.length;
    const ss_tot = dados_historicos.reduce((sum, y) => sum + Math.pow(y - media, 2), 0);
    const ss_res = dados_historicos.reduce(
      (sum, y, i) => sum + Math.pow(y - dados_previstos[i], 2),
      0
    );

    const r2 = ss_tot > 0 ? 1 - ss_res / ss_tot : 0;
    return Math.max(0, Math.min(1, r2)); // Garantir entre 0 e 1
  }

  private gerarInsights(
    tipo: TipoAnalise,
    variacao: number[],
    media: number
  ): string[] {
    const insights: string[] = [];

    if (media > 10) {
      insights.push(`Crescimento significativo de ${media.toFixed(2)}%`);
    } else if (media < -10) {
      insights.push(`Declínio significativo de ${media.toFixed(2)}%`);
    } else {
      insights.push("Variação dentro dos limites normais");
    }

    // Detectar picos
    const max_variacao = Math.max(...variacao);
    if (max_variacao > 30) {
      insights.push(`Pico de ${max_variacao.toFixed(2)}% detectado`);
    }

    return insights;
  }

  private validarGrafico(grafico: DadosGrafico, tipo: TipoGrafico): void {
    if (grafico.labels.length === 0) {
      throw new Error("Gráfico deve ter pelo menos um label");
    }

    for (const serie of grafico.series) {
      if (serie.dados.length !== grafico.labels.length) {
        throw new Error(
          `Série "${serie.nome}" tem tamanho diferente dos labels`
        );
      }
    }

    if (tipo === "pizza" && grafico.series.length > 1) {
      throw new Error("Gráfico de pizza deve ter apenas uma série");
    }
  }

  private extrairDadosNivel(
    dados_completos: Record<string, any>,
    hierarquia: string[],
    nivel: number
  ): Record<string, any> {
    // Simples extração de dados no nível especificado
    return dados_completos[hierarquia[nivel]] || {};
  }

  private gerarCorAutomatica(): string {
    const cores = [
      "#FF6B6B",
      "#4ECDC4",
      "#45B7D1",
      "#FFA07A",
      "#98D8C8",
      "#F7DC6F",
      "#BB8FCE",
      "#85C1E2",
    ];
    return cores[Math.floor(Math.random() * cores.length)];
  }

  private gerarChaveCache(prefix: string, sufixo: string): string {
    return `${prefix}_${sufixo.replace(/\s+/g, "_")}`;
  }
}

// ============================================================================
// INSTÂNCIA SINGLETON
// ============================================================================

export const analyticsVisualizacao = new AnalyticsVisualizacao();
