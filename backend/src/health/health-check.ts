/**
 * Health Check Service
 * Monitora saúde dos componentes críticos do sistema
 * Endpoints: /api/health, /api/health/ready, /api/health/live
 */

import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import { redis } from '../cache/redis';
import { Logger } from '../shared/logger';
import { ExternalApis } from '../integrations/external-apis';

interface HealthStatus {
  status: 'ok' | 'degraded' | 'critical';
  timestamp: string;
  uptime: number;
  components: {
    database?: ComponentHealth;
    redis?: ComponentHealth;
    messageQueue?: ComponentHealth;
    externalApis?: ExternalApiHealth;
  };
  version: string;
  environment: string;
}

interface ComponentHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  responseTime: number;
  message?: string;
  lastCheck?: string;
}

interface ExternalApiHealth {
  airbnb?: ApiStatus;
  booking?: ApiStatus;
  vrbo?: ApiStatus;
  gemini?: ApiStatus;
}

interface ApiStatus {
  status: 'ok' | 'error';
  responseTime: number;
  message?: string;
}

const logger = Logger.getLogger('HealthCheck');
const router = Router();

// Cache de health checks (atualizado a cada 10 segundos)
let cachedHealth: HealthStatus | null = null;
let lastHealthCheck = 0;
const CACHE_DURATION = 10000; // 10 segundos

/**
 * GET /api/health
 * Liveness probe - verifica se serviço está UP
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const health = await getHealthStatus();

    const statusCode =
      health.status === 'ok' ? 200 :
      health.status === 'degraded' ? 503 : 503;

    res.status(statusCode).json({
      status: health.status,
      timestamp: health.timestamp,
      uptime: health.uptime,
      version: health.version,
    });
  } catch (error) {
    logger.error('Health check failed', { error });
    res.status(503).json({
      status: 'critical',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
});

/**
 * GET /api/health/ready
 * Readiness probe - verifica se serviço está PRONTO para tráfego
 */
router.get('/health/ready', async (req: Request, res: Response) => {
  try {
    const health = await getHealthStatus();

    // Serviço está ready se database e redis estão healthy
    const isReady =
      health.components.database?.status === 'healthy' &&
      health.components.redis?.status === 'healthy' &&
      health.components.messageQueue?.status !== 'unhealthy';

    if (isReady) {
      res.status(200).json({
        ready: true,
        database: health.components.database?.status,
        redis: health.components.redis?.status,
        messageQueue: health.components.messageQueue?.status,
        timestamp: health.timestamp,
      });
    } else {
      res.status(503).json({
        ready: false,
        database: health.components.database?.status,
        redis: health.components.redis?.status,
        messageQueue: health.components.messageQueue?.status,
        timestamp: health.timestamp,
      });
    }
  } catch (error) {
    logger.error('Readiness check failed', { error });
    res.status(503).json({
      ready: false,
      error: 'Readiness check failed',
    });
  }
});

/**
 * GET /api/health/live
 * Liveness probe detalhado - usado por orquestradores
 */
router.get('/health/live', async (req: Request, res: Response) => {
  try {
    const health = await getHealthStatus();

    // Serviço está live se conseguir responder
    const isLive = health.status !== 'critical';

    if (isLive) {
      res.status(200).json({
        alive: true,
        ...health,
      });
    } else {
      res.status(503).json({
        alive: false,
        ...health,
      });
    }
  } catch (error) {
    logger.error('Liveness check failed', { error });
    res.status(503).json({
      alive: false,
      error: 'Liveness check failed',
    });
  }
});

/**
 * GET /api/health/detailed
 * Health check detalhado com métricas completas
 */
router.get('/health/detailed', async (req: Request, res: Response) => {
  try {
    const health = await getHealthStatus(true);
    res.status(200).json(health);
  } catch (error) {
    logger.error('Detailed health check failed', { error });
    res.status(503).json({
      status: 'critical',
      error: 'Detailed health check failed',
    });
  }
});

/**
 * Função principal de health check
 */
async function getHealthStatus(includeDetails = false): Promise<HealthStatus> {
  const now = Date.now();

  // Retornar cache se recente
  if (cachedHealth && now - lastHealthCheck < CACHE_DURATION) {
    return cachedHealth;
  }

  const startTime = now;
  const uptime = process.uptime();

  // Verificar componentes em paralelo
  const [dbHealth, redisHealth, queueHealth, apisHealth] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkMessageQueue(),
    includeDetails ? checkExternalApis() : Promise.resolve(undefined),
  ]);

  // Determinar status geral
  const criticalIssues = [
    dbHealth.status === 'unhealthy',
    redisHealth.status === 'unhealthy',
    queueHealth.status === 'unhealthy',
  ].filter(Boolean).length;

  let overallStatus: 'ok' | 'degraded' | 'critical' = 'ok';
  if (criticalIssues > 0) {
    overallStatus = 'critical';
  } else if (
    dbHealth.status === 'degraded' ||
    redisHealth.status === 'degraded' ||
    queueHealth.status === 'degraded'
  ) {
    overallStatus = 'degraded';
  }

  const health: HealthStatus = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(uptime),
    version: process.env.APP_VERSION || 'unknown',
    environment: process.env.NODE_ENV || 'unknown',
    components: {
      database: dbHealth,
      redis: redisHealth,
      messageQueue: queueHealth,
      externalApis: apisHealth,
    },
  };

  // Cache result
  cachedHealth = health;
  lastHealthCheck = now;

  const duration = Date.now() - startTime;
  logger.debug('Health check completed', {
    status: health.status,
    duration_ms: duration,
    components_checked: 4,
  });

  return health;
}

