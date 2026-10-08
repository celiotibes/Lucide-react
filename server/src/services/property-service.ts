/**
 * Phase 22.20.3: Property Management Service
 *
 * Core business logic for property management, cost allocation,
 * depreciation calculations, and ROI analysis.
 */

import type Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { logger } from "./logger-service.js";

// =========================================================================
// Types & Interfaces
// =========================================================================

export interface Propriedade {
  id: string;
  nome: string;
  endereco: string;
  numero: string;
  complemento?: string;
  bairro?: string;
  cidade: string;
  estado: string;
  cep?: string;
  pais: string;
  tipoImovel: "residencial" | "comercial" | "industrial" | "rural" | "misto";
  areaTotal: number;
  areaConstruida?: number;
  numeroDormitorios?: number;
  numeroBanheiros?: number;
  descricao?: string;
  valorAquisicao: number;
  dataAquisicao: string;
  dataVenda?: string;
  valorVenda?: number;
  metodoDepreciacao: "linear" | "exponencial";
  taxaDepreciacao: number;
  vidaUtilAnos: number;
  valorResidual?: number;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
  criadoPor: string;
  atualizadoPor?: string;
}

export interface CustoPropiedade {
  id: string;
  propriedadeId: string;
  descricao: string;
  tipoCusto: "reforma" | "manutencao" | "imposto" | "seguro" | "administrativo" | "outro";
  categoriaContabil?: string;
  valor: number;
  dataCusto: string;
  percentualAlocacao: number;
  observacoes?: string;
  criadoEm: string;
  criadoPor: string;
}

export interface DepreciacaoPropiedade {
  id: string;
  propriedadeId: string;
  ano: number;
  mes: number;
  dataCalculo: string;
  valorInicial: number;
  valorDepreciacao: number;
  valorResidual: number;
  metodoAplicado: "linear" | "exponencial";
  taxaAplicada: number;
  depreciacaoAcumulada: number;
  calculadoEm: string;
  calculadoPor?: string;
}

export interface ROIPropiedade {
  id: string;
  propriedadeId: string;
  dataInicio: string;
  dataFim: string;
  diasPeriodo: number;
  valorInvestimentoTotal: number;
  custosTotais: number;
  receitasTotais: number;
  lucroLiquido: number;
  roiPercentual: number;
  roiAnualizado: number;
  valorPropriedadeAtual: number;
  ganhoValorizacao?: number;
  ganhoValorizacaoPercentual?: number;
  paybackMeses?: number;
  taxaRetornoAnual?: number;
  indiceLucratividade?: number;
  calculadoEm: string;
  calculadoPor?: string;
}

export interface ResumoPropriedade {
  propriedade: Propriedade;
  custosTotais: number;
  totalCustos: number;
  ultimoRoi?: number;
  ultimaAnaliseRoi?: string;
}

export interface FiltrosPropriedades {
  tipoImovel?: string;
  cidade?: string;
  estado?: string;
  ativo?: boolean;
  offset?: number;
  limit?: number;
}

// =========================================================================
// Property Service
// =========================================================================

export class PropertyService {
  private db: Database.Database;

  constructor(database: Database.Database) {
    this.db = database;
  }

  // =========================================================================
  // CRUD - Propriedades
  // =========================================================================

