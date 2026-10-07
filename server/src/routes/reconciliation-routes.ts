/**
 * Rotas HTTP para Sistema de Reconciliação de Transações
 * Phase 19: Automatic Transaction Matching & Reconciliation
 *
 * POST   /api/v1/reconciliation/agents/:agente_id/match     — Executa matching
 * GET    /api/v1/reconciliation/agents/:agente_id/status    — Status da reconciliação
 * GET    /api/v1/reconciliation/matches                      — Lista matches
 * GET    /api/v1/reconciliation/matches/:match_id            — Detalhes do match
 * PUT    /api/v1/reconciliation/matches/:match_id/approve    — Aprova match
 * PUT    /api/v1/reconciliation/matches/:match_id/reject     — Rejeita match
 * GET    /api/v1/reconciliation/report/:agente_id            — Relatório de reconciliação
 * GET    /api/v1/reconciliation/unmatched                    — Transações desemparelhadas
 */

import express, { type Request, type Response } from "express";
import type Database from "better-sqlite3";
import { logger } from "../services/logger-service.js";
import type { AuthServiceDB } from "../domain/auth/auth-service-db.js";
import { criarMiddlewareAutenticacao } from "./auth-routes.js";
import { ReconciliationEngine } from "../domain/reconciliation/index.js";
import type { ReconciliationMatch, ReconciliationStatus } from "../domain/reconciliation/index.js";

interface AuthRequest extends Request {
  auth?: {
    usuario?: {
      id: string;
    };
  };
}

export interface ReconciliationRoutesDeps {
  db: Database.Database;
  authService: AuthServiceDB;
}

