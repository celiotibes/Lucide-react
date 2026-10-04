/**
 * Rotas HTTP para reconciliação automática PIX↔OFX
 *
 * Endpoints:
 * - POST /reconciliar-agora: Trigger manual de reconciliação
 * - GET /status?dias=30: Busca status das últimas N dias
 * - GET /discrepancias?limite=50&offset=0: Lista discrepâncias detectadas
 *
 * Base: /api/conciliacao
 * Todas requerem autenticação (Bearer token).
 */

import express, { type Request, type Response } from "express";
import { logger } from '../services/logger-service.js';
import type Database from "better-sqlite3";
import type { AuthServiceDB } from "../domain/auth/auth-service-db.js";
import { criarMiddlewareAutenticacao } from "./auth-routes.js";
import { conciliarPixOFX, buscarStatusConciliacao } from "../domain/integracoes/conciliacao-pix-ofx.js";

export interface ConciliacaoPixOFXRoutesDeps {
  db: Database.Database;
  authService: AuthServiceDB;
}

export function criarRotasConciliacaoPixOFX({ db, authService }: ConciliacaoPixOFXRoutesDeps): express.Router {
  const router = express.Router();
  const exigirAutenticacao = criarMiddlewareAutenticacao(authService);

  /**
   * POST /reconciliar-agora
   *
   * Trigger manual para executar UMA rodada de reconciliação PIX↔OFX.
   * Útil para testes ou quando o usuário quer forçar uma sincronização imediata.
   *
   * Request: (vazio)
   * Response: {
   *   sucesso: boolean,
   *   resultado: {
   *     conciliadas: number,
   *     discrepancias: number,
   *     pendentes: number,
   *     expiradas: number,
   *     detalhes: string[]
   *   }
   * }
   */
  router.post("/reconciliar-agora", exigirAutenticacao, (req: Request, res: Response) => {
    try {
      const resultado = conciliarPixOFX(db);

      res.status(200).json({
        sucesso: true,
        resultado,
      });
    } catch (erro) {
      logger.error("[ConciliacaoPixOFX] Erro ao reconciliar:", erro);
      res.status(500).json({
        sucesso: false,
        erro: erro instanceof Error ? erro.message : "Erro desconhecido",
      });
    }
  });

  /**
   * GET /status?dias=30
   *
   * Busca estatísticas de reconciliação dos últimos N dias.
   * Útil para monitorar saúde do sistema e identificar padrões.
   *
   * Query:
   *   dias: number (default 30) — período retroativo em dias
   *
   * Response: {
   *   sucesso: boolean,
   *   status: {
   *     conciliadas: number,
   *     discrepancias: number,
   *     pendentes: number,
   *     expiradas: number
   *   },
   *   periodo: {
   *     dias: number,
   *     dataInicio: string (ISO 8601),
   *     dataFim: string (ISO 8601)
   *   }
   * }
   */
  router.get("/status", exigirAutenticacao, (req: Request, res: Response) => {
    try {
      const diasParam = req.query.dias ? parseInt(String(req.query.dias), 10) : 30;
      const dias = isNaN(diasParam) || diasParam < 1 ? 30 : diasParam;

      const status = buscarStatusConciliacao(db, dias);

      const agora = new Date();
      const dataFim = agora.toISOString().split("T")[0];
      const dataInicio = new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      res.status(200).json({
        sucesso: true,
        status,
        periodo: {
          dias,
          dataInicio,
          dataFim,
        },
      });
    } catch (erro) {
      logger.error("[ConciliacaoPixOFX] Erro ao buscar status:", erro);
      res.status(500).json({
        sucesso: false,
        erro: erro instanceof Error ? erro.message : "Erro desconhecido",
      });
    }
  });

  /**
   * GET /discrepancias?limite=50&offset=0
   *
   * Lista conciliações com discrepâncias detectadas.
   * Útil para revisão manual e auditoria.
   *
   * Query:
   *   limite: number (default 50)
   *   offset: number (default 0)
   *
   * Response: {
   *   sucesso: boolean,
   *   discrepancias: Array<{
   *     id: string,
   *     asaas_charge_id: string,
   *     valor_asaas: number,
   *     valor_ofx: number,
   *     data_asaas: string,
   *     data_ofx: string,
   *     status: string,
   *     discrepancia_flag: boolean,
   *     criado_em: string
   *   }>,
   *   total: number
   * }
   */
  router.get("/discrepancias", exigirAutenticacao, (req: Request, res: Response) => {
    try {
      // Parse and validate pagination parameters
      let limite = req.query.limite ? parseInt(String(req.query.limite), 10) : 50;
      let offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;

      // Validate and enforce limits
      const MAX_LIMITE = 500;
      const DEFAULT_LIMITE = 50;
      if (isNaN(limite) || limite < 1) limite = DEFAULT_LIMITE;
      if (limite > MAX_LIMITE) limite = MAX_LIMITE;
      if (isNaN(offset) || offset < 0) offset = 0;

      const stmtCount = db.prepare(`
        SELECT COUNT(*) as total FROM conciliacoes_pix_ofx
        WHERE status = 'discrepancia' OR discrepancia_flag = 1
      `);
      const countResult = stmtCount.get() as Record<string, unknown>;
      const total = countResult?.total ?? 0;

      const stmt = db.prepare(`
        SELECT id, asaas_charge_id, valor_asaas, valor_ofx, data_asaas, data_ofx, status, discrepancia_flag, criado_em
        FROM conciliacoes_pix_ofx
        WHERE status = 'discrepancia' OR discrepancia_flag = 1
        ORDER BY criado_em DESC
        LIMIT ? OFFSET ?
      `);
      const discrepancias = (stmt.all(limite, offset) as Record<string, unknown>[]) ?? [];

      res.status(200).json({
        sucesso: true,
        discrepancias,
        total,
        paginacao: {
          limite,
          offset,
          totalPaginas: Math.ceil(total / limite),
        },
      });
    } catch (erro) {
      logger.error("[ConciliacaoPixOFX] Erro ao buscar discrepâncias:", erro);
      res.status(500).json({
        sucesso: false,
        erro: erro instanceof Error ? erro.message : "Erro desconhecido",
      });
    }
  });

  return router;
}
