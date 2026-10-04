/**
 * Critério de apuração do BI: tratamento de estornos, filtro de período (competência) e
 * data de corte (`asOf`).
 *
 * Tudo aqui é SOMENTE LEITURA: só devolve fragmentos de SQL (cláusulas AND) e parâmetros, que
 * as funções de BI anexam ao WHERE (ou ao ON de um LEFT JOIN) da consulta que já tinham.
 * Sem opções (ou com `tratamentoEstorno: 'bruto'` e sem período/`asOf`) o fragmento é VAZIO:
 * o SQL fica byte a byte o mesmo de antes — é o que garante que os números exibidos por
 * padrão não mudam.
 *
 * Colunas usadas de `ledger_entries` (todas existem no schema): `criado_em`
 * (DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 'YYYY-MM-DD HH:MM:SS' em UTC),
 * `estornado_por_id`, `estorno_de_id`, `periodo_id` (-> periodos_contabeis.ano/mes).
 * NÃO existe coluna de "data de estorno": o momento do estorno é o `criado_em` da linha
 * reversa (a apontada por `estornado_por_id`) — é por ele que `asOf` decide se o par já
 * estava anulado na data de corte.
 */

export type TratamentoEstorno = "bruto" | "liquido";

export interface CriterioBi {
  /**
   * 'bruto' (padrão): soma o razão como está, par estornado+estornador incluso (comportamento
   * histórico). 'liquido': exclui o par inteiro, o mesmo critério das views `v_bi_*`.
   */
  tratamentoEstorno?: TratamentoEstorno;
  /** Competência inicial inclusiva, 'YYYY-MM' (mês do período contábil do lançamento). */
  de?: string;
  /** Competência final inclusiva, 'YYYY-MM'. */
  ate?: string;
  /**
   * Data de corte: só lançamentos com `criado_em` <= asOf ('YYYY-MM-DD' vale o dia inteiro, ou
   * 'YYYY-MM-DD HH:MM[:SS]' / ISO). Com 'liquido', um par só conta como estornado se o reverso
   * já existia na data de corte. Reconstitui o que o BI mostraria naquele fechamento.
   */
  asOf?: string;
}

export interface FragmentoSql {
  /** Vazio ou começando por ' AND '. */
  sql: string;
  params: string[];
}

const RE_COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;
const RE_ASOF = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?(?:\.\d+)?Z?$/;

export function validarCompetencia(valor: string, nome: string): string {
  if (!RE_COMPETENCIA.test(valor)) {
    throw new Error(`${nome} deve estar no formato YYYY-MM (recebido: ${valor})`);
  }
  return valor;
}

/** Normaliza `asOf` para o formato de `criado_em` ('YYYY-MM-DD HH:MM:SS'), comparável como texto. */
export function normalizarAsOf(valor: string): string {
  if (!RE_ASOF.test(valor)) {
    throw new Error(`asOf deve ser 'YYYY-MM-DD' ou 'YYYY-MM-DD HH:MM[:SS]' (recebido: ${valor})`);
  }
  if (valor.length === 10) return `${valor} 23:59:59`;
  const base = valor.replace("T", " ").replace(/\.\d+/, "").replace(/Z$/, "");
  return base.length === 16 ? `${base}:59` : base;
}

/** True quando o critério não muda nada em relação ao comportamento histórico. */
export function criterioEhPadrao(criterio?: CriterioBi): boolean {
  if (!criterio) return true;
  return (
    (criterio.tratamentoEstorno ?? "bruto") === "bruto" &&
    criterio.de === undefined &&
    criterio.ate === undefined &&
    criterio.asOf === undefined
  );
}

/**
 * Condições adicionais sobre `ledger_entries` aliasada como `alias`. Anexar ao fim de um WHERE
 * (ou de um ON) e os `params` ao fim do array de parâmetros, nesta ordem.
 */
export function fragmentoLedger(criterio?: CriterioBi, alias = "le"): FragmentoSql {
  if (criterioEhPadrao(criterio)) return { sql: "", params: [] };
  const c = criterio as CriterioBi;
  const trat = c.tratamentoEstorno ?? "bruto";
  if (trat !== "bruto" && trat !== "liquido") {
    throw new Error(`tratamentoEstorno inválido: ${String(trat)}`);
  }

  let sql = "";
  const params: string[] = [];

  if (c.de !== undefined || c.ate !== undefined) {
    const cond: string[] = [];
    if (c.de !== undefined) {
      cond.push("printf('%04d-%02d', pcb.ano, pcb.mes) >= ?");
      params.push(validarCompetencia(c.de, "de"));
    }
    if (c.ate !== undefined) {
      cond.push("printf('%04d-%02d', pcb.ano, pcb.mes) <= ?");
      params.push(validarCompetencia(c.ate, "ate"));
    }
    sql += ` AND ${alias}.periodo_id IN (SELECT pcb.id FROM periodos_contabeis pcb WHERE ${cond.join(" AND ")})`;
  }

  const asOf = c.asOf !== undefined ? normalizarAsOf(c.asOf) : undefined;
  if (asOf !== undefined) {
    sql += ` AND ${alias}.criado_em <= ?`;
    params.push(asOf);
  }

  if (trat === "liquido") {
    if (asOf === undefined) {
      sql += ` AND ${alias}.estornado_por_id IS NULL AND ${alias}.estorno_de_id IS NULL`;
    } else {
      // Reversos nunca contam; o original só sai se o reverso já existia na data de corte.
      sql +=
        ` AND ${alias}.estorno_de_id IS NULL` +
        ` AND NOT (${alias}.estornado_por_id IS NOT NULL AND EXISTS (` +
        `SELECT 1 FROM ledger_entries rev WHERE rev.id = ${alias}.estornado_por_id AND rev.criado_em <= ?))`;
      params.push(asOf);
    }
  }

  return { sql, params };
}

/**
 * True se dois resultados de BI (calculados com critérios diferentes) não são idênticos.
 * Usado pela UI para avisar quando "considerar" e "desconsiderar" estornos dão números diferentes.
 */
export function resultadosDivergem(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

/** O outro critério (para comparar o exibido com o alternativo). */
export function tratamentoAlternativo(t: TratamentoEstorno): TratamentoEstorno {
  return t === "bruto" ? "liquido" : "bruto";
}
