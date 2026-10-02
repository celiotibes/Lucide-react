/**
 * Sistema de Análise de Margens por Propriedade
 *
 * Calcula a margem operacional de cada propriedade aluguel:
 * Margem % = (Receita Aluguel - Despesa da Propriedade) / Receita Aluguel * 100
 *
 * Receita: aluguel mensal cobrado
 * Despesa: IPTU + condomínio + manutenção + consertos + reformas (do imóvel)
 *
 * Status da margem:
 * - OK (verde): > 70% - propriedade muito rentável
 * - ATENÇÃO (amarelo): 50-70% - investigar custos
 * - CRÍTICO (vermelho): < 50% - rever preço aluguel ou reduzir despesas
 */

import type { Database } from "better-sqlite3";

/** Status de uma margem de propriedade */
export type MargemStatus = "OK" | "ATENÇÃO" | "CRÍTICO";

/** Resultado do cálculo de margem para uma propriedade */
export interface MargemImovel {
  imovelId: number;
  nomeProriedade: string;
  periodo: string; // YYYY-MM
  receita: number; // Receita bruta de aluguel (em centavos)
  despesa: number; // Despesa total (IPTU + condomínio + manutenção + consertos) (em centavos)
  margem: number; // Margem percentual (0-100)
  status: MargemStatus;
  calculadoEm: string; // ISO datetime
}

/** Dados agregados para ranking */
export interface MargemRankingItem {
  rank: number;
  imovelId: number;
  nomePropriedade: string;
  receita: number; // em centavos
  despesa: number; // em centavos
  margem: number; // percentual
  status: MargemStatus;
}

/** Histórico de uma propriedade */
export interface MargemHistorico {
  imovelId: number;
  nomePropriedade: string;
  periodos: Array<{
    periodo: string; // YYYY-MM
    receita: number;
    despesa: number;
    margem: number;
    status: MargemStatus;
  }>;
}

/**
 * Categorias de despesa que contam como "despesa da propriedade"
 * Mapeamento de categorias Pluggy/Asaas para tipos de despesa
 */
const CATEGORIAS_DESPESA_PROPRIEDADE = [
  "Impostos", // IPTU, INSS, etc
  "Condomínio", // Taxa de condomínio
  "Manutenção", // Consertos, reparos, pintura, reforma
];

/**
 * Calcula a margem operacional de um imóvel para um período específico
 *
 * @param db Database
 * @param imovelId ID da propriedade
 * @param ano Ano (ex: 2026)
 * @param mes Mês (1-12)
 * @returns MargemImovel com receita, despesa e margem calculada
 */
export function calcularMargensImovel(
  db: Database,
  imovelId: number,
  ano: number,
  mes: number
): MargemImovel {
  // Validação básica
  if (!Number.isInteger(imovelId) || imovelId <= 0) {
    throw new Error(`imovelId inválido: ${imovelId}`);
  }
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    throw new Error(`ano inválido: ${ano}`);
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new Error(`mes inválido: ${mes}`);
  }

  // Buscar dados do imóvel
  const imovel = db
    .prepare("SELECT id, nome FROM imoveis WHERE id = ?")
    .get(imovelId) as { id: number; nome: string } | undefined;

  if (!imovel) {
    throw new Error(`Imóvel não encontrado: ${imovelId}`);
  }

  // Calcular data de início e fim do período
  const dataInicio = new Date(ano, mes - 1, 1);
  const dataFim = new Date(ano, mes + 1, 0, 23, 59, 59);

  // Buscar aluguel recebido (receita do imóvel)
  const receita = db
    .prepare(
      `
      SELECT COALESCE(SUM(valor), 0) as total
      FROM transacoes
      WHERE imovel_id = ?
        AND data >= ? AND data <= ?
        AND tipo = 'RECEITA'
        AND descricao LIKE '%aluguel%' COLLATE NOCASE
    `
    )
    .get(imovelId, dataInicio.toISOString(), dataFim.toISOString()) as {
    total: number;
  };

  // Buscar despesas da propriedade (IPTU, condomínio, manutenção, consertos)
  const despesa = db
    .prepare(
      `
      SELECT COALESCE(SUM(t.valor), 0) as total
      FROM transacoes t
      WHERE t.imovel_id = ?
        AND t.data >= ? AND t.data <= ?
        AND t.tipo = 'DESPESA'
        AND (
          t.categoria COLLATE NOCASE IN (?, ?, ?)
          OR t.descricao LIKE '%iptu%' COLLATE NOCASE
          OR t.descricao LIKE '%condominio%' COLLATE NOCASE
          OR t.descricao LIKE '%manutencao%' COLLATE NOCASE
          OR t.descricao LIKE '%manutenção%' COLLATE NOCASE
          OR t.descricao LIKE '%conserto%' COLLATE NOCASE
          OR t.descricao LIKE '%reforma%' COLLATE NOCASE
        )
    `
    )
    .get(
      imovelId,
      dataInicio.toISOString(),
      dataFim.toISOString(),
      "Impostos",
      "Condomínio",
      "Manutenção"
    ) as { total: number };

  const receitaValor = Math.max(receita.total, 0);
  const despesaValor = Math.max(despesa.total, 0);

  // Calcular margem
  let margemPercentual = 0;
  if (receitaValor > 0) {
    margemPercentual = ((receitaValor - despesaValor) / receitaValor) * 100;
    margemPercentual = Math.max(0, Math.min(100, margemPercentual)); // Clamp 0-100
  }

  // Determinar status
  const status = determinarStatus(margemPercentual);

  const periodo = `${ano}-${String(mes).padStart(2, "0")}`;

  return {
    imovelId,
    nomeProriedade: imovel.nome,
    periodo,
    receita: receitaValor,
    despesa: despesaValor,
    margem: Math.round(margemPercentual * 100) / 100, // 2 casas decimais
    status,
    calculadoEm: new Date().toISOString(),
  };
}

