/**
 * DRE Calculator Service
 *
 * Responsável por calcular Demonstração de Resultado de Exercício (Income Statement)
 *
 * Funções:
 * - Calcular DRE para um período
 * - Gerar histórico de DRE para múltiplos meses
 * - Calcular variações (período anterior, YTD)
 */

import type Database from "better-sqlite3";
import { logger } from "../../services/logger-service.js";
import { calcularDREPeriodo } from "./dre.js";
import { obterPeriodoMes, obterMesAnterior, calcularVariacaoPercentual } from "./report-helpers.js";

export interface DREResumo {
  receitaTotal: number;
  receitaAluguel: number;
  receitaHonorario: number;
  receitaExtraordinaria: number;
  despesaTotal: number;
  despesaFolhaPagamento: number;
  despesaCondominio: number;
  despesaManutencao: number;
  despesaImpostos: number;
  despesaJuros: number;
  lucroLiquido: number;
  lucroBruto: number;
  variacao: {
    mesAnterior: number; // % de variação
    ytd: number; // % acumulado no ano
  };
  historico: Array<{
    mes: number;
    ano: number;
    receita: number;
    despesa: number;
  }>;
}

/**
 * Calcula variação da DRE em relação ao mês anterior e YTD
 */
function calcularVariacaoDRE(db: Database.Database, mes: number, ano: number): {
  mesAnterior: number;
  ytd: number;
} {
  try {
    // Mês anterior
    const { mes: mesPrecedente, ano: anoPrecedente } = obterMesAnterior(mes, ano);
    const periodoAnterior = obterPeriodoMes(mesPrecedente, anoPrecedente);
    const dreAnterior = calcularDREPeriodo(db, periodoAnterior.inicio, periodoAnterior.fim);

    const variacao = calcularVariacaoPercentual(dreAnterior.receitaTotal, dreAnterior.receitaTotal);

    // YTD (ano até mês atual)
    const dataAnoInicio = `${ano}-01-01`;
    const periodoAtual = obterPeriodoMes(mes, ano);
    const dreYTD = calcularDREPeriodo(db, dataAnoInicio, periodoAtual.fim);

    const ytdVariacao = calcularVariacaoPercentual(dreYTD.receitaTotal, dreAnterior.receitaTotal);

    return { mesAnterior: variacao, ytd: ytdVariacao };
  } catch (erro) {
    logger.error("[DRECalculatorService] Erro ao calcular variação:", erro);
    return { mesAnterior: 0, ytd: 0 };
  }
}

/**
 * Busca histórico de DRE dos últimos N meses
 */
function buscarHistoricoDRE(
  db: Database.Database,
  mes: number,
  ano: number,
  quantosMeses: number = 6,
): Array<{ mes: number; ano: number; receita: number; despesa: number }> {
  try {
    const historico: Array<{ mes: number; ano: number; receita: number; despesa: number }> = [];
    let mesAtual = mes;
    let anoAtual = ano;

    for (let i = 0; i < quantosMeses; i++) {
      const periodo = obterPeriodoMes(mesAtual, anoAtual);
      const dre = calcularDREPeriodo(db, periodo.inicio, periodo.fim);

      historico.unshift({
        mes: mesAtual,
        ano: anoAtual,
        receita: dre.receitaTotal,
        despesa: dre.despesaFixaTotal + dre.despesaVariavelTotal,
      });

      // Retrocede um mês
      if (mesAtual === 1) {
        mesAtual = 12;
        anoAtual--;
      } else {
        mesAtual--;
      }
    }

    return historico;
  } catch (erro) {
    logger.error("[DRECalculatorService] Erro ao buscar histórico DRE:", erro);
    return [];
  }
}

/**
 * Calcula DRE resumo para um período específico
 */
export function calcularDREResumo(
  db: Database.Database,
  mes: number,
  ano: number,
): DREResumo {
  const periodo = obterPeriodoMes(mes, ano);
  const dre = calcularDREPeriodo(db, periodo.inicio, periodo.fim);

  return {
    receitaTotal: dre.receitaTotal,
    receitaAluguel: dre.receitaAluguel,
    receitaHonorario: dre.receitaHonorario,
    receitaExtraordinaria: dre.receitaExtraordinaria,
    despesaTotal: dre.despesaFixaTotal + dre.despesaVariavelTotal,
    despesaFolhaPagamento: dre.despesaFolhaPagamento,
    despesaCondominio: dre.despesaCondominio,
    despesaManutencao: dre.despesaManutencao,
    despesaImpostos: dre.despesaImpostosReceita,
    despesaJuros: dre.despesaJuros,
    lucroLiquido: dre.lucroLiquido,
    lucroBruto: dre.lucroBruto,
    variacao: calcularVariacaoDRE(db, mes, ano),
    historico: buscarHistoricoDRE(db, mes, ano, 6),
  };
}

/**
 * Calcula DRE mensal para múltiplos meses
 */
export function calcularDREMensal(
  db: Database.Database,
  months: Array<{ mes: number; ano: number }>,
): DREResumo[] {
  return months.map((m) => calcularDREResumo(db, m.mes, m.ano));
}
