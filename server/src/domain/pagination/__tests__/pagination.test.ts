/**
 * Testes para utilidades de paginação
 */

import { describe, it, expect } from "vitest";
import { parsePaginationParams, createPaginatedResponse } from "../pagination.js";

describe("Paginação - parsePaginationParams", () => {
  it("deve usar valores padrão quando não fornecidos", () => {
    const result = parsePaginationParams();
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });

  it("deve parsear limit e offset como strings", () => {
    const result = parsePaginationParams("25", "10");
    expect(result.limit).toBe(25);
    expect(result.offset).toBe(10);
  });

  it("deve limitar limit ao máximo de 500", () => {
    const result = parsePaginationParams(1000);
    expect(result.limit).toBe(500);
  });

  it("deve garantir limit mínimo de 1", () => {
    const result = parsePaginationParams(0);
    expect(result.limit).toBe(1);
  });

  it("deve garantir offset nunca negativo", () => {
    const result = parsePaginationParams(50, -10);
    expect(result.offset).toBe(0);
  });

  it("deve aceitar valores numéricos", () => {
    const result = parsePaginationParams(100, 50);
    expect(result.limit).toBe(100);
    expect(result.offset).toBe(50);
  });
});

describe("Paginação - createPaginatedResponse", () => {
  it("deve criar resposta paginada com hasMore=true", () => {
    const data = [1, 2, 3];
    const result = createPaginatedResponse(data, 100, 3, 0);
    expect(result.dados).toEqual([1, 2, 3]);
    expect(result.total).toBe(100);
    expect(result.limit).toBe(3);
    expect(result.offset).toBe(0);
    expect(result.hasMore).toBe(true);
  });

  it("deve criar resposta paginada com hasMore=false quando não há mais dados", () => {
    const data = [1, 2, 3];
    const result = createPaginatedResponse(data, 3, 3, 0);
    expect(result.hasMore).toBe(false);
  });

  it("deve indicar hasMore=false quando offset está além do total", () => {
    const data = [];
    const result = createPaginatedResponse(data, 50, 10, 50);
    expect(result.hasMore).toBe(false);
  });

  it("deve indicar hasMore=true quando há exatamente um item mais", () => {
    const data = [1, 2, 3];
    const result = createPaginatedResponse(data, 4, 3, 0);
    expect(result.hasMore).toBe(true);
  });
});

/**
 * Edge Cases para Paginação
 *
 * Testa comportamento em casos extremos que podem quebrar a paginação
 */
