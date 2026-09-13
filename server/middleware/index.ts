/**
 * ============================================================================
 * Middleware Central
 * ============================================================================
 * Consolidação de funções de middleware para autenticação e controle de acesso
 */

export {
  validateSupabaseSession,
  requireSupabaseAuth,
  requireRole,
  requireAdmin,
  withOptionalAuth,
  validateBearerToken,
  requireBearerToken,
  type AuthContext,
} from './auth';

export {
  validateCronSecret,
  validateAuthToken,
  errorHandler,
  withErrorHandler,
  withCronAuth,
  withBearerAuth,
  withSupabaseAuth,
  withSupabaseAuthOptional,
  withSupabaseRole,
  logError,
} from '@/server/api/middleware';
