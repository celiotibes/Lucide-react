import express, { Express, Request, Response, NextFunction } from 'express';
import 'express-async-errors';
import helmet from 'helmet';
import cors from 'cors';
import multer from 'multer';
import { logger, httpLogger } from '@utils/logger';
import { config, validateConfig } from '@utils/config';
import { AppError, handleError } from '@utils/errors';
import { projudiSoapClient } from '@projudi/soapClient';
import { initDatabase, closeDatabase } from '@/database/connection';

// Controllers
import authController from '@/api/controllers/authController';
import petitionController from '@/api/controllers/petitionController';
import processController from '@/api/controllers/processController';
import aiController from '@/api/controllers/aiController';

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

// Middleware de autenticação (básico)
function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    (req as any).user = { id: 'test-user-id' }; // Implementar verificação real
  }
  next();
}

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
app.use('/api/v1/petitions', authMiddleware, petitionController);
app.use('/api/v1/processes', authMiddleware, processController);
app.use('/api/v1/ai', authMiddleware, aiController);

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

    const server = app.listen(config.port, () => {
      logger.info(
        `
╔══════════════════════════════════════════════╗
║  Legal Automation Tool - eProc & Projudi     ║
║  Servidor iniciado: http://localhost:${config.port}    ║
║  Ambiente: ${config.node_env.toUpperCase()}              ║
╚══════════════════════════════════════════════╝
      `,
      );

      logger.info(`🔐 Auth: http://localhost:${config.port}/api/v1/auth/login`);
      logger.info(`💚 Health check: http://localhost:${config.port}/health`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM recebido, encerrando gracefully...');
      server.close(async () => {
        await closeDatabase();
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT recebido, encerrando gracefully...');
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
