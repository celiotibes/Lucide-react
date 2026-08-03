/**
 * GraphQL Query Resolvers
 * Handles all read operations (queries) for the GraphQL API
 */

import { IResolvers } from '@graphql-tools/utils';
import { clientRepository, caseRepository, contractRepository, invoiceRepository, intimationRepository } from '@/database/repositoryFactory';
import { NotFoundError, ValidationError } from '@utils/errors';
import { logger } from '@utils/logger';

// Cursor-based pagination helper
function encodeCursor(id: string): string {
  return Buffer.from(id).toString('base64');
}

function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, 'base64').toString('utf-8');
}

interface PaginationArgs {
  first?: number;
  after?: string;
}

interface ClientFilters {
  status?: string;
  search?: string;
}

/**
 * Query Resolvers
 */
export const queryResolvers: IResolvers = {
  Query: {
    // ========================================================================
    // CLIENT QUERIES
    // ========================================================================

    client: async (_: any, { id }: { id: string }, context: any) => {
      try {
        const client = await clientRepository.read(id);
        if (!client) {
          throw new NotFoundError('Client', id);
        }
        return client;
      } catch (error) {
        logger.error({ error, clientId: id }, 'Failed to fetch client');
        throw error;
      }
    },

    clients: async (
      _: any,
      { status, first = 20, after, search }: PaginationArgs & ClientFilters,
      context: any,
    ) => {
      try {
        // Validate pagination parameters
        if (first < 1 || first > 100) {
          throw new ValidationError('first parameter must be between 1 and 100');
        }

        const filters: Record<string, any> = {};
        if (status) filters.status = status;
        if (search) filters.name = { $regex: search, $options: 'i' };

        const offset = after ? parseInt(decodeCursor(after), 10) : 0;

        // Fetch clients with pagination
        const clients = await clientRepository.list(filters, first, offset);
        const total = await clientRepository.count(filters);

        // Build cursor connections
        const edges = clients.map((client: any, index: number) => ({
          cursor: encodeCursor(String(offset + index)),
          node: client,
        }));

        const pageInfo = {
          hasNextPage: offset + first < total,
          hasPreviousPage: offset > 0,
          startCursor: edges.length > 0 ? edges[0].cursor : null,
          endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
          totalCount: total,
        };

        return { edges, pageInfo };
      } catch (error) {
        logger.error({ error, filters: { status, search } }, 'Failed to fetch clients');
        throw error;
      }
    },

    // ========================================================================
    // CASE QUERIES
    // ========================================================================

    case: async (_: any, { id }: { id: string }, context: any) => {
      try {
        const legalCase = await caseRepository.read(id);
        if (!legalCase) {
          throw new NotFoundError('Case', id);
        }
        return legalCase;
      } catch (error) {
        logger.error({ error, caseId: id }, 'Failed to fetch case');
        throw error;
      }
    },

    cases: async (
      _: any,
      { clientId, status, caseType, first = 20, after }: any,
      context: any,
    ) => {
      try {
        if (first < 1 || first > 100) {
          throw new ValidationError('first parameter must be between 1 and 100');
        }

        const filters: Record<string, any> = {};
        if (clientId) filters.client_id = clientId;
        if (status) filters.status = status;
        if (caseType) filters.case_type = caseType;

        const offset = after ? parseInt(decodeCursor(after), 10) : 0;

        const cases = await caseRepository.list(filters, first, offset);
        const total = await caseRepository.count(filters);

        const edges = cases.map((legalCase: any, index: number) => ({
          cursor: encodeCursor(String(offset + index)),
          node: legalCase,
        }));

        const pageInfo = {
          hasNextPage: offset + first < total,
          hasPreviousPage: offset > 0,
          startCursor: edges.length > 0 ? edges[0].cursor : null,
          endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
          totalCount: total,
        };

        return { edges, pageInfo };
      } catch (error) {
        logger.error({ error, filters: { clientId, status, caseType } }, 'Failed to fetch cases');
        throw error;
      }
    },

    casesByDeadline: async (_: any, { daysUntilDeadline = 30, first = 50 }: any, context: any) => {
      try {
        const today = new Date();
        const deadline = new Date(today.getTime() + daysUntilDeadline * 24 * 60 * 60 * 1000);

        const filters = {
          deadline_date: {
            $gte: today.toISOString().split('T')[0],
            $lte: deadline.toISOString().split('T')[0],
          },
          status: { $ne: 'CLOSED' },
        };

        const cases = await caseRepository.list(filters, first, 0);
        return cases;
      } catch (error) {
        logger.error({ error, daysUntilDeadline }, 'Failed to fetch cases by deadline');
        throw error;
      }
    },

    // ========================================================================
    // CONTRACT QUERIES
    // ========================================================================

    contract: async (_: any, { id }: { id: string }, context: any) => {
      try {
        const contract = await contractRepository.read(id);
        if (!contract) {
          throw new NotFoundError('Contract', id);
        }
        return contract;
      } catch (error) {
        logger.error({ error, contractId: id }, 'Failed to fetch contract');
        throw error;
      }
    },

    contracts: async (
      _: any,
      { clientId, status, first = 20, after }: any,
      context: any,
    ) => {
      try {
        const filters: Record<string, any> = {};
        if (clientId) filters.client_id = clientId;
        if (status) filters.status = status;

        const offset = after ? parseInt(decodeCursor(after), 10) : 0;

        const contracts = await contractRepository.list(filters, first, offset);
        return contracts;
      } catch (error) {
        logger.error({ error, filters: { clientId, status } }, 'Failed to fetch contracts');
        throw error;
      }
    },

    // ========================================================================
    // INVOICE QUERIES
    // ========================================================================

    invoice: async (_: any, { id }: { id: string }, context: any) => {
      try {
        const invoice = await invoiceRepository.read(id);
        if (!invoice) {
          throw new NotFoundError('Invoice', id);
        }
        return invoice;
      } catch (error) {
        logger.error({ error, invoiceId: id }, 'Failed to fetch invoice');
        throw error;
      }
    },

    invoices: async (
      _: any,
      { clientId, status, first = 20, after }: any,
      context: any,
    ) => {
      try {
        if (first < 1 || first > 100) {
          throw new ValidationError('first parameter must be between 1 and 100');
        }

        const filters: Record<string, any> = {};
        if (clientId) filters.client_id = clientId;
        if (status) filters.status = status;

        const offset = after ? parseInt(decodeCursor(after), 10) : 0;

        const invoices = await invoiceRepository.list(filters, first, offset);
        const total = await invoiceRepository.count(filters);

        const edges = invoices.map((invoice: any, index: number) => ({
          cursor: encodeCursor(String(offset + index)),
          node: invoice,
        }));

        const pageInfo = {
          hasNextPage: offset + first < total,
          hasPreviousPage: offset > 0,
          startCursor: edges.length > 0 ? edges[0].cursor : null,
          endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
          totalCount: total,
        };

        return { edges, pageInfo };
      } catch (error) {
        logger.error({ error, filters: { clientId, status } }, 'Failed to fetch invoices');
        throw error;
      }
    },

    overdueInvoices: async (_: any, { first = 50 }: any, context: any) => {
      try {
        const today = new Date().toISOString().split('T')[0];

        const filters = {
          due_date: { $lt: today },
          status: { $nin: ['PAID', 'ARCHIVED'] },
        };

        const invoices = await invoiceRepository.list(filters, first, 0);
        return invoices;
      } catch (error) {
        logger.error({ error }, 'Failed to fetch overdue invoices');
        throw error;
      }
    },

    // ========================================================================
    // INTIMATION QUERIES
    // ========================================================================

    intimation: async (_: any, { id }: { id: string }, context: any) => {
      try {
        const intimation = await intimationRepository.read(id);
        if (!intimation) {
          throw new NotFoundError('Intimation', id);
        }
        return intimation;
      } catch (error) {
        logger.error({ error, intimationId: id }, 'Failed to fetch intimation');
        throw error;
      }
    },

    intimations: async (_: any, { caseId, first = 50, after }: any, context: any) => {
      try {
        const filters: Record<string, any> = {};
        if (caseId) filters.case_id = caseId;

        const offset = after ? parseInt(decodeCursor(after), 10) : 0;

        const intimations = await intimationRepository.list(filters, first, offset);
        return intimations;
      } catch (error) {
        logger.error({ error, caseId }, 'Failed to fetch intimations');
        throw error;
      }
    },

    upcomingIntimations: async (_: any, { daysUntilDeadline = 30, first = 50 }: any, context: any) => {
      try {
        const today = new Date();
        const deadline = new Date(today.getTime() + daysUntilDeadline * 24 * 60 * 60 * 1000);

        const filters = {
          deadline_date: {
            $gte: today.toISOString(),
            $lte: deadline.toISOString(),
          },
          is_processed: false,
        };

        const intimations = await intimationRepository.list(filters, first, 0);
        return intimations;
      } catch (error) {
        logger.error({ error, daysUntilDeadline }, 'Failed to fetch upcoming intimations');
        throw error;
      }
    },

    // ========================================================================
    // ANALYTICS QUERIES
    // ========================================================================

    courtAnalytics: async (_: any, { courtName }: { courtName: string }, context: any) => {
      try {
        // Fetch analytics from repository (would need analytics repository)
        // For now, return placeholder
        logger.info({ courtName }, 'Fetching court analytics');
        return {
          id: `analytics-${courtName}`,
          courtName,
          totalCases: 0,
          favorableCases: 0,
          unfavorableCases: 0,
          successRate: 0,
          avgDurationDays: 0,
          avgCaseValue: 0,
          totalValueProcessed: 0,
          judges: [],
          recentDecisions: [],
          specialization: [],
        };
      } catch (error) {
        logger.error({ error, courtName }, 'Failed to fetch court analytics');
        throw error;
      }
    },

    lawyerPerformance: async (_: any, { lawyerName }: { lawyerName: string }, context: any) => {
      try {
        logger.info({ lawyerName }, 'Fetching lawyer performance');
        return {
          id: `lawyer-${lawyerName}`,
          lawyerName,
          totalCases: 0,
          casesWon: 0,
          casesLost: 0,
          casesSettled: 0,
          winRate: 0,
          avgCaseDuration: 0,
          avgSettlementTime: 0,
          specializations: [],
          activeCases: 0,
          totalValueHandled: 0,
          clientSatisfactionScore: 0,
          experienceYears: 0,
          certifications: [],
        };
      } catch (error) {
        logger.error({ error, lawyerName }, 'Failed to fetch lawyer performance');
        throw error;
      }
    },

    financialAnalytics: async (_: any, { periodMonth }: { periodMonth: string }, context: any) => {
      try {
        logger.info({ periodMonth }, 'Fetching financial analytics');
        return {
          id: `financial-${periodMonth}`,
          periodMonth,
          totalInvoiced: 0,
          totalReceived: 0,
          collectionRate: 0,
          overdueAmount: 0,
          overdueCount: 0,
          avgPaymentTimeDays: 0,
          revenueByType: {},
          revenueByClient: {},
          topClients: [],
          paymentMethods: {},
          invoiceCount: 0,
        };
      } catch (error) {
        logger.error({ error, periodMonth }, 'Failed to fetch financial analytics');
        throw error;
      }
    },

    caseAnalytics: async (_: any, { caseId }: { caseId: string }, context: any) => {
      try {
        // Fetch case first to verify it exists
        const legalCase = await caseRepository.read(caseId);
        if (!legalCase) {
          throw new NotFoundError('Case', caseId);
        }

        logger.info({ caseId }, 'Fetching case analytics');
        return {
          id: `analytics-${caseId}`,
          caseId,
          successRate: 0,
          avgDurationDays: 0,
          avgCost: 0,
          favorableOutcomes: 0,
          unfavorableOutcomes: 0,
          partialOutcomes: 0,
          settledOutcomes: 0,
          dismissedOutcomes: 0,
          pendingOutcomes: 0,
          predictedOutcome: null,
          predictionConfidence: 0,
          riskFactors: [],
          opportunityFactors: [],
          similarCasesCount: 0,
          precedentCases: [],
        };
      } catch (error) {
        logger.error({ error, caseId }, 'Failed to fetch case analytics');
        throw error;
      }
    },

    casePredictions: async (_: any, { caseId }: { caseId: string }, context: any) => {
      try {
        const legalCase = await caseRepository.read(caseId);
        if (!legalCase) {
          throw new NotFoundError('Case', caseId);
        }

        logger.info({ caseId }, 'Fetching case predictions');
        return {
          id: `predictions-${caseId}`,
          caseId,
          predictedOutcome: 'PENDING',
          confidenceScore: 0,
          probabilityFavorable: 0,
          probabilityUnfavorable: 0,
          probabilitySettlement: 0,
          estimatedDurationDays: 0,
          estimatedCost: 0,
          riskLevel: 'MEDIUM',
          recommendation: null,
          factorsPositive: [],
          factorsNegative: [],
          modelVersion: '1.0',
          predictionDate: new Date().toISOString(),
        };
      } catch (error) {
        logger.error({ error, caseId }, 'Failed to fetch case predictions');
        throw error;
      }
    },

    // ========================================================================
    // DASHBOARD QUERIES
    // ========================================================================

    dashboard: async (_: any, __: any, context: any) => {
      try {
        logger.info('Fetching dashboard metrics');

        // Fetch counts from repositories
        const totalClients = await clientRepository.count({});
        const totalCases = await caseRepository.count({});
        const activeCases = await caseRepository.count({ status: 'IN_PROGRESS' });
        const closedCases = await caseRepository.count({ status: 'CLOSED' });
        const overdueInvoices = await invoiceRepository.count({
          status: { $in: ['OVERDUE'] },
        });

        return {
          totalClients,
          totalCases,
          activeCases,
          closedCases,
          totalInvoiced: 0,
          totalCollected: 0,
          collectionRate: 0,
          upcomingDeadlines: 0,
          overdueInvoices,
          caseSuccessRate: 0,
          averageCaseDuration: 0,
        };
      } catch (error) {
        logger.error({ error }, 'Failed to fetch dashboard metrics');
        throw error;
      }
    },

    metrics: async (_: any, __: any, context: any) => {
      try {
        logger.info('Fetching system metrics');
        return {
          activeConnections: 0,
          requestsPerSecond: 0,
          averageResponseTime: 0,
          errorRate: 0,
          uptime: 99.9,
          databaseConnections: 0,
          queuedMessages: 0,
        };
      } catch (error) {
        logger.error({ error }, 'Failed to fetch system metrics');
        throw error;
      }
    },
  },
};
