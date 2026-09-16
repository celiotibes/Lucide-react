/**
 * Real-time KPI Engine (PHASE 5)
 * Live KPI calculations with 5-second refresh for executive dashboard
 *
 * KPIs Monitored:
 * 1. Margem Lucro (Profit Margin %) - (Lucro Líquido / Receita) * 100
 * 2. ROI (Return on Investment %) - (Lucro Líquido / Ativo Total) * 100
 * 3. Liquidez Corrente (Current Ratio) - Ativo Circulante / Passivo Circulante
 * 4. Solvabilidade (Solvency Ratio) - Ativo Total / Passivo Total
 * 5. Taxa Crescimento (Growth Rate %) - (Período Atual - Período Anterior) / Período Anterior * 100
 *
 * Sub-KPIs by Module:
 * - Apontamento: receita bruta, margem operacional
 * - Advocacia: receita horáveis, taxa utilização, receita média/caso
 * - Contas Pessoais: fluxo entrada vs saída, taxa economia
 * - Imóvel: receita aluguel, taxa ocupação, ROI imóvel
 *
 * Performance Trending: 1h, 24h, 7d, 30d, 90d, 12m
 * Anomaly Detection: variance > 10% triggers alert
 */

import { createHash } from "crypto";

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface KPISnapshot {
  timestamp: string;
  margem_lucro: number;
  roi: number;
  liquidez_corrente: number;
  solvabilidade: number;
  taxa_crescimento: number;
  hash_verificacao: string;
}

export interface SubKPIApontamento {
  receita_bruta: number;
  margem_operacional: number;
  total_apontamentos: number;
  ticket_medio: number;
}

export interface SubKPIAdvocacia {
  receita_horaveis: number;
  taxa_utilizacao: number;
  receita_media_caso: number;
  total_casos_ativos: number;
  horas_totais: number;
}

export interface SubKPIContasPessoais {
  fluxo_entrada: number;
  fluxo_saida: number;
  taxa_economia: number;
  saldo_total: number;
}

export interface SubKPIImovel {
  receita_aluguel: number;
  taxa_ocupacao: number;
  roi_imovel: number;
  total_propriedades: number;
}

export interface KPITendencia {
  periodo: "1h" | "24h" | "7d" | "30d" | "90d" | "12m";
  valores: number[];
  media: number;
  desvio_padrao: number;
  variancia_percentual: number;
  tendencia: "crescente" | "decrescente" | "estavel";
}

export interface AnomaliaDetectada {
  kpi_nome: string;
  valor_atual: number;
  valor_esperado: number;
  desvio_percentual: number;
  severidade: "baixa" | "media" | "alta" | "critica";
  timestamp: string;
}

export interface DashboardKPIRealtime {
  periodo: string;
  timestamp_geracao: string;
  kpis_principais: KPISnapshot;
  sub_kpis: {
    apontamento: SubKPIApontamento;
    advocacia: SubKPIAdvocacia;
    contas_pessoais: SubKPIContasPessoais;
    imovel: SubKPIImovel;
  };
  tendencias: {
    margem_lucro: KPITendencia;
    roi: KPITendencia;
    liquidez_corrente: KPITendencia;
    solvabilidade: KPITendencia;
    taxa_crescimento: KPITendencia;
  };
  anomalias: AnomaliaDetectada[];
  alertas_ativos: number;
}

// ============================================================================
// CLASSE PRINCIPAL: REAL-TIME KPI ENGINE
// ============================================================================

export class KPIEngineRealtime {
  private kpiSnapshots: Map<string, KPISnapshot[]> = new Map();
  private ultimoSnapshot: KPISnapshot | null = null;
  private anomaliasCache: AnomaliaDetectada[] = [];
  private webSocketClientes: Set<any> = new Set();
  private intervaloAtualizacao: number = 5000; // 5 segundos

