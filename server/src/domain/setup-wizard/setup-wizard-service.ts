/**
 * Setup Wizard Service
 * Handles setup configuration storage, retrieval, and state management
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { logger } from '../../services/logger-service.js';
import { getEncryptionService } from '../../services/credential-encryption.js';
import { SetupWizardConfig, CredentialBackup, SetupWizardAuditLog } from './types.js';

export class SetupWizardService {
  constructor(private db: Database.Database) {}

  /**
   * Creates a new setup configuration
   */
  createConfiguration(platform: string): SetupWizardConfig {
    const id = randomUUID();
    const now = new Date();

    const stmt = this.db.prepare(`
      INSERT INTO setup_wizard_config (
        id,
        platform,
        setup_completed,
        last_updated_at,
        ai_provider
      ) VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(id, platform, 0, now, 'anthropic');

    this.logAudit(id, 'created', ['platform'], 'success');

    return {
      id,
      setupCompleted: false,
      lastUpdatedAt: now,
      aiProvider: { provider: 'anthropic' },
      database: {
        host: 'localhost',
        port: 5432,
        name: 'lucide_react',
        user: '',
        password: '',
        sslEnabled: true,
      },
      backup: {
        enabled: true,
        frequency: 'daily',
        retentionDays: 30,
        destinations: ['local'],
      },
      platformSpecific: { platform },
      general: {
        appName: 'Lucide React',
        appPort: 3000,
        logLevel: 'info',
      },
      gdprConsentGiven: false,
      analyticsEnabled: false,
    };
  }

  /**
   * Retrieves setup configuration by ID
   */
  getConfiguration(id: string): SetupWizardConfig | null {
    const stmt = this.db.prepare(`
      SELECT * FROM setup_wizard_config WHERE id = ?
    `);

    const row = stmt.get(id) as any;
    if (!row) return null;

    return this.rowToConfig(row);
  }

  /**
   * Retrieves the setup configuration for a specific platform
   */
  getConfigurationByPlatform(platform: string): SetupWizardConfig | null {
    const stmt = this.db.prepare(`
      SELECT * FROM setup_wizard_config WHERE platform = ?
    `);

    const row = stmt.get(platform) as any;
    if (!row) return null;

    return this.rowToConfig(row);
  }

  /**
   * Updates setup configuration step by step
   */
  updateStep(
    configId: string,
    stepId: string,
    fieldValues: Record<string, any>
  ): { success: boolean; error?: string } {
    try {
      const config = this.getConfiguration(configId);
      if (!config) {
        return { success: false, error: 'Configuration not found' };
      }

      const encryption = getEncryptionService();
      const updates: Record<string, any> = {};
      const changedFields: string[] = [];

      // Map step fields to database columns
      for (const [key, value] of Object.entries(fieldValues)) {
        if (value === null || value === undefined || value === '') {
          continue;
        }

        // Encrypt sensitive fields
        if (this.isSensitiveField(key) && typeof value === 'string') {
          updates[key] = encryption.encrypt(value);
        } else {
          updates[key] = value;
        }

        changedFields.push(key);
      }

      if (Object.keys(updates).length === 0) {
        return { success: true };
      }

      updates.last_updated_at = new Date();

      // Build UPDATE statement
      const setClause = Object.keys(updates)
        .map((key) => `${key} = ?`)
        .join(', ');

      const values = Object.values(updates);
      values.push(configId);

      const stmt = this.db.prepare(`
        UPDATE setup_wizard_config
        SET ${setClause}
        WHERE id = ?
      `);

      stmt.run(...values);

      this.logAudit(configId, 'updated', changedFields, 'success');

      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('[SetupWizard] Update step failed:', errorMsg);
      this.logAudit(configId, 'error', [], 'failure', errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Completes the setup wizard
   */
  completeSetup(configId: string): { success: boolean; error?: string } {
    try {
      const now = new Date();

      const stmt = this.db.prepare(`
        UPDATE setup_wizard_config
        SET setup_completed = ?, completed_at = ?, last_updated_at = ?
        WHERE id = ?
      `);

      stmt.run(1, now, now, configId);

      this.logAudit(configId, 'completed', ['setup_completed'], 'success');

      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('[SetupWizard] Complete setup failed:', errorMsg);
      this.logAudit(configId, 'error', [], 'failure', errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Decrypts a credential from the configuration
   */
  getDecryptedCredential(configId: string, fieldName: string): string | null {
    try {
      if (!this.isSensitiveField(fieldName)) {
        return null;
      }

      const config = this.getConfiguration(configId);
      if (!config) return null;

      const encrypted = (config as any)[fieldName];
      if (!encrypted) return null;

      const encryption = getEncryptionService();
      return encryption.decrypt(encrypted);
    } catch (error) {
      logger.error('[SetupWizard] Failed to decrypt credential:', error);
      return null;
    }
  }

  /**
   * Creates a credential backup before changes
   */
  createCredentialBackup(
    configId: string,
    destination: string,
    backupPath?: string
  ): { success: boolean; backupId?: string; error?: string } {
    try {
      const id = randomUUID();
      const retentionUntil = new Date();
      retentionUntil.setDate(retentionUntil.getDate() + 30);

      const stmt = this.db.prepare(`
        INSERT INTO credential_backup_log (
          id,
          config_id,
          backup_type,
          backup_destination,
          backup_path,
          status,
          retention_until,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(id, configId, 'manual', destination, backupPath, 'success', retentionUntil, new Date());

      return { success: true, backupId: id };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('[SetupWizard] Backup creation failed:', errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Retrieves audit log for a configuration
   */
  getAuditLog(configId: string, limit: number = 50): SetupWizardAuditLog[] {
    const stmt = this.db.prepare(`
      SELECT * FROM setup_wizard_audit
      WHERE config_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);

    const rows = stmt.all(configId, limit) as any[];
    return rows.map((row) => this.rowToAuditLog(row));
  }

  /**
   * Checks if setup is complete for a platform
   */
  isSetupComplete(platform: string): boolean {
    const config = this.getConfigurationByPlatform(platform);
    return config?.setupCompleted ?? false;
  }

  /**
   * Private helper methods
   */

  private isSensitiveField(fieldName: string): boolean {
    const sensitiveFields = [
      'anthropic_api_key',
      'openai_api_key',
      'gemini_api_key',
      'local_llm_endpoint',
      'db_password',
      'aws_access_key_id',
      'aws_secret_access_key',
      'google_drive_service_account',
    ];
    return sensitiveFields.includes(fieldName);
  }

  private rowToConfig(row: any): SetupWizardConfig {
    const encryption = getEncryptionService();

    return {
      id: row.id,
      setupCompleted: Boolean(row.setup_completed),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      lastUpdatedAt: new Date(row.last_updated_at),
      aiProvider: {
        provider: row.ai_provider,
        anthropic: row.anthropic_api_key
          ? {
              apiKey: encryption.decrypt(row.anthropic_api_key),
              model: row.anthropic_model || 'claude-3-5-sonnet-20241022',
            }
          : undefined,
        openai: row.openai_api_key
          ? {
              apiKey: encryption.decrypt(row.openai_api_key),
              model: row.openai_model || 'gpt-4-turbo',
            }
          : undefined,
        gemini: row.gemini_api_key
          ? {
              apiKey: encryption.decrypt(row.gemini_api_key),
              model: row.gemini_model || 'gemini-2.0-flash',
            }
          : undefined,
      },
      database: {
        host: row.db_host || 'localhost',
        port: row.db_port || 5432,
        name: row.db_name || 'lucide_react',
        user: row.db_user || '',
        password: row.db_password ? encryption.decrypt(row.db_password) : '',
        sslEnabled: Boolean(row.db_ssl_enabled),
      },
      backup: {
        enabled: Boolean(row.backup_enabled),
        frequency: row.backup_frequency || 'daily',
        retentionDays: row.backup_retention_days || 30,
        destinations: row.backup_destinations
          ? JSON.parse(row.backup_destinations)
          : ['local'],
      },
      platformSpecific: {
        platform: row.platform,
        windows: row.windows_app_version
          ? {
              appVersion: row.windows_app_version,
              autoUpdateEnabled: Boolean(row.windows_auto_update_enabled),
              scheduledBackupTime: row.windows_scheduled_backup_time || '02:00',
            }
          : undefined,
      },
      general: {
        appName: row.app_name || 'Lucide React',
        appPort: row.app_port || 3000,
        logLevel: row.log_level || 'info',
      },
      gdprConsentGiven: Boolean(row.gdpr_consent_given),
      gdprConsentTimestamp: row.gdpr_consent_timestamp
        ? new Date(row.gdpr_consent_timestamp)
        : undefined,
      analyticsEnabled: Boolean(row.analytics_enabled),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  private rowToAuditLog(row: any): SetupWizardAuditLog {
    return {
      id: row.id,
      configId: row.config_id,
      action: row.action,
      changedFields: row.changed_fields ? JSON.parse(row.changed_fields) : undefined,
      status: row.status,
      errorMessage: row.error_message,
      validationErrors: row.validation_errors ? JSON.parse(row.validation_errors) : undefined,
      userIp: row.user_ip,
      userAgent: row.user_agent,
      createdAt: new Date(row.created_at),
    };
  }

  private logAudit(
    configId: string,
    action: string,
    changedFields: string[],
    status: string,
    errorMessage?: string
  ): void {
    try {
      const id = randomUUID();
      const stmt = this.db.prepare(`
        INSERT INTO setup_wizard_audit (
          id,
          config_id,
          action,
          changed_fields,
          status,
          error_message,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        configId,
        action,
        JSON.stringify(changedFields),
        status,
        errorMessage || null,
        new Date()
      );
    } catch (error) {
      logger.error('[SetupWizard] Audit logging failed:', error);
    }
  }
}
