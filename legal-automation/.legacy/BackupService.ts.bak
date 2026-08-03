import db from '@db/connection';
import { logger } from '@utils/logger';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import {
  BackupConfiguration,
  BackupJob,
  BackupFile,
  RestoreJob,
  BackupMetrics,
  HealthCheck,
  BackupStatus,
  StorageBackend,
  BackupExecutionError,
  RestoreExecutionError,
  VerificationError,
} from '@/types/backup';

export class BackupService {
  private backupDir = path.join(process.env.DATA_DIR || './data', 'backups');

  constructor() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  async createBackupConfiguration(config: Partial<BackupConfiguration>): Promise<BackupConfiguration> {
    try {
      logger.info(`Criando configuração de backup: ${config.name}`);

      const backupConfig: BackupConfiguration = {
        id: crypto.randomUUID(),
        name: config.name || `backup-${Date.now()}`,
        type: config.type || 'full',
        frequency: config.frequency || 'daily',
        retentionDays: config.retentionDays || 30,
        storageBackends: config.storageBackends || ['local'],
        includeDatabase: config.includeDatabase !== false,
        includeFiles: config.includeFiles !== false,
        includeConfigs: config.includeConfigs !== false,
        notifyOnCompletion: config.notifyOnCompletion !== false,
        notifyOnFailure: config.notifyOnFailure !== false,
        isEnabled: config.isEnabled !== false,
        nextRunAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.storeBackupConfiguration(backupConfig);
      logger.info(`✓ Configuração de backup ${backupConfig.id} criada`);

      return backupConfig;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao criar configuração de backup');
      throw error;
    }
  }

  async executeBackup(configId: string): Promise<BackupJob> {
    try {
      logger.info(`Iniciando backup (Config: ${configId})`);

      const jobId = crypto.randomUUID();
      const startTime = Date.now();

      // Executar backup do banco de dados
      const dbBackupPath = await this.backupDatabase();

      // Executar backup de arquivos
      const filesBackupPath = await this.backupFiles();

      // Comprimir e calcular checksum
      const { compressedPath, checksum, fileSize } = await this.compressBackup(
        dbBackupPath,
        filesBackupPath
      );

      // Armazenar em múltiplos backends
      const storageInfo = await this.storeBackupFiles(compressedPath, 'local');

      const duration = Math.floor((Date.now() - startTime) / 1000);

      const job: BackupJob = {
        id: jobId,
        backupConfigId: configId,
        type: 'full',
        status: 'completed',
        startedAt: new Date(startTime),
        completedAt: new Date(),
        dataSize: fileSize,
        compressedSize: fs.statSync(compressedPath).size,
        duration,
        filesBackedUp: 1,
        tablesBackedUp: 1,
        checksum,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.storeBackupJob(job);
      this.cleanupOldBackups(configId, 30);

      logger.info(`✓ Backup ${jobId} concluído (${job.compressedSize} bytes)`);

      return job;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao executar backup');
      throw new BackupExecutionError('Falha ao executar backup');
    }
  }

  async restoreFromBackup(
    backupJobId: string,
    targetEnvironment: string,
    performedBy: string
  ): Promise<RestoreJob> {
    try {
      logger.info(`Iniciando restauração de backup ${backupJobId}`);

      const job: RestoreJob = {
        id: crypto.randomUUID(),
        restorePointId: backupJobId,
        targetEnvironment: targetEnvironment as any,
        status: 'in_progress',
        startedAt: new Date(),
        itemsRestored: 0,
        duration: 0,
        verificationPassed: false,
        performedBy,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Recuperar arquivo de backup
      const backupFile = await this.retrieveBackupFile(backupJobId);

      if (!backupFile) {
        throw new RestoreExecutionError('Arquivo de backup não encontrado');
      }

      // Extrair e restaurar
      const extractPath = await this.extractBackup(backupFile.storagePath);
      await this.restoreDatabase(extractPath);
      await this.restoreFiles(extractPath);

      // Verificar integridade
      const verificationPassed = await this.verifyRestoration();

      job.status = verificationPassed ? 'completed' : 'failed';
      job.completedAt = new Date();
      job.duration = Math.floor((job.completedAt.getTime() - job.startedAt.getTime()) / 1000);
      job.verificationPassed = verificationPassed;
      job.itemsRestored = 1;

      this.storeRestoreJob(job);

      logger.info(`✓ Restauração ${job.id} concluída`);
      return job;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao restaurar backup');
      throw new RestoreExecutionError('Falha ao restaurar backup');
    }
  }

  async verifyBackup(backupJobId: string): Promise<boolean> {
    try {
      logger.info(`Verificando integridade do backup ${backupJobId}`);

      const backup = this.getBackupJob(backupJobId);
      if (!backup) {
        throw new VerificationError('Backup não encontrado');
      }

      const backupFile = await this.retrieveBackupFile(backupJobId);
      if (!backupFile) {
        throw new VerificationError('Arquivo de backup não acessível');
      }

      const calculatedChecksum = await this.calculateChecksum(backupFile.storagePath);
      const isValid = calculatedChecksum === backupFile.checksum;

      if (isValid) {
        logger.info(`✓ Backup ${backupJobId} verificado com sucesso`);
      } else {
        logger.error(`✗ Checksum inválido para backup ${backupJobId}`);
      }

      return isValid;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao verificar backup');
      throw error;
    }
  }

  async getBackupMetrics(): Promise<BackupMetrics> {
    try {
      const jobs = await this.getAllBackupJobs();

      const successful = jobs.filter(j => j.status === 'completed').length;
      const failed = jobs.filter(j => j.status === 'failed').length;
      const total = jobs.length;

      const avgDuration = total > 0
        ? jobs.reduce((sum, j) => sum + j.duration, 0) / total
        : 0;

      const totalSize = jobs.reduce((sum, j) => sum + j.compressedSize, 0);

      return {
        totalBackups: total,
        successfulBackups: successful,
        failedBackups: failed,
        lastBackupTime: jobs[0]?.completedAt || new Date(),
        nextBackupTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        averageBackupDuration: avgDuration,
        totalBackupSize: totalSize,
        compressionRatio: this.calculateCompressionRatio(jobs),
        storageUtilization: { local: totalSize },
        successRate: total > 0 ? Math.round((successful / total) * 100) : 0,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter métricas de backup');
      throw error;
    }
  }

  async performHealthCheck(): Promise<HealthCheck> {
    try {
      const metrics = await this.getBackupMetrics();

      const status = metrics.successRate >= 90 ? 'healthy' : 'warning';
      const message = `Últimos ${metrics.totalBackups} backups: ${metrics.successRate}% de sucesso`;

      const check: HealthCheck = {
        id: crypto.randomUUID(),
        type: 'backup',
        status: status as any,
        message,
        details: {
          lastBackupTime: metrics.lastBackupTime,
          successRate: metrics.successRate,
          totalBackupSize: metrics.totalBackupSize,
        },
        timestamp: new Date(),
        createdAt: new Date(),
      };

      this.storeHealthCheck(check);
      return check;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao executar health check');
      throw error;
    }
  }

  // Private methods
  private async backupDatabase(): Promise<string> {
    const backupPath = path.join(this.backupDir, `db-backup-${Date.now()}.sql`);
    // Simulando backup do banco (em produção seria dump SQL real)
    fs.writeFileSync(backupPath, 'Database backup content');
    return backupPath;
  }

  private async backupFiles(): Promise<string> {
    const backupPath = path.join(this.backupDir, `files-backup-${Date.now()}.tar`);
    // Simulando backup de arquivos
    fs.writeFileSync(backupPath, 'Files backup content');
    return backupPath;
  }

  private async compressBackup(
    dbPath: string,
    filesPath: string
  ): Promise<{ compressedPath: string; checksum: string; fileSize: number }> {
    const compressedPath = path.join(this.backupDir, `backup-${Date.now()}.tar.gz`);
    const fileSize = fs.statSync(dbPath).size + fs.statSync(filesPath).size;

    // Simulando compressão
    fs.writeFileSync(compressedPath, 'Compressed backup');

    const checksum = await this.calculateChecksum(compressedPath);

    return { compressedPath, checksum, fileSize };
  }

  private async calculateChecksum(filePath: string): Promise<string> {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private async storeBackupFiles(
    backupPath: string,
    backend: StorageBackend
  ): Promise<any> {
    logger.info(`Armazenando backup em ${backend}`);
    // Simulando armazenamento em backend de storage
    return { backend, storagePath: backupPath, uploadedAt: new Date() };
  }

  private async retrieveBackupFile(backupJobId: string): Promise<any> {
    const stmt = db.prepare('SELECT * FROM backup_files WHERE backup_job_id = ? LIMIT 1');
    return stmt.get(backupJobId);
  }

  private async extractBackup(backupPath: string): Promise<string> {
    const extractPath = path.join(this.backupDir, `extract-${Date.now()}`);
    // Simulando extração
    if (!fs.existsSync(extractPath)) {
      fs.mkdirSync(extractPath, { recursive: true });
    }
    return extractPath;
  }

  private async restoreDatabase(extractPath: string): Promise<void> {
    logger.info(`Restaurando banco de dados de ${extractPath}`);
    // Simulando restauração do banco
  }

  private async restoreFiles(extractPath: string): Promise<void> {
    logger.info(`Restaurando arquivos de ${extractPath}`);
    // Simulando restauração de arquivos
  }

  private async verifyRestoration(): Promise<boolean> {
    logger.info('Verificando restauração...');
    // Simulando verificação
    return true;
  }

  private cleanupOldBackups(configId: string, retentionDays: number): void {
    try {
      const cutoffDate = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      const files = fs.readdirSync(this.backupDir);

      files.forEach(file => {
        const filePath = path.join(this.backupDir, file);
        const stats = fs.statSync(filePath);

        if (stats.mtimeMs < cutoffDate) {
          fs.unlinkSync(filePath);
          logger.info(`Backup antigo deletado: ${file}`);
        }
      });
    } catch (error) {
      logger.error({ err: error }, 'Erro ao limpar backups antigos');
    }
  }

  private calculateCompressionRatio(jobs: BackupJob[]): number {
    const totalOriginal = jobs.reduce((sum, j) => sum + j.dataSize, 0);
    const totalCompressed = jobs.reduce((sum, j) => sum + j.compressedSize, 0);

    if (totalOriginal === 0) return 0;
    return Math.round(((totalOriginal - totalCompressed) / totalOriginal) * 100);
  }

  private storeBackupConfiguration(config: BackupConfiguration): void {
    try {
      const stmt = db.prepare(`
        INSERT INTO backup_configurations
        (id, name, type, frequency, retention_days, storage_backends, include_database, include_files, include_configs, notify_on_completion, notify_on_failure, is_enabled, next_run_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        config.id,
        config.name,
        config.type,
        config.frequency,
        config.retentionDays,
        JSON.stringify(config.storageBackends),
        config.includeDatabase ? 1 : 0,
        config.includeFiles ? 1 : 0,
        config.includeConfigs ? 1 : 0,
        config.notifyOnCompletion ? 1 : 0,
        config.notifyOnFailure ? 1 : 0,
        config.isEnabled ? 1 : 0,
        config.nextRunAt.toISOString(),
        config.createdAt.toISOString(),
        config.updatedAt.toISOString()
      );
    } catch (error) {
      logger.error({ err: error }, 'Erro ao armazenar configuração de backup');
    }
  }

  private storeBackupJob(job: BackupJob): void {
    try {
      const stmt = db.prepare(`
        INSERT INTO backup_jobs
        (id, backup_config_id, type, status, started_at, completed_at, failure_reason, data_size, compressed_size, duration, files_backed_up, tables_backed_up, checksum, metadata, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        job.id,
        job.backupConfigId,
        job.type,
        job.status,
        job.startedAt.toISOString(),
        job.completedAt?.toISOString(),
        job.failureReason,
        job.dataSize,
        job.compressedSize,
        job.duration,
        job.filesBackedUp,
        job.tablesBackedUp,
        job.checksum,
        JSON.stringify(job.metadata || {}),
        job.createdAt.toISOString(),
        job.updatedAt.toISOString()
      );
    } catch (error) {
      logger.error({ err: error }, 'Erro ao armazenar job de backup');
    }
  }

  private storeRestoreJob(job: RestoreJob): void {
    try {
      const stmt = db.prepare(`
        INSERT INTO restore_jobs
        (id, restore_point_id, target_environment, status, started_at, completed_at, failure_reason, items_restored, duration, verification_passed, performed_by, metadata, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        job.id,
        job.restorePointId,
        job.targetEnvironment,
        job.status,
        job.startedAt.toISOString(),
        job.completedAt?.toISOString(),
        job.failureReason,
        job.itemsRestored,
        job.duration,
        job.verificationPassed ? 1 : 0,
        job.performedBy,
        JSON.stringify(job.metadata || {}),
        job.createdAt.toISOString(),
        job.updatedAt.toISOString()
      );
    } catch (error) {
      logger.error({ err: error }, 'Erro ao armazenar job de restauração');
    }
  }

  private storeHealthCheck(check: HealthCheck): void {
    try {
      const stmt = db.prepare(`
        INSERT INTO backup_health_checks
        (id, type, status, message, details, timestamp, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        check.id,
        check.type,
        check.status,
        check.message,
        JSON.stringify(check.details || {}),
        check.timestamp.toISOString(),
        check.createdAt.toISOString()
      );
    } catch (error) {
      logger.error({ err: error }, 'Erro ao armazenar health check');
    }
  }

  private async getBackupJob(jobId: string): Promise<BackupJob | null> {
    try {
      const stmt = db.prepare('SELECT * FROM backup_jobs WHERE id = $1');
      return (await stmt.get(jobId)) as BackupJob | null;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter backup job');
      return null;
    }
  }

  private async getAllBackupJobs(): Promise<BackupJob[]> {
    try {
      const stmt = db.prepare('SELECT * FROM backup_jobs ORDER BY created_at DESC LIMIT 100');
      return (await stmt.all()) as BackupJob[];
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter todos os backup jobs');
      return [];
    }
  }
}

export default new BackupService();
