import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { verifyToken } from '@middlewares/authMiddleware';
import { projurisService } from '@services/ProjurisService';
import { CreateClientRequest, UpdateClientRequest } from 'projuris';

const router = Router();

/**
 * POST /projuris/clients
 * Criar novo cliente
 */
router.post('/', verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { name, type, documentId, contact, tags, notes } = req.body;

    if (!name || !type || !documentId) {
      return res.status(400).json({
        error: 'name, type e documentId são obrigatórios',
      });
    }

    const request: CreateClientRequest = {
      name,
      type,
      documentId,
      contact: contact || {},
      tags,
      notes,
    };

    const client = await projurisService.createClient(userId, request);

    res.status(201).json({
      status: 'success',
      client,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao criar cliente');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao criar cliente',
    });
  }
});

/**
 * GET /projuris/clients/:id
 * Obter cliente específico
 */
router.get('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params;

    const client = await projurisService.getClient(userId, id);

    if (!client) {
      return res.status(404).json({
        error: 'Cliente não encontrado',
      });
    }

    res.json({
      status: 'success',
      client,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter cliente');
    res.status(500).json({
      error: 'Erro ao obter cliente',
    });
  }
});

/**
 * GET /projuris/clients
 * Listar clientes
 */
router.get('/', verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { status, search } = req.query;

    const clients = await projurisService.listClients(userId, {
      status: status as string,
      search: search as string,
    });

    res.json({
      status: 'success',
      count: clients.length,
      clients,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao listar clientes');
    res.status(500).json({
      error: 'Erro ao listar clientes',
    });
  }
});

/**
 * PUT /projuris/clients/:id
 * Atualizar cliente
 */
router.put('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params;
    const { name, contact, status, tags, notes } = req.body;

    const request: UpdateClientRequest = {
      name,
      contact,
      status,
      tags,
      notes,
    };

    const updated = await projurisService.updateClient(userId, id, request);

    if (!updated) {
      return res.status(404).json({
        error: 'Cliente não encontrado',
      });
    }

    res.json({
      status: 'success',
      client: updated,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao atualizar cliente');
    res.status(500).json({
      error: 'Erro ao atualizar cliente',
    });
  }
});

/**
 * GET /projuris/clients/:id/stats
 * Obter estatísticas do cliente
 */
router.get('/:id/stats', verifyToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const stats = await projurisService.getClientStats((req as any).user?.userId, id);

    res.json({
      status: 'success',
      stats,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter estatísticas');
    res.status(500).json({
      error: 'Erro ao obter estatísticas',
    });
  }
});

export const projurisClientController = router;
