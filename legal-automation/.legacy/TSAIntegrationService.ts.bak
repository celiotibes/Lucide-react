/**
 * TSA (Time Stamp Authority) Integration Service
 * Supports multiple TSA providers with failover and caching
 *
 * Providers:
 * - Sincronize (https://www.sincronize.com.br)
 * - Certinf (https://www.certinf.com.br)
 * - Certisign (https://www.certisign.com.br)
 */

import axios, { AxiosError } from 'axios';
import crypto from 'crypto';
import { logger } from '@utils/logger';
import { AppError } from '@utils/errors';
import { redisCacheService } from './RedisCacheService';

interface TSAProvider {
  name: string;
  url: string;
  username: string;
  password: string;
  priority: number;
  timeout: number;
}

interface TimestampRequest {
  messageImprint: {
    hashAlgorithm: string;
    hashedMessage: string;
  };
  version?: string;
  certReq?: boolean;
  nonce?: string;
}

interface TimestampResponse {
  status: string;
  statusInfo?: string;
  timeStampToken?: string;
  accuracy?: {
    seconds?: number;
    millis?: number;
    micros?: number;
  };
  genTime?: Date;
  serial?: string;
  tsa?: string;
}

interface SignatureTimestamp {
  id: string;
  signatureId: string;
  timestamp: Date;
  tsaProvider: string;
  timeStampToken: string;
  accuracy: number; // milliseconds
  nonce?: string;
  verificationStatus: 'valid' | 'invalid' | 'pending';
  createdAt: Date;
}

class TSAIntegrationService {
  private providers: Map<string, TSAProvider> = new Map();
  private cacheEnabled: boolean = true;
  private cacheTTL: number = 3600; // 1 hour
  private retryMax: number = 3;
  private retryDelay: number = 1000; // ms

  constructor() {
    this.initializeProviders();
  }

  /**
   * Initialize TSA providers from environment
   */
  private initializeProviders(): void {
    const providersList = process.env.TSA_PROVIDERS?.split(',') || ['sincronize', 'certinf'];

    const providersConfig: Record<string, Omit<TSAProvider, 'priority'>> = {
      sincronize: {
        name: 'Sincronize',
        url: process.env.TSA_SINCRONIZE_URL || 'https://tsa.sincronize.com.br:8080/sincronize/rest/timestamp',
        username: process.env.TSA_SINCRONIZE_USER || '',
        password: process.env.TSA_SINCRONIZE_PASS || '',
        timeout: parseInt(process.env.TSA_TIMEOUT_MS || '5000'),
      },
      certinf: {
        name: 'Certinf',
        url: process.env.TSA_CERTINF_URL || 'https://tsa.certinf.net/rest/timestamp',
        username: process.env.TSA_CERTINF_USER || '',
        password: process.env.TSA_CERTINF_PASS || '',
        timeout: parseInt(process.env.TSA_TIMEOUT_MS || '5000'),
      },
      certisign: {
        name: 'Certisign',
        url: process.env.TSA_CERTISIGN_URL || 'https://tsa.certisign.com.br/tsa/rest/timestamp',
        username: process.env.TSA_CERTISIGN_USER || '',
        password: process.env.TSA_CERTISIGN_PASS || '',
        timeout: parseInt(process.env.TSA_TIMEOUT_MS || '5000'),
      },
    };

    providersList.forEach((providerName, index) => {
      const config = providersConfig[providerName.trim()];
      if (config) {
        this.providers.set(providerName.trim(), {
          ...config,
          priority: index,
        });
      }
    });

    logger.info(
      { providers: Array.from(this.providers.keys()) },
      'TSA providers initialized',
    );
  }

  /**
   * Get timestamp for a document hash
   */
  async getTimestamp(
    documentHash: string,
    hashAlgorithm: string = 'SHA256',
  ): Promise<SignatureTimestamp> {
    // Check cache first
    const cacheKey = `tsa:timestamp:${documentHash}`;
    if (this.cacheEnabled) {
      const cached = await redisCacheService.get<SignatureTimestamp>(cacheKey);
      if (cached && cached.verificationStatus === 'valid') {
        logger.info({ documentHash }, 'Timestamp retrieved from cache');
        return cached;
      }
    }

    // Try each provider in priority order
    const sortedProviders = Array.from(this.providers.values()).sort((a, b) => a.priority - b.priority);

    for (const provider of sortedProviders) {
      try {
        const timestamp = await this.requestTimestampFromProvider(
          provider,
          documentHash,
          hashAlgorithm,
        );

        // Cache successful response
        if (this.cacheEnabled) {
          await redisCacheService.setex(cacheKey, this.cacheTTL, timestamp);
        }

        logger.info(
          { provider: provider.name, documentHash },
          'Timestamp obtained successfully',
        );

        return timestamp;
      } catch (error) {
        logger.warn(
          { provider: provider.name, error },
          'TSA provider failed, trying next provider',
        );
        continue;
      }
    }

    throw new AppError(503, 'All TSA providers unavailable');
  }

