/**
 * Cálculo e persistência de DRE (Demonstração de Resultado do Exercício).
 *
 * Opção A: On-The-Fly (real-time) — calcula somando transações Pluggy + lançamentos contábeis
 * Opção B: Histórico (gravado 1x/dia) — armazena em `dre_periodos` e permite histórico
 *
 * Estrutura DRE:
 * - Receita Operacional: aluguel + honorário advocatício
 * - Receita Extraordinária: outras rendas
 * - Despesa Variável: comissões, tributos sobre receita (proporcionais à receita)
 * - Despesa Fixa: folha de pagamento, condomínio, manutenção, juros (independentes)
 * - Lucro Bruto = Receita Operacional - Despesa Variável
 * - Lucro Líquido = Lucro Bruto - Despesa Fixa + Receita Extraordinária
 */

import Database from "better-sqlite3";
import { randomUUID } from "crypto";

export interface ResultadoDRE {
  ano: number;
  mes: number;
  dataInicio: string; // YYYY-MM-DD
  dataFim: string;   // YYYY-MM-DD

  // Receitas
  receitaAluguel: number;
  receitaHonorario: number;
  receitaExtraordinaria: number;
  receitaTotal: number;

  // Despesas Variáveis
  despesaComissoes: number;
  despesaImpostosReceita: number;
  despesaVariavelTotal: number;

  // Lucro Bruto
  lucroBruto: number;

  // Despesas Fixas
  despesaFolhaPagamento: number;
  despesaCondominio: number;
  despesaManutencao: number;
  despesaJuros: number;
  despesaFixaTotal: number;

  // Resultado Final
  lucroLiquido: number;

  // Metadata
  calculadoEm?: string; // DATETIME do cálculo
}

/**
 * Calcula DRE on-the-fly para um período (data início/fim).
 *
 * Opção A: Real-time, soma transações Pluggy + lançamentos contábeis sem gravar.
 * Cache sugerido: 1h (já que pode envolver múltiplas consultas ao DB).
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

  // TODO: Implementar queries reais que consultam Pluggy + lançamentos contábeis
  // Por agora, retorna estrutura vazia (0) — a integração com Pluggy/lançamentos
  // ficará para a próxima iteração

  const ano = anoFim;
  const mes = mesFim;

  const resultado: ResultadoDRE = {
    ano,
    mes,
    dataInicio,
    dataFim,

    // Receitas (somadas de Pluggy + lançamentos contábeis)
    receitaAluguel: 0,
    receitaHonorario: 0,
    receitaExtraordinaria: 0,
    receitaTotal: 0,

    // Despesas Variáveis
    despesaComissoes: 0,
    despesaImpostosReceita: 0,
    despesaVariavelTotal: 0,

    // Lucro Bruto
    lucroBruto: 0,

    // Despesas Fixas
    despesaFolhaPagamento: 0,
    despesaCondominio: 0,
    despesaManutencao: 0,
    despesaJuros: 0,
    despesaFixaTotal: 0,

    // Resultado Final
    lucroLiquido: 0,
  };

  // Calcula totalizações e resultado final
  resultado.receitaTotal = resultado.receitaAluguel + resultado.receitaHonorario + resultado.receitaExtraordinaria;
  resultado.despesaVariavelTotal = resultado.despesaComissoes + resultado.despesaImpostosReceita;
  resultado.lucroBruto = resultado.receitaAluguel + resultado.receitaHonorario - resultado.despesaVariavelTotal;
  resultado.despesaFixaTotal =
    resultado.despesaFolhaPagamento +
    resultado.despesaCondominio +
    resultado.despesaManutencao +
    resultado.despesaJuros;
  resultado.lucroLiquido = resultado.lucroBruto - resultado.despesaFixaTotal + resultado.receitaExtraordinaria;

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
  const rows = stmt.all(...params) as any[];

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
