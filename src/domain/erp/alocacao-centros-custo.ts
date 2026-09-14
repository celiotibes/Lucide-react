/**
 * Alocação de Centros de Custo: Rastreamento de Despesas por Imóvel
 * Cada lançamento contábil é alocado a um centro (imóvel ou área)
 * Resultado: Análise de rentabilidade por imóvel
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";

export interface CentroCustoInfo {
  id: number;
  entidade_id: number;
  codigo: string;
  descricao: string;
  tipo: "imovel" | "administrativo" | "operacional";
  ativo: boolean;
}

export interface DespesaPorCentro {
  centro_codigo: string;
  centro_descricao: string;
  tipo_despesa: string;
  valor_total: number;
  percentual_do_centro: number;
  quantidade_lancamentos: number;
}

/** Criar centro de custo para um imóvel */
export function criarCentroCustoImovel(
  db: Database,
  entidade_id: number,
  imovel_id: number,
  nome_imovel: string,
): number {
  const codigo = `IM-${String(imovel_id).padStart(4, "0")}`;

  executar(
    db,
    `INSERT INTO centros_custo (entidade_id, codigo, descricao, tipo, ativo)
     VALUES (?, ?, ?, ?, 1)`,
    [entidade_id, codigo, `Imóvel: ${nome_imovel}`, "imovel"],
  );

  const [result] = consultar<{ id: number }>(
    db,
    `SELECT id FROM centros_custo
     WHERE entidade_id = ? AND codigo = ?`,
    [entidade_id, codigo],
  );

  return result?.id || 0;
}

/** Garantir que todos os imóveis ativos tenham centros de custo */
export function sincronizarCentrosCustoImoveis(
  db: Database,
  entidade_id: number,
): number {
  const imoveis = consultar<{ id: number; apelido: string }>(
    db,
    `SELECT id, apelido FROM imoveis WHERE uso_pessoal = 0 AND financiado = 0`,
    [],
  );

  let criados = 0;

  imoveis.forEach((imovel) => {
    // Verificar se já existe centro para este imóvel
    const [existe] = consultar<{ id: number }>(
      db,
      `SELECT id FROM centros_custo
       WHERE entidade_id = ? AND codigo = ?`,
      [entidade_id, `IM-${String(imovel.id).padStart(4, "0")}`],
    );

    if (!existe) {
      criarCentroCustoImovel(db, entidade_id, imovel.id, imovel.apelido);
      criados++;
    }
  });

  return criados;
}

/** Alocar lançamento contábil a um centro de custo */
export function alocarLancamentoACentro(
  db: Database,
  lancamento_id: number,
  centro_custo_id: number,
): boolean {
  executar(
    db,
    `UPDATE ledger_entries SET centro_custo_id = ? WHERE id = ?`,
    [centro_custo_id, lancamento_id],
  );

  return true;
}

/** Alocar automaticamente rateios ao centro de cada imóvel */
export function alocarRateiosaoCentro(
  db: Database,
  imovel_id: number,
  entidade_id: number,
): number {
  // Obter centro de custo para este imóvel
  const [centro] = consultar<{ id: number }>(
    db,
    `SELECT id FROM centros_custo
     WHERE entidade_id = ? AND codigo = ?`,
    [entidade_id, `IM-${String(imovel_id).padStart(4, "0")}`],
  );

  if (!centro) return 0;

  // Alocar todos os lançamentos de rateio deste imóvel
  const lancamentos = consultar<{ id: number }>(
    db,
    `SELECT id FROM ledger_entries
     WHERE origem_modulo = 'rateios' AND origem_id = ? AND centro_custo_id IS NULL`,
    [imovel_id],
  );

  let alocados = 0;

  lancamentos.forEach((l) => {
    alocarLancamentoACentro(db, l.id, centro.id);
    alocados++;
  });

  return alocados;
}

/** Relatório: Despesas por Centro de Custo */
export function relatorioDespesosPorCentro(
  db: Database,
  entidade_id: number,
  periodo_id: number,
): DespesaPorCentro[] {
  return consultar<DespesaPorCentro>(
    db,
    `SELECT
      cc.codigo as centro_codigo,
      cc.descricao as centro_descricao,
      cp.descricao as tipo_despesa,
      SUM(le.valor_debito + le.valor_credito) as valor_total,
      (SUM(le.valor_debito + le.valor_credito) /
       (SELECT SUM(valor_debito + valor_credito) FROM ledger_entries WHERE periodo_id = ?) * 100) as percentual_do_centro,
      COUNT(le.id) as quantidade_lancamentos
     FROM ledger_entries le
     INNER JOIN centros_custo cc ON le.centro_custo_id = cc.id
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE le.periodo_id = ? AND cc.entidade_id = ?
     GROUP BY cc.id, cp.id
     ORDER BY cc.codigo, cp.descricao`,
    [periodo_id, periodo_id, entidade_id],
  );
}

