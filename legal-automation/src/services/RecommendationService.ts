import { pool } from '@/database/connection';
import { logger } from '@utils/logger';
import { AppError } from '@utils/errors';
import { predictionService } from './PredictionService';

interface RecommendationInput {
  userId: string;
  caseId: string;
  caseType: string;
  tribunal: string;
  currentStatus: string;
  daysUntilDeadline?: number;
}

interface Recommendation {
  id: string;
  userId: string;
  caseId: string;
  recommendationType: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  actionText: string;
  confidence: number;
  basedOnPredictionId?: string;
  accepted: boolean;
  implemented: boolean;
  createdAt: Date;
  implementedAt?: Date;
}

interface RecommendationFeedback {
  recommendationId: string;
  feedbackType: 'helpful' | 'not_helpful' | 'incorrect' | 'already_done';
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string;
}

class RecommendationService {
  // Recommendation rule templates
  private readonly recommendationRules = {
    highRisk: {
      type: 'high_risk_mitigation',
      priority: 'urgent' as const,
      actions: [
        'Fortalecer argumentação jurídica com jurisprudência recente',
        'Considerar acordo extrajudicial para reduzir riscos',
        'Revisar procedimento para identificar falhas',
        'Solicitar parecer de especialista externo',
      ],
    },
    mediumRisk: {
      type: 'medium_risk_action',
      priority: 'high' as const,
      actions: [
        'Preparar argumentação adicional',
        'Monitorar jurisprudência relacionada',
        'Reforçar documentação',
      ],
    },
    looming_deadline: {
      type: 'deadline_management',
      priority: 'urgent' as const,
      actions: [
        'Agendar reunião com cliente para próximos passos',
        'Preparar peça processual com antecedência',
        'Confirmar prazos recursais',
        'Notificar equipe para ação urgente',
      ],
    },
    favorable_prediction: {
      type: 'offensive_strategy',
      priority: 'medium' as const,
      actions: [
        'Considerar ações complementares para maximizar ganhos',
        'Preparar estratégia de cobrança',
        'Documentar sucesso para futuras análises',
      ],
    },
    similar_cases_success: {
      type: 'precedent_leverage',
      priority: 'high' as const,
      actions: [
        'Estudar casos similares bem-sucedidos',
        'Aplicar argumentação vitoriosa neste caso',
        'Citar jurisprudência favorável em petições',
      ],
    },
  };

  async generateRecommendations(input: RecommendationInput): Promise<Recommendation[]> {
    try {
      logger.info(`Generating recommendations for case ${input.caseId}`);

      // Get predictions first
      const predictions = await predictionService.getPredictions(input.userId, input.caseId, 10);

      const recommendations: Recommendation[] = [];

      // Analyze outcome prediction
      const outcomePrediction = predictions.find(p => p.predictionType === 'outcome');
      if (outcomePrediction) {
        const outcomeRecs = this.generateOutcomeRecommendations(input, outcomePrediction);
        recommendations.push(...outcomeRecs);
      }

      // Analyze deadline prediction
      const deadlinePrediction = predictions.find(p => p.predictionType === 'deadline');
      if (deadlinePrediction && input.daysUntilDeadline) {
        if (input.daysUntilDeadline < 30) {
          const rule = this.recommendationRules.looming_deadline;
          const recs = this.createRecommendationsFromRule(
            input.userId,
            input.caseId,
            rule,
            deadlinePrediction.id,
            deadlinePrediction.confidence,
          );
          recommendations.push(...recs);
        }
      }

      // Analyze success rate prediction
      const successPrediction = predictions.find(p => p.predictionType === 'success_rate');
      if (successPrediction) {
        const successRecs = this.generateSuccessRateRecommendations(input, successPrediction);
        recommendations.push(...successRecs);
      }

      // Store all recommendations
      const storedRecs = await Promise.all(
        recommendations.map(rec => this.storeRecommendation(rec)),
      );

      return storedRecs;
    } catch (error) {
      logger.error({ err: error }, `Error generating recommendations for case ${input.caseId}`);
      throw new AppError(500, 'Erro ao gerar recomendações');
    }
  }

