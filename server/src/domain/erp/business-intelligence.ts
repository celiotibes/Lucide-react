/**
 * Business Intelligence Module (PHASE 5)
 * OLAP cube for multi-dimensional analysis
 *
 * Dimensões:
 * - Time: ano, trimestre, mês, semana, dia
 * - Module: apontamento, advocacia, contas-pessoais, imovel
 * - Entity: usuario, departamento, projeto, centro_custo
 * - Medidas: receita, custo, lucro, horas
 *
 * Operações:
 * - Slice: filtrar por um valor específico
 * - Dice: filtrar múltiplos valores
 * - Drill-down/up: navegar hierarquicamente
 * - Rollup: agregar dados
 */

import { createHash } from "crypto";

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface DimensaoCubo {
  nome: string;
  hierarquia: string[]; // Exemplo: ["ano", "trimestre", "mes", "dia"]
  valores: string[];
}

export interface MedidaCubo {
  nome: string;
  tipo: "soma" | "media" | "contagem" | "minimo" | "maximo";
  valor: number;
}

export interface CelulaCubo {
  dimensoes: Record<string, string>;
  medidas: Record<string, MedidaCubo>;
}

export interface OLAPCubo {
  id: string;
  nome: string;
  dimensoes: Map<string, DimensaoCubo>;
  medidas: MedidaCubo[];
  celulas: CelulaCubo[];
  data_criacao: string;
}

export interface PivotTable {
  linhas: string[];
  colunas: string[];
  valores: (string | number)[][];
  total_linha?: number[];
  total_coluna?: number[];
  total_geral?: number;
}

export interface ResultadoAnalisePatroes {
  padroes_detectados: string[];
  sazonalidade: Record<string, number>;
  ciclos: string[];
  outliers: Array<{ valor: number; desvio_padrao: number }>;
  recomendacoes: string[];
}

// ============================================================================
// CLASSE: BUSINESS INTELLIGENCE
// ============================================================================

export class BusinessIntelligence {
  private cubos: Map<string, OLAPCubo> = new Map();
  private dados_ledger: any[] = [];

