import db from '@db/connection';
import { logger } from '@utils/logger';
import AdapterFactory from '@adapters/AdapterFactory';
import EventEmitterService from '@services/EventEmitterService';
import {
  SyncConfiguration,
  TribunalSyncResult,
  SyncChanges,
  ProcessUpdateNotification,
  PollingConfiguration,
  SyncStatistics,
  ProcessMovementSnapshot,
  SyncQueue,
  SyncError,
  TribunalSyncError,
  SyncTimeoutError,
  SyncRateLimitError,
  TribunalUnavailableError,
} from '@types/tribunalSync';
import crypto from 'crypto';

export class TribunalPollingService {
  private activePolls = new Map<string, NodeJS.Timer>();
  private syncQueue: SyncQueue[] = [];
  private isProcessingQueue = false;
  private config: PollingConfiguration = {
    maxConcurrentSyncs: 5,
    defaultInterval: 60, // 60 minutes
    minInterval: 15,
    maxInterval: 24 * 60,
    staleDataThreshold: 24,
    retryBackoffMultiplier: 2,
    maxRetryDelay: 60000,
    enablePrioritization: true,
    enableBatching: true,
    batchSize: 10,
  };

  constructor(config?: Partial<PollingConfiguration>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  /**
   * Criar configuração de sincronização para um caso
   */
  async createSyncConfiguration(
    caseId: string,
    processNumber: string,
    tribunalCode: string,
    interval: number = this.config.defaultInterval,
  ): Promise<SyncConfiguration> {
    try {
      logger.info(
        `Criando configuração de sincronização para caso ${caseId}, processo ${processNumber}`,
      );

      const configId = crypto.randomUUID();
      const now = new Date();

      const config: SyncConfiguration = {
        id: configId,
        caseId,
        tribunalCode,
        processNumber,
        enabled: true,
        interval: Math.min(
          Math.max(interval, this.config.minInterval),
          this.config.maxInterval,
        ),
        maxRetries: 3,
        retryDelay: 5000,
        notifications: {
          onUpdate: true,
          onMovement: true,
          onDeadline: true,
          onError: true,
        },
        createdAt: now,
        updatedAt: now,
      };

      // Store in database
      const stmt = db.prepare(`
        INSERT INTO tribunal_sync_configurations
        (id, case_id, tribunal_code, process_number, enabled, interval,
         max_retries, retry_delay, notifications, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        config.id,
        config.caseId,
        config.tribunalCode,
        config.processNumber,
        config.enabled ? 1 : 0,
        config.interval,
        config.maxRetries,
        config.retryDelay,
        JSON.stringify(config.notifications),
        config.createdAt.toISOString(),
        config.updatedAt.toISOString(),
      );

      // Schedule first sync
      await this.scheduleSyncImmediately(configId);

      logger.info(`✓ Configuração de sincronização criada: ${configId}`);
      return config;
    } catch (error) {
      logger.error(
        { err: error },
        'Erro ao criar configuração de sincronização',
      );
      throw error;
    }
  }

  /**
   * Iniciar polling automático para uma configuração
   */
  async startPolling(configurationId: string): Promise<void> {
    try {
      if (this.activePolls.has(configurationId)) {
        logger.warn(`Polling já ativo para configuração ${configurationId}`);
        return;
      }

      const config = await this.getSyncConfiguration(configurationId);
      if (!config) {
        throw new Error(`Configuração ${configurationId} não encontrada`);
      }

      logger.info(
        `Iniciando polling para ${config.processNumber} (intervalo: ${config.interval}min)`,
      );

      // Schedule first sync
      await this.scheduleSyncImmediately(configurationId);

      // Setup recurring sync
      const interval = setInterval(() => {
        this.enqueueSyncJob(configurationId).catch((error) => {
          logger.error({ err: error }, `Erro ao enfileirar sync para ${configurationId}`);
        });
      }, config.interval * 60 * 1000);

      this.activePolls.set(configurationId, interval);

      logger.info(`✓ Polling iniciado para ${configurationId}`);
    } catch (error) {
      logger.error({ err: error }, 'Erro ao iniciar polling');
      throw error;
    }
  }

  /**
   * Parar polling automático para uma configuração
   */
  async stopPolling(configurationId: string): Promise<void> {
    try {
      const timer = this.activePolls.get(configurationId);
      if (timer) {
        clearInterval(timer);
        this.activePolls.delete(configurationId);
        logger.info(`Polling parado para ${configurationId}`);
      }
    } catch (error) {
      logger.error({ err: error }, 'Erro ao parar polling');
      throw error;
    }
  }

  /**
   * Enfileirar trabalho de sincronização
   */
  async enqueueSyncJob(configurationId: string): Promise<void> {
    try {
      const config = await this.getSyncConfiguration(configurationId);
      if (!config || !config.enabled) {
        return;
      }

      const priority = this.config.enablePrioritization
        ? await this.calculatePriority(configurationId)
        : 5;

      const queueEntry: SyncQueue = {
        id: crypto.randomUUID(),
        configurationId,
        caseId: config.caseId,
        processNumber: config.processNumber,
        tribunalCode: config.tribunalCode,
        priority,
        addedAt: new Date(),
        scheduledFor: new Date(),
        status: 'pending',
      };

      this.syncQueue.push(queueEntry);

      // Sort by priority if enabled
      if (this.config.enablePrioritization) {
        this.syncQueue.sort((a, b) => b.priority - a.priority);
      }

      logger.debug(
        `Trabalho de sync enfileirado para ${config.processNumber} (prioridade: ${priority})`,
      );

      // Start processing if not already processing
      if (!this.isProcessingQueue) {
        await this.processQueue();
      }
    } catch (error) {
      logger.error({ err: error }, 'Erro ao enfileirar trabalho de sync');
      throw error;
    }
  }

  /**
   * Processar fila de sincronização
   */
  private async processQueue(): Promise<void> {
    try {
      if (this.isProcessingQueue) {
        return;
      }

      this.isProcessingQueue = true;

      while (this.syncQueue.length > 0) {
        const batch = this.config.enableBatching
          ? this.syncQueue.splice(0, this.config.batchSize)
          : [this.syncQueue.shift()!];

        const promises = batch.map((job) => this.executeSyncJob(job));
        await Promise.allSettled(promises);
      }

      this.isProcessingQueue = false;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao processar fila de sync');
      this.isProcessingQueue = false;
    }
  }

  /**
   * Executar trabalho de sincronização
   */
  private async executeSyncJob(job: SyncQueue): Promise<void> {
    let retryCount = 0;
    const config = await this.getSyncConfiguration(job.configurationId);

    if (!config) {
      logger.error(`Configuração ${job.configurationId} não encontrada`);
      return;
    }

    while (retryCount <= config.maxRetries) {
      try {
        // Update queue status
        this.updateQueueStatus(job.id, 'running');

        // Execute sync
        const result = await this.executeSyncNow(job.configurationId);

        // Update queue status
        this.updateQueueStatus(job.id, 'completed');

        // Emit events if there are changes
        if (Object.values(result.changes).some((v) => v !== 0 && v !== false)) {
          await this.emitUpdateNotifications(
            job.caseId,
            result,
            config.notifications,
          );
        }

        return;
      } catch (error) {
        retryCount++;

        if (retryCount <= config.maxRetries) {
          const delay = Math.min(
            config.retryDelay * Math.pow(this.config.retryBackoffMultiplier, retryCount - 1),
            this.config.maxRetryDelay,
          );

          logger.warn(
            `Retry ${retryCount}/${config.maxRetries} para ${job.processNumber} em ${delay}ms`,
          );

          await this.delay(delay);
        } else {
          this.updateQueueStatus(job.id, 'failed');

          logger.error(
            { err: error },
            `Falha na sincronização do processo ${job.processNumber} após ${config.maxRetries} tentativas`,
          );

          // Store error for audit
          await this.storeSyncError(
            job.configurationId,
            error instanceof Error ? error.message : 'Erro desconhecido',
            retryCount,
          );

          // Send error notification
          if (config.notifications.onError) {
            await this.emitErrorNotification(job, error);
          }
        }
      }
    }
  }

  /**
   * Executar sincronização imediata
   */
  async executeSyncNow(configurationId: string): Promise<TribunalSyncResult> {
    try {
      const config = await this.getSyncConfiguration(configurationId);
      if (!config) {
        throw new Error(`Configuração ${configurationId} não encontrada`);
      }

      const startTime = Date.now();

      logger.info(
        `Executando sync para ${config.processNumber} em ${config.tribunalCode}`,
      );

      // Get current process data
      const currentProcess = await this.getCurrentProcessData(
        config.tribunalCode,
        config.processNumber,
      );

      // Get last snapshot
      const lastSnapshot = await this.getLastSnapshot(config.processNumber);

      // Detect changes
      const changes = this.detectChanges(lastSnapshot, currentProcess);

      // Store new snapshot
      await this.storeSnapshot(config.processNumber, currentProcess.movements);

      // Update process in database if needed
      if (changes.statusChanged) {
        await this.updateProcessStatus(config.caseId, currentProcess.status);
      }

      const syncTime = Date.now() - startTime;

      logger.info(
        `✓ Sync concluído para ${config.processNumber}: ${Object.values(changes).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0)} mudanças (${syncTime}ms)`,
      );

      return {
        configurationId,
        processNumber: config.processNumber,
        tribunalCode: config.tribunalCode,
        syncTime: new Date(),
        success: true,
        changes,
      };
    } catch (error) {
      logger.error(
        { err: error },
        `Erro ao executar sincronização de ${configurationId}`,
      );
      throw error;
    }
  }

  /**
   * Agendar sincronização imediata
   */
  private async scheduleSyncImmediately(configurationId: string): Promise<void> {
    try {
      await this.enqueueSyncJob(configurationId);
    } catch (error) {
      logger.error({ err: error }, 'Erro ao agendar sync imediato');
    }
  }

  /**
   * Obter estatísticas de sincronização
   */
  async getSyncStatistics(configurationId: string): Promise<SyncStatistics> {
    try {
      const stmt = db.prepare(`
        SELECT
          COUNT(*) as total_syncs,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_syncs,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_syncs,
          AVG(sync_time_ms) as average_sync_time,
          MAX(sync_time) as last_sync_time,
          SUM(movements_count) as total_movements,
          SUM(documents_count) as total_documents,
          SUM(deadlines_count) as total_deadlines
        FROM tribunal_sync_results
        WHERE configuration_id = ?
      `);

      const result = stmt.get(configurationId) as any;

      if (!result) {
        return {
          configurationId,
          totalSyncs: 0,
          successfulSyncs: 0,
          failedSyncs: 0,
          averageSyncTime: 0,
          totalUpdates: 0,
          totalMovements: 0,
          totalDocuments: 0,
          totalDeadlines: 0,
          errorRate: 0,
        };
      }

      const totalSyncs = result.total_syncs || 0;
      const failedSyncs = result.failed_syncs || 0;
      const successfulSyncs = result.successful_syncs || 0;

      return {
        configurationId,
        totalSyncs,
        successfulSyncs,
        failedSyncs,
        averageSyncTime: result.average_sync_time || 0,
        lastSyncTime: result.last_sync_time
          ? new Date(result.last_sync_time)
          : undefined,
        totalUpdates:
          (result.total_movements || 0) +
          (result.total_documents || 0) +
          (result.total_deadlines || 0),
        totalMovements: result.total_movements || 0,
        totalDocuments: result.total_documents || 0,
        totalDeadlines: result.total_deadlines || 0,
        errorRate:
          totalSyncs > 0 ? Math.round((failedSyncs / totalSyncs) * 100) : 0,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter estatísticas de sync');
      throw error;
    }
  }

  /**
   * Destruir todos os pollings ativos
   */
  async destroyAll(): Promise<void> {
    try {
      for (const [configId, timer] of this.activePolls) {
        clearInterval(timer);
        logger.info(`Polling parado para ${configId}`);
      }
      this.activePolls.clear();
    } catch (error) {
      logger.error({ err: error }, 'Erro ao destruir pollings');
    }
  }

  // Private helper methods

  private async getSyncConfiguration(
    configurationId: string,
  ): Promise<SyncConfiguration | null> {
    try {
      const stmt = db.prepare(`
        SELECT * FROM tribunal_sync_configurations
        WHERE id = ?
      `);

      const result = stmt.get(configurationId) as any;
      if (!result) return null;

      return {
        id: result.id,
        caseId: result.case_id,
        tribunalCode: result.tribunal_code,
        processNumber: result.process_number,
        enabled: result.enabled === 1,
        interval: result.interval,
        maxRetries: result.max_retries,
        retryDelay: result.retry_delay,
        notifications: JSON.parse(result.notifications),
        createdAt: new Date(result.created_at),
        updatedAt: new Date(result.updated_at),
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter configuração de sync');
      throw error;
    }
  }

  private async getCurrentProcessData(
    tribunalCode: string,
    processNumber: string,
  ): Promise<any> {
    try {
      const adapter = AdapterFactory.getAdapter(tribunalCode);
      // Use getProcess if available, otherwise use searchProcesses
      if (adapter.getProcess) {
        return await adapter.getProcess(processNumber);
      }
      const results = await adapter.searchProcesses({ });
      return results.find((p) => p.number === processNumber);
    } catch (error) {
      if (error instanceof Error && error.message.includes('não suportado')) {
        throw new TribunalUnavailableError(tribunalCode);
      }
      throw error;
    }
  }

  private async getLastSnapshot(
    processNumber: string,
  ): Promise<ProcessMovementSnapshot | null> {
    try {
      const stmt = db.prepare(`
        SELECT * FROM process_movement_snapshots
        WHERE process_number = ?
        ORDER BY snapshot_time DESC
        LIMIT 1
      `);

      const result = stmt.get(processNumber) as any;
      if (!result) return null;

      return {
        id: result.id,
        processNumber: result.process_number,
        movements: JSON.parse(result.movements),
        snapshotTime: new Date(result.snapshot_time),
        hash: result.hash,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter último snapshot');
      return null;
    }
  }

  private detectChanges(
    oldSnapshot: ProcessMovementSnapshot | null,
    newProcess: any,
  ): SyncChanges {
    const changes: SyncChanges = {
      newMovements: 0,
      updatedDeadlines: 0,
      newDocuments: 0,
      statusChanged: false,
      changedFields: [],
    };

    if (!oldSnapshot) {
      // First sync
      changes.newMovements = newProcess.movements?.length || 0;
      changes.newDocuments = newProcess.documents?.length || 0;
      changes.updatedDeadlines = newProcess.deadlines?.length || 0;
      return changes;
    }

    // Compare movements
    const oldMovementIds = new Set(
      oldSnapshot.movements.map((m: any) => m.id),
    );
    const newMovements =
      newProcess.movements?.filter(
        (m: any) => !oldMovementIds.has(m.id),
      ) || [];
    changes.newMovements = newMovements.length;

    if (newMovements.length > 0) {
      changes.changedFields.push('movements');
    }

    // Compare documents
    const oldDocumentCount = oldSnapshot.movements.length;
    const newDocumentCount = newProcess.documents?.length || 0;
    changes.newDocuments = Math.max(0, newDocumentCount - oldDocumentCount);

    if (changes.newDocuments > 0) {
      changes.changedFields.push('documents');
    }

    // Compare deadlines
    changes.updatedDeadlines = newProcess.deadlines?.length || 0;

    return changes;
  }

  private async storeSnapshot(
    processNumber: string,
    movements: any[],
  ): Promise<void> {
    try {
      const hash = crypto
        .createHash('sha256')
        .update(JSON.stringify(movements))
        .digest('hex');

      const stmt = db.prepare(`
        INSERT INTO process_movement_snapshots
        (id, process_number, movements, hash, snapshot_time)
        VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run(
        crypto.randomUUID(),
        processNumber,
        JSON.stringify(movements),
        hash,
        new Date().toISOString(),
      );
    } catch (error) {
      logger.error({ err: error }, 'Erro ao armazenar snapshot');
    }
  }

  private async updateProcessStatus(caseId: string, status: string): Promise<void> {
    try {
      const stmt = db.prepare(`
        UPDATE cases
        SET status = ?, updated_at = ?
        WHERE id = ?
      `);

      stmt.run(status, new Date().toISOString(), caseId);
    } catch (error) {
      logger.error({ err: error }, 'Erro ao atualizar status do processo');
    }
  }

  private async emitUpdateNotifications(
    caseId: string,
    result: TribunalSyncResult,
    notifications: any,
  ): Promise<void> {
    if (result.changes.newMovements > 0 && notifications.onMovement) {
      EventEmitterService.emit('tribunal-update', {
        caseId,
        type: 'new_movement',
        changes: result.changes,
      });
    }

    if (result.changes.statusChanged && notifications.onUpdate) {
      EventEmitterService.emit('tribunal-update', {
        caseId,
        type: 'status_change',
        changes: result.changes,
      });
    }
  }

  private async emitErrorNotification(
    job: SyncQueue,
    error: unknown,
  ): Promise<void> {
    EventEmitterService.emit('sync-error', {
      configurationId: job.configurationId,
      processNumber: job.processNumber,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }

  private async calculatePriority(configurationId: string): Promise<number> {
    try {
      const config = await this.getSyncConfiguration(configurationId);
      if (!config) return 5;

      // Priority score: 1-10 (10 is highest)
      // Based on deadline proximity and activity
      const movements = await this.getRecentMovements(config.processNumber);
      const deadlines = await this.getUpcomingDeadlines(config.caseId);

      let score = 5; // Default priority

      // Increase priority based on recent activity
      score += Math.min(movements.length, 3);

      // Increase priority based on deadline proximity
      const urgentDeadlines = deadlines.filter(
        (d: any) => d.daysUntil < 7,
      );
      score += Math.min(urgentDeadlines.length * 2, 3);

      return Math.min(score, 10);
    } catch (error) {
      logger.warn('Erro ao calcular prioridade, usando padrão');
      return 5;
    }
  }

  private async getRecentMovements(processNumber: string): Promise<any[]> {
    try {
      const stmt = db.prepare(`
        SELECT * FROM process_movements
        WHERE process_number = ?
        AND date > datetime('now', '-7 days')
      `);

      return stmt.all(processNumber) as any[];
    } catch {
      return [];
    }
  }

  private async getUpcomingDeadlines(caseId: string): Promise<any[]> {
    try {
      const stmt = db.prepare(`
        SELECT *, CAST((julianday(due_date) - julianday('now')) AS INTEGER) as days_until
        FROM deadlines
        WHERE case_id = ?
        AND due_date > datetime('now')
      `);

      return stmt.all(caseId) as any[];
    } catch {
      return [];
    }
  }

  private updateQueueStatus(
    jobId: string,
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled',
  ): void {
    const job = this.syncQueue.find((j) => j.id === jobId);
    if (job) {
      job.status = status;
    }
  }

  private async storeSyncError(
    configurationId: string,
    errorMessage: string,
    retryCount: number,
  ): Promise<void> {
    try {
      const stmt = db.prepare(`
        INSERT INTO tribunal_sync_errors
        (id, configuration_id, error_code, error_message, retry_count, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        crypto.randomUUID(),
        configurationId,
        'SYNC_ERROR',
        errorMessage,
        retryCount,
        new Date().toISOString(),
      );
    } catch (error) {
      logger.error({ err: error }, 'Erro ao armazenar erro de sync');
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default new TribunalPollingService();
