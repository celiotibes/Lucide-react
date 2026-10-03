import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import type { Documento, DocumentoImovel, TipoDocumento } from "../types";

export interface NovoDocumento {
  tipo: TipoDocumento;
  arquivo_nome: string;
  valor?: number;
  data_documento?: string;
  cnpj_cpf_contraparte?: string;
  nome_contraparte?: string;
  descricao_produto_servico?: string;
  plano_conta_codigo?: string;
  texto_extraido?: string;
  observacoes?: string;
  arquivo_hash_sha256?: string;  // hash SHA-256 do arquivo para deduplicação
  chave_nfe?: string;  // chave de acesso NF-e/NFS-e para deduplicação
}

/** Calcula SHA-256 de um arquivo (Uint8Array). Retorna string hexadecimal. */
export async function sha256Hex(dados: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", dados as BufferSource);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class DocumentoDuplicadoError extends Error {
  constructor(
    public readonly documentoExistenteId: number,
    public readonly motivo: "hash_arquivo" | "chave_nfe",
  ) {
    super(
      `Documento duplicado: já existe o documento #${documentoExistenteId} com o mesmo ${
        motivo === "hash_arquivo" ? "arquivo (hash SHA-256)" : "chave de acesso da NF-e"
      }.`,
    );
    this.name = "DocumentoDuplicadoError";
  }
}

/** Procura documento já cadastrado com o mesmo hash de arquivo ou a mesma chave de NF-e. */
export function buscarDocumentoDuplicado(
  db: Database,
  chaves: { arquivo_hash_sha256?: string; chave_nfe?: string },
): { id: number; motivo: "hash_arquivo" | "chave_nfe" } | null {
  if (chaves.arquivo_hash_sha256) {
    const [existente] = consultar<{ id: number }>(db, "SELECT id FROM documentos WHERE arquivo_hash_sha256 = ?", [chaves.arquivo_hash_sha256]);
    if (existente) return { id: existente.id, motivo: "hash_arquivo" };
  }
  if (chaves.chave_nfe) {
    const [existente] = consultar<{ id: number }>(db, "SELECT id FROM documentos WHERE chave_nfe = ?", [chaves.chave_nfe]);
    if (existente) return { id: existente.id, motivo: "chave_nfe" };
  }
  return null;
}

/** Grava o documento e, se já souber a que imóvel(is) se refere, a distribuição percentual
 * (0-100 cada) — pode ficar vazia e ser preenchida depois, antes de vincular a uma transação.
 * Lança erro se documento for duplicado (mesmo hash ou chave NF-e). */
export function inserirDocumento(db: Database, doc: NovoDocumento, imoveis: { imovelId: number; percentual: number }[] = []): number {
  const duplicado = buscarDocumentoDuplicado(db, doc);
  if (duplicado) throw new DocumentoDuplicadoError(duplicado.id, duplicado.motivo);

  executar(
    db,
    `INSERT INTO documentos (tipo, arquivo_nome, valor, data_documento, cnpj_cpf_contraparte, nome_contraparte, descricao_produto_servico, plano_conta_codigo, texto_extraido, criado_em, observacoes, arquivo_hash_sha256, chave_nfe)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      doc.tipo,
      doc.arquivo_nome,
      doc.valor ?? null,
      doc.data_documento ?? null,
      doc.cnpj_cpf_contraparte ?? null,
      doc.nome_contraparte ?? null,
      doc.descricao_produto_servico ?? null,
      doc.plano_conta_codigo ?? null,
      doc.texto_extraido ?? null,
      new Date().toISOString().slice(0, 10),
      doc.observacoes ?? null,
      doc.arquivo_hash_sha256 ?? null,
      doc.chave_nfe ?? null,
    ],
  );
  const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id");
  definirImoveisDoDocumento(db, id, imoveis);
  return id;
}

/** Substitui a distribuição de imóveis de um documento (remove a anterior, se houver). */
export function definirImoveisDoDocumento(db: Database, documentoId: number, imoveis: { imovelId: number; percentual: number }[]): void {
  executar(db, "DELETE FROM documento_imoveis WHERE documento_id = ?", [documentoId]);
  for (const { imovelId, percentual } of imoveis) {
    executar(db, "INSERT INTO documento_imoveis (documento_id, imovel_id, percentual) VALUES (?, ?, ?)", [documentoId, imovelId, percentual]);
  }
}

export interface AtualizacaoDocumento {
  tipo: TipoDocumento;
  arquivo_nome: string;
  valor?: number;
  data_documento?: string;
  cnpj_cpf_contraparte?: string;
  nome_contraparte?: string;
  descricao_produto_servico?: string;
  plano_conta_codigo?: string;
}

export function atualizarDocumento(db: Database, documentoId: number, doc: AtualizacaoDocumento, imoveis: { imovelId: number; percentual: number }[]): void {
  executar(
    db,
    `UPDATE documentos SET tipo = ?, arquivo_nome = ?, valor = ?, data_documento = ?, cnpj_cpf_contraparte = ?, nome_contraparte = ?, descricao_produto_servico = ?, plano_conta_codigo = ?
     WHERE id = ?`,
    [
      doc.tipo,
      doc.arquivo_nome,
      doc.valor ?? null,
      doc.data_documento ?? null,
      doc.cnpj_cpf_contraparte ?? null,
      doc.nome_contraparte ?? null,
      doc.descricao_produto_servico ?? null,
      doc.plano_conta_codigo ?? null,
      documentoId,
    ],
  );
  definirImoveisDoDocumento(db, documentoId, imoveis);
}

/** Remove o documento e seus vínculos — não reverte a classificação (imóvel/categoria) já
 * aplicada em transações vinculadas, porque desfazer isso automaticamente poderia mudar
 * dados da transação como efeito colateral de uma exclusão não relacionada a ela. Quem
 * chama deve avisar o usuário disso antes de confirmar. */
export function excluirDocumento(db: Database, documentoId: number): void {
  executar(db, "DELETE FROM documento_transacoes WHERE documento_id = ?", [documentoId]);
  executar(db, "DELETE FROM documento_imoveis WHERE documento_id = ?", [documentoId]);
  executar(db, "DELETE FROM documentos WHERE id = ?", [documentoId]);
}

export function listarDocumentos(db: Database): Documento[] {
  return consultar<Documento>(db, "SELECT * FROM documentos ORDER BY criado_em DESC, id DESC");
}

export function obterDocumento(db: Database, documentoId: number): Documento | null {
  const [documento] = consultar<Documento>(db, "SELECT * FROM documentos WHERE id = ?", [documentoId]);
  return documento ?? null;
}

export function listarImoveisDoDocumento(db: Database, documentoId: number): (DocumentoImovel & { apelido: string })[] {
  return consultar<DocumentoImovel & { apelido: string }>(
    db,
    `SELECT di.id, di.documento_id, di.imovel_id, di.percentual, i.apelido
     FROM documento_imoveis di JOIN imoveis i ON i.id = di.imovel_id
     WHERE di.documento_id = ?`,
    [documentoId],
  );
}

/** Transações já vinculadas (sugeridas ou confirmadas) a um documento, para não sugerir de novo. */
export function listarTransacoesVinculadas(db: Database, documentoId: number): { transacaoId: number; status: string; score: number }[] {
  return consultar<{ transacao_id: number; status: string; score: number }>(
    db,
    "SELECT transacao_id, status, score FROM documento_transacoes WHERE documento_id = ?",
    [documentoId],
  ).map((r) => ({ transacaoId: r.transacao_id, status: r.status, score: r.score }));
}
