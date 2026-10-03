/**
 * Type extensions for Express Request to include authentication context
 *
 * Augments `express.Request` with the authenticated context that the
 * `exigirAutenticacao` middleware (auth-routes.ts) attaches after validating the token.
 *
 * Usage:
 * - In protected routes: `(req as AuthenticatedRequest).auth.usuario.id`
 * - In optional auth routes: `(req as Request).auth?.usuario?.id`
 */

import type { ContextoAutenticacao, Usuario } from "../domain/auth/auth-service.js";

/**
 * Extends Express Request with required authentication context.
 * Use this type in protected routes where authentication is mandatory.
 *
 * @example
 * router.get("/protected", (req: AuthenticatedRequest, res: Response) => {
 *   const usuarioId = req.auth.usuario.id; // Type-safe, non-nullable
 * });
 */
export interface AuthenticatedRequest extends Express.Request {
  auth: ContextoAutenticacao & { usuario: Usuario }; // usuario is guaranteed non-null
}

declare global {
  namespace Express {
    interface Request {
      /**
       * Authenticated context attached by auth middleware.
       * Check `auth?.usuario` before accessing user properties.
       * For protected routes, use AuthenticatedRequest interface instead.
       */
      auth?: ContextoAutenticacao;
    }
  }
}

export {};
