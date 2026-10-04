/**
 * Read-models para BI (item 13 da auditoria).
 *
 * Consulta SOMENTE as views `v_bi_*` do schema.sql (bloco READ MODELS BI), que somam o razão
 * canônico em centavos INTEIROS, já sem lançamentos estornados/estornadores e com a titularidade
 * econômica vigente. Este módulo não calcula nada em ponto flutuante: as funções de consulta
 * devolvem centavos; a conversão para reais é a borda de apresentação (`emReais`/`centavosParaReais`).
 */

import type { Database } from "sql.js";
import { consultar } from "../../db/connection";

export interface FiltroBi {
  entidadeId?: number;
  /** Titular econômico vigente (overlay `ledger_atribuicoes_titularidade`). */
  titularId?: number;
  /** Competência inicial/final inclusivas no formato 'YYYY-MM'. */
  competenciaDe?: string;
  competenciaAte?: string;
}

export interface FiltroResultadoMensal extends FiltroBi {
  centroCustoId?: number;
  contaId?: number;
  grupo?: "receita" | "despesa";
}

export interface FiltroCentroCusto extends FiltroBi {
  centroCustoId?: number;
  imovelId?: number;
}

export interface FiltroSaldoContas {
  entidadeId?: number;
  titularId?: number;
  contaId?: number;
  grupo?: "ativo" | "passivo" | "patrimonio_liquido" | "receita" | "despesa" | "resultado";
}

export interface LinhaResultadoMensal {
  entidade_id: number;
  titular_economico_id: number;
  periodo_id: number;
  ano: number;
  mes: number;
  competencia: string;
  conta_id: number;
  conta_codigo: string;
  conta_descricao: string;
  grupo: "receita" | "despesa";
  centro_custo_id: number | null;
  centro_custo_codigo: string | null;
  debito_centavos: number;
  credito_centavos: number;
  /** crédito − débito: receita positiva, despesa negativa. */
  resultado_centavos: number;
  qtd_lancamentos: number;
}

export interface LinhaSaldoConta {
  entidade_id: number;
  titular_economico_id: number;
  conta_id: number;
  conta_codigo: string;
  conta_descricao: string;
  grupo: string;
  natureza: "debito" | "credito";
  debito_centavos: number;
  credito_centavos: number;
  /** Segue a natureza da conta (devedora: débito − crédito; credora: crédito − débito). */
  saldo_centavos: number;
  qtd_lancamentos: number;
}

export interface LinhaResultadoCentroCusto {
  entidade_id: number;
  titular_economico_id: number;
  periodo_id: number;
  ano: number;
  mes: number;
  competencia: string;
  centro_custo_id: number | null;
  centro_custo_codigo: string | null;
  centro_custo_descricao: string | null;
  centro_custo_tipo: string | null;
  /** Derivado da convenção de código 'IM-####' (não há FK razão→imóvel). */
  imovel_id: number | null;
  receita_centavos: number;
  despesa_centavos: number;
  resultado_centavos: number;
  qtd_lancamentos: number;
}

/** Borda de apresentação: centavos inteiros → reais. Único ponto de divisão por 100. */
export function centavosParaReais(centavos: number): number {
  return centavos / 100;
}

type EmReais<T> = {
  [K in keyof T as K extends `${infer N}_centavos` ? `${N}_reais` : K]: T[K];
};

/** Converte todos os campos `*_centavos` de uma linha em `*_reais` (apenas para exibição). */
export function emReais<T extends object>(linha: T): EmReais<T> {
  const saida: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(linha)) {
    if (chave.endsWith("_centavos") && typeof valor === "number") {
      saida[`${chave.slice(0, -"_centavos".length)}_reais`] = centavosParaReais(valor);
    } else {
      saida[chave] = valor;
    }
  }
  return saida as EmReais<T>;
}

function montarWhere(condicoes: Array<[string, number | string | undefined]>): {
  where: string;
  params: (string | number)[];
} {
  const partes: string[] = [];
  const params: (string | number)[] = [];
  for (const [sql, valor] of condicoes) {
    if (valor === undefined) continue;
    partes.push(sql);
    params.push(valor);
  }
  return { where: partes.length ? `WHERE ${partes.join(" AND ")}` : "", params };
}

export function resultadoMensal(db: Database, filtro: FiltroResultadoMensal = {}): LinhaResultadoMensal[] {
  const { where, params } = montarWhere([
    ["entidade_id = ?", filtro.entidadeId],
    ["titular_economico_id = ?", filtro.titularId],
    ["centro_custo_id = ?", filtro.centroCustoId],
    ["conta_id = ?", filtro.contaId],
    ["grupo = ?", filtro.grupo],
    ["competencia >= ?", filtro.competenciaDe],
    ["competencia <= ?", filtro.competenciaAte],
  ]);
  return consultar<LinhaResultadoMensal>(
    db,
    `SELECT * FROM v_bi_resultado_mensal ${where} ORDER BY competencia, conta_codigo, centro_custo_id`,
    params,
  );
}

export function saldoPorConta(db: Database, filtro: FiltroSaldoContas = {}): LinhaSaldoConta[] {
  const { where, params } = montarWhere([
    ["entidade_id = ?", filtro.entidadeId],
    ["titular_economico_id = ?", filtro.titularId],
    ["conta_id = ?", filtro.contaId],
    ["grupo = ?", filtro.grupo],
  ]);
  return consultar<LinhaSaldoConta>(db, `SELECT * FROM v_bi_saldo_contas ${where} ORDER BY conta_codigo`, params);
}

export function resultadoPorCentroCusto(
  db: Database,
  filtro: FiltroCentroCusto = {},
): LinhaResultadoCentroCusto[] {
  const { where, params } = montarWhere([
    ["entidade_id = ?", filtro.entidadeId],
    ["titular_economico_id = ?", filtro.titularId],
    ["centro_custo_id = ?", filtro.centroCustoId],
    ["imovel_id = ?", filtro.imovelId],
    ["competencia >= ?", filtro.competenciaDe],
    ["competencia <= ?", filtro.competenciaAte],
  ]);
  return consultar<LinhaResultadoCentroCusto>(
    db,
    `SELECT * FROM v_bi_resultado_por_centro_custo ${where} ORDER BY competencia, centro_custo_codigo`,
    params,
  );
}
