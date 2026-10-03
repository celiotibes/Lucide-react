/**
 * Implementação de repositório para Anomalia
 * Usa better-sqlite3 para persistência
 */

import type Database from 'better-sqlite3';
import type { Anomalia, IAnomaliaRepository } from './IAnomaliaRepository.js';

export class AnomaliaRepository implements IAnomaliaRepository {
  constructor(private db: Database.Database) {}

  async findById(id: number): Promise<Anomalia | null> {
    const stmt = this.db.prepare('SELECT * FROM anomalias WHERE id = ?');
    return stmt.get(id) as Anomalia | null;
  }

  async findAll(): Promise<Anomalia[]> {
    const stmt = this.db.prepare('SELECT * FROM anomalias ORDER BY data_deteccao DESC');
    return stmt.all() as Anomalia[];
  }

  async save(entity: Anomalia): Promise<Anomalia> {
    const now = new Date().toISOString();

    if (entity.id) {
      const stmt = this.db.prepare(`
        UPDATE anomalias
        SET usuario_id = ?, tipo = ?, severidade = ?, descricao = ?, status = ?,
            data_deteccao = ?, data_resolucao = ?, atualizado_em = ?
        WHERE id = ?
      `);
      stmt.run(
        entity.usuarioId, entity.tipo, entity.severidade, entity.descricao, entity.status,
        entity.dataDeteccao, entity.dataResolucao, now,
        entity.id
      );
      return { ...entity, atualizadoEm: now };
    } else {
      const stmt = this.db.prepare(`
        INSERT INTO anomalias (usuario_id, tipo, severidade, descricao, status, data_deteccao, criado_em, atualizado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        entity.usuarioId, entity.tipo, entity.severidade, entity.descricao, entity.status,
        entity.dataDeteccao, now, now
      );
      return { ...entity, id: Number(result.lastInsertRowid), criadoEm: now, atualizadoEm: now };
    }
  }

  async delete(id: number): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM anomalias WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  async exists(id: number): Promise<boolean> {
    const stmt = this.db.prepare('SELECT 1 FROM anomalias WHERE id = ? LIMIT 1');
    return stmt.get(id) !== undefined;
  }

  async count(): Promise<number> {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM anomalias');
    const result = stmt.get() as { count: number };
    return result.count;
  }

  async findByUsuarioId(usuarioId: number): Promise<Anomalia[]> {
    const stmt = this.db.prepare('SELECT * FROM anomalias WHERE usuario_id = ? ORDER BY data_deteccao DESC');
    return stmt.all(usuarioId) as Anomalia[];
  }

  async findByTipo(tipo: Anomalia['tipo']): Promise<Anomalia[]> {
    const stmt = this.db.prepare('SELECT * FROM anomalias WHERE tipo = ? ORDER BY data_deteccao DESC');
    return stmt.all(tipo) as Anomalia[];
  }

  async findBySeveridade(severidade: Anomalia['severidade']): Promise<Anomalia[]> {
    const stmt = this.db.prepare('SELECT * FROM anomalias WHERE severidade = ? ORDER BY data_deteccao DESC');
    return stmt.all(severidade) as Anomalia[];
  }

  async findByStatus(status: Anomalia['status']): Promise<Anomalia[]> {
    const stmt = this.db.prepare('SELECT * FROM anomalias WHERE status = ? ORDER BY data_deteccao DESC');
    return stmt.all(status) as Anomalia[];
  }

  async findCriticasAbertas(): Promise<Anomalia[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM anomalias
      WHERE severidade = 'critica' AND status IN ('detectada', 'investigando')
      ORDER BY data_deteccao ASC
    `);
    return stmt.all() as Anomalia[];
  }

  async updateStatus(id: number, status: Anomalia['status'], dataResolucao?: string): Promise<boolean> {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(
      'UPDATE anomalias SET status = ?, data_resolucao = ?, atualizado_em = ? WHERE id = ?'
    );
    const result = stmt.run(status, dataResolucao, now, id);
    return result.changes > 0;
  }

  async deleteOlderThan(data: string): Promise<number> {
    const stmt = this.db.prepare('DELETE FROM anomalias WHERE data_deteccao < ?');
    const result = stmt.run(data);
    return result.changes;
  }

  async findByDateRange(dataInicio: string, dataFim: string): Promise<Anomalia[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM anomalias
      WHERE data_deteccao BETWEEN ? AND ?
      ORDER BY data_deteccao DESC
    `);
    return stmt.all(dataInicio, dataFim) as Anomalia[];
  }
}
