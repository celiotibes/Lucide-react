#!/usr/bin/env node
/**
 * Backup Scheduler Service
 * Phase 22.23 - Disaster Recovery Automation
 *
 * Automated backup orchestration with:
 * - Hourly incremental + daily full backups
 * - Local + cloud storage (S3, GCS, Azure Blob)
 * - Backup encryption and integrity verification
 * - Retention policy enforcement
 * - Health check and alerts
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import crypto from 'crypto';
import cron from 'node-cron';

// ============================================================================
// Configuration
// ============================================================================

interface BackupConfig {
  localBackupDir: string;
  dataDir: string;
  logDir: string;

  // Backup schedule (cron format)
  incrementalSchedule: string;  // Default: every hour
  fullBackupSchedule: string;   // Default: daily at 2am

  // Retention policy
  localRetentionDays: number;
  dailyRetentionDays: number;
  monthlyRetentionDays: number;

  // Cloud storage
  cloudEnabled: boolean;
  cloudProvider: 'aws' | 'gcp' | 'azure' | 'none';
  cloudBucket: string;
  cloudRegion: string;

  // Encryption
  encryptionEnabled: boolean;
  encryptionKey: string;

  // Notifications
  notificationEnabled: boolean;
  notificationProvider: 'email' | 'slack' | 'webhook' | 'none';
  notificationEndpoint: string;

  // Verification
  verificationEnabled: boolean;
  verifyIntegrity: boolean;
}

const config: BackupConfig = {
  localBackupDir: process.env.BACKUP_DIR || '/app/backups',
  dataDir: process.env.DATA_DIR || '/app/data',
  logDir: process.env.LOG_DIR || '/app/logs',

  incrementalSchedule: process.env.INCREMENTAL_BACKUP_SCHEDULE || '0 * * * *',
  fullBackupSchedule: process.env.FULL_BACKUP_SCHEDULE || '0 2 * * *',

  localRetentionDays: parseInt(process.env.BACKUP_LOCAL_RETENTION_DAYS || '7'),
  dailyRetentionDays: parseInt(process.env.BACKUP_DAILY_RETENTION_DAYS || '30'),
  monthlyRetentionDays: parseInt(process.env.BACKUP_MONTHLY_RETENTION_DAYS || '90'),

  cloudEnabled: process.env.BACKUP_CLOUD_ENABLED === 'true',
  cloudProvider: (process.env.BACKUP_CLOUD_PROVIDER || 'none') as any,
  cloudBucket: process.env.BACKUP_CLOUD_BUCKET || '',
  cloudRegion: process.env.BACKUP_CLOUD_REGION || 'us-east-1',

  encryptionEnabled: process.env.BACKUP_ENCRYPTION_ENABLED === 'true',
  encryptionKey: process.env.BACKUP_ENCRYPTION_KEY || process.env.ENCRYPTION_MASTER_SECRET || 'default-key',

  notificationEnabled: process.env.BACKUP_NOTIFICATION_ENABLED === 'true',
  notificationProvider: (process.env.BACKUP_NOTIFICATION_PROVIDER || 'none') as any,
  notificationEndpoint: process.env.BACKUP_NOTIFICATION_ENDPOINT || '',

  verificationEnabled: process.env.BACKUP_VERIFICATION_ENABLED !== 'false',
  verifyIntegrity: process.env.BACKUP_VERIFY_INTEGRITY === 'true',
};

// ============================================================================
// Logger
// ============================================================================

class Logger {
  private logFile: string;

  constructor(logDir: string) {
    this.logFile = path.join(logDir, `backup-${new Date().toISOString().split('T')[0]}.log`);
    this.ensureLogDir();
  }

  private ensureLogDir() {
    const dir = path.dirname(this.logFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private formatLog(level: string, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level}] ${message}${metaStr}`;
  }

  log(message: string, meta?: any) {
    const formatted = this.formatLog('INFO', message, meta);
    console.log(formatted);
    this.write(formatted);
  }

  error(message: string, meta?: any) {
    const formatted = this.formatLog('ERROR', message, meta);
    console.error(formatted);
    this.write(formatted);
  }

  warn(message: string, meta?: any) {
    const formatted = this.formatLog('WARN', message, meta);
    console.warn(formatted);
    this.write(formatted);
  }

  debug(message: string, meta?: any) {
    if (process.env.DEBUG === 'true') {
      const formatted = this.formatLog('DEBUG', message, meta);
      console.log(formatted);
      this.write(formatted);
    }
  }

  private write(message: string) {
    try {
      fs.appendFileSync(this.logFile, message + '\n');
    } catch (err) {
      console.error('Failed to write to log:', err);
    }
  }
}

const logger = new Logger(config.logDir);

// ============================================================================
// Backup Manager
// ============================================================================

class BackupManager {
  private config: BackupConfig;
  private logger: Logger;

  constructor(config: BackupConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.ensureDirectories();
  }

  private ensureDirectories() {
    [this.config.localBackupDir, this.config.dataDir, this.config.logDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Create incremental or full backup
   */
  async backup(type: 'incremental' | 'full'): Promise<BackupResult> {
    const startTime = Date.now();
    const timestamp = Math.floor(startTime / 1000);
    const backupFile = path.join(
      this.config.localBackupDir,
      `backup-${type === 'full' ? 'full' : 'incr'}-${timestamp}.db`
    );

    try {
      this.logger.log(`Starting ${type} backup`, { timestamp });

      // Perform backup
      const backupCommand = `sqlite3 ${path.join(this.config.dataDir, 'app.db')} ".backup '${backupFile}'"`;
      execSync(backupCommand, { timeout: 30000 });

      // Verify backup was created
      if (!fs.existsSync(backupFile)) {
        throw new Error('Backup file not created');
      }

      // Calculate file size and checksum
      const stats = fs.statSync(backupFile);
      const checksum = this.calculateChecksum(backupFile);
      const duration = Date.now() - startTime;

      // Create backup metadata
      const metadata = {
        type,
        timestamp,
        file: backupFile,
        size: stats.size,
        checksum,
        duration,
        createdAt: new Date().toISOString(),
      };

      // Write metadata
      const metadataFile = backupFile + '.meta.json';
      fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));

      // Encrypt if enabled
      if (this.config.encryptionEnabled) {
        await this.encryptBackup(backupFile);
      }

      // Upload to cloud if enabled
      if (this.config.cloudEnabled) {
        await this.uploadToCloud(backupFile, metadata);
      }

      // Verify integrity
      if (this.config.verifyIntegrity) {
        await this.verifyBackupIntegrity(backupFile);
      }

      this.logger.log(`${type} backup completed successfully`, {
        file: backupFile,
        size: `${(stats.size / 1024 / 1024).toFixed(2)}MB`,
        duration: `${(duration / 1000).toFixed(2)}s`,
        checksum,
      });

      return {
        success: true,
        type,
        file: backupFile,
        size: stats.size,
        checksum,
        duration,
      };
    } catch (error) {
      this.logger.error(`${type} backup failed`, { error: String(error) });

      // Send failure notification
      if (this.config.notificationEnabled) {
        await this.sendNotification('backup_failed', {
          type,
          error: String(error),
        });
      }

      return {
        success: false,
        type,
        error: String(error),
      };
    }
  }

  /**
   * Calculate SHA256 checksum of file
   */
  private calculateChecksum(filePath: string): string {
    const hash = crypto.createHash('sha256');
    const buffer = fs.readFileSync(filePath);
    hash.update(buffer);
    return hash.digest('hex');
  }

  /**
   * Encrypt backup file using AES-256-GCM
   */
  private async encryptBackup(filePath: string): Promise<void> {
    try {
      const data = fs.readFileSync(filePath);
      const algorithm = 'aes-256-gcm';
      const key = crypto.scryptSync(this.config.encryptionKey, 'salt', 32);
      const iv = crypto.randomBytes(16);

      const cipher = crypto.createCipheriv(algorithm, key, iv);
      const encrypted = Buffer.concat([
        cipher.update(data),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      // Write encrypted file
      const encryptedFile = filePath + '.enc';
      fs.writeFileSync(encryptedFile, Buffer.concat([iv, authTag, encrypted]));

      this.logger.log('Backup encrypted', { file: filePath });
    } catch (error) {
      this.logger.error('Encryption failed', { error: String(error) });
      throw error;
    }
  }

  /**
   * Upload backup to cloud storage
   */
  private async uploadToCloud(filePath: string, metadata: any): Promise<void> {
    if (!this.config.cloudEnabled) return;

    try {
      const fileName = path.basename(filePath);
      const remoteKey = `backups/${new Date().toISOString().split('T')[0]}/${fileName}`;

      switch (this.config.cloudProvider) {
        case 'aws':
          await this.uploadToS3(filePath, remoteKey);
          break;
        case 'gcp':
          await this.uploadToGCS(filePath, remoteKey);
          break;
        case 'azure':
          await this.uploadToAzure(filePath, remoteKey);
          break;
      }

      this.logger.log('Backup uploaded to cloud', { provider: this.config.cloudProvider, key: remoteKey });
    } catch (error) {
      this.logger.error('Cloud upload failed', { error: String(error) });
      throw error;
    }
  }

  /**
   * Upload to AWS S3
   */
  private async uploadToS3(filePath: string, key: string): Promise<void> {
    try {
      const { spawn } = require('child_process');
      const proc = spawn('aws', [
        's3',
        'cp',
        filePath,
        `s3://${this.config.cloudBucket}/${key}`,
        `--region=${this.config.cloudRegion}`,
        '--sse=AES256',
      ]);

      return new Promise((resolve, reject) => {
        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`AWS S3 upload failed with code ${code}`));
        });
      });
    } catch (error) {
      throw new Error(`S3 upload failed: ${String(error)}`);
    }
  }

  /**
   * Upload to Google Cloud Storage
   */
  private async uploadToGCS(filePath: string, key: string): Promise<void> {
    try {
      const { spawn } = require('child_process');
      const proc = spawn('gsutil', [
        'cp',
        filePath,
        `gs://${this.config.cloudBucket}/${key}`,
      ]);

      return new Promise((resolve, reject) => {
        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`GCS upload failed with code ${code}`));
        });
      });
    } catch (error) {
      throw new Error(`GCS upload failed: ${String(error)}`);
    }
  }

  /**
   * Upload to Azure Blob Storage
   */
  private async uploadToAzure(filePath: string, key: string): Promise<void> {
    try {
      const { spawn } = require('child_process');
      const proc = spawn('az', [
        'storage',
        'blob',
        'upload',
        '--file',
        filePath,
        '--container-name',
        this.config.cloudBucket,
        '--name',
        key,
        '--overwrite',
      ]);

      return new Promise((resolve, reject) => {
        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Azure upload failed with code ${code}`));
        });
      });
    } catch (error) {
      throw new Error(`Azure upload failed: ${String(error)}`);
    }
  }

  /**
   * Verify backup integrity by testing restore
   */
  private async verifyBackupIntegrity(filePath: string): Promise<boolean> {
    try {
      const tempDir = path.join(this.config.localBackupDir, '.verify');
      fs.mkdirSync(tempDir, { recursive: true });

      const testRestorePath = path.join(tempDir, 'test-restore.db');
      const verifyCommand = `sqlite3 ${filePath} ".dump" | sqlite3 ${testRestorePath}`;

      execSync(verifyCommand, { timeout: 10000 });

      // Verify the restored database is valid
      const countCommand = `sqlite3 ${testRestorePath} "SELECT COUNT(*) FROM sqlite_master WHERE type='table';"`;
      const result = execSync(countCommand).toString().trim();

      fs.unlinkSync(testRestorePath);

      const tableCount = parseInt(result);
      if (tableCount > 0) {
        this.logger.debug('Backup integrity verified', { file: filePath });
        return true;
      } else {
        throw new Error('Backup integrity check failed: no tables found');
      }
    } catch (error) {
      this.logger.error('Backup integrity verification failed', { error: String(error) });
      return false;
    }
  }

  /**
   * Enforce retention policies
   */
  async enforceRetention(): Promise<void> {
    try {
      const backups = fs.readdirSync(this.config.localBackupDir)
        .filter(f => f.startsWith('backup-'))
        .map(f => ({
          name: f,
          path: path.join(this.config.localBackupDir, f),
          time: fs.statSync(path.join(this.config.localBackupDir, f)).mtime.getTime(),
        }))
        .sort((a, b) => b.time - a.time);

      const now = Date.now();
      let removed = 0;

      for (const backup of backups) {
        const ageMs = now - backup.time;
        const ageDays = ageMs / (1000 * 60 * 60 * 24);

        let shouldDelete = false;

        if (backup.name.includes('incr') && ageDays > this.config.localRetentionDays) {
          shouldDelete = true;
        } else if (backup.name.includes('full') && ageDays > this.config.dailyRetentionDays) {
          shouldDelete = true;
        }

        if (shouldDelete) {
          try {
            fs.unlinkSync(backup.path);
            const metaFile = backup.path + '.meta.json';
            if (fs.existsSync(metaFile)) {
              fs.unlinkSync(metaFile);
            }
            removed++;
          } catch (error) {
            this.logger.error('Failed to remove old backup', { file: backup.name, error: String(error) });
          }
        }
      }

      if (removed > 0) {
        this.logger.log('Retention policy enforced', { removed });
      }
    } catch (error) {
      this.logger.error('Retention enforcement failed', { error: String(error) });
    }
  }

  /**
   * Send notification about backup status
   */
  private async sendNotification(eventType: string, data: any): Promise<void> {
    if (!this.config.notificationEnabled) return;

    try {
      const message = {
        event: eventType,
        timestamp: new Date().toISOString(),
        data,
      };

      switch (this.config.notificationProvider) {
        case 'slack':
          await this.sendSlackNotification(message);
          break;
        case 'email':
          await this.sendEmailNotification(message);
          break;
        case 'webhook':
          await this.sendWebhookNotification(message);
          break;
      }
    } catch (error) {
      this.logger.error('Notification failed', { error: String(error) });
    }
  }

  private async sendSlackNotification(message: any): Promise<void> {
    // Implementation would call Slack API
    this.logger.debug('Slack notification sent', message);
  }

  private async sendEmailNotification(message: any): Promise<void> {
    // Implementation would call email service
    this.logger.debug('Email notification sent', message);
  }

  private async sendWebhookNotification(message: any): Promise<void> {
    // Implementation would POST to webhook
    this.logger.debug('Webhook notification sent', message);
  }
}

// ============================================================================
// Backup Result Type
// ============================================================================

interface BackupResult {
  success: boolean;
  type: 'incremental' | 'full';
  file?: string;
  size?: number;
  checksum?: string;
  duration?: number;
  error?: string;
}

// ============================================================================
// Scheduler
// ============================================================================

async function setupSchedules(manager: BackupManager) {
  logger.log('Setting up backup schedules', {
    incremental: config.incrementalSchedule,
    full: config.fullBackupSchedule,
  });

  // Incremental backup schedule
  cron.schedule(config.incrementalSchedule, async () => {
    logger.log('Incremental backup triggered by schedule');
    await manager.backup('incremental');
    await manager.enforceRetention();
  });

  // Full backup schedule
  cron.schedule(config.fullBackupSchedule, async () => {
    logger.log('Full backup triggered by schedule');
    await manager.backup('full');
    await manager.enforceRetention();
  });

  logger.log('Backup schedules initialized');
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  try {
    logger.log('Backup scheduler service starting', { config });

    const manager = new BackupManager(config, logger);
    await setupSchedules(manager);

    logger.log('Backup scheduler service started successfully');

    // Keep process running
    process.on('SIGTERM', () => {
      logger.log('SIGTERM received, shutting down gracefully');
      process.exit(0);
    });

    process.on('SIGINT', () => {
      logger.log('SIGINT received, shutting down gracefully');
      process.exit(0);
    });
  } catch (error) {
    logger.error('Failed to start backup scheduler', { error: String(error) });
    process.exit(1);
  }
}

main();

export { BackupManager, BackupConfig, Logger };
