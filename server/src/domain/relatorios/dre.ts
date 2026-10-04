/**
 * Cálculo e persistência de DRE (Demonstração de Resultado do Exercício).
 *
 * Opção A: On-The-Fly (real-time) — calcula somando:
 *   - Receitas: asaas_cobrancas (paid invoices)
 *   - Despesas: ledger_entries (categorized expenses) quando disponível
 *
 * Opção B: Histórico (gravado 1x/dia) — armazena em `dre_periodos` e permite histórico
 *
 * Estrutura DRE:
 * - Receita Operacional: aluguel + honorário advocatício
 * - Receita Extraordinária: outras rendas
 * - Despesa Variável: comissões, tributos sobre receita (proporcionais à receita)
 * - Despesa Fixa: folha de pagamento, condomínio, manutenção, juros (independentes)
 * - Lucro Bruto = Receita Operacional - Despesa Variável
 * - Lucro Líquido = Lucro Bruto - Despesa Fixa + Receita Extraordinária
 *
 * Nota sobre centavos: todos os valores no banco são em centavos (DECIMAL com 2 casas decimais).
 * As operações internas usam inteiros (centavos) — conversão para reais (÷100) é feita apenas na exibição.
 */

import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { logger } from "../../services/logger-service.js";

export interface ResultadoDRE {
  ano: number;
  mes: number;
  dataInicio: string; // YYYY-MM-DD
  dataFim: string;   // YYYY-MM-DD

  // Receitas (em centavos)
  receitaAluguel: number;
  receitaHonorario: number;
  receitaExtraordinaria: number;
  receitaTotal: number;

  // Despesas Variáveis (em centavos)
  despesaComissoes: number;
  despesaImpostosReceita: number;
  despesaVariavelTotal: number;

  // Lucro Bruto (em centavos)
  lucroBruto: number;

  // Despesas Fixas (em centavos)
  despesaFolhaPagamento: number;
  despesaCondominio: number;
  despesaManutencao: number;
  despesaJuros: number;
  despesaFixaTotal: number;

  // Resultado Final (em centavos)
  lucroLiquido: number;

  // Metadata
  calculadoEm?: string; // DATETIME do cálculo
}

/**
 * Busca receitas de cobranças pagas (asaas_cobrancas) para um período.
 * Retorna o valor total de cobranças com status 'paga' entre dataInicio e dataFim.
 * Valores em centavos.
 */
function buscarReceitasAsaas(
  db: Database.Database,
  dataInicio: string,
  dataFim: string,
): { aluguel: number; honorario: number; extraordinaria: number } {
  try {
    // Tenta buscar cobranças pagas no período
    // Nota: o schema asaas_cobrancas não tem categoria, então por enquanto
    // todas as cobranças vão para 'aluguel'. Uma versão futura pode ter
    // um campo 'categoria' ou 'tipo' para diferençar aluguel/honorário.
    const stmt = db.prepare(`
      SELECT
        COALESCE(SUM(CAST(valor_pago * 100 AS INTEGER)), 0) as total
      FROM asaas_cobrancas
      WHERE status = 'paga'
        AND data_pagamento IS NOT NULL
        AND data_pagamento >= ?
        AND data_pagamento <= ?
    `);

    const resultado = stmt.get(dataInicio, dataFim) as { total: number } | undefined;
    const total = resultado?.total ?? 0;

    return {
      aluguel: total, // Por enquanto, todas as cobranças são aluguel
      honorario: 0,
      extraordinaria: 0,
    };
  } catch (erro) {
    if (erro instanceof Error && erro.message.includes("no such table")) {
      logger.warn("[DRE] Tabela asaas_cobrancas não existe ainda");
    } else {
      logger.error("[DRE] Erro ao buscar receitas asaas:", erro);
    }
    return { aluguel: 0, honorario: 0, extraordinaria: 0 };
  }
}

/**
 * Busca despesas categorizadas de ledger_entries (quando disponível).
 * Retorna despesas por categoria: comissões, impostos, folha, condomínio, manutenção, juros.
 * Valores em centavos.
 */
