import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { AppError } from '@utils/errors';
import { aiTriageService } from '@services/AITriageService';
import { kanbanService } from '@services/KanbanService';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

const router = Router();
const upload = multer({ dest: 'uploads/' });

// Classificar Documento
router.post('/classify', upload.single('document'), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { caseId, documentType = 'pdf' } = req.body;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    if (!req.file || !caseId) {
      throw new AppError(400, 'Document e caseId são obrigatórios');
    }

    logger.info(`Classificando documento para caso ${caseId}`);

    // Read file content
    const filePath = req.file.path;
    const fileContent = fs.readFileSync(filePath, 'utf-8');

    // Classify document
    const { classification, confidence, extractedData } = await aiTriageService.classifyDocument(
      fileContent,
      documentType as 'pdf' | 'email' | 'text',
    );

    // Store classification
    const result = await aiTriageService.storeClassification(
      userId,
      req.file.filename,
      caseId,
      classification,
      confidence,
      extractedData,
    );

    // If confidence >= 80%, auto-create Kanban task
    if (confidence >= 0.8) {
      logger.info(`Criando tarefa Kanban automaticamente (confiança: ${confidence})`);

      const columnMap: Record<string, string> = {
        sentenca: 'filed',
        recurso: 'under-review',
        intimacao: 'awaiting-docs',
        prazo_administrativo: 'awaiting-docs',
        notificacao: 'under-review',
        outro: 'under-review',
      };

      try {
        await kanbanService.createTask(userId, {
          caseId,
          title: `Documentação: ${classification.replace('_', ' ')}`,
          description: `Classificado automaticamente por IA com ${(confidence * 100).toFixed(1)}% de confiança.\nDados extraídos: ${JSON.stringify(extractedData)}`,
          columnId: columnMap[classification] || 'under-review',
          lawyerId: userId,
          clientId: '',
          priority: classification === 'sentenca' ? 'urgent' : 'high',
          dueDate: extractedData.prazo,
          assignedTo: userId,
          tags: [classification, 'auto-triagem'],
          documentsNeeded: 0,
          tribunal: extractedData.tribunal,
        });
      } catch (error) {
        logger.warn('Erro ao criar tarefa Kanban automaticamente', { err: error });
        // Continue anyway, classification was stored
      }
    }

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.status(201).json({
      status: 'success',
      data: result,
      autoTaskCreated: confidence >= 0.8,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao classificar documento');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Analisar Jurimetria
router.get('/jurimetry/:caseId', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { caseId } = req.params;
    const { startDate, endDate, period = '90d' } = req.query;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    if (!caseId) {
      throw new AppError(400, 'caseId é obrigatório');
    }

    logger.debug(`Analisando jurimetria para caso ${caseId}`);

    let start: Date;
    let end: Date = new Date();

    if (startDate && endDate) {
      start = new Date(startDate as string);
      end = new Date(endDate as string);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new AppError(400, 'Datas inválidas. Use formato ISO 8601');
      }
    } else {
      const match = (period as string).match(/^(\d+)([dwmy])$/);
      if (!match) {
        throw new AppError(400, 'Período inválido. Use formato como 30d, 90d, 1y');
      }

      const [, amount, unit] = match;
      const numAmount = parseInt(amount);

      switch (unit) {
        case 'd':
          start = new Date(end.getTime() - numAmount * 24 * 60 * 60 * 1000);
          break;
        case 'w':
          start = new Date(end.getTime() - numAmount * 7 * 24 * 60 * 60 * 1000);
          break;
        case 'm':
          start = new Date(end.getTime() - numAmount * 30 * 24 * 60 * 60 * 1000);
          break;
        case 'y':
          start = new Date(end.getTime() - numAmount * 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          throw new AppError(400, 'Unidade de período inválida');
      }
    }

    const jurimetry = await aiTriageService.analyzeJurimetry(caseId, { startDate: start, endDate: end });

    res.json({
      status: 'success',
      data: jurimetry,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao analisar jurimetria');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Obter Status de Triagem
router.get('/triage-status', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    logger.debug(`Obtendo status de triagem para usuário ${userId}`);

    const status = await aiTriageService.getTriageStatus(userId);

    res.json({
      status: 'success',
      data: status,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter status de triagem');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

export default router;
