/**
 * Implementação de repositório para Cobrança
 * Usa better-sqlite3 para persistência
 */

import type Database from 'better-sqlite3';
import type { Cobranca, ICobrancaRepository } from './ICobrancaRepository.js';

export class CobrancaRepository implements ICobrancaRepository {
  constructor(private db: Database.Database) {}

  async findById(id: number): Promise<Cobranca | null> {
    const stmt = this.db.prepare('SELECT * FROM cobrancas WHERE id = ?');
    return stmt.get(id) as Cobranca | null;
  }

  async findAll(): Promise<Cobranca[]> {
    const stmt = this.db.prepare('SELECT * FROM cobrancas ORDER BY data_cobranca DESC');
    return stmt.all() as Cobranca[];
  }

  async save(entity: Cobranca): Promise<Cobranca> {
    const now = new Date().toISOString();

    if (entity.id) {
      const stmt = this.db.prepare(`
        UPDATE cobrancas
        SET usuario_id = ?, imovel_id = ?, data_cobranca = ?,
            data_vencimento = ?, valor = ?, status = ?, descricao = ?, atualizado_em = ?
        WHERE id = ?
      `);
      stmt.run(
        entity.usuarioId, entity.imovelId, entity.dataCobranca,
        entity.dataVencimento, entity.valor, entity.status, entity.descricao, now,
        entity.id
      );
      return { ...entity, atualizadoEm: now };
    } else {
      const stmt = this.db.prepare(`
        INSERT INTO cobrancas (usuario_id, imovel_id, data_cobranca, data_vencimento, valor, status, descricao, criado_em, atualizado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        entity.usuarioId, entity.imovelId, entity.dataCobranca,
        entity.dataVencimento, entity.valor, entity.status, entity.descricao, now, now
      );
      return { ...entity, id: Number(result.lastInsertRowid), criadoEm: now, atualizadoEm: now };
    }
  }

  async delete(id: number): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM cobrancas WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  async exists(id: number): Promise<boolean> {
    const stmt = this.db.prepare('SELECT 1 FROM cobrancas WHERE id = ? LIMIT 1');
    return stmt.get(id) !== undefined;
  }

  async count(): Promise<number> {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM cobrancas');
    const result = stmt.get() as { count: number };
    return result.count;
  }

  async findByUsuarioId(usuarioId: number): Promise<Cobranca[]> {
    const stmt = this.db.prepare('SELECT * FROM cobrancas WHERE usuario_id = ? ORDER BY data_cobranca DESC');
    return stmt.all(usuarioId) as Cobranca[];
  }

  async findByImovelId(imovelId: number): Promise<Cobranca[]> {
    const stmt = this.db.prepare('SELECT * FROM cobrancas WHERE imovel_id = ? ORDER BY data_cobranca DESC');
    return stmt.all(imovelId) as Cobranca[];
  }

  async findByStatus(status: Cobranca['status']): Promise<Cobranca[]> {
    const stmt = this.db.prepare('SELECT * FROM cobrancas WHERE status = ? ORDER BY data_cobranca DESC');
    return stmt.all(status) as Cobranca[];
  }

  async findVencidas(): Promise<Cobranca[]> {
    const hoje = new Date().toISOString().split('T')[0];
    const stmt = this.db.prepare(`
      SELECT * FROM cobrancas
      WHERE status IN ('pendente', 'atrasado') AND data_vencimento < ?
      ORDER BY data_vencimento ASC
    `);
    return stmt.all(hoje) as Cobranca[];
  }

  async updateStatus(id: number, status: Cobranca['status']): Promise<boolean> {
    const now = new Date().toISOString();
    const stmt = this.db.prepare('UPDATE cobrancas SET status = ?, atualizado_em = ? WHERE id = ?');
    const result = stmt.run(status, now, id);
    return result.changes > 0;
  }

  async deleteOlderThan(data: string): Promise<number> {
    const stmt = this.db.prepare('DELETE FROM cobrancas WHERE data_cobranca < ?');
    const result = stmt.run(data);
    return result.changes;
  }
}