function buscarDespesasLedger(
  db: Database.Database,
  dataInicio: string,
  dataFim: string,
): {
  comissoes: number;
  impostos: number;
  folha: number;
  condominio: number;
  manutencao: number;
  juros: number;
} {
  try {
    // Tenta buscar despesas categorizadas se tabela existe
    // Estrutura esperada: ledger_entries com campos (data, categoria, valor, ...)
    // Categorias: 'comissao', 'imposto', 'folha_pagamento', 'condominio', 'manutencao', 'juros'
    const stmt = db.prepare(`
      SELECT
        SUM(CASE WHEN categoria = 'comissao' THEN CAST(valor * 100 AS INTEGER) ELSE 0 END) as comissoes,
        SUM(CASE WHEN categoria = 'imposto' THEN CAST(valor * 100 AS INTEGER) ELSE 0 END) as impostos,
        SUM(CASE WHEN categoria = 'folha_pagamento' THEN CAST(valor * 100 AS INTEGER) ELSE 0 END) as folha,
        SUM(CASE WHEN categoria = 'condominio' THEN CAST(valor * 100 AS INTEGER) ELSE 0 END) as condominio,
        SUM(CASE WHEN categoria = 'manutencao' THEN CAST(valor * 100 AS INTEGER) ELSE 0 END) as manutencao,
        SUM(CASE WHEN categoria = 'juros' THEN CAST(valor * 100 AS INTEGER) ELSE 0 END) as juros
      FROM ledger_entries
      WHERE data >= ?
        AND data <= ?
        AND tipo = 'despesa'
    `);

    const resultado = stmt.get(dataInicio, dataFim) as {
      comissoes: number;
      impostos: number;
      folha: number;
      condominio: number;
      manutencao: number;
      juros: number;
    } | undefined;

    return {
      comissoes: resultado?.comissoes ?? 0,
      impostos: resultado?.impostos ?? 0,
      folha: resultado?.folha ?? 0,
      condominio: resultado?.condominio ?? 0,
      manutencao: resultado?.manutencao ?? 0,
      juros: resultado?.juros ?? 0,
    };
  } catch (erro) {
    if (erro instanceof Error && erro.message.includes("no such table")) {
      logger.debug("[DRE] Tabela ledger_entries não existe ainda");
    } else {
      logger.debug("[DRE] Erro ao buscar despesas ledger (ignorado):", erro);
    }
    return {
      comissoes: 0,
      impostos: 0,
      folha: 0,
      condominio: 0,
      manutencao: 0,
      juros: 0,
    };
  }
}

/**
 * Calcula DRE on-the-fly para um período (data início/fim).
 *
 * Opção A: Real-time, soma receitas de asaas_cobrancas + despesas de ledger_entries.
 * Cache sugerido: 1h (já que pode envolver múltiplas consultas ao DB).
 *
 * Todos os valores retornados estão em centavos (DECIMAL * 100 para inteiros).
 */
export function calcularDREPeriodo(
  db: Database.Database,
  dataInicio: string, // YYYY-MM-DD
  dataFim: string,   // YYYY-MM-DD
): ResultadoDRE {
  const [anoIni, mesIni, diaIni] = dataInicio.split("-").map(Number);
  const [anoFim, mesFim, diaFim] = dataFim.split("-").map(Number);

  // Valida período
  if (anoIni > anoFim || (anoIni === anoFim && mesIni > mesFim)) {
    throw new Error("dataInicio deve ser anterior ou igual a dataFim");
  }

  // Busca dados reais
  const receitas = buscarReceitasAsaas(db, dataInicio, dataFim);
  const despesas = buscarDespesasLedger(db, dataInicio, dataFim);

  const ano = anoFim;
  const mes = mesFim;

  const resultado: ResultadoDRE = {
    ano,
    mes,
    dataInicio,
    dataFim,

    // Receitas (em centavos)
    receitaAluguel: receitas.aluguel,
    receitaHonorario: receitas.honorario,
    receitaExtraordinaria: receitas.extraordinaria,
    receitaTotal: 0, // Será calculado abaixo

    // Despesas Variáveis (em centavos)
    despesaComissoes: despesas.comissoes,
    despesaImpostosReceita: despesas.impostos,
    despesaVariavelTotal: 0, // Será calculado abaixo

    // Lucro Bruto
    lucroBruto: 0, // Será calculado abaixo

    // Despesas Fixas (em centavos)
    despesaFolhaPagamento: despesas.folha,
    despesaCondominio: despesas.condominio,
    despesaManutencao: despesas.manutencao,
    despesaJuros: despesas.juros,
    despesaFixaTotal: 0, // Será calculado abaixo

    // Resultado Final
    lucroLiquido: 0, // Será calculado abaixo
  };

  // Calcula totalizações (em centavos)
  resultado.receitaTotal =
    resultado.receitaAluguel + resultado.receitaHonorario + resultado.receitaExtraordinaria;
  resultado.despesaVariavelTotal = resultado.despesaComissoes + resultado.despesaImpostosReceita;
  resultado.lucroBruto =
    resultado.receitaAluguel + resultado.receitaHonorario - resultado.despesaVariavelTotal;
  resultado.despesaFixaTotal =
    resultado.despesaFolhaPagamento +
    resultado.despesaCondominio +
    resultado.despesaManutencao +
    resultado.despesaJuros;
  resultado.lucroLiquido =
    resultado.lucroBruto - resultado.despesaFixaTotal + resultado.receitaExtraordinaria;

  return resultado;
}

