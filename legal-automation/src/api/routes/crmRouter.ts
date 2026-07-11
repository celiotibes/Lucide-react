import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '@utils/logger';
import { crmService } from '@services/CRMService';
import { whatsAppBotService } from '@services/WhatsAppBotService';
import { AppError } from '@utils/errors';

// ============================================================================
// CRM ROUTER - Phase 1 - Client Relationship Management
// ============================================================================

const router = Router();

/**
 * POST /clients - Create or update client
 */
router.post('/clients', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, phone, cpf, cnpj, source, caseType, status } = req.body;

    if (!name || !email) {
      throw new AppError('Nome e email são obrigatórios', 400, 'VALIDATION_ERROR');
    }

    const client = await crmService.createOrUpdateClient({
      name,
      email,
      phone,
      cpf,
      cnpj,
      source,
      caseType,
      status,
    });

    res.status(201).json({
      statusCode: 201,
      data: client,
      message: 'Cliente criado/atualizado com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /clients/:clientId - Get client by ID
 */
router.get('/clients/:clientId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clientId } = req.params;

    const client = await crmService.getClientById(clientId);
    if (!client) {
      throw new AppError('Cliente não encontrado', 404, 'CLIENT_NOT_FOUND');
    }

    res.json({
      statusCode: 200,
      data: client,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /clients - Get all clients
 */
router.get('/clients', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clients = crmService.getAllClients();

    res.json({
      statusCode: 200,
      data: clients,
      total: clients.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /clients/status/:status - Get clients by status
 */
router.get('/clients/status/:status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.params;
    const validStatuses = ['prospect', 'lead', 'qualified', 'customer', 'inactive'];

    if (!validStatuses.includes(status)) {
      throw new AppError('Status inválido', 400, 'INVALID_STATUS');
    }

    const clients = await crmService.getClientsByStatus(
      status as 'prospect' | 'lead' | 'qualified' | 'customer' | 'inactive',
    );

    res.json({
      statusCode: 200,
      data: clients,
      total: clients.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /clients/search - Find client by contact
 */
router.post('/clients/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone, email } = req.body;

    if (!phone && !email) {
      throw new AppError('Telefone ou email são obrigatórios', 400, 'VALIDATION_ERROR');
    }

    const client = await crmService.findClientByContact(phone, email);

    if (!client) {
      return res.json({
        statusCode: 404,
        data: null,
        message: 'Cliente não encontrado',
      });
    }

    res.json({
      statusCode: 200,
      data: client,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /clients/:clientId/interactions - Log interaction
 */
router.post(
  '/clients/:clientId/interactions',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { clientId } = req.params;
      const { type, channel, content, attachments, outcome } = req.body;

      if (!type || !channel || !content) {
        throw new AppError('Tipo, canal e conteúdo são obrigatórios', 400, 'VALIDATION_ERROR');
      }

      const validTypes = ['message', 'call', 'email', 'meeting', 'proposal'];
      const validChannels = ['whatsapp', 'email', 'phone', 'in-person'];

      if (!validTypes.includes(type) || !validChannels.includes(channel)) {
        throw new AppError('Tipo ou canal de interação inválido', 400, 'INVALID_INTERACTION');
      }

      // Verify client exists
      const client = await crmService.getClientById(clientId);
      if (!client) {
        throw new AppError('Cliente não encontrado', 404, 'CLIENT_NOT_FOUND');
      }

      const interaction = await crmService.logInteraction(
        clientId,
        type,
        channel,
        content,
        attachments,
      );

      res.status(201).json({
        statusCode: 201,
        data: interaction,
        message: 'Interação registrada com sucesso',
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /clients/:clientId/interactions - Get client interaction history
 */
router.get(
  '/clients/:clientId/interactions',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { clientId } = req.params;
      const { limit = '50' } = req.query;

      const client = await crmService.getClientById(clientId);
      if (!client) {
        throw new AppError('Cliente não encontrado', 404, 'CLIENT_NOT_FOUND');
      }

      const interactions = await crmService.getClientHistory(clientId, parseInt(limit as string));

      res.json({
        statusCode: 200,
        data: interactions,
        total: interactions.length,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PUT /clients/:clientId/status - Update client status
 */
router.put(
  '/clients/:clientId/status',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { clientId } = req.params;
      const { status } = req.body;

      if (!status) {
        throw new AppError('Status é obrigatório', 400, 'VALIDATION_ERROR');
      }

      const validStatuses = ['prospect', 'lead', 'qualified', 'customer', 'inactive'];
      if (!validStatuses.includes(status)) {
        throw new AppError('Status inválido', 400, 'INVALID_STATUS');
      }

      const client = await crmService.updateClientStatus(
        clientId,
        status as 'prospect' | 'lead' | 'qualified' | 'customer' | 'inactive',
      );

      res.json({
        statusCode: 200,
        data: client,
        message: 'Status do cliente atualizado com sucesso',
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /classify-case - Classify legal case
 */
router.post('/classify-case', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { message } = req.body;

    if (!message) {
      throw new AppError('Mensagem é obrigatória para classificação', 400, 'VALIDATION_ERROR');
    }

    const classification = await crmService.classifyCase(message);

    res.json({
      statusCode: 200,
      data: classification,
      message: 'Caso classificado com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /pipeline - Get pipeline statistics
 */
router.get('/pipeline', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const statistics = await crmService.getPipelineStatistics();

    res.json({
      statusCode: 200,
      data: statistics,
      message: 'Estatísticas do pipeline obtidas com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /recommendations - Get follow-up recommendations
 */
router.get('/recommendations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const recommendations = await crmService.getFollowUpRecommendations();

    res.json({
      statusCode: 200,
      data: recommendations,
      total: recommendations.length,
      message: 'Recomendações de follow-up obtidas com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /whatsapp/message - Process WhatsApp message
 */
router.post('/whatsapp/message', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phoneNumber, senderName, messageText, messageType, attachmentUrl } = req.body;

    if (!phoneNumber || !messageText) {
      throw new AppError(
        'Telefone e texto da mensagem são obrigatórios',
        400,
        'VALIDATION_ERROR',
      );
    }

    const message = {
      id: `msg-${Date.now()}`,
      phoneNumber,
      senderName: senderName || 'Cliente',
      messageText,
      messageType: messageType || 'text',
      attachmentUrl,
      timestamp: new Date(),
    };

    const response = await whatsAppBotService.processMessage(message);

    res.status(200).json({
      statusCode: 200,
      data: response,
      message: 'Mensagem WhatsApp processada com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /whatsapp/conversation/:clientId - Get WhatsApp conversation history
 */
router.get(
  '/whatsapp/conversation/:clientId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { clientId } = req.params;

      const messages = await whatsAppBotService.getConversationHistory(clientId);
      const state = whatsAppBotService.getConversationState(clientId);

      res.json({
        statusCode: 200,
        data: {
          messages,
          currentState: state,
        },
        total: messages.length,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /whatsapp/stats - Get WhatsApp bot statistics
 */
router.get('/whatsapp/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = whatsAppBotService.getStatistics();

    res.json({
      statusCode: 200,
      data: stats,
      message: 'Estatísticas do WhatsApp bot obtidas com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /reset - Reset CRM data (testing only)
 */
router.post('/reset', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { confirmReset } = req.body;

    if (!confirmReset) {
      throw new AppError('Confirmação de reset é obrigatória', 400, 'VALIDATION_ERROR');
    }

    crmService.reset();

    res.json({
      statusCode: 200,
      message: 'CRM resetado com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
