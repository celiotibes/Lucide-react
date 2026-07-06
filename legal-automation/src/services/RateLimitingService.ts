import { logger } from '@utils/logger';

export interface QuotaConfig {
  requestsPerDay: number;
  requestsPerHour: number;
  requestsPerMinute: number;
  tasksPerDay: {
    generate?: number;
    analyze?: number;
    extract?: number;
    classify?: number;
  };
}

export interface UserQuota {
  userId: string;
  dailyRequests: number;
  hourlyRequests: number;
  minuteRequests: number;
  taskQuotas: Record<string, number>;
  resetAt: Date;
  hourResetAt: Date;
  minuteResetAt: Date;
  isActive: boolean;
  tier: 'free' | 'standard' | 'premium';
}

export interface RateLimitStatus {
  allowed: boolean;
  remaining: {
    daily: number;
    hourly: number;
    minutely: number;
    forTask: number;
  };
  resetAt: {
    daily: Date;
    hourly: Date;
    minutely: Date;
  };
  retryAfter?: number;
}

interface TokenBucket {
  tokens: number;
  lastRefillAt: number;
  capacity: number;
  refillRate: number; // tokens per ms
}

// ============================================================================
// SERVIÇO DE RATE LIMITING
// ============================================================================
export class RateLimitingService {
  private userQuotas: Map<string, UserQuota> = new Map();
  private tokenBuckets: Map<string, TokenBucket> = new Map();

  private readonly defaultConfigs: Record<string, QuotaConfig> = {
    free: {
      requestsPerDay: 100,
      requestsPerHour: 20,
      requestsPerMinute: 5,
      tasksPerDay: {
        generate: 20,
        analyze: 50,
        extract: 30,
        classify: 50,
      },
    },
    standard: {
      requestsPerDay: 500,
      requestsPerHour: 100,
      requestsPerMinute: 20,
      tasksPerDay: {
        generate: 100,
        analyze: 200,
        extract: 150,
        classify: 200,
      },
    },
    premium: {
      requestsPerDay: 5000,
      requestsPerHour: 500,
      requestsPerMinute: 100,
      tasksPerDay: {
        generate: 1000,
        analyze: 2000,
        extract: 1500,
        classify: 2000,
      },
    },
  };

  /**
   * Check if request is allowed and consume quota
   */
  checkAndConsume(
    userId: string,
    taskType: string = 'analyze',
    tier: 'free' | 'standard' | 'premium' = 'standard'
  ): RateLimitStatus {
    // Initialize quota if needed
    if (!this.userQuotas.has(userId)) {
      this.initializeQuota(userId, tier);
    }

    const quota = this.userQuotas.get(userId)!;
    const config = this.defaultConfigs[tier];
    const now = new Date();

    // Check if user is active
    if (!quota.isActive) {
      return {
        allowed: false,
        remaining: { daily: 0, hourly: 0, minutely: 0, forTask: 0 },
        resetAt: { daily: quota.resetAt, hourly: quota.hourResetAt, minutely: quota.minuteResetAt },
        retryAfter: Math.ceil((quota.resetAt.getTime() - now.getTime()) / 1000),
      };
    }

    // Reset if needed
    this.resetIfExpired(userId, quota, now);

    // Check daily quota
    if (quota.dailyRequests >= config.requestsPerDay) {
      return {
        allowed: false,
        remaining: { daily: 0, hourly: quota.hourlyRequests, minutely: quota.minuteRequests, forTask: 0 },
        resetAt: { daily: quota.resetAt, hourly: quota.hourResetAt, minutely: quota.minuteResetAt },
        retryAfter: Math.ceil((quota.resetAt.getTime() - now.getTime()) / 1000),
      };
    }

    // Check hourly quota
    if (quota.hourlyRequests >= config.requestsPerHour) {
      return {
        allowed: false,
        remaining: {
          daily: config.requestsPerDay - quota.dailyRequests,
          hourly: 0,
          minutely: quota.minuteRequests,
          forTask: 0,
        },
        resetAt: { daily: quota.resetAt, hourly: quota.hourResetAt, minutely: quota.minuteResetAt },
        retryAfter: Math.ceil((quota.hourResetAt.getTime() - now.getTime()) / 1000),
      };
    }

    // Check minute quota
    if (quota.minuteRequests >= config.requestsPerMinute) {
      return {
        allowed: false,
        remaining: {
          daily: config.requestsPerDay - quota.dailyRequests,
          hourly: config.requestsPerHour - quota.hourlyRequests,
          minutely: 0,
          forTask: 0,
        },
        resetAt: { daily: quota.resetAt, hourly: quota.hourResetAt, minutely: quota.minuteResetAt },
        retryAfter: Math.ceil((quota.minuteResetAt.getTime() - now.getTime()) / 1000),
      };
    }

    // Check task-specific quota
    const taskQuota = quota.taskQuotas[taskType] || 0;
    const taskLimit = config.tasksPerDay[taskType as keyof typeof config.tasksPerDay] || config.requestsPerDay;

    if (taskQuota >= taskLimit) {
      return {
        allowed: false,
        remaining: {
          daily: config.requestsPerDay - quota.dailyRequests,
          hourly: config.requestsPerHour - quota.hourlyRequests,
          minutely: config.requestsPerMinute - quota.minuteRequests,
          forTask: 0,
        },
        resetAt: { daily: quota.resetAt, hourly: quota.hourResetAt, minutely: quota.minuteResetAt },
        retryAfter: Math.ceil((quota.resetAt.getTime() - now.getTime()) / 1000),
      };
    }

    // Consume quota
    quota.dailyRequests++;
    quota.hourlyRequests++;
    quota.minuteRequests++;
    quota.taskQuotas[taskType] = (quota.taskQuotas[taskType] || 0) + 1;

    return {
      allowed: true,
      remaining: {
        daily: config.requestsPerDay - quota.dailyRequests,
        hourly: config.requestsPerHour - quota.hourlyRequests,
        minutely: config.requestsPerMinute - quota.minuteRequests,
        forTask: taskLimit - quota.taskQuotas[taskType],
      },
      resetAt: { daily: quota.resetAt, hourly: quota.hourResetAt, minutely: quota.minuteResetAt },
    };
  }