/**
 * Persiste o cálculo de margem no banco de dados
 *
 * @param db Database
 * @param ano Ano
 * @param mes Mês
 * @param margem Dados de margem calculados
 */
export function gravarMargensImovel(db: Database, ano: number, mes: number, margem: MargemImovel): void {
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    throw new Error(`ano inválido: ${ano}`);
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new Error(`mes inválido: ${mes}`);
  }
  if (!margem || typeof margem !== "object") {
    throw new Error("margem é obrigatório");
  }
  if (!Number.isInteger(margem.imovelId) || margem.imovelId <= 0) {
    throw new Error(`margem.imovelId inválido: ${margem.imovelId}`);
  }
  if (margem.receita < 0) {
    throw new Error(`margem.receita não pode ser negativa: ${margem.receita}`);
  }
  if (margem.despesa < 0) {
    throw new Error(`margem.despesa não pode ser negativa: ${margem.despesa}`);
  }
  if (typeof margem.margem !== "number" || margem.margem < 0 || margem.margem > 100) {
    throw new Error(`margem.margem deve estar entre 0 e 100: ${margem.margem}`);
  }

  const agora = new Date().toISOString();
  const periodo = `${ano}-${String(mes).padStart(2, "0")}`;

  const stmt = db.prepare(
    `
    INSERT INTO margens_propriedades_periodo
      (periodo, ano, mes, imovel_id, receita, despesa, margem, status, calculado_em, criado_em, atualizado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (imovel_id, ano, mes) DO UPDATE SET
      receita = excluded.receita,
      despesa = excluded.despesa,
      margem = excluded.margem,
      status = excluded.status,
      calculado_em = excluded.calculado_em,
      atualizado_em = ?
  `
  );

  stmt.run(
    periodo,
    ano,
    mes,
    margem.imovelId,
    margem.receita,
    margem.despesa,
    margem.margem,
    margem.status,
    margem.calculadoEm,
    agora,
    agora,
    agora
  );
}

/**
 * Recupera margens de um imóvel para um período (últimos N meses)
 *
 * @param db Database
 * @param imovelId ID do imóvel
 * @param dataInicio Data início (YYYY-MM-DD)
 * @param dataFim Data fim (YYYY-MM-DD)
 * @returns Array com histórico de margens
 */
