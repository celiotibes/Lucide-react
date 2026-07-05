// ============ BACKUP & DISASTER RECOVERY TYPES ============

export type BackupType = 'full' | 'incremental' | 'differential';

export type BackupStatus =
  | 'scheduled'
  | 'running'
  | 'completed'
  | 'failed'
  | 'verified'
  | 'archived';

export type RestoreStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'verified';

export type StorageBackend = 's3' | 'gcs' | 'azure' | 'local' | 'ftp';

export interface BackupConfiguration {
  id: string;
  name: string;
  type: BackupType;
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  retentionDays: number;
  storageBackends: StorageBackend[];
  includeDatabase: boolean;
  includeFiles: boolean;
  includeConfigs: boolean;
  notifyOnCompletion: boolean;
  notifyOnFailure: boolean;
  isEnabled: boolean;
  lastRunAt?: Date;
  nextRunAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface BackupJob {
  id: string;
  backupConfigId: string;
  type: BackupType;
  status: BackupStatus;
  startedAt: Date;
  completedAt?: Date;
  failureReason?: string;
  dataSize: number;
  compressedSize: number;
  duration: number; // seconds
  filesBackedUp: number;
  tablesBackedUp: number;
  checksum: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface BackupFile {
  id: string;
  backupJobId: string;
  storageBackend: StorageBackend;
  storagePath: string;
  fileName: string;
  fileSize: number;
  compressedSize: number;
  checksum: string;
  encryptionAlgorithm?: string;
  isVerified: boolean;
  verifiedAt?: Date;
  uploadedAt: Date;
  expiresAt: Date;
  createdAt: Date;
}

export interface RestorePoint {
  id: string;
  timestamp: Date;
  backupJobId: string;
  description?: string;
  rtoMinutes: number; // Recovery Time Objective
  rpoMinutes: number; // Recovery Point Objective
  isVerified: boolean;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface RestoreJob {
  id: string;
  restorePointId: string;
  targetEnvironment: 'development' | 'staging' | 'production';
  status: RestoreStatus;
  startedAt: Date;
  completedAt?: Date;
  failureReason?: string;
  itemsRestored: number;
  duration: number; // seconds
  verificationPassed: boolean;
  performedBy: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReplicationConfig {
  id: string;
  name: string;
  sourceDatabase: string;
  targetDatabase: string;
  replicationLag: number; // seconds
  isActive: boolean;
  lastReplicationAt?: Date;
  nextReplicationAt: Date;
  conflictResolution: 'source_wins' | 'target_wins' | 'manual';
  monitoringEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DisasterRecoveryPlan {
  id: string;
  name: string;
  description?: string;
  rtoMinutes: number;
  rpoMinutes: number;
  recoveryProcedures: RecoveryProcedure[];
  backupConfigurations: string[]; // IDs
  replicationConfigurations: string[]; // IDs
  testSchedule: 'weekly' | 'monthly' | 'quarterly';
  lastTestAt?: Date;
  nextTestAt: Date;
  owner: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecoveryProcedure {
  id: string;
  name: string;
  description: string;
  steps: RecoveryStep[];
  estimatedDuration: number; // minutes
  requiredRoles: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface RecoveryStep {
  order: number;
  description: string;
  actionScript?: string;
  successCriteria: string;
  rollbackScript?: string;
}

export interface BackupMetrics {
  totalBackups: number;
  successfulBackups: number;
  failedBackups: number;
  lastBackupTime: Date;
  nextBackupTime: Date;
  averageBackupDuration: number; // seconds
  totalBackupSize: number;
  compressionRatio: number;
  storageUtilization: Record<string, number>;
  successRate: number; // percentage
}

export interface HealthCheck {
  id: string;
  type: 'backup' | 'replication' | 'restore';
  status: 'healthy' | 'warning' | 'critical';
  message: string;
  details?: Record<string, any>;
  timestamp: Date;
  createdAt: Date;
}

export interface BackupSchedule {
  id: string;
  dayOfWeek?: number; // 0-6
  dayOfMonth?: number; // 1-31
  time: string; // HH:mm
  timezone: string;
  durationMinutes: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StorageCredentials {
  id: string;
  backend: StorageBackend;
  region: string;
  endpoint: string;
  accessKey: string; // encrypted
  secretKey: string; // encrypted
  bucketName: string;
  isActive: boolean;
  testedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ============ ERROR TYPES ============

export class BackupError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

export class BackupExecutionError extends BackupError {
  constructor(message: string) {
    super('BACKUP_EXECUTION_ERROR', message);
    this.name = 'BackupExecutionError';
  }
}

export class RestoreExecutionError extends BackupError {
  constructor(message: string) {
    super('RESTORE_EXECUTION_ERROR', message);
    this.name = 'RestoreExecutionError';
  }
}

export class StorageError extends BackupError {
  constructor(message: string) {
    super('STORAGE_ERROR', message);
    this.name = 'StorageError';
  }
}

export class VerificationError extends BackupError {
  constructor(message: string) {
    super('VERIFICATION_ERROR', message);
    this.name = 'VerificationError';
  }
}

export class ReplicationError extends BackupError {
  constructor(message: string) {
    super('REPLICATION_ERROR', message);
    this.name = 'ReplicationError';
  }
}
