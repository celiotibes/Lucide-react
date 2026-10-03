/**
 * Titularidade econômica dos lançamentos (separação retroativa PF x empresa).
 *
 * O razão é imutável e `ledger_entries.entidade_id` fica como foi gravado (quem registrou). Esta
 * camada append-only (ledger_atribuicoes_titularidade) diz a quem o lançamento pertence
 * economicamente; a vigente é a de maior id, e voltar atrás é gravar outra. Ver schema.sql.
 */
import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";

export interface AtribuicaoTitularidade {
  id: number;
  ledger_entry_id: number;
  titular_economico_id: number;
  motivo: string;
  regra: string | null;
  atribuido_por: number | null;
  atribuido_em: string;
  substitui_id: number | null;
}

function titularVigente(db: Database, ledger_entry_id: number): { atribuicao_id: number | null; titular_id: number } {
  const [a] = consultar<{ id: number; titular_economico_id: number }>(
    db,
    "SELECT id, titular_economico_id FROM ledger_atribuicoes_titularidade WHERE ledger_entry_id = ? ORDER BY id DESC LIMIT 1",
    [ledger_entry_id],
  );
  if (a) return { atribuicao_id: a.id, titular_id: a.titular_economico_id };
  const [le] = consultar<{ entidade_id: number }>(db, "SELECT entidade_id FROM ledger_entries WHERE id = ?", [ledger_entry_id]);
  if (!le) throw new Error(`Lançamento ${ledger_entry_id} não encontrado.`);
  return { atribuicao_id: null, titular_id: le.entidade_id };
}

/** Atribui (ou reatribui) a titularidade econômica de UM lançamento. Idempotente: se o titular
 * vigente já é o pedido, não grava nada e devolve false. */
export function atribuirTitularidade(
  db: Database,
  dados: { ledger_entry_id: number; titular_economico_id: number; motivo: string; regra?: string; atribuido_por?: number },
): boolean {
  if (!dados.motivo || dados.motivo.trim().length < 3) throw new Error("Informe o motivo da atribuição de titularidade.");
  const [titular] = consultar<{ id: number }>(db, "SELECT id FROM entidades_legais WHERE id = ?", [dados.titular_economico_id]);
  if (!titular) throw new Error(`Entidade ${dados.titular_economico_id} não encontrada.`);

  const vigente = titularVigente(db, dados.ledger_entry_id);
  if (vigente.titular_id === dados.titular_economico_id) return false;

  executar(
    db,
    `INSERT INTO ledger_atribuicoes_titularidade
       (ledger_entry_id, titular_economico_id, motivo, regra, atribuido_por, substitui_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [dados.ledger_entry_id, dados.titular_economico_id, dados.motivo.trim(), dados.regra ?? null, dados.atribuido_por ?? null, vigente.atribuicao_id],
  );
  return true;
}

export interface RegraAtribuicao {
  entidade_origem_id: number;
  titular_destino_id: number;
  data_de: string;
  data_ate?: string;
  /** origem_modulo dos lançamentos que passam ao destino (ex.: contratos, imovel-gestao, rateios). */
  origens: string[];
  motivo: string;
  regra: string;
  atribuido_por?: number;
}

/** Atribui em lote ao titular de destino os lançamentos da entidade de origem no intervalo e nos
 * módulos informados. Só mexe nos que ainda pertencem ao titular de origem (nunca desfaz uma
 * atribuição manual para outro). Idempotente. Devolve quantos lançamentos foram atribuídos. */
export function atribuirPorRegra(db: Database, r: RegraAtribuicao): number {
  if (r.origens.length === 0) throw new Error("Informe ao menos um módulo de origem para a regra.");
  const marcadores = r.origens.map(() => "?").join(", ");
  const candidatos = consultar<{ id: number }>(
    db,
    `SELECT id FROM v_ledger_titular_atual
     WHERE entidade_id = ? AND titular_economico_id = ?
       AND data_lancamento >= ? AND data_lancamento <= ?
       AND origem_modulo IN (${marcadores})
     ORDER BY id`,
    [r.entidade_origem_id, r.entidade_origem_id, r.data_de, r.data_ate ?? "9999-12-31", ...r.origens],
  );
  let n = 0;
  for (const c of candidatos) {
    if (atribuirTitularidade(db, { ledger_entry_id: c.id, titular_economico_id: r.titular_destino_id, motivo: r.motivo, regra: r.regra, atribuido_por: r.atribuido_por })) n++;
  }
  return n;
}

/** Quando um lançamento é estornado, o contra-lançamento nasce com a MESMA titularidade do original
 * (senão o estorno ficaria com a entidade que registrou e o saldo do titular não zeraria). */
export function herdarTitularidade(db: Database, original_id: number, reverso_id: number): void {
  const [a] = consultar<{ titular_economico_id: number }>(
    db,
    "SELECT titular_economico_id FROM ledger_atribuicoes_titularidade WHERE ledger_entry_id = ? ORDER BY id DESC LIMIT 1",
    [original_id],
  );
  if (!a) return;
  executar(
    db,
    `INSERT INTO ledger_atribuicoes_titularidade (ledger_entry_id, titular_economico_id, motivo, regra)
     VALUES (?, ?, ?, 'ESTORNO-HERDADO')`,
    [reverso_id, a.titular_economico_id, `Titularidade herdada do lançamento estornado #${original_id}`],
  );
}

export function historicoTitularidade(db: Database, ledger_entry_id: number): AtribuicaoTitularidade[] {
  return consultar<AtribuicaoTitularidade>(
    db,
    "SELECT * FROM ledger_atribuicoes_titularidade WHERE ledger_entry_id = ? ORDER BY id",
    [ledger_entry_id],
  );
}

export interface ResumoTitular {
  titular_economico_id: number;
  total_debito: number;
  total_credito: number;
  lancamentos: number;
}

/** Totais por titular econômico (lançamentos ativos e estornos entram; o líquido zera sozinho). */
export function resumoPorTitular(db: Database): ResumoTitular[] {
  return consultar<ResumoTitular>(
    db,
    `SELECT titular_economico_id,
            COALESCE(SUM(valor_debito), 0) AS total_debito,
            COALESCE(SUM(valor_credito), 0) AS total_credito,
            COUNT(*) AS lancamentos
     FROM v_ledger_titular_atual GROUP BY titular_economico_id ORDER BY titular_economico_id`,
  );
}
