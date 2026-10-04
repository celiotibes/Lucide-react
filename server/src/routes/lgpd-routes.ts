/**
 * Rotas LGPD - Lei Geral de Proteção de Dados Pessoais
 * Implementa direitos do titular de dados:
 * - Acesso aos próprios dados (GET /meus-dados)
 * - Auditoria de acessos (GET /acessos)
 * - Exclusão/anonimização de conta (POST /deletar-conta)
 */

import express from 'express';
import type Database from 'better-sqlite3';
import type { AuthServiceDB } from '../domain/auth/auth-service-db.js';
import type { AuditTrailServiceDB } from '../domain/auth/audit-trail-db.js';
import crypto from 'crypto';
import { verificarSenha } from '../domain/auth/password.js';
import { logger } from '../services/logger-service.js';
import { criarMiddlewareAutenticacao } from './auth-routes.js';

export interface RotasLgpdDeps {
  authService: AuthServiceDB;
  auditService: AuditTrailServiceDB;
  db: Database.Database;
}

/**
 * Cria router de rotas LGPD
 * Todas as rotas operam SEMPRE e SÓ sobre o usuário autenticado
 */
export function criarRotasLgpd({ authService, auditService, db }: RotasLgpdDeps): express.Router {
  const router = express.Router();

  // Middleware de autenticação: permite papéis externos (inquilino/prestador)
  const autenticar = criarMiddlewareAutenticacao(authService, { permitirPapeisExternos: true });

  /**
   * GET /meus-dados
   * Retorna: id, nome, email, role, ativo, data_criacao, ultimo_login do usuário,
   * suas sessões ativas (sem token), e suas últimas ações de auditoria.
   * Registra o acesso na auditoria.
   */
  router.get('/meus-dados', autenticar, (req: express.Request, res: express.Response) => {
    try {
      const usuarioId = (req.auth?.usuario?.id) as string | undefined;
      if (!usuarioId) {
        return res.status(401).json({ erro: 'Não autenticado' });
      }

      // Buscar dados do usuário
      const usuarioStmt = db.prepare(
        `SELECT id, nome, email, role, ativo, data_criacao, ultimo_login FROM usuarios WHERE id = ?`
      );
      const usuario = usuarioStmt.get(usuarioId) as any;
      if (!usuario) {
        return res.status(404).json({ erro: 'Usuário não encontrado' });
      }

      // Buscar sessões ativas (sem o token)
      const sessoesStmt = db.prepare(
        `SELECT usuario_id, data_criacao, data_expiracao, endereco_ip, user_agent, ativo
         FROM sessoes WHERE usuario_id = ? AND ativo = true AND data_expiracao > CURRENT_TIMESTAMP
         ORDER BY data_criacao DESC`
      );
      const sessoes = sessoesStmt.all(usuarioId) as any[];

      // Buscar últimas 10 ações de auditoria deste usuário
      const auditoriaStmt = db.prepare(
        `SELECT id, timestamp, tipo_acao, recurso, recurso_id, descricao, resultado
         FROM auditoria WHERE usuario_id = ? ORDER BY timestamp DESC LIMIT 10`
      );
      const acessos = auditoriaStmt.all(usuarioId) as any[];

      // Registrar este acesso na auditoria
      auditService.registrarAcao(
        req.auth!,
        'lgpd_acesso_dados',
        'usuario',
        usuarioId,
        {
          descricao: 'Acesso aos próprios dados pessoais (LGPD Art. 18)',
          resultado: 'sucesso',
          endereco_ip: req.ip,
          user_agent: req.get('user-agent'),
        }
      );

      res.status(200).json({
        usuario: {
          id: usuario.id,
          nome: usuario.nome,
          email: usuario.email,
          role: usuario.role,
          ativo: usuario.ativo,
          data_criacao: usuario.data_criacao,
          ultimo_login: usuario.ultimo_login,
        },
        sessoes_ativas: sessoes.map((s: any) => ({
          data_criacao: s.data_criacao,
          data_expiracao: s.data_expiracao,
          endereco_ip: s.endereco_ip,
          user_agent: s.user_agent,
        })),
        acessos_recentes: acessos,
      });
    } catch (erro) {
      logger.error('[LGPD] GET /meus-dados erro:', erro);
      res.status(500).json({ erro: 'Erro ao coletar dados' });
    }
  });

  /**
   * GET /acessos?limite=<int>
   * Trilha de auditoria do próprio usuário.
   * Limite: padrão 100, máximo 500. Valor inválido = 400.
   */
  router.get('/acessos', autenticar, (req: express.Request, res: express.Response) => {
    try {
      const usuarioId = (req.auth?.usuario?.id) as string | undefined;
      if (!usuarioId) {
        return res.status(401).json({ erro: 'Não autenticado' });
      }

      let limite = 100;
      if (req.query.limite) {
        const limiteParam = Number(req.query.limite);
        if (!Number.isInteger(limiteParam) || limiteParam < 1) {
          return res.status(400).json({ erro: 'Limite deve ser um inteiro positivo' });
        }
        limite = Math.min(limiteParam, 500);
      }

      const auditStmt = db.prepare(
        `SELECT id, timestamp, tipo_acao, recurso, recurso_id, descricao, resultado
         FROM auditoria WHERE usuario_id = ? ORDER BY timestamp DESC LIMIT ?`
      );
      const acessos = auditStmt.all(usuarioId, limite) as any[];

      res.status(200).json({
        total: acessos.length,
        limite,
        acessos,
      });
    } catch (erro) {
      logger.error('[LGPD] GET /acessos erro:', erro);
      res.status(500).json({ erro: 'Erro ao listar acessos' });
    }
  });

  /**
   * POST /deletar-conta
   * Corpo: { senha: string, confirmacao: "EXCLUIR" }
   * - Valida senha (re-autenticação; senha errada = 403, registra acesso_negado)
   * - Anonimiza: nome = "Usuário removido", email = "removido-<id>@anonimizado.invalid",
   *   senha_hash inutilizável, ativo = false
   * - Revoga todas as sessões (ativo = false)
   * - Mantém auditoria (guarda legal)
   * - Protege: se últi mo titular ativo, recusa (409)
   * - Idempotente: conta já anonimizada não consegue autenticar
   */
  router.post('/deletar-conta', autenticar, async (req: express.Request, res: express.Response) => {
    try {
      const usuarioId = (req.auth?.usuario?.id) as string | undefined;
      if (!usuarioId) {
        return res.status(401).json({ erro: 'Não autenticado' });
      }

      const { senha, confirmacao } = req.body;

      // Validar campos
      if (!senha || typeof senha !== 'string') {
        return res.status(400).json({ erro: 'Senha é obrigatória' });
      }
      if (confirmacao !== 'EXCLUIR') {
        return res.status(400).json({
          erro: 'Confirmação inválida. Envie confirmacao: "EXCLUIR"',
        });
      }

      // Re-autenticar: buscar hash da senha
      const usuarioStmt = db.prepare('SELECT senha_hash FROM usuarios WHERE id = ?');
      const usuarioRow = usuarioStmt.get(usuarioId) as any;
      if (!usuarioRow) {
        return res.status(404).json({ erro: 'Usuário não encontrado' });
      }

      const senhaValida = await verificarSenha(senha, usuarioRow.senha_hash);
      if (!senhaValida) {
        // Registra acesso_negado
        auditService.registrarAcao(
          req.auth!,
          'acesso_negado',
          'usuario',
          usuarioId,
          {
            descricao: 'Tentativa de exclusão de conta com senha incorreta',
            resultado: 'negado',
            endereco_ip: req.ip,
            user_agent: req.get('user-agent'),
          }
        );
        return res.status(403).json({ erro: 'Senha incorreta' });
      }

      // Proteger contra bloqueio total: o ÚLTIMO titular ativo não pode se anonimizar (só vale para titular;
      // inquilino/prestador sempre podem exercer o direito de exclusão).
      if (req.auth!.usuario.role === 'titular') {
        const outros = db
          .prepare(`SELECT COUNT(*) AS count FROM usuarios WHERE role = 'titular' AND ativo = true AND id != ?`)
          .get(usuarioId) as { count: number };
        if (outros.count === 0) {
          auditService.registrarAcao(req.auth!, 'acesso_negado', 'usuario', usuarioId, {
            descricao: 'Tentativa de exclusão bloqueada: último titular ativo',
            resultado: 'negado',
            endereco_ip: req.ip,
            user_agent: req.get('user-agent'),
          });
          return res.status(409).json({
            erro: 'Não é possível excluir a conta: você é o último titular ativo do sistema',
          });
        }
      }

      // Anonimizar + revogar sessões na MESMA transação: ou as duas coisas acontecem ou nenhuma.
      const emailAnonimo = `removido-${usuarioId}@anonimizado.invalid`;
      // Valor que nunca é um hash válido e não é derivável do id: ninguém autentica com ele.
      const senhaInutilizavel = `removed-${crypto.randomBytes(24).toString('hex')}`;
      db.transaction(() => {
        db.prepare(
          `UPDATE usuarios SET nome = 'Usuário removido', email = ?, senha_hash = ?, ativo = false WHERE id = ?`,
        ).run(emailAnonimo, senhaInutilizavel, usuarioId);
        db.prepare(`UPDATE sessoes SET ativo = false WHERE usuario_id = ?`).run(usuarioId);
      })();

      // Registrar exclusão na auditoria
      auditService.registrarAcao(
        req.auth!,
        'lgpd_exclusao_conta',
        'usuario',
        usuarioId,
        {
          descricao: 'Conta anonimizada: dados pessoais removidos, sessões revogadas',
          resultado: 'sucesso',
          endereco_ip: req.ip,
          user_agent: req.get('user-agent'),
        }
      );

      res.clearCookie('session_token', { path: '/' });
      res.clearCookie('csrf_token', { path: '/' });
      res.status(200).json({
        mensagem: 'Conta anonimizada com sucesso. Suas sessões foram revogadas.',
      });
    } catch (erro) {
      logger.error('[LGPD] POST /deletar-conta erro:', erro);
      res.status(500).json({ erro: 'Erro ao processar exclusão' });
    }
  });

  return router;
}
