import { pool } from '@/database/connection';
import { logger } from '@utils/logger';
import { AppError } from '@utils/errors';

interface PredictionInput {
  caseId: string;
  caseType: string;
  tribunal: string;
  amount?: number;
  processNumberFormat?: string;
}

interface Prediction {
  id: string;
  userId: string;
  caseId: string;
  predictionType: string;
  confidence: number;
  predictedOutcome?: string;
  predictedDeadline?: Date;
  successProbability: number;
  riskLevel: string;
  predictionData: any;
  createdAt: Date;
}

class PredictionService {
  // State-specific average deadline multipliers (days)
  private readonly stateDeadlineMultipliers: { [key: string]: number } = {
    SP: 180,
    RJ: 200,
    MG: 190,
    BA: 210,
    RS: 185,
    PE: 220,
    CE: 215,
    PA: 225,
    SC: 175,
    PR: 180,
    ES: 185,
    PI: 240,
    RN: 230,
    AL: 235,
    MT: 200,
    DF: 170,
    GO: 195,
    TO: 210,
    AC: 250,
    AM: 240,
    AP: 245,
    MA: 225,
    PB: 230,
    RO: 235,
    RR: 250,
    SE: 225,
  };

  // Case type success rates based on historical data
  private readonly caseTypeSuccessRates: { [key: string]: number } = {
    civel: 0.65,
    criminal: 0.45,
    trabalhista: 0.72,
    tributaria: 0.58,
    administrativa: 0.62,
    previdenciaria: 0.68,
    consumidor: 0.78,
    familia: 0.55,
    ambiental: 0.60,
    outro: 0.50,
  };

  // Cache duration in seconds (24 hours)
  private readonly CACHE_DURATION = 86400;

  async predictOutcome(userId: string, input: PredictionInput): Promise<Prediction> {
    try {
      logger.info(`Predicting outcome for case ${input.caseId}`);

      // Check cache first
      const cached = await this.getFromCache(userId, `outcome_${input.caseId}`);
      if (cached) {
        logger.debug(`Using cached prediction for case ${input.caseId}`);
        return cached;
      }

      // Get case history
      const caseHistory = await this.getCaseHistory(input.caseId);
      const similarCases = await this.findSimilarCases(input);

      // Calculate success probability
      const baseSuccessRate = this.caseTypeSuccessRates[input.caseType.toLowerCase()] || 0.50;
      const similarCaseSuccessRate = this.calculateSimilarCaseSuccessRate(similarCases);
      const successProbability = (baseSuccessRate + similarCaseSuccessRate) / 2;

      // Determine risk level
      const riskLevel = this.determineRiskLevel(successProbability, caseHistory);

      // Predict outcome
      const predictedOutcome = this.predictOutcomeType(successProbability, caseHistory);

      // Calculate confidence based on available data
      const confidence = Math.min(0.95, 0.6 + (similarCases.length * 0.05));

      const prediction = await this.storePrediction(userId, {
        caseId: input.caseId,
        predictionType: 'outcome',
        confidence,
        predictedOutcome,
        successProbability: Math.round(successProbability * 100) / 100,
        riskLevel,
        predictionData: {
          baseSuccessRate,
          similarCaseSuccessRate,
          similarCasesCount: similarCases.length,
          caseHistory,
        },
      });

      // Cache the result
      await this.setCache(userId, `outcome_${input.caseId}`, prediction);

      return prediction;
    } catch (error) {
      logger.error({ err: error }, `Error predicting outcome for case ${input.caseId}`);
      throw new AppError(500, 'Erro ao prever resultado do caso');
    }
  }

  async predictDeadline(userId: string, input: PredictionInput): Promise<Prediction> {
    try {
      logger.info(`Predicting deadline for case ${input.caseId}`);

      // Check cache
      const cached = await this.getFromCache(userId, `deadline_${input.caseId}`);
      if (cached) {
        logger.debug(`Using cached deadline prediction for case ${input.caseId}`);
        return cached;
      }

      const stateCode = input.tribunal.substring(0, 2).toUpperCase();
      const baseDeadlineDays = this.stateDeadlineMultipliers[stateCode] || 200;

      // Adjust based on case complexity
      const caseHistory = await this.getCaseHistory(input.caseId);
      const complexityFactor = this.calculateComplexityFactor(input, caseHistory);
      const adjustedDeadlineDays = Math.ceil(baseDeadlineDays * complexityFactor);

      const predictedDeadline = new Date();
      predictedDeadline.setDate(predictedDeadline.getDate() + adjustedDeadlineDays);

      const confidence = Math.min(0.90, 0.7 + (complexityFactor * 0.1));

      const prediction = await this.storePrediction(userId, {
        caseId: input.caseId,
        predictionType: 'deadline',
        confidence,
        predictedDeadline,
        successProbability: 0.75,
        riskLevel: 'medium',
        predictionData: {
          baseDeadlineDays,
          complexityFactor,
          adjustedDeadlineDays,
          stateCode,
        },
      });

      await this.setCache(userId, `deadline_${input.caseId}`, prediction);

      return prediction;
    } catch (error) {
      logger.error({ err: error }, `Error predicting deadline for case ${input.caseId}`);
      throw new AppError(500, 'Erro ao prever prazo do caso');
    }
  }

