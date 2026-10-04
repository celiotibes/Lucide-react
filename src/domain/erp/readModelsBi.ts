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
import { fragmentoLedger } from "./criterioBi";

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

// ---------------------------------------------------------------------------------------------
// Comparação bruto x líquido (impacto dos estornos, sem trocar números silenciosamente)
// ---------------------------------------------------------------------------------------------

export interface FiltroComparacaoBrutoLiquido {
  entidadeId?: number;
  titularId?: number;
  contaId?: number;
  grupo?: "receita" | "despesa";
  /** Competência inicial/final inclusivas, 'YYYY-MM'. */
  de?: string;
  ate?: string;
  /** Data de corte (ver CriterioBi.asOf): compara como o BI estava naquele fechamento. */
  asOf?: string;
}

export interface LinhaComparacaoBrutoLiquido {
  competencia: string;
  conta_id: number;
  conta_codigo: string;
  conta_descricao: string;
  grupo: "receita" | "despesa";
  /** crédito − débito do razão cru (par estornado+estornador incluso), em centavos. */
  bruto_centavos: number;
  /** crédito − débito sem o par estornado+estornador (critério das views v_bi_*), em centavos. */
  liquido_centavos: number;
  /** bruto − líquido: o que os estornos pesam naquele mês/conta. */
  diferenca_centavos: number;
}

interface LinhaAgregada {
  competencia: string;
  conta_id: number;
  conta_codigo: string;
  conta_descricao: string;
  grupo: "receita" | "despesa";
  resultado_centavos: number;
}

/** Mesmo universo das views (receita/despesa, sem a zeragem de encerramento), com ou sem o par estornado. */
function agregarRazao(
  db: Database,
  filtro: FiltroComparacaoBrutoLiquido,
  tratamento: "bruto" | "liquido",
): LinhaAgregada[] {
  const frag = fragmentoLedger(
    { tratamentoEstorno: tratamento, de: filtro.de, ate: filtro.ate, asOf: filtro.asOf },
    "t",
  );
  const { where, params } = montarWhere([
    ["t.entidade_id = ?", filtro.entidadeId],
    ["t.titular_economico_id = ?", filtro.titularId],
    ["t.conta_id = ?", filtro.contaId],
    ["cp.grupo = ?", filtro.grupo],
  ]);
  const condicoes = [
    "cp.grupo IN ('receita', 'despesa')",
    "NOT (t.origem_modulo = 'manual' AND t.referencia_documento LIKE 'ENCERRAMENTO-%')",
  ];
  const whereFinal = where ? `${where} AND ${condicoes.join(" AND ")}` : `WHERE ${condicoes.join(" AND ")}`;
  return consultar<LinhaAgregada>(
    db,
    `SELECT printf('%04d-%02d', p.ano, p.mes) AS competencia,
            t.conta_id AS conta_id, cp.codigo AS conta_codigo, cp.descricao AS conta_descricao, cp.grupo AS grupo,
            SUM(CAST(ROUND(COALESCE(t.valor_credito, 0) * 100) AS INTEGER))
              - SUM(CAST(ROUND(COALESCE(t.valor_debito, 0) * 100) AS INTEGER)) AS resultado_centavos
       FROM v_ledger_titular_atual t
       JOIN contas_plano_contas cp ON cp.id = t.conta_id
       JOIN periodos_contabeis p ON p.id = t.periodo_id
       ${whereFinal}${frag.sql}
      GROUP BY competencia, t.conta_id, cp.codigo, cp.descricao, cp.grupo`,
    [...params, ...frag.params],
  );
}

