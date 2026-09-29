/**
 * Augmenta `express.Request` com o contexto autenticado que o middleware
 * `exigirAutenticacao` (auth-routes.ts) anexa depois de validar o token.
 */
import type { ContextoAutenticacao } from "../domain/auth/auth-service.js";

declare global {
  namespace Express {
    interface Request {
      auth?: ContextoAutenticacao;
    }
  }
}

export {};
