/**
 * Document API Endpoints
 * Handles document CRUD operations and OCR processing
 */

import { apiClient } from './client';
import { API_ENDPOINTS } from './config';
import {
  DocumentResponse,
  DocumentListRequest,
  CreateDocumentRequest,
  UpdateDocumentRequest,
  DocumentUploadResponse,
  OCRProcessRequest,
  OCRProcessResponse,
  PaginatedResponse,
} from '@/types';

export const documentsApi = {
  /**
   * Get list of documents with pagination and filtering
   */
  async list(params?: DocumentListRequest): Promise<PaginatedResponse<DocumentResponse>> {
    const response = await apiClient.getAxiosInstance().get<PaginatedResponse<DocumentResponse>>(
      API_ENDPOINTS.DOCUMENTS_LIST,
      { params }
    );
    return response.data;
  },

  /**
   * Get a specific document by ID
   */
  async getById(id: string): Promise<DocumentResponse> {
    const response = await apiClient.getAxiosInstance().get<DocumentResponse>(
      API_ENDPOINTS.DOCUMENTS_DETAIL(id)
    );
    return response.data;
  },

  /**
   * Create a new document
   */
  async create(data: CreateDocumentRequest): Promise<DocumentResponse> {
    const response = await apiClient.getAxiosInstance().post<DocumentResponse>(
      API_ENDPOINTS.DOCUMENTS_CREATE,
      data
    );
    return response.data;
  },

  /**
   * Update an existing document
   */
  async update(id: string, data: UpdateDocumentRequest): Promise<DocumentResponse> {
    const response = await apiClient.getAxiosInstance().patch<DocumentResponse>(
      API_ENDPOINTS.DOCUMENTS_UPDATE(id),
      data
    );
    return response.data;
  },

  /**
   * Delete a document
   */
  async delete(id: string): Promise<void> {
    await apiClient.getAxiosInstance().delete(API_ENDPOINTS.DOCUMENTS_DELETE(id));
  },

  /**
   * Upload a document file
   * Note: Requires multipart/form-data, handled by client
   */
  async upload(formData: FormData): Promise<DocumentUploadResponse> {
    const response = await apiClient.getAxiosInstance().post<DocumentUploadResponse>(
      API_ENDPOINTS.DOCUMENTS_UPLOAD,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  /**
   * Process a document with OCR
   */
  async processOCR(data: OCRProcessRequest): Promise<OCRProcessResponse> {
    const response = await apiClient.getAxiosInstance().post<OCRProcessResponse>(
      API_ENDPOINTS.OCR_PROCESS,
      data
    );
    return response.data;
  },

  /**
   * Get OCR processing status
   */
  async getOCRStatus(id: string): Promise<OCRProcessResponse> {
    const response = await apiClient.getAxiosInstance().get<OCRProcessResponse>(
      API_ENDPOINTS.OCR_STATUS(id)
    );
    return response.data;
  },

  /**
   * Search documents by query
   */
  async search(query: string, params?: Omit<DocumentListRequest, 'search'>): Promise<PaginatedResponse<DocumentResponse>> {
    return this.list({
      ...params,
      search: query,
    });
  },

  /**
   * Get documents by type
   */
  async getByType(
    tipo: string,
    params?: Omit<DocumentListRequest, 'tipo'>
  ): Promise<PaginatedResponse<DocumentResponse>> {
    return this.list({
      ...params,
      tipo,
    });
  },

  /**
   * Get documents by date range
   */
  async getByDateRange(
    dataInicio: string,
    dataFim: string,
    params?: Omit<DocumentListRequest, 'dataInicio' | 'dataFim'>
  ): Promise<PaginatedResponse<DocumentResponse>> {
    return this.list({
      ...params,
      dataInicio,
      dataFim,
    });
  },
};