  /**
   * Calcula KPIs em tempo real
   * @param dados_financeiros Dados financeiros atualizados
   * @returns KPISnapshot com todos os KPIs calculados
   */
  public calcularKPIsRealtime(dados_financeiros: {
    receita_total: number;
    lucro_liquido: number;
    ativo_total: number;
    ativo_circulante: number;
    passivo_total: number;
    passivo_circulante: number;
    lucro_anterior?: number;
  }): KPISnapshot {
    // Validação de entrada
    if (
      !dados_financeiros.receita_total ||
      dados_financeiros.receita_total < 0
    ) {
      throw new Error("Receita total deve ser um número positivo");
    }

    // Cálculo de KPIs
    const margem_lucro =
      dados_financeiros.receita_total > 0
        ? (dados_financeiros.lucro_liquido / dados_financeiros.receita_total) *
          100
        : 0;

    const roi =
      dados_financeiros.ativo_total > 0
        ? (dados_financeiros.lucro_liquido / dados_financeiros.ativo_total) *
          100
        : 0;

    const liquidez_corrente =
      dados_financeiros.passivo_circulante > 0
        ? dados_financeiros.ativo_circulante /
          dados_financeiros.passivo_circulante
        : 0;

    const solvabilidade =
      dados_financeiros.passivo_total > 0
        ? dados_financeiros.ativo_total / dados_financeiros.passivo_total
        : 0;

    const taxa_crescimento =
      this.ultimoSnapshot && dados_financeiros.lucro_anterior
        ? ((dados_financeiros.lucro_liquido - dados_financeiros.lucro_anterior) /
            Math.abs(dados_financeiros.lucro_anterior)) *
          100
        : 0;

    const snapshot: KPISnapshot = {
      timestamp: new Date().toISOString(),
      margem_lucro: Math.round(margem_lucro * 100) / 100,
      roi: Math.round(roi * 100) / 100,
      liquidez_corrente: Math.round(liquidez_corrente * 100) / 100,
      solvabilidade: Math.round(solvabilidade * 100) / 100,
      taxa_crescimento: Math.round(taxa_crescimento * 100) / 100,
      hash_verificacao: this.gerarHashSnapshot({
        margem_lucro,
        roi,
        liquidez_corrente,
        solvabilidade,
        taxa_crescimento,
      }),
    };

    // Armazenar snapshot
    const hoje = new Date().toISOString().split("T")[0];
    if (!this.kpiSnapshots.has(hoje)) {
      this.kpiSnapshots.set(hoje, []);
    }
    this.kpiSnapshots.get(hoje)!.push(snapshot);

    this.ultimoSnapshot = snapshot;

    // Notificar clientes WebSocket
    this.notificarWebSocket({
      tipo: "kpi_atualizado",
      dados: snapshot,
    });

    return snapshot;
  }

  /**
   * Obtém tendência de um KPI específico para um período
   * @param kpi_nome Nome do KPI
   * @param periodo Período de análise
   * @returns KPITendencia com análise de tendência
   */
  public obterTendencia(
    kpi_nome:
      | "margem_lucro"
      | "roi"
      | "liquidez_corrente"
      | "solvabilidade"
      | "taxa_crescimento",
    periodo: "1h" | "24h" | "7d" | "30d" | "90d" | "12m"
  ): KPITendencia {
    const valores = this.extrairValoresPorPeriodo(kpi_nome, periodo);

    if (valores.length === 0) {
      return {
        periodo,
        valores: [],
        media: 0,
        desvio_padrao: 0,
        variancia_percentual: 0,
        tendencia: "estavel",
      };
    }

    const media = valores.reduce((a, b) => a + b, 0) / valores.length;
    const variancia =
      valores.reduce((sum, val) => sum + Math.pow(val - media, 2), 0) /
      valores.length;
    const desvio_padrao = Math.sqrt(variancia);
    const variancia_percentual =
      media > 0 ? (desvio_padrao / media) * 100 : 0;

    // Determinar tendência (regressão linear simples)
    const tendencia = this.determinarTendencia(valores);

    return {
      periodo,
      valores,
      media: Math.round(media * 100) / 100,
      desvio_padrao: Math.round(desvio_padrao * 100) / 100,
      variancia_percentual: Math.round(variancia_percentual * 100) / 100,
      tendencia,
    };
  }