export function criarRotasReconciliacao({
  db,
  authService,
}: ReconciliationRoutesDeps): express.Router {
  const router = express.Router();
  const exigirAutenticacao = criarMiddlewareAutenticacao(authService);
  const engine = new ReconciliationEngine(db);

  /**
   * POST /api/v1/reconciliation/agents/:agente_id/match
   *
   * Executa o processo de matching para um agente no período especificado
   *
   * Query params:
   * - start_date: ISO date (2024-01-01)
   * - end_date: ISO date (2024-12-31)
   *
   * Response: ReconciliationStatus com resultado do matching
   */
  router.post(
    "/agents/:agente_id/match",
    exigirAutenticacao,
    async (req: AuthRequest, res: Response) => {
      try {
        const { agente_id } = req.params;
        const { start_date, end_date } = req.query;

        if (!start_date || !end_date) {
          return res.status(400).json({
            error: "Missing required query parameters: start_date, end_date",
          });
        }

        const userId = req.auth?.usuario?.id;

        const status = await engine.reconcileAgent(
          agente_id,
          start_date as string,
          end_date as string,
          userId
        );

        res.json(status);
      } catch (error) {
        logger.error("[Reconciliation] Match execution failed:", error);
        res.status(500).json({
          error:
            error instanceof Error
              ? error.message
              : "Failed to execute matching",
        });
      }
    }
  );

  /**
   * GET /api/v1/reconciliation/agents/:agente_id/status
   *
   * Retorna o status da reconciliação para um agente
   *
   * Query params:
   * - start_date: ISO date (opcional)
   * - end_date: ISO date (opcional)
   *
   * Response: ReconciliationStatus[]
   */
  router.get(
    "/agents/:agente_id/status",
    exigirAutenticacao,
    async (req: AuthRequest, res: Response) => {
      try {
        const { agente_id } = req.params;
        const { start_date, end_date } = req.query;

        let query = `SELECT * FROM reconciliation_status WHERE agente_id = ?`;
        const params: unknown[] = [agente_id];

        if (start_date) {
          query += ` AND period_start >= ?`;
          params.push(start_date);
        }

        if (end_date) {
          query += ` AND period_end <= ?`;
          params.push(end_date);
        }

        query += ` ORDER BY started_at DESC LIMIT 50`;

        const statuses = db.prepare(query).all(...params) as ReconciliationStatus[];

        res.json(statuses);
      } catch (error) {
        logger.error("[Reconciliation] Status retrieval failed:", error);
        res.status(500).json({ error: "Failed to retrieve status" });
      }
    }
  );

  /**
   * GET /api/v1/reconciliation/matches
   *
   * Lista matches com filtros opcionais
   *
   * Query params:
   * - agente_id: filtrar por agente
   * - status: PENDING|APPROVED|REJECTED|AUTO_MATCHED
   * - min_score: score mínimo (0-100)
   * - limit: máximo de resultados (default: 100)
   * - offset: paginação (default: 0)
   *
   * Response: { matches: ReconciliationMatch[], total: number }
   */
  router.get(
    "/matches",
    exigirAutenticacao,
    async (req: AuthRequest, res: Response) => {
      try {
        const { agente_id, status, min_score, limit = "100", offset = "0" } =
          req.query;

        let query = `SELECT * FROM reconciliation_matches WHERE 1=1`;
        const params: unknown[] = [];

        if (agente_id) {
          query += ` AND agente_id = ?`;
          params.push(agente_id);
        }

        if (status) {
          query += ` AND status = ?`;
          params.push(status);
        }

        if (min_score) {
          query += ` AND match_score >= ?`;
          params.push(Number(min_score));
        }

        // Count total
        const countStmt = db.prepare(
          query.replace("SELECT *", "SELECT COUNT(*) as count")
        );
        const { count } = countStmt.get(...params) as { count: number };

        // Get paginated results
        query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        params.push(Number(limit), Number(offset));

        const matches = db.prepare(query).all(...params) as ReconciliationMatch[];

        res.json({ matches, total: count });
      } catch (error) {
        logger.error("[Reconciliation] Matches retrieval failed:", error);
        res.status(500).json({ error: "Failed to retrieve matches" });
      }
    }
  );

  /**
   * GET /api/v1/reconciliation/matches/:match_id
   *
   * Retorna detalhes de um match específico
   *
   * Response: ReconciliationMatch
   */
  router.get(
    "/matches/:match_id",
    exigirAutenticacao,
    async (req: AuthRequest, res: Response) => {
      try {
        const { match_id } = req.params;

        const match = db
          .prepare(`SELECT * FROM reconciliation_matches WHERE id = ?`)
          .get(match_id) as ReconciliationMatch | undefined;

        if (!match) {
          return res.status(404).json({ error: "Match not found" });
        }

        res.json(match);
      } catch (error) {
        logger.error("[Reconciliation] Match retrieval failed:", error);
        res.status(500).json({ error: "Failed to retrieve match" });
      }
    }
  );

  /**
   * PUT /api/v1/reconciliation/matches/:match_id/approve
   *
   * Aprova um match
   *
   * Body: { notes?: string }
   *
   * Response: { success: boolean, message: string }
   */
  router.put(
    "/matches/:match_id/approve",
    exigirAutenticacao,
    async (req: AuthRequest, res: Response) => {
      try {
        const { match_id } = req.params;
        const { notes } = req.body;
        const userId = req.auth?.usuario?.id;

        if (!userId) {
          return res.status(401).json({ error: "Not authenticated" });
        }

        // Verify match exists
        const match = db
          .prepare(`SELECT * FROM reconciliation_matches WHERE id = ?`)
          .get(match_id) as ReconciliationMatch | undefined;

        if (!match) {
          return res.status(404).json({ error: "Match not found" });
        }

        await engine.approveMatch(match_id, userId, notes);

        res.json({
          success: true,
          message: "Match approved successfully",
        });
      } catch (error) {
        logger.error("[Reconciliation] Match approval failed:", error);
        res.status(500).json({ error: "Failed to approve match" });
      }
    }
  );

  /**
   * PUT /api/v1/reconciliation/matches/:match_id/reject
   *
   * Rejeita um match
   *
   * Body: { reason: string (required) }
   *
   * Response: { success: boolean, message: string }
   */
  router.put(
    "/matches/:match_id/reject",
    exigirAutenticacao,
    async (req: AuthRequest, res: Response) => {
      try {
        const { match_id } = req.params;
        const { reason } = req.body;
        const userId = req.auth?.usuario?.id;

        if (!userId) {
          return res.status(401).json({ error: "Not authenticated" });
        }

        if (!reason) {
          return res.status(400).json({ error: "Rejection reason is required" });
        }

        // Verify match exists
        const match = db
          .prepare(`SELECT * FROM reconciliation_matches WHERE id = ?`)
          .get(match_id) as ReconciliationMatch | undefined;

        if (!match) {
          return res.status(404).json({ error: "Match not found" });
        }

        await engine.rejectMatch(match_id, userId, reason);

        res.json({
          success: true,
          message: "Match rejected successfully",
        });
      } catch (error) {
        logger.error("[Reconciliation] Match rejection failed:", error);
        res.status(500).json({ error: "Failed to reject match" });
      }
    }
  );

  /**
   * GET /api/v1/reconciliation/report/:agente_id
   *
   * Gera relatório de reconciliação para um agente
   *
   * Query params:
   * - start_date: ISO date (required)
   * - end_date: ISO date (required)
   *
   * Response: ReconciliationReport
   */
  router.get(
    "/report/:agente_id",
    exigirAutenticacao,
    async (req: AuthRequest, res: Response) => {
      try {
        const { agente_id } = req.params;
        const { start_date, end_date } = req.query;

        if (!start_date || !end_date) {
          return res.status(400).json({
            error: "Missing required query parameters: start_date, end_date",
          });
        }

        const report = await engine.generateReport(
          agente_id,
          start_date as string,
          end_date as string
        );

        res.json(report);
      } catch (error) {
        logger.error("[Reconciliation] Report generation failed:", error);
        res.status(500).json({
          error: "Failed to generate report",
        });
      }
    }
  );

  /**
   * GET /api/v1/reconciliation/unmatched
   *
   * Lista transações desemparelhadas
   *
   * Query params:
   * - agente_id: filtrar por agente (required)
   * - start_date: ISO date (required)
   * - end_date: ISO date (required)
   * - type: ledger|source (opcional)
   *
   * Response: { unmatched_ledger: UnmatchedEntry[], unmatched_source: UnmatchedEntry[] }
   */
  router.get(
    "/unmatched",
    exigirAutenticacao,
    async (req: AuthRequest, res: Response) => {
      try {
        const { agente_id, start_date, end_date, type } = req.query;

        if (!agente_id || !start_date || !end_date) {
          return res.status(400).json({
            error:
              "Missing required query parameters: agente_id, start_date, end_date",
          });
        }

        const unmatched = await engine.detectUnmatchedTransactions(
          agente_id as string,
          start_date as string,
          end_date as string
        );

        if (type === "ledger") {
          return res.json({ unmatched_ledger: unmatched.unmatched_ledger });
        }

        if (type === "source") {
          return res.json({ unmatched_source: unmatched.unmatched_source });
        }

        res.json(unmatched);
      } catch (error) {
        logger.error("[Reconciliation] Unmatched retrieval failed:", error);
        res.status(500).json({ error: "Failed to retrieve unmatched transactions" });
      }
    }
  );

  return router;
}
