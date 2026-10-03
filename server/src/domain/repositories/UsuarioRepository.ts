/**
 * Implementação de repositório para Usuário
 * Usa better-sqlite3 para persistência
 */

import type Database from 'better-sqlite3';
import type { Usuario, IUsuarioRepository } from './IUsuarioRepository.js';

export class UsuarioRepository implements IUsuarioRepository {
  constructor(private db: Database.Database) {}

  async findById(id: number): Promise<Usuario | null> {
    const stmt = this.db.prepare('SELECT * FROM usuarios WHERE id = ?');
    return stmt.get(id) as Usuario | null;
  }

  async findAll(): Promise<Usuario[]> {
    const stmt = this.db.prepare('SELECT * FROM usuarios ORDER BY nome ASC');
    return stmt.all() as Usuario[];
  }

  async save(entity: Usuario): Promise<Usuario> {
    const now = new Date().toISOString();

    if (entity.id) {
      const stmt = this.db.prepare(`
        UPDATE usuarios
        SET email = ?, nome = ?, cpf = ?, telefone = ?, ativo = ?, papel = ?, atualizado_em = ?
        WHERE id = ?
      `);
      stmt.run(
        entity.email, entity.nome, entity.cpf, entity.telefone, entity.ativo ? 1 : 0, entity.papel, now,
        entity.id
      );
      return { ...entity, atualizadoEm: now };
    } else {
      const stmt = this.db.prepare(`
        INSERT INTO usuarios (email, nome, cpf, telefone, ativo, papel, criado_em, atualizado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        entity.email, entity.nome, entity.cpf, entity.telefone, entity.ativo ? 1 : 0, entity.papel, now, now
      );
      return { ...entity, id: Number(result.lastInsertRowid), criadoEm: now, atualizadoEm: now };
    }
  }

  async delete(id: number): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM usuarios WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  async exists(id: number): Promise<boolean> {
    const stmt = this.db.prepare('SELECT 1 FROM usuarios WHERE id = ? LIMIT 1');
    return stmt.get(id) !== undefined;
  }

  async count(): Promise<number> {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM usuarios');
    const result = stmt.get() as { count: number };
    return result.count;
  }

  async findByEmail(email: string): Promise<Usuario | null> {
    const stmt = this.db.prepare('SELECT * FROM usuarios WHERE email = ?');
    return stmt.get(email) as Usuario | null;
  }

  async findByCpf(cpf: string): Promise<Usuario | null> {
    const stmt = this.db.prepare('SELECT * FROM usuarios WHERE cpf = ?');
    return stmt.get(cpf) as Usuario | null;
  }

  async findAtivos(): Promise<Usuario[]> {
    const stmt = this.db.prepare('SELECT * FROM usuarios WHERE ativo = 1 ORDER BY nome ASC');
    return stmt.all() as Usuario[];
  }

  async findByPapel(papel: Usuario['papel']): Promise<Usuario[]> {
    const stmt = this.db.prepare('SELECT * FROM usuarios WHERE papel = ? ORDER BY nome ASC');
    return stmt.all(papel) as Usuario[];
  }

  async emailExists(email: string): Promise<boolean> {
    const stmt = this.db.prepare('SELECT 1 FROM usuarios WHERE email = ? LIMIT 1');
    return stmt.get(email) !== undefined;
  }

  async updateAtivo(id: number, ativo: boolean): Promise<boolean> {
    const now = new Date().toISOString();
    const stmt = this.db.prepare('UPDATE usuarios SET ativo = ?, atualizado_em = ? WHERE id = ?');
    const result = stmt.run(ativo ? 1 : 0, now, id);
    return result.changes > 0;
  }
}