  async predictSuccessRate(userId: string, input: PredictionInput): Promise<Prediction> {
    try {
      logger.info(`Calculating success rate for case ${input.caseId}`);

      const cached = await this.getFromCache(userId, `success_rate_${input.caseId}`);
      if (cached) return cached;

      const baseRate = this.caseTypeSuccessRates[input.caseType.toLowerCase()] || 0.50;
      const caseHistory = await this.getCaseHistory(input.caseId);
      const historicalSuccessRate = await this.getHistoricalSuccessRate(input.tribunal);

      // Weight: 40% case type, 40% tribunal historical, 20% user historical
      const userHistoricalRate = await this.getUserSuccessRate(userId);
      const successRate =
        baseRate * 0.4 +
        historicalSuccessRate * 0.4 +
        userHistoricalRate * 0.2;

      const confidence = Math.min(0.95, 0.65 + (caseHistory.length * 0.03));

      const prediction = await this.storePrediction(userId, {
        caseId: input.caseId,
        predictionType: 'success_rate',
        confidence,
        successProbability: Math.round(successRate * 100) / 100,
        riskLevel: successRate < 0.4 ? 'high' : successRate < 0.6 ? 'medium' : 'low',
        predictionData: {
          baseRate,
          historicalSuccessRate,
          userHistoricalRate,
          weights: { caseType: 0.4, tribunal: 0.4, user: 0.2 },
        },
      });

      await this.setCache(userId, `success_rate_${input.caseId}`, prediction);

      return prediction;
    } catch (error) {
      logger.error({ err: error }, `Error calculating success rate for case ${input.caseId}`);
      throw new AppError(500, 'Erro ao calcular taxa de sucesso');
    }
  }

