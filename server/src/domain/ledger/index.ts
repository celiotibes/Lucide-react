/**
 * Ledger Module Exports
 *
 * Central hub para todas as funcionalidades do sistema de lançamentos contábeis
 */

export {
  registrarLancamento,
  registrarDoubleEntry,
  obterLancamento,
  listarLancamentos,
  calcularSaldoPorCategoria,
  validarIntegridade,
} from './ledger-service.js';

export type {
  LedgerEntry,
  DoubleEntryLancamento,
  ResultadoRegistroLancamento,
  TipoLancamento,
  CategoriaLancamento,
  AuditoriaLancamento,
  ContaContabil,
} from './ledger-types.js';
