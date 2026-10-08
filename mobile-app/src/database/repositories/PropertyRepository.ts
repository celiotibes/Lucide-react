import { Database, Q } from '@nozbe/watermelondb';
import { Property } from '../models/Property';
import { logger } from '../../utils/logger';

export interface PropertyFilter {
  type?: string;
  city?: string;
  state?: string;
  minValue?: number;
  maxValue?: number;
}

export class PropertyRepository {
  constructor(private database: Database) {}

  async create(data: {
    serverId?: string;
    name: string;
    type: string;
    address: string;
    city: string;
    state: string;
    postalCode: string;
    purchasePrice: number;
    currentValue: number;
    acquisitionDate: number;
    ownershipPercentage: number;
  }): Promise<Property> {
    try {
      return await this.database.action(async () => {
        const propCollection = this.database.collections.get('properties');
        const newProp = await propCollection.create((prop) => {
          prop.serverId = data.serverId || `local_${Date.now()}`;
          prop.name = data.name;
          prop.type = data.type;
          prop.address = data.address;
          prop.city = data.city;
          prop.state = data.state;
          prop.postalCode = data.postalCode;
          prop.purchasePrice = data.purchasePrice;
          prop.currentValue = data.currentValue;
          prop.acquisitionDate = data.acquisitionDate;
          prop.ownershipPercentage = data.ownershipPercentage;
          prop.syncPending = true;
        });
        logger.info(`Property created: ${newProp.id}`);
        return newProp;
      });
    } catch (error) {
      logger.error('Failed to create property', error);
      throw error;
    }
  }

  async update(
    propertyId: string,
    data: Partial<{
      name: string;
      type: string;
      address: string;
      city: string;
      state: string;
      postalCode: string;
      purchasePrice: number;
      currentValue: number;
      acquisitionDate: number;
      ownershipPercentage: number;
    }>,
  ): Promise<Property> {
    try {
      return await this.database.action(async () => {
        const prop = await this.getById(propertyId);
        if (!prop) {
          throw new Error(`Property not found: ${propertyId}`);
        }

        await prop.update((p) => {
          if (data.name) p.name = data.name;
          if (data.type) p.type = data.type;
          if (data.address) p.address = data.address;
          if (data.city) p.city = data.city;
          if (data.state) p.state = data.state;
          if (data.postalCode) p.postalCode = data.postalCode;
          if (data.purchasePrice !== undefined)
            p.purchasePrice = data.purchasePrice;
          if (data.currentValue !== undefined)
            p.currentValue = data.currentValue;
          if (data.acquisitionDate !== undefined)
            p.acquisitionDate = data.acquisitionDate;
          if (data.ownershipPercentage !== undefined)
            p.ownershipPercentage = data.ownershipPercentage;
          p.syncPending = true;
        });
        logger.info(`Property updated: ${propertyId}`);
        return prop;
      });
    } catch (error) {
      logger.error('Failed to update property', error);
      throw error;
    }
  }