  /**
   * Get user quota status without consuming
   */
  getQuotaStatus(userId: string): UserQuota | null {
    const quota = this.userQuotas.get(userId);
    if (!quota) return null;

    const now = new Date();
    this.resetIfExpired(userId, quota, now);

    return quota;
  }

  /**
   * Reset user quota
   */
  resetQuota(userId: string): boolean {
    const quota = this.userQuotas.get(userId);
    if (!quota) return false;

    const now = new Date();
    quota.dailyRequests = 0;
    quota.hourlyRequests = 0;
    quota.minuteRequests = 0;
    quota.taskQuotas = {};
    quota.resetAt = this.getNextResetTime(now, 'day');
    quota.hourResetAt = this.getNextResetTime(now, 'hour');
    quota.minuteResetAt = this.getNextResetTime(now, 'minute');

    logger.info(`Quota reset for user: ${userId}`);
    return true;
  }

  /**
   * Set user tier
   */
  setUserTier(userId: string, tier: 'free' | 'standard' | 'premium'): boolean {
    let quota = this.userQuotas.get(userId);
    if (!quota) {
      this.initializeQuota(userId, tier);
      return true;
    }

    quota.tier = tier;
    return true;
  }

  /**
   * Deactivate user
   */
  deactivateUser(userId: string): boolean {
    const quota = this.userQuotas.get(userId);
    if (!quota) return false;

    quota.isActive = false;
    logger.info(`User deactivated: ${userId}`);
    return true;
  }

  /**
   * Activate user
   */
  activateUser(userId: string): boolean {
    const quota = this.userQuotas.get(userId);
    if (!quota) return false;

    quota.isActive = true;
    logger.info(`User activated: ${userId}`);
    return true;
  }

  /**
   * Get all users quota status
   */
  getAllQuotaStatus(): UserQuota[] {
    return Array.from(this.userQuotas.values());
  }

  /**
   * Get statistics
   */
  getStatistics() {
    const now = new Date();
    const users = Array.from(this.userQuotas.values());
    const activeUsers = users.filter((u) => u.isActive).length;
    const totalRequests = users.reduce((sum, u) => sum + u.dailyRequests, 0);
    const byTier = {
      free: users.filter((u) => u.tier === 'free').length,
      standard: users.filter((u) => u.tier === 'standard').length,
      premium: users.filter((u) => u.tier === 'premium').length,
    };

    return {
      totalUsers: users.length,
      activeUsers,
      inactiveUsers: users.length - activeUsers,
      totalDailyRequests: totalRequests,
      avgRequestsPerUser: users.length > 0 ? Math.round(totalRequests / users.length) : 0,
      byTier,
      timestamp: now.toISOString(),
    };
  }

  // ========== Private Methods ==========

  private initializeQuota(userId: string, tier: 'free' | 'standard' | 'premium' = 'standard') {
    const now = new Date();
    const quota: UserQuota = {
      userId,
      dailyRequests: 0,
      hourlyRequests: 0,
      minuteRequests: 0,
      taskQuotas: {},
      resetAt: this.getNextResetTime(now, 'day'),
      hourResetAt: this.getNextResetTime(now, 'hour'),
      minuteResetAt: this.getNextResetTime(now, 'minute'),
      isActive: true,
      tier,
    };

    this.userQuotas.set(userId, quota);
    logger.info(`Quota initialized for user: ${userId} (${tier})`);
  }

  private resetIfExpired(userId: string, quota: UserQuota, now: Date) {
    // Reset minute if expired
    if (now >= quota.minuteResetAt) {
      quota.minuteRequests = 0;
      quota.minuteResetAt = this.getNextResetTime(now, 'minute');
    }

    // Reset hour if expired
    if (now >= quota.hourResetAt) {
      quota.hourlyRequests = 0;
      quota.hourResetAt = this.getNextResetTime(now, 'hour');
      quota.minuteRequests = 0;
      quota.minuteResetAt = this.getNextResetTime(now, 'minute');
    }

    // Reset day if expired
    if (now >= quota.resetAt) {
      quota.dailyRequests = 0;
      quota.hourlyRequests = 0;
      quota.minuteRequests = 0;
      quota.taskQuotas = {};
      quota.resetAt = this.getNextResetTime(now, 'day');
      quota.hourResetAt = this.getNextResetTime(now, 'hour');
      quota.minuteResetAt = this.getNextResetTime(now, 'minute');
    }
  }

  private getNextResetTime(date: Date, unit: 'minute' | 'hour' | 'day'): Date {
    const next = new Date(date);

    switch (unit) {
      case 'minute':
        next.setSeconds(0);
        next.setMilliseconds(0);
        next.setMinutes(next.getMinutes() + 1);
        break;

      case 'hour':
        next.setMinutes(0);
        next.setSeconds(0);
        next.setMilliseconds(0);
        next.setHours(next.getHours() + 1);
        break;

      case 'day':
        next.setHours(0);
        next.setMinutes(0);
        next.setSeconds(0);
        next.setMilliseconds(0);
        next.setDate(next.getDate() + 1);
        break;
    }

    return next;
  }
}

export const rateLimitingService = new RateLimitingService();
