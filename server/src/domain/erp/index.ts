/**
 * ERP Domain Module Exports
 *
 * Central hub para todas as funcionalidades do módulo ERP:
 * - Agentes econômicos (pessoas físicas e jurídicas)
 * - Deduplicação de agentes
 * - Papéis e permissões
 * - Registro e validação de agentes
 * - Backfill strategy para integração com ledger
 */

// Tipos e validações
export {
  TipoEntidade,
  PapelAgente,
  RegimeTributario,
  TipoValidacao,
  ResultadoValidacao,
  MotivoDuplicata,
  StatusDuplicata,
  TipoVinculacao,
  CPFSchema,
  CNPJSchema,
  CPFCNPJSchema,
  EmailSchema,
  TelefoneSchema,
  EnderecoSchema,
  AgenteEconomicoSchema,
  CriarAgenteEconomicoSchema,
  AtualizarAgenteEconomicoSchema,
  ValidacaoAgenteSchema,
  DuplicataSchema,
  VinculacaoSchema,
  isValidCPF,
  isValidCNPJ,
  formatCPF,
  formatCNPJ,
  formatCPFCNPJ,
  calculateSimilarity,
  calculateDuplicataScore,
  cleanCPFCNPJ,
  detectTipoEntidade,
} from './agentes-tipos.js';

export type {
  AgenteEconomico,
  ValidacaoAgente,
  DuplicataSuspeita,
  VinculacaoAgente,
  PapelDefinicao,
} from './agentes-tipos.js';

// Serviço de agentes
export {
  criarAgenteEconomico,
  obterAgenteEconomico,
  listarAgentes,
  atualizarAgenteEconomico,
  deletarAgenteEconomico,
  procurarAgentes,
  validarAgenteEconomico,
  getAgentbyDocumento,
} from './agentes-service.js';

// Deduplicação
export {
  detectarDuplicatas,
  avaliarDuplicata,
  mesclarAgentes,
  getAgentesDuplicados,
} from './agentes-deduplicacao.js';

// Papéis e permissões
export {
  criarPapel,
  obterPapel,
  listarPapeis,
  atualizarPapel,
  deletarPapel,
  adicionarPermissao,
  removerPermissao,
  validarPermissao,
} from './agentes-papeis.js';

// Registry
export {
  registrarAgente,
  vincularAgente,
  desvincularAgente,
  getVinculacoes,
} from './agentes-registry.js';

// Backfill strategy
export {
  analyzeLedgerEntries,
  matchAgentsToEntries,
  backfillLedgerAgents,
  verifyBackfillAccuracy,
  executarBackfillCompleto,
} from './agentes-backfill.js';

export type {
  AnalyzedLedgerEntry,
  MatchResult,
  BackfillResult,
} from './agentes-backfill.js';
