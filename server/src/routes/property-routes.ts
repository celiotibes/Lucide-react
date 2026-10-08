/**
 * Phase 22.20.3: Property Management Routes
 *
 * HTTP endpoints for property management:
 * - CRUD operations for properties
 * - Cost allocation and tracking
 * - Depreciation calculations
 * - ROI analysis
 */

import express, { type Request, type Response } from "express";
import type { AuthServiceDB } from "../domain/auth/auth-service-db.js";
import type { AuditTrailServiceDB } from "../domain/auth/audit-trail-db.js";
import { criarMiddlewareAutenticacao } from "./auth-routes.js";
import { PropertyService } from "../services/property-service.js";
import type Database from "better-sqlite3";

export interface PropertyRoutesConfig {
  db: Database.Database;
  authService: AuthServiceDB;
  auditService: AuditTrailServiceDB;
}

// =========================================================================
// Validation Helpers
// =========================================================================

function validarPropriedade(dados: any): string | null {
  if (!dados.nome || typeof dados.nome !== "string") return "nome é obrigatório (string)";
  if (!dados.endereco || typeof dados.endereco !== "string") return "endereco é obrigatório (string)";
  if (!dados.numero || typeof dados.numero !== "string") return "numero é obrigatório (string)";
  if (!dados.cidade || typeof dados.cidade !== "string") return "cidade é obrigatória (string)";
  if (!dados.estado || typeof dados.estado !== "string") return "estado é obrigatório (string)";

  const tiposValidos = ["residencial", "comercial", "industrial", "rural", "misto"];
  if (!tiposValidos.includes(dados.tipoImovel)) return `tipoImovel deve ser um de: ${tiposValidos.join(", ")}`;

  if (typeof dados.areaTotal !== "number" || dados.areaTotal <= 0) return "areaTotal deve ser número positivo";
  if (typeof dados.valorAquisicao !== "number" || dados.valorAquisicao <= 0) return "valorAquisicao deve ser número positivo";

  if (!dados.dataAquisicao || !/^\d{4}-\d{2}-\d{2}$/.test(dados.dataAquisicao)) return "dataAquisicao deve ser formato YYYY-MM-DD";

  const metodosValidos = ["linear", "exponencial"];
  if (!metodosValidos.includes(dados.metodoDepreciacao)) return `metodoDepreciacao deve ser um de: ${metodosValidos.join(", ")}`;

  if (typeof dados.taxaDepreciacao !== "number" || dados.taxaDepreciacao < 0 || dados.taxaDepreciacao > 100) {
    return "taxaDepreciacao deve ser número entre 0 e 100";
  }

  return null;
}

function validarCusto(dados: any): string | null {
  if (!dados.descricao || typeof dados.descricao !== "string") return "descricao é obrigatória (string)";

  const tiposValidos = ["reforma", "manutencao", "imposto", "seguro", "administrativo", "outro"];
  if (!tiposValidos.includes(dados.tipoCusto)) return `tipoCusto deve ser um de: ${tiposValidos.join(", ")}`;

  if (typeof dados.valor !== "number" || dados.valor <= 0) return "valor deve ser número positivo";
  if (!dados.dataCusto || !/^\d{4}-\d{2}-\d{2}$/.test(dados.dataCusto)) return "dataCusto deve ser formato YYYY-MM-DD";

  if (typeof dados.percentualAlocacao !== "number" || dados.percentualAlocacao <= 0 || dados.percentualAlocacao > 100) {
    return "percentualAlocacao deve ser número entre 0 e 100";
  }

  return null;
}

// =========================================================================
// Routes Factory
// =========================================================================

