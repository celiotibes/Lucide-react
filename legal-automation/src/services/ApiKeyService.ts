/**
 * API Key Service
 * Gerenciamento de chaves de API com segurança
 */

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { redisCacheService } from './RedisCacheService';
import { logger } from '@utils/logger';

export interface ApiKey {
  id: string;
  name: string;
  keyHash: string;
  scopes: string[];
  rateLimitPerHour: number;
  isActive: boolean;
  lastUsedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  createdBy: string;
  metadata?: Record<string, any>;
}

class ApiKeyService {
  private readonly KEY_PREFIX = 'api_key';
  private readonly HASH_ALGORITHM = 'sha256';

  /**
   * Gera nova chave de API
   */
  async generateApiKey(
    name: string,
    scopes: string[] = ['read'],
    rateLimitPerHour: number = 100,
    expiresInDays?: number,
  ): Promise<{ key: string; keyInfo: ApiKey }> {
    try {
      const id = `key_${uuidv4()}`;
      const rawKey = `${id}_${crypto.randomBytes(32).toString('hex')}`;
      const keyHash = this.hashKey(rawKey);

      const expiresAt = expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : undefined;

      const keyInfo: ApiKey = {
        id,
        name,
        keyHash,
        scopes,
        rateLimitPerHour,
        isActive: true,
        createdAt: new Date(),
        createdBy: 'system',
        expiresAt,
      };

      await redisCacheService.set(id, keyInfo, {
        ttl: 31536000, // 1 ano
        namespace: this.KEY_PREFIX,
      });

      logger.info({ keyId: id, name, scopes }, 'API key gerada');

      return { key: rawKey, keyInfo };
    } catch (error) {
      logger.error({ error }, 'Erro ao gerar API key');
      throw error;
    }
  }

  /**
   * Valida chave de API
   */
  async validateApiKey(rawKey: string): Promise<ApiKey | null> {
    try {
      const keyHash = this.hashKey(rawKey);
      const keyId = this.extractKeyId(rawKey);

      const keyInfo = await redisCacheService.get<ApiKey>(
        keyId,
        this.KEY_PREFIX,
      );

      if (!keyInfo) {
        logger.warn({ keyId }, 'Chave de API não encontrada');
        return null;
      }

      if (!keyInfo.isActive) {
        logger.warn({ keyId }, 'Chave de API desativada');
        return null;
      }

      if (keyInfo.expiresAt && new Date() > keyInfo.expiresAt) {
        logger.warn({ keyId }, 'Chave de API expirada');
        await this.revokeApiKey(keyId);
        return null;
      }

      if (keyInfo.keyHash !== keyHash) {
        logger.error({ keyId }, 'Hash de chave não corresponde');
        return null;
      }

      // Atualiza lastUsedAt
      keyInfo.lastUsedAt = new Date();
      await redisCacheService.set(keyId, keyInfo, {
        ttl: 31536000,
        namespace: this.KEY_PREFIX,
      });

      return keyInfo;
    } catch (error) {
      logger.error({ error }, 'Erro ao validar API key');
      return null;
    }
  }

  /**
   * Verifica se chave tem escopo específico
   */
  async hasScope(rawKey: string, scope: string): Promise<boolean> {
    try {
      const keyInfo = await this.validateApiKey(rawKey);
      return keyInfo?.scopes.includes(scope) || false;
    } catch (error) {
      logger.error({ error }, 'Erro ao verificar escopo');
      return false;
    }
  }

  /**
   * Obtém informações da chave
   */
  async getKeyInfo(keyId: string): Promise<ApiKey | null> {
    try {
      return await redisCacheService.get<ApiKey>(keyId, this.KEY_PREFIX);
    } catch (error) {
      logger.error({ error, keyId }, 'Erro ao obter informações da chave');
      return null;
    }
  }

  /**
   * Revoga chave de API
   */
  async revokeApiKey(keyId: string): Promise<void> {
    try {
      await redisCacheService.delete(keyId, this.KEY_PREFIX);
      logger.info({ keyId }, 'API key revogada');
    } catch (error) {
      logger.error({ error, keyId }, 'Erro ao revogar API key');
    }
  }

  /**
   * Atualiza scopes
   */
  async updateScopes(keyId: string, scopes: string[]): Promise<void> {
    try {
      const keyInfo = await this.getKeyInfo(keyId);
      if (!keyInfo) {
        throw new Error('Chave não encontrada');
      }

      keyInfo.scopes = scopes;
      await redisCacheService.set(keyId, keyInfo, {
        ttl: 31536000,
        namespace: this.KEY_PREFIX,
      });

      logger.info({ keyId, scopes }, 'Scopes atualizados');
    } catch (error) {
      logger.error({ error, keyId }, 'Erro ao atualizar scopes');
    }
  }

  /**
   * Verifica rate limit
   */
  async checkRateLimit(keyId: string): Promise<boolean> {
    try {
      const keyInfo = await this.getKeyInfo(keyId);
      if (!keyInfo) return false;

      const limitKey = `rate_limit:${keyId}:${this.getHourKey()}`;
      const usage = (await redisCacheService.get<number>(limitKey, 'rate_limit')) || 0;

      if (usage >= keyInfo.rateLimitPerHour) {
        logger.warn({ keyId, usage }, 'Rate limit excedido');
        return false;
      }

      await redisCacheService.increment(limitKey, 1, 'rate_limit');
      await redisCacheService.expire(limitKey, 3600, 'rate_limit');

      return true;
    } catch (error) {
      logger.error({ error, keyId }, 'Erro ao verificar rate limit');
      return false;
    }
  }

  /**
   * Hash de chave
   */
  private hashKey(key: string): string {
    return crypto
      .createHash(this.HASH_ALGORITHM)
      .update(key)
      .digest('hex');
  }

  /**
   * Extrai ID da chave
   */
  private extractKeyId(key: string): string {
    const parts = key.split('_');
    return `${parts[0]}_${parts[1]}`;
  }

  /**
   * Obtém chave de hora para rate limiting
   */
  private getHourKey(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`;
  }
}

export const apiKeyService = new ApiKeyService();
