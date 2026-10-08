import { Model } from '@nozbe/watermelondb';
import { field, text, readonly, date } from '@nozbe/watermelondb/decorators';

export class Property extends Model {
  static table = 'properties';

  @text('server_id') serverId!: string;
  @text('name') name!: string;
  @text('type') type!: string; // residential, commercial, land
  @text('address') address!: string;
  @text('city') city!: string;
  @text('state') state!: string;
  @text('postal_code') postalCode!: string;
  @field('purchase_price') purchasePrice!: number;
  @field('current_value') currentValue!: number;
  @field('acquisition_date') acquisitionDate!: number;
  @field('ownership_percentage') ownershipPercentage!: number;
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

  getAcquisitionDate(): Date {
    return new Date(this.acquisitionDate);
  }

  setAcquisitionDate(date: Date): void {
    this.acquisitionDate = date.getTime();
  }

  getAppreciation(): number {
    return this.currentValue - this.purchasePrice;
  }

  getAppreciationPercentage(): number {
    return (this.getAppreciation() / this.purchasePrice) * 100;
  }
}
