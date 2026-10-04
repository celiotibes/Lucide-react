/**
 * Middleware de isolamento por recurso — controla acesso granular a recursos específicos.
 *
 * Papéis internos (titular, administrador, contador, perito, advogado, economista) têm acesso
 * irrestrito a todos os recursos do tipo. Papéis externos (inquilino, prestador) só acessam
 * recursos se houver uma linha ativa em `acl_recursos` concedendo explicitamente acesso.
 *
 * Seguro por padrão: não encontrando ACL, retorna 404 para não revelar existência.
 */

import express from "express";
import type Database from "better-sqlite3";
import type { ContextoAutenticacao } from "../domain/auth/auth-service.js";

const PAPEIS_INTERNOS = ["titular", "administrador", "contador", "perito", "advogado", "economista"];

/**
 * Tipos de recurso permitidos na ACL. Deve estar em sinconia com a CHECK constraint
 * da tabela acl_recursos em migrations-phase13-acl-recursos.sql.
 */
export type TipoRecurso = "cobranca" | "contrato" | "imovel" | "chamado" | "ordem_servico" | "pagamento_pix";

export interface ExigirPosseDeps {
  db: Database.Database;
}

/**
 * Factory que cria o middleware exigirPosse(tipo, paramName).
 *
 * Lógica:
 * - Sem autenticação (req.auth falso): retorna 401
 * - Papel interno: passa (sem checar ACL)
 * - Papel externo (inquilino/prestador):
 *   - Se houver ACL ativa (revogado_em IS NULL) para este (usuário, tipo, recurso): passa
 *   - Senão: retorna 404 (não revela existência)
 * - Papel desconhecido ou nulo: retorna 404
 */
export function criarExigirPosse(db: Database.Database) {
  return function exigirPosse(tipo: TipoRecurso, paramName: string = "id") {
    return function middleware(req: express.Request, res: express.Response, next: express.NextFunction) {
      const contexto = req.auth as ContextoAutenticacao | undefined;

      if (!contexto || !contexto.usuario) {
        res.status(401).json({ erro: "Token de sessão ausente ou mal formatado" });
        return;
      }

      const papel = contexto.usuario.role;

      // Papéis internos têm acesso irrestrito
      if (PAPEIS_INTERNOS.includes(papel)) {
        next();
        return;
      }

      // Papéis externos (inquilino, prestador) precisam de ACL
      if (papel === "inquilino" || papel === "prestador") {
        const recursoId = String(req.params[paramName]);
        if (!recursoId) {
          res.status(404).json({ erro: "Recurso não encontrado" });
          return;
        }

        try {
          const acl = db
            .prepare(
              `SELECT id FROM acl_recursos
             WHERE usuario_id = ? AND tipo_recurso = ? AND recurso_id = ? AND revogado_em IS NULL
             LIMIT 1`,
            )
            .get(contexto.usuario.id, tipo, recursoId);

          if (!acl) {
            res.status(404).json({ erro: "Recurso não encontrado" });
            return;
          }

          next();
        } catch {
          res.status(500).json({ erro: "Erro ao verificar acesso ao recurso" });
          return;
        }
      } else {
        // Papel desconhecido
        res.status(404).json({ erro: "Recurso não encontrado" });
      }
    };
  };
}