  /**
   * Detecta anomalias nas séries de KPIs
   * Anomalia: variância > 10% ou desvio padrão > 2x histórico
   * @returns Array de anomalias detectadas
   */
  public detectarAnomalias(): AnomaliaDetectada[] {
    if (!this.ultimoSnapshot) {
      return [];
    }

    const anomalias: AnomaliaDetectada[] = [];
    const kpis = this.ultimoSnapshot;

    // Verificar margem lucro
    const tendencia_margem = this.obterTendencia(
      "margem_lucro",
      "24h"
    );
    if (
      tendencia_margem.variancia_percentual > 10 ||
      Math.abs(kpis.margem_lucro - tendencia_margem.media) >
        2 * tendencia_margem.desvio_padrao
    ) {
      anomalias.push({
        kpi_nome: "margem_lucro",
        valor_atual: kpis.margem_lucro,
        valor_esperado: tendencia_margem.media,
        desvio_percentual: tendencia_margem.variancia_percentual,
        severidade:
          tendencia_margem.variancia_percentual > 20 ? "critica" : "media",
        timestamp: kpis.timestamp,
      });
    }

    // Verificar ROI
    const tendencia_roi = this.obterTendencia("roi", "24h");
    if (
      tendencia_roi.variancia_percentual > 10 ||
      Math.abs(kpis.roi - tendencia_roi.media) > 2 * tendencia_roi.desvio_padrao
    ) {
      anomalias.push({
        kpi_nome: "roi",
        valor_atual: kpis.roi,
        valor_esperado: tendencia_roi.media,
        desvio_percentual: tendencia_roi.variancia_percentual,
        severidade:
          tendencia_roi.variancia_percentual > 20 ? "critica" : "media",
        timestamp: kpis.timestamp,
      });
    }

    // Verificar liquidez corrente (alerta crítico se < 1.0)
    if (kpis.liquidez_corrente < 1.0) {
      anomalias.push({
        kpi_nome: "liquidez_corrente",
        valor_atual: kpis.liquidez_corrente,
        valor_esperado: 1.5,
        desvio_percentual: ((1.5 - kpis.liquidez_corrente) / 1.5) * 100,
        severidade: kpis.liquidez_corrente < 0.5 ? "critica" : "alta",
        timestamp: kpis.timestamp,
      });
    }

    // Verificar solvabilidade (alerta se < 1.0)
    if (kpis.solvabilidade < 1.0) {
      anomalias.push({
        kpi_nome: "solvabilidade",
        valor_atual: kpis.solvabilidade,
        valor_esperado: 2.0,
        desvio_percentual: ((2.0 - kpis.solvabilidade) / 2.0) * 100,
        severidade: "alta",
        timestamp: kpis.timestamp,
      });
    }

    // Armazenar anomalias detectadas
    this.anomaliasCache = anomalias;

    // Notificar via WebSocket se houver anomalias críticas
    const anomalias_criticas = anomalias.filter(
      (a) => a.severidade === "critica"
    );
    if (anomalias_criticas.length > 0) {
      this.notificarWebSocket({
        tipo: "anomalia_detectada",
        dados: anomalias_criticas,
      });
    }

    return anomalias;
  }

  /**
   * Calcula sub-KPIs do módulo Apontamento
   */
  public calcularSubKPIApontamento(dados_apontamento: {
    receita_bruta: number;
    custos_operacionais: number;
    total_apontamentos: number;
  }): SubKPIApontamento {
    return {
      receita_bruta: dados_apontamento.receita_bruta,
      margem_operacional:
        dados_apontamento.receita_bruta > 0
          ? (
              ((dados_apontamento.receita_bruta -
                dados_apontamento.custos_operacionais) /
                dados_apontamento.receita_bruta) *
              100
            ).toFixed(2)
          : "0",
      total_apontamentos: dados_apontamento.total_apontamentos,
      ticket_medio:
        dados_apontamento.total_apontamentos > 0
          ? dados_apontamento.receita_bruta /
            dados_apontamento.total_apontamentos
          : 0,
    } as any;
  }

