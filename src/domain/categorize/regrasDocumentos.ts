import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import type { TipoDocumento } from "../types";

export interface RegraDocumento {
  id: number;
  cnpj_cpf: string;
  tipo: TipoDocumento;
  nome_contraparte: string | null;
  plano_conta_codigo: string | null;
  imovel_id: number | null;
  criado_em: string;
  atualizado_em: string;
}

export function listarRegrasDocumentos(db: Database): RegraDocumento[] {
  return consultar<RegraDocumento>(db, "SELECT * FROM regras_categorizacao_documentos ORDER BY atualizado_em DESC");
}

/** Busca a regra aprendida para um CNPJ/CPF — usada para pré-preencher tipo/categoria/
 * imóvel/nome de um documento recém-enviado antes mesmo de o usuário revisar. Comparação
 * exata (não tenta casar CNPJ parcial/formatado diferente) — o mesmo CNPJ extraído duas
 * vezes pelo mesmo regex sempre vem no mesmo formato, então não há ambiguidade a resolver. */
export function buscarRegraPorCnpjCpf(db: Database, cnpjCpf: string): RegraDocumento | null {
  const [regra] = consultar<RegraDocumento>(db, "SELECT * FROM regras_categorizacao_documentos WHERE cnpj_cpf = ?", [cnpjCpf]);
  return regra ?? null;
}

/** Grava ou atualiza (upsert por cnpj_cpf) a regra aprendida a partir de um documento que
 * acabou de ser salvo com classificação completa — o PRÓXIMO documento do mesmo CNPJ/CPF já
 * chega pré-preenchido. Nunca é aplicado automaticamente sem revisão: só preenche o
 * formulário de revisão, que o usuário ainda confirma (ou corrige) antes de salvar. */
export function salvarOuAtualizarRegraDocumento(
  db: Database,
  cnpjCpf: string,
  dados: { tipo: TipoDocumento; nomeContraparte: string | null; planoContaCodigo: string | null; imovelId: number | null },
): void {
  const hoje = new Date().toISOString().slice(0, 10);
  const existente = buscarRegraPorCnpjCpf(db, cnpjCpf);
  if (existente) {
    executar(
      db,
      `UPDATE regras_categorizacao_documentos
       SET tipo = ?, nome_contraparte = ?, plano_conta_codigo = ?, imovel_id = ?, atualizado_em = ?
       WHERE cnpj_cpf = ?`,
      [dados.tipo, dados.nomeContraparte, dados.planoContaCodigo, dados.imovelId, hoje, cnpjCpf],
    );
  } else {
    executar(
      db,
      `INSERT INTO regras_categorizacao_documentos
         (cnpj_cpf, tipo, nome_contraparte, plano_conta_codigo, imovel_id, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [cnpjCpf, dados.tipo, dados.nomeContraparte, dados.planoContaCodigo, dados.imovelId, hoje, hoje],
    );
  }
}

export function excluirRegraDocumento(db: Database, id: number): void {
  executar(db, "DELETE FROM regras_categorizacao_documentos WHERE id = ?", [id]);
}
