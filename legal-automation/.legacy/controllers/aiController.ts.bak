import { Router, Request, Response } from 'express';
import { aiService } from '@/ai/aiService';
import { llmPool } from '@/ai/llmPool';
import { logger } from '@utils/logger';
import { AppError } from '@utils/errors';

const router = Router();

// Gerar Petição
router.post('/generate-petition', async (req: Request, res: Response) => {
  try {
    const { processNumber, petitionType, context } = req.body;

    if (!processNumber || !petitionType) {
      throw new AppError(400, 'processNumber e petitionType são obrigatórios');
    }

    logger.info(`Gerando petição para: ${processNumber}`);

    const result = await aiService.generatePetition({
      processNumber,
      petitionType,
      context,
    });

    res.json({
      status: 'success',
      petitionId: `pet-${Date.now()}`,
      plainText: result.plainText,
      rtfContent: result.rtfContent,
      confidence: result.confidence,
      warnings: result.warnings,
      suggestedEdits: result.suggestedEdits,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao gerar petição');
    const appError = error instanceof AppError ? error : new AppError(500, 'Erro ao gerar petição');
    res.status(appError.statusCode).json(appError.toJSON());
  }
});

// Validar Petição
router.post('/validate-petition', async (req: Request, res: Response) => {
  try {
    const { content, petitionType } = req.body;

    if (!content || !petitionType) {
      throw new AppError(400, 'content e petitionType são obrigatórios');
    }

    logger.info('Validando petição');

    const result = await aiService.validatePetition(content, petitionType);

    res.json({
      status: 'success',
      isValid: result.isValid,
      score: result.score,
      issues: result.issues,
      warnings: result.warnings,
      suggestions: result.suggestions,
      nextStep: result.isValid ? 'ready_to_sign' : 'needs_revision',
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao validar petição');
    const appError = error instanceof AppError ? error : new AppError(500, 'Erro ao validar');
    res.status(appError.statusCode).json(appError.toJSON());
  }
});

// Analisar Movimentações
router.post('/analyze-movements', async (req: Request, res: Response) => {
  try {
    const { processNumber, movements } = req.body;

    if (!processNumber || !movements) {
      throw new AppError(400, 'processNumber e movements são obrigatórios');
    }

    logger.info(`Analisando movimentações: ${processNumber}`);

    const result = await aiService.analyzeMovements(processNumber, movements);

    res.json({
      status: 'success',
      summary: result.summary,
      phase: result.phase,
      nextDeadline: result.nextDeadline,
      riskLevel: result.riskLevel,
      recommendations: result.recommendations,
      confidence: result.confidence,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao analisar movimentações');
    const appError = error instanceof AppError ? error : new AppError(500, 'Erro na análise');
    res.status(appError.statusCode).json(appError.toJSON());
  }
});

// Extrair Dados de Documento
router.post('/extract-document', async (req: Request, res: Response) => {
  try {
    const { content } = req.body;

    if (!content) {
      throw new AppError(400, 'content é obrigatório');
    }

    logger.info('Extraindo dados de documento');

    const result = await aiService.extractFromDocument(content);

    res.json({
      status: 'success',
      partes: result.partes,
      pretensoes: result.pretensoes,
      fundamentos: result.fundamentos,
      prazos: result.prazos,
      confidence: result.confidence,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao extrair documento');
    const appError = error instanceof AppError ? error : new AppError(500, 'Erro na extração');
    res.status(appError.statusCode).json(appError.toJSON());
  }
});

// Sugerir Argumentos
router.post('/suggest-arguments', async (req: Request, res: Response) => {
  try {
    const { processNumber, subject, context } = req.body;

    if (!processNumber || !subject) {
      throw new AppError(400, 'processNumber e subject são obrigatórios');
    }

    logger.info(`Sugerindo argumentos para: ${subject}`);

    const suggestions = await aiService.suggestArguments(
      processNumber,
      subject,
      context || '',
    );

    res.json({
      status: 'success',
      processNumber,
      subject,
      suggestions,
      count: suggestions.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao sugerir argumentos');
    const appError = error instanceof AppError ? error : new AppError(500, 'Erro nas sugestões');
    res.status(appError.statusCode).json(appError.toJSON());
  }
});

// Status da Piscina de LLM
router.get('/status', (req: Request, res: Response) => {
  try {
    const status = llmPool.getStatus();

    res.json({
      status: 'success',
      llm: status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter status');
    res.status(500).json({ error: 'Erro ao obter status' });
  }
});

// Limpar Cache
router.post('/cache/clear', async (req: Request, res: Response) => {
  try {
    // Verificar se é admin
    if (req.user && req.user.role !== 'admin') {
      throw new AppError(403, 'Apenas administradores podem limpar cache');
    }

    llmPool.clearCache();
    logger.info('Cache de IA limpo');

    res.json({
      status: 'success',
      message: 'Cache limpado com sucesso',
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao limpar cache');
    const appError = error instanceof AppError ? error : new AppError(500, 'Erro ao limpar cache');
    res.status(appError.statusCode).json(appError.toJSON());
  }
});

export default router;
