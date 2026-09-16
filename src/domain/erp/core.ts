/**
 * Core ERP Compartilhado
 * Base de dados mestres que todos os módulos dependem para funcionamento integrado
 *
 * DEPRECATION NOTICE (2026-09-16):
 * This module contains deprecated functions and interfaces for backward compatibility.
 * All new accounting operations MUST use ledger.ts:registrarLancamentoContabil() instead.
 * See server/migrations/002_consolidate_ledger_entries.sql for consolidation details.
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";

/** Entidades mestres compartilhadas entre todos os módulos */
export interface EntidadeMestra {
  id: number;
  tipo: "legal_entity" | "cost_center" | "account" | "accounting_period";
  nome: string;
  codigo: string;
  status: "ativo" | "inativo" | "bloqueado";
  criado_em: string;
  atualizado_em: string;
}

/** Período contábil (mês/ano fiscal) para consolidação de operações */
export interface PeriodoContabil {
  id: number;
  ano: number;
  mes: number;
  data_inicio: string;
  data_fim: string;
  status: "aberto" | "fechado" | "bloqueado";
  descricao?: string;
}

/** Centro de custo para alocação de despesas */
export interface CentroCusto {
  id: number;
  codigo: string;
  nome: string;
  descricao?: string;
  gerente_id?: number;
  ativo: boolean;
  criado_em: string;
}

/** Entidade legal (pessoa física/jurídica) */
export interface EntidadeLegal {
  id: number;
  nome: string;
  nome_fantasia?: string;
  cpf_cnpj: string;
  tipo: "pessoa_fisica" | "pessoa_juridica";
  endereco?: string;
  telefone?: string;
  email?: string;
  ativo: boolean;
  criado_em: string;
}

/** Conta do plano de contas integrado */
export interface ContaPlanoContas {
  id: number;
  codigo: string;
  nome: string;
  tipo: "ativo" | "passivo" | "receita" | "despesa" | "resultado";
  categoria: string;
  nivel: number;
  conta_pai_id?: number;
  permite_lancamento: boolean;
  ativo: boolean;
}

/**
 * DEPRECATED: Use ledger.ts:LancamentoContabil instead
 *
 * This interface is maintained for backward compatibility only.
 * transacoes_integradas table is read-only legacy.
 * All new code must use registrarLancamentoContabil() from ledger.ts.
 *
 * Migration: server/migrations/002_consolidate_ledger_entries.sql
 */
export interface TransacaoIntegrada {
  id: number;
  entidade_id: number;
  periodo_id: number;
  centro_custo_id?: number;
  conta_id: number;
  data: string;
  descricao: string;
  valor: number;
  tipo: "debit" | "credit";
  origem_modulo: "transacoes" | "contratos" | "patrimonio" | "caucao" | "financiamento" | "rateios" | "vistorias";
  origem_id: number;
  referencia_documento: string;
  auditada: boolean;
  auditado_em?: string;
  criado_em: string;
}

/** Função para obter período contábil atual */
export function obterPeriodoAtual(db: Database): PeriodoContabil {
  const hoje = new Date().toISOString().split("T")[0];
  const [periodo] = consultar<PeriodoContabil>(
    db,
    `SELECT * FROM periodos_contabeis
     WHERE data_inicio <= ? AND data_fim >= ? AND status = 'aberto'
     LIMIT 1`,
    [hoje, hoje],
  );
  if (!periodo) {
    throw new Error("Nenhum período contábil aberto para a data atual");
  }
  return periodo;
}

/**
 * DEPRECATED: Use ledger.ts:registrarLancamentoContabil() instead
 *
 * This function is maintained for backward compatibility only.
 * transacoes_integradas table is read-only legacy. Do not insert new records.
 * All new accounting entries must use the unified ledger_entries table.
 *
 * Migration completed: server/migrations/002_consolidate_ledger_entries.sql
 * @deprecated Use ledger.registrarLancamentoContabil() instead
 */
