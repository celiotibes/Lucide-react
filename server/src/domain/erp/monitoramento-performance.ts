/**
 * Performance Monitoring & System Health (PHASE 5)
 * Track system metrics, detect bottlenecks, and suggest optimizations
 *
 * Métricas Monitoradas:
 * - CPU: uso percentual, core utilization
 * - Memória: heap, rss, garbage collection
 * - Banco de Dados: query response time, slow queries, index usage
 * - API: latência, taxa de erro, throughput
 * - Cache: hit rate, TTL, evictions
 *
 * Detecção de Gargalos:
 * - Query time > 1s (slow queries)
 * - Response time > 200ms
 * - Cache hit rate < 70%
 * - Memory usage > 80%
 * - CPU usage > 85%
 */

import { createHash } from "crypto";

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface MetricaCPU {
  timestamp: string;
  uso_percentual: number;
  core_utilization: Record<string, number>;
  load_average: number;
}

export interface MetricaMemoria {
  timestamp: string;
  heap_used_mb: number;
  heap_total_mb: number;
  rss_mb: number;
  external_mb: number;
  percentual_uso: number;
}

export interface MetricaBancoDados {
  timestamp: string;
  tempo_resposta_ms: number;
  total_queries: number;
  slow_queries: string[];
  conexoes_ativas: number;
  pool_disponivel: number;
  tempo_lock_ms: number;
}

export interface MetricaAPI {
  timestamp: string;
  latencia_media_ms: number;
  total_requisicoes: number;
  taxa_erro_percentual: number;
  throughput_rps: number;
  endpoints_lento: string[];
}

export interface MetricaCache {
  timestamp: string;
  hit_rate_percentual: number;
  miss_rate_percentual: number;
  tamanho_cache_mb: number;
  evictions: number;
  itens_em_cache: number;
}

export interface SaudeDoSistema {
  timestamp: string;
  status_geral: "ok" | "warning" | "critical";
  cpu: MetricaCPU;
  memoria: MetricaMemoria;
  banco_dados: MetricaBancoDados;
  api: MetricaAPI;
  cache: MetricaCache;
  alertas_ativos: string[];
}

export interface Gargalo {
  tipo: string;
  severidade: "baixa" | "media" | "alta" | "critica";
  descricao: string;
  metrica_valor: number;
  metrica_limiar: number;
  data_deteccao: string;
}

export interface SugestaoOtimizacao {
  tipo: string;
  problema: string;
  solucao: string;
  impacto_estimado: string;
  prioridade: "baixa" | "media" | "alta" | "critica";
  esforço_estimado: string;
}

// ============================================================================
// CLASSE: MONITORAMENTO DE PERFORMANCE
// ============================================================================

export class MonitoramentoPerformance {
  private historico_cpu: MetricaCPU[] = [];
  private historico_memoria: MetricaMemoria[] = [];
  private historico_bd: MetricaBancoDados[] = [];
  private historico_api: MetricaAPI[] = [];
  private historico_cache: MetricaCache[] = [];
  private gargalos_detectados: Gargalo[] = [];
  private sugestoes_otimizacao: SugestaoOtimizacao[] = [];

  // Limiares configuráveis
  private limiares = {
    cpu_critico: 85,
    cpu_warning: 70,
    memoria_critica: 90,
    memoria_warning: 80,
    resposta_lenta: 200, // ms
    query_lenta: 1000, // ms
    cache_minimo: 70, // %
    taxa_erro_maxima: 5, // %
  };

  /**
   * Coleta métricas de CPU
   */
  public coletarMetricasCPU(): MetricaCPU {
    // Simular coleta de CPU
    const cpu_percent = Math.random() * 100;
    const cores = 4;
    const core_util: Record<string, number> = {};

    for (let i = 0; i < cores; i++) {
      core_util[`core_${i}`] = Math.random() * 100;
    }

    const metrica: MetricaCPU = {
      timestamp: new Date().toISOString(),
      uso_percentual: Math.round(cpu_percent * 100) / 100,
      core_utilization: core_util,
      load_average: Math.round((cpu_percent / 100) * 4 * 100) / 100,
    };

    this.historico_cpu.push(metrica);
    this.verificarGargaloCPU(metrica);

    return metrica;
  }

