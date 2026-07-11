import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '@utils/logger';
import { contractLifecycleService } from '@services/ContractLifecycleService';
import { AppError } from '@utils/errors';

// ============================================================================
// CONTRACT LIFECYCLE ROUTER - Phase 5 - Contract Management & Digital Signatures
// ============================================================================

const router = Router();

/**
 * POST /contracts - Create contract from template
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clientId, templateId, variables, title } = req.body;

    if (!clientId || !templateId || !variables || !title) {
      throw new AppError('clientId, templateId, variables e title são obrigatórios', 400, 'VALIDATION_ERROR');
    }

    const contract = await contractLifecycleService.createContractFromTemplate(
      clientId,
      templateId,
      variables,
      title,
    );

    res.status(201).json({
      statusCode: 201,
      data: contract,
      message: 'Contrato criado com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /contracts/:contractId - Get contract by ID
 */
router.get('/:contractId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { contractId } = req.params;

    const contract = await contractLifecycleService.getContract(contractId);

    if (!contract) {
      return res.status(404).json({
        statusCode: 404,
        data: null,
        message: `Contrato ${contractId} não encontrado`,
      });
    }

    res.json({
      statusCode: 200,
      data: contract,
      message: 'Contrato obtido com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /contracts/:contractId - Update contract content
 */
router.put('/:contractId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { contractId } = req.params;
    const { content, author, changes } = req.body;

    if (!content || !author || !changes) {
      throw new AppError('content, author e changes são obrigatórios', 400, 'VALIDATION_ERROR');
    }

    const updated = await contractLifecycleService.updateContract(contractId, content, author, changes);

    res.json({
      statusCode: 200,
      data: updated,
      message: 'Contrato atualizado com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /contracts/client/:clientId - Get all contracts for a client
 */
router.get('/client/:clientId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clientId } = req.params;

    const contracts = await contractLifecycleService.getClientContracts(clientId);

    res.json({
      statusCode: 200,
      data: contracts,
      total: contracts.length,
      message: 'Contratos do cliente obtidos com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /contracts/status/:status - Get contracts by status
 */
router.get('/status/:status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.params;

    const validStatuses = ['draft', 'review', 'pending_signature', 'signed', 'executed', 'archived'];
    if (!validStatuses.includes(status)) {
      throw new AppError('Status de contrato inválido', 400, 'INVALID_STATUS');
    }

    const contracts = await contractLifecycleService.getContractsByStatus(
      status as 'draft' | 'review' | 'pending_signature' | 'signed' | 'executed' | 'archived',
    );

    res.json({
      statusCode: 200,
      data: contracts,
      total: contracts.length,
      message: `Contratos com status ${status} obtidos com sucesso`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /contracts/:contractId/signature/request - Request signature
 */
router.post('/:contractId/signature/request', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { contractId } = req.params;
    const { signer, email, cpfCnpj } = req.body;

    if (!signer || !email || !cpfCnpj) {
      throw new AppError('signer, email e cpfCnpj são obrigatórios', 400, 'VALIDATION_ERROR');
    }

    const signature = await contractLifecycleService.requestSignature(contractId, signer, email, cpfCnpj);

    res.status(201).json({
      statusCode: 201,
      data: signature,
      message: 'Solicitação de assinatura criada com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /contracts/:contractId/signature/:signatureId - Record digital signature
 */
router.put('/:contractId/signature/:signatureId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { contractId, signatureId } = req.params;
    const { certificateNumber, certificateIssuer } = req.body;

    if (!certificateNumber || !certificateIssuer) {
      throw new AppError('certificateNumber e certificateIssuer são obrigatórios', 400, 'VALIDATION_ERROR');
    }

    const contract = await contractLifecycleService.recordDigitalSignature(
      contractId,
      signatureId,
      certificateNumber,
      certificateIssuer,
    );

    res.json({
      statusCode: 200,
      data: contract,
      message: 'Assinatura digital registrada com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /contracts/:contractId/archive - Archive contract
 */
router.put('/:contractId/archive', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { contractId } = req.params;

    const contract = await contractLifecycleService.archiveContract(contractId);

    res.json({
      statusCode: 200,
      data: contract,
      message: 'Contrato arquivado com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /templates - Get all templates
 */
router.get('/templates/all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const templates = contractLifecycleService.getTemplates();

    res.json({
      statusCode: 200,
      data: templates,
      total: templates.length,
      message: 'Templates obtidos com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /templates/:templateId - Get template by ID
 */
router.get('/templates/:templateId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { templateId } = req.params;

    const template = contractLifecycleService.getTemplate(templateId);

    if (!template) {
      return res.status(404).json({
        statusCode: 404,
        data: null,
        message: `Template ${templateId} não encontrado`,
      });
    }

    res.json({
      statusCode: 200,
      data: template,
      message: 'Template obtido com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /templates - Create custom template
 */
router.post('/templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, category, content, variables, createdBy } = req.body;

    if (!name || !category || !content || !variables || !createdBy) {
      throw new AppError('name, category, content, variables e createdBy são obrigatórios', 400, 'VALIDATION_ERROR');
    }

    const validCategories = ['service', 'employment', 'nda', 'purchase', 'lease', 'partnership', 'other'];
    if (!validCategories.includes(category)) {
      throw new AppError('Categoria de template inválida', 400, 'INVALID_CATEGORY');
    }

    const template = await contractLifecycleService.createTemplate(
      name,
      category,
      content,
      variables,
      createdBy,
    );

    res.status(201).json({
      statusCode: 201,
      data: template,
      message: 'Template criado com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /statistics - Get contract statistics
 */
router.get('/statistics/overview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = contractLifecycleService.getStatistics();

    res.json({
      statusCode: 200,
      data: stats,
      message: 'Estatísticas de contratos obtidas com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /reset - Reset service data (testing only)
 */
router.post('/reset', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { confirmReset } = req.body;

    if (!confirmReset) {
      throw new AppError('Confirmação de reset é obrigatória', 400, 'VALIDATION_ERROR');
    }

    contractLifecycleService.reset();

    res.json({
      statusCode: 200,
      message: 'Contract Lifecycle Service resetado com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
