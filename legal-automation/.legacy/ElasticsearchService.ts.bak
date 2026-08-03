/**
 * Elasticsearch Service
 * Gerencia indexação, busca full-text e agregações
 */

import { Client as ElasticsearchClient } from '@elastic/elasticsearch';
import { logger } from '@utils/logger';
import { config } from '@utils/config';

interface SearchFilters {
  status?: string;
  clientId?: string;
  caseType?: string;
  courtName?: string;
  dateFrom?: string;
  dateTo?: string;
  minAmount?: number;
  maxAmount?: number;
}

interface SearchResult<T> {
  id: string;
  score: number;
  data: T;
}

interface SearchResults<T> {
  total: number;
  page: number;
  limit: number;
  results: SearchResult<T>[];
  aggregations?: Record<string, any>;
}

class ElasticsearchService {
  private client: ElasticsearchClient;
  private isConnected: boolean = false;

  constructor() {
    this.client = new ElasticsearchClient({
      node: config.elasticsearch_url || 'http://localhost:9200',
      auth: config.elasticsearch_username
        ? {
            username: config.elasticsearch_username,
            password: config.elasticsearch_password || '',
          }
        : undefined,
    });
  }

  /**
   * Inicializa conexão com Elasticsearch
   */
  async initialize(): Promise<void> {
    try {
      const info = await this.client.info();
      logger.info(
        {
          version: info.version?.number,
          clusterName: info.name,
        },
        'Elasticsearch conectado com sucesso',
      );
      this.isConnected = true;
      await this.createIndexes();
    } catch (error) {
      logger.error({ error }, 'Falha ao conectar ao Elasticsearch');
      this.isConnected = false;
    }
  }

  /**
   * Cria índices e mappings
   */
  private async createIndexes(): Promise<void> {
    const indexes = [
      { name: 'clients', mapping: this.getClientMapping() },
      { name: 'cases', mapping: this.getCaseMapping() },
      { name: 'contracts', mapping: this.getContractMapping() },
      { name: 'invoices', mapping: this.getInvoiceMapping() },
      { name: 'intimations', mapping: this.getIntimationMapping() },
    ];

    for (const { name, mapping } of indexes) {
      try {
        const exists = await this.client.indices.exists({ index: name });
        if (!exists) {
          await this.client.indices.create({
            index: name,
            body: mapping,
          });
          logger.info({ index: name }, 'Índice criado');
        }
      } catch (error) {
        logger.error({ error, index: name }, 'Falha ao criar índice');
      }
    }
  }

  /**
   * Mapping para clientes
   */
  private getClientMapping() {
    return {
      settings: {
        number_of_shards: 1,
        number_of_replicas: 0,
        analysis: {
          analyzer: {
            portuguese: {
              type: 'standard',
              stopwords: '_portuguese_',
            },
          },
        },
      },
      mappings: {
        properties: {
          id: { type: 'keyword' },
          name: {
            type: 'text',
            analyzer: 'portuguese',
            fields: { keyword: { type: 'keyword' } },
          },
          email: { type: 'keyword' },
          phone: { type: 'keyword' },
          cpf: { type: 'keyword' },
          cnpj: { type: 'keyword' },
          status: { type: 'keyword' },
          caseTypes: { type: 'keyword' },
          address: { type: 'text' },
          city: { type: 'keyword' },
          state: { type: 'keyword' },
          industry: { type: 'keyword' },
          notes: { type: 'text', analyzer: 'portuguese' },
          createdAt: { type: 'date' },
          updatedAt: { type: 'date' },
          deletedAt: { type: 'date' },
        },
      },
    };
  }

  /**
   * Mapping para casos
   */
  private getCaseMapping() {
    return {
      settings: {
        number_of_shards: 1,
        number_of_replicas: 0,
        analysis: {
          analyzer: {
            portuguese: {
              type: 'standard',
              stopwords: '_portuguese_',
            },
          },
        },
      },
      mappings: {
        properties: {
          id: { type: 'keyword' },
          caseNumber: { type: 'keyword' },
          clientId: { type: 'keyword' },
          clientName: { type: 'text', analyzer: 'portuguese' },
          caseType: { type: 'keyword' },
          courtName: { type: 'keyword' },
          judgeName: { type: 'text' },
          processNumber: { type: 'keyword' },
          status: { type: 'keyword' },
          outcome: { type: 'keyword' },
          successRate: { type: 'float' },
          estimatedDuration: { type: 'integer' },
          filingDate: { type: 'date' },
          deadlineDate: { type: 'date' },
          amountClaimed: { type: 'double' },
          amountAwarded: { type: 'double' },
          lawyerAssigned: { type: 'text' },
          notes: { type: 'text', analyzer: 'portuguese' },
          tags: { type: 'keyword' },
          createdAt: { type: 'date' },
          updatedAt: { type: 'date' },
          deletedAt: { type: 'date' },
        },
      },
    };
  }

