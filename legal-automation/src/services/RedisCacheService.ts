/**
 * Redis Cache Service
 * Cache distribuído com pub/sub para múltiplas instâncias
 */

import Redis from 'ioredis';
import { logger } from '@utils/logger';
import { config } from '@utils/config';

interface CacheOptions {
  ttl?: number;
  namespace?: string;
}

interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  hitRate: number;
  connections: number;
}

class RedisCacheService {
  private redis: Redis;
  private pubClient: Redis;
  private subClient: Redis;
  private isConnected: boolean = false;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    hitRate: 0,
    connections: 0,
  };
  private subscribers: Map<string, Set<(key: string) => Promise<void>>> = new Map();

  constructor() {
    const redisUrl = config.redis_url || 'redis://localhost:6379';

    this.redis = new Redis(redisUrl, {
      retryStrategy: (times) => Math.min(times * 50, 2000),
      enableReadyCheck: false,
      enableOfflineQueue: true,
    });

    this.pubClient = new Redis(redisUrl, {
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    this.subClient = new Redis(redisUrl, {
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    this.setupErrorHandlers();
  }

  /**
   * Configura manipuladores de erro
   */
  private setupErrorHandlers(): void {
    this.redis.on('connect', () => {
      this.isConnected = true;
      this.stats.connections++;
      logger.info('Redis conectado (cliente principal)');
    });

    this.redis.on('error', (error) => {
      logger.error({ error }, 'Erro Redis (cliente principal)');
      this.isConnected = false;
    });

    this.redis.on('close', () => {
      this.isConnected = false;
    });

    this.pubClient.on('error', (error) => {
      logger.error({ error }, 'Erro Redis (publisher)');
    });

    this.subClient.on('error', (error) => {
      logger.error({ error }, 'Erro Redis (subscriber)');
    });

    this.subClient.on('message', (channel, message) => {
      this.handleInvalidation(channel, message);
    });
  }

  /**
   * Obtém valor do cache
   */
  async get<T>(key: string, namespace: string = 'app'): Promise<T | null> {
    if (!this.isConnected) return null;

    try {
      const fullKey = this.buildKey(key, namespace);
      const value = await this.redis.get(fullKey);

      if (value) {
        this.stats.hits++;
        this.updateHitRate();
        return JSON.parse(value) as T;
      }

      this.stats.misses++;
      this.updateHitRate();
      return null;
    } catch (error) {
      logger.error({ error, key }, 'Erro ao obter do cache');
      return null;
    }
  }

  /**
   * Define valor no cache
   */
  async set<T>(
    key: string,
    value: T,
    options: CacheOptions = {},
  ): Promise<void> {
    if (!this.isConnected) return;

    try {
      const fullKey = this.buildKey(key, options.namespace || 'app');
      const ttl = options.ttl || 3600;

      await this.redis.setex(
        fullKey,
        ttl,
        JSON.stringify(value),
      );

      this.stats.sets++;
      logger.debug({ key, ttl }, 'Valor armazenado em cache');
    } catch (error) {
      logger.error({ error, key }, 'Erro ao armazenar em cache');
    }
  }

  /**
   * Obtém ou define valor no cache
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions = {},
  ): Promise<T> {
    const cached = await this.get<T>(key, options.namespace);
    if (cached) return cached;

    const value = await fetcher();
    await this.set(key, value, options);

    return value;
  }

  /**
   * Deleta chave do cache
   */
  async delete(key: string, namespace: string = 'app'): Promise<void> {
    if (!this.isConnected) return;

    try {
      const fullKey = this.buildKey(key, namespace);
      await this.redis.del(fullKey);
      this.stats.deletes++;

      await this.publishInvalidation(key, namespace);
      logger.debug({ key }, 'Chave deletada do cache');
    } catch (error) {
      logger.error({ error, key }, 'Erro ao deletar do cache');
    }
  }

  /**
   * Deleta múltiplas chaves por padrão
   */
  async invalidatePattern(pattern: string, namespace: string = 'app'): Promise<number> {
    if (!this.isConnected) return 0;

    try {
      const fullPattern = this.buildKey(pattern, namespace);
      const keys = await this.redis.keys(fullPattern);

      if (keys.length === 0) return 0;

      await this.redis.del(...keys);
      this.stats.deletes += keys.length;

      await this.publishInvalidation(pattern, namespace);
      logger.info({ pattern, count: keys.length }, 'Padrão invalidado do cache');
      return keys.length;
    } catch (error) {
      logger.error({ error, pattern }, 'Erro ao invalidar padrão');
      return 0;
    }
  }

  /**
   * Limpa todo o cache
   */
  async flush(namespace: string = 'app'): Promise<void> {
    if (!this.isConnected) return;

    try {
      const pattern = this.buildKey('*', namespace);
      const keys = await this.redis.keys(pattern);

      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.stats.deletes += keys.length;
      }

      logger.info({ count: keys.length }, 'Cache limpo');
    } catch (error) {
      logger.error({ error }, 'Erro ao limpar cache');
    }
  }

  /**
   * Publica invalidação para outras instâncias
   */
  private async publishInvalidation(key: string, namespace: string): Promise<void> {
    try {
      const channel = `cache:invalidate:${namespace}`;
      await this.pubClient.publish(channel, key);
    } catch (error) {
      logger.error({ error }, 'Erro ao publicar invalidação');
    }
  }

  /**
   * Inscreve para invalidações de cache
   */
  subscribe(
    namespace: string,
    handler: (key: string) => Promise<void>,
  ): void {
    if (!this.subscribers.has(namespace)) {
      this.subscribers.set(namespace, new Set());

      const channel = `cache:invalidate:${namespace}`;
      this.subClient.subscribe(channel, (err) => {
        if (err) {
          logger.error({ error: err, channel }, 'Erro ao inscrever');
          return;
        }
        logger.debug({ channel }, 'Inscrito em canal de invalidação');
      });
    }

    this.subscribers.get(namespace)!.add(handler);
  }

  /**
   * Manipula evento de invalidação
   */
  private async handleInvalidation(channel: string, key: string): Promise<void> {
    const match = channel.match(/cache:invalidate:(.+)/);
    if (!match) return;

    const namespace = match[1];
    const handlers = this.subscribers.get(namespace);

    if (handlers) {
      for (const handler of handlers) {
        try {
          await handler(key);
        } catch (error) {
          logger.error({ error, key }, 'Erro ao processar invalidação');
        }
      }
    }
  }

  /**
   * Armazena objeto com múltiplos campos (Hash)
   */
  async hset(
    key: string,
    data: Record<string, any>,
    namespace: string = 'app',
  ): Promise<void> {
    if (!this.isConnected) return;

    try {
      const fullKey = this.buildKey(key, namespace);
      const fields: any[] = [];

      for (const [k, v] of Object.entries(data)) {
        fields.push(k);
        fields.push(typeof v === 'string' ? v : JSON.stringify(v));
      }

      await this.redis.hset(fullKey, ...fields);
      this.stats.sets++;

      logger.debug({ key }, 'Hash armazenado em cache');
    } catch (error) {
      logger.error({ error, key }, 'Erro ao armazenar hash');
    }
  }

  /**
   * Obtém objeto com múltiplos campos (Hash)
   */
  async hget(key: string, namespace: string = 'app'): Promise<Record<string, any> | null> {
    if (!this.isConnected) return null;

    try {
      const fullKey = this.buildKey(key, namespace);
      const data = await this.redis.hgetall(fullKey);

      if (Object.keys(data).length === 0) {
        this.stats.misses++;
        this.updateHitRate();
        return null;
      }

      this.stats.hits++;
      this.updateHitRate();

      const parsed: Record<string, any> = {};
      for (const [k, v] of Object.entries(data)) {
        try {
          parsed[k] = JSON.parse(v);
        } catch {
          parsed[k] = v;
        }
      }

      return parsed;
    } catch (error) {
      logger.error({ error, key }, 'Erro ao obter hash');
      return null;
    }
  }

  /**
   * Incrementa contador
   */
  async increment(key: string, value: number = 1, namespace: string = 'app'): Promise<number> {
    if (!this.isConnected) return 0;

    try {
      const fullKey = this.buildKey(key, namespace);
      return await this.redis.incrby(fullKey, value);
    } catch (error) {
      logger.error({ error, key }, 'Erro ao incrementar');
      return 0;
    }
  }

  /**
   * Decrementa contador
   */
  async decrement(key: string, value: number = 1, namespace: string = 'app'): Promise<number> {
    if (!this.isConnected) return 0;

    try {
      const fullKey = this.buildKey(key, namespace);
      return await this.redis.decrby(fullKey, value);
    } catch (error) {
      logger.error({ error, key }, 'Erro ao decrementar');
      return 0;
    }
  }

  /**
   * Adiciona item a lista
   */
  async lpush(key: string, value: any, namespace: string = 'app'): Promise<number> {
    if (!this.isConnected) return 0;

    try {
      const fullKey = this.buildKey(key, namespace);
      const json = typeof value === 'string' ? value : JSON.stringify(value);
      return await this.redis.lpush(fullKey, json);
    } catch (error) {
      logger.error({ error, key }, 'Erro ao fazer lpush');
      return 0;
    }
  }

  /**
   * Obtém items de lista
   */
  async lrange<T>(
    key: string,
    start: number = 0,
    stop: number = -1,
    namespace: string = 'app',
  ): Promise<T[]> {
    if (!this.isConnected) return [];

    try {
      const fullKey = this.buildKey(key, namespace);
      const items = await this.redis.lrange(fullKey, start, stop);
      return items.map((item) => {
        try {
          return JSON.parse(item) as T;
        } catch {
          return item as T;
        }
      });
    } catch (error) {
      logger.error({ error, key }, 'Erro ao fazer lrange');
      return [];
    }
  }

  /**
   * Adiciona item a set
   */
  async sadd(key: string, value: any, namespace: string = 'app'): Promise<number> {
    if (!this.isConnected) return 0;

    try {
      const fullKey = this.buildKey(key, namespace);
      const json = typeof value === 'string' ? value : JSON.stringify(value);
      return await this.redis.sadd(fullKey, json);
    } catch (error) {
      logger.error({ error, key }, 'Erro ao fazer sadd');
      return 0;
    }
  }

  /**
   * Obtém membros de set
   */
  async smembers<T>(key: string, namespace: string = 'app'): Promise<T[]> {
    if (!this.isConnected) return [];

    try {
      const fullKey = this.buildKey(key, namespace);
      const members = await this.redis.smembers(fullKey);
      return members.map((item) => {
        try {
          return JSON.parse(item) as T;
        } catch {
          return item as T;
        }
      });
    } catch (error) {
      logger.error({ error, key }, 'Erro ao fazer smembers');
      return [];
    }
  }

  /**
   * Executa comando Lua (transação atomática)
   */
  async eval(script: string, numKeys: number, ...args: any[]): Promise<any> {
    if (!this.isConnected) return null;

    try {
      return await this.redis.eval(script, numKeys, ...args);
    } catch (error) {
      logger.error({ error }, 'Erro ao executar script Lua');
      return null;
    }
  }

  /**
   * Obtém TTL de chave
   */
  async ttl(key: string, namespace: string = 'app'): Promise<number> {
    if (!this.isConnected) return -2;

    try {
      const fullKey = this.buildKey(key, namespace);
      return await this.redis.ttl(fullKey);
    } catch (error) {
      logger.error({ error, key }, 'Erro ao obter TTL');
      return -2;
    }
  }

  /**
   * Define TTL para chave existente
   */
  async expire(key: string, seconds: number, namespace: string = 'app'): Promise<boolean> {
    if (!this.isConnected) return false;

    try {
      const fullKey = this.buildKey(key, namespace);
      const result = await this.redis.expire(fullKey, seconds);
      return result === 1;
    } catch (error) {
      logger.error({ error, key }, 'Erro ao set expire');
      return false;
    }
  }

  /**
   * Obtém estatísticas de cache
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reseta estatísticas
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      hitRate: 0,
      connections: this.stats.connections,
    };
  }

  /**
   * Atualiza hit rate
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
  }

  /**
   * Constrói chave com namespace
   */
  private buildKey(key: string, namespace: string): string {
    return `${namespace}:${key}`;
  }

  /**
   * Retorna status da conexão
   */
  isReady(): boolean {
    return this.isConnected;
  }

  /**
   * Fecha conexões
   */
  async close(): Promise<void> {
    try {
      await this.redis.quit();
      await this.pubClient.quit();
      await this.subClient.quit();
      this.isConnected = false;
    } catch (error) {
      logger.error({ error }, 'Erro ao fechar conexões Redis');
    }
  }
}

export const redisCacheService = new RedisCacheService();
