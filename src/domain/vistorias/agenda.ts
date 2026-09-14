import type { Database } from "sql.js";
import { executar, consultar } from "../../db/connection";
import type { Vistoria } from "../types";
import { registrarAcao } from "./utils";

export interface AgendaVistoriaDTO {
  imovel_id: number;
  data: Date;
  responsavel: string;
  tipo: "entrada" | "saída" | "periódica";
  observacoes?: string;
}

export function agendar(db: Database, dto: AgendaVistoriaDTO): Vistoria {
  const agora = new Date();
  if (dto.data < agora) {
    throw new Error("Data da vistoria não pode ser no passado");
  }

  const [imovel] = consultar<{ id: number }>(db, "SELECT id FROM imoveis WHERE id = ?", [
    dto.imovel_id,
  ]);
  if (!imovel) {
    throw new Error(`Imóvel ${dto.imovel_id} não encontrado`);
  }

  const dataAgendada = dto.data.toISOString();
  const agora_iso = agora.toISOString();

  executar(
    db,
    `INSERT INTO vistorias
      (imovel_id, data_agendada, responsavel, status, observacoes, criado_em, atualizado_em)
     VALUES (?, ?, ?, 'agendada', ?, ?, ?)`,
    [dto.imovel_id, dataAgendada, dto.responsavel, dto.observacoes || null, agora_iso, agora_iso],
  );

  const [vistoria] = consultar<Vistoria>(
    db,
    "SELECT * FROM vistorias WHERE imovel_id = ? ORDER BY id DESC LIMIT 1",
    [dto.imovel_id],
  );

  registrarAcao(db, vistoria.id, "agendada");

  return vistoria;
}

export function listarPorImovel(db: Database, imovel_id: number): Vistoria[] {
  return consultar<Vistoria>(
    db,
    "SELECT * FROM vistorias WHERE imovel_id = ? ORDER BY data_agendada DESC",
    [imovel_id],
  );
}

export function listarPorStatus(db: Database, status: string): Vistoria[] {
  return consultar<Vistoria>(
    db,
    "SELECT * FROM vistorias WHERE status = ? ORDER BY data_agendada DESC",
    [status],
  );
}

export function buscarPorId(db: Database, id: number): Vistoria | null {
  const [vistoria] = consultar<Vistoria>(db, "SELECT * FROM vistorias WHERE id = ?", [id]);
  return vistoria ?? null;
}
