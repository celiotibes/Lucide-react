import { logger } from '@utils/logger';

// ============================================================================
// AUDIT TRAIL SERVICE - Compliance & Legal Tracking
// ============================================================================

export interface AuditLog {
  id: string;
  timestamp: Date;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  changes: Record<string, { before: any; after: any }>;
  ipAddress?: string;
  userAgent?: string;
  status: 'success' | 'failed';
  errorMessage?: string;
  metadata: Record<string, any>;
}

export interface AuditQuery {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  status?: 'success' | 'failed';
  limit?: number;
  offset?: number;
}

export class AuditTrailService {
  private logs: Map<string, AuditLog> = new Map();
  private actionIndex: Map<string, string[]> = new Map();
  private entityIndex: Map<string, string[]> = new Map();
  private userIndex: Map<string, string[]> = new Map();

  /**
   * Log an action for audit purposes
   */
  log(
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    changes: Record<string, { before: any; after: any }>,
    metadata: Record<string, any> = {},
    status: 'success' | 'failed' = 'success',
    errorMessage?: string,
  ): AuditLog {
    const id = `audit-${Date.now()}-${Math.random()}`;
    const now = new Date();

    const log: AuditLog = {
      id,
      timestamp: now,
      userId,
      action,
      entityType,
      entityId,
      changes,
      status,
      errorMessage,
      metadata: {
        ...metadata,
        timestamp: now.toISOString(),
      },
    };

    this.logs.set(id, log);
    this.indexLog(log);

    logger.info(
      {
        auditId: id,
        userId,
        action,
        entityType,
        entityId,
        status,
      },
      `Audit log registered: ${action} on ${entityType} ${entityId}`,
    );

    return log;
  }

  /**
   * Create indexes for efficient querying
   */
  private indexLog(log: AuditLog): void {
    const actionKey = `${log.action}`;
    const entityKey = `${log.entityType}:${log.entityId}`;
    const userKey = `${log.userId}`;

    if (!this.actionIndex.has(actionKey)) {
      this.actionIndex.set(actionKey, []);
    }
    this.actionIndex.get(actionKey)!.push(log.id);

    if (!this.entityIndex.has(entityKey)) {
      this.entityIndex.set(entityKey, []);
    }
    this.entityIndex.get(entityKey)!.push(log.id);

    if (!this.userIndex.has(userKey)) {
      this.userIndex.set(userKey, []);
    }
    this.userIndex.get(userKey)!.push(log.id);
  }

  /**
   * Query audit logs with filtering
   */
  query(criteria: AuditQuery): AuditLog[] {
    let results = Array.from(this.logs.values());

    if (criteria.startDate) {
      results = results.filter((log) => log.timestamp >= criteria.startDate!);
    }

    if (criteria.endDate) {
      results = results.filter((log) => log.timestamp <= criteria.endDate!);
    }

    if (criteria.userId) {
      results = results.filter((log) => log.userId === criteria.userId);
    }

    if (criteria.action) {
      results = results.filter((log) => log.action === criteria.action);
    }

    if (criteria.entityType) {
      results = results.filter((log) => log.entityType === criteria.entityType);
    }

    if (criteria.entityId) {
      results = results.filter((log) => log.entityId === criteria.entityId);
    }

    if (criteria.status) {
      results = results.filter((log) => log.status === criteria.status);
    }

    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const offset = criteria.offset || 0;
    const limit = criteria.limit || 100;

    return results.slice(offset, offset + limit);
  }

  /**
   * Get audit history for a specific entity
   */
  getEntityHistory(entityType: string, entityId: string): AuditLog[] {
    const key = `${entityType}:${entityId}`;
    const logIds = this.entityIndex.get(key) || [];

    return logIds
      .map((id) => this.logs.get(id))
      .filter((log) => log !== undefined) as AuditLog[];
  }

  /**
   * Get user activity history
   */
  getUserActivity(userId: string, days: number = 30): AuditLog[] {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const logIds = this.userIndex.get(userId) || [];
    return logIds
      .map((id) => this.logs.get(id))
      .filter(
        (log) => log !== undefined && log.timestamp >= startDate,
      ) as AuditLog[];
  }

  /**
   * Get audit log by ID
   */
  getLog(logId: string): AuditLog | null {
    return this.logs.get(logId) || null;
  }

  /**
   * Export audit logs for compliance
   */
  export(criteria: AuditQuery): string {
    const logs = this.query(criteria);
    const headers = [
      'ID',
      'Timestamp',
      'User ID',
      'Action',
      'Entity Type',
      'Entity ID',
      'Status',
      'Changes',
    ];

    const rows = logs.map((log) => [
      log.id,
      log.timestamp.toISOString(),
      log.userId,
      log.action,
      log.entityType,
      log.entityId,
      log.status,
      JSON.stringify(log.changes),
    ]);

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');

    return csv;
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalLogs: number;
    successCount: number;
    failedCount: number;
    uniqueUsers: number;
    uniqueActions: number;
    logsLast24h: number;
  } {
    const logs = Array.from(this.logs.values());
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    return {
      totalLogs: logs.length,
      successCount: logs.filter((l) => l.status === 'success').length,
      failedCount: logs.filter((l) => l.status === 'failed').length,
      uniqueUsers: new Set(logs.map((l) => l.userId)).size,
      uniqueActions: new Set(logs.map((l) => l.action)).size,
      logsLast24h: logs.filter((l) => l.timestamp >= last24h).length,
    };
  }

  /**
   * Reset data (testing only)
   */
  reset(): void {
    this.logs.clear();
    this.actionIndex.clear();
    this.entityIndex.clear();
    this.userIndex.clear();
    logger.info('AuditTrailService resetado');
  }
}

export const auditTrailService = new AuditTrailService();
