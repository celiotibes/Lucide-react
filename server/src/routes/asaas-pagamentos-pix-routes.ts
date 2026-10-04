/**
 * Rotas HTTP para Pagamentos PIX Proativos via Asaas (Phase 5).
 *
 * Permitir que o sistema inicie pagamentos PIX a fornecedores/prestadores,
 * com rastreamento de status + conciliação automática via webhook.
 *
 * Endpoints:
 * - POST /api/asaas/pagamentos-pix/criar — cria novo pagamento
 * - GET /api/asaas/pagamentos-pix/:id — retorna status + histórico
 * - GET /api/asaas/pagamentos-pix — lista com filtros
 *
 * Requer autenticação Bearer (middleware de authService).
 */

import express from "express";
import { logger } from '../services/logger-service.js';
import type { AuthServiceDB } from "../domain/auth/auth-service-db.js";
import type Database from "better-sqlite3";
import { criarMiddlewareAutenticacao } from "./auth-routes.js";
import { criarExigirPosse } from "../middleware/posse-recurso.js";
import {
  criarPagamentoPix,
  buscarPagamentoPix,
  buscarStatusPagamentoPix,
  listarPagamentosPix,
  validarDadosPagamento,
  atualizarPagamentoPix,
  deletarPagamentoPix,
  type DadosPagamentoPix,
  type TipoChavePix,
  AsaasApiError,
} from "../domain/integracoes/asaas-pagamentos-pix.js";

export interface AsaasPixRoutesDeps {
  authService: AuthServiceDB;
  db?: Database.Database;
}

