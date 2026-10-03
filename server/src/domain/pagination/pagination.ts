/**
 * Tipos e utilitários para paginação
 */

export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  dados: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export function parsePaginationParams(limit?: string | number, offset?: string | number): PaginationParams {
  const parsedLimit = Math.min(Math.max(parseInt(String(limit ?? 50), 10), 1), 500); // Max 500
  const parsedOffset = Math.max(parseInt(String(offset ?? 0), 10), 0);
  return { limit: parsedLimit, offset: parsedOffset };
}

export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  limit: number,
  offset: number,
): PaginatedResponse<T> {
  return {
    dados: data,
    total,
    limit,
    offset,
    hasMore: offset + limit < total,
  };
}