/** Líquido pelas views v_bi_* (sem `asOf`) ou pela mesma regra em SQL direto (com `asOf`, que as views não têm). */
function liquidoPorMesConta(db: Database, filtro: FiltroComparacaoBrutoLiquido): LinhaAgregada[] {
  if (filtro.asOf !== undefined) return agregarRazao(db, filtro, "liquido");
  const linhas = resultadoMensal(db, {
    entidadeId: filtro.entidadeId,
    titularId: filtro.titularId,
    contaId: filtro.contaId,
    grupo: filtro.grupo,
    competenciaDe: filtro.de,
    competenciaAte: filtro.ate,
  });
  const acumulado = new Map<string, LinhaAgregada>();
  for (const l of linhas) {
    const chave = `${l.competencia}|${l.conta_id}`;
    const atual = acumulado.get(chave);
    if (atual) {
      atual.resultado_centavos += l.resultado_centavos;
    } else {
      acumulado.set(chave, {
        competencia: l.competencia,
        conta_id: l.conta_id,
        conta_codigo: l.conta_codigo,
        conta_descricao: l.conta_descricao,
        grupo: l.grupo,
        resultado_centavos: l.resultado_centavos,
      });
    }
  }
  return [...acumulado.values()];
}

/**
 * Por mês e conta de resultado: valor bruto (razão cru), líquido (sem o par estornado+estornador,
 * critério das views v_bi_*) e a diferença. Só leitura; serve para a UI mostrar o impacto dos
 * estornos sem trocar silenciosamente os números exibidos. Todas as linhas são devolvidas
 * (inclusive diferença 0); use `resumirDivergenciaEstornos` para decidir se avisa.
 */
export function compararBrutoLiquido(
  db: Database,
  filtros: FiltroComparacaoBrutoLiquido = {},
): LinhaComparacaoBrutoLiquido[] {
  const bruto = agregarRazao(db, filtros, "bruto");
  const liquido = liquidoPorMesConta(db, filtros);

  const mapa = new Map<string, LinhaComparacaoBrutoLiquido>();
  const obter = (l: LinhaAgregada): LinhaComparacaoBrutoLiquido => {
    const chave = `${l.competencia}|${l.conta_id}`;
    let linha = mapa.get(chave);
    if (!linha) {
      linha = {
        competencia: l.competencia,
        conta_id: l.conta_id,
        conta_codigo: l.conta_codigo,
        conta_descricao: l.conta_descricao,
        grupo: l.grupo,
        bruto_centavos: 0,
        liquido_centavos: 0,
        diferenca_centavos: 0,
      };
      mapa.set(chave, linha);
    }
    return linha;
  };
  for (const l of bruto) obter(l).bruto_centavos = l.resultado_centavos;
  for (const l of liquido) obter(l).liquido_centavos = l.resultado_centavos;

  const linhas = [...mapa.values()];
  for (const l of linhas) l.diferenca_centavos = l.bruto_centavos - l.liquido_centavos;
  return linhas.sort(
    (a, b) => a.competencia.localeCompare(b.competencia) || a.conta_codigo.localeCompare(b.conta_codigo),
  );
}

export interface ResumoDivergenciaEstornos {
  temDivergencia: boolean;
  /** Soma das diferenças (bruto − líquido), em centavos; pode compensar entre contas. */
  diferencaTotalCentavos: number;
  /** Soma dos módulos das diferenças: o tamanho real do desvio, sem compensação. */
  diferencaAbsolutaCentavos: number;
  competenciasAfetadas: string[];
  contasAfetadas: number;
}

export function resumirDivergenciaEstornos(linhas: LinhaComparacaoBrutoLiquido[]): ResumoDivergenciaEstornos {
  const afetadas = linhas.filter((l) => l.diferenca_centavos !== 0);
  return {
    temDivergencia: afetadas.length > 0,
    diferencaTotalCentavos: afetadas.reduce((a, l) => a + l.diferenca_centavos, 0),
    diferencaAbsolutaCentavos: afetadas.reduce((a, l) => a + Math.abs(l.diferenca_centavos), 0),
    competenciasAfetadas: [...new Set(afetadas.map((l) => l.competencia))].sort(),
    contasAfetadas: new Set(afetadas.map((l) => l.conta_id)).size,
  };
}
