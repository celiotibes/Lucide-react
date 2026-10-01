/**
 * Serviço com banco para o inbox de eventos externos (eventos_externos_pendentes —
 * ver migrations-phase3-integracoes.sql). Compartilhado por qualquer integração que
 * recebe algo assíncrono sem poder gravar direto no banco local do cliente: webhook
 * da Asaas, webhook/captura do bot do Telegram, e futuras (ex: webhook da Pluggy).
 *
 * Por quê um serviço só, em vez de cada integração reimplementar: todas as três
 * precisam exatamente do mesmo par de operações (registrar e deixar o cliente
 * consumir por polling) — duplicar aqui só criaria três jeitos levemente diferentes
 * de fazer a mesma coisa.
 */
import type Database from "better-sqlite3";
import { randomUUID } from "crypto";

export type TipoEventoExterno = "captura_telegram" | "webhook_asaas" | "webhook_pluggy";

export interface EventoExterno {
  id: string;
  tipo: TipoEventoExterno;
  usuarioId: string | null;
  payload: unknown;
  recebidoEm: string;
  consumido: boolean;
  consumidoEm: string | null;
}

interface LinhaEvento {
  id: string;
  tipo: TipoEventoExterno;
  usuario_id: string | null;
  payload_json: string;
  recebido_em: string;
  consumido: number;
  consumido_em: string | null;
}

function paraEvento(linha: LinhaEvento): EventoExterno {
  return {
    id: linha.id,
    tipo: linha.tipo,
    usuarioId: linha.usuario_id,
    payload: JSON.parse(linha.payload_json),
    recebidoEm: linha.recebido_em,
    consumido: !!linha.consumido,
    consumidoEm: linha.consumido_em,
  };
}

export class EventosExternosServiceDB {
  private db: Database.Database;

  constructor(database: Database.Database) {
    this.db = database;
  }

  /** Usado pelas rotas de webhook/bot para enfileirar um evento. `usuarioId` fica
   * nulo quando quem envia (ex: webhook da Asaas) não identifica o usuário —
   * resolvido depois, em `marcarConsumido`, ou por quem consome casando o payload
   * com um registro local (ex: asaas_charge_id em cobrancas_asaas). */
  registrarEvento(tipo: TipoEventoExterno, payload: unknown, usuarioId: string | null = null): EventoExterno {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO eventos_externos_pendentes (id, tipo, usuario_id, payload_json) VALUES (?, ?, ?, ?)`,
      )
      .run(id, tipo, usuarioId, JSON.stringify(payload));
    return this.buscarPorId(id)!;
  }

  buscarPorId(id: string): EventoExterno | null {
    const linha = this.db
      .prepare(`SELECT * FROM eventos_externos_pendentes WHERE id = ?`)
      .get(id) as LinhaEvento | undefined;
    return linha ? paraEvento(linha) : null;
  }

  /** Pendentes para o usuário autenticado: inclui tanto os já atribuídos a ele
   * quanto os ainda sem dono (usuario_id NULL) — o cliente decide, ao consumir, se
   * o evento é dele (ex: casa asaas_charge_id com uma cobrança local). */
  listarPendentes(usuarioId: string, tipo?: TipoEventoExterno): EventoExterno[] {
    const linhas = tipo
      ? (this.db
          .prepare(
            `SELECT * FROM eventos_externos_pendentes
             WHERE consumido = 0 AND tipo = ? AND (usuario_id IS NULL OR usuario_id = ?)
             ORDER BY recebido_em ASC`,
          )
          .all(tipo, usuarioId) as LinhaEvento[])
      : (this.db
          .prepare(
            `SELECT * FROM eventos_externos_pendentes
             WHERE consumido = 0 AND (usuario_id IS NULL OR usuario_id = ?)
             ORDER BY recebido_em ASC`,
          )
          .all(usuarioId) as LinhaEvento[]);
    return linhas.map(paraEvento);
  }

  /** Marca consumido; se o evento ainda não tinha usuario_id, atribui ao usuário
   * que está consumindo agora (primeiro a reivindicar o evento sem dono). Nunca
   * marca consumido um evento que já pertence a OUTRO usuário. */
  marcarConsumido(id: string, usuarioId: string): boolean {
    const evento = this.buscarPorId(id);
    if (!evento || evento.consumido) return false;
    if (evento.usuarioId !== null && evento.usuarioId !== usuarioId) return false;

    this.db
      .prepare(
        `UPDATE eventos_externos_pendentes
         SET consumido = 1, consumido_em = CURRENT_TIMESTAMP, usuario_id = ?
         WHERE id = ?`,
      )
      .run(usuarioId, id);
    return true;
  }
}
