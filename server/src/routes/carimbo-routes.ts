/**
 * POST /api/carimbo-tempo — pede carimbo RFC 3161 para o hash do selo de um encerramento.
 * Só papéis internos (o middleware padrão nega inquilino/prestador). O navegador não alcança a TSA
 * por CORS, por isso o servidor intermedeia.
 */
import express from "express";
import rateLimit from "express-rate-limit";
import { logger } from "../services/logger-service.js";
import type { AuthServiceDB } from "../domain/auth/auth-service-db.js";
import { criarMiddlewareAutenticacao } from "./auth-routes.js";
import { solicitarCarimbo, type OpcoesCarimbo } from "../services/tsa-service.js";

export interface CarimboRoutesDeps {
  authService: AuthServiceDB;
  /** Injetável para teste (nunca chamar a rede real). */
  opcoesTsa?: OpcoesCarimbo;
}

export function criarRotasCarimbo({ authService, opcoesTsa }: CarimboRoutesDeps): express.Router {
  const router = express.Router();
  const exigirAutenticacao = criarMiddlewareAutenticacao(authService);
  // Criado na inicialização da fábrica (express-rate-limit recusa criação dentro de handler).
  const limitador = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: "Muitas requisições de carimbo de tempo; tente novamente mais tarde" },
  });

  router.post("/", exigirAutenticacao, limitador, async (req, res) => {
    const hashHex = req.body?.hashHex;
    if (typeof hashHex !== "string" || !/^[0-9a-f]{64}$/.test(hashHex)) {
      res.status(400).json({ erro: "hashHex inválido: envie SHA-256 em 64 caracteres hexadecimais minúsculos" });
      return;
    }
    try {
      const resultado = await solicitarCarimbo(hashHex, opcoesTsa);
      logger.info(`[Carimbo] usuário ${req.auth!.usuario.id}: ${resultado.resultados.length} carimbo(s), ${resultado.falhas.length} falha(s)`);
      res.json(resultado);
    } catch (erro) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      logger.error(`[Carimbo] falha ao solicitar carimbo: ${msg}`);
      if (msg.startsWith("Nenhuma TSA disponível")) {
        res.status(502).json({ erro: "Nenhuma autoridade de carimbo de tempo disponível", detalhes: msg });
        return;
      }
      res.status(500).json({ erro: "Erro ao solicitar carimbo de tempo" });
    }
  });

  return router;
}