  private generateOutcomeRecommendations(
    input: RecommendationInput,
    prediction: any,
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    if (prediction.riskLevel === 'high') {
      const rule = this.recommendationRules.highRisk;
      recommendations.push(
        ...this.createRecommendationsFromRule(
          input.userId,
          input.caseId,
          rule,
          prediction.id,
          prediction.confidence,
        ),
      );
    } else if (prediction.riskLevel === 'medium') {
      const rule = this.recommendationRules.mediumRisk;
      recommendations.push(
        ...this.createRecommendationsFromRule(
          input.userId,
          input.caseId,
          rule,
          prediction.id,
          prediction.confidence,
        ),
      );
    } else if (prediction.predictedOutcome === 'favorable') {
      const rule = this.recommendationRules.favorable_prediction;
      recommendations.push(
        ...this.createRecommendationsFromRule(
          input.userId,
          input.caseId,
          rule,
          prediction.id,
          prediction.confidence,
        ),
      );
    }

    return recommendations;
  }

  private generateSuccessRateRecommendations(
    input: RecommendationInput,
    prediction: any,
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    if (prediction.predictionData?.similarCasesCount > 10) {
      const rule = this.recommendationRules.similar_cases_success;
      recommendations.push(
        ...this.createRecommendationsFromRule(
          input.userId,
          input.caseId,
          rule,
          prediction.id,
          prediction.confidence,
        ),
      );
    }

    return recommendations;
  }

  private createRecommendationsFromRule(
    userId: string,
    caseId: string,
    rule: any,
    predictionId: string,
    predictionConfidence: number,
  ): Recommendation[] {
    return rule.actions.map((action: string) => ({
      id: '', // Will be generated by database
      userId,
      caseId,
      recommendationType: rule.type,
      priority: rule.priority,
      actionText: action,
      confidence: Math.round(predictionConfidence * 100) / 100,
      basedOnPredictionId: predictionId,
      accepted: false,
      implemented: false,
      createdAt: new Date(),
    }));
  }

