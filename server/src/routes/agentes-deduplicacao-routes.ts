/**
 * Rotas para sistema de deduplicação de agentes econômicos
 *
 * Endpoints:
 * - GET /api/v1/agentes/:id/duplicatas — Buscar duplicatas suspeitas de um agente
 * - GET /api/v1/agentes/duplicatas/review — Fila de duplicatas para análise manual
 * - POST /api/v1/agentes/:id1/merge/:id2 — Fundir dois agentes
 * - PUT /api/v1/agentes/duplicatas/:id/approve — Aprovar merge
 * - PUT /api/v1/agentes/duplicatas/:id/reject — Rejeitar duplicata
 * - POST /api/v1/agentes/duplicatas/:id/unmerge — Desfazer merge
 * - GET /api/v1/agentes/duplicatas/stats — Estatísticas de duplicatas
 */

import express from "express";
import type Database from "better-sqlite3";
import {
  AgentesDeduplicacaoService,
  TransacoesDeduplicacaoService,
  type MergeAgentRequest,
} from "../domain/erp/agentes-deduplicacao.js";
import { validateUUID, requireAuth } from "../middleware/auth.js";
import { handleError } from "../utils/error-handler.js";

export function setupAgentesDeduplicacaoRoutes(
  app: express.Express,
  db: Database
): void {
  const deduplicacaoService = new AgentesDeduplicacaoService(db);
  const transacoesService = new TransacoesDeduplicacaoService(db);

  /**
   * GET /api/v1/agentes/:id/duplicatas
   * Buscar duplicatas suspeitas de um agente específico
   */
  app.get(
    "/api/v1/agentes/:id/duplicatas",
    requireAuth,
    validateUUID("id"),
    (req, res) => {
      try {
        const { id } = req.params;
        const usuarioId = req.user?.id;

        if (!usuarioId) {
          return res.status(401).json({ error: "Usuário não autenticado" });
        }

        const candidatos =
          deduplicacaoService.detectarDuplicatasAgente(id, usuarioId);

        return res.json({
          agente_id: id,
          total: candidatos.length,
          candidatos,
        });
      } catch (erro) {
        return handleError(res, erro, "Erro ao buscar duplicatas do agente");
      }
    }
  );

  /**
   * GET /api/v1/agentes/duplicatas/review
   * Buscar duplicatas para análise manual (review queue)
   * Query params:
   * - status: 'pendente' | 'confirmada' (default: 'pendente')
   * - limit: número máximo de resultados (default: 50)
   */
  app.get(
    "/api/v1/agentes/duplicatas/review",
    requireAuth,
    (req, res) => {
      try {
        const status = (
          req.query.status ||
          "pendente"
        ).toLowerCase() as
          | "pendente"
          | "confirmada";
        const limite = Math.min(parseInt(req.query.limit as string) || 50, 100);

        if (
          status !== "pendente" &&
          status !== "confirmada"
        ) {
          return res.status(400).json({
            error: "Status inválido. Use 'pendente' ou 'confirmada'",
          });
        }

        const duplicatas =
          deduplicacaoService.buscarDuplicatasParaRevisao(
            status,
            limite
          );

        return res.json({
          status,
          total: duplicatas.length,
          duplicatas,
        });
      } catch (erro) {
        return handleError(res, erro, "Erro ao buscar duplicatas para revisão");
      }
    }
  );

  /**
   * POST /api/v1/agentes/:id1/merge/:id2
   * Fundir dois agentes (merge)
   * Body:
   * {
   *   "motivo": "razão do merge",
   *   "detalhes": { ... } // opcional
   * }
   */
  app.post(
    "/api/v1/agentes/:id1/merge/:id2",
    requireAuth,
    validateUUID("id1"),
    validateUUID("id2"),
    (req, res) => {
      try {
        const { id1: agente_primario_id, id2: agente_duplicado_id } =
          req.params;
        const usuarioId = req.user?.id;
        const { motivo, detalhes } = req.body;

        if (!usuarioId) {
          return res.status(401).json({ error: "Usuário não autenticado" });
        }

        if (!motivo || typeof motivo !== "string") {
          return res
            .status(400)
            .json({ error: "Campo 'motivo' é obrigatório" });
        }

        if (agente_primario_id === agente_duplicado_id) {
          return res.status(400).json({
            error: "Não é possível fundir um agente com ele mesmo",
          });
        }

        const request: MergeAgentRequest = {
          agente_primario_id,
          agente_duplicado_id,
          motivo,
          detalhes,
        };

        const resultado = deduplicacaoService.fundirAgentes(
          request,
          usuarioId
        );

        return res.status(201).json({
          sucesso: true,
          resultado,
        });
      } catch (erro) {
        return handleError(res, erro, "Erro ao fundir agentes");
      }
    }
  );

  /**
   * PUT /api/v1/agentes/duplicatas/:id/approve
   * Aprovar uma duplicata suspeita
   * Body:
   * {
   *   "decisao": "descrição da decisão"
   * }
   */
  app.put(
    "/api/v1/agentes/duplicatas/:id/approve",
    requireAuth,
    validateUUID("id"),
    (req, res) => {
      try {
        const { id } = req.params;
        const usuarioId = req.user?.id;
        const { decisao } = req.body;

        if (!usuarioId) {
          return res.status(401).json({ error: "Usuário não autenticado" });
        }

        if (!decisao || typeof decisao !== "string") {
          return res.status(400).json({
            error: "Campo 'decisao' é obrigatório",
          });
        }

        deduplicacaoService.aprovarDuplicata(id, usuarioId, decisao);

        return res.json({
          sucesso: true,
          mensagem: "Duplicata aprovada com sucesso",
          duplicata_id: id,
        });
      } catch (erro) {
        return handleError(res, erro, "Erro ao aprovar duplicata");
      }
    }
  );

  /**
   * PUT /api/v1/agentes/duplicatas/:id/reject
   * Rejeitar uma duplicata suspeita
   * Body:
   * {
   *   "motivo": "razão da rejeição"
   * }
   */
  app.put(
    "/api/v1/agentes/duplicatas/:id/reject",
    requireAuth,
    validateUUID("id"),
    (req, res) => {
      try {
        const { id } = req.params;
        const usuarioId = req.user?.id;
        const { motivo } = req.body;

        if (!usuarioId) {
          return res.status(401).json({ error: "Usuário não autenticado" });
        }

        if (!motivo || typeof motivo !== "string") {
          return res.status(400).json({
            error: "Campo 'motivo' é obrigatório",
          });
        }

        deduplicacaoService.rejeitarDuplicata(id, usuarioId, motivo);

        return res.json({
          sucesso: true,
          mensagem: "Duplicata rejeitada com sucesso",
          duplicata_id: id,
        });
      } catch (erro) {
        return handleError(res, erro, "Erro ao rejeitar duplicata");
      }
    }
  );

  /**
   * POST /api/v1/agentes/duplicatas/:id/unmerge
   * Desfazer um merge anterior
   */
  app.post(
    "/api/v1/agentes/duplicatas/:id/unmerge",
    requireAuth,
    validateUUID("id"),
    (req, res) => {
      try {
        const { id } = req.params;
        const usuarioId = req.user?.id;

        if (!usuarioId) {
          return res.status(401).json({ error: "Usuário não autenticado" });
        }

        const resultado = deduplicacaoService.desfazerMerge(id, usuarioId);

        return res.json({
          sucesso: true,
          resultado,
        });
      } catch (erro) {
        return handleError(res, erro, "Erro ao desfazer merge");
      }
    }
  );

  /**
   * GET /api/v1/agentes/duplicatas/stats
   * Obter estatísticas sobre duplicatas
   */
  app.get("/api/v1/agentes/duplicatas/stats", requireAuth, (req, res) => {
    try {
      const stmt = db.prepare(
        `SELECT
          status,
          COUNT(*) as total,
          ROUND(AVG(score), 2) as score_medio,
          MAX(score) as score_maximo,
          MIN(score) as score_minimo
        FROM agentes_duplicatas_suspeitas
        GROUP BY status`
      );

      const stats = stmt.all() as unknown[];

      // Total de agentes
      const totalAgentes = db
        .prepare("SELECT COUNT(*) as total FROM agentes_economicos WHERE ativo = true")
        .get() as { total: number };

      // Agentes com duplicatas confirmadas
      const agentesComMerges = db
        .prepare(
          `SELECT COUNT(DISTINCT agente_id_1) as total
           FROM agentes_duplicatas_suspeitas
           WHERE status = 'mesclada'`
        )
        .get() as { total: number };

      return res.json({
        estatisticas: {
          total_agentes_ativos: totalAgentes.total,
          total_agentes_com_merges: agentesComMerges.total,
          duplicatas_por_status: stats,
        },
      });
    } catch (erro) {
      return handleError(res, erro, "Erro ao obter estatísticas de duplicatas");
    }
  });

  /**
   * GET /api/v1/agentes/duplicatas/scan
   * Executar scan completo de duplicatas no sistema
   * Query params:
   * - score_minimo: score mínimo para reportar (default: 70)
   * - salvar: se deve salvar resultados (default: true)
   */
  app.get(
    "/api/v1/agentes/duplicatas/scan",
    requireAuth,
    (req, res) => {
      try {
        const scoreMinimo = Math.min(
          Math.max(parseInt(req.query.score_minimo as string) || 70, 0),
          100
        );
        const salvar = (req.query.salvar as string) !== "false";
        const usuarioId = req.user?.id;

        if (!usuarioId) {
          return res.status(401).json({ error: "Usuário não autenticado" });
        }

        // Executar scan
        const duplicatasEncontradas = deduplicacaoService.detectarTodasDuplicatas(
          usuarioId,
          scoreMinimo
        );

        let totalRegistradas = 0;

        // Salvar resultados se solicitado
        if (salvar) {
          const stmt = db.prepare(
            `INSERT INTO agentes_duplicatas_suspeitas (
              agente_id_1, agente_id_2, score, motivo, status, criado_por, criado_em
            ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT DO NOTHING`
          );

          for (const [agenteId, candidatos] of duplicatasEncontradas) {
            for (const candidato of candidatos) {
              try {
                stmt.run(
                  agenteId,
                  candidato.agente_id_2,
                  candidato.score,
                  candidato.motivos[0] || "Duplicata potencial",
                  "pendente",
                  usuarioId
                );
                totalRegistradas++;
              } catch (
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                _e
              ) {
                // Ignorar conflitos
              }
            }
          }
        }

        return res.json({
          score_minimo: scoreMinimo,
          total_pares_encontrados: duplicatasEncontradas.size,
          total_registradas_bd: totalRegistradas,
          duplicatas: Array.from(duplicatasEncontradas.entries()).map(
            ([agenteId, candidatos]) => ({
              agente_id: agenteId,
              total_candidatos: candidatos.length,
              candidatos: candidatos.slice(0, 5), // Top 5
            })
          ),
        });
      } catch (erro) {
        return handleError(res, erro, "Erro ao executar scan de duplicatas");
      }
    }
  );

  /**
   * GET /api/v1/transacoes/duplicatas
   * Buscar possíveis transações duplicadas
   * Query params:
   * - usuario_id: ID do usuário (obrigatório)
   * - limite: número máximo de resultados (default: 50)
   */
  app.get(
    "/api/v1/transacoes/duplicatas",
    requireAuth,
    (req, res) => {
      try {
        const usuarioId = req.query.usuario_id as string;
        const limite = Math.min(
          parseInt(req.query.limite as string) || 50,
          100
        );

        if (!usuarioId) {
          return res
            .status(400)
            .json({ error: "Parâmetro 'usuario_id' é obrigatório" });
        }

        // Buscar transações duplicadas
        const stmt = db.prepare(
          `SELECT
            d.id,
            d.ledger_entrada_1_id,
            l1.data as data_1,
            l1.valor as valor_1,
            l1.descricao as descricao_1,
            d.ledger_entrada_2_id,
            l2.data as data_2,
            l2.valor as valor_2,
            l2.descricao as descricao_2,
            d.score,
            d.status,
            d.criado_em
          FROM ledger_entries_duplicatas d
          JOIN ledger_entries l1 ON d.ledger_entrada_1_id = l1.id
          JOIN ledger_entries l2 ON d.ledger_entrada_2_id = l2.id
          WHERE l1.usuario_id = ?
          AND d.status = 'pendente'
          ORDER BY d.score DESC
          LIMIT ?`
        );

        const duplicatas = stmt.all(usuarioId, limite) as unknown[];

        return res.json({
          usuario_id: usuarioId,
          total: duplicatas.length,
          duplicatas,
        });
      } catch (erro) {
        return handleError(res, erro, "Erro ao buscar transações duplicadas");
      }
    }
  );

  /**
   * POST /api/v1/transacoes/check-duplicata
   * Verificar se uma nova transação é duplicata
   * Body:
   * {
   *   "valor": 100.50,
   *   "data": "2024-10-07",
   *   "descricao": "Pagamento fornecedor X",
   *   "agente_id": "uuid" (opcional),
   *   "janela_dias": 3 (opcional, default: 3)
   * }
   */
  app.post(
    "/api/v1/transacoes/check-duplicata",
    requireAuth,
    (req, res) => {
      try {
        const usuarioId = req.user?.id;
        const {
          valor,
          data,
          descricao,
          agente_id,
          janela_dias,
        } = req.body;

        if (!usuarioId) {
          return res.status(401).json({ error: "Usuário não autenticado" });
        }

        if (
          !valor ||
          typeof valor !== "number" ||
          valor <= 0
        ) {
          return res.status(400).json({
            error: "Campo 'valor' deve ser um número positivo",
          });
        }

        if (!data || typeof data !== "string") {
          return res.status(400).json({
            error: "Campo 'data' é obrigatório (formato: YYYY-MM-DD)",
          });
        }

        if (!descricao || typeof descricao !== "string") {
          return res.status(400).json({
            error: "Campo 'descricao' é obrigatório",
          });
        }

        const resultado = transacoesService.isDuplicate(
          {
            agente_id,
            valor,
            data,
            descricao,
          },
          usuarioId,
          janela_dias || 3
        );

        return res.json({
          is_duplicate: resultado.isDuplicate,
          score: resultado.score,
          transacao_id: resultado.transacao_id,
          motivo: resultado.motivo,
        });
      } catch (erro) {
        return handleError(res, erro, "Erro ao verificar duplicata");
      }
    }
  );
}