  private async getCaseHistory(caseId: string): Promise<any[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM cases WHERE id = $1 OR case_number LIKE $2 ORDER BY created_at DESC`,
        [caseId, `%${caseId}%`],
      );
      return result.rows;
    } catch (error) {
      logger.error({ err: error }, 'Error fetching case history');
      return [];
    }
  }

  private async findSimilarCases(input: PredictionInput): Promise<any[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM cases
         WHERE case_type = $1 AND tribunal LIKE $2
         AND status IN ('completed', 'resolved')
         ORDER BY updated_at DESC LIMIT 50`,
        [input.caseType, `%${input.tribunal}%`],
      );
      return result.rows;
    } catch (error) {
      logger.error({ err: error }, 'Error finding similar cases');
      return [];
    }
  }

  private calculateSimilarCaseSuccessRate(similarCases: any[]): number {
    if (similarCases.length === 0) return 0.50;

    const successCount = similarCases.filter(c => c.status === 'won' || c.outcome === 'favorable').length;
    return successCount / similarCases.length;
  }

  private determineRiskLevel(successProbability: number, caseHistory: any[]): string {
    if (successProbability < 0.35) return 'high';
    if (successProbability < 0.55) return 'medium';
    if (successProbability < 0.75) return 'low';
    return 'minimal';
  }

  private predictOutcomeType(successProbability: number, caseHistory: any[]): string {
    if (successProbability >= 0.75) return 'favorable';
    if (successProbability >= 0.55) return 'uncertain';
    return 'unfavorable';
  }

  private calculateComplexityFactor(input: PredictionInput, caseHistory: any[]): number {
    let factor = 1.0;

    // Simple cases get faster resolution
    if (input.amount && input.amount < 50000) factor *= 0.8;
    else if (input.amount && input.amount > 500000) factor *= 1.3;

    // Case history affects complexity
    factor *= 1 + (caseHistory.length * 0.1);

    return Math.min(1.8, factor);
  }

  private async getHistoricalSuccessRate(tribunal: string): Promise<number> {
    try {
      const result = await pool.query(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN outcome = 'favorable' THEN 1 ELSE 0 END) as successful
         FROM cases
         WHERE tribunal LIKE $1 AND status IN ('completed', 'resolved')`,
        [`%${tribunal}%`],
      );

      const { total, successful } = result.rows[0];
      return total > 0 ? Number(successful) / Number(total) : 0.50;
    } catch (error) {
      logger.error({ err: error }, 'Error fetching tribunal success rate');
      return 0.50;
    }
  }

  private async getUserSuccessRate(userId: string): Promise<number> {
    try {
      const result = await pool.query(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN outcome = 'favorable' THEN 1 ELSE 0 END) as successful
         FROM cases
         WHERE user_id = $1 AND status IN ('completed', 'resolved')`,
        [userId],
      );

      const { total, successful } = result.rows[0];
      return total > 0 ? Number(successful) / Number(total) : 0.50;
    } catch (error) {
      logger.error({ err: error }, 'Error fetching user success rate');
      return 0.50;
    }
  }

  private async storePrediction(
    userId: string,
    data: {
      caseId: string;
      predictionType: string;
      confidence: number;
      predictedOutcome?: string;
      predictedDeadline?: Date;
      successProbability: number;
      riskLevel: string;
      predictionData: any;
    },
  ): Promise<Prediction> {
    try {
      const result = await pool.query(
        `INSERT INTO predictions (
          user_id, case_id, prediction_type, confidence, predicted_outcome,
          predicted_deadline, success_probability, risk_level, prediction_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          userId,
          data.caseId,
          data.predictionType,
          data.confidence,
          data.predictedOutcome || null,
          data.predictedDeadline || null,
          data.successProbability,
          data.riskLevel,
          JSON.stringify(data.predictionData),
        ],
      );

      return this.mapRowToPrediction(result.rows[0]);
    } catch (error) {
      logger.error({ err: error }, 'Error storing prediction');
      throw new AppError(500, 'Erro ao armazenar predição');
    }
  }

  private async getFromCache(userId: string, cacheKey: string): Promise<Prediction | null> {
    try {
      const result = await pool.query(
        `SELECT cache_data FROM prediction_cache
         WHERE user_id = $1 AND cache_key = $2 AND expires_at > CURRENT_TIMESTAMP`,
        [userId, cacheKey],
      );

      if (result.rows.length > 0) {
        return result.rows[0].cache_data as Prediction;
      }
      return null;
    } catch (error) {
      logger.debug({ err: error }, 'Error reading from cache');
      return null;
    }
  }

  private async setCache(userId: string, cacheKey: string, data: Prediction): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + this.CACHE_DURATION * 1000);
      await pool.query(
        `INSERT INTO prediction_cache (user_id, cache_key, cache_data, expires_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, cache_key) DO UPDATE SET
         cache_data = $3, expires_at = $4`,
        [userId, cacheKey, JSON.stringify(data), expiresAt],
      );
    } catch (error) {
      logger.debug({ err: error }, 'Error writing to cache');
    }
  }

  private mapRowToPrediction(row: any): Prediction {
    return {
      id: row.id,
      userId: row.user_id,
      caseId: row.case_id,
      predictionType: row.prediction_type,
      confidence: row.confidence,
      predictedOutcome: row.predicted_outcome,
      predictedDeadline: row.predicted_deadline,
      successProbability: row.success_probability,
      riskLevel: row.risk_level,
      predictionData: typeof row.prediction_data === 'string' ? JSON.parse(row.prediction_data) : row.prediction_data,
      createdAt: new Date(row.created_at),
    };
  }

  async getPredictions(userId: string, caseId?: string, limit: number = 20): Promise<Prediction[]> {
    try {
      let query = 'SELECT * FROM predictions WHERE user_id = $1';
      const params: any[] = [userId];

      if (caseId) {
        query += ` AND case_id = $${params.length + 1}`;
        params.push(caseId);
      }

      query += ` ORDER BY created_at DESC LIMIT ${limit}`;

      const result = await pool.query(query, params);
      return result.rows.map(row => this.mapRowToPrediction(row));
    } catch (error) {
      logger.error({ err: error }, 'Error fetching predictions');
      throw new AppError(500, 'Erro ao buscar predições');
    }
  }
}

export const predictionService = new PredictionService();