  /**
   * Mapping para contratos
   */
  private getContractMapping() {
    return {
      settings: {
        number_of_shards: 1,
        number_of_replicas: 0,
        analysis: {
          analyzer: {
            portuguese: {
              type: 'standard',
              stopwords: '_portuguese_',
            },
          },
        },
      },
      mappings: {
        properties: {
          id: { type: 'keyword' },
          clientId: { type: 'keyword' },
          clientName: { type: 'text', analyzer: 'portuguese' },
          title: { type: 'text', analyzer: 'portuguese' },
          description: { type: 'text', analyzer: 'portuguese' },
          content: { type: 'text', analyzer: 'portuguese' },
          status: { type: 'keyword' },
          version: { type: 'integer' },
          signatureRequired: { type: 'boolean' },
          signedAt: { type: 'date' },
          executedAt: { type: 'date' },
          tags: { type: 'keyword' },
          createdAt: { type: 'date' },
          updatedAt: { type: 'date' },
          deletedAt: { type: 'date' },
        },
      },
    };
  }

  /**
   * Mapping para faturas
   */
  private getInvoiceMapping() {
    return {
      settings: {
        number_of_shards: 1,
        number_of_replicas: 0,
        analysis: {
          analyzer: {
            portuguese: {
              type: 'standard',
              stopwords: '_portuguese_',
            },
          },
        },
      },
      mappings: {
        properties: {
          id: { type: 'keyword' },
          invoiceNumber: { type: 'keyword' },
          clientId: { type: 'keyword' },
          clientName: { type: 'text', analyzer: 'portuguese' },
          caseId: { type: 'keyword' },
          amount: { type: 'double' },
          amountPaid: { type: 'double' },
          currency: { type: 'keyword' },
          status: { type: 'keyword' },
          description: { type: 'text', analyzer: 'portuguese' },
          dueDate: { type: 'date' },
          issuedDate: { type: 'date' },
          paidDate: { type: 'date' },
          overdueDays: { type: 'integer' },
          paymentMethod: { type: 'keyword' },
          tags: { type: 'keyword' },
          createdAt: { type: 'date' },
          updatedAt: { type: 'date' },
          deletedAt: { type: 'date' },
        },
      },
    };
  }

  /**
   * Mapping para intimações
   */
  private getIntimationMapping() {
    return {
      settings: {
        number_of_shards: 1,
        number_of_replicas: 0,
        analysis: {
          analyzer: {
            portuguese: {
              type: 'standard',
              stopwords: '_portuguese_',
            },
          },
        },
      },
      mappings: {
        properties: {
          id: { type: 'keyword' },
          caseId: { type: 'keyword' },
          caseNumber: { type: 'keyword' },
          documentType: { type: 'keyword' },
          title: { type: 'text', analyzer: 'portuguese' },
          content: { type: 'text', analyzer: 'portuguese' },
          receivedDate: { type: 'date' },
          deadlineDate: { type: 'date' },
          notificationMethod: { type: 'keyword' },
          senderName: { type: 'text' },
          documentUrl: { type: 'keyword' },
          isProcessed: { type: 'boolean' },
          processedAt: { type: 'date' },
          tags: { type: 'keyword' },
          createdAt: { type: 'date' },
          updatedAt: { type: 'date' },
          deletedAt: { type: 'date' },
        },
      },
    };
  }

