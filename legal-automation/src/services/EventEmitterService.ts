import { EventEmitter } from 'events';
import { logger } from '@utils/logger';
import {
  OCRProgressEvent,
  WorkflowUpdateEvent,
  PetitionStatusEvent,
  NotificationEvent,
} from 'websocket';
import { webSocketManager } from './WebSocketManager';

class EventEmitterService extends EventEmitter {
  emitOCRProgress(userId: string, event: Omit<OCRProgressEvent, 'type'>): void {
    const fullEvent: OCRProgressEvent = {
      type: 'ocr-progress',
      ...event,
    };

    logger.info(
      { userId, fileId: event.data.fileId, status: event.data.status },
      'OCR progress event emitted'
    );

    this.emit('ocr-progress', { userId, event: fullEvent });
    webSocketManager.sendToUser(userId, fullEvent);
  }

  emitWorkflowUpdate(userId: string, event: Omit<WorkflowUpdateEvent, 'type'>): void {
    const fullEvent: WorkflowUpdateEvent = {
      type: 'workflow-update',
      ...event,
    };

    logger.info(
      { userId, workflowId: event.data.workflowId, status: event.data.status },
      'Workflow update event emitted'
    );

    this.emit('workflow-update', { userId, event: fullEvent });
    webSocketManager.sendToUser(userId, fullEvent);
  }

  emitPetitionStatus(userId: string, event: Omit<PetitionStatusEvent, 'type'>): void {
    const fullEvent: PetitionStatusEvent = {
      type: 'petition-status',
      ...event,
    };

    logger.info(
      { userId, petitionId: event.data.petitionId, status: event.data.status },
      'Petition status event emitted'
    );

    this.emit('petition-status', { userId, event: fullEvent });
    webSocketManager.sendToUser(userId, fullEvent);
  }

  emitNotification(userId: string, event: Omit<NotificationEvent, 'type'>): void {
    const fullEvent: NotificationEvent = {
      type: 'notification',
      ...event,
    };

    logger.info(
      { userId, title: event.data.title },
      'Notification event emitted'
    );

    this.emit('notification', { userId, event: fullEvent });
    webSocketManager.sendToUser(userId, fullEvent);
  }

  emitError(userId: string, message: string, code: string): void {
    logger.error(
      { userId, code, message },
      'Error event emitted'
    );

    const event = {
      type: 'error' as const,
      data: { message, code },
    };

    this.emit('error', { userId, event });
    webSocketManager.sendToUser(userId, event);
  }
}

export const eventEmitterService = new EventEmitterService();

export default eventEmitterService;
