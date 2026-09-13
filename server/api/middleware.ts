/**
 * ============================================================================
 * API Middleware Centralizado
 * ============================================================================
 * Centraliza validação de tokens, error handling e utilitários comuns para
 * todas as rotas de API. Elimina 28+ duplicatas de validação de CRON_SECRET
 * e 98+ blocos inconsistentes de try-catch.
 *
 * Exports:
 * - validateCronSecret(request) -> boolean
 * - validateAuthToken(request) -> string | null
 * - errorHandler(error) -> { message: string; status: number; details?: any }
 * - withErrorHandler(handler) -> middleware wrapper
 * - withCronAuth(handler) -> middleware wrapper com validação CRON
 * - withBearerAuth(handler) -> middleware wrapper com Bearer token
 * - logError(context, error) -> logging estruturado
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Valida o token CRON_SECRET enviado pela Vercel via Authorization header
 * @returns true se válido, false caso contrário
 */
export function validateCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn('CRON_SECRET não configurado');
    return false;
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader) return false;

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  return token === cronSecret;
}

/**
 * Valida e extrai o token de autenticação do header Authorization
 * @returns token if válido, null caso contrário
 */
export function validateAuthToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  return token || null;
}

/**
 * Formata erros em um padrão consistente
 */
export function errorHandler(error: unknown): {
  message: string;
  status: number;
  details?: any;
} {
  // Erro de Supabase
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    'status' in error
  ) {
    const dbError = error as any;
    return {
      message: dbError.message || 'Database error',
      status: dbError.status || 500,
      details: dbError.details,
    };
  }

  // Erro customizado com status
  if (error instanceof Error && 'status' in error) {
    const customError = error as Error & { status: number };
    return {
      message: customError.message,
      status: customError.status || 500,
    };
  }

  // Erro genérico
  if (error instanceof Error) {
    return {
      message: error.message,
      status: 500,
    };
  }

  // Fallback
  return {
    message: 'Unknown error',
    status: 500,
    details: error,
  };
}

/**
 * Middleware wrapper que:
 * 1. Valida CRON_SECRET se necessário
 * 2. Executa handler
 * 3. Captura e formata erros
 */
export function withCronAuth(
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    if (!validateCronSecret(req)) {
      return NextResponse.json(
        { erro: 'Token CRON inválido ou não configurado' },
        { status: 401 }
      );
    }

    try {
      return await handler(req);
    } catch (error) {
      const formatted = errorHandler(error);
      return NextResponse.json(
        {
          erro: formatted.message,
          ...(formatted.details && { detalhes: formatted.details }),
        },
        { status: formatted.status }
      );
    }
  };
}

/**
 * Middleware wrapper que:
 * 1. Valida Bearer token
 * 2. Executa handler
 * 3. Captura e formata erros
 */
export function withBearerAuth(
  handler: (req: NextRequest, token: string) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const token = validateAuthToken(req);
    if (!token) {
      return NextResponse.json(
        { erro: 'Authorization token inválido ou faltando' },
        { status: 401 }
      );
    }

    try {
      return await handler(req, token);
    } catch (error) {
      const formatted = errorHandler(error);
      return NextResponse.json(
        {
          erro: formatted.message,
          ...(formatted.details && { detalhes: formatted.details }),
        },
        { status: formatted.status }
      );
    }
  };
}

/**
 * Middleware wrapper genérico que apenas captura e formata erros
 */
export function withErrorHandler(
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      return await handler(req);
    } catch (error) {
      const formatted = errorHandler(error);
      return NextResponse.json(
        {
          erro: formatted.message,
          ...(formatted.details && { detalhes: formatted.details }),
        },
        { status: formatted.status }
      );
    }
  };
}

/**
 * Middleware wrapper que:
 * 1. Valida Supabase session
 * 2. Executa handler
 * 3. Captura e formata erros
 */
export function withSupabaseAuth(
  handler: (req: NextRequest, auth: AuthContext) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const auth = await validateSupabaseSession(req);
    if (!auth) {
      return NextResponse.json(
        { erro: 'Não autenticado' },
        { status: 401 }
      );
    }

    try {
      return await handler(req, auth);
    } catch (error) {
      const formatted = errorHandler(error);
      return NextResponse.json(
        {
          erro: formatted.message,
          ...(formatted.details && { detalhes: formatted.details }),
        },
        { status: formatted.status }
      );
    }
  };
}

/**
 * Middleware wrapper com Supabase auth opcional
 */
export function withSupabaseAuthOptional(
  handler: (req: NextRequest, auth: AuthContext | null) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const auth = await validateSupabaseSession(req);

    try {
      return await handler(req, auth);
    } catch (error) {
      const formatted = errorHandler(error);
      return NextResponse.json(
        {
          erro: formatted.message,
          ...(formatted.details && { detalhes: formatted.details }),
        },
        { status: formatted.status }
      );
    }
  };
}

/**
 * Middleware wrapper que requer um dos roles especificados
 */
export function withSupabaseRole(
  allowedRoles: string[],
  handler: (req: NextRequest, auth: AuthContext) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const auth = await validateSupabaseSession(req);

    if (!auth) {
      return NextResponse.json(
        { erro: 'Não autenticado' },
        { status: 401 }
      );
    }

    if (!auth.role || !allowedRoles.includes(auth.role)) {
      return NextResponse.json(
        {
          erro: 'Acesso negado',
          roles_requeridos: allowedRoles,
          seu_role: auth.role,
        },
        { status: 403 }
      );
    }

    try {
      return await handler(req, auth);
    } catch (error) {
      const formatted = errorHandler(error);
      return NextResponse.json(
        {
          erro: formatted.message,
          ...(formatted.details && { detalhes: formatted.details }),
        },
        { status: formatted.status }
      );
    }
  };
}

/**
 * Utilitário para logging de erro estruturado
 */
export function logError(
  context: string,
  error: unknown,
  additionalInfo?: Record<string, any>
): void {
  const timestamp = new Date().toISOString();
  const formatted = errorHandler(error);

  console.error(`[${timestamp}] ${context}`, {
    message: formatted.message,
    status: formatted.status,
    ...additionalInfo,
    details: formatted.details,
  });
}
