/**
 * Accounts Service
 *
 * Responsável por calcular contas a receber e a pagar
 *
 * Funções:
 * - Calcular contas vencidas
 * - Listar maiores devedores
 * - Gerar resumo de contas a receber/pagar
 */

import type Database from "better-sqlite3";
import { logger } from "../../services/logger-service.js";

export interface ContasResumo {
  aReceber: {
    total: number;
    vencido: number;
    proximo30dias: number;
    percentualVencido: number;
    topDevedores: Array<{
      nome: string;
      valor: number;
      diasVencido: number;
    }>;
  };
  aPagar: {
    total: number;
    vencido: number;
    proximo30dias: number;
    percentualVencido: number;
  };
}

/**
 * Gera resumo de contas a receber e a pagar
 */
export function gerarContasResumo(db: Database.Database): ContasResumo {
  try {
    const hoje = new Date();
    const data30DiasADelante = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Contas a receber
    const contasReceberStmt = db.prepare(`
      SELECT
        COALESCE(SUM(valor), 0) as total,
        COALESCE(SUM(CASE WHEN data_vencimento < ? THEN valor ELSE 0 END), 0) as vencido,
        COALESCE(SUM(CASE WHEN data_vencimento BETWEEN ? AND ? THEN valor ELSE 0 END), 0) as proximo30
      FROM contas_a_receber
      WHERE pago = 0 AND deletado = 0
    `);

    const contasReceber = contasReceberStmt.get(
      hoje.toISOString().split("T")[0],
      hoje.toISOString().split("T")[0],
      data30DiasADelante.toISOString().split("T")[0],
    ) as any;

    const totalReceber = contasReceber.total || 0;
    const vencidoReceber = contasReceber.vencido || 0;
    const proximo30Receber = contasReceber.proximo30 || 0;

    // Top devedores
    const topDevedoresStmt = db.prepare(`
      SELECT
        nome,
        COALESCE(SUM(valor), 0) as valor,
        CAST((julianday('now') - julianday(MIN(data_vencimento))) AS INTEGER) as diasVencido
      FROM contas_a_receber
      WHERE pago = 0 AND deletado = 0 AND data_vencimento < date('now')
      GROUP BY nome
      ORDER BY valor DESC
      LIMIT 5
    `);

    const topDevedores = (topDevedoresStmt.all() as any[])
      .map((row) => ({
        nome: row.nome,
        valor: row.valor,
        diasVencido: row.diasVencido || 0,
      }))
      .filter((d) => d.valor > 0);

    // Contas a pagar
    const contasPagarStmt = db.prepare(`
      SELECT
        COALESCE(SUM(valor), 0) as total,
        COALESCE(SUM(CASE WHEN data_vencimento < ? THEN valor ELSE 0 END), 0) as vencido,
        COALESCE(SUM(CASE WHEN data_vencimento BETWEEN ? AND ? THEN valor ELSE 0 END), 0) as proximo30
      FROM contas_a_pagar
      WHERE pago = 0 AND deletado = 0
    `);

    const contasPagar = contasPagarStmt.get(
      hoje.toISOString().split("T")[0],
      hoje.toISOString().split("T")[0],
      data30DiasADelante.toISOString().split("T")[0],
    ) as any;

    const totalPagar = contasPagar.total || 0;
    const vencidoPagar = contasPagar.vencido || 0;
    const proximo30Pagar = contasPagar.proximo30 || 0;

    return {
      aReceber: {
        total: totalReceber,
        vencido: vencidoReceber,
        proximo30dias: proximo30Receber,
        percentualVencido: totalReceber > 0 ? Math.round((vencidoReceber / totalReceber) * 100) : 0,
        topDevedores,
      },
      aPagar: {
        total: totalPagar,
        vencido: vencidoPagar,
        proximo30dias: proximo30Pagar,
        percentualVencido: totalPagar > 0 ? Math.round((vencidoPagar / totalPagar) * 100) : 0,
      },
    };
  } catch (erro) {
    logger.error("[AccountsService] Erro ao gerar contas resumo:", erro);
    return {
      aReceber: {
        total: 0,
        vencido: 0,
        proximo30dias: 0,
        percentualVencido: 0,
        topDevedores: [],
      },
      aPagar: {
        total: 0,
        vencido: 0,
        proximo30dias: 0,
        percentualVencido: 0,
      },
    };
  }
}

/**
 * Calcula taxa de inadimplência
 */
export function calcularInadeplacencia(db: Database.Database): number {
  try {
    const stmt = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN data_vencimento < date('now') AND pago = 0 THEN valor ELSE 0 END), 0) as vencido,
        COALESCE(SUM(valor), 0) as total
      FROM contas_a_receber
      WHERE deletado = 0
    `);

    const resultado = stmt.get() as any;
    const vencido = resultado.vencido || 0;
    const total = resultado.total || 0;

    return total > 0 ? Math.round((vencido / total) * 100) : 0;
  } catch (erro) {
    logger.error("[AccountsService] Erro ao calcular inadimplência:", erro);
    return 0;
  }
}

/**
 * Obtém lista de maiores devedores
 */
export function obterMaioresDevedores(db: Database.Database, limite: number = 10): Array<{
  nome: string;
  valor: number;
  diasVencido: number;
}> {
  try {
    const stmt = db.prepare(`
      SELECT
        nome,
        COALESCE(SUM(valor), 0) as valor,
        CAST((julianday('now') - julianday(MIN(data_vencimento))) AS INTEGER) as diasVencido
      FROM contas_a_receber
      WHERE pago = 0 AND deletado = 0 AND data_vencimento < date('now')
      GROUP BY nome
      ORDER BY valor DESC
      LIMIT ?
    `);

    return (stmt.all(limite) as any[])
      .map((row) => ({
        nome: row.nome,
        valor: row.valor,
        diasVencido: row.diasVencido || 0,
      }))
      .filter((d) => d.valor > 0);
  } catch (erro) {
    logger.error("[AccountsService] Erro ao obter maiores devedores:", erro);
    return [];
  }
}
