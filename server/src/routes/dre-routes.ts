/**
 * Rotas HTTP para DRE (Demonstração de Resultado do Exercício).
 *
 * Opção A: On-The-Fly (real-time) — GET /api/relatorios/dre?dataInicio=YYYY-MM-DD&dataFim=YYYY-MM-DD
 * Opção B: Histórico (gravado 1x/dia) — POST /api/relatorios/dre/calcular, GET /api/relatorios/dre/historico
 *
 * Requer autenticação Bearer (middleware de authService).
 */

import express from "express";
import type { AuthServiceDB } from "../domain/auth/auth-service-db.js";
import type Database from "better-sqlite3";
import { criarMiddlewareAutenticacao } from "./auth-routes.js";
import { calcularDREPeriodo, gravarDREPeriodo, buscarDREPeriodo, listarDREPeriodos } from "../domain/relatorios/dre.js";

export interface RelatoriosRoutesDeps {
  authService: AuthServiceDB;
  db?: Database.Database;
}

// Cache simples em memória: key = "dre:${dataInicio}:${dataFim}", value = { resultado, timestamp }
const dreCache = new Map<string, { resultado: any; timestamp: number }>();
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hora

export function criarRotasRelatorios(deps: RelatoriosRoutesDeps): express.Router {
  const router = express.Router();
  const { authService, db } = deps;

  // Middleware: autenticação Bearer
  router.use(criarMiddlewareAutenticacao(authService));

  /**
   * GET /api/relatorios/dre
   *
   * Opção A: Calcula DRE on-the-fly para período [dataInicio, dataFim].
   * Cache: 1 hora (para não recalcular constantemente mesmo período).
   *
   * Query params:
   *   - dataInicio: YYYY-MM-DD (obrigatório)
   *   - dataFim: YYYY-MM-DD (obrigatório)
   *
   * Response: { ano, mes, receita*, despesa*, lucro*, ... }
   */
  router.get("/dre", (req, res) => {
    try {
      const { dataInicio, dataFim } = req.query;

      if (!dataInicio || !dataFim) {
        return res.status(400).json({
          erro: "dataInicio e dataFim obrigatórios (YYYY-MM-DD)",
        });
      }

      const dataInicioStr = String(dataInicio);
      const dataFimStr = String(dataFim);

      // Valida formato YYYY-MM-DD
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dataInicioStr) || !/^\d{4}-\d{2}-\d{2}$/.test(dataFimStr)) {
        return res.status(400).json({
          erro: "Formato inválido: use YYYY-MM-DD",
        });
      }

      // Tenta cache
      const cacheKey = `dre:${dataInicioStr}:${dataFimStr}`;
      const cacheHit = dreCache.get(cacheKey);
      if (cacheHit && Date.now() - cacheHit.timestamp < CACHE_DURATION_MS) {
        return res.json(cacheHit.resultado);
      }

      // Calcula on-the-fly
      if (!db) {
        return res.status(500).json({ erro: "Database não disponível" });
      }

      const resultado = calcularDREPeriodo(db, dataInicioStr, dataFimStr);

      // Grava no cache
      dreCache.set(cacheKey, { resultado, timestamp: Date.now() });

      res.json(resultado);
    } catch (erro) {
      console.error("[DRE] Erro ao calcular on-the-fly:", erro);
      res.status(500).json({ erro: "Erro ao calcular DRE" });
    }
  });

  /**
   * POST /api/relatorios/dre/calcular
   *
   * Opção B: Calcula DRE para período completo e grava em dre_periodos.
   * Disparado manualmente ou via scheduler (23:55 diariamente).
   *
   * Request body:
   *   - ano: number (obrigatório)
   *   - mes: number (obrigatório, 1-12)
   *
   * Response: { sucesso: true, dreCalculado: {...}, mensagem: "..." }
   */
  router.post("/dre/calcular", (req, res) => {
    try {
      const { ano, mes } = req.body;

      if (ano === undefined || mes === undefined) {
        return res.status(400).json({
          erro: "ano e mes obrigatórios (numero)",
        });
      }

      if (typeof ano !== "number" || typeof mes !== "number") {
        return res.status(400).json({
          erro: "ano e mes devem ser números",
        });
      }

      if (mes < 1 || mes > 12) {
        return res.status(400).json({
          erro: "mes deve estar entre 1 e 12",
        });
      }

      if (!db) {
        return res.status(500).json({ erro: "Database não disponível" });
      }

      // Calcula para o período (dia 1 até último dia do mês)
      const dataInicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
      const ultimoDia = new Date(ano, mes, 0).getDate();
      const dataFim = `${ano}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;

      const dre = calcularDREPeriodo(db, dataInicio, dataFim);

      // Grava em dre_periodos
      gravarDREPeriodo(db, ano, mes, dre);

      // Invalida cache (pois o DRE foi recalculado)
      const cacheKey = `dre:${dataInicio}:${dataFim}`;
      dreCache.delete(cacheKey);

      res.json({
        sucesso: true,
        dreCalculado: dre,
        mensagem: `DRE ${ano}-${String(mes).padStart(2, "0")} calculado e gravado.`,
      });
    } catch (erro) {
      console.error("[DRE] Erro ao calcular e gravar:", erro);
      res.status(500).json({ erro: "Erro ao calcular e gravar DRE" });
    }
  });

  /**
   * GET /api/relatorios/dre/historico
   *
   * Lista períodos de DRE já calculados (gravados em dre_periodos).
   *
   * Query params (opcionais):
   *   - anoMin: number (inclusive)
   *   - anoMax: number (inclusive)
   *   - mesMin: number (1-12, para o anoMin)
   *   - mesMax: number (1-12, para o anoMax)
   *
   * Response: { periodos: [ { ano, mes, receita*, despesa*, lucro*, ... }, ... ] }
   */
  router.get("/dre/historico", (req, res) => {
    try {
      const anoMin = req.query.anoMin ? Number(req.query.anoMin) : undefined;
      const anoMax = req.query.anoMax ? Number(req.query.anoMax) : undefined;
      const mesMin = req.query.mesMin ? Number(req.query.mesMin) : undefined;
      const mesMax = req.query.mesMax ? Number(req.query.mesMax) : undefined;

      if (!db) {
        return res.status(500).json({ erro: "Database não disponível" });
      }

      const periodos = listarDREPeriodos(db, {
        anoMin: anoMin ?? 2000,
        anoMax: anoMax ?? new Date().getFullYear(),
        mesMin,
        mesMax,
      });

      res.json({ periodos });
    } catch (erro) {
      console.error("[DRE] Erro ao listar histórico:", erro);
      res.status(500).json({ erro: "Erro ao listar histórico" });
    }
  });

  /**
   * GET /api/relatorios/dre/:ano/:mes
   *
   * Busca DRE específico já gravado.
   *
   * Path params:
   *   - ano: number
   *   - mes: number (1-12)
   *
   * Response: { sucesso, dre: {...} } ou { sucesso: false, mensagem: "Não encontrado" }
   */
  router.get("/dre/:ano/:mes", (req, res) => {
    try {
      const ano = Number(req.params.ano);
      const mes = Number(req.params.mes);

      if (isNaN(ano) || isNaN(mes) || mes < 1 || mes > 12) {
        return res.status(400).json({
          erro: "ano e mes inválidos",
        });
      }

      if (!db) {
        return res.status(500).json({ erro: "Database não disponível" });
      }

      const dre = buscarDREPeriodo(db, ano, mes);

      if (!dre) {
        return res.status(404).json({
          sucesso: false,
          mensagem: `Nenhum DRE encontrado para ${ano}-${String(mes).padStart(2, "0")}`,
        });
      }

      res.json({ sucesso: true, dre });
    } catch (erro) {
      console.error("[DRE] Erro ao buscar DRE específico:", erro);
      res.status(500).json({ erro: "Erro ao buscar DRE" });
    }
  });

  return router;
}
