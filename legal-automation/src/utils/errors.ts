import { logger } from './logger';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code: string = 'INTERNAL_ERROR',
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      statusCode: this.statusCode,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(400, message, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Autenticação falhou', details?: Record<string, unknown>) {
    super(401, message, 'AUTHENTICATION_ERROR', details);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Acesso não autorizado', details?: Record<string, unknown>) {
    super(403, message, 'AUTHORIZATION_ERROR', details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string | number) {
    const message = id ? `${resource} não encontrado: ${id}` : `${resource} não encontrado`;
    super(404, message, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(409, message, 'CONFLICT', details);
  }
}

export class CertificateError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(400, message, 'CERTIFICATE_ERROR', details);
  }
}

export class CertificateNotFoundError extends AppError {
  constructor(fingerprint?: string) {
    const message = fingerprint
      ? `Certificado não encontrado: ${fingerprint}`
      : 'Nenhum certificado configurado';
    super(404, message, 'CERTIFICATE_NOT_FOUND');
  }
}

export class TwoFactorError extends AppError {
  constructor(message: string = '2FA falhou', details?: Record<string, unknown>) {
    super(401, message, 'TWO_FACTOR_ERROR', details);
  }
}

export class ProjectudoIntegrationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(502, message, 'PROJUDI_ERROR', details);
  }
}

export class EprocIntegrationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(502, message, 'EPROC_ERROR', details);
  }
}

export class DataJudError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(502, message, 'DATAJUD_ERROR', details);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Limite de requisições excedido') {
    super(429, message, 'RATE_LIMIT_EXCEEDED');
  }
}

export function handleError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    logger.error({ err: error }, `Erro inesperado: ${error.message}`);
    return new AppError(500, 'Erro interno do servidor', 'INTERNAL_ERROR');
  }

  logger.error(error, 'Erro desconhecido');
  return new AppError(500, 'Erro interno do servidor', 'UNKNOWN_ERROR');
}