export function criarRotasPropriedades({ db, authService, auditService }: PropertyRoutesConfig): express.Router {
  const router = express.Router();
  const exigirAutenticacao = criarMiddlewareAutenticacao(authService);
  const propertyService = new PropertyService(db);

  // =========================================================================
  // CRUD - Propriedades
  // =========================================================================

  /**
   * POST /api/properties
   * Create a new property
   */
  router.post("/", exigirAutenticacao, (req: Request, res: Response) => {
    try {
      const contexto = req.autenticacao!;
      const validacaoErro = validarPropriedade(req.body);

      if (validacaoErro) {
        res.status(400).json({ erro: validacaoErro });
        return;
      }

      const propriedade = propertyService.criarPropriedade({
        ...req.body,
        criadoPor: contexto.usuarioId,
        ativo: true,
      });

      auditService.registrarAcao(contexto, {
        tipoAcao: "criar_apontamento",
        recurso: "propriedades",
        recursoId: propriedade.id,
        descricao: `Propriedade criada: ${propriedade.nome}`,
        valoresNovos: propriedade,
        resultado: "sucesso",
      });

      res.status(201).json(propriedade);
    } catch (erro) {
      res.status(500).json({ erro: erro instanceof Error ? erro.message : "Falha ao criar propriedade" });
    }
  });

  /**
   * GET /api/properties/:id
   * Get property by ID
   */
  router.get("/:id", exigirAutenticacao, (req: Request, res: Response) => {
    try {
      const propriedade = propertyService.buscarPropriedadePorId(req.params.id);

      if (!propriedade) {
        res.status(404).json({ erro: "Propriedade não encontrada" });
        return;
      }

      res.json(propriedade);
    } catch (erro) {
      res.status(500).json({ erro: erro instanceof Error ? erro.message : "Falha ao buscar propriedade" });
    }
  });

  /**
   * GET /api/properties
   * List properties with filters and pagination
   */
  router.get("/", exigirAutenticacao, (req: Request, res: Response) => {
    try {
      const filtros = {
        tipoImovel: req.query.tipoImovel as string | undefined,
        cidade: req.query.cidade as string | undefined,
        estado: req.query.estado as string | undefined,
        offset: req.query.offset ? Number(req.query.offset) : 0,
        limit: req.query.limit ? Number(req.query.limit) : 50,
      };

      const resultado = propertyService.listarPropriedades(filtros);
      res.json(resultado);
    } catch (erro) {
      res.status(500).json({ erro: erro instanceof Error ? erro.message : "Falha ao listar propriedades" });
    }
  });

  /**
   * PUT /api/properties/:id
   * Update property
   */
  router.put("/:id", exigirAutenticacao, (req: Request, res: Response) => {
    try {
      const contexto = req.autenticacao!;
      const propriedadeAntiga = propertyService.buscarPropriedadePorId(req.params.id);

      if (!propriedadeAntiga) {
        res.status(404).json({ erro: "Propriedade não encontrada" });
        return;
      }

      const propriedadeAtualizada = propertyService.atualizarPropriedade(req.params.id, req.body, contexto.usuarioId);

      auditService.registrarAcao(contexto, {
        tipoAcao: "atualizar_apontamento",
        recurso: "propriedades",
        recursoId: req.params.id,
        descricao: `Propriedade atualizada: ${propriedadeAtualizada.nome}`,
        valoresAntigos: propriedadeAntiga,
        valoresNovos: propriedadeAtualizada,
        resultado: "sucesso",
      });

      res.json(propriedadeAtualizada);
    } catch (erro) {
      res.status(500).json({ erro: erro instanceof Error ? erro.message : "Falha ao atualizar propriedade" });
    }
  });

  /**
   * DELETE /api/properties/:id
   * Delete property (soft delete)
   */
  router.delete("/:id", exigirAutenticacao, (req: Request, res: Response) => {
    try {
      const contexto = req.autenticacao!;
      const propriedade = propertyService.buscarPropriedadePorId(req.params.id);

      if (!propriedade) {
        res.status(404).json({ erro: "Propriedade não encontrada" });
        return;
      }

      propertyService.deletarPropriedade(req.params.id);

      auditService.registrarAcao(contexto, {
        tipoAcao: "deletar_apontamento",
        recurso: "propriedades",
        recursoId: req.params.id,
        descricao: `Propriedade deletada: ${propriedade.nome}`,
        resultado: "sucesso",
      });

      res.json({ sucesso: true });
    } catch (erro) {
      res.status(500).json({ erro: erro instanceof Error ? erro.message : "Falha ao deletar propriedade" });
    }
  });

  // =========================================================================
  // Cost Allocation
  // =========================================================================

  /**
   * GET /api/properties/:id/costs
   * Get costs for property
   */
  router.get("/:id/costs", exigirAutenticacao, (req: Request, res: Response) => {
    try {
      const propriedade = propertyService.buscarPropriedadePorId(req.params.id);
      if (!propriedade) {
        res.status(404).json({ erro: "Propriedade não encontrada" });
        return;
      }

      const custos = propertyService.obterCustosPropriedade(req.params.id);
      res.json({ propriedadeId: req.params.id, custos });
    } catch (erro) {
      res.status(500).json({ erro: erro instanceof Error ? erro.message : "Falha ao obter custos" });
    }
  });

  /**
   * POST /api/properties/:id/allocate-cost
   * Add cost to property
   */
  router.post("/:id/allocate-cost", exigirAutenticacao, (req: Request, res: Response) => {
    try {
      const contexto = req.autenticacao!;
      const propriedade = propertyService.buscarPropriedadePorId(req.params.id);

      if (!propriedade) {
        res.status(404).json({ erro: "Propriedade não encontrada" });
        return;
      }

      const validacaoErro = validarCusto(req.body);
      if (validacaoErro) {
        res.status(400).json({ erro: validacaoErro });
        return;
      }

      const custo = propertyService.adicionarCusto(req.params.id, {
        ...req.body,
        criadoPor: contexto.usuarioId,
      });

      auditService.registrarAcao(contexto, {
        tipoAcao: "criar_apontamento",
        recurso: "propriedades_custos",
        recursoId: custo.id,
        descricao: `Custo adicionado à propriedade ${propriedade.nome}: ${custo.descricao}`,
        valoresNovos: custo,
        resultado: "sucesso",
      });

      res.status(201).json(custo);
    } catch (erro) {
      res.status(500).json({ erro: erro instanceof Error ? erro.message : "Falha ao adicionar custo" });
    }
  });

  /**
   * GET /api/properties/:id/cost-summary
   * Get cost summary for property
   */
  router.get("/:id/cost-summary", exigirAutenticacao, (req: Request, res: Response) => {
    try {
      const propriedade = propertyService.buscarPropriedadePorId(req.params.id);
      if (!propriedade) {
        res.status(404).json({ erro: "Propriedade não encontrada" });
        return;
      }

      const resumo = propertyService.obterResumoCustosPropriedade(req.params.id);
      res.json({
        propriedadeId: req.params.id,
        ...resumo,
      });
    } catch (erro) {
      res.status(500).json({ erro: erro instanceof Error ? erro.message : "Falha ao obter resumo de custos" });
    }
  });

  /**
   * DELETE /api/properties/:id/costs/:costId
   * Delete cost
   */
  router.delete("/:id/costs/:costId", exigirAutenticacao, (req: Request, res: Response) => {
    try {
      const contexto = req.autenticacao!;
      propertyService.deletarCusto(req.params.costId);

      auditService.registrarAcao(contexto, {
        tipoAcao: "deletar_apontamento",
        recurso: "propriedades_custos",
        recursoId: req.params.costId,
        descricao: "Custo deletado",
        resultado: "sucesso",
      });

      res.json({ sucesso: true });
    } catch (erro) {
      res.status(500).json({ erro: erro instanceof Error ? erro.message : "Falha ao deletar custo" });
    }
  });

  // =========================================================================
  // Depreciation
  // =========================================================================

  /**
   * POST /api/properties/:id/depreciation/calculate
   * Calculate depreciation for a month
   */
  router.post("/:id/depreciation/calculate", exigirAutenticacao, (req: Request, res: Response) => {
    try {
      const contexto = req.autenticacao!;
      const { ano, mes } = req.body;

      if (!ano || typeof ano !== "number" || ano < 1900 || ano > 2100) {
        res.status(400).json({ erro: "ano deve ser número entre 1900 e 2100" });
        return;
      }

      if (!mes || typeof mes !== "number" || mes < 1 || mes > 12) {
        res.status(400).json({ erro: "mes deve ser número entre 1 e 12" });
        return;
      }

      const propriedade = propertyService.buscarPropriedadePorId(req.params.id);
      if (!propriedade) {
        res.status(404).json({ erro: "Propriedade não encontrada" });
        return;
      }

      const depreciacao = propertyService.calcularDepreciacao(req.params.id, ano, mes, contexto.usuarioId);

      auditService.registrarAcao(contexto, {
        tipoAcao: "criar_apontamento",
        recurso: "propriedades_depreciacao",
        recursoId: depreciacao.id,
        descricao: `Depreciação calculada para ${propriedade.nome} (${ano}-${String(mes).padStart(2, "0")})`,
        resultado: "sucesso",
      });

      res.status(201).json(depreciacao);
    } catch (erro) {
      res.status(500).json({ erro: erro instanceof Error ? erro.message : "Falha ao calcular depreciação" });
    }
  });

  /**
   * GET /api/properties/:id/depreciation/history
   * Get depreciation history
   */
  router.get("/:id/depreciation/history", exigirAutenticacao, (req: Request, res: Response) => {
    try {
      const propriedade = propertyService.buscarPropriedadePorId(req.params.id);
      if (!propriedade) {
        res.status(404).json({ erro: "Propriedade não encontrada" });
        return;
      }

      const historico = propertyService.obterHistoricoDepreciacao(req.params.id);
      res.json({
        propriedadeId: req.params.id,
        historico,
      });
    } catch (erro) {
      res.status(500).json({ erro: erro instanceof Error ? erro.message : "Falha ao obter histórico de depreciação" });
    }
  });

  /**
   * GET /api/properties/:id/depreciation/accumulated
   * Get accumulated depreciation
   */
  router.get("/:id/depreciation/accumulated", exigirAutenticacao, (req: Request, res: Response) => {
    try {
      const propriedade = propertyService.buscarPropriedadePorId(req.params.id);
      if (!propriedade) {
        res.status(404).json({ erro: "Propriedade não encontrada" });
        return;
      }

      const acumulada = propertyService.obterDepreciacaoAcumulada(req.params.id);
      res.json({
        propriedadeId: req.params.id,
        ...acumulada,
      });
    } catch (erro) {
      res.status(500).json({ erro: erro instanceof Error ? erro.message : "Falha ao obter depreciação acumulada" });
    }
  });

  // =========================================================================
  // ROI Analysis
  // =========================================================================

  /**
   * POST /api/properties/:id/roi/calculate
   * Calculate ROI for a period
   */
  router.post("/:id/roi/calculate", exigirAutenticacao, (req: Request, res: Response) => {
    try {
      const contexto = req.autenticacao!;
      const { dataInicio, dataFim } = req.body;

      if (!dataInicio || !/^\d{4}-\d{2}-\d{2}$/.test(dataInicio)) {
        res.status(400).json({ erro: "dataInicio deve ser formato YYYY-MM-DD" });
        return;
      }

      if (!dataFim || !/^\d{4}-\d{2}-\d{2}$/.test(dataFim)) {
        res.status(400).json({ erro: "dataFim deve ser formato YYYY-MM-DD" });
        return;
      }

      if (new Date(dataInicio) >= new Date(dataFim)) {
        res.status(400).json({ erro: "dataInicio deve ser anterior a dataFim" });
        return;
      }

      const propriedade = propertyService.buscarPropriedadePorId(req.params.id);
      if (!propriedade) {
        res.status(404).json({ erro: "Propriedade não encontrada" });
        return;
      }

      const roi = propertyService.calcularROI(req.params.id, dataInicio, dataFim, contexto.usuarioId);

      auditService.registrarAcao(contexto, {
        tipoAcao: "criar_apontamento",
        recurso: "propriedades_roi",
        recursoId: roi.id,
        descricao: `ROI calculado para ${propriedade.nome} (${dataInicio} a ${dataFim})`,
        resultado: "sucesso",
      });

      res.status(201).json(roi);
    } catch (erro) {
      res.status(500).json({ erro: erro instanceof Error ? erro.message : "Falha ao calcular ROI" });
    }
  });

  /**
   * GET /api/properties/:id/roi
   * Get latest ROI or history
   */
  router.get("/:id/roi", exigirAutenticacao, (req: Request, res: Response) => {
    try {
      const propriedade = propertyService.buscarPropriedadePorId(req.params.id);
      if (!propriedade) {
        res.status(404).json({ erro: "Propriedade não encontrada" });
        return;
      }

      const incluirHistorico = req.query.historico === "true";

      if (incluirHistorico) {
        const historico = propertyService.obterHistoricoROI(req.params.id);
        res.json({
          propriedadeId: req.params.id,
          historico,
        });
      } else {
        const ultimoRoi = propertyService.obterUltimoROI(req.params.id);
        res.json({
          propriedadeId: req.params.id,
          roi: ultimoRoi,
        });
      }
    } catch (erro) {
      res.status(500).json({ erro: erro instanceof Error ? erro.message : "Falha ao obter ROI" });
    }
  });

  return router;
}
