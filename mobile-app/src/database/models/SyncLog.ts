import { Model } from '@nozbe/watermelondb';
import { field, text, readonly, date } from '@nozbe/watermelondb/decorators';

export class SyncLog extends Model {
  static table = 'sync_log';

  @text('status') status!: string; // success, error, pending
  @text('entity_type') entityType!: string;
  @field('sync_duration_ms') syncDurationMs!: number;
  @field('items_synced') itemsSynced!: number;
  @text('error_message') errorMessage?: string;
  @readonly @date('timestamp') timestamp!: Date;

  isSuccess(): boolean {
    return this.status === 'success';
  }

  isError(): boolean {
    return this.status === 'error';
  }

  isPending(): boolean {
    return this.status === 'pending';
  }

  getDurationSeconds(): number {
    return this.syncDurationMs / 1000;
  }
}
