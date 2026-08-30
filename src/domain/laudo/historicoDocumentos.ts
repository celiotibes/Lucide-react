import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import type { DocumentoGerado, TipoDocumentoGerado } from "../types";

async function calcularHashSha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Registra, no próprio banco, cada PDF (Laudo pericial / RAD) efetivamente gerado — achado
 * de auditoria de completude: sem isso, o sistema não tinha como provar depois qual foi o
 * conteúdo exato entregue numa data específica (só o hash do backup do banco INTEIRO,
 * granularidade bem mais grossa que um documento individual). Mesmo princípio de cadeia de
 * custódia digital de backupIntegridade.ts, mas aqui persistido no schema (não localStorage)
 * porque é um fato sobre O CASO, não sobre esta instalação do navegador. O chamador ainda
 * precisa chamar persistir() depois — este módulo só grava no banco em memória. */
export async function registrarDocumentoGerado(
  db: Database,
  params: { tipo: TipoDocumentoGerado; nomeArquivo: string; dataEmissao: string; bytes: Uint8Array; contratoId?: number; imovelId?: number },
): Promise<void> {
  const hashSha256 = await calcularHashSha256(params.bytes);
  executar(
    db,
    `INSERT INTO documentos_gerados (tipo, nome_arquivo, data_emissao, gerado_em, hash_sha256, tamanho_bytes, contrato_id, imovel_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.tipo,
      params.nomeArquivo,
      params.dataEmissao,
      new Date().toISOString(),
      hashSha256,
      params.bytes.byteLength,
      params.contratoId ?? null,
      params.imovelId ?? null,
    ],
  );
}

export function listarDocumentosGerados(db: Database): DocumentoGerado[] {
  return consultar<DocumentoGerado>(db, "SELECT * FROM documentos_gerados ORDER BY gerado_em DESC");
}
