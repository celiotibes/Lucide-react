// ============ TRIBUNAL SYNC TYPES ============

export interface SyncConfiguration {
  id: string;
  caseId: string;
  tribunalCode: string;
  processNumber: string;
  enabled: boolean;
  interval: number; // Minutes between syncs
  maxRetries: number;
  retryDelay: number; // Milliseconds
  notifications: {
    onUpdate: boolean;
    onMovement: boolean;
    onDeadline: boolean;
    onError: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

export interface SyncSchedule {
  id: string;
  configurationId: string;
  nextSyncTime: Date;
  lastSyncTime?: Date;
  status: 'pending' | 'running' | 'completed' | 'failed';
  retryCount: number;
  lastError?: string;
  updatedAt: Date;
}

export interface TribunalSyncResult {
  configurationId: string;
  processNumber: string;
  tribunalCode: string;
  syncTime: Date;
  success: boolean;
  changes: SyncChanges;
  errors?: string[];
  metadata?: Record<string, any>;
}

export interface SyncChanges {
  newMovements: number;
  updatedDeadlines: number;
  newDocuments: number;
  statusChanged: boolean;
  oldStatus?: string;
  newStatus?: string;
  changedFields: string[];
}

export interface ProcessUpdateNotification {
  id: string;
  caseId: string;
  processNumber: string;
  tribunalCode: string;
  updateType:
    | 'new_movement'
    | 'status_change'
    | 'new_document'
    | 'deadline_alert'
    | 'sync_error';
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  data: Record<string, any>;
  read: boolean;
  readAt?: Date;
  createdAt: Date;
  expiresAt: Date;
}

export interface PollingConfiguration {
  maxConcurrentSyncs: number; // Maximum parallel sync operations
  defaultInterval: number; // Default sync interval in minutes
  minInterval: number; // Minimum allowed interval
  maxInterval: number; // Maximum allowed interval
  staleDataThreshold: number; // Hours after which data is considered stale
  retryBackoffMultiplier: number; // Exponential backoff multiplier
  maxRetryDelay: number; // Maximum retry delay in milliseconds
  enablePrioritization: boolean; // Prioritize cases based on activity
  enableBatching: boolean; // Batch multiple sync requests
  batchSize: number; // Number of syncs per batch
}

export interface SyncStatistics {
  configurationId: string;
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  averageSyncTime: number; // Milliseconds
  lastSyncTime?: Date;
  totalUpdates: number;
  totalMovements: number;
  totalDocuments: number;
  totalDeadlines: number;
  errorRate: number; // Percentage
}

export interface ProcessMovementSnapshot {
  id: string;
  processNumber: string;
  movements: ProcessMovement[];
  snapshotTime: Date;
  hash: string; // Hash of movements for change detection
}

export interface ProcessMovement {
  id: string;
  type: string;
  description: string;
  date: Date;
  origin?: string;
}

export interface SyncQueue {
  id: string;
  configurationId: string;
  caseId: string;
  processNumber: string;
  tribunalCode: string;
  priority: number; // 1-10, 10 is highest
  addedAt: Date;
  scheduledFor: Date;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
}

export interface SyncError {
  id: string;
  configurationId: string;
  errorCode: string;
  errorMessage: string;
  timestamp: Date;
  retryCount: number;
  nextRetryTime?: Date;
  details?: Record<string, any>;
}

// ============ SYNC ERROR TYPES ============

export class TribunalSyncError extends Error {
  constructor(
    public code: string,
    message: string,
    public originalError?: Error,
  ) {
    super(message);
    this.name = 'TribunalSyncError';
  }
}

export class SyncTimeoutError extends TribunalSyncError {
  constructor(processNumber: string) {
    super(
      'SYNC_TIMEOUT',
      `Sincronização do processo ${processNumber} expirou`,
    );
    this.name = 'SyncTimeoutError';
  }
}

export class SyncRateLimitError extends TribunalSyncError {
  constructor(tribunalCode: string) {
    super(
      'RATE_LIMIT',
      `Limite de requisições para ${tribunalCode} foi atingido`,
    );
    this.name = 'SyncRateLimitError';
  }
}

export class TribunalUnavailableError extends TribunalSyncError {
  constructor(tribunalCode: string) {
    super(
      'TRIBUNAL_UNAVAILABLE',
      `Tribunal ${tribunalCode} indisponível no momento`,
    );
    this.name = 'TribunalUnavailableError';
  }
}

export class ProcessNotFoundInTribunalError extends TribunalSyncError {
  constructor(processNumber: string) {
    super(
      'PROCESS_NOT_FOUND',
      `Processo ${processNumber} não encontrado no tribunal`,
    );
    this.name = 'ProcessNotFoundInTribunalError';
  }
}

export interface PriorityScoreInput {
  caseDeadlineProximity: number; // Days until deadline (lower = higher priority)
  caseActivity: number; // Recent number of movements (higher = higher priority)
  lastSyncAge: number; // Hours since last sync (higher = higher priority)
  casePriority: 'low' | 'medium' | 'high' | 'critical'; // User-defined priority
  syncFailureCount: number; // Number of consecutive failures (higher = higher priority)
}
