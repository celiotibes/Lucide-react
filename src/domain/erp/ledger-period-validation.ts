/**
 * Validação de Período Fechado
 * Impede adição de lançamentos em períodos fechados
 * Implementa verificações antes de inserção no ledger
 */

import type { Database } from "sql.js";
import { consultar } from "../../db/connection";

export class PeriodoFechadoError extends Error {
  constructor(periodo_id: number, periodo_descricao?: string) {
    super(
      `Período ${periodo_descricao || `ID ${periodo_id}`} está fechado. Impossível adicionar lançamentos. ` +
      `Somente operações de auditoria são permitidas.`
    );
    this.name = "PeriodoFechadoError";
  }
}

/**
 * Valida se um período está aberto antes de permitir lançamentos
 * @param db Database instance
 * @param periodo_id ID do período a validar
 * @returns { aberto: boolean, periodo?: {...} }
 */
export function validarPeriodoAberto(
  db: Database,
  periodo_id: number
): { aberto: boolean; periodo?: any; erro?: string } {
  const [periodo] = consultar<{
    id: number;
    ano: number;
    mes: number;
    status: string;
  }>(
    db,
    `SELECT id, ano, mes, status
     FROM periodos_contabeis
     WHERE id = ?`,
    [periodo_id]
  );

  if (!periodo) {
    return { aberto: false, erro: `Período ID ${periodo_id} não encontrado` };
  }

  if (periodo.status === "fechado") {
    return {
      aberto: false,
      periodo,
      erro: `Período ${periodo.ano}/${String(periodo.mes).padStart(2, "0")} está fechado`,
    };
  }

  return { aberto: true, periodo };
}

/**
 * Lança exceção se período estiver fechado
 * Deve ser chamado ANTES de qualquer INSERT no ledger
 */
export function assegurarPeriodoAberto(
  db: Database,
  periodo_id: number
): void {
  const validacao = validarPeriodoAberto(db, periodo_id);

  if (!validacao.aberto) {
    const periodo = validacao.periodo;
    if (periodo) {
      throw new PeriodoFechadoError(
        periodo_id,
        `${periodo.ano}/${String(periodo.mes).padStart(2, "0")}`
      );
    } else {
      throw new Error(validacao.erro);
    }
  }
}

/**
 * Obtém informações formatadas do período para mensagens ao usuário
 */
export function obterDescricaoPeriodo(
  db: Database,
  periodo_id: number
): string {
  const [periodo] = consultar<{ ano: number; mes: number; status: string }>(
    db,
    `SELECT ano, mes, status FROM periodos_contabeis WHERE id = ?`,
    [periodo_id]
  );

  if (!periodo) return `Período (ID ${periodo_id})`;

  const mes_nome = [
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
  ][periodo.mes - 1];

  const status_label = periodo.status === "fechado" ? "[FECHADO]" : "[ABERTO]";

  return `${mes_nome}/${periodo.ano} ${status_label}`;
}
