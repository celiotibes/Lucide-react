/**
 * Rotas HTTP para Sistema de Papéis e Permissões de Agentes
 *
 * GET    /api/v1/agentes-papeis                           — Lista todos os papéis disponíveis
 * GET    /api/v1/agentes-papeis/:papel                    — Obtém detalhes de um papel específico
 * GET    /api/v1/agentes-papeis/:papel/requisitos         — Obtém requisitos de um papel
 * GET    /api/v1/agentes-papeis/:papel/permissoes         — Obtém matriz de permissões para um papel
 * GET    /api/v1/agentes-papeis/:papel/tipos-transacao    — Obtém tipos de transação por papel
 * POST   /api/v1/agentes-papeis/validar                   — Valida agente contra requisitos de papel
 */

import express from "express";
import { z } from "zod";
import { logger } from "../services/logger-service.js";
import type { AuthServiceDB } from "../domain/auth/auth-service-db.js";
import { criarMiddlewareAutenticacao } from "./auth-routes.js";
import {
  PapelAgente,
  TipoEntidade,
} from "../domain/erp/agentes-tipos.js";
import {
  obterDefinicaoPapel,
  listarPapeis,
  validarCamposObrigatorios,
  obterPermissoes,
  temPermissao,
  obterTiposTransacao,
  validarCompatibilidadeEntidadePapel,
  obterNivelRisco,
  PapelUsuario,
  AcaoPermissao,
  MATRIZ_PERMISSOES,
} from "../domain/erp/agentes-papeis.js";

// =====================================================================
// Schemas de Validação
// =====================================================================

const ValidarAgenteSchema = z.object({
  papel: z.nativeEnum(PapelAgente),
  tipo_entidade: z.nativeEnum(TipoEntidade),
  agente: z.record(z.any()),
});

const QueryPermissoesSchema = z.object({
  papel_usuario: z.nativeEnum(PapelUsuario).optional(),
}).strict();

// =====================================================================
// Type Definitions
// =====================================================================

export interface AgentPapeisRoutesDeps {
  authService: AuthServiceDB;
}

// =====================================================================
// Routes
// =====================================================================

