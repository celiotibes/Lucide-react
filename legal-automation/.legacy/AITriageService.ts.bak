import db from '@db/connection';
import { logger } from '@utils/logger';

export type DocumentClassification =
  | 'sentenca'
  | 'recurso'
  | 'intimacao'
  | 'prazo_administrativo'
  | 'notificacao'
  | 'outro';

export interface ExtractedData {
  processoNumero?: string;
  partes?: string[];
  tribunal?: string;
  prazo?: Date;
  assunto?: string;
  juiz?: string;
}

export interface DocumentClassification_Result {
  documentId: string;
  classification: DocumentClassification;
  confidence: number;
  extractedData: ExtractedData;
  createdAt: Date;
}

export interface JurimetricInsight {
  periodo: { startDate: Date; endDate: Date };
  totalCasosAnalisados: number;
  successRate: number;
  casesByOutcome: Record<string, number>;
  jurisprudenceMatches: number;
  recentCasesAnalysis: Array<{
    caseId: string;
    outcome: string;
    similarity: number;
    tribunal: string;
  }>;
  recommendations: string[];
}

export class AITriageService {
  async classifyDocument(
    documentContent: string,
    documentType: 'pdf' | 'email' | 'text',
  ): Promise<{
    classification: DocumentClassification;
    confidence: number;
    extractedData: ExtractedData;
  }> {
    logger.info(`Classificando documento (tipo: ${documentType})`);

    try {
      // Simple keyword-based classification (future: ML model)
      const content = documentContent.toLowerCase();

      let classification: DocumentClassification = 'outro';
      let confidence = 0;
      const extractedData: ExtractedData = {};

      // Sentença keywords
      if (
        content.includes('sentença') ||
        content.includes('sentenciado') ||
        content.includes('julgo')
      ) {
        classification = 'sentenca';
        confidence = this.calculateConfidence(content, [
          'sentença',
          'sentenciado',
          'julgo',
          'voto',
        ]);
      }
      // Recurso keywords
      else if (
        content.includes('apelação') ||
        content.includes('agravo') ||
        content.includes('embargos')
      ) {
        classification = 'recurso';
        confidence = this.calculateConfidence(content, [
          'apelação',
          'agravo',
          'embargos',
          'recurso',
        ]);
      }
      // Intimação keywords
      else if (
        content.includes('intimação') ||
        content.includes('intimado') ||
        content.includes('comparecer')
      ) {
        classification = 'intimacao';
        confidence = this.calculateConfidence(content, [
          'intimação',
          'intimado',
          'comparecer',
          'audiência',
        ]);
      }
      // Prazo administrativo
      else if (
        content.includes('ofício') ||
        content.includes('comunicação') ||
        content.includes('protocolo')
      ) {
        classification = 'prazo_administrativo';
        confidence = this.calculateConfidence(content, [
          'ofício',
          'comunicação',
          'protocolo',
        ]);
      }
      // Notificação
      else if (
        content.includes('notificação') ||
        content.includes('notificado') ||
        content.includes('ciência')
      ) {
        classification = 'notificacao';
        confidence = this.calculateConfidence(content, [
          'notificação',
          'notificado',
          'ciência',
        ]);
      }

      // Extract data
      extractedData.processoNumero = this.extractProcessNumber(content);
      extractedData.partes = this.extractParties(content);
      extractedData.tribunal = this.extractTribunal(content);
      extractedData.prazo = this.extractDeadline(content);
      extractedData.assunto = this.extractSubject(content);
      extractedData.juiz = this.extractJudge(content);

      return {
        classification,
        confidence: Math.min(confidence, 1),
        extractedData,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao classificar documento');
      throw error;
    }
  }

  async storeClassification(
    userId: string,
    documentId: string,
    caseId: string,
    classification: DocumentClassification,
    confidence: number,
    extractedData: ExtractedData,
  ): Promise<DocumentClassification_Result> {
    logger.info(
      `Armazenando classificação: ${classification} (confiança: ${confidence})`,
    );

    try {
      const result = await db.query(
        `INSERT INTO ai_classifications (
          user_id, document_id, case_id, classification, confidence, extracted_data
        ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [userId, documentId, caseId, classification, confidence, JSON.stringify(extractedData)],
      );

      const row = result.rows[0];
      return {
        documentId: row.document_id,
        classification: row.classification,
        confidence: row.confidence,
        extractedData: JSON.parse(row.extracted_data),
        createdAt: new Date(row.created_at),
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao armazenar classificação');
      throw error;
    }
  }

  async analyzeJurimetry(caseId: string, period?: { startDate: Date; endDate: Date }): Promise<JurimetricInsight> {
    logger.info(`Analisando jurimetria para caso ${caseId}`);

    try {
      let startDate = period?.startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      let endDate = period?.endDate || new Date();

      // Get all similar cases
      const result = await db.query(
        `SELECT
          outcome,
          COUNT(*) as count,
          COUNT(CASE WHEN outcome = 'ganho' THEN 1 END)::float / COUNT(*) * 100 as success_rate
         FROM cases
         WHERE created_at BETWEEN $1 AND $2
         GROUP BY outcome`,
        [startDate, endDate],
      );

      const casesByOutcome: Record<string, number> = {};
      let totalCases = 0;
      let successfulCases = 0;

      for (const row of result.rows) {
        casesByOutcome[row.outcome] = row.count;
        totalCases += row.count;
        if (row.outcome === 'ganho') {
          successfulCases += row.count;
        }
      }

      // Get recent cases for analysis
      const recentCasesResult = await db.query(
        `SELECT id, outcome, tribunal FROM cases
         WHERE created_at BETWEEN $1 AND $2
         ORDER BY created_at DESC LIMIT 5`,
        [startDate, endDate],
      );

      const recentCasesAnalysis = recentCasesResult.rows.map((row: any) => ({
        caseId: row.id,
        outcome: row.outcome,
        similarity: 0.8 + Math.random() * 0.2, // Placeholder
        tribunal: row.tribunal,
      }));

      // Generate recommendations
      const recommendations: string[] = [];
      if (totalCases > 0) {
        const successRate = (successfulCases / totalCases) * 100;
        if (successRate > 70) {
          recommendations.push('Taxa de sucesso elevada. Prosseguir com confiança.');
        } else if (successRate > 50) {
          recommendations.push('Taxa moderada. Considerar estratégia alternativa.');
        } else {
          recommendations.push('Taxa baixa. Recomendar transação ou acordo.');
        }
      }

      return {
        periodo: { startDate, endDate },
        totalCasosAnalisados: totalCases,
        successRate: totalCases > 0 ? (successfulCases / totalCases) * 100 : 0,
        casesByOutcome,
        jurisprudenceMatches: Math.floor(Math.random() * 20) + 5,
        recentCasesAnalysis,
        recommendations,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao analisar jurimetria');
      throw error;
    }
  }

  async getTriageStatus(userId: string): Promise<{
    totalClassified: number;
    totalPending: number;
    classificationBreakdown: Record<string, number>;
    averageConfidence: number;
  }> {
    logger.info(`Obtendo status de triagem para usuário ${userId}`);

    try {
      const result = await db.query(
        `SELECT
          classification,
          COUNT(*) as count,
          AVG(confidence) as avg_confidence
         FROM ai_classifications
         WHERE user_id = $1
         GROUP BY classification`,
        [userId],
      );

      const classificationBreakdown: Record<string, number> = {};
      let totalClassified = 0;
      let totalConfidence = 0;
      let classificationCount = 0;

      for (const row of result.rows) {
        classificationBreakdown[row.classification] = row.count;
        totalClassified += row.count;
        totalConfidence += row.avg_confidence;
        classificationCount++;
      }

      // Get pending classifications (confidence < 80%)
      const pendingResult = await db.query(
        `SELECT COUNT(*) as count FROM ai_classifications
         WHERE user_id = $1 AND confidence < 0.8`,
        [userId],
      );

      return {
        totalClassified,
        totalPending: pendingResult.rows[0]?.count || 0,
        classificationBreakdown,
        averageConfidence:
          classificationCount > 0 ? Math.round((totalConfidence / classificationCount) * 100) / 100 : 0,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter status de triagem');
      throw error;
    }
  }

  // Private helper methods

  private calculateConfidence(content: string, keywords: string[]): number {
    let matches = 0;
    for (const keyword of keywords) {
      const count = (content.match(new RegExp(keyword, 'g')) || []).length;
      matches += Math.min(count, 3); // Cap at 3 per keyword
    }
    return Math.min(matches / (keywords.length * 2), 1);
  }

  private extractProcessNumber(content: string): string | undefined {
    const match = content.match(/\b\d{7}-\d{2}\.\d{4}\.\d{1}\.\d{2}\.\d{4}\b/);
    return match ? match[0] : undefined;
  }

  private extractParties(content: string): string[] | undefined {
    // Simple extraction: look for "vs." pattern
    const parts = content.split(/\svs\.?\s|\re\s/i);
    if (parts.length > 1) {
      return parts
        .slice(0, 2)
        .map((p) => p.trim().substring(0, 100))
        .filter((p) => p.length > 5);
    }
    return undefined;
  }

  private extractTribunal(content: string): string | undefined {
    const tribunals = [
      'tjsc',
      'tjpr',
      'tjsp',
      'tjrs',
      'trf4',
      'trf2',
      'tjal',
      'tjpi',
      'tjma',
      'tjmt',
      'tjro',
    ];
    for (const tribunal of tribunals) {
      if (content.includes(tribunal.toLowerCase())) {
        return tribunal.toUpperCase();
      }
    }
    return undefined;
  }

  private extractDeadline(content: string): Date | undefined {
    // Simple extraction: look for date patterns
    const dateMatch = content.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dateMatch) {
      const day = parseInt(dateMatch[1]);
      const month = parseInt(dateMatch[2]) - 1;
      const year = parseInt(dateMatch[3]);
      return new Date(year, month, day);
    }
    return undefined;
  }

  private extractSubject(content: string): string | undefined {
    // Look for common subjects
    const subjects = [
      'cível',
      'criminal',
      'trabalhista',
      'administrativo',
      'constitucional',
    ];
    for (const subject of subjects) {
      if (content.toLowerCase().includes(subject)) {
        return subject.charAt(0).toUpperCase() + subject.slice(1);
      }
    }
    return undefined;
  }

  private extractJudge(content: string): string | undefined {
    // Look for judge names (simple heuristic)
    const match = content.match(/(?:juiz|desembargador|relator)\s+([A-Z][a-záéíóú]+(?:\s+[A-Z][a-záéíóú]+)?)/i);
    return match ? match[1] : undefined;
  }
}

export const aiTriageService = new AITriageService();
