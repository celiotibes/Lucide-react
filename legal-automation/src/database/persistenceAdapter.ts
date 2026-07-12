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
 * PostgreSQL adapter (production implementation)
 */
export class PostgreSQLAdapter<T extends Entity> implements PersistenceAdapter<T> {
  private connectionString: string;
  private tableName: string;
  private pool: any;

  constructor(connectionString: string, tableName: string, pool?: any) {
    this.connectionString = connectionString;
    this.tableName = tableName;
    this.pool = pool;
  }

  async create(entity: T): Promise<T> {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }

    const columns = Object.keys(entity).filter((key) => key !== 'id');
    const values = columns.map((col) => entity[col as keyof T]);
    const placeholders = columns.map((_, i) => `$${i + 2}`).join(', ');
    const columnList = columns.join(', ');

    const sql = `
      INSERT INTO ${this.tableName} (id, ${columnList}, "createdAt", "updatedAt")
      VALUES ($1, ${placeholders}, NOW(), NOW())
      RETURNING *
    `;

    try {
      const result = await this.pool.query(sql, [entity.id, ...values]);
      logger.debug({ tableName: this.tableName, id: entity.id }, 'Entity created in PostgreSQL');
      return this.mapRowToEntity(result.rows[0]);
    } catch (error) {
      logger.error({ tableName: this.tableName, error }, 'Failed to create entity');
      throw error;
    }
  }

  async read(id: string): Promise<T | null> {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }

    const sql = `SELECT * FROM ${this.tableName} WHERE id = $1`;

    try {
      const result = await this.pool.query(sql, [id]);
      if (result.rows.length === 0) {
        return null;
      }
      return this.mapRowToEntity(result.rows[0]);
    } catch (error) {
      logger.error({ tableName: this.tableName, id, error }, 'Failed to read entity');
      throw error;
    }
  }

  async update(id: string, updates: Partial<T>): Promise<T> {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }

    const updateEntries = Object.entries(updates).filter(([key]) => key !== 'id' && key !== 'createdAt');
    if (updateEntries.length === 0) {
      const existing = await this.read(id);
      if (!existing) throw new Error(`Entity with id ${id} not found`);
      return existing;
    }

    const setClause = updateEntries.map(([, ], i) => `"${updateEntries[i][0]}" = $${i + 2}`).join(', ');
    const values = updateEntries.map(([, v]) => v);

    const sql = `
      UPDATE ${this.tableName}
      SET ${setClause}, "updatedAt" = NOW()
      WHERE id = $1
      RETURNING *
    `;

    try {
      const result = await this.pool.query(sql, [id, ...values]);
      if (result.rows.length === 0) {
        throw new Error(`Entity with id ${id} not found`);
      }
      logger.debug({ tableName: this.tableName, id }, 'Entity updated in PostgreSQL');
      return this.mapRowToEntity(result.rows[0]);
    } catch (error) {
      logger.error({ tableName: this.tableName, id, error }, 'Failed to update entity');
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }

    const sql = `DELETE FROM ${this.tableName} WHERE id = $1`;

    try {
      const result = await this.pool.query(sql, [id]);
      const deleted = result.rowCount > 0;
      if (deleted) {
        logger.debug({ tableName: this.tableName, id }, 'Entity deleted from PostgreSQL');
      }
      return deleted;
    } catch (error) {
      logger.error({ tableName: this.tableName, id, error }, 'Failed to delete entity');
      throw error;
    }
  }

  async list(filter?: Record<string, any>, limit: number = 100, offset: number = 0): Promise<T[]> {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }

    let sql = `SELECT * FROM ${this.tableName}`;
    const values: any[] = [];

    if (filter && Object.keys(filter).length > 0) {
      const whereClauses = Object.entries(filter).map(([key, value], i) => {
        values.push(value);
        return `"${key}" = $${i + 1}`;
      });
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    sql += ` LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
    values.push(limit, offset);

    try {
      const result = await this.pool.query(sql, values);
      return result.rows.map((row) => this.mapRowToEntity(row));
    } catch (error) {
      logger.error({ tableName: this.tableName, error }, 'Failed to list entities');
      throw error;
    }
  }

  async count(filter?: Record<string, any>): Promise<number> {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }

    let sql = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    const values: any[] = [];

    if (filter && Object.keys(filter).length > 0) {
      const whereClauses = Object.entries(filter).map(([key, value], i) => {
        values.push(value);
        return `"${key}" = $${i + 1}`;
      });
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    try {
      const result = await this.pool.query(sql, values);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error({ tableName: this.tableName, error }, 'Failed to count entities');
      throw error;
    }
  }

  async flush(): Promise<void> {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }

    try {
      await this.pool.query(`TRUNCATE TABLE ${this.tableName} CASCADE`);
      logger.debug({ tableName: this.tableName }, 'PostgreSQL table truncated');
    } catch (error) {
      logger.error({ tableName: this.tableName, error }, 'Failed to flush table');
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      logger.info({ tableName: this.tableName }, 'PostgreSQL adapter closed');
    }
  }

  private mapRowToEntity(row: any): T {
    return {
      ...row,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    } as T;
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