export function registrarTransacaoIntegrada(
  db: Database,
  transacao: Omit<TransacaoIntegrada, "id" | "criado_em">,
): TransacaoIntegrada {
  console.warn(
    "[DEPRECATED] registrarTransacaoIntegrada() is deprecated. " +
    "Use ledger.ts:registrarLancamentoContabil() instead. " +
    "See server/migrations/002_consolidate_ledger_entries.sql"
  );

  const agora = new Date().toISOString();

  executar(
    db,
    `INSERT INTO transacoes_integradas (
      entidade_id, periodo_id, centro_custo_id, conta_id, data, descricao,
      valor, tipo, origem_modulo, origem_id, referencia_documento, auditada, criado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      transacao.entidade_id,
      transacao.periodo_id,
      transacao.centro_custo_id ?? null,
      transacao.conta_id,
      transacao.data,
      transacao.descricao,
      transacao.valor,
      transacao.tipo,
      transacao.origem_modulo,
      transacao.origem_id,
      transacao.referencia_documento,
      transacao.auditada ? 1 : 0,
      agora,
    ],
  );

  const [resultado] = consultar<TransacaoIntegrada>(
    db,
    "SELECT * FROM transacoes_integradas ORDER BY id DESC LIMIT 1",
    [],
  );

  if (!resultado) {
    throw new Error("Erro ao registrar transação integrada");
  }

  return resultado;
}

/**
 * DEPRECATED: Use ledger.ts:gerarBalancete() instead
 *
 * This interface and function are maintained for backward compatibility only.
 * The query uses the deprecated transacoes_integradas table.
 * All new code must use ledger.ts:gerarBalancete() for the unified ledger_entries table.
 *
 * Migration completed: server/migrations/002_consolidate_ledger_entries.sql
 * @deprecated Use ledger.gerarBalancete() instead
 */
export interface BalanceteResultado {
  conta_id: number;
  codigo: string;
  nome: string;
  saldo_anterior: number;
  debitos: number;
  creditos: number;
  saldo_atual: number;
}

/**
 * DEPRECATED: Use ledger.ts:gerarBalancete() instead
 *
 * This function is maintained for backward compatibility only.
 * It queries the deprecated transacoes_integradas table.
 * All new code must use ledger.ts:gerarBalancete() for accurate results from ledger_entries.
 *
 * @deprecated Use ledger.gerarBalancete() instead
 */
export function gerarBalancete(
  db: Database,
  periodo_id: number,
  entidade_id: number,
): BalanceteResultado[] {
  console.warn(
    "[DEPRECATED] gerarBalancete() from core.ts is deprecated. " +
    "Use ledger.ts:gerarBalancete() instead. " +
    "See server/migrations/002_consolidate_ledger_entries.sql"
  );

  return consultar<BalanceteResultado>(
    db,
    `SELECT
      c.id as conta_id,
      c.codigo,
      c.nome,
      COALESCE(SUM(CASE WHEN t.tipo = 'debit' THEN t.valor ELSE 0 END), 0) as debitos,
      COALESCE(SUM(CASE WHEN t.tipo = 'credit' THEN t.valor ELSE 0 END), 0) as creditos,
      COALESCE(SUM(CASE WHEN t.tipo = 'debit' THEN t.valor ELSE -t.valor END), 0) as saldo_atual
    FROM contas_plano_contas c
    LEFT JOIN transacoes_integradas t ON c.id = t.conta_id
    WHERE t.periodo_id = ? AND t.entidade_id = ? AND c.ativo = 1
    GROUP BY c.id
    ORDER BY c.codigo`,
    [periodo_id, entidade_id],
  );
}

/**
 * DEPRECATED: Use ledger.ts:estornarLancamento() or ledger.ts:aprovarLancamentos() instead
 *
 * Auditoria de transações: rastreabilidade completa
 * This function queries the deprecated transacoes_integradas table.
 * Use ledger_entries through ledger.ts functions for new audit trails.
 *
 * @deprecated Use ledger.ts functions for audit operations
 */
export function rastrearTransacao(db: Database, transacao_id: number) {
  console.warn(
    "[DEPRECATED] rastrearTransacao() from core.ts is deprecated. " +
    "Use ledger.ts functions (estornarLancamento, aprovarLancamentos) instead. " +
    "See server/migrations/002_consolidate_ledger_entries.sql"
  );

  const [transacao] = consultar<TransacaoIntegrada>(
    db,
    "SELECT * FROM transacoes_integradas WHERE id = ?",
    [transacao_id],
  );

  if (!transacao) {
    throw new Error(`Transação ${transacao_id} não encontrada`);
  }

  // Rastrear até a origem em seu módulo
  const origem = consultar(
    db,
    `SELECT * FROM vistoria_log WHERE vistoria_id = ?
     UNION ALL SELECT * FROM vistoria_item WHERE id = ?`,
    [transacao.origem_id, transacao.origem_id],
  );

  return {
    transacao,
    origem,
    trilha_auditoria: {
      modulo_origem: transacao.origem_modulo,
      data_criacao: transacao.criado_em,
      auditada: transacao.auditada,
      auditado_em: transacao.auditado_em,
    },
  };
}
