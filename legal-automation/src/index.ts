import express, { Express, Request, Response, NextFunction } from 'express';
import 'express-async-errors';
import helmet from 'helmet';
import cors from 'cors';
import multer from 'multer';
import { createServer } from 'http';
import { logger, httpLogger } from '@utils/logger';
import { config, validateConfig } from '@utils/config';
import { AppError, handleError } from '@utils/errors';
import { projudiSoapClient } from '@projudi/soapClient';
import { initDatabase, closeDatabase } from '@/database/connection';
import { verifyToken } from '@middlewares/authMiddleware';
import { errorHandler, notFoundHandler } from '@middlewares/errorHandler';
import { addTraceIdMiddleware, requestContextMiddleware, requestTimingMiddleware, traceContextMiddleware } from '@utils/tracing';
import { webSocketManager } from '@services/WebSocketManager';

// Controllers
import authController from '@/api/controllers/authController';
import petitionController from '@/api/controllers/petitionController';
import processController from '@/api/controllers/processController';
import aiController from '@/api/controllers/aiController';
import multiTribunalController from '@/api/controllers/multiTribunalController';
import { templateController } from '@/api/controllers/templateController';
import { ocrController } from '@/api/controllers/ocrController';
import { automationController } from '@/api/controllers/automationController';
import { projurisClientController } from '@/api/controllers/projurisClientController';
import { projurisCaseController } from '@/api/controllers/projurisCaseController';
import { projurisTaskController } from '@/api/controllers/projurisTaskController';
import { projurisDashboardController } from '@/api/controllers/projurisDashboardController';
import { astreaFinancialController } from '@/api/controllers/astreaFinancialController';
import { astreaDeadlineController } from '@/api/controllers/astreaDeadlineController';
import { astreaTimeController } from '@/api/controllers/astreaTimeController';
import { astreaAnalyticsController } from '@/api/controllers/astreaAnalyticsController';
import dataEnrichmentController from '@/api/controllers/dataEnrichmentController';
import analyticsController from '@/api/controllers/analyticsController';
import kanbanController from '@/api/controllers/kanbanController';
import timesheetController from '@/api/controllers/timesheetController';
import aiTriageController from '@/api/controllers/aiTriageController';
import officialDiaryController from '@/api/controllers/officialDiaryController';
import predictionController from '@/api/controllers/predictionController';
import clientPortalController from '@/api/controllers/clientPortalController';
import workflowController from '@/api/controllers/workflowController';
import backupController from '@/api/controllers/backupController';
import digitalSignatureController from '@/api/controllers/digitalSignatureController';
import mobileDashboardController from '@/api/controllers/mobileDashboardController';
import paymentController from '@/api/controllers/paymentController';
import reportingController from '@/api/controllers/reportingController';
import tribunalPollingController from '@/api/controllers/tribunalPollingController';
import contractRouter from '@/api/routes/contractRouter';
import auditRouter from '@/api/routes/auditRouter';
import eventRouter from '@/api/routes/eventRouter';
import cacheRouter from '@/api/routes/cacheRouter';
import healthRouter from '@/api/routes/healthRouter';
import swaggerRouter from '@/api/routes/swaggerRouter';
import webSocketRouter from '@/api/routes/webSocketRouter';
import { webSocketEventService } from '@services/WebSocketEventService';
import graphqlRouter from '@/api/routes/graphqlRouter';
import { initializeApolloServer } from '@/api/graphql/apolloServer';
import searchRouter from '@/api/routes/searchRouter';
import { elasticsearchService } from '@services/ElasticsearchService';
import cacheManagementRouter from '@/api/routes/cacheManagementRouter';
import { redisCacheService } from '@services/RedisCacheService';
import apiKeyRouter from '@/api/routes/apiKeyRouter';
import { encryptionService } from '@services/EncryptionService';
import { auditLogService } from '@services/AuditLogService';
import { apiKeyService } from '@services/ApiKeyService';

// Phase 5: AI Optimization & Monitoring Routers
import abTestingRouter from '@/api/routes/abTestingRouter';
import rateLimitingRouter from '@/api/routes/rateLimitingRouter';
import autoOptimizationRouter from '@/api/routes/autoOptimizationRouter';
import monitoringRouter from '@/api/routes/monitoringRouter';
import persistenceRouter from '@/api/routes/persistenceRouter';

// Phase 5.7: Multi-Model Orchestration
import multiModelRouter from '@/api/routes/multiModelRouter';

// Phase 1: WhatsApp Bot + CRM
import crmRouter from '@/api/routes/crmRouter';

// Phase 2: Intimation Capture & Deadline Tracking
import intimationRouter from '@/api/routes/intimationRouter';

// Phase 3: Financial Management & Billing
import financialRouter from '@/api/routes/financialRouter';

// Phase 4: Jurimetry & Analytics
import jurimetriaRouter from '@/api/routes/jurimetriaRouter';

