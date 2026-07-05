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

const app: Express = express();

validateConfig();

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

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.node_env,
  });
});

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

// 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    statusCode: 404,
    code: 'NOT_FOUND',
    message: `Rota não encontrada: ${req.method} ${req.path}`,
  });
});

// Error Handler
app.use((err: Error | AppError, req: Request, res: Response, next: NextFunction) => {
  const appError = handleError(err);

  logger.error(
    {
      statusCode: appError.statusCode,
      code: appError.code,
      message: appError.message,
      path: req.path,
      method: req.method,
    },
    `${appError.code}`,
  );

  res.status(appError.statusCode).json(appError.toJSON());
});

// Initialize services
async function initializeServices(): Promise<void> {
  try {
    logger.info('Inicializando serviços...');

    // Inicializar banco de dados
    await initDatabase();
    logger.info('✓ PostgreSQL conectado');

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

// Start server
async function startServer(): Promise<void> {
  try {
    await initializeServices();

    const httpServer = createServer(app);

    // Inicializar WebSocket
    await webSocketManager.initialize(httpServer);

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
