/**
 * Rotas HTTP de sugestão inteligente de categorias para transações — Fase 2.3
 *
 * Expõe o sistema de categorização baseado em histórico e keywords:
 * POST /api/transacoes/:id/sugerir-categoria — retorna sugestão com confiança
 */

import express from "express";
import type { Database } from "sql.js";
import { sugerirCategoria, registrarSugestaoCategoria } from "../domain/transacoes/categorizacaoInteligente.js";

export interface TransacoesRoutesDeps {
  db: Database;
}

export function criarRotasTransacoes({ db }: TransacoesRoutesDeps): express.Router {
  const router = express.Router();

  /**
   * POST /api/transacoes/:id/sugerir-categoria
   *
   * Retorna sugestão de categoria para uma transação baseado em histórico e keywords.
   *
   * Parâmetros:
   * - :id (path) — ID da transação
   * - forceKeywords (query, opcional) — se true, ignora histórico e usa só keywords
   *
   * Resposta:
   * {
   *   categoria: string (plano_conta_codigo sugerido),
   *   confianca: 0-100,
   *   motivo: string (explicação legível),
   *   historico_match?: { count: number, categoria: string }
   * }
   */
  router.post("/:id/sugerir-categoria", (req, res) => {
    try {
      const transacaoId = Number(req.params.id);
      if (!Number.isInteger(transacaoId) || transacaoId <= 0) {
        res.status(400).json({ erro: "ID da transação deve ser um número inteiro positivo" });
        return;
      }

      const sugestao = sugerirCategoria(db, transacaoId);

      // Registrar a sugestão no histórico (para auditoria e futuro aprendizado)
      registrarSugestaoCategoria(db, transacaoId, sugestao.categoria, sugestao.confianca, sugestao.motivo);

      res.json(sugestao);
    } catch (erro) {
      console.error("Erro ao sugerir categoria:", erro instanceof Error ? erro.message : String(erro));
      res.status(500).json({ erro: "Falha ao sugerir categoria" });
    }
  });

  return router;
}
