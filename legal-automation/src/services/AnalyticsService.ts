import db from '@db/connection';
import { logger } from '@utils/logger';
import { dataEnrichmentService } from './DataEnrichmentService';
import { jusbrasilClient } from '@integrations/JusbrasilClient';

export interface DashboardMetrics {
  period: { startDate: Date; endDate: Date };
  totalCases: number;
  successRate: { value: number; trend: number };
  avgTimeToResolution: { value: number; trend: number };
  costPerCase: { value: number; trend: number };
  tribunalComparison: Array<{
    tribunal: string;
    cases: number;
    successRate: number;
    avgTime: number;
  }>;
  casesByStatus: Record<string, number>;
  casesByType: Record<string, number>;
  monthlyTrend: Array<{
    month: string;
    cases: number;
    successes: number;
    rate: number;
  }>;
  generatedAt: Date;
}

export interface LawyerPerformance {
  lawyerId: string;
  period: { startDate: Date; endDate: Date };
  totalCases: number;
  successRate: number;
  avgTimeToResolution: number;
  clientSatisfaction: number;
  costPerCase: number;
  ranking: number;
  casesTimeline: Array<{
    date: Date;
    cases: number;
    successes: number;
  }>;
}

export interface CasePrediction {
  caseId: string;
  predictedOutcome: string;
  confidence: number;
  contributingFactors: Record<string, number>;
  generatedAt: Date;
}

export interface JurisprudenceInsight {
  outcome: string;
  percentage: number;
  count: number;
  relatedCases: Array<{
    numero: string;
    outcome: string;
    similarity: number;
  }>;
  recommendation: string;
}

