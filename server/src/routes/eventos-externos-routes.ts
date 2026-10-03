/**
 * Rotas HTTP do inbox de eventos externos (ver eventos-externos-db.ts). Qualquer
 * integração que recebe algo assíncrono sem acesso ao banco local do cliente
 * (webhook da Asaas, captura do bot do Telegram) enfileira aqui; o cliente consome
 * por polling quando abre o app.
 */
import express from "express";
import type { EventosExternosServiceDB, TipoEventoExterno } from "../domain/integracoes/eventos-externos-db.js";
import { criarMiddlewareAutenticacao } from "./auth-routes.js";
import type { AuthServiceDB } from "../domain/auth/auth-service-db.js";

export interface EventosExternosRoutesDeps {
  authService: AuthServiceDB;
  eventosService: EventosExternosServiceDB;
}

const TIPOS_VALIDOS: TipoEventoExterno[] = ["captura_telegram", "webhook_asaas", "webhook_pluggy"];

export function criarRotasEventosExternos({ authService, eventosService }: EventosExternosRoutesDeps): express.Router {
  const router = express.Router();
  const exigirAutenticacao = criarMiddlewareAutenticacao(authService);

  /**
   * GET /api/eventos-externos/pendentes?tipo=webhook_asaas
   * Lista eventos pendentes de consumo para o usuário autenticado (inclui os
   * ainda sem dono). `tipo` é opcional — omitido, lista de todos os tipos.
   */
  router.get("/pendentes", exigirAutenticacao, (req, res) => {
    const usuarioId = req.auth!.usuario!.id;
    const tipoQuery = req.query.tipo;
    if (tipoQuery !== undefined && !TIPOS_VALIDOS.includes(tipoQuery as TipoEventoExterno)) {
      res.status(400).json({ erro: `tipo inválido. Use um de: ${TIPOS_VALIDOS.join(", ")}` });
      return;
    }
    const eventos = eventosService.listarPendentes(usuarioId, tipoQuery as TipoEventoExterno | undefined);
    res.json({ eventos });
  });

  /**
   * POST /api/eventos-externos/:id/consumir
   * O cliente chama depois de aplicar o evento no seu banco local — marca
   * consumido para não reaparecer no próximo polling.
   */
  router.post("/:id/consumir", exigirAutenticacao, (req, res) => {
    const usuarioId = req.auth!.usuario!.id;
    const ok = eventosService.marcarConsumido(req.params.id, usuarioId);
    if (!ok) {
      res.status(404).json({ erro: "Evento não encontrado, já consumido, ou pertence a outro usuário" });
      return;
    }
    res.json({ sucesso: true });
  });

  /**
   * DELETE /api/eventos-externos/:id
   * Remove um evento externo do inbox (apenas se pertence ao usuário ou é sem dono).
   */
  router.delete("/:id", exigirAutenticacao, (req, res) => {
    const usuarioId = req.auth!.usuario!.id;
    const eventId = req.params.id;

    if (!eventId) {
      res.status(400).json({ erro: "ID do evento é obrigatório" });
      return;
    }

    const ok = eventosService.deletarEvento(eventId, usuarioId);
    if (!ok) {
      res.status(404).json({ erro: "Evento não encontrado ou pertence a outro usuário" });
      return;
    }

    res.json({ sucesso: true });
  });

  return router;
}