/**
 * Grava resultado do DRE em `dre_periodos` (Opção B: Histórico).
 *
 * Chamado 1x/dia às 23:55 (via scheduler) para capturar resultado mensal.
 * Idempotente: atualiza se já existe para ano/mes.
 */
export function gravarDREPeriodo(
  db: Database.Database,
  ano: number,
  mes: number,
  dre: ResultadoDRE,
): void {
  if (mes < 1 || mes > 12) {
    throw new Error("mês deve estar entre 1 e 12");
  }

  const id = `dre-${ano}-${String(mes).padStart(2, "0")}-${randomUUID()}`;
  const agora = new Date().toISOString();

  // Tenta inserir; se violação de UNIQUE (ano, mes), atualiza
  const stmt = db.prepare(`
    INSERT INTO dre_periodos (
      id, ano, mes,
      receita_aluguel, receita_honorario, receita_extraordinaria, receita_total,
      despesa_comissoes, despesa_impostos_receita, despesa_variavel_total,
      lucro_bruto,
      despesa_folha_pagamento, despesa_condominio, despesa_manutencao, despesa_juros, despesa_fixa_total,
      lucro_liquido,
      calculado_em, criado_em, atualizado_em
    ) VALUES (
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?,
      ?, ?, ?, ?, ?,
      ?,
      ?, ?, ?
    )
    ON CONFLICT(ano, mes) DO UPDATE SET
      receita_aluguel = excluded.receita_aluguel,
      receita_honorario = excluded.receita_honorario,
      receita_extraordinaria = excluded.receita_extraordinaria,
      receita_total = excluded.receita_total,
      despesa_comissoes = excluded.despesa_comissoes,
      despesa_impostos_receita = excluded.despesa_impostos_receita,
      despesa_variavel_total = excluded.despesa_variavel_total,
      lucro_bruto = excluded.lucro_bruto,
      despesa_folha_pagamento = excluded.despesa_folha_pagamento,
      despesa_condominio = excluded.despesa_condominio,
      despesa_manutencao = excluded.despesa_manutencao,
      despesa_juros = excluded.despesa_juros,
      despesa_fixa_total = excluded.despesa_fixa_total,
      lucro_liquido = excluded.lucro_liquido,
      calculado_em = excluded.calculado_em,
      atualizado_em = excluded.atualizado_em
  `);

  stmt.run(
    id,
    ano,
    mes,
    dre.receitaAluguel,
    dre.receitaHonorario,
    dre.receitaExtraordinaria,
    dre.receitaTotal,
    dre.despesaComissoes,
    dre.despesaImpostosReceita,
    dre.despesaVariavelTotal,
    dre.lucroBruto,
    dre.despesaFolhaPagamento,
    dre.despesaCondominio,
    dre.despesaManutencao,
    dre.despesaJuros,
    dre.despesaFixaTotal,
    dre.lucroLiquido,
    agora,
    agora,
    agora,
  );
}

/**
 * Busca DRE gravado (histórico) para ano/mes específico.
 * Retorna null se não existe.
 */
