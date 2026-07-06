import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { aiService } from '@/ai/aiService';
import { projudiSoapClient } from '@projudi/soapClient';
import { petitionRepository } from '@/database/repositories';
import { AppError, ValidationError } from '@utils/errors';
import { petitionValidator } from '@services/PetitionValidatorService';
import { petitionFormatter } from '@services/PetitionFormatterService';
import { petitionSubmissionService } from '@services/PetitionSubmissionService';
import { DocumentSignatureService } from '@services/DocumentSignatureService';
import { petitionCacheService } from '@services/PetitionCacheService';

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

    // Verificar cache primeiro
    const cached = petitionCacheService.get(
      petition.process_number,
      petition.type
    );
    if (cached) {
      logger.info(`Usandoetição em cache: ${id}`);

      // Atualizar DB com resultado em cache
      await petitionRepository.update(id, {
        content: cached.plainText,
        rtf_content: cached.rtfContent,
        ai_provider: 'cache',
        confidence_score: cached.confidence,
      });

      return res.json({
        status: 'success',
        cached: true,
        petition: {
          id,
          content: cached.plainText,
          confidence: cached.confidence,
          warnings: cached.warnings,
        },
      });
    }

    await petitionRepository.updateStatus(id, 'validating');

    const generated = await aiService.generatePetition({
      processNumber: petition.process_number,
      petitionType: petition.type,
      context,
    });

    // Cachear se confiança alta
    const cached_result = petitionCacheService.set(
      petition.process_number,
      petition.type,
      generated
    );

    await petitionRepository.update(id, {
      content: generated.plainText,
      rtf_content: generated.rtfContent,
      ai_provider: 'claude',
      confidence_score: generated.confidence,
    });

    logger.info(
      `Petição gerada com IA: ${id} (cache: ${cached_result ? 'SIM' : 'NÃO'})`
    );

    res.json({
      status: 'success',
      cached: false,
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

// Validar Conformidade (Nova implementação robusta)
router.post('/:id/validate-conformance', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const petition = await petitionRepository.findById(id);
    if (!petition) {
      throw new AppError(404, 'Petição não encontrada');
    }

    const tribunal = petition.tribunal || 'tjsc';

    // Prepare petition object for validation
    const petitionObj = {
      title: petition.title,
      content: petition.content,
      processNumber: petition.process_number,
      oabNumber: petition.oab_number,
      causeValue: petition.cause_value,
      deadline: petition.deadline ? new Date(petition.deadline) : undefined,
      plaintiff: petition.plaintiff,
      defendant: petition.defendant,
      subject: petition.subject,
      lawyerName: (req as any).user?.name,
      tribunal,
      attachments: [],
      parts: [],
    };

    const validation = await petitionValidator.validatePetition(petitionObj as any, tribunal);

    // Store validation result
    await petitionRepository.update(id, {
      validation_score: validation.score,
      validation_errors: JSON.stringify(validation.errors) as any,
      validation_warnings: JSON.stringify(validation.warnings) as any,
      last_validation_at: new Date(),
    });

    logger.info(`Conformidade validada para petição ${id} - Score: ${validation.score}%`);

    res.json({
      status: 'success',
      validation: {
        valid: validation.valid,
        score: validation.score,
        errors: validation.errors,
        warnings: validation.warnings,
        details: validation.details,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao validar conformidade');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Formatar Petição (Nova implementação)
router.post('/:id/format', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const petition = await petitionRepository.findById(id);
    if (!petition) {
      throw new AppError(404, 'Petição não encontrada');
    }

    const tribunal = petition.tribunal || 'tjsc';

    const petitionObj = {
      title: petition.title,
      content: petition.content,
      processNumber: petition.process_number,
      oabNumber: petition.oab_number,
      causeValue: petition.cause_value,
      plaintiff: petition.plaintiff,
      defendant: petition.defendant,
      subject: petition.subject,
      lawyerName: (req as any).user?.name,
      tribunal,
      attachments: petition.attachments || [],
      parts: [],
    };

    const formatted = await petitionFormatter.formatPetition(petitionObj as any, tribunal);

    logger.info(`Petição formatada para ${tribunal}`);

    res.json({
      status: 'success',
      formatted: {
        tribunal: formatted.tribunal,
        contentType: formatted.contentType,
        signatureFormat: formatted.signatureFormat,
        attachmentCount: formatted.attachments.length,
        metadata: formatted.metadata,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao formatar petição');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Enviar Petição com Retry Robusto (Nova implementação)
router.post('/:id/submit', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { certificatePassword } = req.body;

    const petition = await petitionRepository.findById(id);
    if (!petition) {
      throw new AppError(404, 'Petição não encontrada');
    }

    if (!petition.content) {
      throw new AppError(400, 'Petição sem conteúdo');
    }

    const tribunal = petition.tribunal || 'tjsc';

    logger.info(`Iniciando submissão de petição ${id} para ${tribunal}`);

    // Step 1: Validate conformance
    logger.debug('Step 1: Validando conformidade');
    const petitionObj = {
      title: petition.title,
      content: petition.content,
      processNumber: petition.process_number,
      oabNumber: petition.oab_number,
      causeValue: petition.cause_value,
      deadline: petition.deadline ? new Date(petition.deadline) : undefined,
      plaintiff: petition.plaintiff,
      defendant: petition.defendant,
      subject: petition.subject,
      lawyerName: (req as any).user?.name,
      tribunal,
      attachments: petition.attachments || [],
      parts: [],
    };

    const validation = await petitionValidator.validatePetition(petitionObj as any, tribunal);
    if (!validation.valid) {
      logger.warn(`Validação falhou para petição ${id}`);
      return res.status(400).json({
        status: 'validation_failed',
        validation: {
          valid: false,
          errors: validation.errors,
          warnings: validation.warnings,
          score: validation.score,
        },
      });
    }

    // Step 2: Format petition
    logger.debug('Step 2: Formatando petição');
    const formatted = await petitionFormatter.formatPetition(petitionObj as any, tribunal);

    // Step 3: Sign document
    logger.debug('Step 3: Assinando documento');
    const documentSignatureService = new DocumentSignatureService();
    const userId = (req as any).user?.id || 'unknown';
    const signedDocument = await documentSignatureService.signDocument(userId, {
      content: formatted.content,
      format: (formatted.signatureFormat || 'CMS') as any,
      certificatePassword: certificatePassword || '',
    });

    // Step 4: Submit with retry
    logger.debug('Step 4: Enviando com retry automático');
    const result = await petitionSubmissionService.submitPetitionWithRetry(
      formatted,
      signedDocument as any,
      5, // max retries
    );

    // Step 5: Update database
    await petitionRepository.update(id, {
      status: result.success ? 'submitted' : 'submission_failed',
      protocol_number: result.protocolo,
      submitted_at: result.timestamp,
      last_error: result.error,
      submission_attempts: result.attempt,
      validation_score: validation.score,
    });

    // Step 6: Notify user
    if (result.success) {
      logger.info(`✓ Petição ${id} enviada com protocolo ${result.protocolo}`);
    } else {
      logger.warn(
        `✗ Petição ${id} falhou na submissão: ${result.error} (Tentativas: ${result.attempt})`,
      );
    }

    const statusCode = result.success ? 200 : 500;
    res.status(statusCode).json({
      status: result.success ? 'submitted' : 'submission_failed',
      result: {
        success: result.success,
        protocolo: result.protocolo,
        error: result.error,
        timestamp: result.timestamp,
        attempt: result.attempt,
        retryable: result.retryable,
        validationScore: validation.score,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao submeter petição');

    const { id } = req.params;
    await petitionRepository.markAsError(
      id,
      error instanceof Error ? error.message : 'Erro desconhecido',
    );

    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Get Submission Status and Circuit Breaker Info
router.get('/:id/submission-status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const petition = await petitionRepository.findById(id);
    if (!petition) {
      throw new AppError(404, 'Petição não encontrada');
    }

    const tribunal = petition.tribunal || 'tjsc';
    const circuitBreakerStatus = petitionSubmissionService.getCircuitBreakerStatus(tribunal);

    res.json({
      status: 'success',
      petition: {
        id,
        status: petition.status,
        protocolo: petition.protocol_number,
        submittedAt: petition.submitted_at,
        lastError: petition.last_error,
        attempts: petition.submission_attempts,
      },
      tribunal,
      circuitBreaker: circuitBreakerStatus,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter status');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

export default router;
