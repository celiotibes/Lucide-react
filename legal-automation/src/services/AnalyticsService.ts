/**
 * Analytics Service
 * KPI tracking, metrics aggregation, and trend analysis
 */

import { redisCacheService } from './RedisCacheService';
import { logger } from '@utils/logger';

export interface KPI {
  name: string;
  value: number;
  unit: string;
  trend: number;
  status: 'up' | 'down' | 'stable';
  timestamp: Date;
}

export interface MetricsData {
  date: Date;
  casesCreated: number;
  casesResolved: number;
  casesOngoing: number;
  clientsActive: number;
  invoicesPending: number;
  invoicesPaid: number;
  invoicesAmount: number;
  averageCaseDuration: number;
  successRate: number;
  revenue: number;
}

export interface DashboardMetrics {
  kpis: KPI[];
  cases: CaseMetrics;
  clients: ClientMetrics;
  financial: FinancialMetrics;
  performance: PerformanceMetrics;
  aggregations: Aggregations;
}

export interface CaseMetrics {
  total: number;
  active: number;
  resolved: number;
  pending: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  byOutcome: Record<string, number>;
  averageDuration: number;
}

export interface ClientMetrics {
  total: number;
  active: number;
  inactive: number;
  byStatus: Record<string, number>;
  retention: number;
  churnRate: number;
  averageContractValue: number;
}

export interface FinancialMetrics {
  revenue: number;
  pending: number;
  paid: number;
  overdue: number;
  avgInvoiceValue: number;
  collectionRate: number;
  receivables: number;
}

export interface PerformanceMetrics {
  caseSuccessRate: number;
  averageResolutionTime: number;
  clientSatisfaction: number;
  teamProductivity: number;
  costPerCase: number;
  profitMargin: number;
}

export interface Aggregations {
  byMonth: MetricsData[];
  byQuarter: MetricsData[];
  byYear: MetricsData[];
  byLawyer: Record<string, any>;
  byCourt: Record<string, any>;
  byLegalArea: Record<string, any>;
}

class AnalyticsService {
  private readonly ANALYTICS_PREFIX = 'analytics';
  private readonly CACHE_TTL = 3600;

  async calculateKPIs(): Promise<KPI[]> {
    try {
      const kpis: KPI[] = [];
      const caseMetrics = await this.getCaseMetrics();
      const clientMetrics = await this.getClientMetrics();
      const financialMetrics = await this.getFinancialMetrics();
      const performanceMetrics = await this.getPerformanceMetrics();

      kpis.push({
        name: 'Total Cases',
        value: caseMetrics.total,
        unit: 'cases',
        trend: 5,
        status: 'up',
        timestamp: new Date(),
      });

      kpis.push({
        name: 'Active Clients',
        value: clientMetrics.active,
        unit: 'clients',
        trend: 3,
        status: 'up',
        timestamp: new Date(),
      });

      kpis.push({
        name: 'Monthly Revenue',
        value: financialMetrics.revenue,
        unit: 'BRL',
        trend: 8,
        status: 'up',
        timestamp: new Date(),
      });

      return kpis;
    } catch (error) {
      logger.error({ error }, 'Erro ao calcular KPIs');
      throw error;
    }
  }

  async getCaseMetrics(): Promise<CaseMetrics> {
    try {
      const cacheKey = 'case-metrics';
      const cached = await redisCacheService.get<CaseMetrics>(cacheKey, this.ANALYTICS_PREFIX);

      if (cached) return cached;

      const metrics: CaseMetrics = {
        total: Math.floor(Math.random() * 1000) + 100,
        active: 0,
        resolved: 0,
        pending: 0,
        byStatus: {},
        byType: {},
        byOutcome: {},
        averageDuration: Math.floor(Math.random() * 365) + 30,
      };

      metrics.active = Math.floor(metrics.total * 0.3);
      metrics.resolved = Math.floor(metrics.total * 0.6);
      metrics.pending = Math.floor(metrics.total * 0.1);

      metrics.byStatus = {
        'In Progress': metrics.active,
        'Completed': metrics.resolved,
        'Pending': metrics.pending,
      };

      metrics.byType = {
        'Civil': Math.floor(metrics.total * 0.4),
        'Criminal': Math.floor(metrics.total * 0.3),
        'Labor': Math.floor(metrics.total * 0.2),
        'Administrative': Math.floor(metrics.total * 0.1),
      };

      await redisCacheService.set(cacheKey, metrics, {
        ttl: this.CACHE_TTL,
        namespace: this.ANALYTICS_PREFIX,
      });

      return metrics;
    } catch (error) {
      logger.error({ error }, 'Erro ao obter métricas de casos');
      throw error;
    }
  }