  /**
   * Calcula sub-KPIs do módulo Advocacia
   */
  public calcularSubKPIAdvocacia(dados_advocacia: {
    receita_horaveis: number;
    horas_totais: number;
    horas_disponiveis: number;
    receita_total_casos: number;
    total_casos: number;
  }): SubKPIAdvocacia {
    return {
      receita_horaveis: dados_advocacia.receita_horaveis,
      taxa_utilizacao:
        dados_advocacia.horas_disponiveis > 0
          ? (
              (dados_advocacia.horas_totais /
                dados_advocacia.horas_disponiveis) *
              100
            ).toFixed(2)
          : "0",
      receita_media_caso:
        dados_advocacia.total_casos > 0
          ? dados_advocacia.receita_total_casos / dados_advocacia.total_casos
          : 0,
      total_casos_ativos: dados_advocacia.total_casos,
      horas_totais: dados_advocacia.horas_totais,
    } as any;
  }

  /**
   * Calcula sub-KPIs de Contas Pessoais
   */
  public calcularSubKPIContasPessoais(dados_contas: {
    fluxo_entrada: number;
    fluxo_saida: number;
    saldo_total: number;
  }): SubKPIContasPessoais {
    return {
      fluxo_entrada: dados_contas.fluxo_entrada,
      fluxo_saida: dados_contas.fluxo_saida,
      taxa_economia:
        dados_contas.fluxo_entrada > 0
          ? (
              ((dados_contas.fluxo_entrada - dados_contas.fluxo_saida) /
                dados_contas.fluxo_entrada) *
              100
            ).toFixed(2)
          : "0",
      saldo_total: dados_contas.saldo_total,
    } as any;
  }

  /**
   * Calcula sub-KPIs de Imóvel
   */
  public calcularSubKPIImovel(dados_imovel: {
    receita_aluguel: number;
    valor_propriedade: number;
    taxa_ocupacao: number;
    total_propriedades: number;
  }): SubKPIImovel {
    return {
      receita_aluguel: dados_imovel.receita_aluguel,
      taxa_ocupacao: dados_imovel.taxa_ocupacao,
      roi_imovel:
        dados_imovel.valor_propriedade > 0
          ? (
              (dados_imovel.receita_aluguel / dados_imovel.valor_propriedade) *
              100
            ).toFixed(2)
          : "0",
      total_propriedades: dados_imovel.total_propriedades,
    } as any;
  }

  /**
   * Retorna dashboard completo com KPIs, sub-KPIs, tendências e anomalias
   */
  public obterDashboardCompleto(periodo: string): DashboardKPIRealtime {
    const anomalias = this.detectarAnomalias();

    return {
      periodo,
      timestamp_geracao: new Date().toISOString(),
      kpis_principais: this.ultimoSnapshot || this.criarKPIVazio(),
      sub_kpis: {
        apontamento: this.calcularSubKPIApontamento({
          receita_bruta: 0,
          custos_operacionais: 0,
          total_apontamentos: 0,
        }),
        advocacia: this.calcularSubKPIAdvocacia({
          receita_horaveis: 0,
          horas_totais: 0,
          horas_disponiveis: 0,
          receita_total_casos: 0,
          total_casos: 0,
        }),
        contas_pessoais: this.calcularSubKPIContasPessoais({
          fluxo_entrada: 0,
          fluxo_saida: 0,
          saldo_total: 0,
        }),
        imovel: this.calcularSubKPIImovel({
          receita_aluguel: 0,
          valor_propriedade: 0,
          taxa_ocupacao: 0,
          total_propriedades: 0,
        }),
      },
      tendencias: {
        margem_lucro: this.obterTendencia("margem_lucro", "30d"),
        roi: this.obterTendencia("roi", "30d"),
        liquidez_corrente: this.obterTendencia("liquidez_corrente", "30d"),
        solvabilidade: this.obterTendencia("solvabilidade", "30d"),
        taxa_crescimento: this.obterTendencia("taxa_crescimento", "30d"),
      },
      anomalias,
      alertas_ativos: anomalias.length,
    };
  }

