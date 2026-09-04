import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import type { LogAlteracao, OperacaoLog } from "../types";

/** Grava um snapshot da linha inteira antes/depois de uma alteração — trilha de auditoria da
 * EDIÇÃO dos próprios dados cadastrais (distinta da auditoria forense, que audita os dados
 * financeiros em si). Achado de auditoria de completude: sem isso, não havia como provar que
 * um campo (ex: valor_venal_atual de um imóvel, cláusula de um contrato) não foi alterado
 * depois do fato — relevante se a exatidão de um número for questionada em juízo. Snapshot da
 * linha inteira (não diff campo a campo) — mais simples e robusto, ao custo de redundância de
 * armazenamento (aceitável: são poucas tabelas, poucas edições). */
export function registrarLog(
  db: Database,
  tabela: string,
  registroId: number,
  operacao: OperacaoLog,
  resumo: string,
  dadosAnteriores: Record<string, unknown> | null,
  dadosNovos: Record<string, unknown> | null,
): void {
  executar(
    db,
    `INSERT INTO log_alteracoes (tabela, registro_id, operacao, quando, resumo, dados_anteriores, dados_novos)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      tabela,
      registroId,
      operacao,
      new Date().toISOString(),
      resumo,
      dadosAnteriores ? JSON.stringify(dadosAnteriores) : null,
      dadosNovos ? JSON.stringify(dadosNovos) : null,
    ],
  );
}

/** Compara dois snapshots campo a campo e monta um resumo legível só com o que mudou — evita
 * poluir o log com a linha inteira quando só um campo foi de fato alterado. */
export function resumirDiferenca(anterior: Record<string, unknown> | null, novo: Record<string, unknown>): string {
  if (!anterior) return "registro criado";
  const campos = new Set([...Object.keys(anterior), ...Object.keys(novo)]);
  const mudancas: string[] = [];
  for (const campo of campos) {
    if (campo === "id") continue;
    const valorAntigo = anterior[campo];
    const valorNovo = novo[campo];
    if (valorAntigo !== valorNovo) mudancas.push(`${campo}: ${valorAntigo ?? "—"} → ${valorNovo ?? "—"}`);
  }
  return mudancas.length > 0 ? mudancas.join("; ") : "nenhum campo alterado";
}

// ORDER BY quando (timestamp) sozinho não desempata entradas gravadas no mesmo milissegundo
// (comum em testes, e possível em uso real com escritas em lote) — id DESC como critério de
// desempate garante ordem de inserção estável mesmo com timestamps iguais.
export function listarHistoricoDoRegistro(db: Database, tabela: string, registroId: number): LogAlteracao[] {
  return consultar<LogAlteracao>(
    db,
    "SELECT * FROM log_alteracoes WHERE tabela = ? AND registro_id = ? ORDER BY quando DESC, id DESC",
    [tabela, registroId],
  );
}

export function listarLogCompleto(db: Database, limite = 200): LogAlteracao[] {
  return consultar<LogAlteracao>(db, "SELECT * FROM log_alteracoes ORDER BY quando DESC, id DESC LIMIT ?", [limite]);
}
