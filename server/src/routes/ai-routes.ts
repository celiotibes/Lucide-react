/**
 * Rotas HTTP para Claude AI Assistant
 * Endpoints para análise de transações, categorização e detecção de anomalias
 *
 * POST /api/ai/analyze-transaction — categoriza transação
 * POST /api/ai/categorize-receipt — analisa imagem de recibo
 * POST /api/ai/detect-anomaly — detecta anomalias
 * POST /api/ai/analyze-cash-flow — análise de fluxo de caixa
 * POST /api/ai/chat — chat interativo sobre finanças
 */

import express from "express";
import type Database from "better-sqlite3";
import { logger } from "../services/logger-service.js";
import { criarMiddlewareAutenticacao } from "./auth-routes.js";
import type { AuthServiceDB } from "../domain/auth/auth-service-db.js";
import {
  AnthropicAIService,
  getAnthropicService,
  type TransactionData,
  type CategorizationResult,
} from "../ai/anthropic-service.js";

export interface AIRoutesDeps {
  db: Database.Database;
  authService: AuthServiceDB;
  aiService?: AnthropicAIService;
}

export function criarRotasAI({ db, authService, aiService }: AIRoutesDeps): express.Router {
  const router = express.Router();
  const exigirAutenticacao = criarMiddlewareAutenticacao(authService);
  const aiSvc = aiService || getAnthropicService();

  /**
   * POST /api/ai/analyze-transaction
   *
   * Analisa uma transação e sugere categoria contábil
   * Usa histórico para melhorar precisão
   *
   * Body:
   * {
   *   transactionId?: number,
   *   descricao: string,
   *   valor: number,
   *   data: string (YYYY-MM-DD),
   *   tipo_fluxo: "entrada" | "saida",
   *   beneficiario?: string
   * }
   *
   * Resposta:
   * {
   *   categoria: string,
   *   confianca: 0-100,
   *   motivo: string,
   *   subcategorias_alternativas?: string[],
   *   flags?: string[]
   * }
   */
  router.post("/analyze-transaction", exigirAutenticacao, async (req, res) => {
    try {
      const {
        transactionId,
        descricao,
        valor,
        data,
        tipo_fluxo,
        beneficiario,
      } = req.body;

      // Validação básica
      if (!descricao || typeof valor !== "number" || !data || !tipo_fluxo) {
        res.status(400).json({
          erro: "Campos obrigatórios: descricao, valor, data, tipo_fluxo",
        });
        return;
      }

      const transaction: TransactionData = {
        id: transactionId,
        descricao,
        valor,
        data,
        tipo_fluxo,
        beneficiario,
      };

      // Busca histórico se transactionId foi fornecido
      let historicalContext: any = undefined;
      if (transactionId) {
        const stmt = db.prepare(`
          SELECT categoria, valor
          FROM transacoes
          WHERE id = ?
          LIMIT 1
        `);
        const existingTx = stmt.get(transactionId) as any;
        if (existingTx) {
          transaction.categoria_atual = existingTx.categoria;
        }

        // Busca categorias similares
        const similarStmt = db.prepare(`
          SELECT categoria, AVG(valor) as media_valor, COUNT(*) as count
          FROM transacoes
          WHERE categoria IS NOT NULL
          AND ABS(valor - ?) < ?
          AND DATE(data) > DATE('now', '-30 days')
          GROUP BY categoria
          ORDER BY count DESC
          LIMIT 5
        `);
        const similar = similarStmt.all(valor, valor * 0.5) as any[];
        historicalContext = {
          ultima_categoria: existingTx?.categoria,
          categorias_similares: similar.map((s) => s.categoria),
          media_valor_categoria: similar[0]?.media_valor,
        };
      }

      const result = await aiSvc.categorizeTransaction(transaction, historicalContext);

      // Grava análise no banco para auditoria
      const insertStmt = db.prepare(`
        INSERT INTO ia_analises (transacao_id, tipo_analise, resultado, confianca, tempo_execucao_ms)
        VALUES (?, ?, ?, ?, 0)
      `);
      insertStmt.run(
        transactionId || null,
        "categorization",
        JSON.stringify(result),
        result.confianca
      );

      logger.info("[AI] Transação analisada", {
        userId: (req.auth as any)?.usuario?.id,
        transactionId,
        categoria: result.categoria,
      });

      res.json(result);
    } catch (error) {
      logger.error("[AI] Erro ao analisar transação", {
        requestId: req.id,
        userId: (req.auth as any)?.usuario?.id,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(error instanceof Error && error.message.includes("ANTHROPIC") ? 503 : 500).json({
        erro: "Falha ao analisar transação",
      });
    }
  });

  /**
   * POST /api/ai/categorize-receipt
   *
   * Analisa imagem de recibo usando Claude Vision
   * Extrai dados estruturados (vendor, valor, itens, etc)
   *
   * Body:
   * {
   *   receiptImage: string (base64),
   *   mediaType?: "image/jpeg" | "image/png" (default: image/jpeg),
   *   description?: string (contexto adicional)
   * }
   *
   * Resposta:
   * {
   *   vendor: string,
   *   vendor_cnpj?: string,
   *   data: string,
   *   valor_total: number,
   *   categoria_primaria: string,
   *   confianca: 0-100,
   *   itens?: [{descricao, quantidade, valor_unitario, valor_total}],
   *   avisos: string[]
   * }
   */
  router.post("/categorize-receipt", exigirAutenticacao, async (req, res) => {
    try {
      const { receiptImage, mediaType = "image/jpeg", description } = req.body;

      if (!receiptImage) {
        res.status(400).json({ erro: "receiptImage é obrigatório (base64)" });
        return;
      }

      // Remove data:image/...;base64, se presente
      const cleanImage = receiptImage.includes(",")
        ? receiptImage.split(",")[1]
        : receiptImage;

      const receiptData = await aiSvc.analyzeReceipt(
        cleanImage,
        mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp"
      );

      logger.info("[AI] Recibo categorizado", {
        userId: (req.auth as any)?.usuario?.id,
        vendor: receiptData.vendor,
        valor: receiptData.valor_total,
        confianca: receiptData.confianca,
      });

      res.json(receiptData);
    } catch (error) {
      logger.error("[AI] Erro ao categorizar recibo", {
        requestId: req.id,
        userId: (req.auth as any)?.usuario?.id,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(error instanceof Error && error.message.includes("ANTHROPIC") ? 503 : 500).json({
        erro: "Falha ao analisar recibo",
      });
    }
  });

  /**
   * POST /api/ai/detect-anomaly
   *
   * Detecta anomalias em uma transação
   * Usa análise estatística + IA para identificar comportamentos inusitados
   *
   * Body:
   * {
   *   transactionId: number,
   *   descricao: string,
   *   valor: number,
   *   data: string,
   *   tipo_fluxo: "entrada" | "saida"
   * }
   *
   * Resposta:
   * {
   *   is_anomaly: boolean,
   *   anomaly_score: 0-100,
   *   detected_issues: [{type, severity, description, evidence}],
   *   recommendation: string,
   *   related_transactions?: number[]
   * }
   */
  router.post("/detect-anomaly", exigirAutenticacao, async (req, res) => {
    try {
      const { transactionId, descricao, valor, data, tipo_fluxo } = req.body;

      if (!descricao || typeof valor !== "number" || !data || !tipo_fluxo) {
        res.status(400).json({
          erro: "Campos obrigatórios: descricao, valor, data, tipo_fluxo",
        });
        return;
      }

      const transaction: TransactionData = {
        id: transactionId,
        descricao,
        valor,
        data,
        tipo_fluxo,
      };

      // Coleta dados históricos para análise
      const stmt = db.prepare(`
        SELECT COUNT(*) as count, AVG(valor) as media, MAX(valor) as maximo
        FROM transacoes
        WHERE categoria = (
          SELECT categoria FROM transacoes WHERE id = ? LIMIT 1
        )
        AND DATE(data) > DATE('now', '-30 days')
      `);
      const stats = stmt.get(transactionId) as any;

      // Busca transações relacionadas
      const relatedStmt = db.prepare(`
        SELECT id FROM transacoes
        WHERE categoria = (
          SELECT categoria FROM transacoes WHERE id = ? LIMIT 1
        )
        AND ABS(valor - ?) < ?
        AND id != ?
        AND DATE(data) > DATE('now', '-7 days')
        LIMIT 5
      `);
      const related = relatedStmt.all(transactionId, valor, valor * 0.3, transactionId) as any[];

      const historicalData = {
        transacoes_similares_ultimos_30d: stats?.count || 0,
        valor_medio_categoria: stats?.media,
        valor_maximo_categoria: stats?.maximo,
        desvio_padrao: null, // Simplificado para este MVP
        related_transactions: related.map((r) => r.id),
      };

      const anomalyResult = await aiSvc.detectAnomaly(transaction, historicalData);

      // Grava análise
      const insertStmt = db.prepare(`
        INSERT INTO ia_analises (transacao_id, tipo_analise, resultado, confianca)
        VALUES (?, ?, ?, ?)
      `);
      insertStmt.run(
        transactionId,
        "anomaly_detection",
        JSON.stringify(anomalyResult),
        anomalyResult.anomaly_score
      );

      logger.info("[AI] Anomalia detectada", {
        userId: (req.auth as any)?.usuario?.id,
        transactionId,
        isAnomaly: anomalyResult.is_anomaly,
        score: anomalyResult.anomaly_score,
      });

      res.json(anomalyResult);
    } catch (error) {
      logger.error("[AI] Erro ao detectar anomalia", {
        requestId: req.id,
        userId: (req.auth as any)?.usuario?.id,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(503).json({ erro: "Falha ao detectar anomalia" });
    }
  });

  /**
   * POST /api/ai/analyze-cash-flow
   *
   * Analisa fluxo de caixa e fornece recomendações
   * Identifica padrões, sazonalidade e oportunidades
   *
   * Query:
   * - desde: YYYY-MM-DD
   * - ate: YYYY-MM-DD
   *
   * Resposta:
   * {
   *   periodo: string,
   *   receita_media_mensal: number,
   *   despesa_media_mensal: number,
   *   margem_liquida: number,
   *   sazonalidade: {detectada, picos, vales},
   *   oportunidades: [{tipo, descricao, impacto_estimado, prioridade}],
   *   alertas: [{tipo, mensagem}],
   *   score_saude_financeira: 0-100
   * }
   */
  router.post("/analyze-cash-flow", exigirAutenticacao, async (req, res) => {
    try {
      const { desde, ate } = req.body;

      if (!desde || !ate) {
        res.status(400).json({
          erro: "Campos obrigatórios: desde (YYYY-MM-DD), ate (YYYY-MM-DD)",
        });
        return;
      }

      // Busca todas as transações no período
      const stmt = db.prepare(`
        SELECT id, descricao, valor, data, tipo_fluxo, beneficiario, categoria
        FROM transacoes
        WHERE DATE(data) >= ? AND DATE(data) <= ?
        ORDER BY data DESC
        LIMIT 500
      `);
      const txs = stmt.all(desde, ate) as any[];

      if (txs.length === 0) {
        res.status(400).json({ erro: "Nenhuma transação no período informado" });
        return;
      }

      const transactions: TransactionData[] = txs.map((tx) => ({
        id: tx.id,
        descricao: tx.descricao,
        valor: tx.valor,
        data: tx.data,
        tipo_fluxo: tx.tipo_fluxo,
        beneficiario: tx.beneficiario,
      }));

      const cashFlowAnalysis = await aiSvc.analyzeCashFlow(transactions, {
        desde,
        ate,
      });

      logger.info("[AI] Fluxo de caixa analisado", {
        userId: (req.auth as any)?.usuario?.id,
        periodo: `${desde} a ${ate}`,
        txCount: transactions.length,
        score: cashFlowAnalysis.score_saude_financeira,
      });

      res.json(cashFlowAnalysis);
    } catch (error) {
      logger.error("[AI] Erro ao analisar fluxo", {
        requestId: req.id,
        userId: (req.auth as any)?.usuario?.id,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(503).json({ erro: "Falha ao analisar fluxo de caixa" });
    }
  });

  /**
   * POST /api/ai/chat
   *
   * Chat interativo sobre finanças
   * Permite perguntas livres com contexto contábil
   *
   * Body:
   * {
   *   query: string,
   *   conversationId?: string,
   *   conversationHistory?: [{role, content}]
   * }
   *
   * Resposta:
   * {
   *   response: string,
   *   conversationId: string,
   *   suggestions: string[]
   * }
   */
  router.post("/chat", exigirAutenticacao, async (req, res) => {
    try {
      const { query, conversationId, conversationHistory } = req.body;

      if (!query || typeof query !== "string") {
        res.status(400).json({ erro: "Campo obrigatório: query (string)" });
        return;
      }

      const response = await aiSvc.financialChat(query, conversationHistory);

      const finalConversationId = conversationId || `conv_${Date.now()}`;

      logger.info("[AI] Chat respondido", {
        userId: (req.auth as any)?.usuario?.id,
        conversationId: finalConversationId,
        queryLength: query.length,
      });

      res.json({
        response,
        conversationId: finalConversationId,
        suggestions: [
          "Qual é minha margem líquida?",
          "Há anomalias em minhas despesas?",
          "Como otimizar meus gastos?",
        ],
      });
    } catch (error) {
      logger.error("[AI] Erro no chat", {
        requestId: req.id,
        userId: (req.auth as any)?.usuario?.id,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(503).json({ erro: "Falha ao processar pergunta" });
    }
  });

  return router;
}
