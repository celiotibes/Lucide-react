/**
 * Rotas HTTP para Relatório Executivo
 *
 * GET  /api/relatorios/executivo/dashboard?mes=10&ano=2026  — JSON para UI
 * GET  /api/relatorios/executivo/download/:mes/:ano         — Baixar HTML/PDF
 * POST /api/relatorios/executivo/gerar?mes=10&ano=2026      — Gerar manualmente
 * POST /api/relatorios/executivo/enviar-email?mes=10&ano=2026&email=user@example.com — Enviar por email
 */

import express from "express";
import { logger } from '../services/logger-service.js';
import type { AuthServiceDB } from "../domain/auth/auth-service-db.js";
import type Database from "better-sqlite3";
import { criarMiddlewareAutenticacao } from "./auth-routes.js";
import { gerarRelatorioExecutivo, gerarPDFRelatorioExecutivo, enviarRelatorioEmailMensal, gerarMargensResumodaPaginado } from "../domain/relatorios/relatorio-executivo.js";

export interface RelatorioExecutivoRoutesDeps {
  authService: AuthServiceDB;
  db?: Database.Database;
}

export function criarRotasRelatorioExecutivo(deps: RelatorioExecutivoRoutesDeps): express.Router {
  const router = express.Router();
  const { authService, db } = deps;

  // Middleware: autenticação Bearer
  router.use(criarMiddlewareAutenticacao(authService));

  /**
   * GET /api/relatorios/executivo/dashboard?mes=10&ano=2026
   *
   * Retorna o relatório executivo em formato JSON para exibição no dashboard React
   *
   * Query params:
   *   - mes: número 1-12 (obrigatório)
   *   - ano: número (obrigatório)
   */
  router.get("/dashboard", (req, res) => {
    try {
      if (!db) {
        return res.status(500).json({ erro: "Database não disponível" });
      }

      const { mes, ano } = req.query;

      if (!mes || !ano) {
        return res.status(400).json({
          erro: "mes e ano são obrigatórios",
        });
      }

      const mesNum = Number(mes);
      const anoNum = Number(ano);

      if (!Number.isInteger(mesNum) || mesNum < 1 || mesNum > 12) {
        return res.status(400).json({ erro: "mes deve ser número entre 1 e 12" });
      }

      if (!Number.isInteger(anoNum) || anoNum < 2000 || anoNum > 2100) {
        return res.status(400).json({ erro: "ano deve ser número entre 2000 e 2100" });
      }

      const relatorio = gerarRelatorioExecutivo(db, mesNum, anoNum);
      return res.json(relatorio);
    } catch (erro) {
      logger.error("[RelatorioExecutivoRoutes] Erro ao gerar dashboard:", erro);
      return res.status(500).json({
        erro: "Erro ao gerar relatório",
        detalhes: erro instanceof Error ? erro.message : String(erro),
      });
    }
  });

  /**
   * GET /api/relatorios/executivo/margens?mes=10&ano=2026&limit=50&offset=0
   *
   * Retorna margens por propriedade com paginação
   *
   * Query params:
   *   - mes: número 1-12 (obrigatório)
   *   - ano: número (obrigatório)
   *   - limit: número (opcional, padrão: 50, máximo: 500)
   *   - offset: número (opcional, padrão: 0)
   */
  router.get("/margens", (req, res) => {
    try {
      if (!db) {
        return res.status(500).json({ erro: "Database não disponível" });
      }

      const { mes, ano, limit, offset } = req.query;

      if (!mes || !ano) {
        return res.status(400).json({
          erro: "mes e ano são obrigatórios",
        });
      }

      const mesNum = Number(mes);
      const anoNum = Number(ano);

      if (!Number.isInteger(mesNum) || mesNum < 1 || mesNum > 12) {
        return res.status(400).json({ erro: "mes deve ser número entre 1 e 12" });
      }

      if (!Number.isInteger(anoNum) || anoNum < 2000 || anoNum > 2100) {
        return res.status(400).json({ erro: "ano deve ser número entre 2000 e 2100" });
      }

      // Validate pagination params
      const limitNum = limit ? Number(limit) : 50;
      const offsetNum = offset ? Number(offset) : 0;

      if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > 500) {
        return res.status(400).json({ erro: "limit deve ser número entre 1 e 500" });
      }

      if (!Number.isInteger(offsetNum) || offsetNum < 0) {
        return res.status(400).json({ erro: "offset deve ser número >= 0" });
      }

      const margens = gerarMargensResumodaPaginado(db, mesNum, anoNum, limitNum, offsetNum);
      return res.json(margens);
    } catch (erro) {
      logger.error("[RelatorioExecutivoRoutes] Erro ao obter margens paginadas:", erro);
      return res.status(500).json({
        erro: "Erro ao obter margens",
        detalhes: erro instanceof Error ? erro.message : String(erro),
      });
    }
  });

  /**
   * GET /api/relatorios/executivo/download/:mes/:ano
   *
   * Retorna o PDF do relatório em HTML (para impressão ou conversão a PDF)
   *
   * Path params:
   *   - mes: número 1-12
   *   - ano: número
   */
  router.get("/download/:mes/:ano", (req, res) => {
    try {
      if (!db) {
        return res.status(500).json({ erro: "Database não disponível" });
      }

      const { mes, ano } = req.params;
      const mesNum = Number(mes);
      const anoNum = Number(ano);

      if (!Number.isInteger(mesNum) || mesNum < 1 || mesNum > 12) {
        return res.status(400).json({ erro: "mes deve ser número entre 1 e 12" });
      }

      if (!Number.isInteger(anoNum) || anoNum < 2000 || anoNum > 2100) {
        return res.status(400).json({ erro: "ano deve ser número entre 2000 e 2100" });
      }

      const html = gerarPDFRelatorioExecutivo(db, mesNum, anoNum);

      // Retorna como HTML para que o navegador possa imprimir/salvar como PDF
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="relatorio-executivo-${anoNum}-${String(mesNum).padStart(2, "0")}.html"`);
      return res.send(html);
    } catch (erro) {
      logger.error("[RelatorioExecutivoRoutes] Erro ao fazer download:", erro);
      return res.status(500).json({
        erro: "Erro ao gerar PDF",
        detalhes: erro instanceof Error ? erro.message : String(erro),
      });
    }
  });

  /**
   * POST /api/relatorios/executivo/gerar?mes=10&ano=2026
   *
   * Força a geração manual de um relatório (útil para trigger manual)
   *
   * Query params:
   *   - mes: número 1-12 (obrigatório)
   *   - ano: número (obrigatório)
   */
  router.post("/gerar", (req, res) => {
    try {
      if (!db) {
        return res.status(500).json({ erro: "Database não disponível" });
      }

      const { mes, ano } = req.query;

      if (!mes || !ano) {
        return res.status(400).json({
          erro: "mes e ano são obrigatórios",
        });
      }

      const mesNum = Number(mes);
      const anoNum = Number(ano);

      if (!Number.isInteger(mesNum) || mesNum < 1 || mesNum > 12) {
        return res.status(400).json({ erro: "mes deve ser número entre 1 e 12" });
      }

      if (!Number.isInteger(anoNum) || anoNum < 2000 || anoNum > 2100) {
        return res.status(400).json({ erro: "ano deve ser número entre 2000 e 2100" });
      }

      const relatorio = gerarRelatorioExecutivo(db, mesNum, anoNum);

      return res.json({
        sucesso: true,
        mensagem: `Relatório de ${mesNum}/${anoNum} gerado com sucesso`,
        relatorio,
      });
    } catch (erro) {
      logger.error("[RelatorioExecutivoRoutes] Erro ao gerar relatório:", erro);
      return res.status(500).json({
        sucesso: false,
        erro: "Erro ao gerar relatório",
        detalhes: erro instanceof Error ? erro.message : String(erro),
      });
    }
  });

  /**
   * POST /api/relatorios/executivo/enviar-email?mes=10&ano=2026&email=user@example.com
   *
   * Envia o relatório por email
   *
   * Query params:
   *   - mes: número 1-12 (obrigatório)
   *   - ano: número (obrigatório)
   *   - email: string (obrigatório)
   */
  router.post("/enviar-email", async (req, res) => {
    try {
      if (!db) {
        return res.status(500).json({ erro: "Database não disponível" });
      }

      const { mes, ano, email } = req.query;

      if (!mes || !ano || !email) {
        return res.status(400).json({
          erro: "mes, ano e email são obrigatórios",
        });
      }

      const mesNum = Number(mes);
      const anoNum = Number(ano);
      const emailStr = String(email).toLowerCase();

      if (!Number.isInteger(mesNum) || mesNum < 1 || mesNum > 12) {
        return res.status(400).json({ erro: "mes deve ser número entre 1 e 12" });
      }

      if (!Number.isInteger(anoNum) || anoNum < 2000 || anoNum > 2100) {
        return res.status(400).json({ erro: "ano deve ser número entre 2000 e 2100" });
      }

      // Valida email básico
      if (!emailStr.includes("@")) {
        return res.status(400).json({ erro: "email inválido" });
      }

      const resultado = await enviarRelatorioEmailMensal(db, emailStr, mesNum, anoNum);

      if (resultado.sucesso) {
        return res.json({
          sucesso: true,
          mensagem: `Relatório de ${mesNum}/${anoNum} enviado para ${emailStr}`,
          idEmail: resultado.idEmail,
        });
      } else {
        return res.status(500).json({
          sucesso: false,
          erro: "Erro ao enviar relatório por email",
          detalhes: resultado.erro,
        });
      }
    } catch (erro) {
      logger.error("[RelatorioExecutivoRoutes] Erro ao enviar email:", erro);
      return res.status(500).json({
        sucesso: false,
        erro: "Erro ao enviar email",
        detalhes: erro instanceof Error ? erro.message : String(erro),
      });
    }
  });

  return router;
}
