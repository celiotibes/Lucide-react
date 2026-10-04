/**
 * Test helpers for Express Request/Response mocking
 * Provides typed mock implementations to avoid `as any` casts in tests
 */

import type { Request, Response } from "express";

/**
 * Mock Request type for testing
 * Partial implementation with commonly tested properties
 */
export interface MockRequest extends Partial<Request> {
  ip?: string | null;
  path?: string;
  auth?: { usuario?: { id: string } | null } | undefined;
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, string>;
}

/**
 * Mock Response type for testing
 * Partial implementation with commonly used methods
 */
export interface MockResponse extends Partial<Response> {
  statusCode?: number;
  jsonData?: unknown;
  headers?: Record<string, string>;
  set: (key: string, value: string) => MockResponse;
  status: (code: number) => MockResponse;
  json: (data: unknown) => MockResponse;
}

/**
 * Creates a mock Request object with typed properties
 */
export function createMockRequest(overrides: MockRequest = {}): Request {
  const mockReq: MockRequest = {
    ip: "127.0.0.1",
    path: "/",
    method: "GET",
    headers: {},
    ...overrides,
  };
  return mockReq as Request;
}

/**
 * Creates a mock Response object with typed methods
 */
export function createMockResponse(): Response {
  const headers: Record<string, string> = {};

  const mockRes: MockResponse = {
    statusCode: 200,
    jsonData: undefined,
    headers,
    status: function (code: number) {
      this.statusCode = code;
      return this;
    },
    json: function (data: unknown) {
      this.jsonData = data;
      return this;
    },
    set: function (key: string, value: string) {
      headers[key] = value;
      return this;
    },
  };

  return mockRes as Response;
}

/**
 * Creates a mock authenticated Request object
 */
export function createAuthenticatedMockRequest(
  usuarioId: string,
  overrides: Partial<MockRequest> = {},
): Request {
  return createMockRequest({
    auth: { usuario: { id: usuarioId } },
    ...overrides,
  });
}

/**
 * Helper to get headers from a mock response
 */
export function getResponseHeaders(res: Response): Record<string, string> {
  return (res as unknown as { headers: Record<string, string> }).headers || {};
}
