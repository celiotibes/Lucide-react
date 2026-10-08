/**
 * Phase 22.20.3: Property Service Tests
 *
 * Test coverage for property management functionality:
 * - CRUD operations
 * - Cost allocation
 * - Depreciation calculations
 * - ROI analysis
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { PropertyService } from "../services/property-service.js";

// =========================================================================
// Setup
// =========================================================================

let db: Database.Database;
let propertyService: PropertyService;
let usuarioId: string;

beforeAll(() => {
  db = new Database(":memory:");

  // Create minimal schema for testing
  db.exec(`
    CREATE TABLE usuarios (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      email TEXT NOT NULL,
      papel TEXT NOT NULL
    );

    CREATE TABLE propriedades (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      endereco TEXT NOT NULL,
      numero TEXT NOT NULL,
      complemento TEXT,
      bairro TEXT,
      cidade TEXT NOT NULL,
      estado TEXT NOT NULL,
      cep TEXT,
      pais TEXT DEFAULT 'BR',
      tipo_imovel TEXT NOT NULL CHECK (tipo_imovel IN ('residencial', 'comercial', 'industrial', 'rural', 'misto')),
      area_total REAL NOT NULL,
      area_construida REAL,
      numero_dormitorios INTEGER,
      numero_banheiros INTEGER,
      descricao TEXT,
      valor_aquisicao DECIMAL(15, 2) NOT NULL,
      data_aquisicao DATE NOT NULL,
      data_venda DATE,
      valor_venda DECIMAL(15, 2),
      metodo_depreciacao TEXT NOT NULL DEFAULT 'linear' CHECK (metodo_depreciacao IN ('linear', 'exponencial')),
      taxa_depreciacao DECIMAL(5, 2) NOT NULL DEFAULT 0.05,
      vida_util_anos INTEGER DEFAULT 27,
      valor_residual DECIMAL(15, 2),
      ativo TINYINT NOT NULL DEFAULT 1,
      criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      criado_por TEXT NOT NULL,
      atualizado_por TEXT,
      FOREIGN KEY (criado_por) REFERENCES usuarios(id),
      FOREIGN KEY (atualizado_por) REFERENCES usuarios(id)
    );

    CREATE TABLE propriedades_custos (
      id TEXT PRIMARY KEY,
      propriedade_id TEXT NOT NULL,
      descricao TEXT NOT NULL,
      tipo_custo TEXT NOT NULL CHECK (tipo_custo IN ('reforma', 'manutencao', 'imposto', 'seguro', 'administrativo', 'outro')),
      categoria_contabil TEXT,
      valor DECIMAL(15, 2) NOT NULL,
      data_custo DATE NOT NULL,
      percentual_alocacao DECIMAL(5, 2) NOT NULL DEFAULT 100.00,
      observacoes TEXT,
      criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      criado_por TEXT NOT NULL,
      FOREIGN KEY (propriedade_id) REFERENCES propriedades(id) ON DELETE CASCADE,
      FOREIGN KEY (criado_por) REFERENCES usuarios(id)
    );

    CREATE TABLE propriedades_depreciacao (
      id TEXT PRIMARY KEY,
      propriedade_id TEXT NOT NULL,
      ano INTEGER NOT NULL,
      mes INTEGER NOT NULL,
      data_calculo DATE NOT NULL,
      valor_inicial DECIMAL(15, 2) NOT NULL,
      valor_depreciacao DECIMAL(15, 2) NOT NULL,
      valor_residual DECIMAL(15, 2) NOT NULL,
      metodo_aplicado TEXT NOT NULL CHECK (metodo_aplicado IN ('linear', 'exponencial')),
      taxa_aplicada DECIMAL(5, 2) NOT NULL,
      depreciacao_acumulada DECIMAL(15, 2) NOT NULL,
      calculado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      calculado_por TEXT,
      FOREIGN KEY (propriedade_id) REFERENCES propriedades(id) ON DELETE CASCADE,
      FOREIGN KEY (calculado_por) REFERENCES usuarios(id),
      UNIQUE (propriedade_id, ano, mes)
    );

    CREATE TABLE propriedades_roi (
      id TEXT PRIMARY KEY,
      propriedade_id TEXT NOT NULL,
      data_inicio DATE NOT NULL,
      data_fim DATE NOT NULL,
      dias_periodo INTEGER NOT NULL,
      valor_investimento_total DECIMAL(15, 2) NOT NULL,
      custos_totais DECIMAL(15, 2) NOT NULL,
      receitas_totais DECIMAL(15, 2) NOT NULL,
      lucro_liquido DECIMAL(15, 2) NOT NULL,
      roi_percentual DECIMAL(8, 2) NOT NULL,
      roi_anualizado DECIMAL(8, 2) NOT NULL,
      valor_propriedade_atual DECIMAL(15, 2) NOT NULL,
      ganho_valorizacao DECIMAL(15, 2),
      ganho_valorizacao_percentual DECIMAL(8, 2),
      payback_meses INTEGER,
      taxa_retorno_anual DECIMAL(8, 2),
      indice_lucratividade DECIMAL(8, 4),
      calculado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      calculado_por TEXT,
      FOREIGN KEY (propriedade_id) REFERENCES propriedades(id) ON DELETE CASCADE,
      FOREIGN KEY (calculado_por) REFERENCES usuarios(id)
    );
  `);

  // Create test user
  usuarioId = randomUUID();
  db.prepare(
    `INSERT INTO usuarios (id, nome, email, papel) VALUES (?, ?, ?, ?)`,
  ).run(usuarioId, "Test User", "test@example.com", "titular");

  propertyService = new PropertyService(db);
});

afterAll(() => {
  db.close();
});

// =========================================================================
// CRUD Tests
// =========================================================================

describe("PropertyService - CRUD", () => {
  let propriedadeId: string;

  it("should create a property", () => {
    const propriedade = propertyService.criarPropriedade({
      nome: "Casa Praia",
      endereco: "Rua da Praia",
      numero: "123",
      cidade: "Fortaleza",
      estado: "CE",
      tipoImovel: "residencial",
      areaTotal: 150,
      valorAquisicao: 500000,
      dataAquisicao: "2023-01-15",
      metodoDepreciacao: "linear",
      taxaDepreciacao: 0.05,
      vidaUtilAnos: 27,
      criadoPor: usuarioId,
      pais: "BR",
    });

    expect(propriedade.id).toBeDefined();
    expect(propriedade.nome).toBe("Casa Praia");
    expect(propriedade.ativo).toBe(true);

    propriedadeId = propriedade.id;
  });

  it("should retrieve property by id", () => {
    const propriedade = propertyService.buscarPropriedadePorId(propriedadeId);

    expect(propriedade).toBeDefined();
    expect(propriedade?.nome).toBe("Casa Praia");
    expect(propriedade?.valorAquisicao).toBe(500000);
  });

  it("should list properties", () => {
    const resultado = propertyService.listarPropriedades({
      limit: 10,
    });

    expect(resultado.total).toBeGreaterThan(0);
    expect(resultado.propriedades.length).toBeGreaterThan(0);
  });

  it("should update property", () => {
    const propriedadeAtualizada = propertyService.atualizarPropriedade(
      propriedadeId,
      {
        areaTotal: 200,
      },
      usuarioId,
    );

    expect(propriedadeAtualizada.areaTotal).toBe(200);
  });

  it("should soft delete property", () => {
    propertyService.deletarPropriedade(propriedadeId);
    const propriedade = propertyService.buscarPropriedadePorId(propriedadeId);

    expect(propriedade).toBeNull();
  });
});

// =========================================================================
// Cost Allocation Tests
// =========================================================================

describe("PropertyService - Cost Allocation", () => {
  let propriedadeId: string;

  beforeAll(() => {
    const propriedade = propertyService.criarPropriedade({
      nome: "Apartamento Centro",
      endereco: "Av. Paulista",
      numero: "500",
      cidade: "São Paulo",
      estado: "SP",
      tipoImovel: "comercial",
      areaTotal: 200,
      valorAquisicao: 800000,
      dataAquisicao: "2022-06-10",
      metodoDepreciacao: "linear",
      taxaDepreciacao: 0.05,
      vidaUtilAnos: 27,
      criadoPor: usuarioId,
      pais: "BR",
    });

    propriedadeId = propriedade.id;
  });

  it("should add cost to property", () => {
    const custo = propertyService.adicionarCusto(propriedadeId, {
      descricao: "Reforma pintura",
      tipoCusto: "reforma",
      valor: 15000,
      dataCusto: "2024-01-10",
      percentualAlocacao: 100,
      criadoPor: usuarioId,
    });

    expect(custo.id).toBeDefined();
    expect(custo.descricao).toBe("Reforma pintura");
    expect(custo.valor).toBe(15000);
  });

  it("should get costs for property", () => {
    propertyService.adicionarCusto(propriedadeId, {
      descricao: "IPTU 2024",
      tipoCusto: "imposto",
      valor: 5000,
      dataCusto: "2024-01-01",
      percentualAlocacao: 100,
      criadoPor: usuarioId,
    });

    propertyService.adicionarCusto(propriedadeId, {
      descricao: "Seguro anual",
      tipoCusto: "seguro",
      valor: 8000,
      dataCusto: "2024-01-05",
      percentualAlocacao: 100,
      criadoPor: usuarioId,
    });

    const custos = propertyService.obterCustosPropriedade(propriedadeId);

    expect(custos.length).toBeGreaterThanOrEqual(3);
  });

  it("should get cost summary", () => {
    const resumo = propertyService.obterResumoCustosPropriedade(propriedadeId);

    expect(resumo.totalCustos).toBeGreaterThan(0);
    expect(resumo.custosReforma).toBeGreaterThan(0);
    expect(resumo.custosImposto).toBeGreaterThan(0);
    expect(resumo.custosSeguro).toBeGreaterThan(0);
  });
});

// =========================================================================
// Depreciation Tests
// =========================================================================

describe("PropertyService - Depreciation", () => {
  let propriedadeId: string;

  beforeAll(() => {
    const propriedade = propertyService.criarPropriedade({
      nome: "Lote Rural",
      endereco: "Estrada da Fazenda",
      numero: "km 15",
      cidade: "Ribeirão Preto",
      estado: "SP",
      tipoImovel: "rural",
      areaTotal: 5000,
      valorAquisicao: 250000,
      dataAquisicao: "2021-03-20",
      metodoDepreciacao: "linear",
      taxaDepreciacao: 0.05,
      vidaUtilAnos: 27,
      criadoPor: usuarioId,
      pais: "BR",
    });

    propriedadeId = propriedade.id;
  });

  it("should calculate linear depreciation", () => {
    const depreciacao = propertyService.calcularDepreciacao(
      propriedadeId,
      2024,
      1,
      usuarioId,
    );

    expect(depreciacao.id).toBeDefined();
    expect(depreciacao.metodoAplicado).toBe("linear");
    expect(depreciacao.valorDepreciacao).toBeGreaterThan(0);
    expect(depreciacao.valorResidual).toBeLessThan(250000);
  });

  it("should calculate exponential depreciation", () => {
    const propriedadeExp = propertyService.criarPropriedade({
      nome: "Sala Comercial",
      endereco: "Prédio Corporate",
      numero: "1001",
      cidade: "Brasília",
      estado: "DF",
      tipoImovel: "comercial",
      areaTotal: 100,
      valorAquisicao: 400000,
      dataAquisicao: "2020-01-10",
      metodoDepreciacao: "exponencial",
      taxaDepreciacao: 0.05,
      vidaUtilAnos: 27,
      valorResidual: 100000,
      criadoPor: usuarioId,
      pais: "BR",
    });

    const depreciacao = propertyService.calcularDepreciacao(
      propriedadeExp.id,
      2024,
      1,
      usuarioId,
    );

    expect(depreciacao.metodoAplicado).toBe("exponencial");
    expect(depreciacao.valorDepreciacao).toBeGreaterThan(0);
  });

  it("should get depreciation history", () => {
    propertyService.calcularDepreciacao(propriedadeId, 2024, 1, usuarioId);
    propertyService.calcularDepreciacao(propriedadeId, 2024, 2, usuarioId);

    const historico = propertyService.obterHistoricoDepreciacao(propriedadeId);

    expect(historico.length).toBeGreaterThanOrEqual(2);
  });

  it("should get accumulated depreciation", () => {
    const acumulada = propertyService.obterDepreciacaoAcumulada(propriedadeId);

    expect(acumulada.depreciacao).toBeGreaterThan(0);
    expect(acumulada.percentual).toBeGreaterThan(0);
    expect(acumulada.percentual).toBeLessThanOrEqual(100);
  });
});

// =========================================================================
// ROI Tests
// =========================================================================

describe("PropertyService - ROI Analysis", () => {
  let propriedadeId: string;

  beforeAll(() => {
    const propriedade = propertyService.criarPropriedade({
      nome: "Casa Investimento",
      endereco: "Rua das Flores",
      numero: "456",
      cidade: "Belo Horizonte",
      estado: "MG",
      tipoImovel: "residencial",
      areaTotal: 180,
      valorAquisicao: 300000,
      dataAquisicao: "2020-01-15",
      metodoDepreciacao: "linear",
      taxaDepreciacao: 0.05,
      vidaUtilAnos: 27,
      criadoPor: usuarioId,
      pais: "BR",
    });

    propriedadeId = propriedade.id;

    // Add some costs
    propertyService.adicionarCusto(propriedadeId, {
      descricao: "Manutenção",
      tipoCusto: "manutencao",
      valor: 20000,
      dataCusto: "2023-06-01",
      percentualAlocacao: 100,
      criadoPor: usuarioId,
    });

    // Calculate depreciation to establish value
    propertyService.calcularDepreciacao(propriedadeId, 2024, 1, usuarioId);
  });

  it("should calculate ROI for a period", () => {
    const roi = propertyService.calcularROI(
      propriedadeId,
      "2020-01-15",
      "2024-01-15",
      usuarioId,
    );

    expect(roi.id).toBeDefined();
    expect(roi.diasPeriodo).toBeGreaterThan(0);
    expect(roi.valorInvestimentoTotal).toBeGreaterThan(0);
    expect(typeof roi.roiPercentual).toBe("number");
  });

  it("should get ROI history", () => {
    propertyService.calcularROI(
      propriedadeId,
      "2020-01-15",
      "2023-01-15",
      usuarioId,
    );
    propertyService.calcularROI(
      propriedadeId,
      "2020-01-15",
      "2024-01-15",
      usuarioId,
    );

    const historico = propertyService.obterHistoricoROI(propriedadeId);

    expect(historico.length).toBeGreaterThanOrEqual(2);
  });

  it("should get latest ROI", () => {
    const ultimoRoi = propertyService.obterUltimoROI(propriedadeId);

    expect(ultimoRoi).toBeDefined();
    expect(ultimoRoi?.roiPercentual).toBeDefined();
  });
});

// =========================================================================
// Edge Cases
// =========================================================================

describe("PropertyService - Edge Cases", () => {
  it("should handle non-existent property", () => {
    const propriedade = propertyService.buscarPropriedadePorId(randomUUID());
    expect(propriedade).toBeNull();
  });

  it("should handle depreciation on non-existent property", () => {
    expect(() => {
      propertyService.calcularDepreciacao(randomUUID(), 2024, 1, usuarioId);
    }).toThrow();
  });

  it("should filter properties by city", () => {
    propertyService.criarPropriedade({
      nome: "Casa em São Paulo",
      endereco: "Rua Principal",
      numero: "100",
      cidade: "São Paulo",
      estado: "SP",
      tipoImovel: "residencial",
      areaTotal: 150,
      valorAquisicao: 500000,
      dataAquisicao: "2023-01-15",
      metodoDepreciacao: "linear",
      taxaDepreciacao: 0.05,
      vidaUtilAnos: 27,
      criadoPor: usuarioId,
      pais: "BR",
    });

    const resultado = propertyService.listarPropriedades({
      cidade: "São Paulo",
    });

    expect(resultado.propriedades.every((p) => p.cidade === "São Paulo")).toBe(
      true,
    );
  });
});