const app: Express = express();

validateConfig();

// Tracing & Request Context (must be early in middleware chain)
app.use(traceContextMiddleware);
app.use(addTraceIdMiddleware);
app.use(requestContextMiddleware);
app.use(requestTimingMiddleware);

// Middleware de segurança
app.use(helmet());
app.use(cors({ origin: config.cors_origin }));

// HTTP Logging
app.use(httpLogger());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// File upload
const upload = multer({
  dest: config.upload_dir,
  limits: { fileSize: config.max_file_size },
});

// Health check routes
app.use('/health', healthRouter);

// API Documentation (Swagger/OpenAPI)
app.use('/api-docs', swaggerRouter);

// API Routes
app.use('/api/v1/auth', authController);
app.use('/api/v1/petitions', verifyToken, petitionController);
app.use('/api/v1/processes', verifyToken, processController);
app.use('/api/v1/ai', verifyToken, aiController);
app.use('/api/v1/tribunals', multiTribunalController);
app.use('/api/v1/templates', templateController);
app.use('/api/v1/ocr', ocrController);
app.use('/api/v1/automation', automationController);

// Projuris Routes
app.use('/api/v1/projuris/clients', verifyToken, projurisClientController);
app.use('/api/v1/projuris/cases', verifyToken, projurisCaseController);
app.use('/api/v1/projuris/tasks', verifyToken, projurisTaskController);
app.use('/api/v1/projuris/dashboard', verifyToken, projurisDashboardController);

// Astrea Routes
app.use('/api/v1/astrea', verifyToken, astreaFinancialController);
app.use('/api/v1/astrea/deadlines', verifyToken, astreaDeadlineController);
app.use('/api/v1/astrea/time-entries', verifyToken, astreaTimeController);
app.use('/api/v1/astrea/analytics', verifyToken, astreaAnalyticsController);

// Data Enrichment Routes (Phase 2: Infrastructure APIs)
app.use('/api/v1/data', verifyToken, dataEnrichmentController);

// Analytics Routes (Phase 3: Business Intelligence)
app.use('/api/v1/analytics', verifyToken, analyticsController);

// Kanban Routes (Phase 4: Productivity & UX)
app.use('/api/v1/kanban', verifyToken, kanbanController);

// Timesheet Routes (Phase 4: Productivity & UX)
app.use('/api/v1/timesheet', verifyToken, timesheetController);

// AI Triage Routes (Phase 5: Intelligence)
app.use('/api/v1/ai/triage', verifyToken, aiTriageController);

// Official Diary Routes (Phase 6: Monitoring & Alerts)
app.use('/api/v1/diaries', verifyToken, officialDiaryController);

// Predictions & Recommendations Routes (Phase 7: Automatic Recommendations & Predictions)
app.use('/api/v1/predictions', verifyToken, predictionController);

// Client Portal Routes (Phase 8: Transparent Client Portal)
app.use('/api/v1/client-portal', verifyToken, clientPortalController);

// Workflow Routes (Phase 9: Customizable Approval Workflows)
app.use('/api/v1/workflows', verifyToken, workflowController);

// Backup Routes
app.use('/api/v1/backup', verifyToken, backupController);

// Digital Signature Routes
app.use('/api/v1/digital-signature', verifyToken, digitalSignatureController);

// Mobile Dashboard Routes
app.use('/api/v1/mobile/dashboard', verifyToken, mobileDashboardController);

// Payment Routes
app.use('/api/v1/payments', verifyToken, paymentController);

// Reporting Routes
app.use('/api/v1/reports', verifyToken, reportingController);

// Tribunal Polling Routes
app.use('/api/v1/tribunal-polling', verifyToken, tribunalPollingController);

// Phase 5: Contract Lifecycle Management
app.use('/api/v1/contracts', verifyToken, contractRouter);

// Improvements: Audit Trail & Compliance
app.use('/api/v1/audit', verifyToken, auditRouter);

// Improvements: Event-Driven Architecture & Webhooks
app.use('/api/v1/events', verifyToken, eventRouter);

// Improvements: Performance & Caching
app.use('/api/v1/cache', verifyToken, cacheRouter);

// Real-time Updates via WebSocket
app.use('/api/v1/ws', verifyToken, webSocketRouter);

// Phase 5: AI Optimization & Monitoring Routes
app.use('/api/v1/ab-testing', verifyToken, abTestingRouter);
app.use('/api/v1/rate-limiting', verifyToken, rateLimitingRouter);
app.use('/api/v1/optimization', verifyToken, autoOptimizationRouter);
app.use('/api/v1/monitoring', verifyToken, monitoringRouter);
app.use('/api/v1/persistence', verifyToken, persistenceRouter);

// Phase 5.7: Multi-Model Orchestration
app.use('/api/v1/multi-model', verifyToken, multiModelRouter);

