export interface WebSocketMessage {
  type: 'ocr-progress' | 'workflow-update' | 'petition-status' | 'notification' | 'error';
  data: Record<string, any>;
  timestamp: string;
  userId?: string;
  correlationId?: string;
}

export interface OCRProgressEvent {
  type: 'ocr-progress';
  data: {
    fileId: string;
    status: 'processing' | 'completed' | 'failed';
    progress: number; // 0-100
    message: string;
    extractedText?: string;
    confidence?: number;
    error?: string;
  };
}

export interface WorkflowUpdateEvent {
  type: 'workflow-update';
  data: {
    workflowId: string;
    executionId: string;
    status: 'running' | 'completed' | 'failed' | 'paused';
    currentStep: number;
    totalSteps: number;
    stepName: string;
    progress: number; // 0-100
    message: string;
    error?: string;
  };
}

export interface PetitionStatusEvent {
  type: 'petition-status';
  data: {
    petitionId: string;
    status: 'draft' | 'submitted' | 'processing' | 'approved' | 'rejected';
    message: string;
    timestamp: string;
    caseNumber?: string;
    error?: string;
  };
}

export interface NotificationEvent {
  type: 'notification';
  data: {
    title: string;
    message: string;
    level: 'info' | 'warning' | 'error' | 'success';
    actionUrl?: string;
  };
}

export type AnyWebSocketEvent =
  | OCRProgressEvent
  | WorkflowUpdateEvent
  | PetitionStatusEvent
  | NotificationEvent
  | { type: 'error'; data: { message: string; code: string } };

export interface WebSocketConnection {
  userId: string;
  clientId: string;
  connectedAt: Date;
}