export function obterMargensHistorico(
  db: Database,
  imovelId: number,
  dataInicio: string,
  dataFim: string
): MargemHistorico {
  if (!Number.isInteger(imovelId) || imovelId <= 0) {
    throw new Error(`imovelId inválido: ${imovelId}`);
  }

  const imovel = db
    .prepare("SELECT id, nome FROM imoveis WHERE id = ?")
    .get(imovelId) as { id: number; nome: string } | undefined;

  if (!imovel) {
    throw new Error(`Imóvel não encontrado: ${imovelId}`);
  }

  // Parsear datas
  const [anoInicio, mesInicio] = dataInicio.split("-").slice(0, 2).map(Number);
  const [anoFim, mesFim] = dataFim.split("-").slice(0, 2).map(Number);

  if (!anoInicio || !mesInicio || !anoFim || !mesFim) {
    throw new Error("Datas devem estar no formato YYYY-MM-DD");
  }

  const periodos = db
    .prepare(
      `
      SELECT periodo, receita, despesa, margem, status
      FROM margens_propriedades_periodo
      WHERE imovel_id = ?
        AND (ano > ? OR (ano = ? AND mes >= ?))
        AND (ano < ? OR (ano = ? AND mes <= ?))
      ORDER BY ano ASC, mes ASC
    `
    )
    .all(imovelId, anoInicio, anoInicio, mesInicio, anoFim, anoFim, mesFim) as Array<{
    periodo: string;
    receita: number;
    despesa: number;
    margem: number;
    status: MargemStatus;
  }>;

  return {
    imovelId,
    nomePropriedade: imovel.nome,
    periodos,
  };
}

/**
 * Retorna ranking de margens (top 5 mais rentáveis + bottom 5 menos rentáveis)
 * para um período específico
 *
 * @param db Database
 * @param ano Ano
 * @param mes Mês
 * @returns { top5: MargemRankingItem[], bottom5: MargemRankingItem[] }
 */
export function obterMargensRanking(
  db: Database,
  ano: number,
  mes: number
): { top5: MargemRankingItem[]; bottom5: MargemRankingItem[] } {
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    throw new Error(`ano inválido: ${ano}`);
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new Error(`mes inválido: ${mes}`);
  }

  const periodo = `${ano}-${String(mes).padStart(2, "0")}`;

  // Top 5 - Maiores margens
  const top5 = db
    .prepare(
      `
      SELECT
        ROW_NUMBER() OVER (ORDER BY m.margem DESC) as rank,
        i.id as imovelId,
        i.nome as nomePropriedade,
        m.receita,
        m.despesa,
        m.margem,
        m.status
      FROM margens_propriedades_periodo m
      JOIN imoveis i ON i.id = m.imovel_id
      WHERE m.periodo = ?
      ORDER BY m.margem DESC
      LIMIT 5
    `
    )
    .all(periodo) as MargemRankingItem[];

  // Bottom 5 - Menores margens
  const bottom5 = db
    .prepare(
      `
      SELECT
        ROW_NUMBER() OVER (ORDER BY m.margem ASC) as rank,
        i.id as imovelId,
        i.nome as nomePropriedade,
        m.receita,
        m.despesa,
        m.margem,
        m.status
      FROM margens_propriedades_periodo m
      JOIN imoveis i ON i.id = m.imovel_id
      WHERE m.periodo = ?
      ORDER BY m.margem ASC
      LIMIT 5
    `
    )
    .all(periodo) as MargemRankingItem[];

  return { top5, bottom5 };
}

/**
 * Calcula e persiste margens para TODOS os imóveis em um período
 * Útil para execução diária (23:55)
 *
 * @param db Database
 * @param ano Ano
 * @param mes Mês
 * @returns Array com margens calculadas
 */
export function calcularEGravarMargensDoMes(db: Database, ano: number, mes: number): MargemImovel[] {
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    throw new Error(`ano inválido: ${ano}`);
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new Error(`mes inválido: ${mes}`);
  }

  // Buscar todos os imóveis ativos
  const imoveis = db
    .prepare("SELECT id FROM imoveis WHERE status = 'ATIVO' OR status IS NULL")
    .all() as Array<{ id: number }>;

  const margens: MargemImovel[] = [];

  for (const { id: imovelId } of imoveis) {
    const margem = calcularMargensImovel(db, imovelId, ano, mes);
    gravarMargensImovel(db, ano, mes, margem);
    margens.push(margem);
  }

  return margens;
}

/**
 * Determine o status baseado na margem percentual
 */
function determinarStatus(margemPercentual: number): MargemStatus {
  if (margemPercentual >= 70) return "OK";
  if (margemPercentual >= 50) return "ATENÇÃO";
  return "CRÍTICO";
}
