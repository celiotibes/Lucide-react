/**
 * Rotas HTTP para Sistema de Importação de Documentos
 * Fase 3: Validação e Deduplicação
 *
 * GET    /api/importacao/:loteId/linhas?status=pendente — Lista linhas de um lote
 * POST   /api/importacao/aprovar-linha/:linhaId         — Aprova uma linha
 * POST   /api/importacao/rejeitar-linha/:linhaId        — Rejeita uma linha
 */

import express, { type Request } from "express";
import Database from "better-sqlite3";
import { logger } from "../services/logger-service.js";
import type { AuthServiceDB } from "../domain/auth/auth-service-db.js";
import { criarMiddlewareAutenticacao } from "./auth-routes.js";
import { validarLinha } from "../domain/importacao/validacao.js";
import type { LinhaImportacao } from "../domain/importacao/tipos.js";
import {
  ListarLinhasQuerySchema as QuerySchema,
  AprovarLinhaSchema as AprovSchema,
  RejeitarLinhaSchema as RejSchema,
} from "../domain/importacao/tipos.js";

interface AuthRequest extends Request {
  auth?: {
    usuario?: {
      id: string;
    };
  };
}

export interface ImportacaoRoutesDeps {
  db: Database.Database;
  authService: AuthServiceDB;
}

