import { poolManager } from '@database/poolManager';
import { PostgreSQLAdapter, Repository } from '@database/persistenceAdapter';
import { logger } from '@utils/logger';

// ============================================================================
// REPOSITORY FACTORY - Centralized Repository Management
// ============================================================================

interface RepositoryConfig {
  name: string;
  tableName: string;
}

class RepositoryFactory {
  private repositories: Map<string, Repository<any>> = new Map();
  private configs: RepositoryConfig[] = [
    { name: 'clients', tableName: 'crm_clients' },
    { name: 'contracts', tableName: 'contracts' },
    { name: 'invoices', tableName: 'financial_invoices' },
    { name: 'cases', tableName: 'legal_cases' },
    { name: 'intimations', tableName: 'intimations' },
    { name: 'auditLogs', tableName: 'audit_logs' },
    { name: 'webhooks', tableName: 'event_webhooks' },
    { name: 'events', tableName: 'events' },
  ];

  createRepository<T extends { id: string; createdAt: Date; updatedAt: Date }>(
    repositoryName: string,
  ): Repository<T> {
    if (this.repositories.has(repositoryName)) {
      return this.repositories.get(repositoryName) as Repository<T>;
    }

    const config = this.configs.find((c) => c.name === repositoryName);
    if (!config) {
      throw new Error(`Repository configuration not found for '${repositoryName}'`);
    }

    const pool = poolManager.getPool();
    const adapter = new PostgreSQLAdapter<T>(poolManager.getPool() as any, config.tableName, pool);
    const repository = new ConcreteRepository<T>(adapter);

    this.repositories.set(repositoryName, repository);
    logger.info({ repository: repositoryName, table: config.tableName }, 'Repository created');

    return repository;
  }

  getRepository<T extends { id: string; createdAt: Date; updatedAt: Date }>(
    repositoryName: string,
  ): Repository<T> {
    const repo = this.repositories.get(repositoryName);
    if (!repo) {
      return this.createRepository<T>(repositoryName);
    }
    return repo as Repository<T>;
  }

  hasRepository(repositoryName: string): boolean {
    return this.repositories.has(repositoryName);
  }

  listRepositories(): string[] {
    return Array.from(this.repositories.keys());
  }

  async closeAll(): Promise<void> {
    for (const [name, repo] of this.repositories.entries()) {
      try {
        logger.debug({ repository: name }, 'Closing repository');
      } catch (error) {
        logger.error({ repository: name, error }, 'Error closing repository');
      }
    }
    this.repositories.clear();
  }
}

/**
 * Concrete repository implementation
 */
class ConcreteRepository<T extends { id: string; createdAt: Date; updatedAt: Date }> extends Repository<T> {
  constructor(adapter: PostgreSQLAdapter<T>) {
    super(adapter);
  }

  // Additional convenience methods can be added here
  async findByProperty(property: string, value: any): Promise<T | null> {
    const results = await this.findAll({ [property]: value });
    return results.length > 0 ? results[0] : null;
  }

  async findAllByProperty(property: string, value: any): Promise<T[]> {
    return this.findAll({ [property]: value });
  }

  async exists(id: string): Promise<boolean> {
    const entity = await this.find(id);
    return entity !== null;
  }
}

export const repositoryFactory = new RepositoryFactory();
