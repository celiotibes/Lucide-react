/**
 * Implementação de repositório para Cobrança
 * Usa better-sqlite3 para persistência
 */

import type Database from 'better-sqlite3';
import type { Cobranca, ICobrancaRepository } from './ICobrancaRepository.js';

/** Linha crua da tabela `cobrancas` (snake_case). */
interface LinhaCobranca {
  id: number;
  usuario_id: number;
  imovel_id: number;
  data_cobranca: string;
  data_vencimento: string;
  valor: number;
  status: Cobranca['status'];
  descricao: string;
  criado_em: string;
  atualizado_em: string;
}

/** O repositório GRAVA em camelCase (entidade -> colunas snake_case) e antes devolvia as linhas cruas
 * com um cast `as Cobranca`: usuarioId, imovelId etc. voltavam `undefined`. Toda leitura passa por aqui. */
function paraCobranca(l: LinhaCobranca): Cobranca {
  return {
    id: l.id,
    usuarioId: l.usuario_id,
    imovelId: l.imovel_id,
    dataCobranca: l.data_cobranca,
    dataVencimento: l.data_vencimento,
    valor: l.valor,
    status: l.status,
    descricao: l.descricao,
    criadoEm: l.criado_em,
    atualizadoEm: l.atualizado_em,
  };
}

export class CobrancaRepository implements ICobrancaRepository {
  constructor(private db: Database.Database) {}

  async findById(id: number): Promise<Cobranca | null> {
    const stmt = this.db.prepare('SELECT * FROM cobrancas WHERE id = ?');
    const linha = stmt.get(id) as LinhaCobranca | undefined;
    return linha ? paraCobranca(linha) : null;
  }

  async findAll(): Promise<Cobranca[]> {
    const stmt = this.db.prepare('SELECT * FROM cobrancas ORDER BY data_cobranca DESC');
    return (stmt.all() as LinhaCobranca[]).map(paraCobranca);
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
    return (stmt.all(usuarioId) as LinhaCobranca[]).map(paraCobranca);
  }

  async findByImovelId(imovelId: number): Promise<Cobranca[]> {
    const stmt = this.db.prepare('SELECT * FROM cobrancas WHERE imovel_id = ? ORDER BY data_cobranca DESC');
    return (stmt.all(imovelId) as LinhaCobranca[]).map(paraCobranca);
  }

  async findByStatus(status: Cobranca['status']): Promise<Cobranca[]> {
    const stmt = this.db.prepare('SELECT * FROM cobrancas WHERE status = ? ORDER BY data_cobranca DESC');
    return (stmt.all(status) as LinhaCobranca[]).map(paraCobranca);
  }

  async findVencidas(): Promise<Cobranca[]> {
    const hoje = new Date().toISOString().split('T')[0];
    const stmt = this.db.prepare(`
      SELECT * FROM cobrancas
      WHERE status IN ('pendente', 'atrasado') AND data_vencimento < ?
      ORDER BY data_vencimento ASC
    `);
    return (stmt.all(hoje) as LinhaCobranca[]).map(paraCobranca);
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
