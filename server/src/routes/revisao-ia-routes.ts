/**
 * Rotas HTTP para Fila de Revisão IA
 *
 * GET  /api/revisao-ia/fila?status=pendente&limit=50        — Listar itens da fila
 * GET  /api/revisao-ia/fila/:id                               — Obter item específico
 * GET  /api/revisao-ia/politica                               — Obter política de revisão
 * GET  /api/revisao-ia/documento/:documentoId                 — Itens para um documento
 * GET  /api/revisao-ia/estatisticas                           — Estatísticas da fila
 * POST /api/revisao-ia/:id/revisar                            — Marcar como revisado
 * POST /api/revisao-ia/:id/rejeitar                           — Rejeitar revisão
 * POST /api/revisao-ia/criar                                  — Criar item (internal)
 */

import express from 'express';
import { z } from 'zod';
import { logger } from '../services/logger-service.js';
import type { AuthServiceDB } from '../domain/auth/auth-service-db.js';
import type Database from 'better-sqlite3';
import { criarMiddlewareAutenticacao } from './auth-routes.js';
import { criarFilaRevisaoService, FilaRevisaoService } from '../domain/relatorios/fila-revisao-service.js';
import { obterPoliticaAtual, papelPodeRevisar } from '../domain/relatorios/politicaRevisaoIA.js';

// Zod validation schemas
const filaQuerySchema = z.object({
  status: z.enum(['pendente', 'revisado', 'rejeitado']).optional().default('pendente'),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
}).strict();

const revisarBodySchema = z.object({
  status: z.enum(['revisado', 'autorizado']).optional().default('revisado'),
}).strict();

const rejeitarBodySchema = z.object({
  motivo: z.string().min(1).max(500).trim(),
}).strict();

const criarItemBodySchema = z.object({
  documentoId: z.string().min(1).max(100),
  tipo: z.enum(['revisao', 'analise', 'validacao']),
  motivo: z.string().min(1).max(500).trim(),
  solicitanteId: z.string().min(1).max(100),
}).strict();

interface AuthenticatedRequest extends express.Request {
  usuarioId?: string;
  usuarioRole?: string;
}

export interface RevisaoIARoutesDeps {
  authService: AuthServiceDB;
  db?: Database.Database;
}

