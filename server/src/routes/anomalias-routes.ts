/**
 * Rotas HTTP para Sistema de Detecção de Anomalias em Fluxo de Caixa
 *
 * POST   /api/anomalias/analisar/:transacaoId   — Análise manual de uma transação
 * GET    /api/anomalias/alertas                 — Lista alertas (com filtros)
 * GET    /api/anomalias/estatisticas            — Estatísticas e métricas
 * PATCH  /api/anomalias/alertas/:id/revisar     — Marca alerta como revisado
 */

import express from "express";
import { z } from "zod";
import { logger } from '../services/logger-service.js';
import Database from "better-sqlite3";
import type { AuthServiceDB } from "../domain/auth/auth-service-db.js";
import { criarMiddlewareAutenticacao } from "./auth-routes.js";
import {
  avaliarAnomaliaAgregada,
  registrarAlertaAnomalia,
  listarAlertas,
  obterAlerta,
  obterEstatisticasAnomalias,
  marcarAnomaliaRevisada,
  atualizarAnomalia,
} from "../domain/anomalias/detectores-anomalias.js";

// Zod validation schemas
const analisarQuerySchema = z.object({
  valor: z.coerce.number().finite().positive(),
  periodo_dias: z.coerce.number().int().min(1).max(365).optional().default(90),
}).strict();

const alertasQuerySchema = z.object({
  severidade: z.enum(['baixa', 'media', 'critica']).optional(),
  dias: z.coerce.number().int().min(1).max(365).optional().default(30),
  revisado: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  limite: z.coerce.number().int().min(1).max(1000).optional().default(100),
}).strict();

export interface AnomalasRoutesDeps {
  db: Database.Database;
  authService: AuthServiceDB;
}

