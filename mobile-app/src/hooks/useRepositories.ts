import { useMemo } from 'react';
import { useDatabaseInstance } from '../providers/DatabaseProvider';
import { RepositoryFactory } from '../database/repositories';
import {
  DocumentRepository,
  TransactionRepository,
  PropertyRepository,
  SyncQueueRepository,
} from '../database/repositories';

export interface Repositories {
  documents: DocumentRepository;
  transactions: TransactionRepository;
  properties: PropertyRepository;
  syncQueue: SyncQueueRepository;
}

export const useRepositories = (): Repositories => {
  const database = useDatabaseInstance();

  return useMemo(() => {
    const factory = new RepositoryFactory(database);
    return {
      documents: factory.getDocumentRepository(),
      transactions: factory.getTransactionRepository(),
      properties: factory.getPropertyRepository(),
      syncQueue: factory.getSyncQueueRepository(),
    };
  }, [database]);
};

// Individual repository hooks for specific use cases
export const useDocumentRepository = (): DocumentRepository => {
  const database = useDatabaseInstance();
  return useMemo(
    () => new DocumentRepository(database),
    [database],
  );
};

export const useTransactionRepository = (): TransactionRepository => {
  const database = useDatabaseInstance();
  return useMemo(
    () => new TransactionRepository(database),
    [database],
  );
};

export const usePropertyRepository = (): PropertyRepository => {
  const database = useDatabaseInstance();
  return useMemo(
    () => new PropertyRepository(database),
    [database],
  );
};

export const useSyncQueueRepository = (): SyncQueueRepository => {
  const database = useDatabaseInstance();
  return useMemo(
    () => new SyncQueueRepository(database),
    [database],
  );
};
