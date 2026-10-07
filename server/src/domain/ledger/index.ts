/**
 * Ledger Module Exports
 *
 * Central hub para todas as funcionalidades do sistema de lançamentos contábeis
 * Inclui integração com agentes econômicos e backfill strategy
 */

// Core ledger service
export {
  registrarLancamento,
  registrarDoubleEntry,
  obterLancamento,
  listarLancamentos,
  calcularSaldoPorCategoria,
  validarIntegridade,
} from './ledger-service.js';

// Ledger-Agent integration
export {
  createLedgerEntryWithAgent,
  getAgentLedger,
  getAgentBalance,
  generateAgentReport,
  linkLedgerToAgent,
  unlinkLedgerFromAgent,
  getAgentAging,
} from './ledger-agent-service.js';

// Types
export type {
  LedgerEntry,
  DoubleEntryLancamento,
  ResultadoRegistroLancamento,
  TipoLancamento,
  CategoriaLancamento,
  AuditoriaLancamento,
  ContaContabil,
} from './ledger-types.js';

export type {
  LedgerEntryWithAgent,
  AgentBalance,
  AgentProfitLoss,
  AgingAnalysis,
} from './ledger-agent-service.js';
