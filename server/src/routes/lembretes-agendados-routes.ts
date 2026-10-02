/**
 * Rotas HTTP da agenda de lembretes de vencimento (ver `lembretes-agendados-db.ts` e
 * `migrations-phase5-lembretes-agendados.sql` para o fluxo completo e o contrato de
 * sincronização). Este router é só o "arquivista": recebe a foto completa já calculada
 * pelo cliente e guarda; o disparo de fato acontece no loop periódico
 * (`lembretes-dispatcher.ts`), não aqui.
 */
import express from "express";
import type { AuthServiceDB } from "../domain/auth/auth-service-db.js";
import { criarMiddlewareAutenticacao } from "./auth-routes.js";
import {
  type LembretesAgendadosServiceDB,
  type LembreteParaSincronizar,
  type OrigemLembreteAgendado,
  type StatusLembreteAgendado,
} from "../domain/notificacoes/lembretes-agendados-db.js";

export interface LembretesAgendadosRoutesDeps {
  authService: AuthServiceDB;
  service: LembretesAgendadosServiceDB;
}

const ORIGENS_VALIDAS: OrigemLembreteAgendado[] = ["lembrete_aluguel", "lembrete_honorario"];
const TIPOS_LEMBRETE_VALIDOS = ["2_dias_antes", "no_dia"];
const CANAIS_VALIDOS = ["email", "whatsapp", "telegram"];
const STATUS_VALIDOS: StatusLembreteAgendado[] = ["pendente", "enviado", "falha", "cancelado"];

function origemValida(valor: unknown): valor is OrigemLembreteAgendado {
  return typeof valor === "string" && (ORIGENS_VALIDAS as readonly string[]).includes(valor);
}

/** Valida UM item do array `lembretes` — devolve a mensagem de erro (string) se inválido,
 * ou `null` se ok. Validação aqui (camada HTTP), não no serviço: o serviço confia no tipo
 * `LembreteParaSincronizar[]` já validado (mesmo padrão de `notificacoes-routes.ts`). */
function erroDoItem(item: unknown, indice: number): string | null {
  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    return `lembretes[${indice}] precisa ser um objeto`;
  }
  const i = item as Record<string, unknown>;
  if (typeof i.origemId !== "number") return `lembretes[${indice}].origemId precisa ser number`;
  if (typeof i.tipoLembrete !== "string" || !TIPOS_LEMBRETE_VALIDOS.includes(i.tipoLembrete)) {
    return `lembretes[${indice}].tipoLembrete precisa ser um de: ${TIPOS_LEMBRETE_VALIDOS.join(", ")}`;
  }
  if (typeof i.canal !== "string" || !CANAIS_VALIDOS.includes(i.canal)) {
    return `lembretes[${indice}].canal precisa ser um de: ${CANAIS_VALIDOS.join(", ")}`;
  }
  if (typeof i.destinatario !== "string" || !i.destinatario.trim()) {
    return `lembretes[${indice}].destinatario é obrigatório`;
  }
  if (i.assunto !== undefined && i.assunto !== null && typeof i.assunto !== "string") {
    return `lembretes[${indice}].assunto precisa ser string quando informado`;
  }
  if (typeof i.mensagem !== "string" || !i.mensagem.trim()) {
    return `lembretes[${indice}].mensagem é obrigatória`;
  }
  if (typeof i.dataDisparoPrevista !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(i.dataDisparoPrevista)) {
    return `lembretes[${indice}].dataDisparoPrevista precisa ser 'YYYY-MM-DD'`;
  }
  return null;
}

export function criarRotasLembretesAgendados({ authService, service }: LembretesAgendadosRoutesDeps): express.Router {
  const router = express.Router();
  const exigirAutenticacao = criarMiddlewareAutenticacao(authService);

  /**
   * POST /sincronizar
   * Body: { origemTipo: 'lembrete_aluguel' | 'lembrete_honorario', lembretes: [...] }
   *
   * `lembretes` é a FOTO COMPLETA atual de tudo que é válido para este `origemTipo` — ver
   * o contrato detalhado em `LembretesAgendadosServiceDB.sincronizar`. Array vazio é válido
   * (cancela tudo que estava pendente deste tipo — ex: nenhuma competência pendente dentro
   * do horizonte agora).
   */
  router.post("/sincronizar", exigirAutenticacao, (req, res) => {
    const { origemTipo, lembretes } = req.body ?? {};

    if (!origemValida(origemTipo)) {
      res.status(400).json({ erro: `origemTipo inválido — precisa ser um de: ${ORIGENS_VALIDAS.join(", ")}` });
      return;
    }
    if (!Array.isArray(lembretes)) {
      res.status(400).json({ erro: "lembretes precisa ser um array" });
      return;
    }
    if (lembretes.length > 2000) {
      res.status(400).json({ erro: "Máximo de 2000 lembretes por chamada" });
      return;
    }
    for (let indice = 0; indice < lembretes.length; indice += 1) {
      const erro = erroDoItem(lembretes[indice], indice);
      if (erro) {
        res.status(400).json({ erro });
        return;
      }
    }

    try {
      service.sincronizar(origemTipo, lembretes as LembreteParaSincronizar[]);
    } catch (erro) {
      res.status(500).json({ erro: erro instanceof Error ? erro.message : "Falha ao sincronizar lembretes agendados" });
      return;
    }

    res.json({ sucesso: true, origemTipo, total: lembretes.length });
  });

  /**
   * GET /?status=pendente
   * Lista a agenda completa (para uma eventual tela de diagnóstico) — `status` opcional
   * filtra; omitido, lista todos os status.
   */
  router.get("/", exigirAutenticacao, (req, res) => {
    const statusQuery = req.query.status;
    if (statusQuery !== undefined && !STATUS_VALIDOS.includes(statusQuery as StatusLembreteAgendado)) {
      res.status(400).json({ erro: `status inválido — use um de: ${STATUS_VALIDOS.join(", ")}` });
      return;
    }
    const lembretes = service.listarTodos(statusQuery as StatusLembreteAgendado | undefined);
    res.json({ lembretes });
  });

  return router;
}