export class AnalyticsService {
  async getDashboardMetrics(period: { startDate: Date; endDate: Date }): Promise<DashboardMetrics> {
    logger.info(`Gerando métricas de dashboard para período: ${period.startDate} a ${period.endDate}`);

    try {
      const totalCases = await this.getTotalCases(period);
      const successRate = await this.getSuccessRate(period);
      const avgTimeToResolution = await this.getAvgTimeToResolution(period);
      const costPerCase = await this.getCostPerCase(period);
      const tribunalComparison = await this.getTribunalComparison(period);
      const casesByStatus = await this.getCasesByStatus(period);
      const casesByType = await this.getCasesByType(period);
      const monthlyTrend = await this.getMonthlyTrend(period);

      // Calculate trends (compare to previous period)
      const prevPeriod = {
        startDate: new Date(period.startDate.getTime() - (period.endDate.getTime() - period.startDate.getTime())),
        endDate: period.startDate,
      };

      const prevSuccessRate = await this.getSuccessRate(prevPeriod);
      const prevAvgTime = await this.getAvgTimeToResolution(prevPeriod);
      const prevCostPerCase = await this.getCostPerCase(prevPeriod);

      return {
        period,
        totalCases,
        successRate: {
          value: successRate,
          trend: ((successRate - prevSuccessRate) / prevSuccessRate) * 100,
        },
        avgTimeToResolution: {
          value: avgTimeToResolution,
          trend: ((avgTimeToResolution - prevAvgTime) / prevAvgTime) * 100,
        },
        costPerCase: {
          value: costPerCase,
          trend: ((costPerCase - prevCostPerCase) / prevCostPerCase) * 100,
        },
        tribunalComparison,
        casesByStatus,
        casesByType,
        monthlyTrend,
        generatedAt: new Date(),
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao gerar métricas de dashboard');
      throw error;
    }
  }

  async getLawyerPerformance(
    lawyerId: string,
    period: { startDate: Date; endDate: Date },
  ): Promise<LawyerPerformance> {
    logger.info(`Gerando performance do advogado ${lawyerId}`);

    try {
      const totalCases = await this.getLawyerCaseCount(lawyerId, period);
      const successRate = await this.getLawyerSuccessRate(lawyerId, period);
      const avgTimeToResolution = await this.getLawyerAvgTimeToResolution(lawyerId, period);
      const clientSatisfaction = await this.getLawyerClientSatisfaction(lawyerId, period);
      const costPerCase = await this.getLawyerCostPerCase(lawyerId, period);
      const ranking = await this.getLawyerRanking(lawyerId, period);
      const casesTimeline = await this.getLawyerCasesTimeline(lawyerId, period);

      return {
        lawyerId,
        period,
        totalCases,
        successRate,
        avgTimeToResolution,
        clientSatisfaction,
        costPerCase,
        ranking,
        casesTimeline,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao gerar performance do advogado');
      throw error;
    }
  }

  async predictCaseOutcome(caseId: string): Promise<CasePrediction> {
    logger.info(`Predizendo resultado do caso ${caseId}`);

    try {
      // Get case data
      const caseData = await this.getCaseData(caseId);

      if (!caseData) {
        throw new Error(`Caso ${caseId} não encontrado`);
      }

      // Extract features
      const features = this.extractFeatures(caseData);

      // Use simple ML model based on historical data
      const prediction = await this.mlPredict(features);

      return {
        caseId,
        predictedOutcome: prediction.outcome,
        confidence: prediction.confidence,
        contributingFactors: prediction.factors,
        generatedAt: new Date(),
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao predizer resultado');
      throw error;
    }
  }

  async getJurisprudenceInsights(caseId: string): Promise<JurisprudenceInsight[]> {
    logger.info(`Gerando insights de jurisprudência para caso ${caseId}`);

    try {
      const caseData = await this.getCaseData(caseId);

      if (!caseData) {
        throw new Error(`Caso ${caseId} não encontrado`);
      }

      // Search for similar cases via Jusbrasil
      const similarCases = await jusbrasilClient.buscarCasesSimilares({
        assunto: caseData.subject,
        tribunal: caseData.tribunal,
        limit: 20,
      });

      // Analyze outcomes
      const outcomes = similarCases.map((c) => c.resultado);
      const outcomeCount = outcomes.reduce((acc: Record<string, number>, outcome: string) => {
        acc[outcome] = (acc[outcome] || 0) + 1;
        return acc;
      }, {});

      const insights: JurisprudenceInsight[] = [];

      for (const [outcome, count] of Object.entries(outcomeCount)) {
        const percentage = ((count as number) / outcomes.length) * 100;
        const relatedCases = similarCases
          .filter((c) => c.resultado === outcome)
          .map((c) => ({
            numero: c.numero,
            outcome: c.resultado,
            similarity: c.similarity,
          }));

        insights.push({
          outcome,
          percentage,
          count: count as number,
          relatedCases,
          recommendation: this.getRecommendation(outcome, percentage),
        });
      }

      return insights.sort((a, b) => b.percentage - a.percentage);
    } catch (error) {
      logger.error({ err: error }, 'Erro ao gerar insights de jurisprudência');
      throw error;
    }
  }

  // Private helper methods

  private async getTotalCases(period: { startDate: Date; endDate: Date }): Promise<number> {
    const result = await db.query(
      `SELECT COUNT(*) as count FROM cases
       WHERE created_at BETWEEN $1 AND $2`,
      [period.startDate, period.endDate],
    );
    return result.rows[0]?.count || 0;
  }

  private async getSuccessRate(period: { startDate: Date; endDate: Date }): Promise<number> {
    const result = await db.query(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN outcome = 'ganho' THEN 1 ELSE 0 END) as successes
       FROM cases
       WHERE created_at BETWEEN $1 AND $2`,
      [period.startDate, period.endDate],
    );

    const total = result.rows[0]?.total || 0;
    const successes = result.rows[0]?.successes || 0;

    return total > 0 ? (successes / total) * 100 : 0;
  }

  private async getAvgTimeToResolution(period: { startDate: Date; endDate: Date }): Promise<number> {
    const result = await db.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 86400) as avg_days
       FROM cases
       WHERE created_at BETWEEN $1 AND $2 AND closed_at IS NOT NULL`,
      [period.startDate, period.endDate],
    );

    return Math.round(result.rows[0]?.avg_days || 0);
  }

  private async getCostPerCase(period: { startDate: Date; endDate: Date }): Promise<number> {
    const result = await db.query(
      `SELECT AVG(total_cost) as avg_cost FROM cases
       WHERE created_at BETWEEN $1 AND $2`,
      [period.startDate, period.endDate],
    );

    return Math.round((result.rows[0]?.avg_cost || 0) * 100) / 100;
  }

  private async getTribunalComparison(
    period: { startDate: Date; endDate: Date },
  ): Promise<Array<{ tribunal: string; cases: number; successRate: number; avgTime: number }>> {
    const result = await db.query(
      `SELECT
        tribunal,
        COUNT(*) as cases,
        SUM(CASE WHEN outcome = 'ganho' THEN 1 ELSE 0 END)::float / COUNT(*) * 100 as success_rate,
        AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 86400)::int as avg_time
       FROM cases
       WHERE created_at BETWEEN $1 AND $2
       GROUP BY tribunal
       ORDER BY cases DESC`,
      [period.startDate, period.endDate],
    );

    return result.rows.map((row) => ({
      tribunal: row.tribunal,
      cases: row.cases,
      successRate: Math.round(row.success_rate * 100) / 100,
      avgTime: row.avg_time,
    }));
  }

  private async getCasesByStatus(period: { startDate: Date; endDate: Date }): Promise<Record<string, number>> {
    const result = await db.query(
      `SELECT status, COUNT(*) as count FROM cases
       WHERE created_at BETWEEN $1 AND $2
       GROUP BY status`,
      [period.startDate, period.endDate],
    );

    const statuses: Record<string, number> = {};
    for (const row of result.rows) {
      statuses[row.status] = row.count;
    }
    return statuses;
  }

  private async getCasesByType(period: { startDate: Date; endDate: Date }): Promise<Record<string, number>> {
    const result = await db.query(
      `SELECT type, COUNT(*) as count FROM cases
       WHERE created_at BETWEEN $1 AND $2
       GROUP BY type`,
      [period.startDate, period.endDate],
    );

    const types: Record<string, number> = {};
    for (const row of result.rows) {
      types[row.type] = row.count;
    }
    return types;
  }

  private async getMonthlyTrend(
    period: { startDate: Date; endDate: Date },
  ): Promise<Array<{ month: string; cases: number; successes: number; rate: number }>> {
    const result = await db.query(
      `SELECT
        TO_CHAR(created_at, 'YYYY-MM') as month,
        COUNT(*) as cases,
        SUM(CASE WHEN outcome = 'ganho' THEN 1 ELSE 0 END) as successes
       FROM cases
       WHERE created_at BETWEEN $1 AND $2
       GROUP BY month
       ORDER BY month`,
      [period.startDate, period.endDate],
    );

    return result.rows.map((row) => ({
      month: row.month,
      cases: row.cases,
      successes: row.successes,
      rate: Math.round((row.successes / row.cases) * 100 * 100) / 100,
    }));
  }

  private async getLawyerCaseCount(lawyerId: string, period: { startDate: Date; endDate: Date }): Promise<number> {
    const result = await db.query(
      `SELECT COUNT(*) as count FROM cases
       WHERE lawyer_id = $1 AND created_at BETWEEN $2 AND $3`,
      [lawyerId, period.startDate, period.endDate],
    );
    return result.rows[0]?.count || 0;
  }

  private async getLawyerSuccessRate(lawyerId: string, period: { startDate: Date; endDate: Date }): Promise<number> {
    const result = await db.query(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN outcome = 'ganho' THEN 1 ELSE 0 END) as successes
       FROM cases
       WHERE lawyer_id = $1 AND created_at BETWEEN $2 AND $3`,
      [lawyerId, period.startDate, period.endDate],
    );

    const total = result.rows[0]?.total || 0;
    const successes = result.rows[0]?.successes || 0;

    return total > 0 ? (successes / total) * 100 : 0;
  }

  private async getLawyerAvgTimeToResolution(
    lawyerId: string,
    period: { startDate: Date; endDate: Date },
  ): Promise<number> {
    const result = await db.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 86400) as avg_days
       FROM cases
       WHERE lawyer_id = $1 AND created_at BETWEEN $2 AND $3 AND closed_at IS NOT NULL`,
      [lawyerId, period.startDate, period.endDate],
    );

    return Math.round(result.rows[0]?.avg_days || 0);
  }

  private async getLawyerClientSatisfaction(
    lawyerId: string,
    period: { startDate: Date; endDate: Date },
  ): Promise<number> {
    const result = await db.query(
      `SELECT AVG(satisfaction_score) as avg_satisfaction FROM cases
       WHERE lawyer_id = $1 AND created_at BETWEEN $2 AND $3`,
      [lawyerId, period.startDate, period.endDate],
    );

    return Math.round((result.rows[0]?.avg_satisfaction || 0) * 100) / 100;
  }

  private async getLawyerCostPerCase(lawyerId: string, period: { startDate: Date; endDate: Date }): Promise<number> {
    const result = await db.query(
      `SELECT AVG(total_cost) as avg_cost FROM cases
       WHERE lawyer_id = $1 AND created_at BETWEEN $2 AND $3`,
      [lawyerId, period.startDate, period.endDate],
    );

    return Math.round((result.rows[0]?.avg_cost || 0) * 100) / 100;
  }

  private async getLawyerRanking(lawyerId: string, period: { startDate: Date; endDate: Date }): Promise<number> {
    const result = await db.query(
      `SELECT COUNT(DISTINCT lawyer_id) as total_lawyers
       FROM cases
       WHERE created_at BETWEEN $1 AND $2`,
      [period.startDate, period.endDate],
    );

    const totalLawyers = result.rows[0]?.total_lawyers || 0;

    // Get this lawyer's rank by success rate
    const rankResult = await db.query(
      `WITH lawyer_stats AS (
        SELECT
          lawyer_id,
          SUM(CASE WHEN outcome = 'ganho' THEN 1 ELSE 0 END)::float / COUNT(*) * 100 as success_rate
        FROM cases
        WHERE created_at BETWEEN $1 AND $2
        GROUP BY lawyer_id
       )
       SELECT COUNT(*) as rank FROM lawyer_stats
       WHERE success_rate >= (SELECT success_rate FROM lawyer_stats WHERE lawyer_id = $3)`,
      [period.startDate, period.endDate, lawyerId],
    );

    return rankResult.rows[0]?.rank || totalLawyers;
  }

  private async getLawyerCasesTimeline(
    lawyerId: string,
    period: { startDate: Date; endDate: Date },
  ): Promise<Array<{ date: Date; cases: number; successes: number }>> {
    const result = await db.query(
      `SELECT
        DATE(created_at) as date,
        COUNT(*) as cases,
        SUM(CASE WHEN outcome = 'ganho' THEN 1 ELSE 0 END) as successes
       FROM cases
       WHERE lawyer_id = $1 AND created_at BETWEEN $2 AND $3
       GROUP BY DATE(created_at)
       ORDER BY date`,
      [lawyerId, period.startDate, period.endDate],
    );

    return result.rows.map((row) => ({
      date: new Date(row.date),
      cases: row.cases,
      successes: row.successes,
    }));
  }

  private async getCaseData(caseId: string): Promise<any> {
    const result = await db.query(`SELECT * FROM cases WHERE id = $1`, [caseId]);
    return result.rows[0] || null;
  }

  private extractFeatures(caseData: any): Record<string, number | string> {
    return {
      caseType: caseData.type,
      tribunal: caseData.tribunal,
      subject: caseData.subject,
      valueInDispute: caseData.value_in_dispute || 0,
      numberOfParties: caseData.number_of_parties || 2,
      numberOfAppearances: caseData.number_of_appearances || 0,
      daysOpen: Math.floor((Date.now() - new Date(caseData.created_at).getTime()) / (1000 * 60 * 60 * 24)),
      lawyerWinRate: caseData.lawyer_win_rate || 0,
      complexityScore: caseData.complexity_score || 0,
    };
  }

  private async mlPredict(features: Record<string, number | string>): Promise<{
    outcome: string;
    confidence: number;
    factors: Record<string, number>;
  }> {
    // Simple ML model based on tribunal success rates
    const tribunal = features.tribunal as string;

    // Get historical success rate for this tribunal
    const result = await db.query(
      `SELECT
        SUM(CASE WHEN outcome = 'ganho' THEN 1 ELSE 0 END)::float / COUNT(*) * 100 as success_rate
       FROM cases
       WHERE tribunal = $1`,
      [tribunal],
    );

    const successRate = result.rows[0]?.success_rate || 50;
    const daysOpen = features.daysOpen as number;
    const lawyerWinRate = features.lawyerWinRate as number;

    // Simple weighted model
    const predictedSuccessRate = (successRate * 0.4 + lawyerWinRate * 0.4 + (daysOpen > 365 ? 60 : 50) * 0.2) / 100;

    return {
      outcome: predictedSuccessRate > 0.5 ? 'ganho' : 'perda',
      confidence: Math.abs(predictedSuccessRate - 0.5) * 2,
      factors: {
        tribunalHistoricSuccessRate: successRate / 100,
        lawyerWinRate: lawyerWinRate / 100,
        caseAgeFactor: daysOpen > 365 ? 0.6 : 0.5,
      },
    };
  }

  private getRecommendation(outcome: string, percentage: number): string {
    if (percentage > 70) {
      return `Forte probabilidade de ${outcome} (${percentage.toFixed(1)}%). Recomenda-se proceder com confiança.`;
    } else if (percentage > 50) {
      return `Probabilidade moderada de ${outcome} (${percentage.toFixed(1)}%). Considere estratégia alternativa.`;
    } else {
      return `Probabilidade baixa de ${outcome} (${percentage.toFixed(1)}%). Recomenda-se análise cuidadosa.`;
    }
  }

  async getTribunalComparisonPublic(
    period: { startDate: Date; endDate: Date },
  ): Promise<Array<{ tribunal: string; cases: number; successRate: number; avgTime: number }>> {
    return this.getTribunalComparison(period);
  }

  async getSuccessRateByTribunal(
    period: { startDate: Date; endDate: Date },
  ): Promise<Array<{ tribunal: string; successRate: number }>> {
    logger.info(`Obtendo taxa de sucesso por tribunal`);

    const result = await db.query(
      `SELECT
        tribunal,
        SUM(CASE WHEN outcome = 'ganho' THEN 1 ELSE 0 END)::float / COUNT(*) * 100 as success_rate
       FROM cases
       WHERE created_at BETWEEN $1 AND $2
       GROUP BY tribunal
       ORDER BY success_rate DESC`,
      [period.startDate, period.endDate],
    );

    return result.rows.map((row) => ({
      tribunal: row.tribunal,
      successRate: Math.round(row.success_rate * 100) / 100,
    }));
  }

  async getTrends(options: {
    startDate: Date;
    endDate: Date;
    granularity: 'daily' | 'weekly' | 'monthly';
  }): Promise<
    Array<{
      period: string;
      totalCases: number;
      successfulCases: number;
      successRate: number;
      avgResolutionTime: number;
    }>
  > {
    logger.info(`Obtendo tendências com granularidade ${options.granularity}`);

    let dateFormat: string;
    switch (options.granularity) {
      case 'daily':
        dateFormat = 'YYYY-MM-DD';
        break;
      case 'weekly':
        dateFormat = 'IYYY-IW';
        break;
      case 'monthly':
        dateFormat = 'YYYY-MM';
        break;
    }

    const result = await db.query(
      `SELECT
        TO_CHAR(created_at, $3) as period,
        COUNT(*) as total_cases,
        SUM(CASE WHEN outcome = 'ganho' THEN 1 ELSE 0 END) as successful_cases,
        SUM(CASE WHEN outcome = 'ganho' THEN 1 ELSE 0 END)::float / COUNT(*) * 100 as success_rate,
        AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 86400)::int as avg_resolution_time
       FROM cases
       WHERE created_at BETWEEN $1 AND $2
       GROUP BY TO_CHAR(created_at, $3)
       ORDER BY period`,
      [options.startDate, options.endDate, dateFormat],
    );

    return result.rows.map((row) => ({
      period: row.period,
      totalCases: row.total_cases,
      successfulCases: row.successful_cases,
      successRate: Math.round(row.success_rate * 100) / 100,
      avgResolutionTime: row.avg_resolution_time || 0,
    }));
  }
}

export const analyticsService = new AnalyticsService();
