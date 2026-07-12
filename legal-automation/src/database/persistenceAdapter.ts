import { logger } from '@utils/logger';

// ============================================================================
// PERSISTENCE ADAPTER - Database-Agnostic Storage Layer
// ============================================================================

export interface Entity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: any;
}

export interface PersistenceAdapter<T extends Entity> {
  create(entity: T): Promise<T>;
  read(id: string): Promise<T | null>;
  update(id: string, updates: Partial<T>): Promise<T>;
  delete(id: string): Promise<boolean>;
  list(filter?: Record<string, any>, limit?: number, offset?: number): Promise<T[]>;
  count(filter?: Record<string, any>): Promise<number>;
  flush(): Promise<void>;
  close(): Promise<void>;
}

/**
 * In-Memory adapter (current implementation)
 */
export class InMemoryAdapter<T extends Entity> implements PersistenceAdapter<T> {
  private storage: Map<string, T> = new Map();
  private indexes: Map<string, Map<string, string[]>> = new Map();

  async create(entity: T): Promise<T> {
    if (this.storage.has(entity.id)) {
      throw new Error(`Entity with id ${entity.id} already exists`);
    }

    this.storage.set(entity.id, entity);
    this.indexEntity(entity);

    logger.debug({ id: entity.id }, 'Entity created in memory');
    return entity;
  }

  async read(id: string): Promise<T | null> {
    return this.storage.get(id) || null;
  }

  async update(id: string, updates: Partial<T>): Promise<T> {
    const entity = this.storage.get(id);

    if (!entity) {
      throw new Error(`Entity with id ${id} not found`);
    }

    const updated: T = {
      ...entity,
      ...updates,
      id: entity.id,
      createdAt: entity.createdAt,
      updatedAt: new Date(),
    };

    this.storage.set(id, updated);
    logger.debug({ id }, 'Entity updated in memory');

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = this.storage.delete(id);

    if (deleted) {
      logger.debug({ id }, 'Entity deleted from memory');
    }

    return deleted;
  }

  async list(filter?: Record<string, any>, limit: number = 100, offset: number = 0): Promise<T[]> {
    let results = Array.from(this.storage.values());

    if (filter) {
      results = results.filter((entity) =>
        Object.entries(filter).every(([key, value]) => entity[key] === value),
      );
    }

    return results.slice(offset, offset + limit);
  }

  async count(filter?: Record<string, any>): Promise<number> {
    let results = Array.from(this.storage.values());

    if (filter) {
      results = results.filter((entity) =>
        Object.entries(filter).every(([key, value]) => entity[key] === value),
      );
    }

    return results.length;
  }

  async flush(): Promise<void> {
    logger.debug({ count: this.storage.size }, 'Flushing in-memory storage');
  }

  async close(): Promise<void> {
    this.storage.clear();
    this.indexes.clear();
    logger.info('In-memory adapter closed');
  }

  private indexEntity(entity: T): void {
    Object.entries(entity).forEach(([key, value]) => {
      if (typeof value === 'string' || typeof value === 'number') {
        if (!this.indexes.has(key)) {
          this.indexes.set(key, new Map());
        }

        const index = this.indexes.get(key)!;
        const indexKey = String(value);

        if (!index.has(indexKey)) {
          index.set(indexKey, []);
        }

        index.get(indexKey)!.push(entity.id);
      }
    });
  }

  getStats(): { totalEntities: number; indexes: number } {
    return {
      totalEntities: this.storage.size,
      indexes: this.indexes.size,
    };
  }
}

/**
 * PostgreSQL adapter (future implementation)
 */
export class PostgreSQLAdapter<T extends Entity> implements PersistenceAdapter<T> {
  private connectionString: string;
  private tableName: string;

  constructor(connectionString: string, tableName: string) {
    this.connectionString = connectionString;
    this.tableName = tableName;
  }

  async create(entity: T): Promise<T> {
    logger.info({ tableName: this.tableName, id: entity.id }, 'CREATE not yet implemented');
    throw new Error('PostgreSQL adapter not yet implemented');
  }

  async read(id: string): Promise<T | null> {
    logger.info({ tableName: this.tableName, id }, 'READ not yet implemented');
    throw new Error('PostgreSQL adapter not yet implemented');
  }

  async update(id: string, updates: Partial<T>): Promise<T> {
    logger.info({ tableName: this.tableName, id }, 'UPDATE not yet implemented');
    throw new Error('PostgreSQL adapter not yet implemented');
  }

  async delete(id: string): Promise<boolean> {
    logger.info({ tableName: this.tableName, id }, 'DELETE not yet implemented');
    throw new Error('PostgreSQL adapter not yet implemented');
  }

  async list(filter?: Record<string, any>, limit?: number, offset?: number): Promise<T[]> {
    logger.info({ tableName: this.tableName }, 'LIST not yet implemented');
    throw new Error('PostgreSQL adapter not yet implemented');
  }

  async count(filter?: Record<string, any>): Promise<number> {
    logger.info({ tableName: this.tableName }, 'COUNT not yet implemented');
    throw new Error('PostgreSQL adapter not yet implemented');
  }

  async flush(): Promise<void> {
    logger.info({ tableName: this.tableName }, 'FLUSH not yet implemented');
  }

  async close(): Promise<void> {
    logger.info({ tableName: this.tableName }, 'PostgreSQL adapter closed');
  }
}

/**
 * Repository base class
 */
export abstract class Repository<T extends Entity> {
  protected adapter: PersistenceAdapter<T>;

  constructor(adapter: PersistenceAdapter<T>) {
    this.adapter = adapter;
  }

  async save(entity: T): Promise<T> {
    const existing = await this.adapter.read(entity.id);

    if (existing) {
      return this.adapter.update(entity.id, entity);
    }

    return this.adapter.create(entity);
  }

  async find(id: string): Promise<T | null> {
    return this.adapter.read(id);
  }

  async findAll(filter?: Record<string, any>): Promise<T[]> {
    return this.adapter.list(filter);
  }

  async remove(id: string): Promise<boolean> {
    return this.adapter.delete(id);
  }

  async count(filter?: Record<string, any>): Promise<number> {
    return this.adapter.count(filter);
  }
}