export function criarRotasAsaasPixProativo(deps: AsaasPixRoutesDeps): express.Router {
  const router = express.Router();
  const { authService, db } = deps;

  // Autenticação POR ROTA (não mais router.use): papéis externos são negados por padrão em
  // todas as rotas; a única exceção é GET /pagamentos-pix/:id, que um prestador pode
  // consultar para um pagamento que lhe foi concedido via ACL (tipo "pagamento_pix").
  const exigirAutenticacao = criarMiddlewareAutenticacao(authService);
  const exigirAutenticacaoComExternos = criarMiddlewareAutenticacao(authService, { permitirPapeisExternos: true });
  const exigirPosse = db ? criarExigirPosse(db) : undefined;

  /**
   * POST /api/asaas/pagamentos-pix/criar
   *
   * Cria um novo pagamento PIX via Asaas.
   * Valida dados, chama API Asaas, grava no banco com status PENDING.
   *
   * Request body:
   *   - beneficiarioId: string (identificador único do fornecedor)
   *   - beneficiarioNome: string
   *   - beneficiarioCpfCnpj: string (com ou sem formatação)
   *   - valor: number (em R$)
   *   - descricao: string (ex: "Pagamento de serviços - Contrato #123")
   *   - tipoChavePix: "CPF" | "CNPJ" | "EMAIL" | "TELEFONE" | "ALEATORIO"
   *   - chavePixValue?: string (obrigatório se tipoChavePix !== "ALEATORIO")
   *
   * Response:
   *   {
   *     id: string (UUID local),
   *     asaasPaymentId: string (ID do pagamento na Asaas),
   *     beneficiarioId: string,
   *     valor: number,
   *     status: "PROCESSING" | "PENDING" | "FAILED",
   *     dataCriacao: string (ISO),
   *     qrCode?: string (apenas sandbox)
   *   }
   *
   * Erros:
   *   - 400: validação falhou
   *   - 500: erro na API Asaas ou banco
   *   - 503: Asaas indisponível
   */
  router.post("/pagamentos-pix/criar", exigirAutenticacao, async (req, res) => {
    try {
      if (!db) {
        return res.status(500).json({ erro: "Database não disponível" });
      }

      const {
        beneficiarioId,
        beneficiarioNome,
        beneficiarioCpfCnpj,
        valor,
        descricao,
        tipoChavePix,
        chavePixValue,
      } = req.body;

      // Validação básica de entrada
      if (
        !beneficiarioId ||
        !beneficiarioNome ||
        !beneficiarioCpfCnpj ||
        valor === undefined ||
        !descricao ||
        !tipoChavePix
      ) {
        return res.status(400).json({
          erro: "Campos obrigatórios: beneficiarioId, beneficiarioNome, beneficiarioCpfCnpj, valor, descricao, tipoChavePix",
        });
      }

      // Valida com função de domínio
      const validacao = validarDadosPagamento(
        beneficiarioId,
        beneficiarioNome,
        beneficiarioCpfCnpj,
        valor,
        descricao,
        tipoChavePix,
        chavePixValue,
      );

      if (!validacao.valido) {
        return res.status(400).json({
          erro: "Validação falhou",
          detalhes: validacao.erros,
        });
      }

      // Cria o pagamento
      const dados: DadosPagamentoPix = {
        beneficiarioId,
        beneficiarioNome,
        beneficiarioCpfCnpj,
        valor,
        descricao,
        tipoChavePix: tipoChavePix as TipoChavePix,
        chavePixValue,
      };

      const pagamento = await criarPagamentoPix(db, dados);

      res.status(201).json({
        id: pagamento.id,
        asaasPaymentId: pagamento.asaasPaymentId,
        beneficiarioId: pagamento.beneficiarioId,
        valor: pagamento.valor,
        status: pagamento.status,
        dataCriacao: pagamento.criadoEm,
        qrCode: pagamento.qrCode || undefined,
      });
    } catch (erro) {
      logger.error("[AsaasPix] Erro ao criar pagamento:", erro);

      if (erro instanceof AsaasApiError) {
        return res.status(erro.status).json({
          erro: "Erro na API Asaas",
          detalhes: erro.message,
        });
      }

      if (erro instanceof Error && erro.message.includes("Validação falhou")) {
        return res.status(400).json({
          erro: erro.message,
        });
      }

      res.status(500).json({
        erro: "Erro ao criar pagamento PIX",
      });
    }
  });

  /**
   * GET /api/asaas/pagamentos-pix/:id
   *
   * Retorna um pagamento específico com status atual + histórico completo.
   * Se for chamado, sincroniza com Asaas para obter status mais recente.
   *
   * Response:
   *   {
   *     pagamento: {
   *       id, asaasPaymentId, beneficiarioId, beneficiarioNome, beneficiarioCpfCnpj,
   *       valor, descricao, status, tipoChavePix, criadoEm, atualizadoEm, ...
   *     },
   *     historico: [
   *       { statusAnterior, statusNovo, criadoEm },
   *       ...
   *     ]
   *   }
   *
   * Erros:
   *   - 404: pagamento não encontrado
   *   - 500: erro ao sincronizar com Asaas
   */
  router.get(
    "/pagamentos-pix/:id",
    exigirAutenticacaoComExternos,
    exigirPosse ? exigirPosse("pagamento_pix", "id") : (_req, res) => { res.status(500).json({ erro: "Database não disponível" }); },
    async (req, res) => {
    try {
      if (!db) {
        return res.status(500).json({ erro: "Database não disponível" });
      }

      const { id } = req.params;
      const papel = req.auth?.usuario?.role;
      const externo = papel === "inquilino" || papel === "prestador";

      // Tenta sincronizar com Asaas (atualiza status). Papéis externos NÃO disparam sincronização
      // (evita que um acesso externo gere chamadas à Asaas); veem o último estado conhecido.
      if (!externo) {
        try {
          await buscarStatusPagamentoPix(db, id);
        } catch (e) {
          logger.warn(`[AsaasPix] Erro ao sincronizar pagamento ${id}:`, e instanceof Error ? e.message : e);
          // Continua mesmo com erro (retorna o que temos localmente)
        }
      }

      // Busca o pagamento
      const pagamento = buscarPagamentoPix(db, id);
      if (!pagamento) {
        return res.status(404).json({
          erro: "Pagamento não encontrado",
        });
      }

      // Busca histórico
      const histStmt = db.prepare(`
        SELECT status_anterior, status_novo, criado_em
        FROM pagamentos_pix_historico
        WHERE pagamento_id = ?
        ORDER BY criado_em ASC
      `);
      const historico = histStmt.all(id) as Record<string, unknown>[];

      // Projeção mínima para papéis externos: sem chave PIX, CPF/CNPJ, QR code nem ids da Asaas.
      const pagamentoVisivel = externo
        ? {
            id: pagamento.id,
            valor: pagamento.valor,
            descricao: pagamento.descricao,
            status: pagamento.status,
            criadoEm: pagamento.criadoEm,
            atualizadoEm: pagamento.atualizadoEm,
          }
        : pagamento;

      res.json({
        pagamento: pagamentoVisivel,
        historico: historico.map((h) => ({
          statusAnterior: h.status_anterior,
          statusNovo: h.status_novo,
          criadoEm: h.criado_em,
        })),
      });
    } catch (erro) {
      logger.error("[AsaasPix] Erro ao buscar pagamento:", erro);
      res.status(500).json({
        erro: "Erro ao buscar pagamento",
      });
    }
  });

  /**
   * GET /api/asaas/pagamentos-pix
   *
   * Lista pagamentos com filtros opcionais.
   * Não sincroniza com Asaas (mais rápido; use GET /:id para sincronização).
   *
   * Query params (todos opcionais):
   *   - status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED"
   *   - beneficiarioId: string (filtra por beneficiário específico)
   *   - diasAtras: number (filtrar últimos N dias; default: sem limite)
   *
   * Response:
   *   {
   *     pagamentos: [ { id, valor, status, beneficiarioId, ... }, ... ],
   *     total: number
   *   }
   */
  /**
   * GET /api/asaas/pagamentos-pix
   *
   * Lista pagamentos com filtros opcionais.
   * Não sincroniza com Asaas (mais rápido; use GET /:id para sincronização).
   *
   * Query params (todos opcionais):
   *   - status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED"
   *   - beneficiarioId: string (filtra por beneficiário específico)
   *   - diasAtras: number (filtrar últimos N dias; default: sem limite)
   */
  router.get("/pagamentos-pix", exigirAutenticacao, (req, res) => {
    try {
      if (!db) {
        return res.status(500).json({ erro: "Database não disponível" });
      }

      const { status, beneficiarioId, diasAtras } = req.query;

      // Type-safe filter object construction
      const filtros: {
        status?: string;
        beneficiarioId?: string;
        diasAtras?: number;
      } = {};

      if (status) {
        filtros.status = String(status);
      }

      if (beneficiarioId) {
        filtros.beneficiarioId = String(beneficiarioId);
      }

      if (diasAtras) {
        filtros.diasAtras = parseInt(String(diasAtras), 10);
      }

      const pagamentos = listarPagamentosPix(db, filtros);

      res.json({
        pagamentos,
        total: pagamentos.length,
      });
    } catch (erro) {
      logger.error("[AsaasPix] Erro ao listar pagamentos:", erro);
      res.status(500).json({
        erro: "Erro ao listar pagamentos",
      });
    }
  });

  /**
   * POST /api/asaas/pagamentos-pix/:id/sincronizar
   *
   * Força sincronização manual de um pagamento com Asaas.
   * Atualiza status se mudou, grava no histórico.
   *
   * Response:
   *   {
   *     sucesso: true,
   *     statusAnterior: string,
   *     statusNovo: string,
   *     atualizou: boolean
   *   }
   *
   * Erros:
   *   - 404: pagamento não encontrado
   *   - 500: erro ao sincronizar
   */
  router.post("/pagamentos-pix/:id/sincronizar", exigirAutenticacao, async (req, res) => {
    try {
      if (!db) {
        return res.status(500).json({ erro: "Database não disponível" });
      }

      const { id } = req.params;

      const pagamentoAntes = buscarPagamentoPix(db, id);
      if (!pagamentoAntes) {
        return res.status(404).json({
          erro: "Pagamento não encontrado",
        });
      }

      const statusAnterior = pagamentoAntes.status;

      // Sincroniza
      const pagamentoDepois = await buscarStatusPagamentoPix(db, id);
      const statusNovo = pagamentoDepois?.status ?? statusAnterior;

      res.json({
        sucesso: true,
        statusAnterior,
        statusNovo,
        atualizou: statusAnterior !== statusNovo,
      });
    } catch (erro) {
      logger.error("[AsaasPix] Erro ao sincronizar pagamento:", erro);
      res.status(500).json({
        erro: "Erro ao sincronizar pagamento",
      });
    }
  });

  /**
   * PUT /api/asaas/pagamentos-pix/:id
   *
   * Atualiza um pagamento PIX (descrição e/ou status).
   * Permite mudanças apenas em pagamentos não processados ainda.
   *
   * Request body:
   *   - descricao?: string (nova descrição)
   *   - status?: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED"
   *
   * Response:
   *   { id, asaasPaymentId, beneficiarioId, valor, status, ... }
   *
   * Erros:
   *   - 400: validação falhou ou campos inválidos
   *   - 404: pagamento não encontrado
   *   - 500: erro ao atualizar
   */
  router.put("/pagamentos-pix/:id", exigirAutenticacao, async (req, res) => {
    try {
      if (!db) {
        return res.status(500).json({ erro: "Database não disponível" });
      }

      const { id } = req.params;
      const { descricao, status } = req.body;

      // Validação: pelo menos um campo deve ser fornecido
      if (descricao === undefined && status === undefined) {
        return res.status(400).json({
          erro: "Forneça pelo menos um campo para atualizar (descricao, status)",
        });
      }

      // Valida status se fornecido
      if (status !== undefined) {
        const statusValidos = ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"];
        if (!statusValidos.includes(status)) {
          return res.status(400).json({
            erro: `Status inválido. Use um de: ${statusValidos.join(", ")}`,
          });
        }
      }

      const pagamentoAntes = buscarPagamentoPix(db, id);
      if (!pagamentoAntes) {
        return res.status(404).json({
          erro: "Pagamento não encontrado",
        });
      }

      // Atualiza
      const pagamentoAtualizado = atualizarPagamentoPix(db, id, {
        descricao: descricao !== undefined ? descricao : undefined,
        status: status !== undefined ? status : undefined,
      });

      res.json({
        id: pagamentoAtualizado!.id,
        asaasPaymentId: pagamentoAtualizado!.asaasPaymentId,
        beneficiarioId: pagamentoAtualizado!.beneficiarioId,
        beneficiarioNome: pagamentoAtualizado!.beneficiarioNome,
        beneficiarioCpfCnpj: pagamentoAtualizado!.beneficiarioCpfCnpj,
        valor: pagamentoAtualizado!.valor,
        descricao: pagamentoAtualizado!.descricao,
        status: pagamentoAtualizado!.status,
        tipoChavePix: pagamentoAtualizado!.tipoChavePix,
        criadoEm: pagamentoAtualizado!.criadoEm,
        atualizadoEm: pagamentoAtualizado!.atualizadoEm,
      });
    } catch (erro) {
      logger.error("[AsaasPix] Erro ao atualizar pagamento:", erro);
      res.status(500).json({
        erro: "Erro ao atualizar pagamento",
      });
    }
  });

  /**
   * DELETE /api/asaas/pagamentos-pix/:id
   *
   * Deleta um pagamento PIX (apenas se ainda não foi processado).
   * Permite deletar apenas pagamentos com status PENDING, FAILED ou CANCELLED.
   *
   * Response:
   *   { sucesso: true, deletado: true }
   *
   * Erros:
   *   - 400: pagamento em estado que não pode ser deletado
   *   - 404: pagamento não encontrado
   *   - 500: erro ao deletar
   */
  router.delete("/pagamentos-pix/:id", exigirAutenticacao, async (req, res) => {
    try {
      if (!db) {
        return res.status(500).json({ erro: "Database não disponível" });
      }

      const { id } = req.params;

      const pagamento = buscarPagamentoPix(db, id);
      if (!pagamento) {
        return res.status(404).json({
          erro: "Pagamento não encontrado",
        });
      }

      // Tenta deletar
      try {
        const deletado = deletarPagamentoPix(db, id);
        if (!deletado) {
          return res.status(404).json({
            erro: "Pagamento não encontrado",
          });
        }

        res.json({
          sucesso: true,
          deletado: true,
        });
      } catch (erro) {
        if (erro instanceof Error && erro.message.includes("Não é possível deletar")) {
          return res.status(400).json({
            erro: erro.message,
          });
        }
        throw erro;
      }
    } catch (erro) {
      logger.error("[AsaasPix] Erro ao deletar pagamento:", erro);
      res.status(500).json({
        erro: "Erro ao deletar pagamento",
      });
    }
  });

  return router;
}