  /**
   * Cria um novo cubo OLAP
   */
  public criarCubo(config: {
    nome: string;
    dimensoes: Array<{ nome: string; hierarquia: string[]; valores: string[] }>;
    medidas: MedidaCubo[];
  }): OLAPCubo {
    const id = `cubo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const dimensoes_map = new Map<string, DimensaoCubo>();
    for (const dim of config.dimensoes) {
      dimensoes_map.set(dim.nome, dim);
    }

    const cubo: OLAPCubo = {
      id,
      nome: config.nome,
      dimensoes: dimensoes_map,
      medidas: config.medidas,
      celulas: [],
      data_criacao: new Date().toISOString(),
    };

    this.cubos.set(id, cubo);
    return cubo;
  }

  /**
   * Adiciona dados ao cubo
   */
  public adicionarDadosCubo(
    cubo_id: string,
    dados: Array<Record<string, string | number>>
  ): boolean {
    const cubo = this.cubos.get(cubo_id);
    if (!cubo) {
      return false;
    }

    for (const linha of dados) {
      const dimensoes: Record<string, string> = {};
      const medidas: Record<string, MedidaCubo> = {};

      // Extrair dimensões
      for (const [nome_dim] of cubo.dimensoes) {
        if (linha[nome_dim]) {
          dimensoes[nome_dim] = String(linha[nome_dim]);
        }
      }

      // Extrair medidas
      for (const medida of cubo.medidas) {
        if (linha[medida.nome]) {
          medidas[medida.nome] = {
            ...medida,
            valor: Number(linha[medida.nome]),
          };
        }
      }

      cubo.celulas.push({
        dimensoes,
        medidas,
      });
    }

    return true;
  }

  /**
   * Operação Slice: filtra por um valor específico em uma dimensão
   */
  public slice(
    cubo_id: string,
    dimensao: string,
    valor: string
  ): CelulaCubo[] {
    const cubo = this.cubos.get(cubo_id);
    if (!cubo) {
      return [];
    }

    return cubo.celulas.filter((celula) => celula.dimensoes[dimensao] === valor);
  }

  /**
   * Operação Dice: filtra múltiplos valores em múltiplas dimensões
   */
  public dice(cubo_id: string, filtros: Record<string, string[]>): CelulaCubo[] {
    const cubo = this.cubos.get(cubo_id);
    if (!cubo) {
      return [];
    }

    return cubo.celulas.filter((celula) => {
      for (const [dimensao, valores] of Object.entries(filtros)) {
        if (!valores.includes(celula.dimensoes[dimensao])) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Gera Pivot Table com slice de dados
   */
  public pivotAnalise(config: {
    cubo_id: string;
    dimensao_linhas: string;
    dimensao_colunas: string;
    medida: string;
    filtros?: Record<string, string[]>;
  }): PivotTable {
    const cubo = this.cubos.get(config.cubo_id);
    if (!cubo) {
      throw new Error(`Cubo ${config.cubo_id} não encontrado`);
    }

    let celulas = config.filtros
      ? this.dice(config.cubo_id, config.filtros)
      : cubo.celulas;

    // Extrair valores únicos para linhas e colunas
    const linhas_set = new Set<string>();
    const colunas_set = new Set<string>();

    for (const celula of celulas) {
      linhas_set.add(celula.dimensoes[config.dimensao_linhas]);
      colunas_set.add(celula.dimensoes[config.dimensao_colunas]);
    }

    const linhas = Array.from(linhas_set);
    const colunas = Array.from(colunas_set);

    // Construir matriz de valores
    const valores: (string | number)[][] = [];
    const total_linha: number[] = [];

    for (const linha of linhas) {
      const row: (string | number)[] = [linha];
      let total_linha_val = 0;

      for (const coluna of colunas) {
        const celula = celulas.find(
          (c) =>
            c.dimensoes[config.dimensao_linhas] === linha &&
            c.dimensoes[config.dimensao_colunas] === coluna
        );

        const valor = celula?.medidas[config.medida]?.valor || 0;
        row.push(valor);
        total_linha_val += Number(valor);
      }

      row.push(total_linha_val);
      valores.push(row);
      total_linha.push(total_linha_val);
    }

    // Calcular totais por coluna
    const total_coluna: number[] = [0];
    for (let i = 0; i < colunas.length; i++) {
      let coluna_total = 0;
      for (let j = 1; j < valores.length; j++) {
        coluna_total += Number(valores[j][i + 1]);
      }
      total_coluna.push(coluna_total);
    }

    const total_geral = total_coluna.reduce((a, b) => a + b, 0);

    // Adicionar linha de totais
    const linha_totais = ["TOTAL", ...total_coluna];
    valores.push(linha_totais);

    return {
      linhas: [config.dimensao_linhas, ...linhas],
      colunas: [config.dimensao_colunas, ...colunas, "Total"],
      valores,
      total_coluna,
      total_geral,
    };
  }

  /**
   * Detecta padrões nos dados do ledger
   * - Sazonalidade: padrões periódicos
   * - Ciclos: tendências cíclicas
   * - Outliers: valores anormais
   */
  public detectarPadroes(dados: Array<{
    data: string;
    valor: number;
  }>): ResultadoAnalisePatroes {
    const valores = dados.map((d) => d.valor);
    const datas = dados.map((d) => new Date(d.data));

    // Detectar sazonalidade (mensal)
    const sazonalidade: Record<string, number> = {};
    const meses = [
      "Jan",
      "Fev",
      "Mar",
      "Abr",
      "Mai",
      "Jun",
      "Jul",
      "Ago",
      "Set",
      "Out",
      "Nov",
      "Dez",
    ];

    for (let mes = 0; mes < 12; mes++) {
      const valores_mes = valores.filter((_, idx) => datas[idx].getMonth() === mes);
      if (valores_mes.length > 0) {
        const media_mes = valores_mes.reduce((a, b) => a + b, 0) / valores_mes.length;
        sazonalidade[meses[mes]] = Math.round(media_mes * 100) / 100;
      }
    }

    // Detectar ciclos (usando análise de autocorrelação simplificada)
    const ciclos = this.detectarCiclos(valores);

    // Detectar outliers (> 3 desvios padrão)
    const media = valores.reduce((a, b) => a + b, 0) / valores.length;
    const variancia =
      valores.reduce((sum, v) => sum + Math.pow(v - media, 2), 0) / valores.length;
    const desvio_padrao = Math.sqrt(variancia);

    const outliers = [];
    for (let i = 0; i < valores.length; i++) {
      const z_score = Math.abs((valores[i] - media) / desvio_padrao);
      if (z_score > 3) {
        outliers.push({
          valor: valores[i],
          desvio_padrao: z_score,
        });
      }
    }

    // Gerar padrões detectados
    const padroes = [];
    if (Object.keys(sazonalidade).length > 0) {
      padroes.push("Sazonalidade identificada");
    }
    if (ciclos.length > 0) {
      padroes.push(`${ciclos.length} ciclo(s) detectado(s)`);
    }
    if (outliers.length > 0) {
      padroes.push(`${outliers.length} valor(es) anômalo(s) identificado(s)`);
    }

    // Gerar recomendações
    const recomendacoes = this.gerarRecomendacoes(
      padroes,
      sazonalidade,
      outliers
    );

    return {
      padroes_detectados: padroes,
      sazonalidade,
      ciclos,
      outliers,
      recomendacoes,
    };
  }

  /**
   * Obtém cubo
   */
  public obterCubo(cubo_id: string): OLAPCubo | null {
    return this.cubos.get(cubo_id) || null;
  }

  /**
   * Lista todos os cubos
   */
  public listarCubos(): OLAPCubo[] {
    return Array.from(this.cubos.values());
  }

  /**
   * Rollup: agrega dados em uma dimensão
   */
  public rollup(cubo_id: string, dimensao: string): Record<string, MedidaCubo[]> {
    const cubo = this.cubos.get(cubo_id);
    if (!cubo) {
      return {};
    }

    const resultado: Record<string, MedidaCubo[]> = {};

    for (const celula of cubo.celulas) {
      const chave = celula.dimensoes[dimensao];
      if (!resultado[chave]) {
        resultado[chave] = [];
      }

      for (const [nome_medida, medida] of Object.entries(celula.medidas)) {
        const idx = resultado[chave].findIndex((m) => m.nome === nome_medida);
        if (idx === -1) {
          resultado[chave].push({ ...medida });
        } else {
          // Agregar baseado no tipo
          switch (medida.tipo) {
            case "soma":
              resultado[chave][idx].valor += medida.valor;
              break;
            case "media":
              resultado[chave][idx].valor =
                (resultado[chave][idx].valor + medida.valor) / 2;
              break;
            case "contagem":
              resultado[chave][idx].valor++;
              break;
            case "maximo":
              resultado[chave][idx].valor = Math.max(
                resultado[chave][idx].valor,
                medida.valor
              );
              break;
            case "minimo":
              resultado[chave][idx].valor = Math.min(
                resultado[chave][idx].valor,
                medida.valor
              );
              break;
          }
        }
      }
    }

    return resultado;
  }

  /**
   * Exporta pivot table para CSV
   */
  public exportarPivotCSV(pivot: PivotTable): string {
    const linhas: string[] = [];

    // Cabeçalho
    const cabecalho = pivot.colunas.join(",");
    linhas.push(cabecalho);

    // Dados
    for (const linha of pivot.valores) {
      linhas.push(linha.join(","));
    }

    return linhas.join("\n");
  }

  // ========================================================================
  // MÉTODOS PRIVADOS
  // ========================================================================

  private detectarCiclos(valores: number[]): string[] {
    const ciclos: string[] = [];

    // Análise de autocorrelação simplificada
    for (let lag = 1; lag <= Math.floor(valores.length / 2); lag++) {
      let correlacao = 0;
      const media = valores.reduce((a, b) => a + b, 0) / valores.length;

      for (let i = 0; i < valores.length - lag; i++) {
        correlacao += (valores[i] - media) * (valores[i + lag] - media);
      }

      correlacao /= valores.length;

      // Se correlação forte (> 0.5), há ciclo potencial
      if (Math.abs(correlacao) > 0.5) {
        ciclos.push(`Ciclo de ${lag} períodos`);
      }
    }

    return ciclos;
  }

  private gerarRecomendacoes(
    padroes: string[],
    sazonalidade: Record<string, number>,
    outliers: Array<{ valor: number; desvio_padrao: number }>
  ): string[] {
    const recomendacoes: string[] = [];

    if (padroes.includes("Sazonalidade identificada")) {
      recomendacoes.push(
        "Considere ajustar o orçamento de acordo com a sazonalidade"
      );
      recomendacoes.push(
        "Implemente políticas de estoque baseadas em padrões sazonais"
      );
    }

    if (outliers.length > 0) {
      recomendacoes.push(
        `Investigue ${outliers.length} valor(es) anômalo(s) para identificar causas`
      );
      recomendacoes.push("Considere revisar processos de controle de qualidade");
    }

    if (padroes.length === 0) {
      recomendacoes.push(
        "Dados mostram estabilidade - continue monitorando tendências"
      );
    }

    return recomendacoes;
  }
}

// ============================================================================
// INSTÂNCIA SINGLETON
// ============================================================================

export const businessIntelligence = new BusinessIntelligence();
