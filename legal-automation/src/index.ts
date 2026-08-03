import express, { Express, Request, Response, NextFunction } from 'express';
import 'express-async-errors';
import helmet from 'helmet';
import cors from 'cors';
import multer from 'multer';
import { createServer } from 'http';
import { config, validateConfig } from '@utils/config';
import { errorHandler, notFoundHandler } from '@middlewares/errorHandler';
import { verifyToken } from '@middlewares/authMiddleware';
import { registerModules } from '@/modules';
import { initDatabase, closeDatabase } from '@/database/connection';

// Validate configuration
validateConfig();

// Initialize Express app
const app: Express = express();
const httpServer = createServer(app);

// Middleware
app.use(helmet());
app.use(cors({
  origin: config.cors_origin,
  credentials: true,
}));

// Request parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.max_file_size,
  },
});

// Health check endpoint (no auth required)
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.node_env,
    uptime: process.uptime(),
  });
});

// Status endpoint (no auth required)
app.get('/status', (req: Request, res: Response) => {
  res.json({
    service: 'Legal Automation API',
    version: '3.0.0',
    status: 'operational',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Initialize and start server
 */
async function startServer() {
  try {
    // Initialize database connection
    console.log('[Server] Initializing database connection...');
    const database = await initDatabase();
    console.log('[Server] ✓ Database connection established');

    // Register all modules (Phase 1, 2, 3)
    const router = express.Router();
    registerModules(router, database);
    app.use('/api', router);

    // Error handling middleware (should be last)
    app.use(notFoundHandler);
    app.use(errorHandler);

    // Start listening
    const port = config.port || 3000;
    httpServer.listen(port, () => {
      console.log(`[Server] ✓ Server running on port ${port}`);
      console.log(`[Server] ✓ Environment: ${config.node_env}`);
      console.log(`[Server] ✓ API Base URL: ${config.api_base_url}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('[Server] SIGTERM signal received: closing HTTP server');
      httpServer.close(async () => {
        console.log('[Server] HTTP server closed');
        await closeDatabase();
        console.log('[Server] Database connection closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      console.log('[Server] SIGINT signal received: closing HTTP server');
      httpServer.close(async () => {
        console.log('[Server] HTTP server closed');
        await closeDatabase();
        console.log('[Server] Database connection closed');
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('[Server] ✗ Failed to start server:', error);
    process.exit(1);
  }
}

// Start server
startServer();

export default app;