export function buscarDREPeriodo(
  db: Database.Database,
  ano: number,
  mes: number,
): ResultadoDRE | null {
  const stmt = db.prepare(`
    SELECT
      ano, mes,
      receita_aluguel, receita_honorario, receita_extraordinaria, receita_total,
      despesa_comissoes, despesa_impostos_receita, despesa_variavel_total,
      lucro_bruto,
      despesa_folha_pagamento, despesa_condominio, despesa_manutencao, despesa_juros, despesa_fixa_total,
      lucro_liquido,
      calculado_em
    FROM dre_periodos
    WHERE ano = ? AND mes = ?
    LIMIT 1
  `);

  const row = stmt.get(ano, mes) as any;
  if (!row) return null;

  // Reconstrói datas baseado em ano/mes
  const dataInicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const dataFim = new Date(ano, mes, 0); // Último dia do mês
  const dataFimStr = `${ano}-${String(mes).padStart(2, "0")}-${String(dataFim.getDate()).padStart(2, "0")}`;

  return {
    ano: row.ano,
    mes: row.mes,
    dataInicio,
    dataFim: dataFimStr,
    receitaAluguel: row.receita_aluguel,
    receitaHonorario: row.receita_honorario,
    receitaExtraordinaria: row.receita_extraordinaria,
    receitaTotal: row.receita_total,
    despesaComissoes: row.despesa_comissoes,
    despesaImpostosReceita: row.despesa_impostos_receita,
    despesaVariavelTotal: row.despesa_variavel_total,
    lucroBruto: row.lucro_bruto,
    despesaFolhaPagamento: row.despesa_folha_pagamento,
    despesaCondominio: row.despesa_condominio,
    despesaManutencao: row.despesa_manutencao,
    despesaJuros: row.despesa_juros,
    despesaFixaTotal: row.despesa_fixa_total,
    lucroLiquido: row.lucro_liquido,
    calculadoEm: row.calculado_em,
  };
}

/**
 * Lista DRE de um intervalo de períodos (últimos N meses, etc).
 * Retorna array ordenado por ano DESC, mes DESC.
 */
export function listarDREPeriodos(
  db: Database.Database,
  anos?: { anoMin: number; anoMax: number; mesMin?: number; mesMax?: number },
): ResultadoDRE[] {
  let query = `
    SELECT
      ano, mes,
      receita_aluguel, receita_honorario, receita_extraordinaria, receita_total,
      despesa_comissoes, despesa_impostos_receita, despesa_variavel_total,
      lucro_bruto,
      despesa_folha_pagamento, despesa_condominio, despesa_manutencao, despesa_juros, despesa_fixa_total,
      lucro_liquido,
      calculado_em
    FROM dre_periodos
  `;

  const params: (number | string)[] = [];

  if (anos) {
    query += " WHERE 1=1";
    if (anos.anoMin !== undefined) {
      query += " AND ano >= ?";
      params.push(anos.anoMin);
    }
    if (anos.anoMax !== undefined) {
      query += " AND ano <= ?";
      params.push(anos.anoMax);
    }
  }

  query += " ORDER BY ano DESC, mes DESC";

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as Record<string, unknown>[];

  return rows.map((row) => {
    const dataInicio = `${row.ano}-${String(row.mes).padStart(2, "0")}-01`;
    const dataFim = new Date(row.ano, row.mes, 0);
    const dataFimStr = `${row.ano}-${String(row.mes).padStart(2, "0")}-${String(dataFim.getDate()).padStart(2, "0")}`;

    return {
      ano: row.ano,
      mes: row.mes,
      dataInicio,
      dataFim: dataFimStr,
      receitaAluguel: row.receita_aluguel,
      receitaHonorario: row.receita_honorario,
      receitaExtraordinaria: row.receita_extraordinaria,
      receitaTotal: row.receita_total,
      despesaComissoes: row.despesa_comissoes,
      despesaImpostosReceita: row.despesa_impostos_receita,
      despesaVariavelTotal: row.despesa_variavel_total,
      lucroBruto: row.lucro_bruto,
      despesaFolhaPagamento: row.despesa_folha_pagamento,
      despesaCondominio: row.despesa_condominio,
      despesaManutencao: row.despesa_manutencao,
      despesaJuros: row.despesa_juros,
      despesaFixaTotal: row.despesa_fixa_total,
      lucroLiquido: row.lucro_liquido,
      calculadoEm: row.calculado_em,
    };
  });
}