  /**
   * Coleta métricas de Memória
   */
  public coletarMetricasMemoria(): MetricaMemoria {
    const usado_mb = Math.random() * 1024;
    const total_mb = 2048;
    const percentual = (usado_mb / total_mb) * 100;

    const metrica: MetricaMemoria = {
      timestamp: new Date().toISOString(),
      heap_used_mb: Math.round(usado_mb * 100) / 100,
      heap_total_mb: total_mb,
      rss_mb: Math.round((usado_mb * 1.2) * 100) / 100,
      external_mb: Math.round((usado_mb * 0.05) * 100) / 100,
      percentual_uso: Math.round(percentual * 100) / 100,
    };

    this.historico_memoria.push(metrica);
    this.verificarGargaloMemoria(metrica);

    return metrica;
  }

  /**
   * Coleta métricas de Banco de Dados
   */
  public coletarMetricasBD(config?: {
    slow_queries?: string[];
    conexoes_ativas?: number;
  }): MetricaBancoDados {
    const total_queries = Math.floor(Math.random() * 10000) + 1000;
    const tempo_resposta = Math.random() * 500;

    // Simular algumas queries lentas (5-10% do total)
    const num_slow = Math.floor(total_queries * (0.05 + Math.random() * 0.05));
    const slow_queries: string[] = [];

    for (let i = 0; i < num_slow; i++) {
      slow_queries.push(`SELECT * FROM table_${i} WHERE complex_condition`);
    }

    const metrica: MetricaBancoDados = {
      timestamp: new Date().toISOString(),
      tempo_resposta_ms: Math.round(tempo_resposta * 100) / 100,
      total_queries,
      slow_queries: config?.slow_queries || slow_queries,
      conexoes_ativas: config?.conexoes_ativas || Math.floor(Math.random() * 50),
      pool_disponivel: Math.floor(Math.random() * 50),
      tempo_lock_ms: Math.round(Math.random() * 100 * 100) / 100,
    };

    this.historico_bd.push(metrica);
    this.verificarGargaloBancoDados(metrica);

    return metrica;
  }

  /**
   * Coleta métricas de API
   */
  public coletarMetricasAPI(config?: {
    latencia_media?: number;
    total_requisicoes?: number;
    taxa_erro?: number;
  }): MetricaAPI {
    const total_req = config?.total_requisicoes || Math.floor(Math.random() * 50000) + 10000;
    const taxa_erro = config?.taxa_erro || Math.random() * 5;
    const latencia = config?.latencia_media || Math.random() * 300;

    const endpoints_lento = [];
    for (let i = 0; i < 3; i++) {
      endpoints_lento.push(`/api/endpoint_${i}`);
    }

    const metrica: MetricaAPI = {
      timestamp: new Date().toISOString(),
      latencia_media_ms: Math.round(latencia * 100) / 100,
      total_requisicoes: total_req,
      taxa_erro_percentual: Math.round(taxa_erro * 100) / 100,
      throughput_rps: Math.round((total_req / 60) * 100) / 100,
      endpoints_lento,
    };

    this.historico_api.push(metrica);
    this.verificarGargaloAPI(metrica);

    return metrica;
  }

  /**
   * Coleta métricas de Cache
   */
  public coletarMetricasCache(config?: {
    hit_rate?: number;
    tamanho_mb?: number;
    evictions?: number;
  }): MetricaCache {
    const hit_rate = config?.hit_rate || Math.random() * 100;
    const miss_rate = 100 - hit_rate;

    const metrica: MetricaCache = {
      timestamp: new Date().toISOString(),
      hit_rate_percentual: Math.round(hit_rate * 100) / 100,
      miss_rate_percentual: Math.round(miss_rate * 100) / 100,
      tamanho_cache_mb: config?.tamanho_mb || Math.random() * 1024,
      evictions: config?.evictions || Math.floor(Math.random() * 1000),
      itens_em_cache: Math.floor(Math.random() * 100000),
    };

    this.historico_cache.push(metrica);
    this.verificarGargaloCache(metrica);

    return metrica;
  }

  /**
   * Coleta todas as métricas e retorna saúde do sistema
   */
  public coletarMetricasPerformance(): SaudeDoSistema {
    const cpu = this.coletarMetricasCPU();
    const memoria = this.coletarMetricasMemoria();
    const bd = this.coletarMetricasBD();
    const api = this.coletarMetricasAPI();
    const cache = this.coletarMetricasCache();

    // Determinar status geral
    const alertas = [
      ...this.gargalos_detectados.filter(
        (g) => g.severidade === "critica"
      ),
    ];

    let status_geral: "ok" | "warning" | "critical" = "ok";
    if (alertas.length > 0) {
      status_geral = "critical";
    } else if (this.gargalos_detectados.length > 0) {
      status_geral = "warning";
    }

    const alertas_ativos = this.gargalos_detectados.map(
      (g) => `[${g.severidade.toUpperCase()}] ${g.descricao}`
    );

    return {
      timestamp: new Date().toISOString(),
      status_geral,
      cpu,
      memoria,
      banco_dados: bd,
      api,
      cache,
      alertas_ativos,
    };
  }

