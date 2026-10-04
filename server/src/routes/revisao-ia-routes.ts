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
import { logger } from '../services/logger-service.js';
import type { AuthServiceDB } from '../domain/auth/auth-service-db.js';
import type Database from 'better-sqlite3';
import { criarMiddlewareAutenticacao } from './auth-routes.js';
import { criarFilaRevisaoService, FilaRevisaoService } from '../domain/relatorios/fila-revisao-service.js';
import { obterPoliticaAtual, papelPodeRevisar } from '../domain/relatorios/politicaRevisaoIA.js';

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

      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const offset = Number(req.query.offset) || 0;

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
  router.post('/:id/revisar', (req, res) => {
    try {
      if (!filaService) {
        return res.status(500).json({ erro: 'Serviço de fila não disponível' });
      }

      const { id } = req.params;
      const { status } = req.body;
      const usuarioId = (req as any).usuarioId;

      if (!usuarioId) {
        return res.status(401).json({ erro: 'Usuário não autenticado' });
      }

      const item = filaService.obterPorId(id);
      if (!item) {
        return res.status(404).json({ erro: 'Item não encontrado' });
      }

      // Verificar permissão
      const usuarioRole = (req as any).usuarioRole || 'usuario';
      if (!papelPodeRevisar(usuarioRole)) {
        return res.status(403).json({
          erro: 'Você não tem permissão para revisar itens',
          motivoRejeicao: `Papel '${usuarioRole}' não autorizado para revisão`
        });
      }

      const novoStatus = status || 'revisado';
      const itemAtualizado = filaService.marcarRevisado(id, usuarioId, novoStatus);

      logger.info('Item revisado', {
        itemId: id,
        status: novoStatus,
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
  router.post('/:id/rejeitar', (req, res) => {
    try {
      if (!filaService) {
        return res.status(500).json({ erro: 'Serviço de fila não disponível' });
      }

      const { id } = req.params;
      const { motivo } = req.body;
      const usuarioId = (req as any).usuarioId;

      if (!usuarioId) {
        return res.status(401).json({ erro: 'Usuário não autenticado' });
      }

      if (!motivo) {
        return res.status(400).json({ erro: 'Motivo é obrigatório' });
      }

      const item = filaService.obterPorId(id);
      if (!item) {
        return res.status(404).json({ erro: 'Item não encontrado' });
      }

      // Verificar permissão
      const usuarioRole = (req as any).usuarioRole || 'usuario';
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

      const dados = req.body;

      // Validação básica
      if (!dados.documentoId || !dados.tipo || !dados.motivo || !dados.solicitanteId) {
        return res.status(400).json({
          erro: 'Campos obrigatórios: documentoId, tipo, motivo, solicitanteId'
        });
      }

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