export function criarRotasAnomalias({ db, authService }: AnomalasRoutesDeps): express.Router {
  const router = express.Router();
  const exigirAutenticacao = criarMiddlewareAutenticacao(authService);

  /**
   * POST /api/anomalias/analisar/:transacaoId
   *
   * Análise manual de uma transação específica (trigger pode ser manual ou automático)
   * Retorna resultado agregado dos 3 métodos.
   *
   * Query params:
   * - valor: number (obrigatório) — valor da transação
   * - periodo_dias: number (opcional, default=90) — período de histórico para análise
   *
   * Resposta:
   * {
   *   transacao_id: string,
   *   severidade: "baixa" | "media" | "critica",
   *   confianca: 0-100,
   *   metodos_dispararam: string[],
   *   scores_individuais: { sigma_2, iqr, percentil },
   *   alerta_id: string (se persistido),
   *   descricao: string
   * }
   */
  router.post("/analisar/:transacaoId", exigirAutenticacao, (req, res) => {
    try {
      const { transacaoId } = req.params;

      // Validate query params with Zod
      const parseResult = analisarQuerySchema.safeParse(req.query);
      if (!parseResult.success) {
        return res.status(400).json({
          erro: "Parâmetros de query inválidos",
          detalhes: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        });
      }

      const { valor, periodo_dias } = parseResult.data;

      // Analisa
      const resultado = avaliarAnomaliaAgregada(db, valor, periodo_dias);

      // Registra se severidade >= média
      let alerta_id: string | null = null;
      if (resultado.severidade !== "baixa") {
        const alerta = registrarAlertaAnomalia(db, transacaoId, resultado, null);
        alerta_id = alerta.id;
      }

      res.json({
        transacao_id: transacaoId,
        severidade: resultado.severidade,
        confianca: resultado.confianca,
        metodos_dispararam: resultado.metodos_dispararam,
        scores_individuais: resultado.scores_individuais,
        alerta_id,
        descricao: gerarDescricaoResposta(resultado),
      });
    } catch (erro) {
      logger.error("Erro ao analisar anomalia:", {
        requestId: (req as any).id || "unknown",
        userId: (req.auth as any)?.usuario?.id,
        endpoint: req.path,
        transacaoId,
        error: erro instanceof Error ? erro.message : String(erro),
      });
      return res.status(500).json({ erro: "Falha ao analisar anomalia" });
    }
  });

  /**
   * GET /api/anomalias/alertas
   *
   * Lista alertas registrados com filtros opcionais
   *
   * Query params:
   * - severidade: "baixa" | "media" | "critica" (opcional)
   * - dias: number (opcional, default=30) — últimos N dias
   * - revisado: boolean (opcional) — true/false para filtrar por status de revisão
   * - limite: number (opcional, default=100) — máximo de resultados
   *
   * Resposta:
   * {
   *   alertas: AlertaAnomalia[],
   *   total: number,
   *   filtros: { severidade?, dias?, revisado?, limite? }
   * }
   */
  router.get("/alertas", exigirAutenticacao, (req, res) => {
    try {
      // Validate query params with Zod
      const parseResult = alertasQuerySchema.safeParse(req.query);
      if (!parseResult.success) {
        return res.status(400).json({
          erro: "Parâmetros de query inválidos",
          detalhes: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        });
      }

      const { severidade, dias, revisado, limite } = parseResult.data;

      const opcoes: any = {
        limite,
      };

      if (severidade) {
        opcoes.severidade = severidade;
      }

      if (dias) {
        opcoes.dias = dias;
      }

      if (revisado !== undefined) {
        opcoes.revisado = String(revisado) === "true";
      }

      const alertas = listarAlertas(db, opcoes);

      res.json({
        alertas,
        total: alertas.length,
        filtros: {
          severidade: opcoes.severidade,
          dias: opcoes.dias,
          revisado: opcoes.revisado,
          limite: opcoes.limite,
        },
      });
    } catch (erro) {
      logger.error("Erro ao listar alertas:", {
        requestId: (req as any).id || "unknown",
        userId: (req.auth as any)?.usuario?.id,
        endpoint: req.path,
        error: erro instanceof Error ? erro.message : String(erro),
      });
      return res.status(500).json({ erro: "Falha ao listar alertas" });
    }
  });

  /**
   * GET /api/anomalias/estatisticas
   *
   * Retorna estatísticas agregadas de anomalias detectadas
   *
   * Query params:
   * - dias: number (opcional, default=30) — período analisado
   *
   * Resposta:
   * {
   *   total: number,
   *   criticas: number,
   *   medias: number,
   *   baixas: number,
   *   revisadas: number,
   *   taxa_revisao: number (%), // percentual de alertas revisados
   *   periodo_dias: number
   * }
   */
  router.get("/estatisticas", exigirAutenticacao, (req, res) => {
    try {
      const { dias } = req.query;
      const periodo = dias ? Math.max(1, Math.min(365, Number(dias))) : 30;

      const stats = obterEstatisticasAnomalias(db, periodo);

      res.json({
        ...stats,
        periodo_dias: periodo,
      });
    } catch (erro) {
      logger.error("Erro ao obter estatísticas:", {
        requestId: (req as any).id || "unknown",
        userId: (req.auth as any)?.usuario?.id,
        endpoint: req.path,
        error: erro instanceof Error ? erro.message : String(erro),
      });
      return res.status(500).json({ erro: "Falha ao obter estatísticas" });
    }
  });

  /**
   * PATCH /api/anomalias/alertas/:id/revisar
   *
   * Marca um alerta como revisado (auditoria + feedback humano)
   *
   * Body:
   * {
   *   usuario_id: string,
   *   motivo: string (ex: "falso positivo", "confirmado fraude", "ação tomada")
   * }
   *
   * Resposta:
   * {
   *   alerta_id: string,
   *   revisado: 1,
   *   revisado_em: ISO8601,
   *   motivo: string
   * }
   */
  router.patch("/alertas/:id/revisar", exigirAutenticacao, (req, res) => {
    try {
      const { id } = req.params;
      const { usuario_id, motivo } = req.body;

      // Validação
      if (!usuario_id || !motivo) {
        return res.status(400).json({ erro: "usuario_id e motivo são obrigatórios" });
      }

      // Verifica se alerta existe
      const alerta = obterAlerta(db, id);
      if (!alerta) {
        return res.status(404).json({ erro: "Alerta não encontrado" });
      }

      if (alerta.revisado === 1) {
        return res.status(400).json({ erro: "Alerta já foi revisado" });
      }

      // Marca como revisado
      marcarAnomaliaRevisada(db, id, usuario_id, motivo);

      res.json({
        alerta_id: id,
        revisado: 1,
        revisado_em: new Date().toISOString(),
        motivo,
      });
    } catch (erro) {
      logger.error("Erro ao revisar anomalia:", {
        requestId: (req as any).id || "unknown",
        userId: (req.auth as any)?.usuario?.id,
        endpoint: req.path,
        alertId: req.params.id,
        error: erro instanceof Error ? erro.message : String(erro),
      });
      return res.status(500).json({ erro: "Falha ao revisar anomalia" });
    }
  });

  /**
   * PUT /api/anomalias/:id
   *
   * Atualiza um alerta de anomalia (severidade e/ou descrição)
   *
   * Body:
   * {
   *   severidade?: "baixa" | "media" | "critica",
   *   descricao?: string
   * }
   *
   * Resposta:
   * {
   *   id: string,
   *   severidade: string,
   *   confianca: number,
   *   descricao: string,
   *   criado_em: ISO8601
   * }
   */
  router.put("/:id", exigirAutenticacao, (req, res) => {
    try {
      const { id } = req.params;
      const { severidade, descricao } = req.body ?? {};

      // Validação: pelo menos um campo deve ser fornecido
      if (severidade === undefined && descricao === undefined) {
        return res.status(400).json({ erro: "Forneça pelo menos um campo para atualizar (severidade, descricao)" });
      }

      // Valida severidade se fornecida
      if (severidade !== undefined && !["baixa", "media", "critica"].includes(severidade)) {
        return res.status(400).json({
          erro: "severidade inválida — use um de: baixa, media, critica",
        });
      }

      // Verifica se alerta existe
      const alertaAntes = obterAlerta(db, id);
      if (!alertaAntes) {
        return res.status(404).json({ erro: "Alerta não encontrado" });
      }

      // Atualiza
      const alertaAtualizado = atualizarAnomalia(db, id, {
        severidade: severidade !== undefined ? severidade : undefined,
        descricao: descricao !== undefined ? descricao : undefined,
      });

      if (!alertaAtualizado) {
        return res.status(404).json({ erro: "Alerta não encontrado após atualização" });
      }

      res.json({
        id: alertaAtualizado.id,
        transacao_id: alertaAtualizado.transacao_id,
        severidade: alertaAtualizado.severidade,
        confianca: alertaAtualizado.confianca,
        descricao: alertaAtualizado.descricao,
        revisado: alertaAtualizado.revisado,
        criado_em: alertaAtualizado.criado_em,
      });
    } catch (erro) {
      logger.error("Erro ao atualizar anomalia:", {
        requestId: (req as any).id || "unknown",
        userId: (req.auth as any)?.usuario?.id,
        endpoint: req.path,
        alertId: id,
        error: erro instanceof Error ? erro.message : String(erro),
      });
      return res.status(500).json({ erro: "Falha ao atualizar anomalia" });
    }
  });

  return router;
}

// ============================================================
// HELPER: Gera descrição amigável da resposta
// ============================================================

function gerarDescricaoResposta(resultado: any): string {
  const { severidade, confianca, metodos_dispararam } = resultado;

  let desc = "";

  if (severidade === "critica") {
    desc = `CRÍTICA: ${metodos_dispararam.length} métodos concordam de que esta transação é anomalosa (confiança: ${confianca}%)`;
  } else if (severidade === "media") {
    desc = `MÉDIA: ${metodos_dispararam.length} método(s) detectou(aram) anomalia (confiança: ${confianca}%)`;
  } else {
    desc = `BAIXA: Possível anomalia, mas com baixa confiança (${confianca}%)`;
  }

  if (resultado.scores_individuais.sigma_2) {
    desc += ` [2-Sigma: z=${resultado.scores_individuais.sigma_2.z_score.toFixed(2)}]`;
  }
  if (resultado.scores_individuais.iqr) {
    desc += ` [IQR: ${resultado.scores_individuais.iqr.confianca}% acima limite]`;
  }
  if (resultado.scores_individuais.percentil) {
    desc += ` [P${resultado.scores_individuais.percentil.percentil}: ${resultado.scores_individuais.percentil.confianca}%]`;
  }

  return desc;
}
