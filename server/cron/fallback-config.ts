/**
 * Fallback Configuration for Cron Failures
 *
 * When Vercel crons fail or n8n workflows are unavailable,
 * this module provides strategies to recover and continue operation.
 *
 * Status: PRECONDITION FOR PRODUCTION
 */

export interface FallbackStrategy {
  /** Which service to use when primary fails */
  primaryService: 'vercel' | 'n8n' | 'local';
  /** Fallback service if primary is unavailable */
  fallbackService: 'n8n' | 'local' | null;
  /** Max retries before giving up */
  maxRetries: number;
  /** Delay between retries in seconds */
  retryDelay: number;
  /** Timeout for each attempt in seconds */
  timeout: number;
  /** Should we log to Sentry on failure */
  logToSentry: boolean;
}

/**
 * Cron Job Failover Strategies
 */
export const CRON_FAILOVER_STRATEGIES: Record<string, FallbackStrategy> = {
  'gerar-fatura-mensal': {
    primaryService: 'vercel',
    fallbackService: 'n8n',
    maxRetries: 3,
    retryDelay: 60, // 1 minute
    timeout: 300, // 5 minutes
    logToSentry: true,
  },
  'notificar-vencimentos': {
    primaryService: 'vercel',
    fallbackService: 'n8n',
    maxRetries: 2,
    retryDelay: 30,
    timeout: 120, // 2 minutes
    logToSentry: true,
  },
  'emitir-cobrancas': {
    primaryService: 'vercel',
    fallbackService: 'n8n',
    maxRetries: 3,
    retryDelay: 60,
    timeout: 300,
    logToSentry: true,
  },
  'distribuir-recebimentos': {
    primaryService: 'vercel',
    fallbackService: 'n8n',
    maxRetries: 3,
    retryDelay: 120, // 2 minutes
    timeout: 600, // 10 minutes
    logToSentry: true,
  },
  'regua-cobranca': {
    primaryService: 'vercel',
    fallbackService: 'n8n',
    maxRetries: 2,
    retryDelay: 60,
    timeout: 300,
    logToSentry: true,
  },
};

/**
 * N8N Configuration for Failover
 *
 * SETUP INSTRUCTIONS:
 *
 * 1. Create n8n workflows that mirror each cron job
 * 2. Deploy n8n instance (self-hosted or cloud)
 * 3. Configure webhook URLs that point to local handler
 * 4. Set environment variables:
 *
 *    N8N_WEBHOOK_URL=https://your-n8n-instance/webhook/cron-fallback
 *    N8N_API_KEY=your-n8n-api-key
 *    N8N_TIMEOUT=300
 */
export const N8N_CONFIG = {
  /** Base URL for n8n webhooks */
  baseUrl: process.env.N8N_WEBHOOK_URL || 'https://n8n.example.com/webhook/cron-fallback',

  /** n8n API key for direct workflow triggers */
  apiKey: process.env.N8N_API_KEY || '',

  /** Timeout for n8n requests (seconds) */
  timeout: parseInt(process.env.N8N_TIMEOUT || '300', 10),

  /** Enable n8n failover */
  enabled: !!process.env.N8N_API_KEY,
};

/**
 * Vercel Configuration for Fallback Awareness
 *
 * SETUP INSTRUCTIONS:
 *
 * 1. Vercel crons are configured in vercel.json
 * 2. Each cron endpoint handles its own retry logic
 * 3. Failed crons should log to Sentry with strategy info
 * 4. Use getCronStrategy() to determine what to do on failure
 *
 * VERCEL STATUS CHECK:
 * - Monitor: https://vercel.com/docs/crons
 * - Logs: Vercel Dashboard > Deployments > Cron Logs
 */
export const VERCEL_CONFIG = {
  /** Vercel cron monitoring endpoint */
  statusUrl: 'https://vercel.com/api/v1/crons',

  /** When to consider a cron failed (retries exceeded) */
  failureThreshold: 3,

  /** Notify ops team on repeated failures */
  notifyOpsOn: 'vercel-cron-failure-4-hours',
};

/**
 * Local Fallback Handler
 *
 * When both Vercel and n8n fail, trigger local processing.
 * This is emergency mode - logs all activity for manual review.
 */
export const LOCAL_HANDLER_CONFIG = {
  /** Queue directory for failed jobs */
  queueDir: process.env.CRON_QUEUE_DIR || './logs/cron-queue',

  /** Max jobs to queue before alerting */
  maxQueueSize: 100,

  /** Process queued jobs every X seconds */
  processInterval: 3600, // 1 hour

  /** Manual processing endpoint auth token */
  manualTriggerToken: process.env.CRON_MANUAL_TRIGGER_TOKEN || '',
};

/**
 * Get the fallback strategy for a cron job
 */
export function getCronStrategy(cronName: string): FallbackStrategy {
  return (
    CRON_FAILOVER_STRATEGIES[cronName] || {
      primaryService: 'vercel',
      fallbackService: 'n8n',
      maxRetries: 2,
      retryDelay: 60,
      timeout: 300,
      logToSentry: true,
    }
  );
}

/**
 * Determine which service to use based on availability
 */
export async function selectActiveService(
  strategy: FallbackStrategy
): Promise<'vercel' | 'n8n' | 'local'> {
  // In production, check actual service health
  // For now, return primary (Vercel is always running)

  // TODO: Implement health checks
  // - Vercel: Check API status
  // - n8n: Check webhook availability
  // - Local: Check queue status

  return strategy.primaryService;
}

/**
 * Retry handler with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  strategy: FallbackStrategy,
  attemptNumber: number = 1
): Promise<T> {
  try {
    return await Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Timeout')),
          strategy.timeout * 1000
        )
      ),
    ]);
  } catch (error) {
    if (attemptNumber < strategy.maxRetries) {
      const delay = strategy.retryDelay * Math.pow(2, attemptNumber - 1);
      console.log(
        `Retry ${attemptNumber}/${strategy.maxRetries} in ${delay}s...`,
        error
      );
      await new Promise(resolve => setTimeout(resolve, delay * 1000));
      return retryWithBackoff(fn, strategy, attemptNumber + 1);
    }
    throw error;
  }
}

/**
 * Alert operations team on critical failures
 */
export async function alertOpsTeam(
  cronName: string,
  error: Error,
  strategy: FallbackStrategy
): Promise<void> {
  const message = `CRON FAILURE: ${cronName} - ${error.message}`;

  console.error(message);

  if (strategy.logToSentry) {
    // TODO: Log to Sentry with context
    // captureException(error, {
    //   tags: { cron: cronName, service: 'fallback' },
    //   extra: { strategy },
    // });
  }

  // TODO: Send alert to ops channel (Slack/Discord)
  // await notifyOpsChannel(message);

  // TODO: Create PagerDuty incident if critical
  // if (CRITICAL_CRONS.includes(cronName)) {
  //   await createPagerDutyIncident(message);
  // }
}

/** Critical crons that should trigger PagerDuty on failure */
export const CRITICAL_CRONS = [
  'gerar-fatura-mensal',
  'emitir-cobrancas',
  'distribuir-recebimentos',
  'regua-cobranca',
];

/**
 * Export default configuration
 */
export const defaultFallbackConfig = {
  N8N_CONFIG,
  VERCEL_CONFIG,
  LOCAL_HANDLER_CONFIG,
  CRON_FAILOVER_STRATEGIES,
};
