import { Model } from '@nozbe/watermelondb';
import { field, text, readonly, date, relation } from '@nozbe/watermelondb/decorators';

export class Transaction extends Model {
  static table = 'transactions';

  @text('server_id') serverId!: string;
  @text('document_id') documentId!: string;
  @text('type') type!: string; // income, expense, transfer
  @text('category') category!: string;
  @field('amount') amount!: number;
  @text('currency') currency!: string; // BRL, USD, etc.
  @text('description') description!: string;
  @field('date') date!: number;
  @text('payee') payee!: string;
  @text('account') account!: string;
  @text('notes') notes?: string;
  @readonly @date('created_at') createdAt!: Date;
  @field('updated_at') updatedAt!: number;
  @field('synced_at') syncedAt?: number;
  @field('sync_pending') syncPending!: boolean;

  isLocal(): boolean {
    return !this.serverId || this.serverId.startsWith('local_');
  }

  isPending(): boolean {
    return this.syncPending;
  }

  getDateAsDate(): Date {
    return new Date(this.date);
  }

  setDate(date: Date): void {
    this.date = date.getTime();
  }
}