  async getById(propertyId: string): Promise<Property | null> {
    try {
      const propCollection = this.database.collections.get('properties');
      const prop = await propCollection.find(propertyId);
      return prop || null;
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return null;
      }
      logger.error('Failed to get property', error);
      throw error;
    }
  }

  async getByServerId(serverId: string): Promise<Property | null> {
    try {
      const propCollection = this.database.collections.get('properties');
      const results = await propCollection
        .query(Q.where('server_id', serverId))
        .fetch();
      return results[0] || null;
    } catch (error) {
      logger.error('Failed to get property by server ID', error);
      throw error;
    }
  }

  async getAll(): Promise<Property[]> {
    try {
      const propCollection = this.database.collections.get('properties');
      return await propCollection.query().fetch();
    } catch (error) {
      logger.error('Failed to fetch all properties', error);
      throw error;
    }
  }

  async filter(filter: PropertyFilter): Promise<Property[]> {
    try {
      const propCollection = this.database.collections.get('properties');
      const conditions = [];

      if (filter.type) {
        conditions.push(Q.where('type', filter.type));
      }
      if (filter.city) {
        conditions.push(Q.where('city', Q.contains(filter.city)));
      }
      if (filter.state) {
        conditions.push(Q.where('state', filter.state));
      }
      if (filter.minValue !== undefined) {
        conditions.push(Q.where('current_value', Q.gte(filter.minValue)));
      }
      if (filter.maxValue !== undefined) {
        conditions.push(Q.where('current_value', Q.lte(filter.maxValue)));
      }

      if (conditions.length === 0) {
        return await propCollection.query().fetch();
      }

      return await propCollection.query(...conditions).fetch();
    } catch (error) {
      logger.error('Failed to filter properties', error);
      throw error;
    }
  }

  async getByType(type: string): Promise<Property[]> {
    try {
      const propCollection = this.database.collections.get('properties');
      return await propCollection
        .query(Q.where('type', type))
        .fetch();
    } catch (error) {
      logger.error('Failed to fetch properties by type', error);
      throw error;
    }
  }

  async getByCity(city: string): Promise<Property[]> {
    try {
      const propCollection = this.database.collections.get('properties');
      return await propCollection
        .query(Q.where('city', Q.contains(city)))
        .fetch();
    } catch (error) {
      logger.error('Failed to fetch properties by city', error);
      throw error;
    }
  }

  async getByState(state: string): Promise<Property[]> {
    try {
      const propCollection = this.database.collections.get('properties');
      return await propCollection
        .query(Q.where('state', state))
        .fetch();
    } catch (error) {
      logger.error('Failed to fetch properties by state', error);
      throw error;
    }
  }

  async getSyncPending(): Promise<Property[]> {
    try {
      const propCollection = this.database.collections.get('properties');
      return await propCollection
        .query(Q.where('sync_pending', true))
        .fetch();
    } catch (error) {
      logger.error('Failed to fetch sync pending properties', error);
      throw error;
    }
  }

  // Financial calculations
  async getTotalValue(): Promise<number> {
    try {
      const properties = await this.getAll();
      return properties.reduce((sum, prop) => sum + prop.currentValue, 0);
    } catch (error) {
      logger.error('Failed to calculate total value', error);
      throw error;
    }
  }

  async getTotalPurchasePrice(): Promise<number> {
    try {
      const properties = await this.getAll();
      return properties.reduce((sum, prop) => sum + prop.purchasePrice, 0);
    } catch (error) {
      logger.error('Failed to calculate total purchase price', error);
      throw error;
    }
  }

  async getTotalAppreciation(): Promise<number> {
    try {
      const totalValue = await this.getTotalValue();
      const totalPurchase = await this.getTotalPurchasePrice();
      return totalValue - totalPurchase;
    } catch (error) {
      logger.error('Failed to calculate total appreciation', error);
      throw error;
    }
  }

  async getAverageAppreciationPercentage(): Promise<number> {
    try {
      const properties = await this.getAll();
      if (properties.length === 0) return 0;

      const total = properties.reduce((sum, prop) => {
        return sum + prop.getAppreciationPercentage();
      }, 0);

      return total / properties.length;
    } catch (error) {
      logger.error('Failed to calculate average appreciation', error);
      throw error;
    }
  }

  async getPortfolioComposition(): Promise<Record<string, number>> {
    try {
      const properties = await this.getAll();
      const total = await this.getTotalValue();
      const composition: Record<string, number> = {};

      for (const prop of properties) {
        const percentage = (prop.currentValue / total) * 100;
        if (!composition[prop.type]) {
          composition[prop.type] = 0;
        }
        composition[prop.type] += percentage;
      }

      return composition;
    } catch (error) {
      logger.error('Failed to get portfolio composition', error);
      throw error;
    }
  }

  async getValueByType(): Promise<Record<string, number>> {
    try {
      const properties = await this.getAll();
      const valueByType: Record<string, number> = {};

      for (const prop of properties) {
        if (!valueByType[prop.type]) {
          valueByType[prop.type] = 0;
        }
        valueByType[prop.type] += prop.currentValue;
      }

      return valueByType;
    } catch (error) {
      logger.error('Failed to get value by type', error);
      throw error;
    }
  }

  async delete(propertyId: string): Promise<void> {
    try {
      return await this.database.action(async () => {
        const prop = await this.getById(propertyId);
        if (prop) {
          await prop.destroyPermanently();
          logger.info(`Property deleted: ${propertyId}`);
        }
      });
    } catch (error) {
      logger.error('Failed to delete property', error);
      throw error;
    }
  }

  async markSynced(propertyId: string): Promise<void> {
    try {
      return await this.database.action(async () => {
        const prop = await this.getById(propertyId);
        if (prop) {
          await prop.update((p) => {
            p.syncPending = false;
            p.syncedAt = Date.now();
          });
        }
      });
    } catch (error) {
      logger.error('Failed to mark property as synced', error);
      throw error;
    }
  }
}
