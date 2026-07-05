import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { aiService } from '@/ai/aiService';
import { projudiSoapClient } from '@projudi/soapClient';
import { petitionRepository } from '@/database/repositories';
import { AppError, ValidationError } from '@utils/errors';

const router = Router();

// Criar Petição (Rascunho)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { processNumber, title, type, content, tribunal } = req.body;
    const userId = (req as any).user?.id;

    if (!processNumber || !title || !type || !tribunal) {
      throw new ValidationError('Campos obrigatórios: processNumber, title, type, tribunal');
    }

    const petition = await petitionRepository.create({
      user_id: userId,
      process_number: processNumber,
      title,
      type,
      content: content || '',
      tribunal,
      status: 'draft',
    });

    logger.info(`Petição criada: ${petition.id} para ${processNumber}`);

    res.status(201).json({
      status: 'success',
      petition: {
        id: petition.id,
        processNumber: petition.process_number,
        title: petition.title,
        status: petition.status,
        createdAt: petition.created_at,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao criar petição');
    const statusCode = error instanceof ValidationError ? 400 : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Gerar Petição com IA
router.post('/:id/generate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { context } = req.body;

    const petition = await petitionRepository.findById(id);
    if (!petition) {
      throw new AppError(404, 'Petição não encontrada');
    }

    await petitionRepository.updateStatus(id, 'validating');

    const generated = await aiService.generatePetition({
      processNumber: petition.process_number,
      petitionType: petition.type,
      context,
    });

    await petitionRepository.update(id, {
      content: generated.plainText,
      rtf_content: generated.rtfContent,
      ai_provider: 'gemini',
      confidence_score: generated.confidence,
    });

    logger.info(`Petição gerada com IA: ${id}`);

    res.json({
      status: 'success',
      petition: {
        id,
        content: generated.plainText,
        confidence: generated.confidence,
        warnings: generated.warnings,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao gerar petição');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Validar Petição
router.post('/:id/validate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const petition = await petitionRepository.findById(id);
    if (!petition) {
      throw new AppError(404, 'Petição não encontrada');
    }

    const validation = await aiService.validatePetition(petition.content, petition.type);

    await petitionRepository.updateValidation(id, validation.score, validation.issues);

    logger.info(`Petição validada: ${id} (score: ${validation.score})`);

    res.json({
      status: 'success',
      validation: {
        isValid: validation.isValid,
        score: validation.score,
        issues: validation.issues,
        warnings: validation.warnings,
        suggestions: validation.suggestions,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao validar petição');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Listar Petições do Usuário
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await petitionRepository.findByUserId(userId, limit, offset);

    res.json({
      status: 'success',
      petitions: result.data,
      pagination: {
        limit,
        offset,
        total: result.total,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao listar petições');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Obter Petição
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const petition = await petitionRepository.findById(id);
    if (!petition) {
      throw new AppError(404, 'Petição não encontrada');
    }

    res.json({
      status: 'success',
      petition,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter petição');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Atualizar Petição
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, content, rtfContent } = req.body;

    const petition = await petitionRepository.findById(id);
    if (!petition) {
      throw new AppError(404, 'Petição não encontrada');
    }

    if (petition.status !== 'draft') {
      throw new AppError(400, 'Apenas rascunhos podem ser editados');
    }

    const updated = await petitionRepository.update(id, {
      title: title || petition.title,
      content: content || petition.content,
      rtf_content: rtfContent || petition.rtf_content,
    });

    logger.info(`Petição atualizada: ${id}`);

    res.json({
      status: 'success',
      petition: updated,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao atualizar petição');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Deletar Petição
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const petition = await petitionRepository.findById(id);
    if (!petition) {
      throw new AppError(404, 'Petição não encontrada');
    }

    await petitionRepository.delete(id);

    logger.info(`Petição deletada: ${id}`);

    res.json({
      status: 'success',
      message: 'Petição removida',
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao deletar petição');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Assinar Petição
router.post('/:id/sign', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { certificateFingerprint, certificatePassword } = req.body;

    const petition = await petitionRepository.findById(id);
    if (!petition) {
      throw new AppError(404, 'Petição não encontrada');
    }

    if (petition.status !== 'validated' && petition.status !== 'draft') {
      throw new AppError(400, 'Petição deve estar validada');
    }

    const signatureHash = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    await petitionRepository.markAsSigned(id, signatureHash);

    logger.info(`Petição assinada: ${id}`);

    res.json({
      status: 'success',
      petition: {
        id,
        signatureHash,
        signedAt: new Date(),
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao assinar petição');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Enviar para Projudi
router.post('/:id/submit', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const petition = await petitionRepository.findById(id);
    if (!petition) {
      throw new AppError(404, 'Petição não encontrada');
    }

    if (petition.status !== 'signed') {
      throw new AppError(400, 'Petição deve estar assinada');
    }

    // Simular envio para Projudi
    const protocolNumber = `${Date.now()}`;

    await petitionRepository.markAsSubmitted(id, protocolNumber);

    logger.info(`Petição enviada: ${id} com protocolo ${protocolNumber}`);

    res.json({
      status: 'success',
      petition: {
        id,
        protocolNumber,
        submittedAt: new Date(),
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao enviar petição');

    // Marcar como erro
    const { id } = req.params;
    await petitionRepository.markAsError(id, error instanceof Error ? error.message : 'Erro desconhecido');

    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

export default router;
