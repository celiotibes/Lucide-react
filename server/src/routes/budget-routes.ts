/**
 * Budget Routes - Phase 22.20.4
 *
 * Endpoints:
 * POST /api/budgets - criar orçamento
 * GET /api/budgets - listar por período
 * PUT /api/budgets/:id - atualizar
 * DELETE /api/budgets/:id - soft-delete
 * GET /api/budgets/:id/variance - variance analysis (real vs orçado)
 * GET /api/budgets/:id/tracking - progress bar
 */

import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import { BudgetService, CreateBudgetInput, UpdateBudgetInput } from '../services/budget-service.js';
import { logger } from '../services/logger-service.js';

export function createBudgetRoutes(db: Database.Database): Router {
  const router = Router();
  const service = new BudgetService(db);

  /**
   * POST /api/budgets
   * Criar novo orçamento
   */
  router.post('/', (req: Request, res: Response) => {
    try {
      const usuarioId = (req as any).auth?.usuario?.id;
      if (!usuarioId) {
        return res.status(401).json({ erro: 'Não autenticado' });
      }

      const input: CreateBudgetInput = {
        usuario_id: usuarioId,
        ...req.body,
      };

      const orcamento = service.create(input);
      res.status(201).json(orcamento);
    } catch (erro) {
      logger.error('Erro ao criar orçamento', {
        requestId: (req as any).id,
        error: erro instanceof Error ? erro.message : String(erro),
      });

      const statusCode = erro instanceof Error && erro.message.includes('inválido') ? 400 : 500;
      res.status(statusCode).json({
        erro: erro instanceof Error ? erro.message : 'Falha ao criar orçamento',
      });
    }
  });

  /**
   * GET /api/budgets
   * Listar orçamentos por período
   *
   * Query params:
   * - data_inicio: YYYY-MM-DD (opcional)
   * - data_fim: YYYY-MM-DD (opcional)
   * - limite: 1-1000 (default 50)
   * - offset: number (default 0)
   */
  router.get('/', (req: Request, res: Response) => {
    try {
      const usuarioId = (req as any).auth?.usuario?.id;
      if (!usuarioId) {
        return res.status(401).json({ erro: 'Não autenticado' });
      }

      const data_inicio = req.query.data_inicio as string | undefined;
      const data_fim = req.query.data_fim as string | undefined;
      const limite = req.query.limite ? Math.min(Number(req.query.limite), 1000) : 50;
      const offset = req.query.offset ? Number(req.query.offset) : 0;

      const result = service.listByPeriod(usuarioId, data_inicio, data_fim, limite, offset);
      res.json(result);
    } catch (erro) {
      logger.error('Erro ao listar orçamentos', {
        requestId: (req as any).id,
        error: erro instanceof Error ? erro.message : String(erro),
      });
      res.status(500).json({ erro: 'Falha ao listar orçamentos' });
    }
  });

  /**
   * GET /api/budgets/:id
   * Obter detalhe de um orçamento
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

      const orcamento = service.getById(id, usuarioId);
      if (!orcamento) {
        return res.status(404).json({ erro: 'Orçamento não encontrado' });
      }

      res.json(orcamento);
    } catch (erro) {
      logger.error('Erro ao obter orçamento', {
        requestId: (req as any).id,
        error: erro instanceof Error ? erro.message : String(erro),
      });
      res.status(500).json({ erro: 'Falha ao obter orçamento' });
    }
  });

  /**
   * PUT /api/budgets/:id
   * Atualizar orçamento
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

      const input: UpdateBudgetInput = req.body;
      const orcamento = service.update(id, usuarioId, input);

      res.json(orcamento);
    } catch (erro) {
      logger.error('Erro ao atualizar orçamento', {
        requestId: (req as any).id,
        error: erro instanceof Error ? erro.message : String(erro),
      });

      const statusCode = erro instanceof Error && erro.message.includes('não encontrado') ? 404 : 400;
      res.status(statusCode).json({
        erro: erro instanceof Error ? erro.message : 'Falha ao atualizar orçamento',
      });
    }
  });

  /**
   * DELETE /api/budgets/:id
   * Soft-delete de orçamento
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
      logger.error('Erro ao deletar orçamento', {
        requestId: (req as any).id,
        error: erro instanceof Error ? erro.message : String(erro),
      });

      const statusCode = erro instanceof Error && erro.message.includes('não encontrado') ? 404 : 400;
      res.status(statusCode).json({
        erro: erro instanceof Error ? erro.message : 'Falha ao deletar orçamento',
      });
    }
  });

  /**
   * GET /api/budgets/:id/variance
   * Obter análise de variance: real vs orçado
   *
   * Response: {
   *   orcamento_id: number,
   *   valor_limite: number,
   *   valor_utilizado: number,
   *   valor_disponivel: number,
   *   percentual_utilizado: number (0-100),
   *   acima_do_limite: boolean,
   *   status_alerta: 'normal' | 'alerta' | 'critico'
   * }
   */
  router.get('/:id/variance', (req: Request, res: Response) => {
    try {
      const usuarioId = (req as any).auth?.usuario?.id;
      if (!usuarioId) {
        return res.status(401).json({ erro: 'Não autenticado' });
      }

      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ erro: 'ID inválido' });
      }

      const variance = service.getVariance(id, usuarioId);
      res.json(variance);
    } catch (erro) {
      logger.error('Erro ao obter variance', {
        requestId: (req as any).id,
        error: erro instanceof Error ? erro.message : String(erro),
      });

      const statusCode = erro instanceof Error && erro.message.includes('não encontrado') ? 404 : 500;
      res.status(statusCode).json({
        erro: erro instanceof Error ? erro.message : 'Falha ao obter variance',
      });
    }
  });

  /**
   * GET /api/budgets/:id/tracking
   * Obter tracking (progress bar) de um orçamento
   *
   * Response: {
   *   orcamento_id: number,
   *   nome: string,
   *   percentual: number (0-100),
   *   cor_status: 'green' | 'yellow' | 'red',
   *   valor_utilizado: number,
   *   valor_limite: number
   * }
   */
  router.get('/:id/tracking', (req: Request, res: Response) => {
    try {
      const usuarioId = (req as any).auth?.usuario?.id;
      if (!usuarioId) {
        return res.status(401).json({ erro: 'Não autenticado' });
      }

      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ erro: 'ID inválido' });
      }

      const tracking = service.getTracking(id, usuarioId);
      res.json(tracking);
    } catch (erro) {
      logger.error('Erro ao obter tracking', {
        requestId: (req as any).id,
        error: erro instanceof Error ? erro.message : String(erro),
      });

      const statusCode = erro instanceof Error && erro.message.includes('não encontrado') ? 404 : 500;
      res.status(statusCode).json({
        erro: erro instanceof Error ? erro.message : 'Falha ao obter tracking',
      });
    }
  });

  return router;
}
