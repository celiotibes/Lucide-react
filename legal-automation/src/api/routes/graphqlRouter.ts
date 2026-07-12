/**
 * GraphQL Router
 * Express router for GraphQL API endpoints
 */

import { Router, Request, Response } from 'express';
import { ApolloServer } from 'apollo-server-express';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { logger } from '@utils/logger';

const router = Router();

/**
 * Serve GraphQL Schema
 */
router.get('/schema', (req: Request, res: Response) => {
  try {
    const schemaPath = resolve(__dirname, '../graphql/schema.graphql');
    const schema = readFileSync(schemaPath, 'utf-8');
    res.type('text/plain').send(schema);
  } catch (error) {
    logger.error({ error }, 'Failed to retrieve GraphQL schema');
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve GraphQL schema',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GraphQL Query Documentation
 */
router.get('/docs/queries', (req: Request, res: Response) => {
  res.json({
    title: 'GraphQL Query Operations',
    description: 'All available GraphQL queries for read operations',
    queries: {
      // Clients
      client: {
        description: 'Fetch a single client by ID',
        args: { id: 'ID!' },
        returns: 'Client',
        example: 'query { client(id: "client-123") { id name email status } }',
      },
      clients: {
        description: 'Fetch all clients with pagination and filtering',
        args: {
          status: 'ClientStatus',
          first: 'Int',
          after: 'String',
          search: 'String',
        },
        returns: 'ClientConnection!',
        example:
          'query { clients(first: 10, status: CUSTOMER, search: "Acme") { edges { cursor node { id name email } } pageInfo { hasNextPage totalCount } } }',
      },
      // Cases
      case: {
        description: 'Fetch a single case by ID',
        args: { id: 'ID!' },
        returns: 'LegalCase',
        example: 'query { case(id: "case-123") { id caseNumber status outcome } }',
      },
      cases: {
        description: 'Fetch cases with pagination and filtering',
        args: {
          clientId: 'ID',
          status: 'CaseStatus',
          caseType: 'String',
          first: 'Int',
          after: 'String',
        },
        returns: 'CaseConnection!',
        example:
          'query { cases(clientId: "client-123", status: IN_PROGRESS) { edges { node { id caseNumber courtName } } } }',
      },
      casesByDeadline: {
        description: 'Fetch cases with upcoming deadlines',
        args: { daysUntilDeadline: 'Int', first: 'Int' },
        returns: '[LegalCase!]!',
        example: 'query { casesByDeadline(daysUntilDeadline: 30, first: 50) { id deadlineDate } }',
      },
      // Contracts
      contract: {
        description: 'Fetch a single contract by ID',
        args: { id: 'ID!' },
        returns: 'Contract',
        example: 'query { contract(id: "contract-123") { id title status } }',
      },
      contracts: {
        description: 'Fetch contracts with filtering',
        args: { clientId: 'ID', status: 'ContractStatus', first: 'Int', after: 'String' },
        returns: '[Contract!]!',
        example: 'query { contracts(clientId: "client-123", status: SIGNED) { id title } }',
      },
      // Invoices
      invoice: {
        description: 'Fetch a single invoice by ID',
        args: { id: 'ID!' },
        returns: 'Invoice',
        example: 'query { invoice(id: "invoice-123") { id amount status } }',
      },
      invoices: {
        description: 'Fetch invoices with pagination',
        args: { clientId: 'ID', status: 'InvoiceStatus', first: 'Int', after: 'String' },
        returns: 'InvoiceConnection!',
        example:
          'query { invoices(clientId: "client-123", status: OVERDUE) { edges { node { id amount dueDate } } } }',
      },
      overdueInvoices: {
        description: 'Fetch all overdue invoices',
        args: { first: 'Int' },
        returns: '[Invoice!]!',
        example: 'query { overdueInvoices(first: 50) { id amount dueDate } }',
      },
      // Intimations
      intimation: {
        description: 'Fetch a single intimation by ID',
        args: { id: 'ID!' },
        returns: 'Intimation',
        example: 'query { intimation(id: "intimation-123") { id documentType } }',
      },
      intimations: {
        description: 'Fetch intimations for a case',
        args: { caseId: 'ID', first: 'Int', after: 'String' },
        returns: '[Intimation!]!',
        example: 'query { intimations(caseId: "case-123") { id deadlineDate isProcessed } }',
      },
      upcomingIntimations: {
        description: 'Fetch upcoming intimations with deadlines',
        args: { daysUntilDeadline: 'Int', first: 'Int' },
        returns: '[Intimation!]!',
        example: 'query { upcomingIntimations(daysUntilDeadline: 14, first: 50) { id deadlineDate } }',
      },
      // Analytics
      courtAnalytics: {
        description: 'Fetch analytics for a specific court',
        args: { courtName: 'String!' },
        returns: 'CourtAnalytics',
        example: 'query { courtAnalytics(courtName: "TJ-SP") { successRate avgDurationDays } }',
      },
      lawyerPerformance: {
        description: 'Fetch performance metrics for a lawyer',
        args: { lawyerName: 'String!' },
        returns: 'LawyerPerformance',
        example: 'query { lawyerPerformance(lawyerName: "John Doe") { winRate totalCases } }',
      },
      financialAnalytics: {
        description: 'Fetch financial analytics for a period',
        args: { periodMonth: 'String!' },
        returns: 'FinancialAnalytics',
        example:
          'query { financialAnalytics(periodMonth: "2026-07") { totalInvoiced collectionRate } }',
      },
      caseAnalytics: {
        description: 'Fetch detailed analytics for a case',
        args: { caseId: 'ID!' },
        returns: 'CaseAnalytics',
        example:
          'query { caseAnalytics(caseId: "case-123") { successRate riskFactors opportunityFactors } }',
      },
      casePredictions: {
        description: 'Fetch AI predictions for a case',
        args: { caseId: 'ID!' },
        returns: 'CasePredictions',
        example:
          'query { casePredictions(caseId: "case-123") { predictedOutcome confidenceScore riskLevel } }',
      },
      // Dashboard
      dashboard: {
        description: 'Fetch dashboard metrics',
        args: {},
        returns: 'DashboardMetrics!',
        example:
          'query { dashboard { totalClients activeCases overdueInvoices caseSuccessRate } }',
      },
      metrics: {
        description: 'Fetch system metrics',
        args: {},
        returns: 'SystemMetrics!',
        example:
          'query { metrics { activeConnections requestsPerSecond errorRate uptime } }',
      },
    },
  });
});

/**
 * GraphQL Mutation Documentation
 */
router.get('/docs/mutations', (req: Request, res: Response) => {
  res.json({
    title: 'GraphQL Mutation Operations',
    description: 'All available GraphQL mutations for write operations',
    mutations: {
      // Clients
      createClient: {
        description: 'Create a new client',
        inputType: 'CreateClientInput!',
        returns: 'CreateClientPayload!',
        example: `mutation {
          createClient(input: {
            name: "Acme Corp"
            email: "contact@acme.com"
            cpf: "123.456.789-00"
            status: CUSTOMER
            caseTypes: ["Trabalhista", "Civil"]
          }) {
            success
            client { id name email }
            errors
          }
        }`,
      },
      updateClient: {
        description: 'Update an existing client',
        inputType: 'UpdateClientInput!',
        returns: 'UpdateClientPayload!',
        example: `mutation {
          updateClient(id: "client-123", input: {
            status: INACTIVE
            notes: "Client transferred"
          }) {
            success
            client { id name status }
            errors
          }
        }`,
      },
      deleteClient: {
        description: 'Delete a client (soft delete)',
        args: { id: 'ID!' },
        returns: 'DeleteClientPayload!',
        example: `mutation {
          deleteClient(id: "client-123") {
            success
            errors
          }
        }`,
      },
      // Cases
      createCase: {
        description: 'Create a new legal case',
        inputType: 'CreateCaseInput!',
        returns: 'CreateCasePayload!',
        example: `mutation {
          createCase(input: {
            clientId: "client-123"
            caseNumber: "0000001-23.2024.1.21.0000"
            caseType: "Civil"
            courtName: "TJ-SP"
            filingDate: "2024-01-15"
            deadlineDate: "2024-03-15"
            amountClaimed: 50000.00
          }) {
            success
            case { id caseNumber status }
            errors
          }
        }`,
      },
      updateCaseStatus: {
        description: 'Update case status',
        args: { id: 'ID!', status: 'CaseStatus!' },
        returns: 'UpdateCasePayload!',
        example: `mutation {
          updateCaseStatus(id: "case-123", status: CLOSED) {
            success
            case { id status }
            errors
          }
        }`,
      },
      recordCaseOutcome: {
        description: 'Record the outcome of a case',
        inputType: 'RecordOutcomeInput!',
        returns: 'UpdateCasePayload!',
        example: `mutation {
          recordCaseOutcome(id: "case-123", input: {
            outcome: FAVORABLE
            amountAwarded: 45000.00
          }) {
            success
            case { id outcome amountAwarded }
            errors
          }
        }`,
      },
      // Invoices
      createInvoice: {
        description: 'Create a new invoice',
        inputType: 'CreateInvoiceInput!',
        returns: 'CreateInvoicePayload!',
        example: `mutation {
          createInvoice(input: {
            clientId: "client-123"
            invoiceNumber: "INV-2024-001"
            amount: 5000.00
            dueDate: "2024-02-15"
            issuedDate: "2024-01-15"
          }) {
            success
            invoice { id amount status }
            errors
          }
        }`,
      },
      recordPayment: {
        description: 'Record payment for an invoice',
        inputType: 'RecordPaymentInput!',
        returns: 'RecordPaymentPayload!',
        example: `mutation {
          recordPayment(invoiceId: "invoice-123", input: {
            amountPaid: 5000.00
            paymentMethod: PIX
          }) {
            success
            invoice { id amountPaid status }
            errors
          }
        }`,
      },
      // Contracts
      createContract: {
        description: 'Create a new contract',
        inputType: 'CreateContractInput!',
        returns: 'CreateContractPayload!',
        example: `mutation {
          createContract(input: {
            clientId: "client-123"
            title: "Service Agreement"
            content: "..."
            signatureRequired: true
          }) {
            success
            contract { id title status }
            errors
          }
        }`,
      },
      signContract: {
        description: 'Sign a contract',
        inputType: 'SignContractInput!',
        returns: 'SignContractPayload!',
        example: `mutation {
          signContract(id: "contract-123", input: {
            signerName: "John Doe"
            signerEmail: "john@example.com"
            signatureData: "..."
          }) {
            success
            contract { id status signedAt }
            errors
          }
        }`,
      },
      // Intimations
      createIntimation: {
        description: 'Create a new intimation',
        inputType: 'CreateIntimationInput!',
        returns: 'CreateIntimationPayload!',
        example: `mutation {
          createIntimation(input: {
            caseId: "case-123"
            documentType: "Notificação"
            title: "Court Notification"
            deadlineDate: "2024-02-15T00:00:00Z"
            notificationMethod: "Email"
            senderName: "Court Clerk"
          }) {
            success
            intimation { id documentType deadlineDate }
            errors
          }
        }`,
      },
      markIntimationProcessed: {
        description: 'Mark an intimation as processed',
        args: { id: 'ID!' },
        returns: 'UpdateIntimationPayload!',
        example: `mutation {
          markIntimationProcessed(id: "intimation-123") {
            success
            intimation { id isProcessed }
            errors
          }
        }`,
      },
    },
  });
});

/**
 * GraphQL Subscription Documentation
 */
router.get('/docs/subscriptions', (req: Request, res: Response) => {
  res.json({
    title: 'GraphQL Subscription Operations',
    description: 'Real-time subscriptions via WebSocket at /graphql/subscriptions',
    subscriptions: {
      caseUpdated: {
        description: 'Subscribe to updates for a specific case',
        args: { caseId: 'ID!' },
        returns: 'LegalCase!',
        example: `subscription {
          caseUpdated(caseId: "case-123") {
            id status outcome deadlineDate
          }
        }`,
      },
      caseCreated: {
        description: 'Subscribe to all new cases',
        returns: 'LegalCase!',
        example: `subscription {
          caseCreated { id caseNumber clientId }
        }`,
      },
      caseStatusChanged: {
        description: 'Subscribe to status changes for a case',
        args: { caseId: 'ID!' },
        returns: 'CaseStatusUpdate!',
        example: `subscription {
          caseStatusChanged(caseId: "case-123") {
            caseId previousStatus newStatus timestamp
          }
        }`,
      },
      deadlineApproaching: {
        description: 'Subscribe to upcoming deadline alerts',
        args: { daysUntilDeadline: 'Int!' },
        returns: 'DeadlineAlert!',
        example: `subscription {
          deadlineApproaching(daysUntilDeadline: 7) {
            type entityId daysRemaining deadline
          }
        }`,
      },
      paymentReceived: {
        description: 'Subscribe to payment events for an invoice',
        args: { invoiceId: 'ID!' },
        returns: 'Invoice!',
        example: `subscription {
          paymentReceived(invoiceId: "invoice-123") {
            id status amountPaid
          }
        }`,
      },
      contractSigned: {
        description: 'Subscribe to contract signing events',
        args: { contractId: 'ID!' },
        returns: 'Contract!',
        example: `subscription {
          contractSigned(contractId: "contract-123") {
            id status signedAt
          }
        }`,
      },
      systemAlert: {
        description: 'Subscribe to system alerts',
        returns: 'SystemAlert!',
        example: `subscription {
          systemAlert { level message timestamp }
        }`,
      },
    },
  });
});

/**
 * GraphQL Playground/IDE redirect
 */
router.get('/ide', (req: Request, res: Response) => {
  res.json({
    message: 'GraphQL IDE available at /graphql (Apollo Sandbox)',
    apollo_sandbox: '/graphql',
    schema_endpoint: '/graphql/schema',
    docs: {
      queries: '/graphql/docs/queries',
      mutations: '/graphql/docs/mutations',
      subscriptions: '/graphql/docs/subscriptions',
    },
  });
});

export default router;
