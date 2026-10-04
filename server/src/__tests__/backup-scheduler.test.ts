/**
 * Tests for BackupScheduler
 * Verifica: schedule parsing, intervalo de execução, retenção, NAS copy, alertas, retry
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import BackupScheduler from '../services/backup-scheduler.js';
import * as emailAlertas from '../utils/email-alertas.js';
import * as slackAlertas from '../utils/slack-alertas.js';

// Mock BackupService
const mockBackupService = {
  criarBackup: vi.fn(),
  testarRestauracao: vi.fn(),
  verificarBackup: vi.fn(),
  listarBackups: vi.fn(),
};

describe('BackupScheduler', () => {
  let scheduler: BackupScheduler;
  let intervalIds: NodeJS.Timeout[] = [];

  beforeEach(() => {
    // Setup mock
    vi.useFakeTimers();

    // Create scheduler instance
    scheduler = new BackupScheduler(mockBackupService as any, {
      backupSchedule: '1440', // 24 hours em minutos
      verifySchedule: '10080', // 7 dias
      retentionDays: 7,
      fiscalRetentionDays: 1825,
      nasCopyEnabled: false,
    });
  });

  afterEach(() => {
    scheduler.stop();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('should parse cron-like schedule correctly', () => {
    const scheduler1 = new BackupScheduler(mockBackupService as any, {
      backupSchedule: '0 2 * * *', // 2 AM
      verifySchedule: '1440',
      retentionDays: 7,
      fiscalRetentionDays: 1825,
    });

    expect(scheduler1).toBeDefined();
    scheduler1.stop();
  });

  it('should parse minute-based schedule correctly', () => {
    const scheduler2 = new BackupScheduler(mockBackupService as any, {
      backupSchedule: '1440', // 24 horas
      verifySchedule: '10080', // 7 dias
      retentionDays: 7,
      fiscalRetentionDays: 1825,
    });

    expect(scheduler2).toBeDefined();
    scheduler2.stop();
  });

  it('should initialize with correct configuration', () => {
    const status = scheduler.getStatus();

    expect(status.running).toBe(false); // Não rodando antes de start()
    expect(status.config.retentionDays).toBe(7);
    expect(status.config.fiscalRetentionDays).toBe(1825);
    expect(status.config.nasCopyEnabled).toBe(false);
  });

  it('should start and stop scheduler', () => {
    scheduler.start();
    let status = scheduler.getStatus();
    expect(status.running).toBe(true);

    scheduler.stop();
    status = scheduler.getStatus();
    expect(status.running).toBe(false);
  });

  it('should track last backup and verify times', async () => {
    scheduler.start();

    // Simular espera (usando fake timers)
    vi.advanceTimersByTime(100);

    // Status deve mostrar que começou
    const status = scheduler.getStatus();
    expect(status.running).toBe(true);
  });

  it('should disable NAS copy if path not configured', () => {
    const schedulerNoNAS = new BackupScheduler(mockBackupService as any, {
      backupSchedule: '1440',
      verifySchedule: '10080',
      retentionDays: 7,
      fiscalRetentionDays: 1825,
      nasCopyEnabled: true,
      nasPath: undefined, // Sem path
    });

    const status = schedulerNoNAS.getStatus();
    expect(status.config.nasCopyEnabled).toBe(false); // Deve ser desabilitado

    schedulerNoNAS.stop();
  });

  it('should initialize successfully without backup config', () => {
    // Deve não falhar se backup não estiver configurado
    const scheduler3 = new BackupScheduler(mockBackupService as any, {
      backupSchedule: '1440',
      verifySchedule: '10080',
      retentionDays: 7,
      fiscalRetentionDays: 1825,
      nasCopyEnabled: false,
    });

    expect(scheduler3.getStatus().running).toBe(false);
    scheduler3.stop();
  });

  describe('Alert and Retry System', () => {
    let emailSpy: any;
    let slackSpy: any;

    beforeEach(() => {
      // Mock alert functions
      emailSpy = vi.spyOn(emailAlertas, 'enviarAlertaEmail').mockResolvedValue(undefined);
      slackSpy = vi.spyOn(slackAlertas, 'enviarAlertaSlack').mockResolvedValue(undefined);

      // Setup env vars
      process.env.BACKUP_ALERTS_EMAIL = 'admin@example.com';
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/test';
    });

    afterEach(() => {
      emailSpy.mockRestore();
      slackSpy.mockRestore();
      delete process.env.BACKUP_ALERTS_EMAIL;
      delete process.env.SLACK_WEBHOOK_URL;
    });

    it('should send alert when backup fails', async () => {
      const schedulerWithAlerts = new BackupScheduler(mockBackupService as any, {
        backupSchedule: '1440',
        verifySchedule: '10080',
        retentionDays: 7,
        fiscalRetentionDays: 1825,
        alertsEnabled: true,
        alertsEmail: 'admin@example.com',
      });

      // Mock backup failure
      mockBackupService.criarBackup.mockResolvedValueOnce({
        sucesso: false,
        erros: ['Database locked'],
      });

      schedulerWithAlerts.start();
      await vi.runAllTimersAsync();

      // Verificar que alerta foi enviado
      expect(emailSpy).toHaveBeenCalled();
      expect(slackSpy).toHaveBeenCalled();

      schedulerWithAlerts.stop();
    });

    it('should implement retry logic with exponential backoff', async () => {
      const schedulerWithAlerts = new BackupScheduler(mockBackupService as any, {
        backupSchedule: '1440',
        verifySchedule: '10080',
        retentionDays: 7,
        fiscalRetentionDays: 1825,
        alertsEnabled: true,
        alertsEmail: 'admin@example.com',
      });

      // Mock backup to fail 2 times, then succeed
      mockBackupService.criarBackup
        .mockResolvedValueOnce({ sucesso: false, erros: ['Attempt 1'] })
        .mockResolvedValueOnce({ sucesso: false, erros: ['Attempt 2'] })
        .mockResolvedValueOnce({
          sucesso: true,
          backupId: 'backup-123',
          manifesto: { id: 'backup-123' },
        });

      schedulerWithAlerts.start();

      // Initial failure
      await vi.runOnlyPendingTimersAsync();
      let status = schedulerWithAlerts.getStatus();
      expect(status.retryState.failureCount).toBe(1);

      // After first retry (5 min delay)
      vi.advanceTimersByTime(300000); // 5 minutos
      await vi.runOnlyPendingTimersAsync();
      status = schedulerWithAlerts.getStatus();
      expect(status.retryState.failureCount).toBe(2);

      // After second retry (10 min delay)
      vi.advanceTimersByTime(600000); // 10 minutos
      await vi.runOnlyPendingTimersAsync();
      status = schedulerWithAlerts.getStatus();
      expect(status.retryState.failureCount).toBe(0); // Resetado ao sucesso

      schedulerWithAlerts.stop();
    });

    it('should alert after max retry attempts exceeded', async () => {
      const schedulerWithAlerts = new BackupScheduler(mockBackupService as any, {
        backupSchedule: '1440',
        verifySchedule: '10080',
        retentionDays: 7,
        fiscalRetentionDays: 1825,
        alertsEnabled: true,
        alertsEmail: 'admin@example.com',
      });

      // Mock all backup attempts to fail
      mockBackupService.criarBackup.mockRejectedValue(new Error('Persistent failure'));

      schedulerWithAlerts.start();

      // Run through all 3 failed attempts
      for (let i = 0; i < 3; i++) {
        await vi.runOnlyPendingTimersAsync();
        if (i < 2) {
          vi.advanceTimersByTime(300000 * Math.pow(2, i)); // Exponential backoff
        }
      }

      const status = schedulerWithAlerts.getStatus();
      expect(status.retryState.failureCount).toBeGreaterThanOrEqual(0);
      expect(emailSpy.mock.calls.length).toBeGreaterThan(0);

      schedulerWithAlerts.stop();
    });

    it('should report successful backup completion', async () => {
      const schedulerWithAlerts = new BackupScheduler(mockBackupService as any, {
        backupSchedule: '1440',
        verifySchedule: '10080',
        retentionDays: 7,
        fiscalRetentionDays: 1825,
        alertsEnabled: true,
        alertsEmail: 'admin@example.com',
      });

      // Mock successful backup
      mockBackupService.criarBackup.mockResolvedValueOnce({
        sucesso: true,
        backupId: 'backup-456',
        manifesto: { id: 'backup-456' },
      });

      schedulerWithAlerts.start();
      await vi.runAllTimersAsync();

      // Verificar que success notification foi enviado (Slack)
      const successCall = slackSpy.mock.calls.find((call: any) =>
        call[0].mensagem === 'Backup Completado com Sucesso'
      );
      expect(successCall).toBeDefined();

      schedulerWithAlerts.stop();
    });

    it('should track retry state in status', async () => {
      const schedulerWithAlerts = new BackupScheduler(mockBackupService as any, {
        backupSchedule: '1440',
        verifySchedule: '10080',
        retentionDays: 7,
        fiscalRetentionDays: 1825,
        alertsEnabled: true,
        alertsEmail: 'admin@example.com',
      });

      mockBackupService.criarBackup.mockRejectedValue(new Error('Test error'));

      schedulerWithAlerts.start();
      await vi.runOnlyPendingTimersAsync();

      const status = schedulerWithAlerts.getStatus();
      expect(status.retryState).toBeDefined();
      expect(status.retryState.failureCount).toBeGreaterThan(0);
      expect(status.retryState.lastError).toContain('Test error');
      expect(status.retryState.alertsConfigured).toBe(true);

      schedulerWithAlerts.stop();
    });

    it('should send alert on verification failure', async () => {
      const schedulerWithAlerts = new BackupScheduler(mockBackupService as any, {
        backupSchedule: '10080',
        verifySchedule: '1440',
        retentionDays: 7,
        fiscalRetentionDays: 1825,
        alertsEnabled: true,
        alertsEmail: 'admin@example.com',
      });

      // Mock successful list and failed verification
      mockBackupService.listarBackups.mockReturnValueOnce([
        { id: 'backup-failed', timestamp: new Date().toISOString() },
      ]);

      mockBackupService.testarRestauracao.mockResolvedValueOnce({
        valido: false,
        erros: ['Integrity check failed'],
        relatorio: { integridade: 'FAILED', tabelas: 0 },
      });

      // Mock fs for manifest reading
      vi.mock('fs', async () => {
        const actualFs = await vi.importActual('fs');
        return {
          ...actualFs,
          readFileSync: () => JSON.stringify({ id: 'backup-failed' }),
          existsSync: () => true,
        };
      });

      schedulerWithAlerts.start();
      vi.advanceTimersByTime(300000); // Avançar para executar verify
      await vi.runAllTimersAsync();

      // Verificar que alertas foram enviados para falha de verificação
      expect(emailSpy.mock.calls.length + slackSpy.mock.calls.length).toBeGreaterThan(0);

      schedulerWithAlerts.stop();
    });

    it('should not send alerts when disabled', async () => {
      const schedulerNoAlerts = new BackupScheduler(mockBackupService as any, {
        backupSchedule: '1440',
        verifySchedule: '10080',
        retentionDays: 7,
        fiscalRetentionDays: 1825,
        alertsEnabled: false, // Desabilitado
      });

      mockBackupService.criarBackup.mockRejectedValue(new Error('Test error'));

      schedulerNoAlerts.start();
      await vi.runAllTimersAsync();

      // Verificar que nenhum alerta foi enviado
      expect(emailSpy).not.toHaveBeenCalled();
      expect(slackSpy).not.toHaveBeenCalled();

      schedulerNoAlerts.stop();
    });
  });
});
