import { logger } from '@utils/logger';
import { crmService } from '@services/CRMService';

// ============================================================================
// JURIMETRIA SERVICE - Phase 4 - Legal Analytics & Case Prediction
// ============================================================================

export interface CaseMetrics {
  caseId: string;
  caseType: string;
  clientId: string;
  court: string;
  judge: string;
  dateOpened: Date;
  dateClosed?: Date;
  outcome: 'favorable' | 'unfavorable' | 'partial' | 'dismissed' | 'settled' | 'pending';
  result?: string;
  duration?: number; // days
  costs: number;
  revenue: number;
  profitability: number;
  complexity: 'simple' | 'moderate' | 'complex';
  lawyer: string;
  successFactors?: string[];
  failureFactors?: string[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CaseTypeAnalysis {
  caseType: string;
  totalCases: number;
  successCount: number;
  unfavorableCount: number;
  partialCount: number;
  dismissedCount: number;
  settledCount: number;
  successRate: number; // percentage
  averageDuration: number; // days
  averageCosts: number;
  averageRevenue: number;
  averageProfitability: number;
  totalCosts: number;
  totalRevenue: number;
  netProfitability: number;
}

export interface LawyerPerformance {
  lawyerId: string;
  lawyerName: string;
  totalCases: number;
  successRate: number;
  averageDuration: number;
  totalRevenue: number;
  totalCosts: number;
  profitabilityRate: number;
  specialties: string[];
  topCaseTypes: string[];
  averageCaseValue: number;
}

export interface CourtAnalysis {
  court: string;
  totalCases: number;
  successRate: number;
  averageDuration: number;
  judgesInvolved: string[];
  averageComplexity: string;
  successFactors: string[];
}

export interface Trend {
  metric: string;
  period: string;
  value: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
}

export interface PredictionModel {
  caseType: string;
  complexity: string;
  court: string;
  predictedOutcome: 'favorable' | 'unfavorable' | 'partial' | 'dismissed' | 'settled';
  successProbability: number; // 0-1
  estimatedDuration: number; // days
  estimatedCosts: number;
  confidence: number; // 0-1
  basedOnCases: number;
}

export class JurimetriaService {
  private cases: Map<string, CaseMetrics> = new Map();
  private caseTypeAnalysis: Map<string, CaseTypeAnalysis> = new Map();
  private lawyerPerformance: Map<string, LawyerPerformance> = new Map();
  private courtAnalysis: Map<string, CourtAnalysis> = new Map();

  /**
   * Register case metrics
   */
  async registerCaseMetrics(
    clientId: string,
    caseType: string,
    court: string,
    judge: string,
    lawyer: string,
    complexity: 'simple' | 'moderate' | 'complex',
    costs: number,
    revenue: number,
  ): Promise<CaseMetrics> {
    try {
      const client = await crmService.getClientById(clientId);
      if (!client) {
        throw new Error(`Cliente ${clientId} não encontrado`);
      }

      const caseId = `case-${Date.now()}`;

      const caseMetrics: CaseMetrics = {
        caseId,
        caseType,
        clientId,
        court,
        judge,
        dateOpened: new Date(),
        outcome: 'pending',
        costs,
        revenue,
        profitability: revenue - costs,
        complexity,
        lawyer,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.cases.set(caseId, caseMetrics);

      // Update aggregated analytics
      await this.updateAnalytics(caseType, court, lawyer);

      logger.info(`Caso ${caseId} registrado: ${caseType} em ${court}`);
      return caseMetrics;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao registrar métricas de caso');
      throw error;
    }
  }

  /**
   * Update case outcome
   */
  async updateCaseOutcome(
    caseId: string,
    outcome: 'favorable' | 'unfavorable' | 'partial' | 'dismissed' | 'settled',
    result?: string,
  ): Promise<CaseMetrics> {
    try {
      const caseMetrics = this.cases.get(caseId);
      if (!caseMetrics) {
        throw new Error(`Caso ${caseId} não encontrado`);
      }

      caseMetrics.outcome = outcome;
      caseMetrics.result = result;
      caseMetrics.dateClosed = new Date();
      caseMetrics.duration = Math.floor(
        (caseMetrics.dateClosed.getTime() - caseMetrics.dateOpened.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      caseMetrics.updatedAt = new Date();

      this.cases.set(caseId, caseMetrics);

      // Update analytics
      await this.updateAnalytics(caseMetrics.caseType, caseMetrics.court, caseMetrics.lawyer);

      logger.info(`Resultado do caso ${caseId} atualizado: ${outcome}`);
      return caseMetrics;
    } catch (error) {
      logger.error({ err: error }, `Erro ao atualizar resultado do caso ${caseId}`);
      throw error;
    }
  }

  /**
   * Update aggregated analytics
   */
  private async updateAnalytics(caseType: string, court: string, lawyer: string): Promise<void> {
    // Update case type analysis
    const caseTypeMetrics = this.calculateCaseTypeAnalysis(caseType);
    this.caseTypeAnalysis.set(caseType, caseTypeMetrics);

    // Update court analysis
    const courtMetrics = this.calculateCourtAnalysis(court);
    this.courtAnalysis.set(court, courtMetrics);

    // Update lawyer performance
    const lawyerMetrics = this.calculateLawyerPerformance(lawyer);
    this.lawyerPerformance.set(lawyer, lawyerMetrics);
  }

  /**
   * Calculate case type analysis
   */
  private calculateCaseTypeAnalysis(caseType: string): CaseTypeAnalysis {
    const casesByType = Array.from(this.cases.values()).filter((c) => c.caseType === caseType);

    const successCount = casesByType.filter((c) => c.outcome === 'favorable').length;
    const unfavorableCount = casesByType.filter((c) => c.outcome === 'unfavorable').length;
    const partialCount = casesByType.filter((c) => c.outcome === 'partial').length;
    const dismissedCount = casesByType.filter((c) => c.outcome === 'dismissed').length;
    const settledCount = casesByType.filter((c) => c.outcome === 'settled').length;

    const closedCases = casesByType.filter((c) => c.dateClosed);
    const averageDuration =
      closedCases.length > 0
        ? closedCases.reduce((sum, c) => sum + (c.duration || 0), 0) / closedCases.length
        : 0;

    const totalCosts = casesByType.reduce((sum, c) => sum + c.costs, 0);
    const totalRevenue = casesByType.reduce((sum, c) => sum + c.revenue, 0);

    return {
      caseType,
      totalCases: casesByType.length,
      successCount,
      unfavorableCount,
      partialCount,
      dismissedCount,
      settledCount,
      successRate: casesByType.length > 0 ? (successCount / closedCases.length) * 100 : 0,
      averageDuration,
      averageCosts: casesByType.length > 0 ? totalCosts / casesByType.length : 0,
      averageRevenue: casesByType.length > 0 ? totalRevenue / casesByType.length : 0,
      averageProfitability: casesByType.length > 0 ? (totalRevenue - totalCosts) / casesByType.length : 0,
      totalCosts,
      totalRevenue,
      netProfitability: totalRevenue - totalCosts,
    };
  }

  /**
   * Calculate court analysis
   */
  private calculateCourtAnalysis(court: string): CourtAnalysis {
    const casesByCourt = Array.from(this.cases.values()).filter((c) => c.court === court);

    const successCount = casesByCourt.filter((c) => c.outcome === 'favorable').length;
    const closedCases = casesByCourt.filter((c) => c.dateClosed);
    const averageDuration =
      closedCases.length > 0
        ? closedCases.reduce((sum, c) => sum + (c.duration || 0), 0) / closedCases.length
        : 0;

    const judges = [...new Set(casesByCourt.map((c) => c.judge))];
    const complexities = casesByCourt.map((c) => c.complexity);
    const averageComplexity = complexities.length > 0 ? complexities[0] : 'moderate';

    // Extract success factors
    const successCases = casesByCourt.filter((c) => c.outcome === 'favorable');
    const successFactors = [
      ...new Set(
        successCases
          .flatMap((c) => c.successFactors || [])
          .slice(0, 5),
      ),
    ];

    return {
      court,
      totalCases: casesByCourt.length,
      successRate: closedCases.length > 0 ? (successCount / closedCases.length) * 100 : 0,
      averageDuration,
      judgesInvolved: judges,
      averageComplexity,
      successFactors,
    };
  }

  /**
   * Calculate lawyer performance
   */
  private calculateLawyerPerformance(lawyerId: string): LawyerPerformance {
    const lawyerCases = Array.from(this.cases.values()).filter((c) => c.lawyer === lawyerId);

    const successCount = lawyerCases.filter((c) => c.outcome === 'favorable').length;
    const closedCases = lawyerCases.filter((c) => c.dateClosed);

    const averageDuration =
      closedCases.length > 0
        ? closedCases.reduce((sum, c) => sum + (c.duration || 0), 0) / closedCases.length
        : 0;

    const totalRevenue = lawyerCases.reduce((sum, c) => sum + c.revenue, 0);
    const totalCosts = lawyerCases.reduce((sum, c) => sum + c.costs, 0);

    const caseTypes = [...new Set(lawyerCases.map((c) => c.caseType))];
    const caseTypeCounts = caseTypes.map((type) => ({
      type,
      count: lawyerCases.filter((c) => c.caseType === type).length,
    }));
    const topCaseTypes = caseTypeCounts
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((c) => c.type);

    return {
      lawyerId,
      lawyerName: lawyerId,
      totalCases: lawyerCases.length,
      successRate: closedCases.length > 0 ? (successCount / closedCases.length) * 100 : 0,
      averageDuration,
      totalRevenue,
      totalCosts,
      profitabilityRate:
        lawyerCases.length > 0 ? ((totalRevenue - totalCosts) / totalRevenue) * 100 : 0,
      specialties: topCaseTypes,
      topCaseTypes,
      averageCaseValue: lawyerCases.length > 0 ? totalRevenue / lawyerCases.length : 0,
    };
  }

  /**
   * Get case type analysis
   */
  async getCaseTypeAnalysis(caseType: string): Promise<CaseTypeAnalysis | null> {
    try {
      return this.caseTypeAnalysis.get(caseType) || null;
    } catch (error) {
      logger.error({ err: error }, `Erro ao obter análise de ${caseType}`);
      throw error;
    }
  }

  /**
   * Get all case type analysis
   */
  async getAllCaseTypeAnalysis(): Promise<CaseTypeAnalysis[]> {
    try {
      return Array.from(this.caseTypeAnalysis.values());
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter análises de tipos de caso');
      throw error;
    }
  }

  /**
   * Get court analysis
   */
  async getCourtAnalysis(court: string): Promise<CourtAnalysis | null> {
    try {
      return this.courtAnalysis.get(court) || null;
    } catch (error) {
      logger.error({ err: error }, `Erro ao obter análise de ${court}`);
      throw error;
    }
  }

  /**
   * Get lawyer performance
   */
  async getLawyerPerformance(lawyerId: string): Promise<LawyerPerformance | null> {
    try {
      return this.lawyerPerformance.get(lawyerId) || null;
    } catch (error) {
      logger.error({ err: error }, `Erro ao obter desempenho do advogado ${lawyerId}`);
      throw error;
    }
  }

  /**
   * Predict case outcome
   */
  async predictCaseOutcome(
    caseType: string,
    complexity: 'simple' | 'moderate' | 'complex',
    court: string,
  ): Promise<PredictionModel> {
    try {
      const caseTypeAnalysis = this.caseTypeAnalysis.get(caseType);
      const courtAnalysis = this.courtAnalysis.get(court);

      const basedOnCases = (caseTypeAnalysis?.totalCases || 0) + (courtAnalysis?.totalCases || 0);

      // Simple prediction model based on historical data
      const baseSuccessRate = caseTypeAnalysis?.successRate || 50;
      const courtModifier = courtAnalysis ? (courtAnalysis.successRate / 100) * 0.3 : 0;
      const complexityModifier = complexity === 'simple' ? 0.1 : complexity === 'complex' ? -0.15 : 0;

      const successProbability = Math.max(
        0,
        Math.min(1, (baseSuccessRate + courtModifier + complexityModifier) / 100),
      );

      const estimatedDuration = (caseTypeAnalysis?.averageDuration || 365) *
        (complexity === 'simple' ? 0.7 : complexity === 'complex' ? 1.3 : 1);

      const estimatedCosts = (caseTypeAnalysis?.averageCosts || 5000) *
        (complexity === 'simple' ? 0.8 : complexity === 'complex' ? 1.5 : 1);

      const outcomes = ['favorable', 'unfavorable', 'partial', 'dismissed', 'settled'] as const;
      const probabilityMap = {
        favorable: successProbability,
        unfavorable: (1 - successProbability) * 0.5,
        partial: (1 - successProbability) * 0.3,
        dismissed: (1 - successProbability) * 0.1,
        settled: (1 - successProbability) * 0.1,
      };

      const predictedOutcome = outcomes.reduce((best, outcome) =>
        probabilityMap[outcome] > probabilityMap[best] ? outcome : best
      );

      return {
        caseType,
        complexity,
        court,
        predictedOutcome,
        successProbability,
        estimatedDuration: Math.round(estimatedDuration),
        estimatedCosts,
        confidence: basedOnCases > 0 ? Math.min(1, basedOnCases / 100) : 0.3,
        basedOnCases,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao prever resultado de caso');
      throw error;
    }
  }

  /**
   * Get trend analysis
   */
  async getTrendAnalysis(metric: 'success_rate' | 'average_duration' | 'profitability'): Promise<Trend[]> {
    try {
      const trends: Trend[] = [];

      // Simplified trend calculation - would need time series data for real implementation
      const caseArray = Array.from(this.cases.values());
      const now = new Date();
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const recentCases = caseArray.filter((c) => c.createdAt >= oneMonthAgo);
      const olderCases = caseArray.filter((c) => c.createdAt < oneMonthAgo);

      if (metric === 'success_rate') {
        const recentSuccess =
          recentCases.filter((c) => c.outcome === 'favorable').length / Math.max(1, recentCases.length);
        const olderSuccess =
          olderCases.filter((c) => c.outcome === 'favorable').length / Math.max(1, olderCases.length);
        const change = ((recentSuccess - olderSuccess) / Math.max(0.01, olderSuccess)) * 100;

        trends.push({
          metric: 'success_rate',
          period: 'last_30_days',
          value: recentSuccess * 100,
          changePercent: change,
          trend: change > 5 ? 'up' : change < -5 ? 'down' : 'stable',
        });
      }

      return trends;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao calcular tendências');
      throw error;
    }
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalCases: number;
    successfulCases: number;
    successRate: number;
    totalRevenue: number;
    totalCosts: number;
    netProfitability: number;
    averageCaseDuration: number;
    activeCases: number;
  } {
    const caseArray = Array.from(this.cases.values());
    const closedCases = caseArray.filter((c) => c.dateClosed);
    const successCount = closedCases.filter((c) => c.outcome === 'favorable').length;

    const totalRevenue = caseArray.reduce((sum, c) => sum + c.revenue, 0);
    const totalCosts = caseArray.reduce((sum, c) => sum + c.costs, 0);
    const averageDuration =
      closedCases.length > 0
        ? closedCases.reduce((sum, c) => sum + (c.duration || 0), 0) / closedCases.length
        : 0;

    return {
      totalCases: caseArray.length,
      successfulCases: successCount,
      successRate: closedCases.length > 0 ? (successCount / closedCases.length) * 100 : 0,
      totalRevenue,
      totalCosts,
      netProfitability: totalRevenue - totalCosts,
      averageCaseDuration: averageDuration,
      activeCases: caseArray.filter((c) => c.outcome === 'pending').length,
    };
  }

  /**
   * Reset data (for testing)
   */
  reset(): void {
    this.cases.clear();
    this.caseTypeAnalysis.clear();
    this.lawyerPerformance.clear();
    this.courtAnalysis.clear();
    logger.info('Jurimetria Service resetado');
  }
}

export const jurimetriaService = new JurimetriaService();