export function criarRotasRevisaoIA(deps: RevisaoIARoutesDeps): express.Router {
  const router = express.Router();
  const { authService, db } = deps;

  // Middleware: autenticação Bearer
  router.use(criarMiddlewareAutenticacao(authService));

  let filaService: FilaRevisaoService | null = null;

  if (db) {
    filaService = criarFilaRevisaoService(db);
  }

  /**
   * GET /api/revisao-ia/fila
   * Listar itens da fila com paginação
   *
   * Query params:
   *   - status: 'pendente' | 'revisado' | 'rejeitado' (default: 'pendente')
   *   - limit: número (default: 50)
   *   - offset: número (default: 0)
   */
  router.get('/fila', (req, res) => {
    try {
      if (!filaService) {
        return res.status(500).json({ erro: 'Serviço de fila não disponível' });
      }

      // Validate query params with Zod
      const parseResult = filaQuerySchema.safeParse(req.query);
      if (!parseResult.success) {
        return res.status(400).json({
          erro: 'Parâmetros de query inválidos',
          detalhes: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        });
      }

      const { limit, offset } = parseResult.data;
      const itens = filaService.obterPendentes(limit, offset);

      return res.json({
        sucesso: true,
        itens,
        paginacao: {
          limit,
          offset,
          total: itens.length
        }
      });
    } catch (erro) {
      logger.error('Erro ao listar fila de revisão', { erro });
      return res.status(500).json({ erro: 'Erro ao listar fila' });
    }
  });

  /**
   * GET /api/revisao-ia/fila/:id
   * Obter um item específico da fila
   */
  router.get('/fila/:id', (req, res) => {
    try {
      if (!filaService) {
        return res.status(500).json({ erro: 'Serviço de fila não disponível' });
      }

      const { id } = req.params;
      const item = filaService.obterPorId(id);

      if (!item) {
        return res.status(404).json({ erro: 'Item não encontrado' });
      }

      return res.json({
        sucesso: true,
        item
      });
    } catch (erro) {
      logger.error('Erro ao obter item da fila', { erro });
      return res.status(500).json({ erro: 'Erro ao obter item' });
    }
  });

  /**
   * GET /api/revisao-ia/politica
   * Retorna a política de revisão atual (para exibir na UI)
   */
  router.get('/politica', (req, res) => {
    try {
      const politica = obterPoliticaAtual();

      return res.json({
        sucesso: true,
        politica
      });
    } catch (erro) {
      logger.error('Erro ao obter política de revisão', { erro });
      return res.status(500).json({ erro: 'Erro ao obter política' });
    }
  });

  /**
   * GET /api/revisao-ia/documento/:documentoId
   * Listar itens de revisão para um documento específico
   */
  router.get('/documento/:documentoId', (req, res) => {
    try {
      if (!filaService) {
        return res.status(500).json({ erro: 'Serviço de fila não disponível' });
      }

      const { documentoId } = req.params;
      const itens = filaService.obterPorDocumento(documentoId);

      return res.json({
        sucesso: true,
        itens,
        temPendencias: itens.some((i) => i.status === 'pendente')
      });
    } catch (erro) {
      logger.error('Erro ao obter itens por documento', { erro });
      return res.status(500).json({ erro: 'Erro ao obter itens' });
    }
  });

  /**
   * GET /api/revisao-ia/estatisticas
   * Retorna estatísticas da fila
   */
  router.get('/estatisticas', (req, res) => {
    try {
      if (!filaService) {
        return res.status(500).json({ erro: 'Serviço de fila não disponível' });
      }

      const stats = filaService.obterEstatisticas();

      return res.json({
        sucesso: true,
        estatisticas: stats
      });
    } catch (erro) {
      logger.error('Erro ao obter estatísticas da fila', { erro });
      return res.status(500).json({ erro: 'Erro ao obter estatísticas' });
    }
  });

  /**
   * POST /api/revisao-ia/:id/revisar
   * Marcar um item como revisado/autorizado
   *
   * Body:
   *   - status: 'revisado' | 'autorizado' (default: 'revisado')
   *   - usuarioId: ID do revisor (deve estar autenticado)
   */
  router.post('/:id/revisar', (req: AuthenticatedRequest, res) => {
    try {
      if (!filaService) {
        return res.status(500).json({ erro: 'Serviço de fila não disponível' });
      }

      const { id } = req.params;

      // Validate body with Zod
      const bodyParseResult = revisarBodySchema.safeParse(req.body);
      if (!bodyParseResult.success) {
        return res.status(400).json({
          erro: 'Corpo da requisição inválido',
          detalhes: bodyParseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        });
      }

      const { status } = bodyParseResult.data;
      const usuarioId = req.usuarioId;

      if (!usuarioId) {
        return res.status(401).json({ erro: 'Usuário não autenticado' });
      }

      const item = filaService.obterPorId(id);
      if (!item) {
        return res.status(404).json({ erro: 'Item não encontrado' });
      }

      // Verificar permissão
      const usuarioRole = req.usuarioRole || 'usuario';
      if (!papelPodeRevisar(usuarioRole)) {
        return res.status(403).json({
          erro: 'Você não tem permissão para revisar itens',
          motivoRejeicao: `Papel '${usuarioRole}' não autorizado para revisão`
        });
      }

      const itemAtualizado = filaService.marcarRevisado(id, usuarioId, status);

      logger.info('Item revisado', {
        itemId: id,
        status,
        revisorId: usuarioId
      });

      return res.json({
        sucesso: true,
        item: itemAtualizado,
        mensagem: 'Item marcado como revisado'
      });
    } catch (erro) {
      logger.error('Erro ao revisar item', { erro });
      return res.status(500).json({ erro: 'Erro ao revisar item' });
    }
  });

  /**
   * POST /api/revisao-ia/:id/rejeitar
   * Rejeitar um item de revisão
   *
   * Body:
   *   - motivo: string (obrigatório)
   *   - usuarioId: ID do revisor (deve estar autenticado)
   */
  router.post('/:id/rejeitar', (req: AuthenticatedRequest, res) => {
    try {
      if (!filaService) {
        return res.status(500).json({ erro: 'Serviço de fila não disponível' });
      }

      const { id } = req.params;

      // Validate body with Zod
      const bodyParseResult = rejeitarBodySchema.safeParse(req.body);
      if (!bodyParseResult.success) {
        return res.status(400).json({
          erro: 'Corpo da requisição inválido',
          detalhes: bodyParseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        });
      }

      const { motivo } = bodyParseResult.data;
      const usuarioId = req.usuarioId;

      if (!usuarioId) {
        return res.status(401).json({ erro: 'Usuário não autenticado' });
      }

      const item = filaService.obterPorId(id);
      if (!item) {
        return res.status(404).json({ erro: 'Item não encontrado' });
      }

      // Verificar permissão
      const usuarioRole = req.usuarioRole || 'usuario';
      if (!papelPodeRevisar(usuarioRole)) {
        return res.status(403).json({
          erro: 'Você não tem permissão para revisar itens'
        });
      }

      const itemAtualizado = filaService.rejeitarRevisao(id, usuarioId, motivo);

      logger.info('Item rejeitado', {
        itemId: id,
        motivo,
        revisorId: usuarioId
      });

      return res.json({
        sucesso: true,
        item: itemAtualizado,
        mensagem: 'Item rejeitado com sucesso'
      });
    } catch (erro) {
      logger.error('Erro ao rejeitar item', { erro });
      return res.status(500).json({ erro: 'Erro ao rejeitar item' });
    }
  });

  /**
   * POST /api/revisao-ia/criar
   * Criar um novo item na fila (internal/system)
   *
   * Body: DadosFilaRevisao
   */
  router.post('/criar', (req, res) => {
    try {
      if (!filaService) {
        return res.status(500).json({ erro: 'Serviço de fila não disponível' });
      }

      // Validate body with Zod
      const bodyParseResult = criarItemBodySchema.safeParse(req.body);
      if (!bodyParseResult.success) {
        return res.status(400).json({
          erro: 'Corpo da requisição inválido',
          detalhes: bodyParseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        });
      }

      const dados = bodyParseResult.data;
      const item = filaService.criarItemRevisao(dados);

      logger.info('Item de revisão criado', {
        itemId: item.id,
        documentoId: dados.documentoId,
        tipo: dados.tipo,
        motivo: dados.motivo
      });

      return res.status(201).json({
        sucesso: true,
        item
      });
    } catch (erro) {
      logger.error('Erro ao criar item de revisão', { erro });
      return res.status(500).json({ erro: 'Erro ao criar item' });
    }
  });

  return router;
}
