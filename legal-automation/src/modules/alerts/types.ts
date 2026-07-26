// src/modules/alerts/types.ts

export type AlertType = 'deadline' | 'document' | 'payment' | 'decision' | 'deadline_at_risk';
export type AlertPriority = 'critical' | 'high' | 'medium' | 'low';
export type AlertChannel = 'email' | 'sms' | 'push' | 'in_app';
export type AlertStatus = 'pending' | 'sent' | 'failed' | 'delivered';

export interface Alert {
  id: string;
  userId: string;
  caseId?: string;
  type: AlertType;
  priority: AlertPriority;
  title: string;
  message: string;
  actionUrl?: string;
  metadata?: Record<string, any>;
  scheduleFor?: Date;
  status: AlertStatus;
  createdAt: Date;
  sentAt?: Date;
  failureReason?: string;
}

export interface AlertRule {
  id: string;
  userId: string;
  name: string;
  active: boolean;
  type: AlertType;
  priority: AlertPriority;
  conditions: AlertCondition[];
  channels: AlertChannel[];
  notifyBefore: number; // days
  frequency: 'once' | 'daily' | 'weekly';
  createdAt: Date;
  updatedAt: Date;
}

export interface AlertCondition {
  field: 'deadline' | 'case_status' | 'document_count' | 'claim_amount' | 'time_since_filed';
  operator: 'equals' | 'greater_than' | 'less_than' | 'between' | 'contains';
  value: string | number | string[];
}

export interface DeadlineAlert {
  id: string;
  caseId: string;
  deadlineId: string;
  title: string;
  dueDate: Date;
  daysUntilDeadline: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  related_cases: string[];
  suggested_actions: string[];
  createdAt: Date;
}

export interface PredictiveAlert {
  id: string;
  caseId: string;
  type: string;
  prediction: string;
  confidence: number; // 0-100
  reasoning: string;
  recommendedActions: string[];
  scheduledFor: Date;
}

export interface AlertHistory {
  id: string;
  userId: string;
  caseId?: string;
  type: AlertType;
  sentVia: AlertChannel[];
  sentAt: Date;
  readAt?: Date;
  actionTaken?: boolean;
  actionTakenAt?: Date;
}

export interface AlertPreference {
  id: string;
  userId: string;
  alertType: AlertType;
  enabled: boolean;
  preferredChannels: AlertChannel[];
  quietHours: {
    enabled: boolean;
    startTime: string; // HH:MM format
    endTime: string; // HH:MM format
    timezone: string;
  };
  dailyDigest: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AlertConfig {
  smtp: {
    host: string;
    port: number;
    user: string;
    password: string;
    from: string;
  };
  sms?: {
    provider: 'twilio' | 'aws' | 'custom';
    accountSid?: string;
    authToken?: string;
  };
  pushNotification?: {
    provider: 'firebase' | 'apns' | 'custom';
    serverKey?: string;
  };
}
