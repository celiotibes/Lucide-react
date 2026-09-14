import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import type { Vistoria, AcaoVistoria } from "../types";

export function obterVistoriaOuErro(db: Database, vistoria_id: number): Vistoria {
  const [vistoria] = consultar<Vistoria>(db, "SELECT * FROM vistorias WHERE id = ?", [
    vistoria_id,
  ]);
  if (!vistoria) {
    throw new Error(`Vistoria ${vistoria_id} não encontrada`);
  }
  return vistoria;
}

export function registrarAcao(
  db: Database,
  vistoria_id: number,
  acao: AcaoVistoria,
  motivo?: string,
  usuario_id?: number,
): void {
  const agora = new Date().toISOString();
  executar(
    db,
    `INSERT INTO vistoria_log (vistoria_id, acao, usuario_id, motivo, criado_em)
     VALUES (?, ?, ?, ?, ?)`,
    [vistoria_id, acao, usuario_id ?? null, motivo ?? null, agora],
  );
}

export function formatarData(isoString: string | undefined | null): string {
  if (!isoString) return "N/A";
  return isoString.split("T")[0];
}

export function formatarDataHora(isoString: string | undefined | null): {
  data: string;
  hora: string;
} {
  if (!isoString) return { data: "N/A", hora: "" };
  const [data, tempo] = isoString.split("T");
  const hora = tempo?.substring(0, 5) || "";
  return { data, hora };
}
