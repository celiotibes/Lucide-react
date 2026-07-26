// src/modules/mobile/types.ts

export interface MobileUser {
  id: string;
  email: string;
  name: string;
  role: 'lawyer' | 'client' | 'admin';
  avatar?: string;
  lastLogin: Date;
  deviceTokens: string[];
}

export interface MobileSession {
  id: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  deviceId: string;
  ipAddress: string;
  userAgent: string;
  active: boolean;
}

export interface MobileNotification {
  id: string;
  userId: string;
  type: 'case_update' | 'deadline' | 'document' | 'billing' | 'general';
  title: string;
  message: string;
  caseId?: string;
  actionUrl?: string;
  read: boolean;
  createdAt: Date;
  readAt?: Date;
}

export interface MobileCase {
  id: string;
  caseNumber: string;
  title: string;
  status: 'open' | 'closed' | 'suspended' | 'appealed';
  summary: string;
  plaintiff: string;
  defendant: string;
  claimAmount?: number;
  nextDeadline?: Date;
  progress: number; // 0-100
  documentCount: number;
  timeEntryCount: number;
  lastUpdated: Date;
}

export interface MobileDocument {
  id: string;
  caseId: string;
  name: string;
  type: 'petition' | 'response' | 'evidence' | 'decision' | 'other';
  fileSize: number;
  uploadedAt: Date;
  signedAt?: Date;
  url: string;
  thumbnail?: string;
}

export interface MobileTimeEntry {
  id: string;
  caseId: string;
  taskType: string;
  description: string;
  duration: number; // minutes
  amount: number; // calculated billing
  startTime: Date;
  endTime: Date;
  billable: boolean;
  tags: string[];
}

export interface MobilePushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  caseId?: string;
  actionUrl?: string;
  badge?: number;
  sound?: 'default' | 'custom';
}

export interface MobileAppConfig {
  apiBaseUrl: string;
  appVersion: string;
  minVersionRequired: string;
  features: {
    offlineMode: boolean;
    biometric: boolean;
    documentScan: boolean;
    voiceNotes: boolean;
  };
  theme: {
    primary: string;
    secondary: string;
    accent: string;
  };
}

export interface SyncStatus {
  id: string;
  userId: string;
  lastSyncTime: Date;
  pendingChanges: number;
  syncInProgress: boolean;
  lastError?: string;
  retryCount: number;
}

export interface CaseUpdate {
  id: string;
  caseId: string;
  type: 'status_change' | 'document_added' | 'deadline_added' | 'note_added' | 'time_logged';
  description: string;
  timestamp: Date;
  actor: string;
  metadata?: Record<string, any>;
}

export interface MobileDeadline {
  id: string;
  caseId: string;
  title: string;
  description: string;
  dueDate: Date;
  reminderDays: number;
  reminderSent: boolean;
  completed: boolean;
  completedAt?: Date;
  type: 'legal' | 'internal' | 'billing';
}
