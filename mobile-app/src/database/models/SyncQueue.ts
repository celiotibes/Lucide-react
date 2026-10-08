import { Model } from '@nozbe/watermelondb';
import { field, text, readonly, date } from '@nozbe/watermelondb/decorators';

export class SyncQueue extends Model {
  static table = 'sync_queue';

  @text('entity_type') entityType!: string; // document, transaction, property
  @text('entity_id') entityId!: string;
  @text('operation') operation!: string; // create, update, delete
  @text('payload') payload!: string; // JSON stringified
  @field('retry_count') retryCount!: number;
  @text('last_error') lastError?: string;
  @readonly @date('created_at') createdAt!: Date;
  @field('attempted_at') attemptedAt?: number;

  getPayload() {
    try {
      return JSON.parse(this.payload);
    } catch (e) {
      return null;
    }
  }

  setPayload(data: any): void {
    this.payload = JSON.stringify(data);
  }

  canRetry(): boolean {
    const MAX_RETRIES = 3;
    return this.retryCount < MAX_RETRIES;
  }

  incrementRetry(): void {
    this.retryCount += 1;
  }

  setError(error: any): void {
    this.lastError = error instanceof Error ? error.message : String(error);
    this.attemptedAt = Date.now();
  }

  getRetryDelay(): number {
    // Exponential backoff: 1s, 2s, 4s
    return Math.pow(2, this.retryCount) * 1000;
  }
}