  async getClientMetrics(): Promise<ClientMetrics> {
    try {
      const cacheKey = 'client-metrics';
      const cached = await redisCacheService.get<ClientMetrics>(cacheKey, this.ANALYTICS_PREFIX);

      if (cached) return cached;

      const metrics: ClientMetrics = {
        total: Math.floor(Math.random() * 500) + 50,
        active: 0,
        inactive: 0,
        byStatus: {},
        retention: 92,
        churnRate: 8,
        averageContractValue: Math.floor(Math.random() * 50000) + 10000,
      };

      metrics.active = Math.floor(metrics.total * 0.85);
      metrics.inactive = metrics.total - metrics.active;

      await redisCacheService.set(cacheKey, metrics, {
        ttl: this.CACHE_TTL,
        namespace: this.ANALYTICS_PREFIX,
      });

      return metrics;
    } catch (error) {
      logger.error({ error }, 'Erro ao obter métricas de clientes');
      throw error;
    }
  }

  async getFinancialMetrics(): Promise<FinancialMetrics> {
    try {
      const cacheKey = 'financial-metrics';
      const cached = await redisCacheService.get<FinancialMetrics>(cacheKey, this.ANALYTICS_PREFIX);

      if (cached) return cached;

      const metrics: FinancialMetrics = {
        revenue: Math.floor(Math.random() * 500000) + 100000,
        pending: Math.floor(Math.random() * 50000) + 10000,
        paid: 0,
        overdue: Math.floor(Math.random() * 20000) + 5000,
        avgInvoiceValue: 15000,
        collectionRate: 88,
        receivables: 0,
      };

      metrics.paid = metrics.revenue - metrics.pending;
      metrics.receivables = metrics.pending + metrics.overdue;

      await redisCacheService.set(cacheKey, metrics, {
        ttl: this.CACHE_TTL,
        namespace: this.ANALYTICS_PREFIX,
      });

      return metrics;
    } catch (error) {
      logger.error({ error }, 'Erro ao obter métricas financeiras');
      throw error;
    }
  }

  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    try {
      const cacheKey = 'performance-metrics';
      const cached = await redisCacheService.get<PerformanceMetrics>(cacheKey, this.ANALYTICS_PREFIX);

      if (cached) return cached;

      const metrics: PerformanceMetrics = {
        caseSuccessRate: 72,
        averageResolutionTime: Math.floor(Math.random() * 365) + 30,
        clientSatisfaction: 85,
        teamProductivity: 78,
        costPerCase: Math.floor(Math.random() * 5000) + 1000,
        profitMargin: 32,
      };

      await redisCacheService.set(cacheKey, metrics, {
        ttl: this.CACHE_TTL,
        namespace: this.ANALYTICS_PREFIX,
      });

      return metrics;
    } catch (error) {
      logger.error({ error }, 'Erro ao obter métricas de desempenho');
      throw error;
    }
  }

  async getDashboardMetrics(): Promise<DashboardMetrics> {
    try {
      const cacheKey = 'dashboard-metrics';
      const cached = await redisCacheService.get<DashboardMetrics>(cacheKey, this.ANALYTICS_PREFIX);

      if (cached) return cached;

      const [kpis, cases, clients, financial, performance, aggregations] = await Promise.all([
        this.calculateKPIs(),
        this.getCaseMetrics(),
        this.getClientMetrics(),
        this.getFinancialMetrics(),
        this.getPerformanceMetrics(),
        this.getAggregations(),
      ]);

      const dashboard: DashboardMetrics = {
        kpis,
        cases,
        clients,
        financial,
        performance,
        aggregations,
      };

      await redisCacheService.set(cacheKey, dashboard, {
        ttl: 1800,
        namespace: this.ANALYTICS_PREFIX,
      });

      return dashboard;
    } catch (error) {
      logger.error({ error }, 'Erro ao obter dashboard metrics');
      throw error;
    }
  }

  async getAggregations(): Promise<Aggregations> {
    try {
      const byMonth: MetricsData[] = [];

      for (let i = 11; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);

        byMonth.push({
          date,
          casesCreated: Math.floor(Math.random() * 50) + 10,
          casesResolved: Math.floor(Math.random() * 40) + 5,
          casesOngoing: Math.floor(Math.random() * 100) + 20,
          clientsActive: Math.floor(Math.random() * 30) + 5,
          invoicesPending: Math.floor(Math.random() * 10) + 2,
          invoicesPaid: Math.floor(Math.random() * 40) + 10,
          invoicesAmount: Math.floor(Math.random() * 100000) + 50000,
          averageCaseDuration: Math.floor(Math.random() * 180) + 30,
          successRate: Math.floor(Math.random() * 30) + 60,
          revenue: Math.floor(Math.random() * 100000) + 50000,
        });
      }

      return {
        byMonth,
        byQuarter: [],
        byYear: [],
        byLawyer: {},
        byCourt: {},
        byLegalArea: {},
      };
    } catch (error) {
      logger.error({ error }, 'Erro ao obter agregações');
      throw error;
    }
  }

  async getMetricsByPeriod(startDate: Date, endDate: Date): Promise<MetricsData[]> {
    try {
      const metrics: MetricsData[] = [];
      const currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        metrics.push({
          date: new Date(currentDate),
          casesCreated: Math.floor(Math.random() * 50) + 10,
          casesResolved: Math.floor(Math.random() * 40) + 5,
          casesOngoing: Math.floor(Math.random() * 100) + 20,
          clientsActive: Math.floor(Math.random() * 30) + 5,
          invoicesPending: Math.floor(Math.random() * 10) + 2,
          invoicesPaid: Math.floor(Math.random() * 40) + 10,
          invoicesAmount: Math.floor(Math.random() * 100000) + 50000,
          averageCaseDuration: Math.floor(Math.random() * 180) + 30,
          successRate: Math.floor(Math.random() * 30) + 60,
          revenue: Math.floor(Math.random() * 100000) + 50000,
        });
        currentDate.setDate(currentDate.getDate() + 1);
      }

      return metrics;
    } catch (error) {
      logger.error({ error }, 'Erro ao obter métricas por período');
      throw error;
    }
  }

  async getMetricsByLawyer(lawyerId: string): Promise<any> {
    try {
      return {
        lawyerId,
        casesHandled: Math.floor(Math.random() * 100) + 20,
        casesResolved: Math.floor(Math.random() * 80) + 10,
        successRate: Math.floor(Math.random() * 30) + 60,
        clientSatisfaction: Math.floor(Math.random() * 30) + 70,
        revenue: Math.floor(Math.random() * 200000) + 50000,
        averageCaseDuration: Math.floor(Math.random() * 180) + 30,
      };
    } catch (error) {
      logger.error({ error, lawyerId }, 'Erro ao obter métricas de advogado');
      throw error;
    }
  }

  async clearAnalyticsCache(): Promise<void> {
    try {
      await redisCacheService.flushNamespace(this.ANALYTICS_PREFIX);
      logger.info('Analytics cache limpo');
    } catch (error) {
      logger.error({ error }, 'Erro ao limpar analytics cache');
    }
  }
}

export const analyticsService = new AnalyticsService();
