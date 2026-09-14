import type { Database } from "sql.js";
import { executar, consultar } from "../../db/connection";
import type { Vistoria, VistoriaItem, VistoriaLog } from "../types";
import { obterVistoriaOuErro, registrarAcao } from "./utils";

export interface ItemInspecaoDTO {
  tipo: "dano" | "necessidade_reparo" | "achado_positivo";
  descricao: string;
  severidade?: "baixa" | "media" | "alta";
  valor_estimado?: number;
}

export function realizarInspecao(
  db: Database,
  vistoria_id: number,
  items: ItemInspecaoDTO[],
  responsavel: string,
): Vistoria {
  const vistoria = obterVistoriaOuErro(db, vistoria_id);

  const agora = new Date().toISOString();

  executar(
    db,
    "UPDATE vistorias SET status = 'em_progresso', responsavel = ?, data_realizada = ?, atualizado_em = ? WHERE id = ?",
    [responsavel, agora, agora, vistoria_id],
  );

  for (const item of items) {
    executar(
      db,
      `INSERT INTO vistoria_item (vistoria_id, tipo, descricao, severidade, valor_estimado, criado_em)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        vistoria_id,
        item.tipo,
        item.descricao,
        item.severidade ?? null,
        item.valor_estimado ?? null,
        agora,
      ],
    );
  }

  registrarAcao(db, vistoria_id, "inspecao_iniciada");

  const [resultado] = consultar<{ total: number }>(
    db,
    "SELECT COALESCE(SUM(valor_estimado), 0) as total FROM vistoria_item WHERE vistoria_id = ?",
    [vistoria_id],
  );

  const valor_total = resultado?.total || 0;

  executar(db, "UPDATE vistorias SET valor_estimado = ? WHERE id = ?", [valor_total, vistoria_id]);

  return {
    ...vistoria,
    status: "em_progresso",
    responsavel,
    data_realizada: agora,
    atualizado_em: agora,
    valor_estimado: valor_total,
  };
}

export function obterItens(db: Database, vistoria_id: number): VistoriaItem[] {
  return consultar<VistoriaItem>(
    db,
    "SELECT * FROM vistoria_item WHERE vistoria_id = ? ORDER BY tipo, criado_em",
    [vistoria_id],
  );
}

export function calcularTotalDanos(db: Database, vistoria_id: number): number {
  const [resultado] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(valor_estimado), 0) as total
     FROM vistoria_item
     WHERE vistoria_id = ? AND tipo IN ('dano', 'necessidade_reparo')`,
    [vistoria_id],
  );
  return resultado?.total || 0;
}

export function obterHistorico(db: Database, vistoria_id: number): VistoriaLog[] {
  return consultar<VistoriaLog>(
    db,
    "SELECT * FROM vistoria_log WHERE vistoria_id = ? ORDER BY criado_em ASC",
    [vistoria_id],
  );
}
