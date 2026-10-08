/**
 * Setup Wizard Types
 * Defines all TypeScript interfaces for setup wizard configuration
 */

export type AIProvider = 'anthropic' | 'openai' | 'gemini' | 'local';
export type BackupFrequency = 'hourly' | 'daily' | 'weekly' | 'monthly';
export type BackupDestination = 'local' | 's3' | 'google-drive' | 'azure-blob';
export type Platform = 'macos' | 'windows' | 'docker' | 'linux' | 'web';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AIProviderConfig {
  provider: AIProvider;
  anthropic?: {
    apiKey: string;
    model: string;
  };
  openai?: {
    apiKey: string;
    model: string;
  };
  gemini?: {
    apiKey: string;
    model: string;
  };
  local?: {
    endpoint: string;
    model: string;
  };
}

export interface DatabaseConfig {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
  sslEnabled: boolean;
}

export interface BackupConfig {
  enabled: boolean;
  frequency: BackupFrequency;
  retentionDays: number;
  destinations: BackupDestination[];
  s3?: {
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
  googleDrive?: {
    folderId: string;
    serviceAccount: string;
  };
}

export interface PlatformSpecificConfig {
  platform: Platform;
  macos?: {
    appVersion: string;
    autoUpdateEnabled: boolean;
  };
  windows?: {
    appVersion: string;
    autoUpdateEnabled: boolean;
    scheduledBackupTime: string;
  };
  docker?: {
    composeVersion: string;
    networkName: string;
    volumeName: string;
  };
}

export interface GeneralConfig {
  appName: string;
  appPort: number;
  logLevel: LogLevel;
}

export interface SetupWizardConfig {
  id: string;
  setupCompleted: boolean;
  completedAt?: Date;
  lastUpdatedAt: Date;

  aiProvider: AIProviderConfig;
  database: DatabaseConfig;
  backup: BackupConfig;
  platformSpecific: PlatformSpecificConfig;
  general: GeneralConfig;

  gdprConsentGiven: boolean;
  gdprConsentTimestamp?: Date;
  analyticsEnabled: boolean;

  metadata?: Record<string, any>;
}

export interface SetupStep {
  id: string;
  title: string;
  description: string;
  order: number;
  fields: SetupField[];
  validation?: (values: Record<string, any>) => ValidationError[];
}

export interface SetupField {
  name: string;
  type: 'text' | 'password' | 'number' | 'select' | 'checkbox' | 'textarea';
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  validation?: (value: any) => string | null;
  conditional?: (values: Record<string, any>) => boolean;
}

export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

export interface SetupStepResponse {
  stepId: string;
  data: Record<string, any>;
  valid: boolean;
  errors?: ValidationError[];
}

export interface AIProviderValidationResult {
  provider: AIProvider;
  model: string;
  isValid: boolean;
  error?: string;
  responseTimeMs?: number;
  capabilities?: Record<string, any>;
  validatedAt: Date;
}

export interface CredentialBackup {
  id: string;
  configId: string;
  backupType: 'manual' | 'scheduled' | 'pre_update';
  destination: BackupDestination;
  path?: string;
  sizeBytes?: number;
  checksumSha256?: string;
  status: 'pending' | 'in_progress' | 'success' | 'failed';
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  retentionUntil: Date;
  createdAt: Date;
}

export interface SetupWizardAuditLog {
  id: string;
  configId: string;
  action: 'created' | 'updated' | 'validated' | 'completed' | 'error' | 'rollback';
  changedFields?: string[];
  status: 'success' | 'partial_failure' | 'failure';
  errorMessage?: string;
  validationErrors?: ValidationError[];
  userIp?: string;
  userAgent?: string;
  createdAt: Date;
}
