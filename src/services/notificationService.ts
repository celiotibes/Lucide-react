/**
 * Notification Service - FASE 7.4
 * Toast notifications para alertas críticos do monitoring
 */

export type NotificationType = 'success' | 'warning' | 'error' | 'info'

export interface Notification {
  id: string
  type: NotificationType
  message: string
  duration?: number // ms, 0 = permanent
  action?: {
    label: string
    onClick: () => void
  }
  timestamp: Date
}

type NotificationListener = (notification: Notification) => void
type NotificationRemoveListener = (id: string) => void

class NotificationService {
  private listeners: Set<NotificationListener> = new Set()
  private removeListeners: Set<NotificationRemoveListener> = new Set()
  private notifications: Map<string, Notification> = new Map()
  private counter = 0

  subscribe(listener: NotificationListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onRemove(listener: NotificationRemoveListener): () => void {
    this.removeListeners.add(listener)
    return () => this.removeListeners.delete(listener)
  }

  private generateId(): string {
    return `notif_${++this.counter}_${Date.now()}`
  }

  private notifyListeners(notification: Notification): void {
    this.listeners.forEach(listener => listener(notification))
  }

  private notifyRemovalListeners(id: string): void {
    this.removeListeners.forEach(listener => listener(id))
  }

  show(
    message: string,
    type: NotificationType = 'info',
    duration: number = 5000,
    action?: { label: string; onClick: () => void }
  ): string {
    const id = this.generateId()
    const notification: Notification = {
      id,
      type,
      message,
      duration,
      action,
      timestamp: new Date(),
    }

    this.notifications.set(id, notification)
    this.notifyListeners(notification)

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => this.remove(id), duration)
    }

    return id
  }

  success(message: string, duration: number = 5000): string {
    return this.show(message, 'success', duration)
  }

  warning(message: string, duration: number = 7000): string {
    return this.show(message, 'warning', duration)
  }

  error(message: string, duration: number = 10000): string {
    return this.show(message, 'error', duration)
  }

  info(message: string, duration: number = 5000): string {
    return this.show(message, 'info', duration)
  }

  remove(id: string): void {
    if (this.notifications.has(id)) {
      this.notifications.delete(id)
      this.notifyRemovalListeners(id)
    }
  }

  clear(): void {
    const ids = Array.from(this.notifications.keys())
    ids.forEach(id => this.remove(id))
  }

  getAll(): Notification[] {
    return Array.from(this.notifications.values()).sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    )
  }
}

export const notificationService = new NotificationService()
