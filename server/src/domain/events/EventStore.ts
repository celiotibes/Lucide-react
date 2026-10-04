/**
 * Event Store
 * Persiste e recupera eventos para auditoria
 */

import type Database from 'better-sqlite3';
import type { DomainEvent } from './DomainEvent.js';

interface EventStoreRow {
  event_id: string;
  event_type: string;
  agregado_id: string;
  agregado_tipo: string;
  payload: string;
  timestamp: string;
  versao: number;
  metadados: string | null;
  correlacao_id: string | null;
}

export interface IEventStore {
  /**
   * Registra um evento
   */
  append(event: DomainEvent): Promise<void>;

  /**
   * Recupera eventos de um agregado
   */
  getEventsForAggregate(agregadoId: string): Promise<DomainEvent[]>;

  /**
   * Recupera todos os eventos de um tipo
   */
  getEventsByType(type: string): Promise<DomainEvent[]>;

  /**
   * Recupera eventos em intervalo de datas
   */
  getEventsByDateRange(inicio: string, fim: string): Promise<DomainEvent[]>;

  /**
   * Retorna total de eventos
   */
  getEventCount(): Promise<number>;
}

export class EventStore implements IEventStore {
  constructor(private db: Database.Database) {}

  async append(event: DomainEvent): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO event_store (
        event_id, event_type, agregado_id, agregado_tipo, payload, timestamp, versao, metadados, correlacao_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      event.id,
      event.type,
      event.agregadoId,
      event.agregadoTipo,
      JSON.stringify(event.payload),
      event.timestamp,
      event.versao,
      event.metadados ? JSON.stringify(event.metadados) : null,
      event.correlacaoId || null
    );
  }

  async getEventsForAggregate(agregadoId: string): Promise<DomainEvent[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM event_store
      WHERE agregado_id = ?
      ORDER BY timestamp ASC
    `);

    const rows = stmt.all(agregadoId) as unknown as EventStoreRow[];
    return rows.map((row) => this.rowToDomainEvent(row));
  }

  async getEventsByType(type: string): Promise<DomainEvent[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM event_store
      WHERE event_type = ?
      ORDER BY timestamp DESC
    `);

    const rows = stmt.all(type) as unknown as EventStoreRow[];
    return rows.map((row) => this.rowToDomainEvent(row));
  }

  async getEventsByDateRange(inicio: string, fim: string): Promise<DomainEvent[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM event_store
      WHERE timestamp BETWEEN ? AND ?
      ORDER BY timestamp DESC
    `);

    const rows = stmt.all(inicio, fim) as unknown as EventStoreRow[];
    return rows.map((row) => this.rowToDomainEvent(row));
  }

  async getEventCount(): Promise<number> {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM event_store');
    const result = stmt.get() as { count: number };
    return result.count;
  }

  private rowToDomainEvent(row: EventStoreRow): DomainEvent {
    return {
      id: row.event_id,
      type: row.event_type,
      agregadoId: row.agregado_id,
      agregadoTipo: row.agregado_tipo,
      payload: JSON.parse(row.payload),
      timestamp: row.timestamp,
      versao: row.versao,
      metadados: row.metadados ? JSON.parse(row.metadados) : undefined,
      correlacaoId: row.correlacao_id,
    };
  }
}
