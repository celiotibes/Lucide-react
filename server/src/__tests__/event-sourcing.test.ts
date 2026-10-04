/**
 * Testes para Event Sourcing Foundation
 * Validar que eventos são capturados e auditados
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { EventStore } from '../domain/events/EventStore.js';
import {
  criarCobrancaCriadaEvent,
  criarCobrancaReconciliadaEvent,
  criarCobrancaDeletadaEvent,
} from '../domain/events/CobrancaEvents.js';

describe('Event Sourcing Foundation', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');

    // Cria tabela de event store
    db.exec(`
      CREATE TABLE IF NOT EXISTS event_store (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        agregado_id TEXT NOT NULL,
        agregado_tipo TEXT NOT NULL,
        payload TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        versao INTEGER NOT NULL,
        metadados TEXT,
        correlacao_id TEXT,
        criado_em TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_agregado_id ON event_store(agregado_id);
      CREATE INDEX IF NOT EXISTS idx_event_type ON event_store(event_type);
      CREATE INDEX IF NOT EXISTS idx_timestamp ON event_store(timestamp);
    `);
  });

  describe('Event creation', () => {
    it('should create CobrancaCriada event', () => {
      const event = criarCobrancaCriadaEvent(
        1,
        10,
        20,
        1000.0,
        '2026-11-03'
      );

      expect(event.type).toBe('CobrancaCriada');
      expect(event.agregadoId).toBe('cobranca-1');
      expect(event.agregadoTipo).toBe('Cobranca');
      expect(event.payload.cobrancaId).toBe(1);
      expect(event.payload.valor).toBe(1000.0);
      expect(event.payload.status).toBe('pendente');
    });

    it('should create CobrancaReconciliada event', () => {
      const event = criarCobrancaReconciliadaEvent(
        1,
        'pago',
        '2026-10-15'
      );

      expect(event.type).toBe('CobrancaReconciliada');
      expect(event.payload.novoStatus).toBe('pago');
      expect(event.payload.dataPagamento).toBe('2026-10-15');
    });

    it('should include metadata in events', () => {
      const metadata = {
        usuarioId: 5,
        ipAddress: '192.168.1.1',
        userAgent: 'test-agent',
      };

      const event = criarCobrancaCriadaEvent(
        1,
        10,
        20,
        1000.0,
        '2026-11-03',
        metadata
      );

      expect(event.metadados).toEqual(metadata);
    });

    it('should set timestamp for events', () => {
      const event = criarCobrancaCriadaEvent(1, 10, 20, 1000.0, '2026-11-03');
      const eventTime = new Date(event.timestamp);
      const now = new Date();

      expect(eventTime.getTime()).toBeLessThanOrEqual(now.getTime());
      expect(eventTime.getTime()).toBeGreaterThanOrEqual(now.getTime() - 1000); // within 1 second
    });
  });

  describe('Event Store operations', () => {
    it('should append and retrieve events', async () => {
      const store = new EventStore(db);

      const event = criarCobrancaCriadaEvent(1, 10, 20, 1000.0, '2026-11-03');
      await store.append(event);

      const events = await store.getEventsForAggregate('cobranca-1');

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('CobrancaCriada');
      expect(events[0].payload.cobrancaId).toBe(1);
    });

    it('should retrieve events by type', async () => {
      const store = new EventStore(db);

      const event1 = criarCobrancaCriadaEvent(1, 10, 20, 1000.0, '2026-11-03');
      const event2 = criarCobrancaCriadaEvent(2, 10, 21, 2000.0, '2026-11-03');
      const event3 = criarCobrancaReconciliadaEvent(1, 'pago', '2026-10-15');

      await store.append(event1);
      await store.append(event2);
      await store.append(event3);

      const criadaEvents = await store.getEventsByType('CobrancaCriada');
      const reconciliadaEvents = await store.getEventsByType('CobrancaReconciliada');

      expect(criadaEvents).toHaveLength(2);
      expect(reconciliadaEvents).toHaveLength(1);
    });

    it('should retrieve events by date range', async () => {
      const store = new EventStore(db);

      const dataInicio = '2026-10-01T00:00:00Z';
      const dataFim = '2026-10-31T23:59:59Z';

      const event1 = criarCobrancaCriadaEvent(1, 10, 20, 1000.0, '2026-11-03');
      const event2 = criarCobrancaCriadaEvent(2, 10, 21, 2000.0, '2026-11-03');

      // Manually set timestamps for testing
      event1.timestamp = '2026-10-10T10:00:00Z';
      event2.timestamp = '2026-10-20T10:00:00Z';

      await store.append(event1);
      await store.append(event2);

      const events = await store.getEventsByDateRange(dataInicio, dataFim);

      expect(events).toHaveLength(2);
    });

    it('should count total events', async () => {
      const store = new EventStore(db);

      const event1 = criarCobrancaCriadaEvent(1, 10, 20, 1000.0, '2026-11-03');
      const event2 = criarCobrancaCriadaEvent(2, 10, 21, 2000.0, '2026-11-03');

      await store.append(event1);
      await store.append(event2);

      const count = await store.getEventCount();

      expect(count).toBe(2);
    });
  });

  describe('Event audit trail', () => {
    it('should preserve complete audit trail', async () => {
      const store = new EventStore(db);

      // Simular ciclo de vida de uma cobrança
      const cobrancaId = 1;

      const criadaEvent = criarCobrancaCriadaEvent(
        cobrancaId,
        10,
        20,
        1000.0,
        '2026-11-03',
        { criadorId: 5 }
      );

      const reconciliadaEvent = criarCobrancaReconciliadaEvent(
        cobrancaId,
        'pago',
        '2026-10-15',
        { pagadorId: 10 }
      );

      await store.append(criadaEvent);
      await store.append(reconciliadaEvent);

      const trail = await store.getEventsForAggregate('cobranca-1');

      expect(trail).toHaveLength(2);
      expect(trail[0].type).toBe('CobrancaCriada');
      expect(trail[1].type).toBe('CobrancaReconciliada');
      expect(trail[0].metadados?.criadorId).toBe(5);
      expect(trail[1].metadados?.pagadorId).toBe(10);
    });

    it('should maintain event order by timestamp', async () => {
      const store = new EventStore(db);

      const event1 = criarCobrancaCriadaEvent(1, 10, 20, 1000.0, '2026-11-03');
      const event2 = criarCobrancaReconciliadaEvent(1, 'pago', '2026-10-15');
      const event3 = criarCobrancaDeletadaEvent(1, 'erro no sistema');

      // Add with small delays to ensure different timestamps
      await store.append(event1);
      await new Promise(resolve => setTimeout(resolve, 10));
      await store.append(event2);
      await new Promise(resolve => setTimeout(resolve, 10));
      await store.append(event3);

      const trail = await store.getEventsForAggregate('cobranca-1');

      expect(trail).toHaveLength(3);
      expect(trail[0].type).toBe('CobrancaCriada');
      expect(trail[1].type).toBe('CobrancaReconciliada');
      expect(trail[2].type).toBe('CobrancaDeletada');
    });

    it('should correlate related events', async () => {
      const store = new EventStore(db);

      const correlacaoId = 'corr-123';

      const event1 = criarCobrancaCriadaEvent(1, 10, 20, 1000.0, '2026-11-03');
      event1.correlacaoId = correlacaoId;

      const event2 = criarCobrancaReconciliadaEvent(1, 'pago', '2026-10-15');
      event2.correlacaoId = correlacaoId;

      await store.append(event1);
      await store.append(event2);

      const trail = await store.getEventsForAggregate('cobranca-1');

      expect(trail.every(e => e.correlacaoId === correlacaoId)).toBe(true);
    });
  });
});