// Phase 1: WhatsApp Bot + CRM Integration
app.use('/api/v1/crm', verifyToken, crmRouter);

// Phase 2: Intimation Capture & Deadline Tracking
app.use('/api/v1/intimations', verifyToken, intimationRouter);

// Phase 3: Financial Management & Billing
app.use('/api/v1/financial', verifyToken, financialRouter);

// Phase 4: Jurimetry & Analytics
app.use('/api/v1/jurimetria', verifyToken, jurimetriaRouter);

// Phase 4: GraphQL API
app.use('/graphql', graphqlRouter);

// Phase 5: Advanced Search (Elasticsearch)
app.use('/api/v1/search', searchRouter);

// Phase 6: Cache Management (Redis + In-Memory)
app.use('/api/v1/cache', cacheManagementRouter);

// Phase 7: Security Hardening (API Keys, Encryption, Audit Logging)
app.use('/api/v1', apiKeyRouter);

// 404 Handler (must come before error handler)
app.use(notFoundHandler);

// Global Error Handler (must be last)
app.use(errorHandler);

// Initialize services
async function initializeServices(): Promise<void> {
  try {
    logger.info('Inicializando serviços...');

    // Inicializar banco de dados
    await initDatabase();
    logger.info('✓ PostgreSQL conectado');

    // Inicializar Elasticsearch
    try {
      await elasticsearchService.initialize();
      logger.info('✓ Elasticsearch inicializado');
    } catch (error) {
      logger.warn({ error }, 'Elasticsearch não disponível - busca avançada desabilitada');
    }

    // Inicializar Redis Cache
    if (config.redis_url) {
      if (redisCacheService.isReady()) {
        logger.info('✓ Redis Cache inicializado');
      } else {
        logger.warn('Redis não disponível - usando apenas cache em memória');
      }
    }

    // Inicialize Projudi SOAP client
    if (config.projudi_wsdl_url) {
      await projudiSoapClient.initialize();
      logger.info('✓ Projudi SOAP Client inicializado');
    }

    logger.info('✓ Todos os serviços inicializados');
  } catch (error) {
    logger.error({ err: error }, 'Erro ao inicializar serviços');
    process.exit(1);
  }
}

// Initialize real-time features
function initializeRealtimeFeatures(): void {
  try {
    webSocketEventService.initialize();
    logger.info('✓ WebSocket Event Service inicializado');
  } catch (error) {
    logger.error({ err: error }, 'Erro ao inicializar WebSocket Event Service');
  }
}

// Start server
async function startServer(): Promise<void> {
  try {
    await initializeServices();

    const httpServer = createServer(app);

    // Inicializar Apollo Server para GraphQL
    try {
      const apolloServer = await initializeApolloServer(app, httpServer);
      logger.info('✓ Apollo Server inicializado com sucesso');
    } catch (error) {
      logger.error({ err: error }, 'Erro ao inicializar Apollo Server');
      // Continue com o servidor mesmo se GraphQL falhar
    }

    // Inicializar WebSocket
    await webSocketManager.initialize(httpServer);

    // Inicializar recursos em tempo real
    initializeRealtimeFeatures();

    const server = httpServer.listen(config.port, () => {
      logger.info(
        `
╔══════════════════════════════════════════════╗
║  Legal Automation Tool - eProc & Projudi     ║
║  Servidor iniciado: http://localhost:${config.port}    ║
║  Ambiente: ${config.node_env.toUpperCase()}              ║
║  WebSocket: ws://localhost:${config.port}               ║
╚══════════════════════════════════════════════╝
      `,
      );

      logger.info(`🔐 Auth: http://localhost:${config.port}/api/v1/auth/login`);
      logger.info(`💚 Health check: http://localhost:${config.port}/health`);
      logger.info(`📡 WebSocket: ws://localhost:${config.port}?userId=USER_ID&token=TOKEN`);
      logger.info(`📊 GraphQL IDE: http://localhost:${config.port}/graphql`);
      logger.info(`📖 GraphQL Docs: http://localhost:${config.port}/graphql/docs/queries`);
      logger.info(`🔍 Advanced Search: http://localhost:${config.port}/api/v1/search`);
      logger.info(`💾 Cache Management: http://localhost:${config.port}/api/v1/cache`);
      logger.info(`🔑 API Keys: http://localhost:${config.port}/api/v1/apikeys`);
      logger.info(`📋 Audit Logs: http://localhost:${config.port}/api/v1/audit-logs`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM recebido, encerrando gracefully...');
      webSocketManager.shutdown();
      server.close(async () => {
        await closeDatabase();
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT recebido, encerrando gracefully...');
      webSocketManager.shutdown();
      server.close(async () => {
        await closeDatabase();
        process.exit(0);
      });
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao iniciar servidor');
    process.exit(1);
  }
}

startServer();

export default app;
