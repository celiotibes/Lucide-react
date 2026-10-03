/**
 * Fechamento de período: leitura de apoio para a tela de encerramento.
 *
 * A lógica que decide se um período FECHA — validarBalanceamento, gerarBalancete,
 * encerrarPeriodo — já existe em src/domain/erp/ledger.ts e não é reproduzida aqui. Este
 * módulo só junta o que falta para listar os períodos na tela: totais de movimento e o
 * hash do último encerramento (quando houver), que ledger.ts não expõe como consulta.
 */

import type { Database } from "sql.js";
import { consultar } from "../../db/connection";

export interface PeriodoContabilResumo {
  id: number;
  entidade_id: number;
  ano: number;
  mes: number;
  status: "aberto" | "fechado";
  data_abertura: string;
  data_fechamento: string | null;
  total_debito: number;
  total_credito: number;
  qtd_lancamentos: number;
}

/** Períodos contábeis da entidade, mais recentes primeiro (ano/mês decrescente). */
export function listarPeriodosContabeis(
  db: Database,
  entidade_id: number,
): PeriodoContabilResumo[] {
  return consultar<PeriodoContabilResumo>(
    db,
    `SELECT
      p.id, p.entidade_id, p.ano, p.mes, p.status, p.data_abertura, p.data_fechamento,
      COALESCE((SELECT SUM(valor_debito) FROM ledger_entries WHERE periodo_id = p.id), 0) AS total_debito,
      COALESCE((SELECT SUM(valor_credito) FROM ledger_entries WHERE periodo_id = p.id), 0) AS total_credito,
      (SELECT COUNT(*) FROM ledger_entries WHERE periodo_id = p.id) AS qtd_lancamentos
     FROM periodos_contabeis p
     WHERE p.entidade_id = ?
     ORDER BY p.ano DESC, p.mes DESC`,
    [entidade_id],
  );
}

export interface EncerramentoRegistro {
  id: number;
  data_encerramento: string;
  encerrado_por: number | null;
  total_debito: number;
  total_credito: number;
  balancete_OK: number;
  hash_snapshot: string | null;
  observacoes: string | null;
}

/** Último registro de encerramento de um período (o mais recente, caso exista mais de
 * um — não deveria, mas a tabela não impede). Usado para exibir o hash_snapshot depois
 * de fechado: é ele que prova que o balancete apresentado hoje é o mesmo do fechamento. */
export function obterUltimoEncerramento(
  db: Database,
  periodo_id: number,
): EncerramentoRegistro | null {
  return (
    consultar<EncerramentoRegistro>(
      db,
      `SELECT id, data_encerramento, encerrado_por, total_debito, total_credito,
              balancete_OK, hash_snapshot, observacoes
       FROM ledger_encerramentos
       WHERE periodo_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      [periodo_id],
    )[0] ?? null
  );
}

export const NOME_MES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