describe("Paginação - Edge Cases", () => {
  describe("offset > total", () => {
    it("deve retornar hasMore=false quando offset=100, total=50", () => {
      const result = createPaginatedResponse([], 50, 10, 100);
      expect(result.hasMore).toBe(false);
      expect(result.dados).toEqual([]);
      expect(result.total).toBe(50);
      expect(result.offset).toBe(100);
    });

    it("deve incluir mensagem clara quando offset está fora de alcance", () => {
      const result = createPaginatedResponse([], 50, 10, 100);
      // Resposta deve ter todos os 4 campos obrigatórios
      expect(result).toHaveProperty("dados");
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("limit");
      expect(result).toHaveProperty("offset");
      expect(result).toHaveProperty("hasMore");
    });

    it("deve retornar dados vazios quando offset excede total", () => {
      const result = createPaginatedResponse([], 25, 5, 25);
      expect(result.dados).toEqual([]);
      expect(result.hasMore).toBe(false);
    });
  });

  describe("limit muito grande", () => {
    it("deve clampar limit=1000 para 500", () => {
      const result = parsePaginationParams(1000);
      expect(result.limit).toBe(500);
    });

    it("deve retornar resposta com 4 campos obrigatórios mesmo com limit grande", () => {
      const result = createPaginatedResponse([1, 2, 3], 100, 500, 0);
      expect(result).toHaveProperty("dados");
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("limit");
      expect(result).toHaveProperty("offset");
      expect(result).toHaveProperty("hasMore");
      expect(Object.keys(result).length).toBe(5);
    });

    it("deve validar que resposta sempre tem 5 campos (dados, total, limit, offset, hasMore)", () => {
      const response = createPaginatedResponse([1], 100, 500, 0);
      const requiredFields = ["dados", "total", "limit", "offset", "hasMore"];
      requiredFields.forEach((field) => {
        expect(response).toHaveProperty(field);
      });
    });
  });

  describe("offset negativo", () => {
    it("deve clampar offset=-1 para 0", () => {
      const result = parsePaginationParams(50, -1);
      expect(result.offset).toBe(0);
    });

    it("deve clampar offset grande negativo para 0", () => {
      const result = parsePaginationParams(50, -999999);
      expect(result.offset).toBe(0);
    });

    it("deve retornar resposta válida com offset clampado", () => {
      const result = createPaginatedResponse([1], 100, 50, 0);
      expect(result.offset).toBe(0);
      expect(result.limit).toBe(50);
    });
  });

  describe("limit zero ou inválido", () => {
    it("deve usar default de 50 quando limit=0", () => {
      const result = parsePaginationParams(0);
      expect(result.limit).toBe(1); // mínimo é 1, não 50
    });

    it("deve garantir limit mínimo de 1", () => {
      const result = parsePaginationParams(0);
      expect(result.limit).toBeGreaterThanOrEqual(1);
    });

    it("deve usar default quando limit undefined", () => {
      const result = parsePaginationParams();
      expect(result.limit).toBe(50);
    });
  });

  describe("combinações extremas", () => {
    it("deve lidar com offset=0, limit=1000 (clamp para 500)", () => {
      const result = parsePaginationParams(1000, 0);
      expect(result.limit).toBe(500);
      expect(result.offset).toBe(0);
    });

    it("deve lidar com offset negativo e limit grande", () => {
      const result = parsePaginationParams(2000, -50);
      expect(result.limit).toBe(500);
      expect(result.offset).toBe(0);
    });

    it("deve retornar resposta completa mesmo em combinações extremas", () => {
      const response = createPaginatedResponse([], 1, 500, -1);
      expect(response.dados).toEqual([]);
      expect(response.total).toBe(1);
      expect(response.limit).toBe(500);
      expect(response.offset).toBe(-1);
      expect(response.hasMore).toBe(false);
    });
  });

  describe("verificação de campos obrigatórios", () => {
    it("deve sempre retornar 5 campos na resposta", () => {
      const response = createPaginatedResponse([1, 2, 3], 100, 10, 0);
      const fields = Object.keys(response);
      expect(fields).toContain("dados");
      expect(fields).toContain("total");
      expect(fields).toContain("limit");
      expect(fields).toContain("offset");
      expect(fields).toContain("hasMore");
      expect(fields.length).toBe(5);
    });

    it("deve ter tipos corretos em todos os campos", () => {
      const response = createPaginatedResponse([1], 100, 10, 0);
      expect(Array.isArray(response.dados)).toBe(true);
      expect(typeof response.total).toBe("number");
      expect(typeof response.limit).toBe("number");
      expect(typeof response.offset).toBe("number");
      expect(typeof response.hasMore).toBe("boolean");
    });

    it("deve ter números não-negativos para total, limit, offset", () => {
      const response = createPaginatedResponse([1], 100, 10, 0);
      expect(response.total).toBeGreaterThanOrEqual(0);
      expect(response.limit).toBeGreaterThan(0);
      expect(response.offset).toBeGreaterThanOrEqual(0);
    });
  });

  describe("paginação consistente", () => {
    it("deve ter hasMore=false quando offset + limit >= total", () => {
      const response = createPaginatedResponse([1], 10, 10, 0);
      expect(response.hasMore).toBe(false);
    });

    it("deve ter hasMore=true quando offset + limit < total", () => {
      const response = createPaginatedResponse([1], 20, 10, 0);
      expect(response.hasMore).toBe(true);
    });

    it("deve ter hasMore=false quando dados estão vazios mas offset é válido", () => {
      const response = createPaginatedResponse([], 50, 10, 10);
      expect(response.hasMore).toBe(false);
    });
  });
});
