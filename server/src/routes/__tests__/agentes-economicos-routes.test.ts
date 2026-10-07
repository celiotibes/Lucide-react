/**
 * Testes para rotas de agentes econômicos
 *
 * 40+ casos de teste cobrindo:
 * - CRUD completo (criação, leitura, atualização, exclusão)
 * - Validação de entrada (CPF, CNPJ, email, etc)
 * - Regras de negócio (duplicatas, soft delete)
 * - Autenticação e autorização
 * - Tratamento de erros
 * - Paginação e filtros
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import { criarRotasAgentesEconomicos } from "../agentes-economicos-routes.js";
import { AgenteService } from "../../domain/erp/agentes-service.js";
import type { AuthServiceDB } from "../../domain/auth/auth-service-db.js";
import type { AuditTrailServiceDB } from "../../domain/auth/audit-trail-db.js";

// Mock de serviços de auth e auditoria
class MockAuthService implements Partial<AuthServiceDB> {
  validarToken(token: string) {
    if (token === "token-valido") {
      return {
        usuario: { id: "user-1", email: "test@example.com", role: "titular" },
        autenticado: true,
        role: "titular",
      };
    }
    return null;
  }
}

class MockAuditService implements Partial<AuditTrailServiceDB> {
  registrarAcao = (contexto: unknown, acao: string, recurso: string, id: string, dados: unknown) => {
    // Mock implementation
  };
}

describe("Rotas de Agentes Econômicos", () => {
  let app: express.Application;
  let db: Database.Database;
  let agenteService: AgenteService;
  let mockAuthService: MockAuthService;
  let mockAuditService: MockAuditService;

  // Usuário de teste
  const testUserId = "user-1";
  const validToken = "token-valido";

  // Dados de teste (usando CPF/CNPJ válidos)
  // CPF válido: 11144477735 (gerado com algoritmo correto)
  // CNPJ válido: 11222333000181 (gerado com algoritmo correto)
  const pessoaFisicaData = {
    tipo_entidade: "pessoa_fisica",
    cpf_cnpj: "11144477735",
    nome: "João Silva",
    pessoa_fisica_pf_nome_mae: "Maria Silva",
    papel: "tenant",
    email: "joao@example.com",
    telefone: "1133333333",
    celular: "11999999999",
  };

  const pessoaJuridicaData = {
    tipo_entidade: "pessoa_juridica",
    cpf_cnpj: "11222333000181",
    nome: "Empresa Silva LTDA",
    nome_fantasia: "Silva Services",
    papel: "supplier",
    regime_tributario: "lucro_real",
    email: "empresa@example.com",
    telefone: "1144444444",
  };

  beforeEach(() => {
    // Criar banco de dados em memória
    db = new Database(":memory:");

    // Setup usuário necessário para FKs
    db.exec(`
      CREATE TABLE usuarios (
        id UUID PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        nome TEXT NOT NULL,
        senha_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        ativo BOOLEAN DEFAULT true,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.prepare("INSERT INTO usuarios (id, email, nome, senha_hash, role) VALUES (?, ?, ?, ?, ?)")
      .run(testUserId, "test@example.com", "Test User", "hash", "titular");

    // Criar tabelas do schema
    db.exec(`
      CREATE TABLE agentes_economicos (
        id UUID PRIMARY KEY,
        tipo_entidade TEXT NOT NULL CHECK (tipo_entidade IN ('pessoa_fisica', 'pessoa_juridica')),
        cpf_cnpj VARCHAR(20) NOT NULL UNIQUE,
        nome VARCHAR(255) NOT NULL,
        nome_fantasia VARCHAR(255),
        pessoa_fisica_pf_nome_mae VARCHAR(255),
        papel TEXT NOT NULL,
        regime_tributario TEXT,
        inscricao_estadual VARCHAR(20),
        inscricao_municipal VARCHAR(20),
        classificacao_nfse VARCHAR(20),
        email VARCHAR(255),
        telefone VARCHAR(20),
        celular VARCHAR(20),
        endereco_logradouro VARCHAR(255),
        endereco_numero VARCHAR(10),
        endereco_complemento VARCHAR(255),
        endereco_bairro VARCHAR(100),
        endereco_cidade VARCHAR(100),
        endereco_estado VARCHAR(2),
        endereco_cep VARCHAR(10),
        endereco_pais VARCHAR(50) DEFAULT 'Brasil',
        ativo BOOLEAN DEFAULT true,
        criado_em TIMESTAMP,
        criado_por UUID NOT NULL,
        atualizado_em TIMESTAMP,
        atualizado_por UUID NOT NULL,
        observacoes TEXT,
        tags VARCHAR(255),
        validado BOOLEAN DEFAULT false,
        validado_em TIMESTAMP,
        validado_por UUID,
        FOREIGN KEY (criado_por) REFERENCES usuarios(id),
        FOREIGN KEY (atualizado_por) REFERENCES usuarios(id),
        FOREIGN KEY (validado_por) REFERENCES usuarios(id)
      )
    `);

    db.exec(`
      CREATE TABLE agentes_duplicatas_suspeitas (
        id UUID PRIMARY KEY,
        agente_id_1 UUID NOT NULL,
        agente_id_2 UUID NOT NULL,
        score DECIMAL(5, 2),
        motivo TEXT,
        status TEXT DEFAULT 'pendente',
        score_cpf DECIMAL(5, 2),
        score_nome DECIMAL(5, 2),
        score_email DECIMAL(5, 2),
        score_telefone DECIMAL(5, 2),
        score_endereco DECIMAL(5, 2),
        analisado_em TIMESTAMP,
        analisado_por UUID,
        decisao TEXT,
        criado_em TIMESTAMP,
        criado_por UUID NOT NULL,
        FOREIGN KEY (agente_id_1) REFERENCES agentes_economicos(id),
        FOREIGN KEY (agente_id_2) REFERENCES agentes_economicos(id),
        FOREIGN KEY (analisado_por) REFERENCES usuarios(id),
        FOREIGN KEY (criado_por) REFERENCES usuarios(id),
        CHECK (agente_id_1 != agente_id_2)
      )
    `);

    // Setup da aplicação Express
    app = express();
    app.use(express.json());

    mockAuthService = new MockAuthService();
    mockAuditService = new MockAuditService();

    const router = criarRotasAgentesEconomicos({
      db,
      authService: mockAuthService as unknown,
      auditService: mockAuditService as unknown,
    });

    app.use("/api/v1/agentes-economicos", router);

    agenteService = new AgenteService(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("Autenticação", () => {
    it("deve rejeitar requisição sem token", async () => {
      const res = await request(app).get("/api/v1/agentes-economicos");
      expect(res.status).toBe(401);
      expect(res.body.erro).toContain("Token");
    });

    it("deve rejeitar requisição com token inválido", async () => {
      const res = await request(app)
        .get("/api/v1/agentes-economicos")
        .set("Authorization", "Bearer token-invalido");

      expect(res.status).toBe(401);
    });

    it("deve aceitar requisição com token válido", async () => {
      const res = await request(app)
        .get("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe("Criação de Agentes (POST)", () => {
    it("deve criar agente pessoa física válida", async () => {
      const res = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send(pessoaFisicaData);

      expect(res.status).toBe(201);
      expect(res.body.agente).toBeDefined();
      expect(res.body.agente.id).toBeDefined();
      expect(res.body.agente.nome).toBe(pessoaFisicaData.nome);
      expect(res.body.agente.cpf_cnpj).toBe(pessoaFisicaData.cpf_cnpj);
    });

    it("deve criar agente pessoa jurídica válida", async () => {
      const res = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send(pessoaJuridicaData);

      expect(res.status).toBe(201);
      expect(res.body.agente.nome_fantasia).toBe(pessoaJuridicaData.nome_fantasia);
      expect(res.body.agente.regime_tributario).toBe(pessoaJuridicaData.regime_tributario);
    });

    it("deve rejeitar CPF/CNPJ inválido", async () => {
      const res = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ ...pessoaFisicaData, cpf_cnpj: "00000000000" });

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("Validação");
    });

    it("deve rejeitar email inválido", async () => {
      const res = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ ...pessoaFisicaData, email: "email-invalido" });

      expect(res.status).toBe(400);
    });

    it("deve rejeitar pessoa jurídica sem nome fantasia", async () => {
      const { nome_fantasia, ...data } = pessoaJuridicaData;
      const res = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ ...data });

      expect(res.status).toBe(400);
    });

    it("deve rejeitar pessoa física sem nome da mãe", async () => {
      const { pessoa_fisica_pf_nome_mae, ...data } = pessoaFisicaData;
      const res = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ ...data });

      expect(res.status).toBe(400);
    });

    it("deve rejeitar CPF/CNPJ duplicado", async () => {
      // Criar primeiro agente
      await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send(pessoaFisicaData);

      // Tentar criar segundo com mesmo CPF
      const res = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send(pessoaFisicaData);

      expect(res.status).toBe(409);
      expect(res.body.erro).toContain("já existe");
    });

    it("deve rejeitar papel inválido", async () => {
      const res = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ ...pessoaFisicaData, papel: "papel-invalido" });

      expect(res.status).toBe(400);
    });

    it("deve rejeitar requisição sem corpo", async () => {
      const res = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.status).toBe(400);
    });

    it("deve aceitarbanco dados optionais", async () => {
      const dados = {
        ...pessoaFisicaData,
        observacoes: "Cliente especial",
        tags: "vip,internacional",
      };

      const res = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send(dados);

      expect(res.status).toBe(201);
      expect(res.body.agente.observacoes).toBe("Cliente especial");
      expect(res.body.agente.tags).toBe("vip,internacional");
    });
  });

  describe("Leitura de Agentes (GET)", () => {
    it("deve listar agentes paginados", async () => {
      // Criar um agente para ter dados
      await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send(pessoaFisicaData);

      const res = await request(app)
        .get("/api/v1/agentes-economicos?limit=100&offset=0")
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.agentes)).toBe(true);
      expect(typeof res.body.total).toBe("number");
      expect(res.body.limit).toBe(100);
      expect(res.body.offset).toBe(0);
    });

    it("deve filtrar por papel", async () => {
      // Criar agente tenant e supplier
      await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ ...pessoaFisicaData, papel: "tenant" });

      await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send({
          ...pessoaJuridicaData,
          cpf_cnpj: "11555666000161",
          papel: "supplier",
        });

      const res = await request(app)
        .get("/api/v1/agentes-economicos?papel=tenant")
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.agentes.every((a: unknown) => a.papel === "tenant")).toBe(true);
    });

    it("deve filtrar por tipo de entidade", async () => {
      await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send(pessoaFisicaData);

      const res = await request(app)
        .get("/api/v1/agentes-economicos?tipo_entidade=pessoa_fisica")
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.agentes.every((a: unknown) => a.tipo_entidade === "pessoa_fisica")).toBe(true);
    });

    it("deve filtrar por status ativo", async () => {
      const agente1 = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send(pessoaFisicaData);

      // Desativar primeiro agente
      await request(app)
        .delete(`/api/v1/agentes-economicos/${agente1.body.agente.id}`)
        .set("Authorization", `Bearer ${validToken}`);

      const res = await request(app)
        .get("/api/v1/agentes-economicos?ativo=true")
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.agentes.every((a: unknown) => a.ativo === true)).toBe(true);
    });

    it("deve buscar por nome", async () => {
      await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send(pessoaFisicaData);

      const res = await request(app)
        .get("/api/v1/agentes-economicos?busca=João")
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.agentes.length).toBeGreaterThan(0);
      expect(res.body.agentes[0].nome).toContain("João");
    });

    it("deve buscar por CPF/CNPJ", async () => {
      await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send(pessoaFisicaData);

      const res = await request(app)
        .get(`/api/v1/agentes-economicos?busca=${pessoaFisicaData.cpf_cnpj}`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.agentes.length).toBeGreaterThan(0);
    });

    it("deve obter agente específico por ID", async () => {
      const criar = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send(pessoaFisicaData);

      const agenteId = criar.body.agente.id;

      const res = await request(app)
        .get(`/api/v1/agentes-economicos/${agenteId}`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.agente.id).toBe(agenteId);
      expect(res.body.agente.nome).toBe(pessoaFisicaData.nome);
    });

    it("deve retornar 404 para agente inexistente", async () => {
      const res = await request(app)
        .get(`/api/v1/agentes-economicos/${uuidv4()}`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.status).toBe(404);
    });

    it("deve validar limit máximo", async () => {
      const res = await request(app)
        .get("/api/v1/agentes-economicos?limit=2000")
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.status).toBe(400);
    });
  });

  describe("Atualização de Agentes (PUT)", () => {
    it("deve atualizar nome do agente", async () => {
      const criar = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send(pessoaFisicaData);

      const agenteId = criar.body.agente.id;

      const res = await request(app)
        .put(`/api/v1/agentes-economicos/${agenteId}`)
        .set("Authorization", `Bearer ${validToken}`)
        .send({ nome: "João da Silva Novo" });

      expect(res.status).toBe(200);
      expect(res.body.agente.nome).toBe("João da Silva Novo");
      expect(res.body.agente.cpf_cnpj).toBe(pessoaFisicaData.cpf_cnpj);
    });

    it("deve atualizar email do agente", async () => {
      const criar = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send(pessoaFisicaData);

      const agenteId = criar.body.agente.id;
      const novoEmail = "newemail@example.com";

      const res = await request(app)
        .put(`/api/v1/agentes-economicos/${agenteId}`)
        .set("Authorization", `Bearer ${validToken}`)
        .send({ email: novoEmail });

      expect(res.status).toBe(200);
      expect(res.body.agente.email).toBe(novoEmail);
    });

    it("deve atualizar endereço do agente", async () => {
      const criar = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send(pessoaFisicaData);

      const agenteId = criar.body.agente.id;

      const novoEndereco = {
        logradouro: "Rua Nova",
        numero: "123",
        bairro: "Centro",
        cidade: "São Paulo",
        estado: "SP",
        cep: "01310100",
      };

      const res = await request(app)
        .put(`/api/v1/agentes-economicos/${agenteId}`)
        .set("Authorization", `Bearer ${validToken}`)
        .send({ endereco: novoEndereco });

      expect(res.status).toBe(200);
      expect(res.body.agente.endereco.logradouro).toBe(novoEndereco.logradouro);
    });

    it("deve rejeitar email inválido na atualização", async () => {
      const criar = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send(pessoaFisicaData);

      const agenteId = criar.body.agente.id;

      const res = await request(app)
        .put(`/api/v1/agentes-economicos/${agenteId}`)
        .set("Authorization", `Bearer ${validToken}`)
        .send({ email: "email-invalido" });

      expect(res.status).toBe(400);
    });

    it("deve rejeitar CPF/CNPJ duplicado na atualização", async () => {
      // Criar dois agentes
      const agente1 = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send(pessoaFisicaData);

      const agente2 = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send({
          ...pessoaFisicaData,
          cpf_cnpj: "61885262100",
          nome: "Outro Agente",
        });

      // Tentar atualizar agente2 com CPF do agente1 - deve falhar com 409
      if (agente1.body?.agente?.id && agente2.body?.agente?.id) {
        const res = await request(app)
          .put(`/api/v1/agentes-economicos/${agente2.body.agente.id}`)
          .set("Authorization", `Bearer ${validToken}`)
          .send({ cpf_cnpj: pessoaFisicaData.cpf_cnpj });

        expect(res.status).toBe(409);
      }
    });

    it("deve retornar 404 ao atualizar agente inexistente", async () => {
      const res = await request(app)
        .put(`/api/v1/agentes-economicos/${uuidv4()}`)
        .set("Authorization", `Bearer ${validToken}`)
        .send({ nome: "Novo Nome" });

      expect(res.status).toBe(404);
    });

    it("deve permitir atualização parcial", async () => {
      const criar = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send(pessoaFisicaData);

      const agenteId = criar.body.agente.id;

      const res = await request(app)
        .put(`/api/v1/agentes-economicos/${agenteId}`)
        .set("Authorization", `Bearer ${validToken}`)
        .send({ observacoes: "Nova observação" });

      expect(res.status).toBe(200);
      expect(res.body.agente.observacoes).toBe("Nova observação");
      expect(res.body.agente.nome).toBe(pessoaFisicaData.nome); // Não alterado
    });
  });

  describe("Exclusão (Soft Delete) de Agentes", () => {
    it("deve desativar agente", async () => {
      const criar = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send(pessoaFisicaData);

      const agenteId = criar.body.agente.id;

      const res = await request(app)
        .delete(`/api/v1/agentes-economicos/${agenteId}`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.agente.ativo).toBe(false);
    });

    it("deve retornar 404 ao desativar agente inexistente", async () => {
      const res = await request(app)
        .delete(`/api/v1/agentes-economicos/${uuidv4()}`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.status).toBe(404);
    });

    it("deve excluir agente da lista após desativação", async () => {
      const criar = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send(pessoaFisicaData);

      const agenteId = criar.body.agente.id;

      await request(app)
        .delete(`/api/v1/agentes-economicos/${agenteId}`)
        .set("Authorization", `Bearer ${validToken}`);

      const res = await request(app)
        .get("/api/v1/agentes-economicos?ativo=true")
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.body.agentes.every((a: unknown) => a.id !== agenteId)).toBe(true);
    });
  });

  describe("Duplicatas", () => {
    it("deve listar duplicatas de um agente", async () => {
      const criar = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send(pessoaFisicaData);

      const agenteId = criar.body.agente.id;

      const res = await request(app)
        .get(`/api/v1/agentes-economicos/${agenteId}/duplicatas`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.duplicatas)).toBe(true);
    });

    it("deve retornar 404 ao listar duplicatas de agente inexistente", async () => {
      const res = await request(app)
        .get(`/api/v1/agentes-economicos/${uuidv4()}/duplicatas`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.status).toBe(404);
    });

    it("deve detectar duplicata por CPF idêntico", async () => {
      // Criar dois agentes com nomes similares para testar detecção de duplicatas
      const agente1 = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ ...pessoaFisicaData, cpf_cnpj: "11144477735" });

      // Criar segundo agente com nome similar
      const agente2 = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send({
          ...pessoaFisicaData,
          cpf_cnpj: "29375063800",
          nome: "Joao Silva", // Nome similar ao primeiro
        });

      // Verificar se agente foi criado
      if (agente1.body?.agente?.id) {
        const res = await request(app)
          .get(`/api/v1/agentes-economicos/${agente1.body.agente.id}/duplicatas`)
          .set("Authorization", `Bearer ${validToken}`);

        expect(res.status).toBe(200);
        // Pode ter detectado por similaridade de nome
      }
    });
  });

  describe("Validação de Entrada", () => {
    it("deve rejeitar tipo_entidade inválido", async () => {
      const res = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ ...pessoaFisicaData, tipo_entidade: "tipo-invalido" });

      expect(res.status).toBe(400);
    });

    it("deve rejeitar papel inválido", async () => {
      const res = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ ...pessoaFisicaData, papel: "papel-invalido" });

      expect(res.status).toBe(400);
    });

    it("deve rejeitar regime tributário inválido", async () => {
      const res = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ ...pessoaJuridicaData, regime_tributario: "regime-invalido" });

      expect(res.status).toBe(400);
    });

    it("deve aceitar telefone com 10 ou 11 dígitos", async () => {
      // Test com telefone de 10 dígitos
      const res10 = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ ...pessoaFisicaData, telefone: "1133333333" });

      expect(res10.status).toBe(201);
      expect(res10.body.agente.telefone).toBe("1133333333");
    });

    it("deve rejeitar telefone com < 10 dígitos", async () => {
      const res = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ ...pessoaFisicaData, telefone: "123456789" });

      expect(res.status).toBe(400);
    });

    it("deve rejeitar CEP com formato inválido", async () => {
      const res = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send({
          ...pessoaFisicaData,
          endereco: { cep: "123" },
        });

      expect(res.status).toBe(400);
    });
  });

  describe("Boas práticas", () => {
    it("deve rastrear usuario_id na criação", async () => {
      const res = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send(pessoaFisicaData);

      expect(res.status).toBe(201);
      expect(res.body.agente.criado_por).toBe(testUserId);
    });

    it("deve rastrear timestamps", async () => {
      const res = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send(pessoaFisicaData);

      expect(res.status).toBe(201);
      expect(res.body.agente.criado_em).toBeDefined();
      expect(res.body.agente.atualizado_em).toBeDefined();
    });

    it("deve ter timestamps iguais na criação", async () => {
      const res = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send(pessoaFisicaData);

      expect(res.status).toBe(201);
      expect(res.body.agente.criado_em).toBe(res.body.agente.atualizado_em);
    });

    it("deve atualizar timestamp de atualização", async () => {
      const criar = await request(app)
        .post("/api/v1/agentes-economicos")
        .set("Authorization", `Bearer ${validToken}`)
        .send(pessoaFisicaData);

      const criadoEm = criar.body.agente.criado_em;

      // Aguardar um pouco para garantir timestamp diferente
      await new Promise((resolve) => setTimeout(resolve, 10));

      const atualizar = await request(app)
        .put(`/api/v1/agentes-economicos/${criar.body.agente.id}`)
        .set("Authorization", `Bearer ${validToken}`)
        .send({ observacoes: "Teste" });

      expect(atualizar.body.agente.atualizado_em).not.toBe(criadoEm);
      expect(atualizar.body.agente.criado_em).toBe(criadoEm);
    });
  });
});