export function criarRotasImportacao({
  db,
  authService,
}: ImportacaoRoutesDeps): express.Router {
  const router = express.Router();
  const exigirAutenticacao = criarMiddlewareAutenticacao(authService);

  /**
   * GET /api/importacao/:loteId/linhas
   *
   * Lista linhas de importação de um lote
   *
   * Query params:
   * - status: "pendente" | "validado" | "aprovado" | "rejeitado" (opcional)
   * - apenas_suspeitadas: "true" | "false" (opcional, default=false)
   * - offset: número (opcional, default=0)
   * - limit: número (opcional, default=100, max=1000)
   *
   * Resposta: RespostaListaLinhas
   */
  router.get("/:loteId/linhas", exigirAutenticacao, (req: AuthRequest, res) => {
    try {
      const { loteId } = req.params;

      // Validar query params
      const parseResult = QuerySchema.safeParse(req.query);
      if (!parseResult.success) {
        const issues = parseResult.error.issues;
        const mainIssue = issues[0];
        return res.status(400).json({
          erro: `Parâmetro inválido: ${mainIssue?.message}`,
          detalhes: issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        });
      }

      const { status, offset, limit, apenas_suspeitadas } = parseResult.data;

      // Verificar se lote pertence ao usuário
      const loteStmt = db.prepare(
        `SELECT id, usuario_id FROM importacao_lotes WHERE id = ?`
      );
      const lote = loteStmt.get(loteId) as {
        id: string;
        usuario_id: string;
      } | undefined;

      if (!lote) {
        return res.status(404).json({ erro: "Lote não encontrado" });
      }

      const userId = req.auth?.usuario?.id;
      if (lote.usuario_id !== userId) {
        return res.status(403).json({
          erro: "Acesso negado",
        });
      }

      // Construir query dinâmica
      let query = `SELECT * FROM importacao_linhas WHERE lote_id = ?`;
      const params: (string | number | undefined)[] = [loteId];

      if (status) {
        query += ` AND status = ?`;
        params.push(status);
      }

      if (apenas_suspeitadas) {
        query += ` AND suspeita_duplicata = 1`;
      }

      // Contar total
      const countResult = db.prepare(query).all(...params);
      const total = countResult.length;

      // Buscar com paginação
      query += ` ORDER BY numero_linha ASC LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const linhasStmt = db.prepare(query);
      const linhas = linhasStmt.all(...params) as LinhaImportacao[];

      // Formatar resposta
      const linhasFormatadas = linhas.map((linha) => {
        const erros = linha.erros_validacao
          ? JSON.parse(linha.erros_validacao)
          : [];

        return {
          ...linha,
          errosFormatados: erros,
          duplicataFormatada: linha.suspeita_duplicata
            ? {
                score: linha.score_duplicata,
                motivo: linha.motivo_duplicata,
              }
            : undefined,
        };
      });

      const resposta: RespostaListaLinhas = {
        total,
        linhas: linhasFormatadas,
      };

      res.json(resposta);
    } catch (erro) {
      logger.error("Erro ao listar linhas de importação:", {
        requestId: req.id,
        userId: (req.auth as unknown)?.usuario?.id,
        endpoint: req.path,
        error: erro instanceof Error ? erro.message : String(erro),
      });
      res.status(500).json({
        erro: "Falha ao listar linhas de importação",
      });
    }
  });

  /**
   * POST /api/importacao/aprovar-linha/:linhaId
   *
   * Aprova uma linha de importação
   *
   * Body:
   * {
   *   usuarioId: string (required),
   *   motivo: string (optional)
   * }
   *
   * Resposta:
   * {
   *   linhaId: string,
   *   status: "aprovado",
   *   aprovadoEm: ISO string,
   *   aprovadoPor: string
   * }
   */
  router.post("/aprovar-linha/:linhaId", exigirAutenticacao, (req: AuthRequest, res) => {
    try {
      const { linhaId } = req.params;

      // Validar body
      const parseResult = AprovSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          erro: "Dados inválidos",
          detalhes: parseResult.error.issues,
        });
      }

      const { usuarioId } = parseResult.data;

      // Verificar permissão
      const userId = req.auth?.usuario?.id;
      if (userId !== usuarioId) {
        return res.status(403).json({
          erro: "Acesso negado",
        });
      }

      // Buscar linha
      const linhaStmt = db.prepare(
        `SELECT * FROM importacao_linhas WHERE id = ?`
      );
      const linha = linhaStmt.get(linhaId) as LinhaImportacao | undefined;

      if (!linha) {
        return res.status(404).json({ erro: "Linha não encontrada" });
      }

      if (linha.usuario_id !== userId) {
        return res.status(403).json({ erro: "Acesso negado" });
      }

      if (linha.status !== "pendente" && linha.status !== "validado") {
        return res.status(400).json({
          erro: `Linha não pode ser aprovada (status: ${linha.status})`,
        });
      }

      // Validar novamente antes de aprovar
      const validacao = validarLinha(db, linha, userId);
      if (!validacao.valido) {
        return res.status(400).json({
          erro: "Linha não passou na validação",
          detalhes: validacao.erros,
        });
      }

      // Aprovar
      const updateStmt = db.prepare(
        `UPDATE importacao_linhas
         SET status = 'aprovado',
             aprovado_por = ?,
             aprovado_em = CURRENT_TIMESTAMP,
             atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ?`
      );

      updateStmt.run(usuarioId, linhaId);

      // Atualizar contadores do lote
      const updateLoteStmt = db.prepare(
        `UPDATE importacao_lotes
         SET linhas_aprovadas = linhas_aprovadas + 1,
             linhas_processadas = linhas_processadas + 1,
             atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ?`
      );

      updateLoteStmt.run(linha.lote_id);

      res.json({
        linhaId,
        status: "aprovado",
        aprovadoEm: new Date().toISOString(),
        aprovadoPor: usuarioId,
      });
    } catch (erro) {
      logger.error("Erro ao aprovar linha:", {
        requestId: req.id,
        userId: (req.auth as unknown)?.usuario?.id,
        endpoint: req.path,
        error: erro instanceof Error ? erro.message : String(erro),
      });
      res.status(500).json({
        erro: "Falha ao aprovar linha",
      });
    }
  });

  /**
   * POST /api/importacao/rejeitar-linha/:linhaId
   *
   * Rejeita uma linha de importação
   *
   * Body:
   * {
   *   usuarioId: string (required),
   *   motivo: string (required)
   * }
   *
   * Resposta:
   * {
   *   linhaId: string,
   *   status: "rejeitado",
   *   rejeitadoEm: ISO string,
   *   rejeitadoPor: string
   * }
   */
  router.post("/rejeitar-linha/:linhaId", exigirAutenticacao, (req: AuthRequest, res) => {
    try {
      const { linhaId } = req.params;

      // Validar body
      const parseResult = RejSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          erro: "Dados inválidos",
          detalhes: parseResult.error.issues,
        });
      }

      const { usuarioId, motivo } = parseResult.data;

      // Verificar permissão
      const userId = req.auth?.usuario?.id;
      if (userId !== usuarioId) {
        return res.status(403).json({
          erro: "Acesso negado",
        });
      }

      // Buscar linha
      const linhaStmt = db.prepare(
        `SELECT * FROM importacao_linhas WHERE id = ?`
      );
      const linha = linhaStmt.get(linhaId) as LinhaImportacao | undefined;

      if (!linha) {
        return res.status(404).json({ erro: "Linha não encontrada" });
      }

      if (linha.usuario_id !== userId) {
        return res.status(403).json({ erro: "Acesso negado" });
      }

      if (linha.status === "aprovado" || linha.status === "rejeitado") {
        return res.status(400).json({
          erro: `Linha não pode ser modificada (status: ${linha.status})`,
        });
      }

      // Rejeitar
      const updateStmt = db.prepare(
        `UPDATE importacao_linhas
         SET status = 'rejeitado',
             rejeitado_por = ?,
             rejeitado_em = CURRENT_TIMESTAMP,
             motivo_rejeicao = ?,
             atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ?`
      );

      updateStmt.run(usuarioId, motivo, linhaId);

      // Atualizar contadores do lote
      const updateLoteStmt = db.prepare(
        `UPDATE importacao_lotes
         SET linhas_rejeitadas = linhas_rejeitadas + 1,
             linhas_processadas = linhas_processadas + 1,
             atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ?`
      );

      updateLoteStmt.run(linha.lote_id);

      res.json({
        linhaId,
        status: "rejeitado",
        rejeitadoEm: new Date().toISOString(),
        rejeitadoPor: usuarioId,
      });
    } catch (erro) {
      logger.error("Erro ao rejeitar linha:", {
        requestId: req.id,
        userId: (req.auth as unknown)?.usuario?.id,
        endpoint: req.path,
        error: erro instanceof Error ? erro.message : String(erro),
      });
      res.status(500).json({
        erro: "Falha ao rejeitar linha",
      });
    }
  });

  return router;
}