  /**
   * Indexa um cliente
   */
  async indexClient(client: any): Promise<void> {
    if (!this.isConnected) return;

    try {
      await this.client.index({
        index: 'clients',
        id: client.id,
        document: {
          id: client.id,
          name: client.name,
          email: client.email,
          phone: client.phone,
          cpf: client.cpf,
          cnpj: client.cnpj,
          status: client.status,
          caseTypes: client.case_types,
          address: client.address,
          city: client.city,
          state: client.state,
          industry: client.industry,
          notes: client.notes,
          createdAt: client.created_at,
          updatedAt: client.updated_at,
          deletedAt: client.deleted_at,
        },
      });
    } catch (error) {
      logger.error({ error, clientId: client.id }, 'Falha ao indexar cliente');
    }
  }

  /**
   * Indexa um caso
   */
  async indexCase(legalCase: any, clientName?: string): Promise<void> {
    if (!this.isConnected) return;

    try {
      await this.client.index({
        index: 'cases',
        id: legalCase.id,
        document: {
          id: legalCase.id,
          caseNumber: legalCase.case_number,
          clientId: legalCase.client_id,
          clientName: clientName || '',
          caseType: legalCase.case_type,
          courtName: legalCase.court_name,
          judgeName: legalCase.judge_name,
          processNumber: legalCase.process_number,
          status: legalCase.status,
          outcome: legalCase.outcome,
          successRate: legalCase.success_rate,
          estimatedDuration: legalCase.estimated_duration,
          filingDate: legalCase.filing_date,
          deadlineDate: legalCase.deadline_date,
          amountClaimed: legalCase.amount_claimed,
          amountAwarded: legalCase.amount_awarded,
          lawyerAssigned: legalCase.lawyer_assigned,
          notes: legalCase.notes,
          tags: [],
          createdAt: legalCase.created_at,
          updatedAt: legalCase.updated_at,
          deletedAt: legalCase.deleted_at,
        },
      });
    } catch (error) {
      logger.error({ error, caseId: legalCase.id }, 'Falha ao indexar caso');
    }
  }

  /**
   * Indexa um contrato
   */
  async indexContract(contract: any, clientName?: string): Promise<void> {
    if (!this.isConnected) return;

    try {
      await this.client.index({
        index: 'contracts',
        id: contract.id,
        document: {
          id: contract.id,
          clientId: contract.client_id,
          clientName: clientName || '',
          title: contract.title,
          description: contract.description,
          content: contract.content,
          status: contract.status,
          version: contract.version,
          signatureRequired: contract.signature_required,
          signedAt: contract.signed_at,
          executedAt: contract.executed_at,
          tags: [],
          createdAt: contract.created_at,
          updatedAt: contract.updated_at,
          deletedAt: contract.deleted_at,
        },
      });
    } catch (error) {
      logger.error({ error, contractId: contract.id }, 'Falha ao indexar contrato');
    }
  }

  /**
   * Indexa uma fatura
   */
  async indexInvoice(invoice: any, clientName?: string): Promise<void> {
    if (!this.isConnected) return;

    try {
      await this.client.index({
        index: 'invoices',
        id: invoice.id,
        document: {
          id: invoice.id,
          invoiceNumber: invoice.invoice_number,
          clientId: invoice.client_id,
          clientName: clientName || '',
          caseId: invoice.case_id,
          amount: invoice.amount,
          amountPaid: invoice.amount_paid,
          currency: invoice.currency,
          status: invoice.status,
          description: invoice.description,
          dueDate: invoice.due_date,
          issuedDate: invoice.issued_date,
          paidDate: invoice.paid_date,
          overdueDays: invoice.overdue_days,
          paymentMethod: invoice.payment_method,
          tags: [],
          createdAt: invoice.created_at,
          updatedAt: invoice.updated_at,
          deletedAt: invoice.deleted_at,
        },
      });
    } catch (error) {
      logger.error({ error, invoiceId: invoice.id }, 'Falha ao indexar fatura');
    }
  }

  /**
   * Indexa uma intimação
   */
  async indexIntimation(intimation: any, caseNumber?: string): Promise<void> {
    if (!this.isConnected) return;

    try {
      await this.client.index({
        index: 'intimations',
        id: intimation.id,
        document: {
          id: intimation.id,
          caseId: intimation.case_id,
          caseNumber: caseNumber || '',
          documentType: intimation.document_type,
          title: intimation.title,
          content: intimation.content,
          receivedDate: intimation.received_date,
          deadlineDate: intimation.deadline_date,
          notificationMethod: intimation.notification_method,
          senderName: intimation.sender_name,
          documentUrl: intimation.document_url,
          isProcessed: intimation.is_processed,
          processedAt: intimation.processed_at,
          tags: [],
          createdAt: intimation.created_at,
          updatedAt: intimation.updated_at,
          deletedAt: intimation.deleted_at,
        },
      });
    } catch (error) {
      logger.error({ error, intimationId: intimation.id }, 'Falha ao indexar intimação');
    }
  }

