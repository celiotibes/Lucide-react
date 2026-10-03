/**
 * Container Setup
 * Inicializa o container com todos os serviços
 * Deve ser chamado durante startup da aplicação
 */

import type Database from 'better-sqlite3';
import { getContainer, type Container } from './container.js';
import { CacheService } from '../services/cache-service.js';
import { LoggerService } from '../services/logger-service.js';
import { SentryService } from '../services/sentry-service.js';

import { CobrancaRepository } from '../domain/repositories/CobrancaRepository.js';
import { UsuarioRepository } from '../domain/repositories/UsuarioRepository.js';
import { AnomaliaRepository } from '../domain/repositories/AnomaliaRepository.js';
import { EventStore } from '../domain/events/EventStore.js';

export interface ContainerSetupOptions {
  db: Database.Database;
  sentryDsn?: string;
}

/**
 * Configura o container global com todas as dependências
 */
export function setupContainer(options: ContainerSetupOptions): Container {
  const container = getContainer();
  const { db, sentryDsn } = options;

  // Registra instância do banco de dados (singleton)
  container.register('db', db);

  // Registra serviços infraestruturais (singletons)
  container.registerSingleton('cache', () => new CacheService());
  container.registerSingleton('logger', () => new LoggerService());

  if (sentryDsn) {
    container.registerSingleton('sentry', () => new SentryService({ dsn: sentryDsn }));
  }

  // Registra repositórios (singletons)
  container.registerSingleton('cobrancaRepository', () => new CobrancaRepository(db));
  container.registerSingleton('usuarioRepository', () => new UsuarioRepository(db));
  container.registerSingleton('anomaliaRepository', () => new AnomaliaRepository(db));

  // Registra event store (singleton)
  container.registerSingleton('eventStore', () => new EventStore(db));

  return container;
}

/**
 * Obtém ou cria container pré-configurado
 */
export function getConfiguredContainer(options?: ContainerSetupOptions): Container {
  const container = getContainer();

  if (options && !container.has('db')) {
    setupContainer(options);
  }

  return container;
}