/**
 * Verificar saúde do PostgreSQL
 */
async function checkDatabase(): Promise<ComponentHealth> {
  const startTime = Date.now();

  try {
    // Query simples de teste
    const result = await pool.query('SELECT NOW() as timestamp, 1 as test');

    const responseTime = Date.now() - startTime;

    if (responseTime > 500) {
      // Degradado se > 500ms
      return {
        status: 'degraded',
        responseTime,
        message: 'Database responding slowly',
      };
    }

    return {
      status: 'healthy',
      responseTime,
    };
  } catch (error) {
    logger.error('Database health check failed', { error });
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Verificar saúde do Redis
 */
async function checkRedis(): Promise<ComponentHealth> {
  const startTime = Date.now();

  try {
    // Test PING
    const result = await redis.ping();

    const responseTime = Date.now() - startTime;

    if (responseTime > 100) {
      return {
        status: 'degraded',
        responseTime,
        message: 'Redis responding slowly',
      };
    }

    // Verificar memória
    const info = await redis.info('memory');
    const lines = info.split('\r\n');
    const usedMemory = parseInt(
      lines.find(l => l.includes('used_memory:'))?.split(':')[1] || '0'
    );
    const maxMemory = parseInt(
      lines.find(l => l.includes('maxmemory:'))?.split(':')[1] || '0'
    );

    if (maxMemory > 0) {
      const usagePercent = (usedMemory / maxMemory) * 100;
      if (usagePercent > 85) {
        return {
          status: 'degraded',
          responseTime,
          message: `High memory usage: ${usagePercent.toFixed(1)}%`,
        };
      }
    }

    return {
      status: 'healthy',
      responseTime,
    };
  } catch (error) {
    logger.error('Redis health check failed', { error });
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Verificar saúde da fila de mensagens (BullMQ)
 */
async function checkMessageQueue(): Promise<ComponentHealth> {
  const startTime = Date.now();

  try {
    // Verificar conexão com Redis (que BullMQ usa)
    const queues = [
      'sync-listings',
      'update-pricing',
      'lead-management',
    ];

    let queueHealth = 'healthy' as const;
    let largestQueue = 0;

    for (const queueName of queues) {
      try {
        const size = await redis.llen(`bull:${queueName}:wait`);
        if (size > 1000) {
          queueHealth = 'degraded';
        }
        largestQueue = Math.max(largestQueue, size);
      } catch (e) {
        queueHealth = 'unhealthy';
      }
    }

    const responseTime = Date.now() - startTime;

    return {
      status: queueHealth,
      responseTime,
      message: largestQueue > 0 ? `Largest queue size: ${largestQueue}` : undefined,
    };
  } catch (error) {
    logger.error('Message queue health check failed', { error });
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Verificar saúde das APIs externas
 */
async function checkExternalApis(): Promise<ExternalApiHealth> {
  const apis: ExternalApiHealth = {};

  // Airbnb API
  apis.airbnb = await checkExternalApi(
    'airbnb',
    process.env.AIRBNB_API_HEALTH_ENDPOINT || 'https://www.airbnb.com/api/v1/health'
  );

  // Booking API
  apis.booking = await checkExternalApi(
    'booking',
    process.env.BOOKING_API_HEALTH_ENDPOINT || 'https://api.booking.com/health'
  );

  // VRBO API
  apis.vrbo = await checkExternalApi(
    'vrbo',
    process.env.VRBO_API_HEALTH_ENDPOINT || 'https://www.vrbo.com/api/health'
  );

  // Gemini API (Google)
  apis.gemini = await checkExternalApi(
    'gemini',
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent'
  );

  return apis;
}

/**
 * Verificar saúde de uma API externa
 */
async function checkExternalApi(
  name: string,
  url: string
): Promise<ApiStatus> {
  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      timeout: 5000,
    });

    const responseTime = Date.now() - startTime;

    return {
      status: response.ok ? 'ok' : 'error',
      responseTime,
      message: `HTTP ${response.status}`,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.warn(`External API health check failed: ${name}`, { error });

    return {
      status: 'error',
      responseTime,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Reset cache de health check (para testes)
 */
export function resetHealthCache() {
  cachedHealth = null;
  lastHealthCheck = 0;
}

export default router;
