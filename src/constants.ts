// ============================================================================
// API CONFIGURATION
// ============================================================================

export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1',
  TIMEOUT: 10000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
}

// ============================================================================
// AUTH CONFIGURATION
// ============================================================================

export const AUTH_CONFIG = {
  ACCESS_TOKEN_KEY: 'auth_access_token',
  REFRESH_TOKEN_KEY: 'auth_refresh_token',
  EXPIRES_IN_KEY: 'auth_expires_in',
}

// ============================================================================
// UI CONFIGURATION
// ============================================================================

export const UI_CONFIG = {
  TOAST_DURATION: 3000,
  MODAL_ANIMATION_DURATION: 300,
  SKELETON_ANIMATION_SPEED: 1500,
}

// ============================================================================
// PAGINATION
// ============================================================================

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 12,
  DEFAULT_PAGE: 1,
}

// ============================================================================
// CASE STATUS OPTIONS
// ============================================================================

export const CASE_STATUS_OPTIONS = [
  { value: 'active', label: 'Ativo', color: 'green' },
  { value: 'paused', label: 'Pausado', color: 'yellow' },
  { value: 'concluded', label: 'Concluído', color: 'blue' },
]

// ============================================================================
// INTIMATION STATUS OPTIONS
// ============================================================================

export const INTIMATION_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pendente', color: 'red' },
  { value: 'processed', label: 'Processado', color: 'green' },
  { value: 'archived', label: 'Arquivado', color: 'blue' },
]

// ============================================================================
// COMPLIANCE STATUS OPTIONS
// ============================================================================

export const COMPLIANCE_STATUS_OPTIONS = [
  { value: 'compliant', label: 'Conforme', color: 'green' },
  { value: 'warning', label: 'Aviso', color: 'yellow' },
  { value: 'critical', label: 'Crítico', color: 'red' },
]

// ============================================================================
// NAVIGATION ITEMS
// ============================================================================

export const NAVIGATION_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: '📊' },
  { path: '/cases', label: 'Casos', icon: '📋' },
  { path: '/intimations', label: 'Intimações', icon: '📬' },
  { path: '/compliance', label: 'Compliance', icon: '✅' },
]

// ============================================================================
// ERROR MESSAGES
// ============================================================================

export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Erro de conexão. Verifique sua internet.',
  UNAUTHORIZED: 'Não autorizado. Faça login novamente.',
  FORBIDDEN: 'Acesso negado.',
  NOT_FOUND: 'Recurso não encontrado.',
  VALIDATION_ERROR: 'Dados inválidos.',
  SERVER_ERROR: 'Erro no servidor. Tente mais tarde.',
  UNKNOWN: 'Erro desconhecido.',
}

// ============================================================================
// SUCCESS MESSAGES
// ============================================================================

export const SUCCESS_MESSAGES = {
  LOGIN: 'Login realizado com sucesso!',
  LOGOUT: 'Logout realizado com sucesso!',
  CREATED: 'Criado com sucesso!',
  UPDATED: 'Atualizado com sucesso!',
  DELETED: 'Deletado com sucesso!',
  PROCESSED: 'Processado com sucesso!',
}