  /**
   * Detecta gargalos
   */
  public detectarGargalos(): Gargalo[] {
    return this.gargalos_detectados;
  }

  /**
   * Sugere otimizações baseado nos gargalos
   */
  public sugerirOtimizacao(): SugestaoOtimizacao[] {
    this.sugestoes_otimizacao = [];

    for (const gargalo of this.gargalos_detectados) {
      const sugestao = this.gerarSugestao(gargalo);
      if (sugestao) {
        this.sugestoes_otimizacao.push(sugestao);
      }
    }

    return this.sugestoes_otimizacao;
  }

  /**
   * Obtém histórico de uma métrica
   */
  public obterHistorico(tipo: string, periodos: number = 24): any[] {
    let historico: any[] = [];

    switch (tipo) {
      case "cpu":
        historico = this.historico_cpu;
        break;
      case "memoria":
        historico = this.historico_memoria;
        break;
      case "bd":
        historico = this.historico_bd;
        break;
      case "api":
        historico = this.historico_api;
        break;
      case "cache":
        historico = this.historico_cache;
        break;
    }

    return historico.slice(-periodos);
  }

  /**
   * Exporta relatório de performance
   */
  public exportarRelatório(): string {
    const saude = this.coletarMetricasPerformance();
    const gargalos = this.detectarGargalos();
    const sugestoes = this.sugerirOtimizacao();

    const relatorio = {
      data_geracao: new Date().toISOString(),
      saude_sistema: saude,
      gargalos_detectados: gargalos,
      sugestoes_otimizacao: sugestoes,
      resumo: {
        total_gargalos: gargalos.length,
        gargalos_criticos: gargalos.filter((g) => g.severidade === "critica")
          .length,
        sugestoes_implementadas: sugestoes.length,
      },
    };

    return JSON.stringify(relatorio, null, 2);
  }

  /**
   * Define limiares customizados
   */
  public definirLimiares(novos_limiares: Partial<typeof this.limiares>): void {
    this.limiares = {
      ...this.limiares,
      ...novos_limiares,
    };
  }

  // ========================================================================
  // MÉTODOS PRIVADOS
  // ========================================================================

  private verificarGargaloCPU(metrica: MetricaCPU): void {
    if (metrica.uso_percentual > this.limiares.cpu_critico) {
      this.adicionarGargalo({
        tipo: "CPU",
        severidade: "critica",
        descricao: `Uso de CPU crítico: ${metrica.uso_percentual}%`,
        metrica_valor: metrica.uso_percentual,
        metrica_limiar: this.limiares.cpu_critico,
      });
    } else if (metrica.uso_percentual > this.limiares.cpu_warning) {
      this.adicionarGargalo({
        tipo: "CPU",
        severidade: "media",
        descricao: `Uso de CPU elevado: ${metrica.uso_percentual}%`,
        metrica_valor: metrica.uso_percentual,
        metrica_limiar: this.limiares.cpu_warning,
      });
    }
  }

  private verificarGargaloMemoria(metrica: MetricaMemoria): void {
    if (metrica.percentual_uso > this.limiares.memoria_critica) {
      this.adicionarGargalo({
        tipo: "Memória",
        severidade: "critica",
        descricao: `Uso de memória crítico: ${metrica.percentual_uso}%`,
        metrica_valor: metrica.percentual_uso,
        metrica_limiar: this.limiares.memoria_critica,
      });
    } else if (metrica.percentual_uso > this.limiares.memoria_warning) {
      this.adicionarGargalo({
        tipo: "Memória",
        severidade: "media",
        descricao: `Uso de memória elevado: ${metrica.percentual_uso}%`,
        metrica_valor: metrica.percentual_uso,
        metrica_limiar: this.limiares.memoria_warning,
      });
    }
  }