/** Análise: Rentabilidade por Centro (Imóvel) */
export function analiseRentabilidadePorCentro(
  db: Database,
  entidade_id: number,
  periodo_id: number,
): Array<{
  centro_codigo: string;
  centro_descricao: string;
  receita_total: number;
  despesa_total: number;
  resultado_liquido: number;
  margem_percentual: number;
}> {
  return consultar<{
    centro_codigo: string;
    centro_descricao: string;
    receita_total: number;
    despesa_total: number;
    resultado_liquido: number;
    margem_percentual: number;
  }>(
    db,
    `SELECT
      cc.codigo as centro_codigo,
      cc.descricao as centro_descricao,
      COALESCE(SUM(CASE WHEN cp.grupo = 'receita' THEN le.valor_credito ELSE 0 END), 0) as receita_total,
      COALESCE(SUM(CASE WHEN cp.grupo = 'despesa' THEN le.valor_debito ELSE 0 END), 0) as despesa_total,
      (COALESCE(SUM(CASE WHEN cp.grupo = 'receita' THEN le.valor_credito ELSE 0 END), 0) -
       COALESCE(SUM(CASE WHEN cp.grupo = 'despesa' THEN le.valor_debito ELSE 0 END), 0)) as resultado_liquido,
      CASE WHEN COALESCE(SUM(CASE WHEN cp.grupo = 'receita' THEN le.valor_credito ELSE 0 END), 0) > 0
        THEN ((COALESCE(SUM(CASE WHEN cp.grupo = 'receita' THEN le.valor_credito ELSE 0 END), 0) -
               COALESCE(SUM(CASE WHEN cp.grupo = 'despesa' THEN le.valor_debito ELSE 0 END), 0)) /
              COALESCE(SUM(CASE WHEN cp.grupo = 'receita' THEN le.valor_credito ELSE 0 END), 1) * 100)
        ELSE 0 END as margem_percentual
     FROM centros_custo cc
     LEFT JOIN ledger_entries le ON cc.id = le.centro_custo_id AND le.periodo_id = ?
     LEFT JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE cc.entidade_id = ? AND cc.tipo = 'imovel' AND cc.ativo = 1
     GROUP BY cc.id
     ORDER BY resultado_liquido DESC`,
    [periodo_id, entidade_id],
  );
}

/** Dashboard Operacional: Imóvel com maior/menor rentabilidade */
export function dashboardRentabilidadePorImovel(
  db: Database,
  entidade_id: number,
  periodo_id: number,
): {
  melhor_imovel: { nome: string; margem: number; resultado: number } | null;
  pior_imovel: { nome: string; margem: number; resultado: number } | null;
  rentabilidade_media: number;
} {
  const analise = analiseRentabilidadePorCentro(
    db,
    entidade_id,
    periodo_id,
  );

  if (analise.length === 0) {
    return {
      melhor_imovel: null,
      pior_imovel: null,
      rentabilidade_media: 0,
    };
  }

  const ordenado = [...analise].sort(
    (a, b) => b.margem_percentual - a.margem_percentual,
  );

  const media =
    analise.reduce((sum, a) => sum + a.margem_percentual, 0) / analise.length;

  return {
    melhor_imovel: {
      nome: ordenado[0].centro_descricao,
      margem: ordenado[0].margem_percentual,
      resultado: ordenado[0].resultado_liquido,
    },
    pior_imovel: {
      nome: ordenado[analise.length - 1].centro_descricao,
      margem: ordenado[analise.length - 1].margem_percentual,
      resultado: ordenado[analise.length - 1].resultado_liquido,
    },
    rentabilidade_media: media,
  };
}

/** Transferência de Centros: Alocar despesas entre centros (reclassificação) */
export function reclassificarDespesaEntreCentros(
  db: Database,
  lancamento_id: number,
  centro_origem_id: number,
  centro_destino_id: number,
  motivo: string,
): boolean {
  const [lancamento] = consultar<{ id: number }>(
    db,
    `SELECT id FROM ledger_entries WHERE id = ? AND centro_custo_id = ?`,
    [lancamento_id, centro_origem_id],
  );

  if (!lancamento) return false;

  // Registrar auditoria em log_alteracoes
  executar(
    db,
    `INSERT INTO log_alteracoes (
      tabela, registro_id, operacao, quando, resumo, dados_anteriores, dados_novos
    ) VALUES (?, ?, 'edicao', ?, ?, ?, ?)`,
    [
      "ledger_entries",
      lancamento_id,
      new Date().toISOString(),
      `Reclassificação de centro: ${centro_origem_id} → ${centro_destino_id}. Motivo: ${motivo}`,
      JSON.stringify({ centro_custo_id: centro_origem_id }),
      JSON.stringify({ centro_custo_id: centro_destino_id }),
    ],
  );

  // Atualizar alocação
  executar(
    db,
    `UPDATE ledger_entries SET centro_custo_id = ? WHERE id = ?`,
    [centro_destino_id, lancamento_id],
  );

  return true;
}
