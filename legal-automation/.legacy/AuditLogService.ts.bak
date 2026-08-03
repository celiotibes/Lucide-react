/**
 * Audit Log Service
 * Logging de todas as ações sensíveis para compliance
 */

import { redisCacheService } from './RedisCacheService';
import { logger } from '@utils/logger';

export interface AuditLog {
  id: string;
  timestamp: Date;
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  apiKeyId?: string;
  ipAddress: string;
  changes: {
    before?: any;
    after?: any;
  };
  status: 'success' | 'failure';
  error?: string;
  metadata?: Record<string, any>;
}

class AuditLogService {
  private readonly LOG_PREFIX = 'audit_log';
  private readonly RETENTION_DAYS = 90;

  /**
   * Registra ação no audit log
   */
  async log(log: Omit<AuditLog, 'id' | 'timestamp'>): Promise<string> {
    try {
      const id = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const auditLog: AuditLog = {
        ...log,
        id,
        timestamp: new Date(),
      };

      const ttl = this.RETENTION_DAYS * 24 * 60 * 60;

      await redisCacheService.set(id, auditLog, {
        ttl,
        namespace: this.LOG_PREFIX,
      });

      // Também logga localmente para backup
      logger.info(
        {
          auditId: id,
          action: log.action,
          entityType: log.entityType,
          entityId: log.entityId,
          userId: log.userId,
          status: log.status,
        },
        'Audit log recorded',
      );

      return id;
    } catch (error) {
      logger.error({ error, log }, 'Erro ao registrar audit log');
      throw error;
    }
  }

  /**
   * Registra criação de entidade
   */
  async logCreate(
    entityType: string,
    entityId: string,
    data: any,
    userId: string,
    ipAddress: string,
    apiKeyId?: string,
  ): Promise<string> {
    return this.log({
      action: 'CREATE',
      entityType,
      entityId,
      userId,
      apiKeyId,
      ipAddress,
      changes: { after: data },
      status: 'success',
    });
  }

  /**
   * Registra atualização de entidade
   */
  async logUpdate(
    entityType: string,
    entityId: string,
    before: any,
    after: any,
    userId: string,
    ipAddress: string,
    apiKeyId?: string,
  ): Promise<string> {
    return this.log({
      action: 'UPDATE',
      entityType,
      entityId,
      userId,
      apiKeyId,
      ipAddress,
      changes: { before, after },
      status: 'success',
    });
  }

  /**
   * Registra deleção de entidade
   */
  async logDelete(
    entityType: string,
    entityId: string,
    data: any,
    userId: string,
    ipAddress: string,
    apiKeyId?: string,
  ): Promise<string> {
    return this.log({
      action: 'DELETE',
      entityType,
      entityId,
      userId,
      apiKeyId,
      ipAddress,
      changes: { before: data },
      status: 'success',
    });
  }

  /**
   * Registra erro
   */
  async logError(
    action: string,
    entityType: string,
    entityId: string,
    error: string,
    userId: string,
    ipAddress: string,
    apiKeyId?: string,
  ): Promise<string> {
    return this.log({
      action,
      entityType,
      entityId,
      userId,
      apiKeyId,
      ipAddress,
      changes: {},
      status: 'failure',
      error,
    });
  }

  /**
   * Obtém logs de entidade
   */
  async getEntityLogs(entityId: string, limit: number = 50): Promise<AuditLog[]> {
    try {
      const logs = await redisCacheService.lrange<AuditLog>(
        `entity:${entityId}`,
        0,
        limit - 1,
        this.LOG_PREFIX,
      );
      return logs;
    } catch (error) {
      logger.error({ error, entityId }, 'Erro ao obter logs da entidade');
      return [];
    }
  }

  /**
   * Obtém logs de usuário
   */
  async getUserLogs(userId: string, limit: number = 50): Promise<AuditLog[]> {
    try {
      const logs = await redisCacheService.lrange<AuditLog>(
        `user:${userId}`,
        0,
        limit - 1,
        this.LOG_PREFIX,
      );
      return logs;
    } catch (error) {
      logger.error({ error, userId }, 'Erro ao obter logs do usuário');
      return [];
    }
  }

  /**
   * Obtém logs por tipo de ação
   */
  async getActionLogs(action: string, limit: number = 50): Promise<AuditLog[]> {
    try {
      const logs = await redisCacheService.lrange<AuditLog>(
        `action:${action}`,
        0,
        limit - 1,
        this.LOG_PREFIX,
      );
      return logs;
    } catch (error) {
      logger.error({ error, action }, 'Erro ao obter logs de ação');
      return [];
    }
  }

  /**
   * Gera relatório de compliance
   */
  async generateComplianceReport(
    startDate: Date,
    endDate: Date,
  ): Promise<{
    totalLogs: number;
    successCount: number;
    failureCount: number;
    actions: Record<string, number>;
    users: Record<string, number>;
  }> {
    try {
      // Implementação simplificada - em produção, fazer query no banco
      return {
        totalLogs: 0,
        successCount: 0,
        failureCount: 0,
        actions: {},
        users: {},
      };
    } catch (error) {
      logger.error({ error }, 'Erro ao gerar compliance report');
      throw error;
    }
  }
}

export const auditLogService = new AuditLogService();
