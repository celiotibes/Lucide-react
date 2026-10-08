import { Model } from '@nozbe/watermelondb';
import { field, text, readonly, date } from '@nozbe/watermelondb/decorators';

export class Document extends Model {
  static table = 'documents';

  @text('server_id') serverId!: string;
  @text('type') type!: string; // invoice, receipt, contract, etc.
  @text('counterparty_name') counterpartyName!: string;
  @text('file_path') filePath!: string;
  @field('file_size') fileSize!: number;
  @text('status') status!: string; // pending, processing, completed, failed
  @field('confidence') confidence!: number;
  @text('extracted_data') extractedData!: string; // JSON
  @field('uploaded_at') uploadedAt!: number;
  @readonly @date('created_at') createdAt!: Date;
  @field('updated_at') updatedAt!: number;
  @field('synced_at') syncedAt?: number;
  @field('sync_pending') syncPending!: boolean;

  getExtractedData() {
    try {
      return JSON.parse(this.extractedData);
    } catch (e) {
      return null;
    }
  }

  setExtractedData(data: any) {
    this.extractedData = JSON.stringify(data);
  }

  isLocal(): boolean {
    return !this.serverId || this.serverId.startsWith('local_');
  }

  isPending(): boolean {
    return this.syncPending || this.status === 'pending' || this.status === 'processing';
  }
}
