/**
 * Rotas HTTP para Sistema de Agentes Econômicos
 * Fase 18: CRUD de Pessoas Físicas e Jurídicas
 *
 * GET    /api/v1/agentes-economicos — lista agentes (paginado, filtrado)
 * POST   /api/v1/agentes-economicos — criar novo agente
 * GET    /api/v1/agentes-economicos/:id — buscar agente específico
 * PUT    /api/v1/agentes-economicos/:id — atualizar agente
 * DELETE /api/v1/agentes-economicos/:id — desativar agente (soft delete)
 * GET    /api/v1/agentes-economicos/:id/duplicatas — listar suspeitas de duplicata
 */

import express, { type Request, type Response } from "express";
import Database from "better-sqlite3";
import { logger } from "../services/logger-service.js";
import type { AuthServiceDB } from "../domain/auth/auth-service-db.js";
import { criarMiddlewareAutenticacao } from "./auth-routes.js";
import type { AuditTrailServiceDB } from "../domain/auth/audit-trail-db.js";
import {
  AgenteService,
  ListAgenteSchema,
  type ListAgenteQuery,
  type CriarAgenteInput,
  type AtualizarAgenteInput,
} from "../domain/erp/agentes-service.js";
import { CriarAgenteEconomicoSchema, AtualizarAgenteEconomicoSchema } from "../domain/erp/agentes-tipos.js";

interface AuthRequest extends Request {
  auth?: {
    usuario?: {
      id: string;
      email?: string;
      role?: string;
    };
    autenticado?: boolean;
  };
}

export interface AgentesRotasDeps {
  db: Database.Database;
  authService: AuthServiceDB;
  auditService: AuditTrailServiceDB;
}

