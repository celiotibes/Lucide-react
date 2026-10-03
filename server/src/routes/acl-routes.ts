/**
 * Rotas HTTP de controle de acesso por recurso (ACL)
 *
 * Permite que um usuário titular/administrador conceda ou revogue acesso a recursos específicos
 * para usuários com papéis externos (inquilino, prestador).
 *
 * Padrão: DENY by default. Um usuário externo só acessa um recurso se houver uma linha
 * ativa em `acl_recursos` com (usuario_id, tipo_recurso, recurso_id) e revogado_em IS NULL.
 */

import express from "express";
import type Database from "better-sqlite3";
import type { AuthServiceDB } from "../domain/auth/auth-service-db.js";
import type { AuditTrailServiceDB } from "../domain/auth/audit-trail-db.js";
import type { ContextoAutenticacao } from "../domain/auth/auth-service.js";
import { criarMiddlewareAutenticacao } from "./auth-routes.js";
import type { TipoRecurso } from "../middleware/posse-recurso.js";

// Tipos permitidos em acl_recursos (deve estar em sinconia com a CHECK constraint)
const TIPOS_PERMITIDOS: readonly TipoRecurso[] = [
  "cobranca",
  "contrato",
  "imovel",
  "chamado",
  "ordem_servico",
  "pagamento_pix",
];

const PAPEIS_EXTERNOS = ["inquilino", "prestador"];

export interface AclRoutesDeps {
  authService: AuthServiceDB;
  auditService: AuditTrailServiceDB;
  db: Database.Database;
}

function requerTitularOuAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const contexto = req.auth as ContextoAutenticacao;
  const papel = contexto.usuario?.role;

  if (papel !== "titular" && papel !== "administrador") {
    res.status(403).json({ erro: "Sem permissão para gerenciar ACL" });
    return;
  }

  next();
}

