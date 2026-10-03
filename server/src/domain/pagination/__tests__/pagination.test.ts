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