  private async storeRecommendation(recommendation: Recommendation): Promise<Recommendation> {
    try {
      const result = await pool.query(
        `INSERT INTO recommendations (
          user_id, case_id, recommendation_type, priority, action_text,
          confidence, based_on_prediction_id, accepted, implemented
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          recommendation.userId,
          recommendation.caseId,
          recommendation.recommendationType,
          recommendation.priority,
          recommendation.actionText,
          recommendation.confidence,
          recommendation.basedOnPredictionId || null,
          recommendation.accepted,
          recommendation.implemented,
        ],
      );

      return this.mapRowToRecommendation(result.rows[0]);
    } catch (error) {
      logger.error({ err: error }, 'Error storing recommendation');
      throw new AppError(500, 'Erro ao armazenar recomendação');
    }
  }

  private mapRowToRecommendation(row: any): Recommendation {
    return {
      id: row.id,
      userId: row.user_id,
      caseId: row.case_id,
      recommendationType: row.recommendation_type,
      priority: row.priority,
      actionText: row.action_text,
      confidence: row.confidence,
      basedOnPredictionId: row.based_on_prediction_id,
      accepted: row.accepted,
      implemented: row.implemented,
      createdAt: new Date(row.created_at),
      implementedAt: row.implemented_at ? new Date(row.implemented_at) : undefined,
    };
  }

  async getRecommendations(
    userId: string,
    caseId?: string,
    implemented?: boolean,
    limit: number = 50,
    offset: number = 0,
  ): Promise<Recommendation[]> {
    try {
      let query = 'SELECT * FROM recommendations WHERE user_id = $1';
      const params: any[] = [userId];

      if (caseId) {
        query += ` AND case_id = $${params.length + 1}`;
        params.push(caseId);
      }

      if (implemented !== undefined) {
        query += ` AND implemented = $${params.length + 1}`;
        params.push(implemented);
      }

      query += ` ORDER BY priority DESC, created_at DESC LIMIT ${limit} OFFSET ${offset}`;

      const result = await pool.query(query, params);
      return result.rows.map(row => this.mapRowToRecommendation(row));
    } catch (error) {
      logger.error({ err: error }, 'Error fetching recommendations');
      throw new AppError(500, 'Erro ao buscar recomendações');
    }
  }

  async acceptRecommendation(userId: string, recommendationId: string): Promise<Recommendation> {
    try {
      const result = await pool.query(
        `UPDATE recommendations
         SET accepted = true
         WHERE id = $1 AND user_id = $2
         RETURNING *`,
        [recommendationId, userId],
      );

      if (result.rows.length === 0) {
        throw new AppError(404, 'Recomendação não encontrada');
      }

      return this.mapRowToRecommendation(result.rows[0]);
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ err: error }, 'Error accepting recommendation');
      throw new AppError(500, 'Erro ao aceitar recomendação');
    }
  }

  async implementRecommendation(userId: string, recommendationId: string): Promise<Recommendation> {
    try {
      const result = await pool.query(
        `UPDATE recommendations
         SET implemented = true, implemented_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND user_id = $2
         RETURNING *`,
        [recommendationId, userId],
      );

      if (result.rows.length === 0) {
        throw new AppError(404, 'Recomendação não encontrada');
      }

      return this.mapRowToRecommendation(result.rows[0]);
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ err: error }, 'Error implementing recommendation');
      throw new AppError(500, 'Erro ao implementar recomendação');
    }
  }

  async submitFeedback(
    userId: string,
    recommendationId: string,
    feedback: RecommendationFeedback,
  ): Promise<void> {
    try {
      // Verify recommendation belongs to user
      const recCheck = await pool.query(
        'SELECT id FROM recommendations WHERE id = $1 AND user_id = $2',
        [recommendationId, userId],
      );

      if (recCheck.rows.length === 0) {
        throw new AppError(404, 'Recomendação não encontrada');
      }

      await pool.query(
        `INSERT INTO recommendation_feedback (recommendation_id, user_id, feedback_type, rating, comment)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          recommendationId,
          userId,
          feedback.feedbackType,
          feedback.rating,
          feedback.comment || null,
        ],
      );

      logger.info(`Feedback submitted for recommendation ${recommendationId}`);
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ err: error }, 'Error submitting feedback');
      throw new AppError(500, 'Erro ao enviar feedback');
    }
  }

  async getRecommendationStats(userId: string): Promise<any> {
    try {
      const result = await pool.query(
        `SELECT
          COUNT(*) as total_recommendations,
          SUM(CASE WHEN accepted = true THEN 1 ELSE 0 END) as accepted_count,
          SUM(CASE WHEN implemented = true THEN 1 ELSE 0 END) as implemented_count,
          priority,
          recommendation_type
         FROM recommendations
         WHERE user_id = $1
         GROUP BY priority, recommendation_type
         ORDER BY priority DESC`,
        [userId],
      );

      const totalStats = await pool.query(
        `SELECT
          COUNT(*) as total_recommendations,
          SUM(CASE WHEN accepted = true THEN 1 ELSE 0 END) as accepted_count,
          SUM(CASE WHEN implemented = true THEN 1 ELSE 0 END) as implemented_count
         FROM recommendations
         WHERE user_id = $1`,
        [userId],
      );

      return {
        summary: totalStats.rows[0],
        byPriority: result.rows,
      };
    } catch (error) {
      logger.error({ err: error }, 'Error fetching recommendation stats');
      throw new AppError(500, 'Erro ao buscar estatísticas');
    }
  }
}

export const recommendationService = new RecommendationService();
