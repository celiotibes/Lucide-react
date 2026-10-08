import { Database, Q } from '@nozbe/watermelondb';
import { Transaction } from '../models/Transaction';
import { logger } from '../../utils/logger';

export interface TransactionFilter {
  type?: string;
  category?: string;
  dateFrom?: number;
  dateTo?: number;
  minAmount?: number;
  maxAmount?: number;
  payee?: string;
}

export class TransactionRepository {
  constructor(private database: Database) {}

  async create(data: {
    serverId?: string;
    documentId: string;
    type: string;
    category: string;
    amount: number;
    currency: string;
    description: string;
    date: number;
    payee: string;
    account: string;
    notes?: string;
  }): Promise<Transaction> {
    try {
      return await this.database.action(async () => {
        const txCollection = this.database.collections.get('transactions');
        const newTx = await txCollection.create((tx) => {
          tx.serverId = data.serverId || `local_${Date.now()}`;
          tx.documentId = data.documentId;
          tx.type = data.type;
          tx.category = data.category;
          tx.amount = data.amount;
          tx.currency = data.currency;
          tx.description = data.description;
          tx.date = data.date;
          tx.payee = data.payee;
          tx.account = data.account;
          if (data.notes) tx.notes = data.notes;
          tx.syncPending = true;
        });
        logger.info(`Transaction created: ${newTx.id}`);
        return newTx;
      });
    } catch (error) {
      logger.error('Failed to create transaction', error);
      throw error;
    }
  }

  async update(
    transactionId: string,
    data: Partial<{
      type: string;
      category: string;
      amount: number;
      currency: string;
      description: string;
      date: number;
      payee: string;
      account: string;
      notes: string;
    }>,
  ): Promise<Transaction> {
    try {
      return await this.database.action(async () => {
        const tx = await this.getById(transactionId);
        if (!tx) {
          throw new Error(`Transaction not found: ${transactionId}`);
        }

        await tx.update((t) => {
          if (data.type) t.type = data.type;
          if (data.category) t.category = data.category;
          if (data.amount !== undefined) t.amount = data.amount;
          if (data.currency) t.currency = data.currency;
          if (data.description) t.description = data.description;
          if (data.date !== undefined) t.date = data.date;
          if (data.payee) t.payee = data.payee;
          if (data.account) t.account = data.account;
          if (data.notes !== undefined) t.notes = data.notes;
          t.syncPending = true;
        });
        logger.info(`Transaction updated: ${transactionId}`);
        return tx;
      });
    } catch (error) {
      logger.error('Failed to update transaction', error);
      throw error;
    }
  }

  async getById(transactionId: string): Promise<Transaction | null> {
    try {
      const txCollection = this.database.collections.get('transactions');
      const tx = await txCollection.find(transactionId);
      return tx || null;
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return null;
      }
      logger.error('Failed to get transaction', error);
      throw error;
    }
  }

  async getByServerId(serverId: string): Promise<Transaction | null> {
    try {
      const txCollection = this.database.collections.get('transactions');
      const results = await txCollection
        .query(Q.where('server_id', serverId))
        .fetch();
      return results[0] || null;
    } catch (error) {
      logger.error('Failed to get transaction by server ID', error);
      throw error;
    }
  }

  async getByDocument(documentId: string): Promise<Transaction[]> {
    try {
      const txCollection = this.database.collections.get('transactions');
      return await txCollection
        .query(Q.where('document_id', documentId))
        .fetch();
    } catch (error) {
      logger.error('Failed to fetch transactions by document', error);
      throw error;
    }
  }

  async filter(filter: TransactionFilter): Promise<Transaction[]> {
    try {
      const txCollection = this.database.collections.get('transactions');
      const conditions = [];

      if (filter.type) {
        conditions.push(Q.where('type', filter.type));
      }
      if (filter.category) {
        conditions.push(Q.where('category', filter.category));
      }
      if (filter.dateFrom !== undefined) {
        conditions.push(Q.where('date', Q.gte(filter.dateFrom)));
      }
      if (filter.dateTo !== undefined) {
        conditions.push(Q.where('date', Q.lte(filter.dateTo)));
      }
      if (filter.minAmount !== undefined) {
        conditions.push(Q.where('amount', Q.gte(filter.minAmount)));
      }
      if (filter.maxAmount !== undefined) {
        conditions.push(Q.where('amount', Q.lte(filter.maxAmount)));
      }
      if (filter.payee) {
        conditions.push(Q.where('payee', Q.contains(filter.payee)));
      }

      if (conditions.length === 0) {
        return await txCollection.query().fetch();
      }

      return await txCollection.query(...conditions).fetch();
    } catch (error) {
      logger.error('Failed to filter transactions', error);
      throw error;
    }
  }

  async getAll(): Promise<Transaction[]> {
    try {
      const txCollection = this.database.collections.get('transactions');
      return await txCollection.query().fetch();
    } catch (error) {
      logger.error('Failed to fetch all transactions', error);
      throw error;
    }
  }

  async getByType(type: string): Promise<Transaction[]> {
    try {
      const txCollection = this.database.collections.get('transactions');
      return await txCollection
        .query(Q.where('type', type))
        .fetch();
    } catch (error) {
      logger.error('Failed to fetch transactions by type', error);
      throw error;
    }
  }

  async getByCategory(category: string): Promise<Transaction[]> {
    try {
      const txCollection = this.database.collections.get('transactions');
      return await txCollection
        .query(Q.where('category', category))
        .fetch();
    } catch (error) {
      logger.error('Failed to fetch transactions by category', error);
      throw error;
    }
  }

  async getByDateRange(from: number, to: number): Promise<Transaction[]> {
    try {
      const txCollection = this.database.collections.get('transactions');
      return await txCollection
        .query(
          Q.where('date', Q.gte(from)),
          Q.where('date', Q.lte(to)),
        )
        .fetch();
    } catch (error) {
      logger.error('Failed to fetch transactions by date range', error);
      throw error;
    }
  }

  async getSyncPending(): Promise<Transaction[]> {
    try {
      const txCollection = this.database.collections.get('transactions');
      return await txCollection
        .query(Q.where('sync_pending', true))
        .fetch();
    } catch (error) {
      logger.error('Failed to fetch sync pending transactions', error);
      throw error;
    }
  }

  async getTotalByType(type: string): Promise<number> {
    try {
      const transactions = await this.getByType(type);
      return transactions.reduce((sum, tx) => sum + tx.amount, 0);
    } catch (error) {
      logger.error('Failed to calculate total by type', error);
      throw error;
    }
  }

  async getTotalByCategory(category: string): Promise<number> {
    try {
      const transactions = await this.getByCategory(category);
      return transactions.reduce((sum, tx) => sum + tx.amount, 0);
    } catch (error) {
      logger.error('Failed to calculate total by category', error);
      throw error;
    }
  }

  async delete(transactionId: string): Promise<void> {
    try {
      return await this.database.action(async () => {
        const tx = await this.getById(transactionId);
        if (tx) {
          await tx.destroyPermanently();
          logger.info(`Transaction deleted: ${transactionId}`);
        }
      });
    } catch (error) {
      logger.error('Failed to delete transaction', error);
      throw error;
    }
  }

  async markSynced(transactionId: string): Promise<void> {
    try {
      return await this.database.action(async () => {
        const tx = await this.getById(transactionId);
        if (tx) {
          await tx.update((t) => {
            t.syncPending = false;
            t.syncedAt = Date.now();
          });
        }
      });
    } catch (error) {
      logger.error('Failed to mark transaction as synced', error);
      throw error;
    }
  }
}
