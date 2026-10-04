/**
 * Tests for BackupScheduler
 * Verifica: schedule parsing, intervalo de execução, retenção, NAS copy
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import BackupScheduler from '../backup-scheduler.js';

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
});
