/**
 * Comprehensive test helpers for mocking common types
 * Reduces `as any` casts across test files
 */

import type { Request, Response, NextFunction } from "express";

/**
 * Create a mock Request object
 */
export function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    ip: "127.0.0.1",
    path: "/",
    method: "GET",
    headers: {},
    body: {},
    params: {},
    query: {},
    auth: undefined,
    ...overrides,
  } as unknown as Request;
}

/**
 * Create a mock Response object
 */
export function createMockResponse(): Response {
  const headers: Record<string, string> = {};
  const mockRes = {
    headers,
    statusCode: 200,
    jsonData: undefined,
    status: function (code: number) {
      this.statusCode = code;
      return this;
    },
    json: function (data: unknown) {
      this.jsonData = data;
      return this;
    },
    send: function (data: unknown) {
      this.jsonData = data;
      return this;
    },
    set: function (key: string, value: string) {
      headers[key] = value;
      return this;
    },
    setHeader: function (key: string, value: string) {
      headers[key] = value;
      return this;
    },
    getHeader: function (key: string) {
      return headers[key];
    },
  } as unknown as Response;

  return mockRes;
}

/**
 * Create a mock NextFunction
 */
export function createMockNext(): NextFunction {
  return (() => {}) as NextFunction;
}

/**
 * Create a mock authenticated Request
 */
export function createAuthenticatedRequest(usuarioId: string): Request {
  return createMockRequest({
    auth: { usuario: { id: usuarioId } },
  });
}

/**
 * Mock for database transaction
 */
export interface MockTransaction {
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
}

/**
 * Create a mock transaction
 */
export function createMockTransaction(): MockTransaction {
  return {
    commit: async () => {},
    rollback: async () => {},
    query: async () => ({ rows: [] }),
  };
}

/**
 * Mock for database pool/connection
 */
export interface MockDatabasePool {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  transaction: () => Promise<MockTransaction>;
  end: () => Promise<void>;
}

/**
 * Create a mock database pool
 */
export function createMockDatabasePool(): MockDatabasePool {
  return {
    query: async () => ({ rows: [] }),
    transaction: async () => createMockTransaction(),
    end: async () => {},
  };
}

/**
 * Mock for logger
 */
export interface MockLogger {
  debug: (msg: string, data?: unknown) => void;
  info: (msg: string, data?: unknown) => void;
  warn: (msg: string, data?: unknown) => void;
  error: (msg: string, data?: unknown) => void;
}

/**
 * Create a mock logger
 */
export function createMockLogger(): MockLogger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

/**
 * Helper to extract response data from mock
 */
export function getResponseData(res: Response): unknown {
  return (res as unknown as { jsonData: unknown }).jsonData;
}

/**
 * Helper to extract response status from mock
 */
export function getResponseStatus(res: Response): number {
  return (res as unknown as { statusCode: number }).statusCode || 200;
}

/**
 * Helper to extract response headers from mock
 */
export function getResponseHeaders(res: Response): Record<string, string> {
  return (res as unknown as { headers: Record<string, string> }).headers || {};
}

/**
 * Safe type guard for database records
 * Validates that an unknown value is an object with expected properties
 */
export function assertDatabaseRecord<T extends Record<string, unknown>>(
  value: unknown,
  requiredKeys: (keyof T)[],
): T {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Expected object, got ${typeof value}`);
  }

  const obj = value as Record<string, unknown>;
  for (const key of requiredKeys) {
    if (!(key in obj)) {
      throw new Error(`Missing required key: ${String(key)}`);
    }
  }

  return obj as T;
}

/**
 * Helper to safely access database query results
 */
export function getDatabaseRecord<T extends Record<string, unknown>>(
  queryFn: () => unknown,
  requiredKeys: (keyof T)[],
): T {
  const result = queryFn();
  return assertDatabaseRecord<T>(result, requiredKeys);
}
