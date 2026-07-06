import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import type { ContratoLocatario, PapelLocatario } from "../types";

/** Locação estudantil/compartilhada é comum ter vários nomes no mesmo contrato,
 * todos solidariamente responsáveis (art. 275 CC) — locatários de fato e
 * responsáveis financeiros (geralmente os pais, no caso de estudantes). */
export function listarPartes(db: Database, contratoId: number): ContratoLocatario[] {
  return consultar<ContratoLocatario>(db, "SELECT * FROM contrato_locatarios WHERE contrato_id = ? ORDER BY papel, id", [contratoId]);
}

export function adicionarParte(
  db: Database,
  contratoId: number,
  parte: { nome: string; cpf?: string; papel: PapelLocatario; telefone?: string; email?: string },
): void {
  executar(
    db,
    "INSERT INTO contrato_locatarios (contrato_id, nome, cpf, papel, telefone, email) VALUES (?, ?, ?, ?, ?, ?)",
    [contratoId, parte.nome, parte.cpf ?? null, parte.papel, parte.telefone ?? null, parte.email ?? null],
  );
}

export function removerParte(db: Database, parteId: number): void {
  executar(db, "DELETE FROM contrato_locatarios WHERE id = ?", [parteId]);
}