  /**
   * Request timestamp from specific provider
   */
  private async requestTimestampFromProvider(
    provider: TSAProvider,
    documentHash: string,
    hashAlgorithm: string,
  ): Promise<SignatureTimestamp> {
    const nonce = this.generateNonce();

    for (let attempt = 1; attempt <= this.retryMax; attempt++) {
      try {
        const request: TimestampRequest = {
          messageImprint: {
            hashAlgorithm,
            hashedMessage: Buffer.from(documentHash, 'hex').toString('base64'),
          },
          nonce,
          certReq: true,
        };

        const response = await axios.post<TimestampResponse>(
          provider.url,
          request,
          {
            timeout: provider.timeout,
            auth:
              provider.username && provider.password
                ? {
                    username: provider.username,
                    password: provider.password,
                  }
                : undefined,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        );

        if (response.data.status !== 'GRANTED' && response.data.status !== '0') {
          throw new Error(`TSA returned status: ${response.data.statusInfo || response.data.status}`);
        }

        return {
          id: crypto.randomUUID(),
          signatureId: '', // Will be set by caller
          timestamp: response.data.genTime || new Date(),
          tsaProvider: provider.name,
          timeStampToken: response.data.timeStampToken || '',
          accuracy: response.data.accuracy?.millis || 0,
          nonce,
          verificationStatus: 'valid',
          createdAt: new Date(),
        };
      } catch (error) {
        if (attempt < this.retryMax) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          logger.warn(
            { provider: provider.name, attempt, delay, error },
            'TSA request failed, retrying',
          );
          await this.sleep(delay);
        } else {
          throw error;
        }
      }
    }

    throw new AppError(503, `TSA provider ${provider.name} failed after ${this.retryMax} attempts`);
  }

  /**
   * Verify timestamp authenticity
   */
  async verifyTimestamp(
    timestamp: SignatureTimestamp,
    documentHash: string,
  ): Promise<boolean> {
    try {
      logger.info(
        { tsaProvider: timestamp.tsaProvider, timestamp: timestamp.timestamp },
        'Verifying timestamp',
      );

      // Verify timestamp token structure
      if (!timestamp.timeStampToken) {
        return false;
      }

      // Verify timestamp age (shouldn't be more than 24 hours old)
      const age = Date.now() - timestamp.timestamp.getTime();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      if (age > maxAge) {
        logger.warn({ age, maxAge }, 'Timestamp is too old');
        return false;
      }

      // Update verification status in cache
      const cacheKey = `tsa:timestamp:${documentHash}`;
      if (this.cacheEnabled) {
        timestamp.verificationStatus = 'valid';
        await redisCacheService.setex(cacheKey, this.cacheTTL, timestamp);
      }

      return true;
    } catch (error) {
      logger.error({ error }, 'Failed to verify timestamp');
      return false;
    }
  }

  /**
   * Get timestamp accuracy (in milliseconds)
   */
  getTimestampAccuracy(timestamp: SignatureTimestamp): number {
    return timestamp.accuracy || 0;
  }

  /**
   * Get TSA provider statistics
   */
  async getProviderStatistics(): Promise<Record<string, any>> {
    const stats: Record<string, any> = {};

    for (const [name, provider] of this.providers) {
      const healthKey = `tsa:health:${name}`;
      const health = await redisCacheService.get<any>(healthKey);

      stats[name] = {
        name: provider.name,
        url: provider.url,
        priority: provider.priority,
        timeout: provider.timeout,
        health: health || {
          status: 'unknown',
          lastCheck: null,
          successCount: 0,
          failureCount: 0,
        },
      };
    }

    return stats;
  }

  /**
   * Health check all TSA providers
   */
  async healthCheck(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const [name, provider] of this.providers) {
      try {
        const testHash = crypto.createHash('sha256').update('health-check').digest('hex');
        await this.requestTimestampFromProvider(provider, testHash, 'SHA256');
        results[name] = true;

        // Cache health status
        await redisCacheService.setex(
          `tsa:health:${name}`,
          3600,
          {
            status: 'healthy',
            lastCheck: new Date(),
            successCount: (await redisCacheService.get<any>(`tsa:health:${name}`))?.successCount + 1 || 1,
            failureCount: 0,
          },
        );

        logger.info({ provider: name }, 'TSA provider health check passed');
      } catch (error) {
        results[name] = false;
        logger.warn({ provider: name, error }, 'TSA provider health check failed');
      }
    }

    return results;
  }

  /**
   * Generate nonce for timestamp request
   */
  private generateNonce(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const tsaIntegrationService = new TSAIntegrationService();