export function criarRotasAgentesEconomicos({
  db,
  authService,
  auditService,
}: AgentesRotasDeps): express.Router {
  const router = express.Router();
  const exigirAutenticacao = criarMiddlewareAutenticacao(authService);
  const agenteService = new AgenteService(db);

  /**
   * GET /api/v1/agentes-economicos
   *
   * Lista agentes econômicos com filtros e paginação
   *
   * Query params:
   * - papel: string (tenant, supplier, provider, legal_party, co_owner, borrower, lender)
   * - ativo: boolean (true/false)
   * - tipo_entidade: string (pessoa_fisica, pessoa_juridica)
   * - busca: string (busca por nome ou CPF/CNPJ)
   * - offset: número (default=0)
   * - limit: número (default=100, max=1000)
   *
   * Respostas:
   * - 200: { agentes: [...], total: number, offset: number, limit: number }
   * - 400: { erro: string, detalhes?: string[] }
   * - 401: { erro: string }
   */
  router.get("/", exigirAutenticacao, (req: AuthRequest, res: Response) => {
    try {
      const parseResult = ListAgenteSchema.safeParse(req.query);
      if (!parseResult.success) {
        const issues = parseResult.error.issues;
        const mainIssue = issues[0];
        return res.status(400).json({
          erro: `Parâmetro inválido: ${mainIssue?.message}`,
          detalhes: issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        });
      }

      const filtros = parseResult.data as ListAgenteQuery;
      const resultado = agenteService.listar(filtros);

      const contexto = req.auth;
      auditService.registrarAcao(contexto, "listar_agentes", "agentes_economicos", "lista", {
        descricao: `${contexto?.usuario?.email} listou agentes econômicos (offset=${filtros.offset}, limit=${filtros.limit})`,
        total: resultado.total,
        resultado: "sucesso",
      });

      res.json(resultado);
    } catch (erro: any) {
      logger.error("Erro ao listar agentes", { erro });
      res.status(500).json({ erro: "Erro ao listar agentes" });
    }
  });

  /**
   * POST /api/v1/agentes-economicos
   *
   * Criar novo agente econômico
   *
   * Body: CriarAgenteEconomicoSchema
   *
   * Respostas:
   * - 201: { agente: AgenteEconomico }
   * - 400: { erro: string, detalhes?: string[] }
   * - 401: { erro: string }
   * - 409: { erro: string } — CPF/CNPJ duplicado
   * - 500: { erro: string }
   */
  router.post("/", exigirAutenticacao, async (req: AuthRequest, res: Response) => {
    try {
      const parseResult = CriarAgenteEconomicoSchema.safeParse(req.body);
      if (!parseResult.success) {
        const issues = parseResult.error.issues;
        const mainIssue = issues[0];
        return res.status(400).json({
          erro: `Validação falhou: ${mainIssue?.message}`,
          detalhes: issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        });
      }

      const usuarioId = req.auth?.usuario?.id;
      if (!usuarioId) {
        return res.status(401).json({ erro: "Usuário não autenticado" });
      }

      const input = parseResult.data as CriarAgenteInput;

      try {
        const agente = await agenteService.criar(input, usuarioId);

        auditService.registrarAcao(req.auth, "criar_agente", "agentes_economicos", agente.id, {
          descricao: `${req.auth?.usuario?.email} criou novo agente: ${agente.nome} (${agente.cpf_cnpj})`,
          dados_novo: agente,
          resultado: "sucesso",
        });

        res.status(201).json({ agente });
      } catch (erro: any) {
        if (erro.message.includes("já existe")) {
          auditService.registrarAcao(req.auth, "criar_agente", "agentes_economicos", "falha", {
            descricao: `Tentativa de criar agente com CPF/CNPJ duplicado`,
            motivo_falha: erro.message,
            resultado: "falha",
          });
          return res.status(409).json({ erro: erro.message });
        }

        throw erro;
      }
    } catch (erro: any) {
      logger.error("Erro ao criar agente", { erro });
      res.status(500).json({ erro: "Erro ao criar agente" });
    }
  });

  /**
   * GET /api/v1/agentes-economicos/:id
   *
   * Buscar agente específico por ID
   *
   * Respostas:
   * - 200: { agente: AgenteEconomico }
   * - 401: { erro: string }
   * - 404: { erro: string }
   * - 500: { erro: string }
   */
  router.get("/:id", exigirAutenticacao, (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const agente = agenteService.obterPorId(id);
      if (!agente) {
        return res.status(404).json({ erro: `Agente ${id} não encontrado` });
      }

      auditService.registrarAcao(req.auth, "obter_agente", "agentes_economicos", id, {
        descricao: `${req.auth?.usuario?.email} consultou agente: ${agente.nome}`,
        resultado: "sucesso",
      });

      res.json({ agente });
    } catch (erro: any) {
      logger.error("Erro ao obter agente", { erro });
      res.status(500).json({ erro: "Erro ao obter agente" });
    }
  });

  /**
   * PUT /api/v1/agentes-economicos/:id
   *
   * Atualizar agente existente
   *
   * Body: AtualizarAgenteEconomicoSchema (campos opcionais)
   *
   * Respostas:
   * - 200: { agente: AgenteEconomico }
   * - 400: { erro: string, detalhes?: string[] }
   * - 401: { erro: string }
   * - 404: { erro: string }
   * - 409: { erro: string } — CPF/CNPJ duplicado
   * - 500: { erro: string }
   */
  router.put("/:id", exigirAutenticacao, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      // Validar entrada
      const parseResult = AtualizarAgenteEconomicoSchema.safeParse(req.body);
      if (!parseResult.success) {
        const issues = parseResult.error.issues;
        const mainIssue = issues[0];
        return res.status(400).json({
          erro: `Validação falhou: ${mainIssue?.message}`,
          detalhes: issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        });
      }

      const usuarioId = req.auth?.usuario?.id;
      if (!usuarioId) {
        return res.status(401).json({ erro: "Usuário não autenticado" });
      }

      // Verificar existência
      const agenteAnterior = agenteService.obterPorId(id);
      if (!agenteAnterior) {
        return res.status(404).json({ erro: `Agente ${id} não encontrado` });
      }

      const input = parseResult.data as AtualizarAgenteInput;

      try {
        const agenteAtualizado = await agenteService.atualizar(id, input, usuarioId);

        auditService.registrarAcao(req.auth, "atualizar_agente", "agentes_economicos", id, {
          descricao: `${req.auth?.usuario?.email} atualizou agente: ${agenteAtualizado.nome}`,
          dados_anterior: agenteAnterior,
          dados_novo: agenteAtualizado,
          resultado: "sucesso",
        });

        res.json({ agente: agenteAtualizado });
      } catch (erro: any) {
        if (erro.message.includes("não encontrado")) {
          return res.status(404).json({ erro: erro.message });
        }

        if (erro.message.includes("já existe")) {
          auditService.registrarAcao(req.auth, "atualizar_agente", "agentes_economicos", id, {
            descricao: `Tentativa de atualizar agente com CPF/CNPJ duplicado`,
            motivo_falha: erro.message,
            resultado: "falha",
          });
          return res.status(409).json({ erro: erro.message });
        }

        throw erro;
      }
    } catch (erro: any) {
      logger.error("Erro ao atualizar agente", { erro });
      res.status(500).json({ erro: "Erro ao atualizar agente" });
    }
  });

  /**
   * DELETE /api/v1/agentes-economicos/:id
   *
   * Desativar agente (soft delete)
   *
   * Respostas:
   * - 200: { agente: AgenteEconomico }
   * - 401: { erro: string }
   * - 404: { erro: string }
   * - 500: { erro: string }
   */
  router.delete("/:id", exigirAutenticacao, (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const agenteAnterior = agenteService.obterPorId(id);
      if (!agenteAnterior) {
        return res.status(404).json({ erro: `Agente ${id} não encontrado` });
      }

      const usuarioId = req.auth?.usuario?.id;
      if (!usuarioId) {
        return res.status(401).json({ erro: "Usuário não autenticado" });
      }

      const agenteDesativado = agenteService.desativar(id, usuarioId);

      auditService.registrarAcao(req.auth, "desativar_agente", "agentes_economicos", id, {
        descricao: `${req.auth?.usuario?.email} desativou agente: ${agenteDesativado.nome}`,
        resultado: "sucesso",
      });

      res.json({ agente: agenteDesativado });
    } catch (erro: any) {
      logger.error("Erro ao desativar agente", { erro });
      res.status(500).json({ erro: "Erro ao desativar agente" });
    }
  });

  /**
   * GET /api/v1/agentes-economicos/:id/duplicatas
   *
   * Listar suspeitas de duplicata para um agente
   *
   * Respostas:
   * - 200: { duplicatas: DuplicataResponse[] }
   * - 401: { erro: string }
   * - 404: { erro: string }
   * - 500: { erro: string }
   */
  router.get("/:id/duplicatas", exigirAutenticacao, (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      // Verificar se agente existe
      const agente = agenteService.obterPorId(id);
      if (!agente) {
        return res.status(404).json({ erro: `Agente ${id} não encontrado` });
      }

      const duplicatas = agenteService.listarDuplicatas(id);

      auditService.registrarAcao(req.auth, "listar_duplicatas", "agentes_economicos", id, {
        descricao: `${req.auth?.usuario?.email} listou duplicatas do agente: ${agente.nome}`,
        total: duplicatas.length,
        resultado: "sucesso",
      });

      res.json({ duplicatas });
    } catch (erro: any) {
      logger.error("Erro ao listar duplicatas", { erro });
      res.status(500).json({ erro: "Erro ao listar duplicatas" });
    }
  });

  return router;
}
