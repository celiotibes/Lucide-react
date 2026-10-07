/**
 * Testes para Health Check
 * Validar: verificações de BD, memória, APIs externas, agregação de status
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { type Database } from "better-sqlite3";
import {
  verificarSaudeBD,
  verificarSaudeAsaas,
  verificarSaudePluggy,
  verificarSaudeMemoria,
  executarHealthCheck,
  executarHealthCheckLeve,
} from "../utils/health-check.js";

// Mock fetch global
const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();
global.fetch = fetchMock;

describe("Health Check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("verificarSaudeBD", () => {
    it("deve retornar ok com BD conectado", async () => {
      const mockDb = {
        prepare: () => ({
          get: () => ({ ping: 1 }),
        }),
      } as unknown as Database;

      const resultado = await verificarSaudeBD(mockDb);

      expect(resultado.status).toBe("ok");
      expect(resultado.latencia_ms).toBeLessThan(100);
    });

    it("deve retornar error com BD desconectado", async () => {
      const mockDb = {
        prepare: () => {
          throw new Error("SQLITE_CANTOPEN");
        },
      } as unknown as Database;

      const resultado = await verificarSaudeBD(mockDb);

      expect(resultado.status).toBe("error");
      expect(resultado.mensagem).toContain("SQLITE_CANTOPEN");
    });

    it("deve medir latência corretamente", async () => {
      const mockDb = {
        prepare: () => ({
          get: () => {
            // Simula um pouco de delay
            for (let _i = 0; _i < 100000; _i++) {
              // Loop to simulate work
            }
            return { ping: 1 };
          },
        }),
      } as unknown as Database;

      const resultado = await verificarSaudeBD(mockDb);

      expect(resultado.latencia_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe("verificarSaudeAsaas", () => {
    it("deve retornar ok quando Asaas responde 200", async () => {
      process.env.ASAAS_API_KEY = "test-key";
      process.env.ASAAS_BASE_URL = "https://api.asaas.com";

      fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

      const resultado = await verificarSaudeAsaas();

      expect(resultado.status).toBe("ok");
      expect(resultado.latencia_ms).toBeGreaterThanOrEqual(0);
    });

    it("deve retornar error quando chave inválida", async () => {
      process.env.ASAAS_API_KEY = "invalid-key";

      fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });

      const resultado = await verificarSaudeAsaas();

      expect(resultado.status).toBe("error");
      expect(resultado.mensagem).toContain("inválida");
    });

    it("deve retornar degraded em timeout", async () => {
      process.env.ASAAS_API_KEY = "test-key";

      fetchMock.mockRejectedValueOnce(new Error("timeout"));

      const resultado = await verificarSaudeAsaas();

      expect(resultado.status).toBe("degraded");
      expect(resultado.latencia_ms).toBeGreaterThanOrEqual(0);
    });

    it("deve retornar degraded quando Asaas com erro 5xx", async () => {
      process.env.ASAAS_API_KEY = "test-key";

      fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });

      const resultado = await verificarSaudeAsaas();

      expect(resultado.status).toBe("degraded");
      expect(resultado.mensagem).toContain("503");
    });

    it("deve fazer graceful degradation sem ASAAS_API_KEY", async () => {
      delete process.env.ASAAS_API_KEY;

      const resultado = await verificarSaudeAsaas();

      expect(resultado.status).toBe("degraded");
      expect(resultado.mensagem).toContain("não configurada");
    });
  });

  describe("verificarSaudePluggy", () => {
    it("deve retornar ok quando Pluggy responde 200", async () => {
      process.env.PLUGGY_CLIENT_ID = "test-id";
      process.env.PLUGGY_CLIENT_SECRET = "test-secret";

      fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

      const resultado = await verificarSaudePluggy();

      expect(resultado.status).toBe("ok");
    });

    it("deve retornar error com credenciais inválidas", async () => {
      process.env.PLUGGY_CLIENT_ID = "invalid-id";
      process.env.PLUGGY_CLIENT_SECRET = "invalid-secret";

      fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });

      const resultado = await verificarSaudePluggy();

      expect(resultado.status).toBe("error");
      expect(resultado.mensagem).toContain("inválidas");
    });

    it("deve fazer graceful degradation sem credenciais", async () => {
      delete process.env.PLUGGY_CLIENT_ID;
      delete process.env.PLUGGY_CLIENT_SECRET;

      const resultado = await verificarSaudePluggy();

      expect(resultado.status).toBe("degraded");
      expect(resultado.mensagem).toContain("não configurados");
    });
  });

  describe("verificarSaudeMemoria", () => {
    it("deve retornar ok com memória baixa", () => {
      const resultado = verificarSaudeMemoria();

      expect(resultado.status).toBe("ok");
      expect(resultado.mensagem).toContain("Heap");
    });

    it("deve indicar status na mensagem", () => {
      const resultado = verificarSaudeMemoria();

      // Deve conter percentual como "XX.X%"
      expect(resultado.mensagem).toMatch(/\d+\.\d+%/);
    });
  });

  describe("executarHealthCheck", () => {
    it("deve retornar status ok quando tudo está bem", async () => {
      const mockDb = {
        prepare: () => ({
          get: () => ({ ping: 1 }),
        }),
      } as unknown as Database;

      process.env.ASAAS_API_KEY = "test";
      process.env.PLUGGY_CLIENT_ID = "test";
      process.env.PLUGGY_CLIENT_SECRET = "test";

      fetchMock.mockResolvedValue({ ok: true, status: 200 });

      const resultado = await executarHealthCheck(mockDb);

      expect(resultado.status).toBe("ok");
      expect(resultado.checks.database.status).toBe("ok");
      expect(resultado.checks.memory.status).toBe("ok");
      expect(resultado.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T/);
      expect(resultado.uptime).toBeGreaterThan(0);
    });

    it("deve agregação de status error", async () => {
      const mockDb = {
        prepare: () => {
          throw new Error("BD offline");
        },
      } as unknown as Database;

      const resultado = await executarHealthCheck(mockDb);

      expect(resultado.status).toBe("error");
      expect(resultado.checks.database.status).toBe("error");
    });

    it("deve agregação de status degraded (sem error)", async () => {
      const mockDb = {
        prepare: () => ({
          get: () => ({ ping: 1 }),
        }),
      } as unknown as Database;

      process.env.ASAAS_API_KEY = "test";
      fetchMock.mockResolvedValueOnce({ ok: false, status: 503 }); // Asaas degraded

      const resultado = await executarHealthCheck(mockDb);

      expect(resultado.status).toBe("degraded");
      expect(resultado.checks.asaas.status).toBe("degraded");
    });

    it("deve incluir uptime em segundos", async () => {
      const mockDb = {
        prepare: () => ({
          get: () => ({ ping: 1 }),
        }),
      } as unknown as Database;

      const resultado = await executarHealthCheck(mockDb);

      expect(resultado.uptime).toBeGreaterThan(0);
      expect(typeof resultado.uptime).toBe("number");
    });
  });

  describe("executarHealthCheckLeve", () => {
    it("deve verificar apenas BD e memória", async () => {
      const mockDb = {
        prepare: () => ({
          get: () => ({ ping: 1 }),
        }),
      } as unknown as Database;

      const resultado = await executarHealthCheckLeve(mockDb);

      expect(resultado.checks.database).toBeDefined();
      expect(resultado.checks.memory).toBeDefined();
      expect(resultado.checks.asaas).toBeUndefined();
      expect(resultado.checks.pluggy).toBeUndefined();
    });

    it("deve responder rápido (sem testes de APIs externas)", async () => {
      const mockDb = {
        prepare: () => ({
          get: () => ({ ping: 1 }),
        }),
      } as unknown as Database;

      const inicio = performance.now();
      const resultado = await executarHealthCheckLeve(mockDb);
      const latencia = performance.now() - inicio;

      expect(latencia).toBeLessThan(50); // Deve ser muito rápido (< 50ms)
      expect(resultado.status).toBeDefined();
    });
  });
});
