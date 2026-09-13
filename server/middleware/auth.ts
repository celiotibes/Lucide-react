/**
 * ============================================================================
 * Middleware de Autenticação Centralizado
 * ============================================================================
 * Centraliza validação de sessão Supabase e controle de acesso (RBAC).
 * Substitui 20+ verificações inline de autenticação em endpoints.
 *
 * Exports:
 * - validateSupabaseSession(request) -> { user, session } | null
 * - requireSupabaseAuth(handler) -> middleware wrapper
 * - requireRole(roles) -> middleware wrapper para RBAC
 * - requireAdmin() -> middleware wrapper para admin-only
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export interface AuthContext {
  userId: string;
  email: string;
  role?: string;
  metadata?: Record<string, any>;
}

/**
 * Valida sessão Supabase a partir do request
 * @returns AuthContext se autenticado, null caso contrário
 */
export async function validateSupabaseSession(
  request: NextRequest,
): Promise<AuthContext | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    return {
      userId: user.id,
      email: user.email || '',
      role: user.user_metadata?.role,
      metadata: user.user_metadata,
    };
  } catch (error) {
    console.error('Erro ao validar sessão Supabase:', error);
    return null;
  }
}

/**
 * Middleware wrapper que requer autenticação Supabase
 * Retorna 401 se não autenticado
 */
export function requireSupabaseAuth(
  handler: (
    req: NextRequest,
    auth: AuthContext,
  ) => Promise<NextResponse>,
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const auth = await validateSupabaseSession(req);

    if (!auth) {
      return NextResponse.json(
        {
          erro: 'Não autenticado',
          code: 'AUTH_REQUIRED',
        },
        { status: 401 },
      );
    }

    try {
      return await handler(req, auth);
    } catch (error) {
      console.error('Erro ao processar handler autenticado:', error);
      return NextResponse.json(
        {
          erro: error instanceof Error ? error.message : 'Erro interno',
        },
        { status: 500 },
      );
    }
  };
}

/**
 * Middleware wrapper que requer um dos roles especificados
 * @param allowedRoles - Array de roles permitidos (ex: ['admin', 'gerente'])
 * Retorna 403 se o usuário não tem um dos roles
 */
export function requireRole(allowedRoles: string[]) {
  return (handler: (req: NextRequest, auth: AuthContext) => Promise<NextResponse>) => {
    return async (req: NextRequest): Promise<NextResponse> => {
      const auth = await validateSupabaseSession(req);

      if (!auth) {
        return NextResponse.json(
          {
            erro: 'Não autenticado',
            code: 'AUTH_REQUIRED',
          },
          { status: 401 },
        );
      }

      if (!auth.role || !allowedRoles.includes(auth.role)) {
        return NextResponse.json(
          {
            erro: 'Acesso negado',
            code: 'INSUFFICIENT_PERMISSIONS',
            required_roles: allowedRoles,
            current_role: auth.role,
          },
          { status: 403 },
        );
      }

      try {
        return await handler(req, auth);
      } catch (error) {
        console.error('Erro ao processar handler com RBAC:', error);
        return NextResponse.json(
          {
            erro: error instanceof Error ? error.message : 'Erro interno',
          },
          { status: 500 },
        );
      }
    };
  };
}

/**
 * Middleware wrapper para admin-only endpoints
 * Shorthand para requireRole(['admin'])
 */
export function requireAdmin() {
  return requireRole(['admin']);
}

/**
 * Middleware wrapper que tenta validar sessão mas continua se falhar
 * Útil para endpoints que são opcionalmente autenticados
 */
export function withOptionalAuth(
  handler: (
    req: NextRequest,
    auth: AuthContext | null,
  ) => Promise<NextResponse>,
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const auth = await validateSupabaseSession(req);

    try {
      return await handler(req, auth);
    } catch (error) {
      console.error('Erro ao processar handler com auth opcional:', error);
      return NextResponse.json(
        {
          erro: error instanceof Error ? error.message : 'Erro interno',
        },
        { status: 500 },
      );
    }
  };
}

/**
 * Valida Bearer token customizado (alternativa a Supabase)
 * Útil para integrações third-party
 * @returns token se válido, null caso contrário
 */
export function validateBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  return token || null;
}

/**
 * Middleware wrapper para Bearer token customizado
 */
export function requireBearerToken(allowedTokens?: string[]) {
  return (handler: (req: NextRequest, token: string) => Promise<NextResponse>) => {
    return async (req: NextRequest): Promise<NextResponse> => {
      const token = validateBearerToken(req);

      if (!token) {
        return NextResponse.json(
          {
            erro: 'Token de autenticação inválido ou faltando',
            code: 'BEARER_TOKEN_REQUIRED',
          },
          { status: 401 },
        );
      }

      // Se allowedTokens for especificado, validar token
      if (allowedTokens && !allowedTokens.includes(token)) {
        return NextResponse.json(
          {
            erro: 'Token de autenticação inválido',
            code: 'INVALID_BEARER_TOKEN',
          },
          { status: 401 },
        );
      }

      try {
        return await handler(req, token);
      } catch (error) {
        console.error('Erro ao processar handler com Bearer token:', error);
        return NextResponse.json(
          {
            erro: error instanceof Error ? error.message : 'Erro interno',
          },
          { status: 500 },
        );
      }
    };
  };
}