  /**
   * Create a new property
   */
  criarPropriedade(dados: Omit<Propriedade, "id" | "criadoEm" | "atualizadoEm">): Propriedade {
    const id = randomUUID();
    const agora = new Date().toISOString();

    try {
      this.db
        .prepare(
          `INSERT INTO propriedades (
            id, nome, endereco, numero, complemento, bairro, cidade, estado, cep, pais,
            tipo_imovel, area_total, area_construida, numero_dormitorios, numero_banheiros,
            descricao, valor_aquisicao, data_aquisicao, data_venda, valor_venda,
            metodo_depreciacao, taxa_depreciacao, vida_util_anos, valor_residual,
            ativo, criado_em, atualizado_em, criado_por, atualizado_por
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          dados.nome,
          dados.endereco,
          dados.numero,
          dados.complemento || null,
          dados.bairro || null,
          dados.cidade,
          dados.estado,
          dados.cep || null,
          dados.pais,
          dados.tipoImovel,
          dados.areaTotal,
          dados.areaConstruida || null,
          dados.numeroDormitorios || null,
          dados.numeroBanheiros || null,
          dados.descricao || null,
          dados.valorAquisicao,
          dados.dataAquisicao,
          dados.dataVenda || null,
          dados.valorVenda || null,
          dados.metodoDepreciacao,
          dados.taxaDepreciacao,
          dados.vidaUtilAnos,
          dados.valorResidual || null,
          1,
          agora,
          agora,
          dados.criadoPor,
          null,
        );

      logger.info("[PropertyService] Propriedade criada", { id, nome: dados.nome });

      return this.buscarPropriedadePorId(id)!;
    } catch (erro) {
      logger.error("[PropertyService] Erro ao criar propriedade", erro);
      throw new Error(`Falha ao criar propriedade: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }

  /**
   * Get property by ID
   */
  buscarPropriedadePorId(id: string): Propriedade | null {
    try {
      const linha = this.db
        .prepare(
          `SELECT * FROM propriedades WHERE id = ? AND ativo = 1`,
        )
        .get(id) as any;

      return linha ? this.mapeiaPropriedade(linha) : null;
    } catch (erro) {
      logger.error("[PropertyService] Erro ao buscar propriedade", erro);
      return null;
    }
  }

  /**
   * List properties with filters and pagination
   */
  listarPropriedades(filtros: FiltrosPropriedades = {}): { total: number; propriedades: Propriedade[] } {
    try {
      const offset = filtros.offset || 0;
      const limit = Math.min(filtros.limit || 50, 1000);

      let query = "SELECT * FROM propriedades WHERE ativo = 1";
      const parametros: any[] = [];

      if (filtros.tipoImovel) {
        query += " AND tipo_imovel = ?";
        parametros.push(filtros.tipoImovel);
      }
      if (filtros.cidade) {
        query += " AND cidade = ?";
        parametros.push(filtros.cidade);
      }
      if (filtros.estado) {
        query += " AND estado = ?";
        parametros.push(filtros.estado);
      }

      query += " ORDER BY nome ASC LIMIT ? OFFSET ?";
      parametros.push(limit, offset);

      const linhas = this.db
        .prepare(query)
        .all(...parametros) as any[];

      // Count total
      let countQuery = "SELECT COUNT(*) as total FROM propriedades WHERE ativo = 1";
      const countParams: any[] = [];

      if (filtros.tipoImovel) {
        countQuery += " AND tipo_imovel = ?";
        countParams.push(filtros.tipoImovel);
      }
      if (filtros.cidade) {
        countQuery += " AND cidade = ?";
        countParams.push(filtros.cidade);
      }
      if (filtros.estado) {
        countQuery += " AND estado = ?";
        countParams.push(filtros.estado);
      }

      const countResult = this.db.prepare(countQuery).get(...countParams) as { total: number };

      return {
        total: countResult.total,
        propriedades: linhas.map((l) => this.mapeiaPropriedade(l)),
      };
    } catch (erro) {
      logger.error("[PropertyService] Erro ao listar propriedades", erro);
      throw new Error(`Falha ao listar propriedades: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }

  /**
   * Update property
   */
  atualizarPropriedade(id: string, dados: Partial<Propriedade>, atualizadoPor: string): Propriedade {
    try {
      const propriedadeExistente = this.buscarPropriedadePorId(id);
      if (!propriedadeExistente) {
        throw new Error("Propriedade não encontrada");
      }

      const agora = new Date().toISOString();
      const updates: string[] = [];
      const valores: any[] = [];

      const camposAtualizaveis = [
        "nome",
        "endereco",
        "numero",
        "complemento",
        "bairro",
        "cidade",
        "estado",
        "cep",
        "tipoImovel",
        "areaTotal",
        "areaConstruida",
        "numeroDormitorios",
        "numeroBanheiros",
        "descricao",
        "valorAquisicao",
        "dataAquisicao",
        "dataVenda",
        "valorVenda",
        "taxaDepreciacao",
        "vidaUtilAnos",
        "valorResidual",
      ];

      for (const campo of camposAtualizaveis) {
        if (dados[campo as keyof Propriedade] !== undefined) {
          const nomeColuna = this.camelParaSnakeCase(campo);
          updates.push(`${nomeColuna} = ?`);
          valores.push(dados[campo as keyof Propriedade]);
        }
      }

      if (updates.length === 0) {
        return propriedadeExistente;
      }

      updates.push("atualizado_em = ?");
      valores.push(agora);
      updates.push("atualizado_por = ?");
      valores.push(atualizadoPor);

      valores.push(id);

      this.db
        .prepare(`UPDATE propriedades SET ${updates.join(", ")} WHERE id = ?`)
        .run(...valores);

      logger.info("[PropertyService] Propriedade atualizada", { id });

      return this.buscarPropriedadePorId(id)!;
    } catch (erro) {
      logger.error("[PropertyService] Erro ao atualizar propriedade", erro);
      throw new Error(`Falha ao atualizar propriedade: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }

  /**
   * Delete property (soft delete)
   */
  deletarPropriedade(id: string): boolean {
    try {
      const propriedade = this.buscarPropriedadePorId(id);
      if (!propriedade) {
        throw new Error("Propriedade não encontrada");
      }

      this.db
        .prepare("UPDATE propriedades SET ativo = 0, atualizado_em = ? WHERE id = ?")
        .run(new Date().toISOString(), id);

      logger.info("[PropertyService] Propriedade deletada (soft)", { id });
      return true;
    } catch (erro) {
      logger.error("[PropertyService] Erro ao deletar propriedade", erro);
      throw new Error(`Falha ao deletar propriedade: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }

  // =========================================================================
  // Cost Allocation
  // =========================================================================

  /**
   * Add cost to property
   */
  adicionarCusto(
    propriedadeId: string,
    dados: Omit<CustoPropiedade, "id" | "criadoEm">,
  ): CustoPropiedade {
    try {
      const propriedade = this.buscarPropriedadePorId(propriedadeId);
      if (!propriedade) {
        throw new Error("Propriedade não encontrada");
      }

      const id = randomUUID();
      const agora = new Date().toISOString();

      this.db
        .prepare(
          `INSERT INTO propriedades_custos (
            id, propriedade_id, descricao, tipo_custo, categoria_contabil,
            valor, data_custo, percentual_alocacao, observacoes, criado_em, criado_por
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          propriedadeId,
          dados.descricao,
          dados.tipoCusto,
          dados.categoriaContabil || null,
          dados.valor,
          dados.dataCusto,
          dados.percentualAlocacao,
          dados.observacoes || null,
          agora,
          dados.criadoPor,
        );

      logger.info("[PropertyService] Custo adicionado", { id, propriedadeId });

      return this.buscarCustoPorId(id)!;
    } catch (erro) {
      logger.error("[PropertyService] Erro ao adicionar custo", erro);
      throw new Error(`Falha ao adicionar custo: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }

  /**
   * Get costs for property
   */
  obterCustosPropriedade(propriedadeId: string): CustoPropiedade[] {
    try {
      const linhas = this.db
        .prepare("SELECT * FROM propriedades_custos WHERE propriedade_id = ? ORDER BY data_custo DESC")
        .all(propriedadeId) as any[];

      return linhas.map((l) => this.mapeiaCustom<CustoPropiedade>(l, {
        id: "id",
        propriedadeId: "propriedade_id",
        descricao: "descricao",
        tipoCusto: "tipo_custo",
        categoriaContabil: "categoria_contabil",
        valor: "valor",
        dataCusto: "data_custo",
        percentualAlocacao: "percentual_alocacao",
        observacoes: "observacoes",
        criadoEm: "criado_em",
        criadoPor: "criado_por",
      }));
    } catch (erro) {
      logger.error("[PropertyService] Erro ao obter custos", erro);
      return [];
    }
  }

  /**
   * Get cost summary for property
   */
  obterResumoCustosPropriedade(propriedadeId: string): {
    totalCustos: number;
    custosReforma: number;
    custosManutencao: number;
    custosImposto: number;
    custosSeguro: number;
    custosAdministrativos: number;
    custosOutros: number;
  } {
    try {
      const resultado = this.db
        .prepare(
          `SELECT
            COALESCE(SUM(valor * percentual_alocacao / 100), 0) as totalCustos,
            COALESCE(SUM(CASE WHEN tipo_custo = 'reforma' THEN valor * percentual_alocacao / 100 ELSE 0 END), 0) as custosReforma,
            COALESCE(SUM(CASE WHEN tipo_custo = 'manutencao' THEN valor * percentual_alocacao / 100 ELSE 0 END), 0) as custosManutencao,
            COALESCE(SUM(CASE WHEN tipo_custo = 'imposto' THEN valor * percentual_alocacao / 100 ELSE 0 END), 0) as custosImposto,
            COALESCE(SUM(CASE WHEN tipo_custo = 'seguro' THEN valor * percentual_alocacao / 100 ELSE 0 END), 0) as custosSeguro,
            COALESCE(SUM(CASE WHEN tipo_custo = 'administrativo' THEN valor * percentual_alocacao / 100 ELSE 0 END), 0) as custosAdministrativos,
            COALESCE(SUM(CASE WHEN tipo_custo = 'outro' THEN valor * percentual_alocacao / 100 ELSE 0 END), 0) as custosOutros
          FROM propriedades_custos
          WHERE propriedade_id = ?`,
        )
        .get(propriedadeId) as any;

      return {
        totalCustos: resultado.totalCustos || 0,
        custosReforma: resultado.custosReforma || 0,
        custosManutencao: resultado.custosManutencao || 0,
        custosImposto: resultado.custosImposto || 0,
        custosSeguro: resultado.custosSeguro || 0,
        custosAdministrativos: resultado.custosAdministrativos || 0,
        custosOutros: resultado.custosOutros || 0,
      };
    } catch (erro) {
      logger.error("[PropertyService] Erro ao obter resumo de custos", erro);
      return {
        totalCustos: 0,
        custosReforma: 0,
        custosManutencao: 0,
        custosImposto: 0,
        custosSeguro: 0,
        custosAdministrativos: 0,
        custosOutros: 0,
      };
    }
  }

  /**
   * Delete cost
   */
  deletarCusto(id: string): boolean {
    try {
      this.db.prepare("DELETE FROM propriedades_custos WHERE id = ?").run(id);
      logger.info("[PropertyService] Custo deletado", { id });
      return true;
    } catch (erro) {
      logger.error("[PropertyService] Erro ao deletar custo", erro);
      throw new Error(`Falha ao deletar custo: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }

  // =========================================================================
  // Depreciation Calculations
  // =========================================================================

  /**
   * Calculate depreciation for a property
   */
  calcularDepreciacao(
    propriedadeId: string,
    ano: number,
    mes: number,
    calculadoPor: string,
  ): DepreciacaoPropiedade {
    try {
      const propriedade = this.buscarPropriedadePorId(propriedadeId);
      if (!propriedade) {
        throw new Error("Propriedade não encontrada");
      }

      const id = randomUUID();
      const agora = new Date().toISOString();

      // Get previous depreciation or use acquisition value
      const anterior = this.db
        .prepare(
          `SELECT * FROM propriedades_depreciacao
           WHERE propriedade_id = ?
           ORDER BY ano DESC, mes DESC LIMIT 1`,
        )
        .get(propriedadeId) as any;

      const valorInicial = anterior ? anterior.valor_residual : propriedade.valorAquisicao;

      // Calculate depreciation
      let valorDepreciacao = 0;
      if (propriedade.metodoDepreciacao === "linear") {
        valorDepreciacao = valorInicial / (propriedade.vidaUtilAnos * 12);
      } else {
        // Exponential: monthly rate = (1 - (residual/initial)^(1/(useful_life*12)))
        const taxaMensal = 1 - Math.pow((propriedade.valorResidual || 0.1 * valorInicial) / valorInicial, 1 / (propriedade.vidaUtilAnos * 12));
        valorDepreciacao = valorInicial * taxaMensal;
      }

      const valorResidual = Math.max(0, valorInicial - valorDepreciacao);
      const depreciacaoAcumulada = (anterior?.depreciacao_acumulada || 0) + valorDepreciacao;

      this.db
        .prepare(
          `INSERT INTO propriedades_depreciacao (
            id, propriedade_id, ano, mes, data_calculo, valor_inicial, valor_depreciacao,
            valor_residual, metodo_aplicado, taxa_aplicada, depreciacao_acumulada,
            calculado_em, calculado_por
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          propriedadeId,
          ano,
          mes,
          `${ano}-${String(mes).padStart(2, "0")}-01`,
          valorInicial,
          valorDepreciacao,
          valorResidual,
          propriedade.metodoDepreciacao,
          propriedade.taxaDepreciacao,
          depreciacaoAcumulada,
          agora,
          calculadoPor,
        );

      logger.info("[PropertyService] Depreciação calculada", { id, propriedadeId });

      return this.buscarDepreciacaoPorId(id)!;
    } catch (erro) {
      logger.error("[PropertyService] Erro ao calcular depreciação", erro);
      throw new Error(`Falha ao calcular depreciação: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }

  /**
   * Get depreciation history
   */
  obterHistoricoDepreciacao(propriedadeId: string): DepreciacaoPropiedade[] {
    try {
      const linhas = this.db
        .prepare(
          `SELECT * FROM propriedades_depreciacao
           WHERE propriedade_id = ?
           ORDER BY ano ASC, mes ASC`,
        )
        .all(propriedadeId) as any[];

      return linhas.map((l) => this.mapeiaDepreciacao(l));
    } catch (erro) {
      logger.error("[PropertyService] Erro ao obter histórico de depreciação", erro);
      return [];
    }
  }

  /**
   * Get accumulated depreciation
   */
  obterDepreciacaoAcumulada(propriedadeId: string): { depreciacao: number; percentual: number } {
    try {
      const propriedade = this.buscarPropriedadePorId(propriedadeId);
      if (!propriedade) {
        return { depreciacao: 0, percentual: 0 };
      }

      const resultado = this.db
        .prepare(
          `SELECT COALESCE(MAX(depreciacao_acumulada), 0) as depreciacao
           FROM propriedades_depreciacao
           WHERE propriedade_id = ?`,
        )
        .get(propriedadeId) as { depreciacao: number };

      const percentual = (resultado.depreciacao / propriedade.valorAquisicao) * 100;

      return {
        depreciacao: resultado.depreciacao,
        percentual: Math.min(percentual, 100),
      };
    } catch (erro) {
      logger.error("[PropertyService] Erro ao obter depreciação acumulada", erro);
      return { depreciacao: 0, percentual: 0 };
    }
  }

  // =========================================================================
  // ROI Analysis
  // =========================================================================

  /**
   * Calculate ROI for a property in a period
   */
  calcularROI(
    propriedadeId: string,
    dataInicio: string,
    dataFim: string,
    calculadoPor: string,
  ): ROIPropiedade {
    try {
      const propriedade = this.buscarPropriedadePorId(propriedadeId);
      if (!propriedade) {
        throw new Error("Propriedade não encontrada");
      }

      const id = randomUUID();
      const agora = new Date().toISOString();

      // Calculate days in period
      const inicio = new Date(dataInicio);
      const fim = new Date(dataFim);
      const diasPeriodo = Math.floor((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24));

      // Get costs in period
      const custoResult = this.db
        .prepare(
          `SELECT COALESCE(SUM(valor * percentual_alocacao / 100), 0) as custos
           FROM propriedades_custos
           WHERE propriedade_id = ? AND data_custo >= ? AND data_custo <= ?`,
        )
        .get(propriedadeId, dataInicio, dataFim) as { custos: number };

      const custosTotais = custoResult.custos;

      // Get current value (from last depreciation)
      const depreciacaoResult = this.db
        .prepare(
          `SELECT COALESCE(valor_residual, ?) as valor_atual
           FROM propriedades_depreciacao
           WHERE propriedade_id = ?
           ORDER BY data_calculo DESC LIMIT 1`,
        )
        .get(propriedade.valorAquisicao, propriedadeId) as { valor_atual: number };

      const valorPropriedadeAtual = depreciacaoResult.valor_atual;
      const ganhoValorizacao = valorPropriedadeAtual - propriedade.valorAquisicao;
      const ganhoValorizacaoPercentual = (ganhoValorizacao / propriedade.valorAquisicao) * 100;

      // Investment data
      const valorInvestimentoTotal = propriedade.valorAquisicao + custosTotais;
      const receitasTotais = 0; // Placeholder for future rental income
      const lucroLiquido = ganhoValorizacao + receitasTotais - custosTotais;

      // Calculate ROI metrics
      const roiPercentual = (lucroLiquido / valorInvestimentoTotal) * 100;
      const anosDecorridos = diasPeriodo / 365.25;
      const roiAnualizado = anosDecorridos > 0 ? roiPercentual / anosDecorridos : 0;

      const taxaRetornoAnual = anosDecorridos > 0 ? (Math.pow(valorPropriedadeAtual / propriedade.valorAquisicao, 1 / anosDecorridos) - 1) * 100 : 0;
      const paybackMeses = custosTotais > 0 && ganhoValorizacao > 0 ? Math.round((custosTotais * 12) / ganhoValorizacao) : undefined;
      const indiceLucratividade = custosTotais > 0 ? ganhoValorizacao / custosTotais : 0;

      this.db
        .prepare(
          `INSERT INTO propriedades_roi (
            id, propriedade_id, data_inicio, data_fim, dias_periodo,
            valor_investimento_total, custos_totais, receitas_totais, lucro_liquido,
            roi_percentual, roi_anualizado, valor_propriedade_atual,
            ganho_valorizacao, ganho_valorizacao_percentual,
            payback_meses, taxa_retorno_anual, indice_lucratividade,
            calculado_em, calculado_por
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          propriedadeId,
          dataInicio,
          dataFim,
          diasPeriodo,
          valorInvestimentoTotal,
          custosTotais,
          receitasTotais,
          lucroLiquido,
          roiPercentual,
          roiAnualizado,
          valorPropriedadeAtual,
          ganhoValorizacao,
          ganhoValorizacaoPercentual,
          paybackMeses || null,
          taxaRetornoAnual,
          indiceLucratividade,
          agora,
          calculadoPor,
        );

      logger.info("[PropertyService] ROI calculado", { id, propriedadeId });

      return this.buscarROIPorId(id)!;
    } catch (erro) {
      logger.error("[PropertyService] Erro ao calcular ROI", erro);
      throw new Error(`Falha ao calcular ROI: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }

  /**
   * Get ROI history
   */
  obterHistoricoROI(propriedadeId: string): ROIPropiedade[] {
    try {
      const linhas = this.db
        .prepare(
          `SELECT * FROM propriedades_roi
           WHERE propriedade_id = ?
           ORDER BY data_fim DESC`,
        )
        .all(propriedadeId) as any[];

      return linhas.map((l) => this.mapeiaROI(l));
    } catch (erro) {
      logger.error("[PropertyService] Erro ao obter histórico ROI", erro);
      return [];
    }
  }

  /**
   * Get latest ROI
   */
  obterUltimoROI(propriedadeId: string): ROIPropiedade | null {
    try {
      const linha = this.db
        .prepare(
          `SELECT * FROM propriedades_roi
           WHERE propriedade_id = ?
           ORDER BY data_fim DESC LIMIT 1`,
        )
        .get(propriedadeId) as any;

      return linha ? this.mapeiaROI(linha) : null;
    } catch (erro) {
      logger.error("[PropertyService] Erro ao obter último ROI", erro);
      return null;
    }
  }

  // =========================================================================
  // Helper Methods
  // =========================================================================

  private mapeiaPropriedade(linha: any): Propriedade {
    return {
      id: linha.id,
      nome: linha.nome,
      endereco: linha.endereco,
      numero: linha.numero,
      complemento: linha.complemento,
      bairro: linha.bairro,
      cidade: linha.cidade,
      estado: linha.estado,
      cep: linha.cep,
      pais: linha.pais,
      tipoImovel: linha.tipo_imovel,
      areaTotal: linha.area_total,
      areaConstruida: linha.area_construida,
      numeroDormitorios: linha.numero_dormitorios,
      numeroBanheiros: linha.numero_banheiros,
      descricao: linha.descricao,
      valorAquisicao: linha.valor_aquisicao,
      dataAquisicao: linha.data_aquisicao,
      dataVenda: linha.data_venda,
      valorVenda: linha.valor_venda,
      metodoDepreciacao: linha.metodo_depreciacao,
      taxaDepreciacao: linha.taxa_depreciacao,
      vidaUtilAnos: linha.vida_util_anos,
      valorResidual: linha.valor_residual,
      ativo: !!linha.ativo,
      criadoEm: linha.criado_em,
      atualizadoEm: linha.atualizado_em,
      criadoPor: linha.criado_por,
      atualizadoPor: linha.atualizado_por,
    };
  }

  private mapeiaDepreciacao(linha: any): DepreciacaoPropiedade {
    return {
      id: linha.id,
      propriedadeId: linha.propriedade_id,
      ano: linha.ano,
      mes: linha.mes,
      dataCalculo: linha.data_calculo,
      valorInicial: linha.valor_inicial,
      valorDepreciacao: linha.valor_depreciacao,
      valorResidual: linha.valor_residual,
      metodoAplicado: linha.metodo_aplicado,
      taxaAplicada: linha.taxa_aplicada,
      depreciacaoAcumulada: linha.depreciacao_acumulada,
      calculadoEm: linha.calculado_em,
      calculadoPor: linha.calculado_por,
    };
  }

  private mapeiaROI(linha: any): ROIPropiedade {
    return {
      id: linha.id,
      propriedadeId: linha.propriedade_id,
      dataInicio: linha.data_inicio,
      dataFim: linha.data_fim,
      diasPeriodo: linha.dias_periodo,
      valorInvestimentoTotal: linha.valor_investimento_total,
      custosTotais: linha.custos_totais,
      receitasTotais: linha.receitas_totais,
      lucroLiquido: linha.lucro_liquido,
      roiPercentual: linha.roi_percentual,
      roiAnualizado: linha.roi_anualizado,
      valorPropriedadeAtual: linha.valor_propriedade_atual,
      ganhoValorizacao: linha.ganho_valorizacao,
      ganhoValorizacaoPercentual: linha.ganho_valorizacao_percentual,
      paybackMeses: linha.payback_meses,
      taxaRetornoAnual: linha.taxa_retorno_anual,
      indiceLucratividade: linha.indice_lucratividade,
      calculadoEm: linha.calculado_em,
      calculadoPor: linha.calculado_por,
    };
  }

  private mapeiaCustom<T>(linha: any, mapa: Record<string, string>): T {
    const resultado: any = {};
    for (const [chaveNova, chaveAntiga] of Object.entries(mapa)) {
      resultado[chaveNova] = linha[chaveAntiga];
    }
    return resultado;
  }

  private camelParaSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, (letra) => `_${letra.toLowerCase()}`);
  }

  private buscarCustoPorId(id: string): CustoPropiedade | null {
    const linha = this.db
      .prepare("SELECT * FROM propriedades_custos WHERE id = ?")
      .get(id) as any;

    return linha
      ? this.mapeiaCustom<CustoPropiedade>(linha, {
          id: "id",
          propriedadeId: "propriedade_id",
          descricao: "descricao",
          tipoCusto: "tipo_custo",
          categoriaContabil: "categoria_contabil",
          valor: "valor",
          dataCusto: "data_custo",
          percentualAlocacao: "percentual_alocacao",
          observacoes: "observacoes",
          criadoEm: "criado_em",
          criadoPor: "criado_por",
        })
      : null;
  }

  private buscarDepreciacaoPorId(id: string): DepreciacaoPropiedade | null {
    const linha = this.db
      .prepare("SELECT * FROM propriedades_depreciacao WHERE id = ?")
      .get(id) as any;
    return linha ? this.mapeiaDepreciacao(linha) : null;
  }

  private buscarROIPorId(id: string): ROIPropiedade | null {
    const linha = this.db.prepare("SELECT * FROM propriedades_roi WHERE id = ?").get(id) as any;
    return linha ? this.mapeiaROI(linha) : null;
  }
}
