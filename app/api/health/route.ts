/**
 * Health Check Endpoint
 *
 * Used by load balancers and monitoring to verify the application is running.
 * Also provides detailed health information for troubleshooting.
 */

import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';

interface HealthCheck {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  checks: {
    database: {
      status: 'ok' | 'down';
      latency?: number;
      error?: string;
    };
    memory: {
      status: 'ok' | 'high_usage';
      usage_percent: number;
    };
    uptime_seconds: number;
  };
  version?: string;
}

export async function GET(_request: NextRequest): Promise<NextResponse<HealthCheck>> {
  const startTime = Date.now();
  const checks: HealthCheck['checks'] = {
    database: { status: 'ok' },
    memory: { status: 'ok', usage_percent: 0 },
    uptime_seconds: Math.floor(process.uptime()),
  };

  let overallStatus: 'ok' | 'degraded' | 'down' = 'ok';

  // Check Database
  try {
    const pool = obterPool();
    const dbStartTime = Date.now();

    await pool.query('SELECT 1');

    checks.database = {
      status: 'ok',
      latency: Date.now() - dbStartTime,
    };
  } catch (error) {
    checks.database = {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    overallStatus = 'degraded';
  }

  // Check Memory Usage
  try {
    const memUsage = process.memoryUsage();
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    checks.memory = {
      status: heapUsedPercent > 85 ? 'high_usage' : 'ok',
      usage_percent: Math.round(heapUsedPercent * 10) / 10,
    };

    if (heapUsedPercent > 85) {
      overallStatus = 'degraded';
    }
  } catch (error) {
    console.error('Error checking memory:', error);
  }

  const duration = Date.now() - startTime;
  const statusCode = overallStatus === 'ok' ? 200 : 503;

  const response: HealthCheck = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    checks,
    version: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown',
  };

  // Add custom header to indicate response time
  const nextResponse = NextResponse.json(response, { status: statusCode });
  nextResponse.headers.set('X-Response-Time', `${duration}ms`);

  return nextResponse;
}

/**
 * Detailed health check (requires auth)
 * GET /api/health?detailed=true
 */
export async function HEAD(_request: NextRequest): Promise<NextResponse> {
  // HEAD requests are used for quick checks - return 200/503 only
  try {
    const pool = obterPool();
    await pool.query('SELECT 1');
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  } catch {
    return NextResponse.json({ status: 'down' }, { status: 503 });
  }
}