export function criarRotasAcl({ authService, auditService, db }: AclRoutesDeps): express.Router {
  const router = express.Router();
  const exigirAutenticacao = criarMiddlewareAutenticacao(authService);

  /**
   * POST /api/acl
   * Header: Authorization: Bearer <token> — exige papel titular/administrador
   * Body: { usuarioId, tipoRecurso, recursoId }
   *
   * Concede acesso a um recurso para um usuário externo. Idempotente:
   * - Se já existe e está ativa: 200 (sem mudança)
   * - Se existe mas foi revogada: reativa (revogado_em = NULL, concedido_em = agora)
   * - Se não existe: cria linha nova
   *
   * Validações:
   * - tipoRecurso deve estar em TIPOS_PERMITIDOS
   * - usuário-alvo deve existir e ter papel externo (inquilino/prestador)
   * - só titulares/administradores podem conceder
   */
  router.post("/", exigirAutenticacao, requerTitularOuAdmin, async (req, res) => {
    const contexto = req.auth as ContextoAutenticacao;
    const { usuarioId, tipoRecurso, recursoId } = req.body ?? {};

    // Validações de entrada
    if (!usuarioId || typeof usuarioId !== "string") {
      res.status(400).json({ erro: "usuarioId é obrigatório" });
      return;
    }
    if (!tipoRecurso || !TIPOS_PERMITIDOS.includes(tipoRecurso as TipoRecurso)) {
      res.status(400).json({ erro: `tipoRecurso inválido — precisa ser um de: ${TIPOS_PERMITIDOS.join(", ")}` });
      return;
    }
    if (!recursoId || typeof recursoId !== "string") {
      res.status(400).json({ erro: "recursoId é obrigatório" });
      return;
    }

    try {
      // Verificar se o usuário-alvo existe e tem papel externo
      const usuarioAlvo = db.prepare("SELECT id, role FROM usuarios WHERE id = ?").get(usuarioId) as any;

      if (!usuarioAlvo) {
        res.status(400).json({ erro: "Usuário não encontrado" });
        return;
      }

      if (!PAPEIS_EXTERNOS.includes(usuarioAlvo.role)) {
        res.status(400).json({
          erro: `Não é possível conceder acesso a usuário com papel interno. Papel do usuário: ${usuarioAlvo.role}`,
        });
        return;
      }

      // Tentar reativar se existir revogada
      const aclExistente = db
        .prepare("SELECT id, revogado_em FROM acl_recursos WHERE usuario_id = ? AND tipo_recurso = ? AND recurso_id = ?")
        .get(usuarioId, tipoRecurso, recursoId) as any;

      if (aclExistente && !aclExistente.revogado_em) {
        // Já está ativa — retorna 200 idempotente
        res.json({ ok: true, mensagem: "Acesso já está concedido" });

        auditService.registrarAcao(contexto, "acl_concessao", "acl_recurso", aclExistente.id, {
          descricao: `Tentativa de reconcessão de acesso já ativo: usuário ${usuarioId}, recurso ${tipoRecurso}/${recursoId}`,
          resultado: "nenhuma_mudanca",
        });
        return;
      }

      if (aclExistente) {
        // Reativar
        db.prepare("UPDATE acl_recursos SET revogado_em = NULL, concedido_em = datetime('now') WHERE id = ?").run(
          aclExistente.id,
        );

        auditService.registrarAcao(contexto, "acl_reativacao", "acl_recurso", aclExistente.id, {
          descricao: `ACL reativada: usuário ${usuarioId}, recurso ${tipoRecurso}/${recursoId}`,
          resultado: "sucesso",
        });

        res.json({ ok: true, mensagem: "Acesso reativado" });
        return;
      }

      // Criar nova linha
      const resultado = db
        .prepare(
          `INSERT INTO acl_recursos (usuario_id, tipo_recurso, recurso_id, concedido_por, concedido_em)
         VALUES (?, ?, ?, ?, datetime('now'))`,
        )
        .run(usuarioId, tipoRecurso, recursoId, contexto.usuario!.id);

      const id = resultado.lastInsertRowid;

      auditService.registrarAcao(contexto, "acl_concessao", "acl_recurso", String(id), {
        descricao: `Acesso concedido: usuário ${usuarioId}, recurso ${tipoRecurso}/${recursoId}`,
        resultado: "sucesso",
      });

      res.status(201).json({ ok: true, id, mensagem: "Acesso concedido com sucesso" });
    } catch (erro: any) {
      if (erro.message?.includes("UNIQUE constraint failed")) {
        // Já existe na mesma transação — retorna 201
        res.status(201).json({ ok: true, mensagem: "Acesso já estava concedido" });
        return;
      }
      throw erro;
    }
  });

  /**
   * GET /api/acl?usuarioId=...
   * Header: Authorization: Bearer <token> — exige papel titular/administrador
   *
   * Lista todas as concessões de ACL (ativas e revogadas) para um usuário específico.
   * Se usuarioId não for fornecido, lista TODAS.
   */
  router.get("/", exigirAutenticacao, requerTitularOuAdmin, (req, res) => {
    const { usuarioId } = req.query;

    try {
      let acls: any[];

      if (usuarioId && typeof usuarioId === "string") {
        acls = db
          .prepare(
            `SELECT id, usuario_id, tipo_recurso, recurso_id, concedido_por, concedido_em, revogado_em
           FROM acl_recursos WHERE usuario_id = ? ORDER BY concedido_em DESC`,
          )
          .all(usuarioId);
      } else {
        acls = db
          .prepare(
            `SELECT id, usuario_id, tipo_recurso, recurso_id, concedido_por, concedido_em, revogado_em
           FROM acl_recursos ORDER BY concedido_em DESC`,
          )
          .all();
      }

      res.json({ acls });
    } catch (erro) {
      res.status(500).json({ erro: "Erro ao listar ACL" });
    }
  });

  /**
   * DELETE /api/acl/:id
   * Header: Authorization: Bearer <token> — exige papel titular/administrador
   *
   * Revoga uma concessão de ACL (marca com revogado_em = agora, nunca apaga a linha).
   * Idempotente: se já foi revogada, retorna 200.
   */
  router.delete("/:id", exigirAutenticacao, requerTitularOuAdmin, (req, res) => {
    const contexto = req.auth as ContextoAutenticacao;
    const { id } = req.params;

    try {
      const acl = db.prepare("SELECT id, usuario_id, tipo_recurso, recurso_id, revogado_em FROM acl_recursos WHERE id = ?").get(id) as any;

      if (!acl) {
        res.status(404).json({ erro: "ACL não encontrada" });
        return;
      }

      if (acl.revogado_em) {
        // Já estava revogada — idempotente
        res.json({ ok: true, mensagem: "ACL já estava revogada" });
        return;
      }

      // Revogar
      db.prepare("UPDATE acl_recursos SET revogado_em = datetime('now') WHERE id = ?").run(id);

      auditService.registrarAcao(contexto, "acl_revogacao", "acl_recurso", id, {
        descricao: `Acesso revogado: usuário ${acl.usuario_id}, recurso ${acl.tipo_recurso}/${acl.recurso_id}`,
        resultado: "sucesso",
      });

      res.json({ ok: true, mensagem: "Acesso revogado com sucesso" });
    } catch (erro) {
      res.status(500).json({ erro: "Erro ao revogar ACL" });
    }
  });

  return router;
}
