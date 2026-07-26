// src/modules/ai/routes.ts
import express, { Router, Request, Response } from 'express';
import { Database } from '@/database';
import { LegalAIService } from './legal-ai.service';
import {
  CaseAnalysisRequest,
  AIServiceConfig,
} from './types';

export function setupAIRoutes(db: Database): Router {
  const router = express.Router();

  // Get AI config from environment
  const aiConfig: AIServiceConfig = {
    provider: (process.env.AI_PROVIDER as 'openai' | 'anthropic') || 'openai',
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || 'gpt-4',
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || '2000'),
    temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
    embeddingModel: process.env.AI_EMBEDDING_MODEL || 'text-embedding-ada-002',
  };

  const aiService = new LegalAIService(db, aiConfig);

  /**
   * POST /ai/analyze-precedents
   * Analyze similar precedent cases for the given case details
   */
  router.post('/analyze-precedents', async (req: Request, res: Response) => {
    try {
      const caseAnalysis: CaseAnalysisRequest = req.body;

      if (!caseAnalysis.caseType || !caseAnalysis.jurisdiction) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: caseType, jurisdiction',
        });
      }

      const analysis = await aiService.analyzePrecedents(caseAnalysis);

      res.json({
        success: true,
        data: analysis,
      });
    } catch (error) {
      console.error('[AI Routes] Error analyzing precedents:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to analyze precedents',
      });
    }
  });

  /**
   * POST /ai/predict-outcome
   * Predict case outcome with confidence and risk assessment
   */
  router.post('/predict-outcome', async (req: Request, res: Response) => {
    try {
      const caseAnalysis: CaseAnalysisRequest = req.body;

      if (!caseAnalysis.caseType || !caseAnalysis.jurisdiction) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: caseType, jurisdiction',
        });
      }

      const prediction = await aiService.predictOutcome(caseAnalysis);

      res.json({
        success: true,
        data: prediction,
      });
    } catch (error) {
      console.error('[AI Routes] Error predicting outcome:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to predict outcome',
      });
    }
  });

  /**
   * POST /ai/suggest-arguments
   * Suggest legal arguments based on similar cases
   */
  router.post('/suggest-arguments', async (req: Request, res: Response) => {
    try {
      const { caseAnalysis, side } = req.body;

      if (!caseAnalysis?.caseType || !caseAnalysis?.jurisdiction) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: caseAnalysis.caseType, caseAnalysis.jurisdiction',
        });
      }

      if (!['plaintiff', 'defendant'].includes(side)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid side: must be "plaintiff" or "defendant"',
        });
      }

      const suggestions = await aiService.suggestArguments(
        caseAnalysis,
        side as 'plaintiff' | 'defendant'
      );

      res.json({
        success: true,
        data: suggestions,
      });
    } catch (error) {
      console.error('[AI Routes] Error suggesting arguments:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to suggest arguments',
      });
    }
  });

  /**
   * GET /ai/judge-pattern/:judgeId
   * Analyze specific judge's decision patterns
   */
  router.get('/judge-pattern/:judgeId', async (req: Request, res: Response) => {
    try {
      const { judgeId } = req.params;

      if (!judgeId) {
        return res.status(400).json({
          success: false,
          error: 'Missing judgeId parameter',
        });
      }

      const pattern = await aiService.analyzeJudgePattern(judgeId);

      res.json({
        success: true,
        data: pattern,
      });
    } catch (error) {
      console.error('[AI Routes] Error analyzing judge pattern:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to analyze judge pattern',
      });
    }
  });

  /**
   * POST /ai/extract-sentence-data
   * Extract structured data from court sentence/decision text
   */
  router.post('/extract-sentence-data', async (req: Request, res: Response) => {
    try {
      const { sentenceContent } = req.body;

      if (!sentenceContent) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: sentenceContent',
        });
      }

      const extracted = await aiService.extractSentenceData(sentenceContent);

      res.json({
        success: true,
        data: extracted,
      });
    } catch (error) {
      console.error('[AI Routes] Error extracting sentence data:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to extract sentence data',
      });
    }
  });

  return router;
}
