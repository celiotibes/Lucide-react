/**
 * Rotas HTTP do fluxo MeuPluggy (uso pessoal, gratuito) — PARALELAS às rotas
 * comerciais (`/api/connect-token`, `/api/accounts`, `/api/transactions` em
 * `index.ts`, que usam o widget Pluggy Connect). Aqui não há connect-token:
 * o usuário já conectou as contas por fora, em meu.pluggy.ai, e estas rotas
 * só leem o que já está conectado — autenticadas pela sessão do app
 * (Bearer token), não pela chave de API compartilhada `X-API-Key` das rotas
 * comerciais.
 */
import express from "express";
import { logger } from '../services/logger-service.js';
import { criarMiddlewareAutenticacao } from "./auth-routes.js";
import type { AuthServiceDB } from "../domain/auth/auth-service-db.js";
import { listarContasPluggy, buscarTransacoesPluggy } from "../pluggy-meu.js";

export interface PluggyMeuRoutesDeps {
  authService: AuthServiceDB;
}

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

export function criarRotasPluggyMeu({ authService }: PluggyMeuRoutesDeps): express.Router {
  const router = express.Router();
  const exigirAutenticacao = criarMiddlewareAutenticacao(authService);

  /**
   * GET /api/pluggy-meu/contas
   * Lista as contas disponíveis em todos os Items configurados no servidor
   * (PLUGGY_MEU_ITEM_IDS) — para o usuário escolher qual vincular a uma
   * conta bancária já cadastrada no sistema.
   */
  router.get("/contas", exigirAutenticacao, async (_req, res) => {
    try {
      const contas = await listarContasPluggy();
      res.json({ contas });
    } catch (erro) {
      logger.error("Erro ao listar contas do MeuPluggy:", mensagemErro(erro));
      res.status(500).json({ erro: mensagemErro(erro) });
    }
  });

  /**
   * GET /api/pluggy-meu/contas/:accountId/transacoes?dataInicio=&dataFim=
   * Busca as transações de uma conta já conectada, já normalizadas para o
   * formato que o app web importa (mesmo shape usado por OFX/CSV/PDF e pelo
   * fluxo comercial de Open Finance).
   */
  router.get("/contas/:accountId/transacoes", exigirAutenticacao, async (req, res) => {
    const { accountId } = req.params;
    const { dataInicio, dataFim } = req.query;
    if (dataInicio !== undefined && typeof dataInicio !== "string") {
      res.status(400).json({ erro: "dataInicio inválida" });
      return;
    }
    if (dataFim !== undefined && typeof dataFim !== "string") {
      res.status(400).json({ erro: "dataFim inválida" });
      return;
    }

    try {
      const transacoes = await buscarTransacoesPluggy(accountId, { dataInicio, dataFim });
      res.json({ transacoes });
    } catch (erro) {
      logger.error("Erro ao buscar transações do MeuPluggy:", mensagemErro(erro));
      res.status(500).json({ erro: mensagemErro(erro) });
    }
  });

  return router;
}
