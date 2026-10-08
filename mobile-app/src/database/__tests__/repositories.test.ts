import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Database, Q } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { schema } from '../schema';
import {
  DocumentRepository,
  TransactionRepository,
  PropertyRepository,
  SyncQueueRepository,
} from '../repositories';
import { Document } from '../models/Document';
import { Transaction } from '../models/Transaction';
import { Property } from '../models/Property';
import { SyncQueue } from '../models/SyncQueue';

/**
 * Test utilities
 */
const createTestDatabase = async (): Promise<Database> => {
  const adapter = new SQLiteAdapter({
    schema,
    dbName: `crmt_test_${Date.now()}`,
    jsi: false, // Use synchronous mode for tests
  });

  return new Database({
    adapter,
    modelClasses: [Document, Transaction, Property, SyncQueue],
  });
};

/**
 * DocumentRepository Tests
 */
describe('DocumentRepository', () => {
  let database: Database;
  let repository: DocumentRepository;

  beforeEach(async () => {
    database = await createTestDatabase();
    repository = new DocumentRepository(database);
  });

  afterEach(async () => {
    await database.close();
  });

  describe('create', () => {
    it('should create a new document', async () => {
      const doc = await repository.create({
        type: 'invoice',
        counterpartyName: 'Vendor A',
        filePath: '/path/to/file.pdf',
        fileSize: 1024,
      });

      expect(doc).toBeDefined();
      expect(doc.type).toBe('invoice');
      expect(doc.counterpartyName).toBe('Vendor A');
      expect(doc.syncPending).toBe(true);
    });

    it('should generate local ID if serverId not provided', async () => {
      const doc = await repository.create({
        type: 'receipt',
        counterpartyName: 'Store B',
        filePath: '/path/to/receipt.pdf',
        fileSize: 512,
      });

      expect(doc.serverId).toMatch(/^local_\d+$/);
    });

    it('should use provided serverId', async () => {
      const doc = await repository.create({
        serverId: 'server_123',
        type: 'contract',
        counterpartyName: 'Partner C',
        filePath: '/path/to/contract.pdf',
        fileSize: 2048,
      });

      expect(doc.serverId).toBe('server_123');
    });
  });

  describe('getById', () => {
    it('should return document by ID', async () => {
      const created = await repository.create({
        type: 'invoice',
        counterpartyName: 'Vendor A',
        filePath: '/path/to/file.pdf',
        fileSize: 1024,
      });

      const found = await repository.getById(created.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
    });

    it('should return null for non-existent document', async () => {
      const found = await repository.getById('non_existent_id');
      expect(found).toBeNull();
    });
  });

  describe('getByServerId', () => {
    it('should find document by server ID', async () => {
      const created = await repository.create({
        serverId: 'server_456',
        type: 'invoice',
        counterpartyName: 'Vendor A',
        filePath: '/path/to/file.pdf',
        fileSize: 1024,
      });

      const found = await repository.getByServerId('server_456');

      expect(found).toBeDefined();
      expect(found?.serverId).toBe('server_456');
    });
  });

  describe('getAll', () => {
    it('should return all documents', async () => {
      await repository.create({
        type: 'invoice',
        counterpartyName: 'Vendor A',
        filePath: '/path/1.pdf',
        fileSize: 1024,
      });

      await repository.create({
        type: 'receipt',
        counterpartyName: 'Store B',
        filePath: '/path/2.pdf',
        fileSize: 512,
      });

      const all = await repository.getAll();

      expect(all).toHaveLength(2);
    });
  });

  describe('getByType', () => {
    it('should filter documents by type', async () => {
      await repository.create({
        type: 'invoice',
        counterpartyName: 'Vendor A',
        filePath: '/path/1.pdf',
        fileSize: 1024,
      });

      await repository.create({
        type: 'receipt',
        counterpartyName: 'Store B',
        filePath: '/path/2.pdf',
        fileSize: 512,
      });

      const invoices = await repository.getByType('invoice');

      expect(invoices).toHaveLength(1);
      expect(invoices[0].type).toBe('invoice');
    });
  });

  describe('update', () => {
    it('should update document fields', async () => {
      const created = await repository.create({
        type: 'invoice',
        counterpartyName: 'Vendor A',
        filePath: '/path/to/file.pdf',
        fileSize: 1024,
      });

      const updated = await repository.update(created.id, {
        counterpartyName: 'Vendor B',
        status: 'completed',
      });

      expect(updated.counterpartyName).toBe('Vendor B');
      expect(updated.status).toBe('completed');
      expect(updated.syncPending).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete a document', async () => {
      const created = await repository.create({
        type: 'invoice',
        counterpartyName: 'Vendor A',
        filePath: '/path/to/file.pdf',
        fileSize: 1024,
      });

      await repository.delete(created.id);

      const found = await repository.getById(created.id);
      expect(found).toBeNull();
    });
  });
});

/**
 * TransactionRepository Tests
 */
describe('TransactionRepository', () => {
  let database: Database;
  let repository: TransactionRepository;

  beforeEach(async () => {
    database = await createTestDatabase();
    repository = new TransactionRepository(database);
  });

  afterEach(async () => {
    await database.close();
  });

  describe('create', () => {
    it('should create a new transaction', async () => {
      const tx = await repository.create({
        documentId: 'doc_123',
        type: 'expense',
        category: 'office supplies',
        amount: 150.5,
        currency: 'BRL',
        description: 'Office supplies purchase',
        date: Date.now(),
        payee: 'Office Store',
        account: 'Business Account',
      });

      expect(tx).toBeDefined();
      expect(tx.type).toBe('expense');
      expect(tx.amount).toBe(150.5);
    });
  });

  describe('filter', () => {
    it('should filter by type and amount range', async () => {
      await repository.create({
        documentId: 'doc_123',
        type: 'income',
        category: 'services',
        amount: 1000,
        currency: 'BRL',
        description: 'Service income',
        date: Date.now(),
        payee: 'Client A',
        account: 'Business Account',
      });

      await repository.create({
        documentId: 'doc_124',
        type: 'expense',
        category: 'utilities',
        amount: 200,
        currency: 'BRL',
        description: 'Utility bill',
        date: Date.now(),
        payee: 'Electric Company',
        account: 'Business Account',
      });

      const expenses = await repository.filter({
        type: 'expense',
        minAmount: 100,
        maxAmount: 500,
      });

      expect(expenses).toHaveLength(1);
      expect(expenses[0].type).toBe('expense');
    });
  });

  describe('getByDateRange', () => {
    it('should return transactions within date range', async () => {
      const today = Date.now();
      const yesterday = today - 24 * 60 * 60 * 1000;
      const tomorrow = today + 24 * 60 * 60 * 1000;

      await repository.create({
        documentId: 'doc_123',
        type: 'expense',
        category: 'office',
        amount: 100,
        currency: 'BRL',
        description: 'Purchase',
        date: today,
        payee: 'Store',
        account: 'Account',
      });

      const range = await repository.getByDateRange(yesterday, tomorrow);

      expect(range).toHaveLength(1);
    });
  });

  describe('getTotalByType', () => {
    it('should calculate total amount by type', async () => {
      await repository.create({
        documentId: 'doc_1',
        type: 'income',
        category: 'services',
        amount: 1000,
        currency: 'BRL',
        description: 'Income 1',
        date: Date.now(),
        payee: 'Client',
        account: 'Account',
      });

      await repository.create({
        documentId: 'doc_2',
        type: 'income',
        category: 'services',
        amount: 500,
        currency: 'BRL',
        description: 'Income 2',
        date: Date.now(),
        payee: 'Client',
        account: 'Account',
      });

      const total = await repository.getTotalByType('income');

      expect(total).toBe(1500);
    });
  });
});

/**
 * PropertyRepository Tests
 */
describe('PropertyRepository', () => {
  let database: Database;
  let repository: PropertyRepository;

  beforeEach(async () => {
    database = await createTestDatabase();
    repository = new PropertyRepository(database);
  });

  afterEach(async () => {
    await database.close();
  });

  describe('create', () => {
    it('should create a new property', async () => {
      const prop = await repository.create({
        name: 'Downtown Office',
        type: 'commercial',
        address: '123 Main St',
        city: 'São Paulo',
        state: 'SP',
        postalCode: '01000-000',
        purchasePrice: 500000,
        currentValue: 600000,
        acquisitionDate: Date.now(),
        ownershipPercentage: 100,
      });

      expect(prop).toBeDefined();
      expect(prop.name).toBe('Downtown Office');
      expect(prop.currentValue).toBe(600000);
    });
  });

  describe('getTotalValue', () => {
    it('should calculate total property value', async () => {
      await repository.create({
        name: 'Property 1',
        type: 'residential',
        address: 'Addr 1',
        city: 'São Paulo',
        state: 'SP',
        postalCode: '01000-000',
        purchasePrice: 300000,
        currentValue: 400000,
        acquisitionDate: Date.now(),
        ownershipPercentage: 100,
      });

      await repository.create({
        name: 'Property 2',
        type: 'commercial',
        address: 'Addr 2',
        city: 'Rio de Janeiro',
        state: 'RJ',
        postalCode: '20000-000',
        purchasePrice: 500000,
        currentValue: 600000,
        acquisitionDate: Date.now(),
        ownershipPercentage: 100,
      });

      const total = await repository.getTotalValue();

      expect(total).toBe(1000000);
    });
  });

  describe('getTotalAppreciation', () => {
    it('should calculate total appreciation', async () => {
      await repository.create({
        name: 'Property 1',
        type: 'residential',
        address: 'Addr 1',
        city: 'São Paulo',
        state: 'SP',
        postalCode: '01000-000',
        purchasePrice: 300000,
        currentValue: 400000,
        acquisitionDate: Date.now(),
        ownershipPercentage: 100,
      });

      const appreciation = await repository.getTotalAppreciation();

      expect(appreciation).toBe(100000);
    });
  });

  describe('getValueByType', () => {
    it('should group value by property type', async () => {
      await repository.create({
        name: 'House',
        type: 'residential',
        address: 'Addr 1',
        city: 'São Paulo',
        state: 'SP',
        postalCode: '01000-000',
        purchasePrice: 300000,
        currentValue: 400000,
        acquisitionDate: Date.now(),
        ownershipPercentage: 100,
      });

      await repository.create({
        name: 'Office',
        type: 'commercial',
        address: 'Addr 2',
        city: 'São Paulo',
        state: 'SP',
        postalCode: '01000-000',
        purchasePrice: 500000,
        currentValue: 600000,
        acquisitionDate: Date.now(),
        ownershipPercentage: 100,
      });

      const byType = await repository.getValueByType();

      expect(byType.residential).toBe(400000);
      expect(byType.commercial).toBe(600000);
    });
  });
});

/**
 * SyncQueueRepository Tests
 */
describe('SyncQueueRepository', () => {
  let database: Database;
  let repository: SyncQueueRepository;

  beforeEach(async () => {
    database = await createTestDatabase();
    repository = new SyncQueueRepository(database);
  });

  afterEach(async () => {
    await database.close();
  });

  describe('create', () => {
    it('should create a sync queue item', async () => {
      const item = await repository.create({
        entityType: 'document',
        entityId: 'doc_123',
        operation: 'create',
        payload: { type: 'invoice', amount: 100 },
      });

      expect(item).toBeDefined();
      expect(item.entityType).toBe('document');
      expect(item.operation).toBe('create');
      expect(item.retryCount).toBe(0);
    });
  });

  describe('getByEntityType', () => {
    it('should filter by entity type', async () => {
      await repository.create({
        entityType: 'document',
        entityId: 'doc_1',
        operation: 'create',
        payload: {},
      });

      await repository.create({
        entityType: 'transaction',
        entityId: 'tx_1',
        operation: 'create',
        payload: {},
      });

      const docs = await repository.getByEntityType('document');

      expect(docs).toHaveLength(1);
      expect(docs[0].entityType).toBe('document');
    });
  });

  describe('getStats', () => {
    it('should return sync queue statistics', async () => {
      await repository.create({
        entityType: 'document',
        entityId: 'doc_1',
        operation: 'create',
        payload: {},
      });

      await repository.create({
        entityType: 'transaction',
        entityId: 'tx_1',
        operation: 'update',
        payload: {},
      });

      const stats = await repository.getStats();

      expect(stats.total).toBe(2);
      expect(stats.byEntityType.document).toBe(1);
      expect(stats.byEntityType.transaction).toBe(1);
      expect(stats.byOperation.create).toBe(1);
      expect(stats.byOperation.update).toBe(1);
    });
  });

  describe('incrementRetry', () => {
    it('should increment retry count', async () => {
      const item = await repository.create({
        entityType: 'document',
        entityId: 'doc_1',
        operation: 'create',
        payload: {},
      });

      await repository.incrementRetry(item.id);

      const updated = await repository.getById(item.id);
      expect(updated?.retryCount).toBe(1);
    });
  });

  describe('remove', () => {
    it('should remove a sync queue item', async () => {
      const item = await repository.create({
        entityType: 'document',
        entityId: 'doc_1',
        operation: 'create',
        payload: {},
      });

      await repository.remove(item.id);

      const found = await repository.getById(item.id);
      expect(found).toBeNull();
    });
  });
});
