/**
 * Carimbo de Tempo (RFC 3161) — Integração cliente
 *
 * Funcionalidades:
 * - Anexar carimbos de tempo ao selo de encerramento (múltiplas TSAs)
 * - Listar carimbos de um encerramento
 * - Cliente HTTP real para chamar backend
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";

/**
 * Cliente abstrato para solicitar carimbos de tempo
 */
export interface ClienteCarimbo {
  solicitar(hashHex: string): Promise<{
    resultados: Array<{ tsa_url: string; token_base64: string; solicitado_em: string }>;
    falhas: Array<{ tsa_url: string; erro: string }>;
  }>;
}

/**
 * Cliente HTTP real para solicitar carimbos ao backend
 */
export function criarClienteCarimboHttp(
  backendUrl: string,
  cabecalhosExtras: Record<string, string> = {}
): ClienteCarimbo {
  return {
    async solicitar(hashHex: string) {
      const response = await fetch(`${backendUrl}/api/carimbo-tempo`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cabecalhosExtras },
        credentials: "include",
        body: JSON.stringify({ hashHex }),
      });

      if (!response.ok) {
        const erro = await response.text();
        throw new Error(
          `Erro ao solicitar carimbo (${response.status}): ${erro}`
        );
      }

      return response.json();
    },
  };
}

/**
 * Anexar carimbos de tempo do selo de encerramento
 *
 * Procedimento:
 * 1. Ler hash_selo do encerramento
 * 2. Chamar cliente para solicitar carimbos (múltiplas TSAs)
 * 3. Gravar UMA linha por TSA que respondeu (idempotente por tsa_url)
 * 4. Retornar {gravados, falhas}
 */
export async function anexarCarimbosAoSelo(
  db: Database,
  encerramento_id: number,
  cliente: ClienteCarimbo
): Promise<{ gravados: number; falhas: string[] }> {
  // 1. Ler encerramento e hash_selo
  const [encerramento] = consultar<{
    hash_selo: string | null;
  }>(
    db,
    "SELECT hash_selo FROM ledger_encerramentos WHERE id = ?",
    [encerramento_id]
  );

  if (!encerramento) {
    throw new Error(`Encerramento ${encerramento_id} não encontrado`);
  }

  if (!encerramento.hash_selo) {
    throw new Error(
      `Encerramento ${encerramento_id} não tem hash_selo (pré-carimbo ou legado?)`
    );
  }

  // 2. Solicitar carimbos ao cliente
  const resultado = await cliente.solicitar(encerramento.hash_selo);

  // 3. Gravar resultados (idempotente por tsa_url)
  let gravados = 0;
  const falhasErros: string[] = [];

  for (const r of resultado.resultados) {
    try {
      executar(
        db,
        `INSERT OR IGNORE INTO ledger_selo_carimbos
         (encerramento_id, hash_selo, tsa_url, token_base64, solicitado_em)
         VALUES (?, ?, ?, ?, ?)`,
        [
          encerramento_id,
          encerramento.hash_selo,
          r.tsa_url,
          r.token_base64,
          r.solicitado_em,
        ]
      );

      // Verificar se de fato foi inserido (ou se era duplicata)
      const [inserted] = consultar<{ id: number }>(
        db,
        `SELECT id FROM ledger_selo_carimbos
         WHERE encerramento_id = ? AND tsa_url = ?`,
        [encerramento_id, r.tsa_url]
      );

      if (inserted) {
        gravados++;
      }
    } catch (err) {
      const erro = err instanceof Error ? err.message : String(err);
      falhasErros.push(`${r.tsa_url}: ${erro}`);
    }
  }

  // Acumular falhas da resposta
  for (const f of resultado.falhas) {
    falhasErros.push(`${f.tsa_url}: ${f.erro}`);
  }

  return { gravados, falhas: falhasErros };
}

/**
 * Listar carimbos de um encerramento
 */
export function listarCarimbos(
  db: Database,
  encerramento_id: number
): Array<{
  id: number;
  hash_selo: string;
  tsa_url: string;
  token_base64: string;
  solicitado_em: string;
  criado_em: string;
}> {
  return consultar(
    db,
    `SELECT id, hash_selo, tsa_url, token_base64, solicitado_em, criado_em
     FROM ledger_selo_carimbos
     WHERE encerramento_id = ?
     ORDER BY id`,
    [encerramento_id]
  );
}
