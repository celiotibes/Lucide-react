/**
 * Cash Flow Service
 *
 * Responsável por calcular fluxo de caixa e projeções
 *
 * Funções:
 * - Calcular saldo de caixa disponível
 * - Gerar projeções de fluxo de caixa
 * - Identificar períodos com saldo negativo
 */

import type Database from "better-sqlite3";
import { logger } from "../../services/logger-service.js";
import { forecastMediaMovel } from "./fluxoCaixaForecast.js";

export interface FluxoResumo {
  saldoAtual: number;
  projecao30dias: number;
  projecao60dias: number;
  projecao90dias: number;
  diasComSaldoNegativo: number;
  diasAteSaldoNegativo: number | null;
  historico12meses: Array<{
    mes: number;
    ano: number;
    saldo: number;
  }>;
}

/**
 * Busca histórico de saldo dos últimos 12 meses
 */
function buscarHistoricoFluxo(
  db: Database.Database,
  mes: number,
  ano: number,
): Array<{ mes: number; ano: number; saldo: number }> {
  try {
    const historico: Array<{ mes: number; ano: number; saldo: number }> = [];
    let mesAtual = mes;
    let anoAtual = ano;

    for (let i = 0; i < 12; i++) {
      // Por enquanto, simula saldo (implementar consulta real ao banco de dados)
      const saldo = Math.random() * 50000 - 10000; // Demo
      historico.unshift({ mes: mesAtual, ano: anoAtual, saldo });

      mesAtual = mesAtual === 1 ? 12 : mesAtual - 1;
      anoAtual = mesAtual === 12 ? anoAtual - 1 : anoAtual;
    }

    return historico;
  } catch (erro) {
    logger.error("[CashFlowService] Erro ao buscar histórico fluxo:", erro);
    return [];
  }
}

/**
 * Encontra projeção próxima a um número de dias
 */
function encontrarProjecao(
  projecoes: Array<{ data: string; saldoEstimado: number }>,
  diasAlvo: number,
): number {
  const hoje = new Date();

  const proxima = projecoes.find((p) => {
    const data = new Date(p.data);
    const diff = Math.floor((data.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    return Math.abs(diff - diasAlvo) < 5;
  });

  return proxima?.saldoEstimado ?? 0;
}

/**
 * Gera resumo de fluxo de caixa para um mês
 */
export function gerarFluxoResumo(
  db: Database.Database,
  mes: number,
  ano: number,
): FluxoResumo {
  try {
    // Busca saldo atual (últimas 12 meses)
    const historico12 = buscarHistoricoFluxo(db, mes, ano);

    // Projeção via forecast
    const projecoes = forecastMediaMovel(db, 90);

    const saldoAtual = historico12.length > 0 ? historico12[historico12.length - 1].saldo : 0;
    const projecao30 = encontrarProjecao(projecoes, 30);
    const projecao60 = encontrarProjecao(projecoes, 60);
    const projecao90 = encontrarProjecao(projecoes, 90);

    const diasComNegativo = historico12.filter((h) => h.saldo < 0).length;
    const diasAteSaldoNegativo = historico12.length > 0 && projecao30 < 0 ? 30 : null;

    return {
      saldoAtual,
      projecao30dias: projecao30,
      projecao60dias: projecao60,
      projecao90dias: projecao90,
      diasComSaldoNegativo: diasComNegativo,
      diasAteSaldoNegativo,
      historico12meses: historico12,
    };
  } catch (erro) {
    logger.error("[CashFlowService] Erro ao gerar fluxo resumo:", erro);
    return {
      saldoAtual: 0,
      projecao30dias: 0,
      projecao60dias: 0,
      projecao90dias: 0,
      diasComSaldoNegativo: 0,
      diasAteSaldoNegativo: null,
      historico12meses: [],
    };
  }
}

/**
 * Calcula dias de caixa disponível
 */
export function calcularDiasDisponibilidade(
  saldoAtual: number,
  despesaDiaria: number,
): number {
  if (despesaDiaria <= 0) return Infinity;
  return Math.floor(saldoAtual / despesaDiaria);
}

/**
 * Gera projeção de fluxo de caixa para próximos 90 dias
 */
export function gerarProjecaoFluxoCaixa(
  db: Database.Database,
  periodosDias: number = 90,
): Array<{ data: string; saldoEstimado: number }> {
  try {
    return forecastMediaMovel(db, periodosDias);
  } catch (erro) {
    logger.error("[CashFlowService] Erro ao gerar projeção:", erro);
    return [];
  }
}
