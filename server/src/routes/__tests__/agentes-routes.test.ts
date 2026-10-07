/**
 * Testes de integração para rotas de agentes econômicos
 * Cobre:
 * - Criação de agentes (PF e PJ)
 * - Validação de CPF/CNPJ
 * - Detecção de duplicatas
 * - Verificação de órgãos públicos
 * - Auditoria de validações
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import express, { Express } from "express";
import { createAgentesRoutes } from "../agentes-routes";

const TEST_DB_PATH = path.join(
  __dirname,
  `test-routes-${process.pid}-${Date.now()}.db`
);

/**
 * Cria aplicação Express de teste
 */
function createTestApp(): { app: Express; db: Database.Database } {
  const app = express();
  app.use(express.json());

  const db = new Database(TEST_DB_PATH);
  db.pragma("foreign_keys = ON");

  // Setup schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      nome TEXT NOT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ativo INTEGER DEFAULT 1
    );

    INSERT OR IGNORE INTO usuarios (id, email, nome)
    VALUES ('user-1', 'test@example.com', 'Test User');

    CREATE TABLE IF NOT EXISTS agentes_economicos (
      id TEXT PRIMARY KEY,
      tipo_entidade TEXT NOT NULL CHECK (tipo_entidade IN ('pessoa_fisica', 'pessoa_juridica')),
      cpf_cnpj TEXT NOT NULL UNIQUE,
      nome TEXT NOT NULL,
      nome_fantasia TEXT,
      pessoa_fisica_pf_nome_mae TEXT,
      papel TEXT NOT NULL,
      regime_tributario TEXT,
      inscricao_estadual TEXT,
      inscricao_municipal TEXT,
      classificacao_nfse TEXT,
      email TEXT,
      telefone TEXT,
      celular TEXT,
      endereco_logradouro TEXT,
      endereco_numero TEXT,
      endereco_complemento TEXT,
      endereco_bairro TEXT,
      endereco_cidade TEXT,
      endereco_estado TEXT,
      endereco_cep TEXT,
      endereco_pais TEXT DEFAULT 'Brasil',
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      criado_por TEXT NOT NULL,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_por TEXT NOT NULL,
      observacoes TEXT,
      tags TEXT,
      validado INTEGER DEFAULT 0,
      validado_em DATETIME,
      validado_por TEXT,
      FOREIGN KEY (criado_por) REFERENCES usuarios(id),
      FOREIGN KEY (atualizado_por) REFERENCES usuarios(id),
      FOREIGN KEY (validado_por) REFERENCES usuarios(id)
    );

    CREATE INDEX idx_agentes_economicos_cpf_cnpj ON agentes_economicos(cpf_cnpj);
    CREATE INDEX idx_agentes_economicos_tipo ON agentes_economicos(tipo_entidade);

    CREATE TABLE IF NOT EXISTS agentes_validacoes (
      id TEXT PRIMARY KEY,
      agente_id TEXT NOT NULL,
      tipo_validacao TEXT NOT NULL,
      resultado TEXT NOT NULL,
      motivo TEXT,
      detalhes TEXT,
      executado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      executado_por TEXT NOT NULL,
      FOREIGN KEY (agente_id) REFERENCES agentes_economicos(id) ON DELETE CASCADE,
      FOREIGN KEY (executado_por) REFERENCES usuarios(id)
    );

    CREATE INDEX idx_agentes_validacoes_agente ON agentes_validacoes(agente_id);
  `);

  // Middleware para adicionar usuário
  app.use((req, res, next) => {
    (req as unknown).usuario = { id: "user-1" };
    next();
  });

  app.use("/api/agentes", createAgentesRoutes(db));

  return { app, db };
}

describe("POST /api/agentes", () => {
  let app: Express;
  let db: Database.Database;

  beforeEach(() => {
    const setup = createTestApp();
    app = setup.app;
    db = setup.db;
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  describe("Pessoa Física", () => {
    it("cria pessoa física com CPF válido", async () => {
      const res = await request(app)
        .post("/api/agentes")
        .send({
          tipo_entidade: "pessoa_fisica",
          cpf_cnpj: "111.444.777-35",
          nome: "João da Silva",
          pessoa_fisica_pf_nome_mae: "Maria Silva",
          papel: "tenant",
          email: "joao@example.com",
          telefone: "11999999999",
          observacoes: "Inquilino do imóvel 001",
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.cpf_cnpj).toBe("11144477735");
      expect(res.body.mensagem).toContain("sucesso");
    });

    it("rejeita CPF inválido", async () => {
      const res = await request(app)
        .post("/api/agentes")
        .send({
          tipo_entidade: "pessoa_fisica",
          cpf_cnpj: "111.444.777-36", // Dígito inválido
          nome: "João da Silva",
          pessoa_fisica_pf_nome_mae: "Maria Silva",
          papel: "tenant",
        });

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("inválido");
      expect(res.body.detalhes).toContain("dígito");
    });

    it("rejeita pessoa física sem nome da mãe", async () => {
      const res = await request(app)
        .post("/api/agentes")
        .send({
          tipo_entidade: "pessoa_fisica",
          cpf_cnpj: "111.444.777-35",
          nome: "João da Silva",
          papel: "tenant",
        });

      expect(res.status).toBe(400);
      expect(res.body.detalhes).toBeDefined();
    });
  });

  describe("Pessoa Jurídica", () => {
    it("cria pessoa jurídica com CNPJ válido", async () => {
      const res = await request(app)
        .post("/api/agentes")
        .send({
          tipo_entidade: "pessoa_juridica",
          cpf_cnpj: "00.000.000/0001-91",
          nome: "Empresa LTDA",
          nome_fantasia: "Empresa",
          papel: "supplier",
          regime_tributario: "lucro_real",
          email: "empresa@example.com",
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.cpf_cnpj).toBe("00000000000191");
    });

    it("rejeita CNPJ inválido", async () => {
      const res = await request(app)
        .post("/api/agentes")
        .send({
          tipo_entidade: "pessoa_juridica",
          cpf_cnpj: "00.000.000/0001-92", // Dígito inválido
          nome: "Empresa LTDA",
          nome_fantasia: "Empresa",
          papel: "supplier",
        });

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("inválido");
    });

    it("rejeita pessoa jurídica sem nome fantasia", async () => {
      const res = await request(app)
        .post("/api/agentes")
        .send({
          tipo_entidade: "pessoa_juridica",
          cpf_cnpj: "00.000.000/0001-91",
          nome: "Empresa LTDA",
          papel: "supplier",
        });

      expect(res.status).toBe(400);
    });
  });

  describe("Validação de duplicata", () => {
    it("rejeita CPF/CNPJ duplicado", async () => {
      const cpf = "111.444.777-35";

      // Primeira criação deve suceder
      const res1 = await request(app)
        .post("/api/agentes")
        .send({
          tipo_entidade: "pessoa_fisica",
          cpf_cnpj: cpf,
          nome: "João Silva",
          pessoa_fisica_pf_nome_mae: "Maria",
          papel: "tenant",
        });

      expect(res1.status).toBe(201);

      // Segunda com mesmo CPF deve falhar
      const res2 = await request(app)
        .post("/api/agentes")
        .send({
          tipo_entidade: "pessoa_fisica",
          cpf_cnpj: cpf,
          nome: "João da Silva",
          pessoa_fisica_pf_nome_mae: "Maria",
          papel: "tenant",
        });

      expect(res2.status).toBe(409);
      expect(res2.body.erro).toContain("já cadastrado");
      expect(res2.body.duplicatas).toBeDefined();
    });
  });

  describe("Validações de dados", () => {
    it("valida email válido", async () => {
      const res = await request(app)
        .post("/api/agentes")
        .send({
          tipo_entidade: "pessoa_fisica",
          cpf_cnpj: "111.444.777-35",
          nome: "João",
          pessoa_fisica_pf_nome_mae: "Maria",
          papel: "tenant",
          email: "invalido-email",
        });

      expect(res.status).toBe(400);
    });

    it("aceita campos opcionais", async () => {
      const res = await request(app)
        .post("/api/agentes")
        .send({
          tipo_entidade: "pessoa_fisica",
          cpf_cnpj: "111.444.777-35",
          nome: "João",
          pessoa_fisica_pf_nome_mae: "Maria",
          papel: "tenant",
        });

      expect(res.status).toBe(201);
    });

    it("salva tags", async () => {
      const res = await request(app)
        .post("/api/agentes")
        .send({
          tipo_entidade: "pessoa_fisica",
          cpf_cnpj: "111.444.777-35",
          nome: "João",
          pessoa_fisica_pf_nome_mae: "Maria",
          papel: "tenant",
          tags: "ativo,prioritario",
        });

      expect(res.status).toBe(201);
      const agente = db
        .prepare("SELECT tags FROM agentes_economicos WHERE id = ?")
        .get(res.body.id) as unknown;
      expect(agente.tags).toBe("ativo,prioritario");
    });
  });
});

describe("POST /api/agentes/:id/validar", () => {
  let app: Express;
  let db: Database.Database;

  beforeEach(() => {
    const setup = createTestApp();
    app = setup.app;
    db = setup.db;
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  it("valida CPF contra órgão público", async () => {
    // Cria agente
    const res1 = await request(app)
      .post("/api/agentes")
      .send({
        tipo_entidade: "pessoa_fisica",
        cpf_cnpj: "111.444.777-35",
        nome: "João",
        pessoa_fisica_pf_nome_mae: "Maria",
        papel: "tenant",
      });

    const agenteId = res1.body.id;

    // Valida
    const res2 = await request(app)
      .post(`/api/agentes/${agenteId}/validar`)
      .send({});

    expect(res2.status).toBe(200);
    expect(res2.body.validado).toBeDefined();
    expect(res2.body.resultado).toBeDefined();
  });

  it("retorna erro para agente inexistente", async () => {
    const res = await request(app)
      .post("/api/agentes/inexistente/validar")
      .send({});

    expect(res.status).toBe(404);
  });

  it("registra validação no banco", async () => {
    // Cria agente
    const res1 = await request(app)
      .post("/api/agentes")
      .send({
        tipo_entidade: "pessoa_fisica",
        cpf_cnpj: "111.444.777-35",
        nome: "João",
        pessoa_fisica_pf_nome_mae: "Maria",
        papel: "tenant",
      });

    const agenteId = res1.body.id;

    // Valida
    await request(app)
      .post(`/api/agentes/${agenteId}/validar`)
      .send({});

    // Verifica registro
    const validacoes = db
      .prepare("SELECT * FROM agentes_validacoes WHERE agente_id = ?")
      .all(agenteId) as unknown[];

    expect(validacoes.length).toBeGreaterThan(0);
  });
});

describe("POST /api/agentes/:id/verificar-duplicata", () => {
  let app: Express;
  let db: Database.Database;

  beforeEach(() => {
    const setup = createTestApp();
    app = setup.app;
    db = setup.db;
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  it("detecta duplicata de CPF", async () => {
    const cpf = "111.444.777-35";

    // Cria primeiro agente
    const res1 = await request(app)
      .post("/api/agentes")
      .send({
        tipo_entidade: "pessoa_fisica",
        cpf_cnpj: cpf,
        nome: "João",
        pessoa_fisica_pf_nome_mae: "Maria",
        papel: "tenant",
      });

    const id1 = res1.body.id;

    // Cria segundo agente com outro CPF
    const res2 = await request(app)
      .post("/api/agentes")
      .send({
        tipo_entidade: "pessoa_fisica",
        cpf_cnpj: "11144477736", // Diferente
        nome: "Pedro",
        pessoa_fisica_pf_nome_mae: "Ana",
        papel: "tenant",
      });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const id2 = res2.body.id;

    // Verifica duplicata do primeiro - não deve encontrar
    const res3 = await request(app)
      .post(`/api/agentes/${id1}/verificar-duplicata`)
      .send({});

    expect(res3.status).toBe(200);
    expect(res3.body.tem_duplicata).toBe(false);
    expect(res3.body.duplicatas.length).toBe(0);
  });
});

describe("GET /api/agentes/:id/validacoes", () => {
  let app: Express;
  let db: Database.Database;

  beforeEach(() => {
    const setup = createTestApp();
    app = setup.app;
    db = setup.db;
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  it("retorna histórico de validações", async () => {
    // Cria agente
    const res1 = await request(app)
      .post("/api/agentes")
      .send({
        tipo_entidade: "pessoa_fisica",
        cpf_cnpj: "111.444.777-35",
        nome: "João",
        pessoa_fisica_pf_nome_mae: "Maria",
        papel: "tenant",
      });

    const agenteId = res1.body.id;

    // Obtém validações
    const res2 = await request(app).get(`/api/agentes/${agenteId}/validacoes`);

    expect(res2.status).toBe(200);
    expect(res2.body.agente_id).toBe(agenteId);
    expect(res2.body.validacoes).toBeDefined();
    expect(res2.body.total).toBeGreaterThan(0);
  });

  it("retorna erro para agente inexistente", async () => {
    const res = await request(app).get("/api/agentes/inexistente/validacoes");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/agentes/:id", () => {
  let app: Express;
  let db: Database.Database;

  beforeEach(() => {
    const setup = createTestApp();
    app = setup.app;
    db = setup.db;
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  it("retorna agente por ID", async () => {
    const res1 = await request(app)
      .post("/api/agentes")
      .send({
        tipo_entidade: "pessoa_fisica",
        cpf_cnpj: "111.444.777-35",
        nome: "João",
        pessoa_fisica_pf_nome_mae: "Maria",
        papel: "tenant",
      });

    const id = res1.body.id;

    const res2 = await request(app).get(`/api/agentes/${id}`);

    expect(res2.status).toBe(200);
    expect(res2.body.id).toBe(id);
    expect(res2.body.nome).toBe("João");
  });

  it("retorna erro para agente inexistente", async () => {
    const res = await request(app).get("/api/agentes/inexistente");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/agentes", () => {
  let app: Express;
  let db: Database.Database;

  beforeEach(async () => {
    const setup = createTestApp();
    app = setup.app;
    db = setup.db;

    // Cria alguns agentes
    await request(app)
      .post("/api/agentes")
      .send({
        tipo_entidade: "pessoa_fisica",
        cpf_cnpj: "111.444.777-35",
        nome: "João",
        pessoa_fisica_pf_nome_mae: "Maria",
        papel: "tenant",
      });

    await request(app)
      .post("/api/agentes")
      .send({
        tipo_entidade: "pessoa_juridica",
        cpf_cnpj: "00.000.000/0001-91",
        nome: "Empresa",
        nome_fantasia: "Empresa",
        papel: "supplier",
      });
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  it("lista agentes com paginação", async () => {
    const res = await request(app).get("/api/agentes");

    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.agentes).toBeDefined();
    expect(res.body.limit).toBeDefined();
  });

  it("filtra por tipo de entidade", async () => {
    const res = await request(app).get("/api/agentes?tipo=pessoa_fisica");

    expect(res.status).toBe(200);
    expect(
      res.body.agentes.every((a: unknown) => a.tipo_entidade === "pessoa_fisica")
    ).toBe(true);
  });

  it("filtra por papel", async () => {
    const res = await request(app).get("/api/agentes?papel=supplier");

    expect(res.status).toBe(200);
    res.body.agentes.forEach((a: unknown) => {
      expect(a.papel).toContain("supplier");
    });
  });
});

describe("PUT /api/agentes/:id", () => {
  let app: Express;
  let db: Database.Database;

  beforeEach(() => {
    const setup = createTestApp();
    app = setup.app;
    db = setup.db;
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  it("atualiza agente", async () => {
    const res1 = await request(app)
      .post("/api/agentes")
      .send({
        tipo_entidade: "pessoa_fisica",
        cpf_cnpj: "111.444.777-35",
        nome: "João",
        pessoa_fisica_pf_nome_mae: "Maria",
        papel: "tenant",
      });

    const id = res1.body.id;

    const res2 = await request(app)
      .put(`/api/agentes/${id}`)
      .send({
        email: "novo@example.com",
        observacoes: "Atualizado",
      });

    expect(res2.status).toBe(200);
    expect(res2.body.mensagem).toContain("sucesso");

    // Verifica atualização
    const agente = db
      .prepare("SELECT * FROM agentes_economicos WHERE id = ?")
      .get(id) as unknown;
    expect(agente.email).toBe("novo@example.com");
  });

  it("retorna erro para agente inexistente", async () => {
    const res = await request(app)
      .put("/api/agentes/inexistente")
      .send({ email: "test@example.com" });

    expect(res.status).toBe(404);
  });
});
