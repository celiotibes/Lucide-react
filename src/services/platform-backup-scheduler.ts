/**
 * Platform-Specific Backup Scheduler
 * Handles automated backup scheduling for each platform
 */

import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import cron from 'node-cron';

export interface BackupScheduleConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  timeOfDay: string; // HH:mm format (e.g., "02:00")
  retentionDays: number;
  backupPath: string;
  databasePath: string;
}

export class PlatformBackupScheduler {
  private config: BackupScheduleConfig;
  private cronJob: cron.ScheduledTask | null = null;

  constructor(config: BackupScheduleConfig) {
    this.config = config;
  }

  /**
   * Initializes and starts the backup scheduler
   */
  async initialize(): Promise<void> {
    try {
      // Create backup directory
      await fs.ensureDir(this.config.backupPath);

      if (this.config.enabled) {
        this.scheduleBackups();
        console.log('[BackupScheduler] Backup scheduler initialized and running');
      } else {
        console.log('[BackupScheduler] Backup scheduler disabled');
      }
    } catch (error) {
      console.error('[BackupScheduler] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Schedules backups based on frequency and time
   */
  private scheduleBackups(): void {
    const [hours, minutes] = this.config.timeOfDay.split(':').map(Number);

    let cronExpression: string;

    switch (this.config.frequency) {
      case 'daily':
        // Every day at specified time
        cronExpression = `${minutes} ${hours} * * *`;
        break;

      case 'weekly':
        // Every Monday at specified time
        cronExpression = `${minutes} ${hours} * * 1`;
        break;

      case 'monthly':
        // First day of month at specified time
        cronExpression = `${minutes} ${hours} 1 * *`;
        break;

      default:
        cronExpression = `${minutes} ${hours} * * *`;
    }

    this.cronJob = cron.schedule(cronExpression, async () => {
      console.log('[BackupScheduler] Running scheduled backup...');
      try {
        await this.performBackup();
        await this.cleanupOldBackups();
        console.log('[BackupScheduler] Scheduled backup completed successfully');
      } catch (error) {
        console.error('[BackupScheduler] Scheduled backup failed:', error);
      }
    });

    console.log(`[BackupScheduler] Cron job scheduled: ${cronExpression}`);
  }

  /**
   * Performs a backup of the database
   */
  async performBackup(): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFilename = `app-backup-${timestamp}.db`;
      const backupPath = path.join(this.config.backupPath, backupFilename);

      // Copy database file to backup location
      await fs.copy(this.config.databasePath, backupPath);

      // Make backup read-only on Unix systems
      if (process.platform !== 'win32') {
        await fs.chmod(backupPath, 0o400); // r-------- (read-only)
      }

      console.log(`[BackupScheduler] Backup created: ${backupFilename}`);
      return backupPath;
    } catch (error) {
      console.error('[BackupScheduler] Backup failed:', error);
      throw error;
    }
  }

  /**
   * Cleans up old backups based on retention policy
   */
  async cleanupOldBackups(): Promise<void> {
    try {
      const files = await fs.readdir(this.config.backupPath);
      const now = Date.now();
      const maxAge = this.config.retentionDays * 24 * 60 * 60 * 1000;

      for (const file of files) {
        if (!file.startsWith('app-backup-') || !file.endsWith('.db')) {
          continue;
        }

        const filePath = path.join(this.config.backupPath, file);
        const stats = await fs.stat(filePath);
        const fileAge = now - stats.mtimeMs;

        if (fileAge > maxAge) {
          await fs.remove(filePath);
          console.log(`[BackupScheduler] Deleted old backup: ${file}`);
        }
      }
    } catch (error) {
      console.error('[BackupScheduler] Cleanup failed:', error);
      // Don't throw - cleanup failure shouldn't break the application
    }
  }

  /**
   * Platform-specific scheduler setup (Windows Scheduled Tasks)
   */
  async setupWindowsScheduledTask(): Promise<void> {
    if (process.platform !== 'win32') {
      return;
    }

    try {
      const taskName = 'CRMT-AutoBackup';
      const appPath = process.execPath;
      const taskArgs = '--backup';

      const [hours, minutes] = this.config.timeOfDay.split(':');
      const startTime = `${hours}:${minutes}`;

      const command = `schtasks.exe /create /tn "${taskName}" /tr "${appPath} ${taskArgs}" /sc daily /st ${startTime} /f`;

      execSync(command);
      console.log('[BackupScheduler] Windows scheduled task created successfully');
    } catch (error) {
      console.warn('[BackupScheduler] Failed to create Windows scheduled task:', error);
      // Don't throw - fallback to Node.js cron is acceptable
    }
  }

  /**
   * Platform-specific scheduler setup (macOS LaunchAgent)
   */
  async setupMacOSLaunchAgent(): Promise<void> {
    if (process.platform !== 'darwin') {
      return;
    }

    try {
      const homedir = require('os').homedir();
      const launchAgentPath = path.join(
        homedir,
        'Library/LaunchAgents',
        'com.lucidereact.crmt.backup.plist'
      );

      const [hours, minutes] = this.config.timeOfDay.split(':');

      const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.lucidereact.crmt.backup</string>

  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>--backup</string>
  </array>

  <key>StartCalendarInterval</key>
  <array>
    <dict>
      <key>Hour</key>
      <integer>${parseInt(hours)}</integer>
      <key>Minute</key>
      <integer>${parseInt(minutes)}</integer>
    </dict>
  </array>

  <key>StandardOutPath</key>
  <string>$HOME/.lucide-react/logs/backup.log</string>

  <key>StandardErrorPath</key>
  <string>$HOME/.lucide-react/logs/backup-error.log</string>
</dict>
</plist>`;

      await fs.ensureDir(path.dirname(launchAgentPath));
      await fs.writeFile(launchAgentPath, plistContent, 'utf-8');

      // Make plist readable/writable only by owner
      await fs.chmod(launchAgentPath, 0o600);

      console.log('[BackupScheduler] macOS LaunchAgent created successfully');
    } catch (error) {
      console.warn('[BackupScheduler] Failed to create macOS LaunchAgent:', error);
      // Don't throw - fallback to Node.js cron is acceptable
    }
  }

  /**
   * Stops the backup scheduler
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      console.log('[BackupScheduler] Backup scheduler stopped');
    }
  }
}

/**
 * Factory function to create platform-specific scheduler
 */
export async function createPlatformBackupScheduler(
  config: BackupScheduleConfig
): Promise<PlatformBackupScheduler> {
  const scheduler = new PlatformBackupScheduler(config);

  await scheduler.initialize();

  // Setup platform-specific scheduling in addition to Node.js cron
  try {
    if (process.platform === 'win32') {
      await scheduler.setupWindowsScheduledTask();
    } else if (process.platform === 'darwin') {
      await scheduler.setupMacOSLaunchAgent();
    }
  } catch (error) {
    console.warn('[BackupScheduler] Platform-specific setup failed, using Node.js cron only:', error);
  }

  return scheduler;
}