export function criarRotasAgentesPapeis({
  authService,
}: AgentPapeisRoutesDeps): express.Router {
  const router = express.Router();
  const exigirAutenticacao = criarMiddlewareAutenticacao(authService);

  /**
   * GET /api/v1/agentes-papeis
   * Lista todos os papéis de agentes disponíveis com seus requisitos
   */
  router.get("/", exigirAutenticacao, (req, res) => {
    try {
      const papeis = listarPapeis();

      const resultado = papeis.map((papel) => ({
        codigo: papel.codigo,
        nome_pt: papel.nome_pt,
        descricao_pt: papel.descricao_pt,
        campos_obrigatorios: papel.camposObrigatorios,
        regime_tributario_padrao: papel.regimeTributarioPadrao,
        requer_validacao_manual: papel.requerValidacaoManual,
        requer_documentacao: papel.requerDocumentacao,
        nivel_risco: papel.nivelRisco,
      }));

      logger.info("Papéis listados com sucesso", { count: resultado.length });
      res.json({
        success: true,
        data: resultado,
        count: resultado.length,
      });
    } catch (error) {
      logger.error("Erro ao listar papéis", { error });
      res.status(500).json({
        success: false,
        error: "Erro ao listar papéis",
      });
    }
  });

  /**
   * GET /api/v1/agentes-papeis/:papel
   * Obtém detalhes completos de um papel específico
   */
  router.get("/:papel", exigirAutenticacao, (req, res) => {
    try {
      const papel = req.params.papel as PapelAgente;

      // Validar que é um papel válido
      if (!Object.values(PapelAgente).includes(papel)) {
        return res.status(400).json({
          success: false,
          error: "Papel inválido",
          papel_validos: Object.values(PapelAgente),
        });
      }

      const definicao = obterDefinicaoPapel(papel);

      res.json({
        success: true,
        data: {
          codigo: definicao.codigo,
          nome_pt: definicao.nome_pt,
          descricao_pt: definicao.descricao_pt,
          campos_obrigatorios: definicao.camposObrigatorios,
          regime_tributario_padrao: definicao.regimeTributarioPadrao,
          tipos_transacao_tipicos: definicao.tiposTransacaoTipicos,
          validacoes_especificas: definicao.validacoesEspecificas,
          requer_validacao_manual: definicao.requerValidacaoManual,
          requer_documentacao: definicao.requerDocumentacao,
          nivel_risco: definicao.nivelRisco,
          ativos_por_padrao: definicao.ativosPorPadrao,
        },
      });
    } catch (error) {
      logger.error("Erro ao obter papel", { error });
      res.status(500).json({
        success: false,
        error: "Erro ao obter papel",
      });
    }
  });

  /**
   * GET /api/v1/agentes-papeis/:papel/requisitos
   * Obtém requisitos específicos de um papel
   */
  router.get("/:papel/requisitos", exigirAutenticacao, (req, res) => {
    try {
      const papel = req.params.papel as PapelAgente;

      if (!Object.values(PapelAgente).includes(papel)) {
        return res.status(400).json({
          success: false,
          error: "Papel inválido",
        });
      }

      const definicao = obterDefinicaoPapel(papel);

      res.json({
        success: true,
        data: {
          papel: papel,
          requisitos: {
            campos_obrigatorios: definicao.camposObrigatorios,
            regime_tributario_padrao: definicao.regimeTributarioPadrao,
            validacoes: definicao.validacoesEspecificas,
            requer_validacao_manual: definicao.requerValidacaoManual,
            requer_documentacao: definicao.requerDocumentacao,
          },
        },
      });
    } catch (error) {
      logger.error("Erro ao obter requisitos do papel", { error });
      res.status(500).json({
        success: false,
        error: "Erro ao obter requisitos",
      });
    }
  });

  /**
   * GET /api/v1/agentes-papeis/:papel/permissoes
   * Obtém matriz de permissões para um papel de agente
   * Opcionalmente filtra por papel de usuário específico
   */
  router.get("/:papel/permissoes", exigirAutenticacao, (req, res) => {
    try {
      const papel = req.params.papel as PapelAgente;
      const queryParams = QueryPermissoesSchema.parse(req.query);

      if (!Object.values(PapelAgente).includes(papel)) {
        return res.status(400).json({
          success: false,
          error: "Papel inválido",
        });
      }

      // Filtrar permissões para este papel
      let permissoes = MATRIZ_PERMISSOES.filter(
        (p) => p.papelAgente === papel
      );

      // Se especificado um papel de usuário, filtrar ainda mais
      if (queryParams.papel_usuario) {
        permissoes = permissoes.filter(
          (p) => p.papelUsuario === queryParams.papel_usuario
        );
      }

      const resultado = permissoes.map((p) => ({
        papel_agente: p.papelAgente,
        papel_usuario: p.papelUsuario,
        acoes: p.acoes,
        acoes_count: p.acoes.length,
      }));

      res.json({
        success: true,
        data: resultado,
        total: resultado.length,
        papel_agente: papel,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: "Parâmetros inválidos",
          details: error.errors,
        });
      }
      logger.error("Erro ao obter permissões", { error });
      res.status(500).json({
        success: false,
        error: "Erro ao obter permissões",
      });
    }
  });

  /**
   * GET /api/v1/agentes-papeis/:papel/tipos-transacao
   * Obtém tipos de transação típicos para um papel
   */
  router.get("/:papel/tipos-transacao", exigirAutenticacao, (req, res) => {
    try {
      const papel = req.params.papel as PapelAgente;

      if (!Object.values(PapelAgente).includes(papel)) {
        return res.status(400).json({
          success: false,
          error: "Papel inválido",
        });
      }

      const tipos = obterTiposTransacao(papel);

      res.json({
        success: true,
        data: {
          papel: papel,
          tipos_transacao: tipos,
          total: tipos.length,
        },
      });
    } catch (error) {
      logger.error("Erro ao obter tipos de transação", { error });
      res.status(500).json({
        success: false,
        error: "Erro ao obter tipos de transação",
      });
    }
  });

  /**
   * POST /api/v1/agentes-papeis/validar
   * Valida um agente contra os requisitos de seu papel
   */
  router.post("/validar", exigirAutenticacao, (req, res) => {
    try {
      const bodyParams = ValidarAgenteSchema.parse(req.body);

      const { papel, tipo_entidade, agente } = bodyParams;

      // Validar compatibilidade entre tipo de entidade e papel
      const compativel = validarCompatibilidadeEntidadePapel(
        tipo_entidade,
        papel
      );

      if (!compativel) {
        return res.status(400).json({
          success: false,
          error: "Tipo de entidade incompatível com o papel",
          tipo_entidade,
          papel,
        });
      }

      // Validar campos obrigatórios
      const camposFaltantes = validarCamposObrigatorios(agente, papel);

      const definicao = obterDefinicaoPapel(papel);

      res.json({
        success: camposFaltantes.length === 0,
        data: {
          papel: papel,
          tipo_entidade: tipo_entidade,
          valido: camposFaltantes.length === 0,
          campos_faltantes: camposFaltantes,
          campos_obrigatorios: definicao.camposObrigatorios,
          requer_validacao_manual: definicao.requerValidacaoManual,
          requer_documentacao: definicao.requerDocumentacao,
          nivel_risco: definicao.nivelRisco,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: "Dados inválidos",
          details: error.errors,
        });
      }
      logger.error("Erro ao validar agente", { error });
      res.status(500).json({
        success: false,
        error: "Erro ao validar agente",
      });
    }
  });

  /**
   * GET /api/v1/agentes-papeis/matriz/permissoes
   * Obtém toda a matriz de permissões
   */
  router.get("/matriz/permissoes", exigirAutenticacao, (req, res) => {
    try {
      const resultado = MATRIZ_PERMISSOES.map((p) => ({
        papel_agente: p.papelAgente,
        papel_usuario: p.papelUsuario,
        acoes: p.acoes,
      }));

      // Agrupar por papel de agente
      const agrupado: Record<PapelAgente, Array<{
        papel_usuario: PapelUsuario;
        acoes: AcaoPermissao[];
      }>> = {} as any;

      resultado.forEach((p) => {
        if (!agrupado[p.papel_agente]) {
          agrupado[p.papel_agente] = [];
        }
        agrupado[p.papel_agente].push({
          papel_usuario: p.papel_usuario,
          acoes: p.acoes,
        });
      });

      res.json({
        success: true,
        data: agrupado,
        total_entries: resultado.length,
      });
    } catch (error) {
      logger.error("Erro ao obter matriz de permissões", { error });
      res.status(500).json({
        success: false,
        error: "Erro ao obter matriz de permissões",
      });
    }
  });

  /**
   * GET /api/v1/agentes-papeis/papeis-usuario/:papel_usuario
   * Obtém quais ações um papel de usuário pode fazer em cada papel de agente
   */
  router.get(
    "/papeis-usuario/:papel_usuario",
    exigirAutenticacao,
    (req, res) => {
      try {
        const papelUsuario = req.params.papel_usuario as PapelUsuario;

        if (!Object.values(PapelUsuario).includes(papelUsuario)) {
          return res.status(400).json({
            success: false,
            error: "Papel de usuário inválido",
            papeis_validos: Object.values(PapelUsuario),
          });
        }

        const permissoes = MATRIZ_PERMISSOES.filter(
          (p) => p.papelUsuario === papelUsuario
        );

        const resultado = permissoes.map((p) => ({
          papel_agente: p.papelAgente,
          acoes: p.acoes,
        }));

        res.json({
          success: true,
          data: {
            papel_usuario: papelUsuario,
            permissoes: resultado,
            total: resultado.length,
          },
        });
      } catch (error) {
        logger.error("Erro ao obter permissões do papel de usuário", { error });
        res.status(500).json({
          success: false,
          error: "Erro ao obter permissões",
        });
      }
    }
  );

  return router;
}
