import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '@utils/logger';
import { healthCheckService } from '@services/HealthCheckService';

const router = Router();

/**
 * GET /health - Simple health check (liveness probe)
 */
router.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * GET /health/ready - Readiness probe (detailed checks)
 */
router.get('/ready', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await healthCheckService.runChecks();

    const statusCode = status.status === 'healthy' ? 200 : status.status === 'degraded' ? 503 : 503;

    res.status(statusCode).json(status);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /health/live - Liveness probe (quick check)
 */
router.get('/live', (req: Request, res: Response) => {
  const status = healthCheckService.getStatus();

  res.status(status.status === 'healthy' ? 200 : 503).json({
    status: status.status,
    timestamp: new Date().toISOString(),
    uptime: status.uptime,
  });
});

/**
 * GET /health/check/:name - Specific check
 */
router.get('/check/:name', (req: Request, res: Response) => {
  const { name } = req.params;
  const result = healthCheckService.getCheckResult(name);

  if (!result) {
    return res.status(404).json({
      statusCode: 404,
      message: `Health check '${name}' not found`,
    });
  }

  res.json({
    statusCode: 200,
    data: result,
  });
});

/**
 * GET /health/metrics - Prometheus-compatible metrics
 */
router.get('/metrics', (req: Request, res: Response) => {
  const status = healthCheckService.getStatus();

  const metrics = `
# HELP service_uptime_seconds Service uptime in seconds
# TYPE service_uptime_seconds gauge
service_uptime_seconds ${status.uptime / 1000}

# HELP service_health_status Service health status (1=healthy, 0.5=degraded, 0=unhealthy)
# TYPE service_health_status gauge
service_health_status ${status.status === 'healthy' ? 1 : status.status === 'degraded' ? 0.5 : 0}

# HELP service_total_checks Total health checks
# TYPE service_total_checks gauge
service_total_checks ${status.metadata.totalChecks}

# HELP service_passing_checks Passing health checks
# TYPE service_passing_checks gauge
service_passing_checks ${status.metadata.passingChecks}

# HELP service_failing_checks Failing health checks
# TYPE service_failing_checks gauge
service_failing_checks ${status.metadata.failingChecks}
  `.trim();

  res.setHeader('Content-Type', 'text/plain');
  res.send(metrics);
});

export default router;
