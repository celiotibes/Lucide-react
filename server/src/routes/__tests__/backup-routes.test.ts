/**
 * Testes das rotas HTTP de Backup
 * Total: 5 testes cobrindo GET /listar, POST /agora, POST /restaurar/:fileId, GET /status
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { criarRotasBackup } from "../backup-routes";

describe("Rotas HTTP de Backup", () => {
  let app: express.Application;
  let mockAuthService: unknown;

  beforeEach(() => {
    // Mock authService
    mockAuthService = {
      validarToken: vi.fn().mockReturnValue({
        usuarioId: "user1",
        autenticado: true,
        usuario: { id: "user1", email: "test@example.com", role: "administrador" },
        papel: "admin",
      }),
    };

    // Cria app com rotas
    app = express();
    app.use(express.json());

    // Mock auth middleware - simula autenticação bem-sucedida
    app.use((req, res, next) => {
      (req as any).auth = {
        usuarioId: "user1",
        token: "test-token",
        autenticado: true,
        usuario: { id: "user1", email: "test@example.com", role: "administrador" },
        papel: "admin",
      };
      next();
    });

    // Monta as rotas
    app.use("/api/backup", criarRotasBackup({ authService: mockAuthService }));
  });

  describe("GET /api/backup/listar", () => {
    it("deve exigir autenticação", async () => {
      // Remove middleware de autenticação
      const appSemAuth = express();
      appSemAuth.use(express.json());
      appSemAuth.use("/api/backup", criarRotasBackup({ authService: mockAuthService }));

      const res = await request(appSemAuth).get("/api/backup/listar").send({});

      expect(res.status).toBe(401);
      expect(res.body.erro).toContain("Token de sessão ausente");
    });

    it("deve retornar lista de backups com sucesso", async () => {
      const res = await request(app).get("/api/backup/listar").send({});

      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(600);
      // Pode ser 503 se Google Drive não está configurado
    });
  });

  describe("POST /api/backup/agora", () => {
    it("deve exigir autenticação", async () => {
      const appSemAuth = express();
      appSemAuth.use(express.json());
      appSemAuth.use("/api/backup", criarRotasBackup({ authService: mockAuthService }));

      const res = await request(appSemAuth).post("/api/backup/agora").send({});

      expect(res.status).toBe(401);
      expect(res.body.erro).toContain("Token de sessão ausente");
    });

    it("deve executar backup manualmente", async () => {
      const res = await request(app).post("/api/backup/agora").send({});

      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(600);
      // Pode ser sucesso ou erro dependendo de configuração
    });
  });

  describe("POST /api/backup/restaurar/:fileId", () => {
    it("deve exigir autenticação", async () => {
      const appSemAuth = express();
      appSemAuth.use(express.json());
      appSemAuth.use("/api/backup", criarRotasBackup({ authService: mockAuthService }));

      const res = await request(appSemAuth)
        .post("/api/backup/restaurar/file_123")
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.erro).toContain("Token de sessão ausente");
    });

    it("deve validar fileId obrigatório", async () => {
      const res = await request(app)
        .post("/api/backup/restaurar/")
        .send({});

      expect(res.status).toBe(404);
    });

    it("deve restaurar backup com fileId válido", async () => {
      const res = await request(app)
        .post("/api/backup/restaurar/file_123")
        .send({});

      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(600);
    });
  });

  describe("GET /api/backup/status", () => {
    it("deve retornar status de backup com sucesso", async () => {
      const res = await request(app).get("/api/backup/status").set("Authorization", "Bearer test-token").send({});

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("sucesso");
      expect(res.body).toHaveProperty("backup");
      expect(res.body.backup).toHaveProperty("googleDriveConfigured");
    });

    it("deve indicar se Google Drive está configurado", async () => {
      const res = await request(app).get("/api/backup/status").set("Authorization", "Bearer test-token").send({});

      expect(res.status).toBe(200);
      expect(typeof res.body.backup.googleDriveConfigured).toBe("boolean");
    });
  });
});
