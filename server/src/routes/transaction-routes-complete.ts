/**
 * Transaction Routes - Phase 22.20.4 - Complete API
 *
 * Endpoints:
 * POST /api/transactions - criar transação
 * GET /api/transactions - listar com filtros e paginação
 * GET /api/transactions/:id - detalhe
 * PUT /api/transactions/:id - atualizar
 * DELETE /api/transactions/:id - soft-delete
 * GET /api/transactions/:id/history - trilha de alterações
 */

import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import { TransactionService, CreateTransactionInput, UpdateTransactionInput, TransactionFilters } from '../services/transaction-service.js';
import { logger } from '../services/logger-service.js';

export function createTransactionRoutes(db: Database.Database): Router {
  const router = Router();
  const service = new TransactionService(db);

  /**
   * POST /api/transactions
   * Criar nova transação
   */
  router.post('/', (req: Request, res: Response) => {
    try {
      const usuarioId = (req as any).auth?.usuario?.id;
      if (!usuarioId) {
        return res.status(401).json({ erro: 'Não autenticado' });
      }

      const input: CreateTransactionInput = {
        usuario_id: usuarioId,
        ...req.body,
      };

      const transacao = service.create(input);
      res.status(201).json(transacao);
    } catch (erro) {
      logger.error('Erro ao criar transação', {
        requestId: (req as any).id,
        error: erro instanceof Error ? erro.message : String(erro),
      });

      const statusCode = erro instanceof Error && erro.message.includes('Categoria') ? 400 : 500;
      res.status(statusCode).json({
        erro: erro instanceof Error ? erro.message : 'Falha ao criar transação',
      });
    }
  });

  /**
   * GET /api/transactions
   * Listar transações com filtros opcionais
   *
   * Query params:
   * - data_inicio: YYYY-MM-DD
   * - data_fim: YYYY-MM-DD
   * - categoria_id: number
   * - tipo_fluxo: 'receita' | 'despesa'
   * - status: string
   * - limite: 1-1000 (default 50)
   * - offset: number (default 0)
   */
  router.get('/', (req: Request, res: Response) => {
    try {
      const usuarioId = (req as any).auth?.usuario?.id;
      if (!usuarioId) {
        return res.status(401).json({ erro: 'Não autenticado' });
      }

      const filters: TransactionFilters = {
        usuario_id: usuarioId,
        data_inicio: req.query.data_inicio as string | undefined,
        data_fim: req.query.data_fim as string | undefined,
        categoria_id: req.query.categoria_id ? Number(req.query.categoria_id) : undefined,
        tipo_fluxo: req.query.tipo_fluxo as 'receita' | 'despesa' | undefined,
        status: req.query.status as string | undefined,
        limite: req.query.limite ? Math.min(Number(req.query.limite), 1000) : 50,
        offset: req.query.offset ? Number(req.query.offset) : 0,
      };

      const result = service.list(filters);
      res.json(result);
    } catch (erro) {
      logger.error('Erro ao listar transações', {
        requestId: (req as any).id,
        error: erro instanceof Error ? erro.message : String(erro),
      });
      res.status(500).json({ erro: 'Falha ao listar transações' });
    }
  });

  /**
   * GET /api/transactions/:id
   * Obter detalhe de uma transação
   */
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const usuarioId = (req as any).auth?.usuario?.id;
      if (!usuarioId) {
        return res.status(401).json({ erro: 'Não autenticado' });
      }

      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ erro: 'ID inválido' });
      }

      const transacao = service.getById(id, usuarioId);
      if (!transacao) {
        return res.status(404).json({ erro: 'Transação não encontrada' });
      }

      res.json(transacao);
    } catch (erro) {
      logger.error('Erro ao obter transação', {
        requestId: (req as any).id,
        error: erro instanceof Error ? erro.message : String(erro),
      });
      res.status(500).json({ erro: 'Falha ao obter transação' });
    }
  });

  /**
   * PUT /api/transactions/:id
   * Atualizar transação
   */
  router.put('/:id', (req: Request, res: Response) => {
    try {
      const usuarioId = (req as any).auth?.usuario?.id;
      if (!usuarioId) {
        return res.status(401).json({ erro: 'Não autenticado' });
      }

      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ erro: 'ID inválido' });
      }

      const input: UpdateTransactionInput = req.body;
      const transacao = service.update(id, usuarioId, input);

      res.json(transacao);
    } catch (erro) {
      logger.error('Erro ao atualizar transação', {
        requestId: (req as any).id,
        error: erro instanceof Error ? erro.message : String(erro),
      });

      const statusCode = erro instanceof Error && erro.message.includes('não encontrada') ? 404 : 400;
      res.status(statusCode).json({
        erro: erro instanceof Error ? erro.message : 'Falha ao atualizar transação',
      });
    }
  });

  /**
   * DELETE /api/transactions/:id
   * Soft-delete de transação
   */
  router.delete('/:id', (req: Request, res: Response) => {
    try {
      const usuarioId = (req as any).auth?.usuario?.id;
      if (!usuarioId) {
        return res.status(401).json({ erro: 'Não autenticado' });
      }

      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ erro: 'ID inválido' });
      }

      service.delete(id, usuarioId);
      res.status(204).send();
    } catch (erro) {
      logger.error('Erro ao deletar transação', {
        requestId: (req as any).id,
        error: erro instanceof Error ? erro.message : String(erro),
      });

      const statusCode = erro instanceof Error && erro.message.includes('não encontrada') ? 404 : 400;
      res.status(statusCode).json({
        erro: erro instanceof Error ? erro.message : 'Falha ao deletar transação',
      });
    }
  });

  /**
   * GET /api/transactions/:id/history
   * Obter histórico de alterações (trilha de auditoria)
   *
   * Query params:
   * - limite: número de registros (default 50)
   */
  router.get('/:id/history', (req: Request, res: Response) => {
    try {
      const usuarioId = (req as any).auth?.usuario?.id;
      if (!usuarioId) {
        return res.status(401).json({ erro: 'Não autenticado' });
      }

      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ erro: 'ID inválido' });
      }

      const limite = req.query.limite ? Math.min(Number(req.query.limite), 1000) : 50;
      const history = service.getHistory(id, usuarioId, limite);

      res.json({
        transacao_id: id,
        count: history.length,
        data: history,
      });
    } catch (erro) {
      logger.error('Erro ao obter histórico', {
        requestId: (req as any).id,
        error: erro instanceof Error ? erro.message : String(erro),
      });

      const statusCode = erro instanceof Error && erro.message.includes('não encontrada') ? 404 : 400;
      res.status(statusCode).json({
        erro: erro instanceof Error ? erro.message : 'Falha ao obter histórico',
      });
    }
  });

  return router;
}