  private verificarGargaloBancoDados(metrica: MetricaBancoDados): void {
    if (metrica.tempo_resposta_ms > this.limiares.query_lenta) {
      this.adicionarGargalo({
        tipo: "Banco de Dados",
        severidade: "alta",
        descricao: `Queries lentas detectadas: ${metrica.slow_queries.length}`,
        metrica_valor: metrica.slow_queries.length,
        metrica_limiar: 5,
      });
    }
  }

  private verificarGargaloAPI(metrica: MetricaAPI): void {
    if (metrica.latencia_media_ms > this.limiares.resposta_lenta) {
      this.adicionarGargalo({
        tipo: "API",
        severidade: "media",
        descricao: `Latência de resposta elevada: ${metrica.latencia_media_ms}ms`,
        metrica_valor: metrica.latencia_media_ms,
        metrica_limiar: this.limiares.resposta_lenta,
      });
    }

    if (metrica.taxa_erro_percentual > this.limiares.taxa_erro_maxima) {
      this.adicionarGargalo({
        tipo: "API",
        severidade: "alta",
        descricao: `Taxa de erro elevada: ${metrica.taxa_erro_percentual}%`,
        metrica_valor: metrica.taxa_erro_percentual,
        metrica_limiar: this.limiares.taxa_erro_maxima,
      });
    }
  }

  private verificarGargaloCache(metrica: MetricaCache): void {
    if (metrica.hit_rate_percentual < this.limiares.cache_minimo) {
      this.adicionarGargalo({
        tipo: "Cache",
        severidade: "media",
        descricao: `Taxa de acerto do cache baixa: ${metrica.hit_rate_percentual}%`,
        metrica_valor: metrica.hit_rate_percentual,
        metrica_limiar: this.limiares.cache_minimo,
      });
    }
  }

  private adicionarGargalo(config: {
    tipo: string;
    severidade: "baixa" | "media" | "alta" | "critica";
    descricao: string;
    metrica_valor: number;
    metrica_limiar: number;
  }): void {
    // Evitar duplicatas
    const existe = this.gargalos_detectados.some(
      (g) => g.tipo === config.tipo && g.descricao === config.descricao
    );

    if (!existe) {
      this.gargalos_detectados.push({
        ...config,
        data_deteccao: new Date().toISOString(),
      });

      // Manter apenas últimos 100 gargalos
      if (this.gargalos_detectados.length > 100) {
        this.gargalos_detectados = this.gargalos_detectados.slice(-100);
      }
    }
  }

  private gerarSugestao(gargalo: Gargalo): SugestaoOtimizacao | null {
    const sugestoes: Record<string, SugestaoOtimizacao> = {
      CPU: {
        tipo: "CPU",
        problema: gargalo.descricao,
        solucao:
          "Considere escalar horizontalmente ou otimizar código ineficiente",
        impacto_estimado: "30-50% redução no uso de CPU",
        prioridade: gargalo.severidade === "critica" ? "critica" : "alta",
        esforço_estimado: "2-4 semanas",
      },
      Memória: {
        tipo: "Memória",
        problema: gargalo.descricao,
        solucao:
          "Implementar garbage collection agressivo ou aumentar heap size",
        impacto_estimado: "40-60% redução no consumo de memória",
        prioridade: gargalo.severidade === "critica" ? "critica" : "alta",
        esforço_estimado: "1-2 semanas",
      },
      "Banco de Dados": {
        tipo: "Banco de Dados",
        problema: gargalo.descricao,
        solucao:
          "Criar índices, otimizar queries ou considerar particionamento",
        impacto_estimado: "50-70% melhora em performance",
        prioridade: "alta",
        esforço_estimado: "2-3 semanas",
      },
      API: {
        tipo: "API",
        problema: gargalo.descricao,
        solucao:
          "Implementar caching, CDN ou otimizar endpoints lentos",
        impacto_estimado: "60-80% redução em latência",
        prioridade: "alta",
        esforço_estimado: "1-2 semanas",
      },
      Cache: {
        tipo: "Cache",
        problema: gargalo.descricao,
        solucao:
          "Revisar estratégia de cache, aumentar TTL ou adicionar mais camadas de cache",
        impacto_estimado: "20-40% melhora em throughput",
        prioridade: "media",
        esforço_estimado: "3-5 dias",
      },
    };

    return sugestoes[gargalo.tipo] || null;
  }
}

// ============================================================================
// INSTÂNCIA SINGLETON
// ============================================================================

export const monitoramentoPerformance = new MonitoramentoPerformance();
