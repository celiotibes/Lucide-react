/**
 * Session Store com Redis
 * Armazenamento distribuído de sessões de usuário
 */

import { redisCacheService } from './RedisCacheService';
import { logger } from '@utils/logger';

export interface Session {
  userId: string;
  email: string;
  username: string;
  roles: string[];
  permissions: string[];
  createdAt: Date;
  expiresAt: Date;
  lastActivityAt: Date;
  metadata?: Record<string, any>;
}

class SessionStore {
  private sessionTTL: number = 86400; // 24 horas
  private readonly SESSION_PREFIX = 'session';

  /**
   * Cria nova sessão
   */
  async createSession(sessionId: string, session: Session): Promise<void> {
    try {
      const ttl = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);

      await redisCacheService.set(
        sessionId,
        session,
        {
          ttl: Math.max(ttl, 3600), // Mínimo 1 hora
          namespace: this.SESSION_PREFIX,
        },
      );

      logger.debug({ userId: session.userId, sessionId }, 'Sessão criada');
    } catch (error) {
      logger.error({ error, sessionId }, 'Erro ao criar sessão');
      throw error;
    }
  }

  /**
   * Obtém sessão
   */
  async getSession(sessionId: string): Promise<Session | null> {
    try {
      const session = await redisCacheService.get<Session>(
        sessionId,
        this.SESSION_PREFIX,
      );

      if (!session) {
        return null;
      }

      // Atualiza última atividade
      session.lastActivityAt = new Date();
      await redisCacheService.set(sessionId, session, {
        ttl: this.sessionTTL,
        namespace: this.SESSION_PREFIX,
      });

      return session;
    } catch (error) {
      logger.error({ error, sessionId }, 'Erro ao obter sessão');
      return null;
    }
  }

  /**
   * Atualiza sessão
   */
  async updateSession(sessionId: string, updates: Partial<Session>): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error('Sessão não encontrada');
      }

      const updated = { ...session, ...updates, lastActivityAt: new Date() };

      await redisCacheService.set(sessionId, updated, {
        ttl: this.sessionTTL,
        namespace: this.SESSION_PREFIX,
      });

      logger.debug({ sessionId }, 'Sessão atualizada');
    } catch (error) {
      logger.error({ error, sessionId }, 'Erro ao atualizar sessão');
    }
  }

  /**
   * Valida sessão
   */
  async validateSession(sessionId: string): Promise<boolean> {
    try {
      const session = await redisCacheService.get<Session>(
        sessionId,
        this.SESSION_PREFIX,
      );

      if (!session) {
        return false;
      }

      if (new Date() > session.expiresAt) {
        await this.destroySession(sessionId);
        return false;
      }

      return true;
    } catch (error) {
      logger.error({ error, sessionId }, 'Erro ao validar sessão');
      return false;
    }
  }

  /**
   * Destroi sessão
   */
  async destroySession(sessionId: string): Promise<void> {
    try {
      await redisCacheService.delete(sessionId, this.SESSION_PREFIX);
      logger.debug({ sessionId }, 'Sessão destruída');
    } catch (error) {
      logger.error({ error, sessionId }, 'Erro ao destruir sessão');
    }
  }

  /**
   * Limpa todas as sessões de um usuário
   */
  async destroyUserSessions(userId: string): Promise<number> {
    try {
      const deleted = await redisCacheService.invalidatePattern(
        `*:${userId}:*`,
        this.SESSION_PREFIX,
      );

      logger.info({ userId, count: deleted }, 'Sessões de usuário destruídas');
      return deleted;
    } catch (error) {
      logger.error({ error, userId }, 'Erro ao destruir sessões do usuário');
      return 0;
    }
  }

  /**
   * Refresha sessão (estende expiração)
   */
  async refreshSession(sessionId: string, newExpiryHours: number = 24): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error('Sessão não encontrada');
      }

      const newExpiry = new Date();
      newExpiry.setHours(newExpiry.getHours() + newExpiryHours);

      await this.updateSession(sessionId, {
        expiresAt: newExpiry,
      });

      logger.debug({ sessionId, expiresIn: newExpiryHours }, 'Sessão refreshed');
    } catch (error) {
      logger.error({ error, sessionId }, 'Erro ao refresh session');
    }
  }

  /**
   * Adiciona permissão à sessão
   */
  async addPermission(sessionId: string, permission: string): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) return;

      if (!session.permissions.includes(permission)) {
        session.permissions.push(permission);
        await this.updateSession(sessionId, { permissions: session.permissions });
      }
    } catch (error) {
      logger.error({ error, sessionId }, 'Erro ao adicionar permissão');
    }
  }

  /**
   * Remove permissão da sessão
   */
  async removePermission(sessionId: string, permission: string): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) return;

      session.permissions = session.permissions.filter((p) => p !== permission);
      await this.updateSession(sessionId, { permissions: session.permissions });
    } catch (error) {
      logger.error({ error, sessionId }, 'Erro ao remover permissão');
    }
  }

  /**
   * Verifica se sessão tem permissão
   */
  async hasPermission(sessionId: string, permission: string): Promise<boolean> {
    try {
      const session = await this.getSession(sessionId);
      return session?.permissions.includes(permission) || false;
    } catch (error) {
      logger.error({ error, sessionId }, 'Erro ao verificar permissão');
      return false;
    }
  }

  /**
   * Obtém todas as permissões da sessão
   */
  async getPermissions(sessionId: string): Promise<string[]> {
    try {
      const session = await this.getSession(sessionId);
      return session?.permissions || [];
    } catch (error) {
      logger.error({ error, sessionId }, 'Erro ao obter permissões');
      return [];
    }
  }

  /**
   * Armazena metadados na sessão
   */
  async setMetadata(sessionId: string, key: string, value: any): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) return;

      if (!session.metadata) {
        session.metadata = {};
      }

      session.metadata[key] = value;
      await this.updateSession(sessionId, { metadata: session.metadata });
    } catch (error) {
      logger.error({ error, sessionId, key }, 'Erro ao set metadata');
    }
  }

  /**
   * Obtém metadados da sessão
   */
  async getMetadata(sessionId: string, key: string): Promise<any | null> {
    try {
      const session = await this.getSession(sessionId);
      return session?.metadata?.[key] || null;
    } catch (error) {
      logger.error({ error, sessionId, key }, 'Erro ao get metadata');
      return null;
    }
  }

  /**
   * Contabiliza sessões ativas
   */
  async countActiveSessions(userId?: string): Promise<number> {
    try {
      if (userId) {
        const pattern = `*:${userId}:*`;
        const sessions = await redisCacheService.invalidatePattern(pattern, this.SESSION_PREFIX);
        return sessions;
      }

      // Contar todas as sessões (aproximado)
      const allPattern = `*`;
      return await redisCacheService.invalidatePattern(allPattern, this.SESSION_PREFIX);
    } catch (error) {
      logger.error({ error }, 'Erro ao contar sessões ativas');
      return 0;
    }
  }
}

export const sessionStore = new SessionStore();
