/**
 * Audit Log Service
 *
 * GDPR-compliant audit trail for security events
 *
 * Features:
 * - Security event tracking
 * - User action audit trail
 * - Permission changes
 * - Data access logging
 * - Compliance reporting
 * - Immutable event records
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logMasker } from './logMasking';

export enum AuditEventType {
  // Authentication events
  AUTH_LOGIN = 'AUTH_LOGIN',
  AUTH_LOGOUT = 'AUTH_LOGOUT',
  AUTH_FAILED = 'AUTH_FAILED',
  AUTH_MFA_ENABLED = 'AUTH_MFA_ENABLED',
  AUTH_MFA_DISABLED = 'AUTH_MFA_DISABLED',
  AUTH_PASSWORD_CHANGED = 'AUTH_PASSWORD_CHANGED',
  AUTH_SESSION_EXPIRED = 'AUTH_SESSION_EXPIRED',

  // Permission events
  PERMISSION_GRANTED = 'PERMISSION_GRANTED',
  PERMISSION_REVOKED = 'PERMISSION_REVOKED',
  PERMISSION_REQUESTED = 'PERMISSION_REQUESTED',
  ROLE_CHANGED = 'ROLE_CHANGED',

  // Data access events
  DATA_ACCESSED = 'DATA_ACCESSED',
  DATA_EXPORTED = 'DATA_EXPORTED',
  DATA_MODIFIED = 'DATA_MODIFIED',
  DATA_DELETED = 'DATA_DELETED',

  // Security events
  SECURITY_ALERT = 'SECURITY_ALERT',
  ENCRYPTION_KEY_ROTATED = 'ENCRYPTION_KEY_ROTATED',
  DEVICE_FINGERPRINT_CHANGED = 'DEVICE_FINGERPRINT_CHANGED',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',

  // System events
  APP_STARTED = 'APP_STARTED',
  APP_CRASHED = 'APP_CRASHED',
  CONFIG_CHANGED = 'CONFIG_CHANGED',
  DEPENDENCY_UPDATED = 'DEPENDENCY_UPDATED',
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  type: AuditEventType;
  userId?: string;
  sessionId: string;
  action: string;
  resource?: string;
  resourceId?: string;
  status: 'success' | 'failure' | 'pending';
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
  changes?: {
    before?: Record<string, any>;
    after?: Record<string, any>;
  };
  complianceRelevant: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface AuditConfig {
  enabled: boolean;
  maxEventsInStorage: number;
  retentionDays: number;
  autoExportDays?: number;
  encryptionEnabled: boolean;
  remoteEndpoint?: string;
  remoteApiKey?: string;
}

const DEFAULT_CONFIG: AuditConfig = {
  enabled: true,
  maxEventsInStorage: 1000,
  retentionDays: 365, // GDPR standard
  autoExportDays: 90,
  encryptionEnabled: false,
  remoteEndpoint: undefined,
  remoteApiKey: undefined,
};

const STORAGE_KEY = '@crmt:audit_log';

export class AuditLogger {
  private config: AuditConfig;
  private events: AuditEvent[] = [];
  private isProcessing = false;

  constructor(config: Partial<AuditConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initialize();
  }

  /**
   * Initialize audit logger
   */
  private async initialize(): Promise<void> {
    try {
      await this.loadEvents();
      this.cleanup();
    } catch (error) {
      console.error('Failed to initialize audit logger', error);
    }
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Log security event
   */
  async logEvent(
    type: AuditEventType,
    action: string,
    metadata?: Record<string, any>,
    options?: {
      userId?: string;
      sessionId?: string;
      resource?: string;
      resourceId?: string;
      status?: 'success' | 'failure' | 'pending';
      ipAddress?: string;
      userAgent?: string;
      changes?: AuditEvent['changes'];
      severity?: 'low' | 'medium' | 'high' | 'critical';
    },
  ): Promise<AuditEvent> {
    if (!this.config.enabled) {
      return {} as AuditEvent;
    }

    const event: AuditEvent = {
      id: this.generateEventId(),
      timestamp: new Date().toISOString(),
      type,
      action,
      userId: options?.userId,
      sessionId: options?.sessionId || '',
      resource: options?.resource,
      resourceId: options?.resourceId,
      status: options?.status || 'pending',
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
      metadata: metadata ? logMasker.maskObject(metadata) : undefined,
      changes: options?.changes ? this.maskChanges(options.changes) : undefined,
      complianceRelevant: this.isComplianceRelevant(type),
      severity: options?.severity || this.getSeverity(type),
    };

    this.events.push(event);

    // Keep storage limited
    if (this.events.length > this.config.maxEventsInStorage) {
      this.events = this.events.slice(-this.config.maxEventsInStorage);
    }

    // Persist to storage
    await this.persistEvents();

    // Send to remote if configured
    if (this.config.remoteEndpoint) {
      this.sendToRemote(event).catch(error => {
        console.error('Failed to send audit event to remote', error);
      });
    }

    return event;
  }

  /**
   * Log authentication event
   */
  async logAuthEvent(
    subType: AuditEventType,
    userId: string,
    success: boolean,
    metadata?: Record<string, any>,
  ): Promise<AuditEvent> {
    return this.logEvent(
      subType,
      `Authentication ${success ? 'succeeded' : 'failed'}`,
      metadata,
      {
        userId,
        status: success ? 'success' : 'failure',
        severity: success ? 'low' : 'medium',
      },
    );
  }

  /**
   * Log permission change
   */
  async logPermissionChange(
    userId: string,
    resource: string,
    before: Record<string, any>,
    after: Record<string, any>,
    reason?: string,
  ): Promise<AuditEvent> {
    return this.logEvent(
      AuditEventType.PERMISSION_GRANTED,
      `Permission changed for ${resource}`,
      { reason },
      {
        userId,
        resource,
        changes: { before, after },
        status: 'success',
        severity: 'medium',
      },
    );
  }

  /**
   * Log data access
   */
  async logDataAccess(
    userId: string,
    resourceId: string,
    resource: string,
    metadata?: Record<string, any>,
  ): Promise<AuditEvent> {
    return this.logEvent(
      AuditEventType.DATA_ACCESSED,
      `User accessed ${resource}`,
      metadata,
      {
        userId,
        resourceId,
        resource,
        status: 'success',
        severity: 'low',
      },
    );
  }

  /**
   * Log data modification
   */
  async logDataModification(
    userId: string,
    resourceId: string,
    resource: string,
    changes: AuditEvent['changes'],
    metadata?: Record<string, any>,
  ): Promise<AuditEvent> {
    return this.logEvent(
      AuditEventType.DATA_MODIFIED,
      `User modified ${resource}`,
      metadata,
      {
        userId,
        resourceId,
        resource,
        changes,
        status: 'success',
        severity: 'medium',
      },
    );
  }

  /**
   * Log security alert
   */
  async logSecurityAlert(
    alertType: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    details: Record<string, any>,
    userId?: string,
  ): Promise<AuditEvent> {
    return this.logEvent(
      AuditEventType.SECURITY_ALERT,
      alertType,
      details,
      {
        userId,
        status: 'success',
        severity,
      },
    );
  }

  /**
   * Mask sensitive changes
   */
  private maskChanges(changes: AuditEvent['changes']): AuditEvent['changes'] {
    return {
      before: changes.before ? logMasker.maskObject(changes.before) : undefined,
      after: changes.after ? logMasker.maskObject(changes.after) : undefined,
    };
  }

  /**
   * Determine if event is compliance-relevant
   */
  private isComplianceRelevant(type: AuditEventType): boolean {
    const complianceTypes = [
      AuditEventType.DATA_ACCESSED,
      AuditEventType.DATA_EXPORTED,
      AuditEventType.DATA_MODIFIED,
      AuditEventType.DATA_DELETED,
      AuditEventType.PERMISSION_GRANTED,
      AuditEventType.PERMISSION_REVOKED,
      AuditEventType.AUTH_PASSWORD_CHANGED,
      AuditEventType.ROLE_CHANGED,
    ];
    return complianceTypes.includes(type);
  }

  /**
   * Get severity level for event type
   */
  private getSeverity(type: AuditEventType): 'low' | 'medium' | 'high' | 'critical' {
    switch (type) {
      case AuditEventType.SECURITY_ALERT:
      case AuditEventType.SUSPICIOUS_ACTIVITY:
      case AuditEventType.AUTH_FAILED:
        return 'high';
      case AuditEventType.DATA_DELETED:
      case AuditEventType.PERMISSION_REVOKED:
      case AuditEventType.AUTH_PASSWORD_CHANGED:
        return 'medium';
      default:
        return 'low';
    }
  }

  /**
   * Get all events
   */
  getEvents(type?: AuditEventType, userId?: string): AuditEvent[] {
    let filtered = [...this.events];

    if (type) {
      filtered = filtered.filter(e => e.type === type);
    }

    if (userId) {
      filtered = filtered.filter(e => e.userId === userId);
    }

    return filtered;
  }

  /**
   * Get compliance-relevant events
   */
  getComplianceEvents(startDate?: Date, endDate?: Date): AuditEvent[] {
    let filtered = this.events.filter(e => e.complianceRelevant);

    if (startDate) {
      filtered = filtered.filter(e => new Date(e.timestamp) >= startDate);
    }

    if (endDate) {
      filtered = filtered.filter(e => new Date(e.timestamp) <= endDate);
    }

    return filtered;
  }

  /**
   * Get events by severity
   */
  getEventsBySeverity(severity: 'low' | 'medium' | 'high' | 'critical'): AuditEvent[] {
    return this.events.filter(e => e.severity === severity);
  }

  /**
   * Search events
   */
  searchEvents(query: string): AuditEvent[] {
    const lowerQuery = query.toLowerCase();
    return this.events.filter(
      e =>
        e.action.toLowerCase().includes(lowerQuery) ||
        e.type.toLowerCase().includes(lowerQuery) ||
        e.userId?.toLowerCase().includes(lowerQuery),
    );
  }

  /**
   * Persist events to storage
   */
  private async persistEvents(): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;
    try {
      const data = JSON.stringify(this.events);
      await AsyncStorage.setItem(STORAGE_KEY, data);
    } catch (error) {
      console.error('Failed to persist audit events', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Load events from storage
   */
  private async loadEvents(): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) {
        this.events = JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load audit events', error);
      this.events = [];
    }
  }

  /**
   * Clean up old events
   */
  private async cleanup(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    const beforeCount = this.events.length;
    this.events = this.events.filter(e => new Date(e.timestamp) > cutoffDate);

    if (this.events.length < beforeCount) {
      await this.persistEvents();
    }
  }

  /**
   * Send event to remote endpoint
   */
  private async sendToRemote(event: AuditEvent): Promise<void> {
    if (!this.config.remoteEndpoint) {
      return;
    }

    try {
      const response = await fetch(this.config.remoteEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.remoteApiKey && {
            Authorization: `Bearer ${this.config.remoteApiKey}`,
          }),
        },
        body: JSON.stringify(event),
      });

      if (!response.ok) {
        throw new Error(`Remote audit log failed: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to send audit event to remote', error);
    }
  }

  /**
   * Export audit trail as JSON
   */
  async exportAsJSON(): Promise<string> {
    return JSON.stringify(
      {
        exportDate: new Date().toISOString(),
        totalEvents: this.events.length,
        events: this.events,
      },
      null,
      2,
    );
  }

  /**
   * Export audit trail as CSV
   */
  async exportAsCSV(): Promise<string> {
    const headers = [
      'Timestamp',
      'Event Type',
      'Action',
      'User ID',
      'Status',
      'Severity',
      'Resource',
      'Compliance Relevant',
    ];

    const rows = this.events.map(e => [
      new Date(e.timestamp).toLocaleString('pt-BR'),
      e.type,
      e.action,
      e.userId || '-',
      e.status,
      e.severity,
      e.resource || '-',
      e.complianceRelevant ? 'Yes' : 'No',
    ]);

    const csv = [headers, ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');

    return csv;
  }

  /**
   * Get audit statistics
   */
  getStats() {
    const stats = {
      totalEvents: this.events.length,
      complianceEvents: this.events.filter(e => e.complianceRelevant).length,
      bySeverity: {
        low: this.events.filter(e => e.severity === 'low').length,
        medium: this.events.filter(e => e.severity === 'medium').length,
        high: this.events.filter(e => e.severity === 'high').length,
        critical: this.events.filter(e => e.severity === 'critical').length,
      },
      byType: {} as Record<string, number>,
      byUser: {} as Record<string, number>,
      oldestEvent: this.events[0]?.timestamp || null,
      newestEvent: this.events[this.events.length - 1]?.timestamp || null,
    };

    // Count by type
    this.events.forEach(e => {
      stats.byType[e.type] = (stats.byType[e.type] || 0) + 1;
    });

    // Count by user
    this.events.forEach(e => {
      if (e.userId) {
        stats.byUser[e.userId] = (stats.byUser[e.userId] || 0) + 1;
      }
    });

    return stats;
  }

  /**
   * Clear all audit events (for testing only)
   */
  async clearAll(): Promise<void> {
    this.events = [];
    await AsyncStorage.removeItem(STORAGE_KEY);
  }
}

// Export singleton instance
export const auditLogger = new AuditLogger();