  /**
   * Inicia atualização automática com WebSocket
   */
  public iniciarAtualizacaoAutomatica(callback: (dados: any) => void): void {
    setInterval(() => {
      callback(this.ultimoSnapshot);
    }, this.intervaloAtualizacao);
  }

  /**
   * Registra cliente WebSocket
   */
  public registrarWebSocketCliente(cliente: any): void {
    this.webSocketClientes.add(cliente);
  }

  /**
   * Remove cliente WebSocket
   */
  public removerWebSocketCliente(cliente: any): void {
    this.webSocketClientes.delete(cliente);
  }

  // ========================================================================
  // MÉTODOS PRIVADOS
  // ========================================================================

  private extrairValoresPorPeriodo(
    kpi_nome: string,
    periodo: string
  ): number[] {
    const valores: number[] = [];
    const agora = new Date();
    let dataInicio = new Date();

    // Determinar data de início baseado no período
    switch (periodo) {
      case "1h":
        dataInicio.setHours(agora.getHours() - 1);
        break;
      case "24h":
        dataInicio.setDate(agora.getDate() - 1);
        break;
      case "7d":
        dataInicio.setDate(agora.getDate() - 7);
        break;
      case "30d":
        dataInicio.setDate(agora.getDate() - 30);
        break;
      case "90d":
        dataInicio.setDate(agora.getDate() - 90);
        break;
      case "12m":
        dataInicio.setFullYear(agora.getFullYear() - 1);
        break;
    }

    // Coletar valores de snapshots
    for (const snapshots of this.kpiSnapshots.values()) {
      for (const snapshot of snapshots) {
        const dataSnapshot = new Date(snapshot.timestamp);
        if (dataSnapshot >= dataInicio && dataSnapshot <= agora) {
          const valor = (snapshot as any)[kpi_nome];
          if (valor !== undefined) {
            valores.push(valor);
          }
        }
      }
    }

    return valores;
  }

  private determinarTendencia(
    valores: number[]
  ): "crescente" | "decrescente" | "estavel" {
    if (valores.length < 2) return "estavel";

    // Regressão linear simples
    const n = valores.length;
    const x_sum = (n * (n - 1)) / 2;
    const y_sum = valores.reduce((a, b) => a + b, 0);
    const xy_sum = valores.reduce((sum, y, i) => sum + i * y, 0);
    const x2_sum = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * xy_sum - x_sum * y_sum) / (n * x2_sum - x_sum * x_sum);

    if (slope > 0.01) return "crescente";
    if (slope < -0.01) return "decrescente";
    return "estavel";
  }

  private gerarHashSnapshot(dados: Record<string, number>): string {
    return createHash("sha256")
      .update(JSON.stringify(dados))
      .digest("hex")
      .substring(0, 16);
  }

  private criarKPIVazio(): KPISnapshot {
    return {
      timestamp: new Date().toISOString(),
      margem_lucro: 0,
      roi: 0,
      liquidez_corrente: 0,
      solvabilidade: 0,
      taxa_crescimento: 0,
      hash_verificacao: "0000000000000000",
    };
  }

  private notificarWebSocket(mensagem: any): void {
    for (const cliente of this.webSocketClientes) {
      try {
        cliente.send(JSON.stringify(mensagem));
      } catch (error) {
        this.webSocketClientes.delete(cliente);
      }
    }
  }
}

// ============================================================================
// INSTÂNCIA SINGLETON
// ============================================================================

export const kpiEngine = new KPIEngineRealtime();
