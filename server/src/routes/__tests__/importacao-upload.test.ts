/**
 * Testes para Importação de Documentos - Fase 1 (UPLOAD)
 *
 * Testes implementados:
 * 1. Upload de arquivo válido (PDF 1MB)
 * 2. Rejeição de arquivo > 50MB
 * 3. Detecção de tipos corretamente (5 tipos)
 * 4. Cálculo de SHA-256
 * 5. Validação de extensão
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { AuthServiceDB } from "../../domain/auth/auth-service-db";
import { AuditTrailServiceDB } from "../../domain/auth/audit-trail-db";
import { gerarHashSenha } from "../../domain/auth/password";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { criarRotasAuth, type AuthRoutesDeps } from "../auth-routes";
import { criarRotasImportacaoUpload } from "../importacao-upload-routes";
import { tokenDoCookie } from "./token-cookie.js";
import { FileType } from "../../domain/importacao/tipos.js";
import { createHash } from "crypto";
import type { PermissoesServiceDB } from "../../domain/auth/permissoes-service-db";

interface CountResult {
  count: number;
}

interface LoteRow {
  id: string;
  usuario_id: string;
  arquivo_nome: string;
  arquivo_hash: string;
  tipo: string;
  tamanho_bytes: number;
  status: string;
  erro_mensagem?: string;
  criado_em: string;
  atualizado_em: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, `test-importacao-upload-${process.pid}.db`);
const SENHA_PADRAO = "senha-correta-123";

function resolverSchema(nomeArquivo: string): string {
  const candidatos = [
    path.join(__dirname, `../../../${nomeArquivo}`),
    path.join(process.cwd(), `server/src/${nomeArquivo}`),
    path.join(process.cwd(), `src/${nomeArquivo}`),
  ];
  const encontrado = candidatos.find((p) => fs.existsSync(p));
  if (!encontrado) throw new Error(`Schema não encontrado: ${nomeArquivo}`);
  return fs.readFileSync(encontrado, "utf-8");
}

function createTestDatabase(): Database.Database {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  const db = new Database(TEST_DB_PATH);
  db.pragma("foreign_keys = ON");
  db.exec(resolverSchema("migrations-phase2-auth.sql"));
  db.exec(resolverSchema("migrations-phase17-importacao.sql"));
  return db;
}

function createTestApp(db: Database.Database) {
  const authService = new AuthServiceDB(db);
  const auditService = new AuditTrailServiceDB(db);
  const app = express();

  app.use(express.json());

  // Configurar multer para upload em memória
  const upload = multer({ storage: multer.memoryStorage() });

  const mockPermissoesService: Partial<PermissoesServiceDB> = {
    listarMatriz: () => [],
    obterMatriz: () => ({}),
    atualizarMatriz: () => ({ sucesso: true }),
  };

  app.use(
    "/api/auth",
    criarRotasAuth({
      authService,
      auditService,
      permissoesService: mockPermissoesService as PermissoesServiceDB,
    }),
  );

  app.use(
    "/api/importacao",
    upload.single("arquivo"),
    criarRotasImportacaoUpload({ authService, db }),
  );

  return app;
}

async function login(app: express.Express, email: string): Promise<string> {
  const resp = await request(app).post("/api/auth/login").send({ email, senha: SENHA_PADRAO });
  expect(resp.status).toBe(200);
  return tokenDoCookie(resp);
}

function calcularSHA256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

describe("Rotas de Importação - Upload (/api/importacao/upload)", () => {
  let db: Database.Database;
  let app: express.Express;
  let token: string;
  const usuarioEmail = "usuario-teste@example.com";

  beforeEach(async () => {
    db = createTestDatabase();
    app = createTestApp(db);

    // Criar usuário de teste
    const hash = await gerarHashSenha(SENHA_PADRAO);
    db.prepare(
      `INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "usuario-teste-id",
      "Usuário Teste",
      usuarioEmail,
      hash,
      "titular",
      1,
      new Date().toISOString(),
    );

    token = await login(app, usuarioEmail);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  /**
   * Teste 1: Upload de arquivo válido (PDF 1MB)
   */
  it("deve aceitar arquivo PDF válido de 1MB", async () => {
    const pdfBuffer = Buffer.alloc(1024 * 1024); // 1MB
    // Adicionar assinatura PDF no início
    pdfBuffer.write("%PDF-1.4");

    const response = await request(app)
      .post("/api/importacao/upload")
      .set("Authorization", `Bearer ${token}`)
      .attach("arquivo", pdfBuffer, "documento.pdf");

    expect(response.status).toBe(200);
    expect(response.body.sucesso).toBe(true);
    expect(response.body.lote_id).toBeDefined();
    expect(response.body.arquivo_nome).toBe("documento.pdf");
    expect(response.body.arquivo_hash).toBeDefined();
    expect(response.body.tipo).toBe(FileType.PDF);
    expect(response.body.tamanho_bytes).toBe(1024 * 1024);
    expect(response.body.criado_em).toBeDefined();

    // Verificar se foi armazenado no banco
    const lote = db.prepare("SELECT * FROM importacao_lotes WHERE id = ?").get(response.body.lote_id);
    expect(lote).toBeDefined();
    expect(lote.status).toBe("RECEBIDO");
  });

  /**
   * Teste 2: Rejeição de arquivo > 50MB
   */
  it("deve rejeitar arquivo maior que 50MB", async () => {
    const largeBuffer = Buffer.alloc(51 * 1024 * 1024); // 51MB
    largeBuffer.write("%PDF-1.4");

    const response = await request(app)
      .post("/api/importacao/upload")
      .set("Authorization", `Bearer ${token}`)
      .attach("arquivo", largeBuffer, "documento-grande.pdf");

    expect(response.status).toBe(400);
    expect(response.body.sucesso).toBe(false);
    expect(response.body.erro).toBe("Validação de arquivo falhou");
    expect(response.body.detalhes.some((msg: string) => msg.includes("muito grande"))).toBe(true);

    // Verificar que nada foi armazenado
    const lotes = db.prepare("SELECT COUNT(*) as count FROM importacao_lotes").get() as CountResult;
    expect(lotes.count).toBe(0);
  });

  /**
   * Teste 3: Detecção de tipos corretamente (5 tipos)
   */
  describe("Detecção de tipos de arquivo", () => {
    it("deve detectar corretamente arquivo OFX", async () => {
      const ofxBuffer = Buffer.from("OFXHEADER:100\nOFXVER:102\n");

      const response = await request(app)
        .post("/api/importacao/upload")
        .set("Authorization", `Bearer ${token}`)
        .attach("arquivo", ofxBuffer, "extrato.ofx");

      expect(response.status).toBe(200);
      expect(response.body.tipo).toBe(FileType.OFX);
    });

    it("deve detectar corretamente arquivo CSV", async () => {
      const csvBuffer = Buffer.from("data1,data2,data3\nvalue1,value2,value3\n");

      const response = await request(app)
        .post("/api/importacao/upload")
        .set("Authorization", `Bearer ${token}`)
        .attach("arquivo", csvBuffer, "dados.csv");

      expect(response.status).toBe(200);
      expect(response.body.tipo).toBe(FileType.CSV);
    });

    it("deve detectar corretamente arquivo PNG", async () => {
      // PNG magic bytes: 89 50 4E 47
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

      const response = await request(app)
        .post("/api/importacao/upload")
        .set("Authorization", `Bearer ${token}`)
        .attach("arquivo", pngBuffer, "imagem.png");

      expect(response.status).toBe(200);
      expect(response.body.tipo).toBe(FileType.PNG);
    });

    it("deve detectar corretamente arquivo JPEG", async () => {
      // JPEG magic bytes: FF D8 FF E0
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

      const response = await request(app)
        .post("/api/importacao/upload")
        .set("Authorization", `Bearer ${token}`)
        .attach("arquivo", jpegBuffer, "foto.jpg");

      expect(response.status).toBe(200);
      expect(response.body.tipo).toBe(FileType.JPEG);
    });

    it("deve detectar corretamente arquivo PDF", async () => {
      const pdfBuffer = Buffer.from("%PDF-1.4\n%comentário");

      const response = await request(app)
        .post("/api/importacao/upload")
        .set("Authorization", `Bearer ${token}`)
        .attach("arquivo", pdfBuffer, "documento.pdf");

      expect(response.status).toBe(200);
      expect(response.body.tipo).toBe(FileType.PDF);
    });
  });

  /**
   * Teste 4: Cálculo de SHA-256
   */
  it("deve calcular SHA-256 corretamente", async () => {
    const conteudo = Buffer.from("Conteúdo de teste para SHA-256");
    conteudo.write("%PDF-1.4");

    const response = await request(app)
      .post("/api/importacao/upload")
      .set("Authorization", `Bearer ${token}`)
      .attach("arquivo", conteudo, "test.pdf");

    expect(response.status).toBe(200);
    expect(response.body.arquivo_hash).toBeDefined();

    // Verificar se o hash é válido (64 caracteres hexadecimais)
    expect(response.body.arquivo_hash).toMatch(/^[a-f0-9]{64}$/);

    // Calcular o hash esperado e comparar
    const expectedHash = calcularSHA256(conteudo);
    expect(response.body.arquivo_hash).toBe(expectedHash);
  });

  it("não deve permitir a mesma arquivo duas vezes (duplicado por hash)", async () => {
    const conteudo = Buffer.from("Conteúdo único para teste");
    conteudo.write("%PDF-1.4");

    // Primeiro upload
    const response1 = await request(app)
      .post("/api/importacao/upload")
      .set("Authorization", `Bearer ${token}`)
      .attach("arquivo", conteudo, "documento1.pdf");

    expect(response1.status).toBe(200);

    // Segundo upload com mesmo conteúdo
    const response2 = await request(app)
      .post("/api/importacao/upload")
      .set("Authorization", `Bearer ${token}`)
      .attach("arquivo", conteudo, "documento2.pdf");

    expect(response2.status).toBe(409);
    expect(response2.body.sucesso).toBe(false);
    expect(response2.body.erro).toBe("Arquivo duplicado");
  });

  /**
   * Teste 5: Validação de extensão
   */
  describe("Validação de extensão", () => {
    it("deve rejeitar extensão não permitida", async () => {
      const buffer = Buffer.from("conteúdo");

      const response = await request(app)
        .post("/api/importacao/upload")
        .set("Authorization", `Bearer ${token}`)
        .attach("arquivo", buffer, "documento.exe");

      expect(response.status).toBe(400);
      expect(response.body.sucesso).toBe(false);
      expect(response.body.detalhes.some((msg: string) => msg.includes("Extensão não permitida"))).toBe(true);
    });

    it("deve rejeitar arquivo vazio", async () => {
      const emptyBuffer = Buffer.alloc(0);

      const response = await request(app)
        .post("/api/importacao/upload")
        .set("Authorization", `Bearer ${token}`)
        .attach("arquivo", emptyBuffer, "vazio.pdf");

      expect(response.status).toBe(400);
      expect(response.body.sucesso).toBe(false);
      expect(response.body.detalhes.some((msg: string) => msg.includes("Arquivo vazio"))).toBe(true);
    });

    it("deve rejeitar requisição sem arquivo", async () => {
      const response = await request(app)
        .post("/api/importacao/upload")
        .set("Authorization", `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.sucesso).toBe(false);
      expect(response.body.erro).toBe("Nenhum arquivo foi enviado");
    });
  });

  describe("Autenticação e Autorização", () => {
    it("deve rejeitar requisição sem autenticação", async () => {
      const buffer = Buffer.from("%PDF-1.4");

      const response = await request(app)
        .post("/api/importacao/upload")
        .attach("arquivo", buffer, "documento.pdf");

      expect(response.status).toBe(401);
    });
  });

  describe("Armazenamento no banco de dados", () => {
    it("deve armazenar lote com status RECEBIDO", async () => {
      const buffer = Buffer.from("%PDF-1.4");

      const response = await request(app)
        .post("/api/importacao/upload")
        .set("Authorization", `Bearer ${token}`)
        .attach("arquivo", buffer, "documento.pdf");

      expect(response.status).toBe(200);
      const loteId = response.body.lote_id;

      const lote = db.prepare("SELECT * FROM importacao_lotes WHERE id = ?").get(loteId) as LoteRow;
      expect(lote).toBeDefined();
      expect(lote.status).toBe("RECEBIDO");
      expect(lote.usuario_id).toBe("usuario-teste-id");
      expect(lote.arquivo_nome).toBe("documento.pdf");
      expect(lote.tipo).toBe("PDF");
      expect(lote.criado_em).toBeDefined();
      expect(lote.atualizado_em).toBeDefined();
    });

    it("deve armazenar metadados corretos do arquivo", async () => {
      const buffer = Buffer.from("Conteúdo de teste");
      buffer.write("%PDF-1.4");

      const response = await request(app)
        .post("/api/importacao/upload")
        .set("Authorization", `Bearer ${token}`)
        .attach("arquivo", buffer, "teste.pdf");

      expect(response.status).toBe(200);
      const loteId = response.body.lote_id;

      const lote = db.prepare("SELECT * FROM importacao_lotes WHERE id = ?").get(loteId) as LoteRow;
      expect(lote.arquivo_hash).toBe(response.body.arquivo_hash);
      expect(lote.tamanho_bytes).toBe(buffer.length);
    });
  });

  describe("Casos extremos", () => {
    it("deve aceitar arquivo no tamanho máximo (50MB)", async () => {
      const maxBuffer = Buffer.alloc(50 * 1024 * 1024); // Exatamente 50MB
      maxBuffer.write("%PDF-1.4");

      const response = await request(app)
        .post("/api/importacao/upload")
        .set("Authorization", `Bearer ${token}`)
        .attach("arquivo", maxBuffer, "max.pdf");

      expect(response.status).toBe(200);
      expect(response.body.sucesso).toBe(true);
      expect(response.body.tamanho_bytes).toBe(50 * 1024 * 1024);
    });

    it("deve aceitar arquivo pequeno (1 byte)", async () => {
      const smallBuffer = Buffer.from("X");
      // Não adiciona assinatura, vê como trata

      const response = await request(app)
        .post("/api/importacao/upload")
        .set("Authorization", `Bearer ${token}`)
        .attach("arquivo", smallBuffer, "tiny.pdf");

      // Deve rejeitar porque não consegue detectar tipo
      expect(response.status).toBe(400);
      expect(response.body.sucesso).toBe(false);
    });

    it("deve aceitar arquivo com nome com caracteres especiais", async () => {
      const buffer = Buffer.from("%PDF-1.4");

      const response = await request(app)
        .post("/api/importacao/upload")
        .set("Authorization", `Bearer ${token}`)
        .attach("arquivo", buffer, "documento-2025-01-15_12h30m.pdf");

      expect(response.status).toBe(200);
      expect(response.body.sucesso).toBe(true);
      expect(response.body.arquivo_nome).toBe("documento-2025-01-15_12h30m.pdf");
    });
  });
});
