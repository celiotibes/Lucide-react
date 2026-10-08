import { Database } from '@nozbe/watermelondb';
import { DocumentRepository } from './DocumentRepository';
import { TransactionRepository } from './TransactionRepository';
import { PropertyRepository } from './PropertyRepository';
import { SyncQueueRepository } from './SyncQueueRepository';

export class RepositoryFactory {
  private database: Database;
  private documentRepo?: DocumentRepository;
  private transactionRepo?: TransactionRepository;
  private propertyRepo?: PropertyRepository;
  private syncQueueRepo?: SyncQueueRepository;

  constructor(database: Database) {
    this.database = database;
  }

  getDocumentRepository(): DocumentRepository {
    if (!this.documentRepo) {
      this.documentRepo = new DocumentRepository(this.database);
    }
    return this.documentRepo;
  }

  getTransactionRepository(): TransactionRepository {
    if (!this.transactionRepo) {
      this.transactionRepo = new TransactionRepository(this.database);
    }
    return this.transactionRepo;
  }

  getPropertyRepository(): PropertyRepository {
    if (!this.propertyRepo) {
      this.propertyRepo = new PropertyRepository(this.database);
    }
    return this.propertyRepo;
  }

  getSyncQueueRepository(): SyncQueueRepository {
    if (!this.syncQueueRepo) {
      this.syncQueueRepo = new SyncQueueRepository(this.database);
    }
    return this.syncQueueRepo;
  }
}

// Export all repository classes
export {
  DocumentRepository,
  TransactionRepository,
  PropertyRepository,
  SyncQueueRepository,
};

// Export types
export type { TransactionFilter } from './TransactionRepository';
export type { PropertyFilter } from './PropertyRepository';