  /**
   * Busca em um índice
   */
  async search<T>(
    index: string,
    query: string,
    filters: SearchFilters = {},
    page: number = 1,
    limit: number = 20,
  ): Promise<SearchResults<T>> {
    if (!this.isConnected) {
      return { total: 0, page, limit, results: [] };
    }

    try {
      const offset = (page - 1) * limit;

      const must = [];
      if (query) {
        must.push({
          multi_match: {
            query,
            fields: this.getSearchFields(index),
            fuzziness: 'AUTO',
            operator: 'or',
          },
        });
      }

      const filterClauses = [];
      if (filters.status) {
        filterClauses.push({ term: { status: filters.status } });
      }
      if (filters.clientId) {
        filterClauses.push({ term: { clientId: filters.clientId } });
      }
      if (filters.caseType) {
        filterClauses.push({ term: { caseType: filters.caseType } });
      }
      if (filters.courtName) {
        filterClauses.push({ term: { courtName: filters.courtName } });
      }
      if (filters.dateFrom || filters.dateTo) {
        filterClauses.push({
          range: {
            createdAt: {
              gte: filters.dateFrom,
              lte: filters.dateTo,
            },
          },
        });
      }
      if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
        filterClauses.push({
          range: {
            amount: {
              gte: filters.minAmount,
              lte: filters.maxAmount,
            },
          },
        });
      }

      const searchBody: any = {
        size: limit,
        from: offset,
        query: {
          bool: {
            must: must.length > 0 ? must : [{ match_all: {} }],
            filter: filterClauses,
          },
        },
      };

      const response = await this.client.search<T>({
        index,
        body: searchBody,
      });

      const results = response.hits.hits.map((hit: any) => ({
        id: hit._id,
        score: hit._score,
        data: hit._source,
      }));

      return {
        total: response.hits.total as unknown as number,
        page,
        limit,
        results,
      };
    } catch (error) {
      logger.error({ error, index, query }, 'Falha ao buscar');
      return { total: 0, page, limit, results: [] };
    }
  }

  /**
   * Busca por agregações (facetas)
   */
  async searchWithAggregations(
    index: string,
    query: string,
    aggregations: Record<string, any>,
  ): Promise<any> {
    if (!this.isConnected) {
      return { total: 0, results: [], aggregations: {} };
    }

    try {
      const searchBody: any = {
        size: 20,
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query,
                  fields: this.getSearchFields(index),
                  fuzziness: 'AUTO',
                },
              },
            ],
          },
        },
        aggs: aggregations,
      };

      const response = await this.client.search({
        index,
        body: searchBody,
      });

      return {
        total: response.hits.total,
        results: response.hits.hits,
        aggregations: response.aggregations,
      };
    } catch (error) {
      logger.error({ error, index }, 'Falha ao buscar com agregações');
      return { total: 0, results: [], aggregations: {} };
    }
  }

  /**
   * Remove documento do índice
   */
  async deleteDocument(index: string, documentId: string): Promise<void> {
    if (!this.isConnected) return;

    try {
      await this.client.delete({
        index,
        id: documentId,
      });
    } catch (error) {
      logger.error({ error, index, documentId }, 'Falha ao deletar documento');
    }
  }

  /**
   * Obtém campos de busca por índice
   */
  private getSearchFields(index: string): string[] {
    const fields: Record<string, string[]> = {
      clients: ['name', 'email', 'notes', 'address'],
      cases: ['caseNumber', 'courtName', 'judgeName', 'notes', 'clientName'],
      contracts: ['title', 'description', 'content', 'clientName'],
      invoices: ['invoiceNumber', 'description', 'clientName'],
      intimations: ['title', 'content', 'documentType', 'senderName', 'caseNumber'],
    };

    return fields[index] || [];
  }

  /**
   * Retorna status da conexão
   */
  isReady(): boolean {
    return this.isConnected;
  }
}

export const elasticsearchService = new ElasticsearchService();
