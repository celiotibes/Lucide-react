import type { Database } from "sql.js";
import { executar, consultar } from "../../db/connection";
import type { Vistoria } from "../types";

export interface AprovacaoDTO {
  vistoria_id: number;
  motivo?: string;
}

export interface RejeicaoDTO {
  vistoria_id: number;
  motivo: string;
}

export function concluirInspecao(db: Database, vistoria_id: number, motivo?: string): Vistoria {
  const [vistoria] = consultar<Vistoria>(db, "SELECT * FROM vistorias WHERE id = ?", [
    vistoria_id,
  ]);
  if (!vistoria) {
    throw new Error(`Vistoria ${vistoria_id} não encontrada`);
  }

  if (vistoria.status !== "em_progresso") {
    throw new Error(`Vistoria ${vistoria_id} não está em progresso — status atual: ${vistoria.status}`);
  }

  const agora = new Date().toISOString();

  executar(
    db,
    "UPDATE vistorias SET status = 'concluida', atualizado_em = ? WHERE id = ?",
    [agora, vistoria_id],
  );

  executar(
    db,
    `INSERT INTO vistoria_log (vistoria_id, acao, usuario_id, motivo, criado_em)
     VALUES (?, 'concluida', NULL, ?, ?)`,
    [vistoria_id, motivo ?? null, agora],
  );

  return {
    ...vistoria,
    status: "concluida",
    atualizado_em: agora,
  };
}

export function aprovar(db: Database, dto: AprovacaoDTO): Vistoria {
  const [vistoria] = consultar<Vistoria>(db, "SELECT * FROM vistorias WHERE id = ?", [
    dto.vistoria_id,
  ]);
  if (!vistoria) {
    throw new Error(`Vistoria ${dto.vistoria_id} não encontrada`);
  }

  if (vistoria.status !== "concluida") {
    throw new Error(
      `Vistoria ${dto.vistoria_id} não pode ser aprovada — status atual: ${vistoria.status}. Deve estar "concluida"`,
    );
  }

  const agora = new Date().toISOString();

  executar(
    db,
    "UPDATE vistorias SET status = 'aprovada', atualizado_em = ? WHERE id = ?",
    [agora, dto.vistoria_id],
  );

  executar(
    db,
    `INSERT INTO vistoria_log (vistoria_id, acao, usuario_id, motivo, criado_em)
     VALUES (?, 'aprovada', NULL, ?, ?)`,
    [dto.vistoria_id, dto.motivo ?? null, agora],
  );

  return {
    ...vistoria,
    status: "aprovada",
    atualizado_em: agora,
  };
}

export function rejeitar(db: Database, dto: RejeicaoDTO): Vistoria {
  const [vistoria] = consultar<Vistoria>(db, "SELECT * FROM vistorias WHERE id = ?", [
    dto.vistoria_id,
  ]);
  if (!vistoria) {
    throw new Error(`Vistoria ${dto.vistoria_id} não encontrada`);
  }

  if (!["em_progresso", "concluida"].includes(vistoria.status)) {
    throw new Error(
      `Vistoria ${dto.vistoria_id} não pode ser rejeitada — status atual: ${vistoria.status}. Deve estar "em_progresso" ou "concluida"`,
    );
  }

  const agora = new Date().toISOString();

  executar(
    db,
    "UPDATE vistorias SET status = 'agendada', atualizado_em = ? WHERE id = ?",
    [agora, dto.vistoria_id],
  );

  executar(
    db,
    `INSERT INTO vistoria_log (vistoria_id, acao, usuario_id, motivo, criado_em)
     VALUES (?, 'rejeitada', NULL, ?, ?)`,
    [dto.vistoria_id, dto.motivo, agora],
  );

  return {
    ...vistoria,
    status: "agendada",
    atualizado_em: agora,
  };
}
