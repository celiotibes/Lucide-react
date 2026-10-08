/**
 * Category Routes - Phase 22.20.4
 *
 * Endpoints:
 * POST /api/categories - criar categoria
 * GET /api/categories - listar (com opção de árvore)
 * GET /api/categories/:id - detalhe
 * PUT /api/categories/:id - atualizar
 * DELETE /api/categories/:id - soft-delete (com validação)
 * GET /api/categories/:id/transactions - transações da categoria
 */

import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import { CategoryService, CreateCategoryInput, UpdateCategoryInput } from '../services/category-service.js';
import { logger } from '../services/logger-service.js';

export function createCategoryRoutes(db: Database.Database): Router {
  const router = Router();
  const service = new CategoryService(db);

  /**
   * POST /api/categories
   * Criar nova categoria
   */
  router.post('/', (req: Request, res: Response) => {
    try {
      const usuarioId = (req as any).auth?.usuario?.id;
      if (!usuarioId) {
        return res.status(401).json({ erro: 'Não autenticado' });
      }

      const input: CreateCategoryInput = {
        usuario_id: usuarioId,
        ...req.body,
      };

      const categoria = service.create(input);
      res.status(201).json(categoria);
    } catch (erro) {
      logger.error('Erro ao criar categoria', {
        requestId: (req as any).id,
        error: erro instanceof Error ? erro.message : String(erro),
      });

      const statusCode = erro instanceof Error && erro.message.includes('inválido') ? 400 : 500;
      res.status(statusCode).json({
        erro: erro instanceof Error ? erro.message : 'Falha ao criar categoria',
      });
    }
  });

  /**
   * GET /api/categories
   * Listar categorias
   *
   * Query params:
   * - tree: 'true' para obter estrutura de árvore (default false)
   * - roots_only: 'true' para apenas categorias raiz
   */
  router.get('/', (req: Request, res: Response) => {
    try {
      const usuarioId = (req as any).auth?.usuario?.id;
      if (!usuarioId) {
        return res.status(401).json({ erro: 'Não autenticado' });
      }

      const isTree = req.query.tree === 'true';
      const rootsOnly = req.query.roots_only === 'true';

      if (isTree) {
        const tree = service.getTree(usuarioId);
        return res.json({ data: tree });
      }

      const data = service.list(usuarioId, rootsOnly);
      res.json({ data });
    } catch (erro) {
      logger.error('Erro ao listar categorias', {
        requestId: (req as any).id,
        error: erro instanceof Error ? erro.message : String(erro),
      });
      res.status(500).json({ erro: 'Falha ao listar categorias' });
    }
  });

  /**
   * GET /api/categories/:id
   * Obter detalhe de uma categoria
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

      const categoria = service.getById(id, usuarioId);
      if (!categoria) {
        return res.status(404).json({ erro: 'Categoria não encontrada' });
      }

      res.json(categoria);
    } catch (erro) {
      logger.error('Erro ao obter categoria', {
        requestId: (req as any).id,
        error: erro instanceof Error ? erro.message : String(erro),
      });
      res.status(500).json({ erro: 'Falha ao obter categoria' });
    }
  });

  /**
   * PUT /api/categories/:id
   * Atualizar categoria
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

      const input: UpdateCategoryInput = req.body;
      const categoria = service.update(id, usuarioId, input);

      res.json(categoria);
    } catch (erro) {
      logger.error('Erro ao atualizar categoria', {
        requestId: (req as any).id,
        error: erro instanceof Error ? erro.message : String(erro),
      });

      const statusCode = erro instanceof Error && erro.message.includes('não encontrada') ? 404 : 400;
      res.status(statusCode).json({
        erro: erro instanceof Error ? erro.message : 'Falha ao atualizar categoria',
      });
    }
  });

  /**
   * DELETE /api/categories/:id
   * Soft-delete de categoria
   *
   * Validações:
   * - Verifica se há transações usando a categoria
   * - Verifica se há subcategorias
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
      logger.error('Erro ao deletar categoria', {
        requestId: (req as any).id,
        error: erro instanceof Error ? erro.message : String(erro),
      });

      let statusCode = 500;
      if (erro instanceof Error) {
        if (erro.message.includes('não encontrada')) {
          statusCode = 404;
        } else if (erro.message.includes('transação') || erro.message.includes('subcategoria')) {
          statusCode = 409; // Conflict
        }
      }

      res.status(statusCode).json({
        erro: erro instanceof Error ? erro.message : 'Falha ao deletar categoria',
      });
    }
  });

  /**
   * GET /api/categories/:id/transactions
   * Obter transações de uma categoria (e subcategorias)
   *
   * Query params:
   * - include_sub: 'true' para incluir subcategorias (default true)
   * - limite: 1-1000 (default 50)
   * - offset: number (default 0)
   */
  router.get('/:id/transactions', (req: Request, res: Response) => {
    try {
      const usuarioId = (req as any).auth?.usuario?.id;
      if (!usuarioId) {
        return res.status(401).json({ erro: 'Não autenticado' });
      }

      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ erro: 'ID inválido' });
      }

      const includeSub = req.query.include_sub !== 'false';
      const limite = req.query.limite ? Math.min(Number(req.query.limite), 1000) : 50;
      const offset = req.query.offset ? Number(req.query.offset) : 0;

      const result = service.getTransactions(id, usuarioId, includeSub, limite, offset);
      res.json(result);
    } catch (erro) {
      logger.error('Erro ao obter transações da categoria', {
        requestId: (req as any).id,
        error: erro instanceof Error ? erro.message : String(erro),
      });

      const statusCode = erro instanceof Error && erro.message.includes('não encontrada') ? 404 : 500;
      res.status(statusCode).json({
        erro: erro instanceof Error ? erro.message : 'Falha ao obter transações',
      });
    }
  });

  return router;
}
