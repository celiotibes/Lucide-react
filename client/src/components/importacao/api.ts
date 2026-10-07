/**
 * API client para importação de documentos
 * Funções para comunicação com o servidor
 */

import type {
  UploadResult,
  PreviewDados,
  LinhaImportacao,
  ResultadoRevisaoLinha,
  ResultadoRevisaoBulk,
  LoteImportacao,
} from './types.js';
import { LinhaStatus } from './types.js';

/**
 * URL base da API
 */
const API_BASE = '/api/importacao';

/**
 * Classe para tratamento de erros da API
 */
class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Helper para fazer requisições com tratamento de erro
 */
async function fetchApi<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(
        response.status,
        data.erro || data.message || 'Erro na requisição',
        data
      );
    }

    return data as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      500,
      error instanceof Error ? error.message : 'Erro desconhecido'
    );
  }
}

/**
 * Upload de arquivo para importação
 * POST /api/importacao/upload
 */
export async function uploadArquivo(
  file: File,
  onProgress?: (progress: number) => void
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('arquivo', file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Monitorar progresso
    if (onProgress) {
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = (event.loaded / event.total) * 100;
          onProgress(progress);
        }
      });
    }

    // Tratar conclusão
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response as UploadResult);
        } catch {
          reject(
            new ApiError(xhr.status, 'Erro ao parsear resposta do servidor')
          );
        }
      } else {
        try {
          const errorData = JSON.parse(xhr.responseText);
          reject(
            new ApiError(
              xhr.status,
              errorData.erro || 'Erro no upload',
              errorData
            )
          );
        } catch {
          reject(new ApiError(xhr.status, 'Erro no upload'));
        }
      }
    });

    // Tratar erro
    xhr.addEventListener('error', () => {
      reject(new ApiError(0, 'Erro de conexão durante upload'));
    });

    xhr.addEventListener('abort', () => {
      reject(new ApiError(0, 'Upload cancelado'));
    });

    // Enviar
    xhr.open('POST', `${API_BASE}/upload`);
    xhr.send(formData);
  });
}

/**
 * Obter detalhes de um lote de importação
 * GET /api/importacao/lotes/:loteId
 */
export async function obterLote(loteId: string): Promise<LoteImportacao> {
  return fetchApi<LoteImportacao>(`${API_BASE}/lotes/${loteId}`);
}

/**
 * Obter preview de dados importados (primeiras 10 linhas)
 * GET /api/importacao/lotes/:loteId/preview
 */
export async function obterPreview(loteId: string): Promise<PreviewDados> {
  return fetchApi<PreviewDados>(`${API_BASE}/lotes/${loteId}/preview`);
}

/**
 * Obter todas as linhas de um lote com suporte a paginação e filtros
 * GET /api/importacao/lotes/:loteId/linhas
 */
export async function obterLinhas(
  loteId: string,
  opcoes?: {
    pagina?: number;
    limite?: number;
    status?: LinhaStatus[];
    comDuplicata?: boolean;
  }
): Promise<{
  linhas: LinhaImportacao[];
  paginacao: {
    pagina: number;
    limite: number;
    total: number;
  };
}> {
  const searchParams = new URLSearchParams();
  searchParams.append('pagina', String(opcoes?.pagina || 1));
  searchParams.append('limite', String(opcoes?.limite || 10));

  if (opcoes?.status && opcoes.status.length > 0) {
    opcoes.status.forEach((s) => searchParams.append('status', s));
  }

  if (opcoes?.comDuplicata) {
    searchParams.append('comDuplicata', 'true');
  }

  return fetchApi<{
    linhas: LinhaImportacao[];
    paginacao: {
      pagina: number;
      limite: number;
      total: number;
    };
  }>(`${API_BASE}/lotes/${loteId}/linhas?${searchParams}`);
}

/**
 * Aprovar uma linha individual
 * PATCH /api/importacao/lotes/:loteId/linhas/:linhaId/aprovar
 */
export async function aprovarLinha(
  loteId: string,
  linhaId: string
): Promise<ResultadoRevisaoLinha> {
  return fetchApi<ResultadoRevisaoLinha>(
    `${API_BASE}/lotes/${loteId}/linhas/${linhaId}/aprovar`,
    { method: 'PATCH' }
  );
}

/**
 * Rejeitar uma linha individual
 * PATCH /api/importacao/lotes/:loteId/linhas/:linhaId/rejeitar
 */
export async function rejeitarLinha(
  loteId: string,
  linhaId: string,
  motivo: string
): Promise<ResultadoRevisaoLinha> {
  return fetchApi<ResultadoRevisaoLinha>(
    `${API_BASE}/lotes/${loteId}/linhas/${linhaId}/rejeitar`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo }),
    }
  );
}

/**
 * Obter detalhes de uma possível duplicata
 * GET /api/importacao/lotes/:loteId/linhas/:linhaId/duplicata
 */
export async function obterDetalheDuplicata(
  loteId: string,
  linhaId: string
): Promise<{
  linha_original: LinhaImportacao;
  linha_duplicada: LinhaImportacao;
  score: number;
}> {
  return fetchApi(
    `${API_BASE}/lotes/${loteId}/linhas/${linhaId}/duplicata`
  );
}

/**
 * Aprovar todas as linhas de um lote
 * PATCH /api/importacao/lotes/:loteId/aprovar-todos
 */
export async function aprovarTodos(loteId: string): Promise<ResultadoRevisaoBulk> {
  return fetchApi<ResultadoRevisaoBulk>(
    `${API_BASE}/lotes/${loteId}/aprovar-todos`,
    { method: 'PATCH' }
  );
}

/**
 * Rejeitar todas as linhas de um lote
 * PATCH /api/importacao/lotes/:loteId/rejeitar-todos
 */
export async function rejeitarTodos(
  loteId: string,
  motivo?: string
): Promise<ResultadoRevisaoBulk> {
  return fetchApi<ResultadoRevisaoBulk>(
    `${API_BASE}/lotes/${loteId}/rejeitar-todos`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo: motivo || 'Rejeição em massa' }),
    }
  );
}

/**
 * Cancelar um lote de importação
 * DELETE /api/importacao/lotes/:loteId
 */
export async function cancelarLote(loteId: string): Promise<{ sucesso: boolean }> {
  return fetchApi<{ sucesso: boolean }>(`${API_BASE}/lotes/${loteId}`, {
    method: 'DELETE',
  });
}

/**
 * Exportar ApiError para uso em componentes
 */
export { ApiError };
