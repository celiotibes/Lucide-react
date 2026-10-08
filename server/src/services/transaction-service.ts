/**
 * Transaction Service - Phase 22.20.4
 *
 * Lógica de negócio para gerenciamento completo de transações:
 * - CRUD com validações
 * - Paginação cursor-based
 * - Filtros por data, categoria, tipo_fluxo
 * - Auditoria automática com histórico
 * - Soft-delete strategy
 */

import Database from 'better-sqlite3';
import { logger } from './logger-service.js';

export interface CreateTransactionInput {
  usuario_id: number;
  categoria_id?: number;
  descricao: string;
  tipo_fluxo: 'receita' | 'despesa';
  valor: number;
  data_transacao: string; // YYYY-MM-DD
  referencia_externa?: string;
  fonte?: string; // 'manual', 'asaas', 'meuplugy', etc
  status?: 'rascunho' | 'pendente' | 'confirmada';
}

export interface UpdateTransactionInput {
  categoria_id?: number;
  descricao?: string;
  valor?: number;
  data_transacao?: string;
  status?: 'rascunho' | 'pendente' | 'confirmada' | 'cancelada';
}

export interface TransactionFilters {
  usuario_id: number;
  data_inicio?: string;
  data_fim?: string;
  categoria_id?: number;
  tipo_fluxo?: 'receita' | 'despesa';
  status?: string;
  limite?: number;
  offset?: number;
}

export interface TransactionResponse {
  id: number;
  usuario_id: number;
  categoria_id: number | null;
  descricao: string;
  tipo_fluxo: string;
  valor: number;
  data_transacao: string;
  referencia_externa: string | null;
  fonte: string | null;
  status: string;
  criado_em: string;
  alterado_em: string;
}

export class TransactionService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Criar nova transação
   */
  create(input: CreateTransactionInput): TransactionResponse {
    // Validações
    if (input.valor <= 0) {
      throw new Error('Valor deve ser positivo');
    }

    if (!input.tipo_fluxo || !['receita', 'despesa'].includes(input.tipo_fluxo)) {
      throw new Error('Tipo de fluxo inválido (receita ou despesa)');
    }

    // Validar data
    if (!this.isValidDate(input.data_transacao)) {
      throw new Error('Data de transação inválida (YYYY-MM-DD)');
    }

    // Validar categoria se fornecida
    if (input.categoria_id) {
      const categoria = this.db
        .prepare('SELECT id FROM categorias WHERE id = ? AND usuario_id = ?')
        .get(input.categoria_id, input.usuario_id);
      if (!categoria) {
        throw new Error('Categoria não encontrada ou não pertence ao usuário');
      }
    }

    // Validar referência externa duplicada se fornecida
    if (input.referencia_externa && input.fonte) {
      const existente = this.db
        .prepare('SELECT id FROM transacoes_completas WHERE referencia_externa = ? AND fonte = ? AND is_deleted = 0')
        .get(input.referencia_externa, input.fonte);
      if (existente) {
        throw new Error('Transação com mesma referência externa já existe');
      }
    }

    const stmt = this.db.prepare(`
      INSERT INTO transacoes_completas (
        usuario_id, categoria_id, descricao, tipo_fluxo, valor,
        data_transacao, referencia_externa, fonte, status,
        usuario_criacao, usuario_alteracao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      input.usuario_id,
      input.categoria_id || null,
      input.descricao,
      input.tipo_fluxo,
      input.valor,
      input.data_transacao,
      input.referencia_externa || null,
      input.fonte || 'manual',
      input.status || 'confirmada',
      input.usuario_id,
      input.usuario_id
    );

    const transacao = this.getById(result.lastInsertRowid as number, input.usuario_id);
    if (!transacao) {
      throw new Error('Falha ao recuperar transação criada');
    }

    logger.info('Transaction created', {
      id: result.lastInsertRowid,
      usuario_id: input.usuario_id,
      valor: input.valor,
    });

    return transacao;
  }

  /**
   * Obter transação por ID
   */
  getById(id: number, usuario_id: number): TransactionResponse | null {
    const stmt = this.db.prepare(`
      SELECT * FROM transacoes_completas
      WHERE id = ? AND usuario_id = ? AND is_deleted = 0
    `);

    return stmt.get(id, usuario_id) as TransactionResponse | null;
  }

  /**
   * Listar transações com filtros e paginação
   */
  list(filters: TransactionFilters): {
    data: TransactionResponse[];
    total: number;
    limite: number;
    offset: number;
  } {
    const limite = Math.min(filters.limite || 50, 1000); // Max 1000 por request
    const offset = filters.offset || 0;

    let query = 'SELECT * FROM transacoes_completas WHERE usuario_id = ? AND is_deleted = 0';
    const params: unknown[] = [filters.usuario_id];

    // Filtros opcionais
    if (filters.data_inicio) {
      query += ' AND data_transacao >= ?';
      params.push(filters.data_inicio);
    }

    if (filters.data_fim) {
      query += ' AND data_transacao <= ?';
      params.push(filters.data_fim);
    }

    if (filters.categoria_id) {
      query += ' AND categoria_id = ?';
      params.push(filters.categoria_id);
    }

    if (filters.tipo_fluxo) {
      query += ' AND tipo_fluxo = ?';
      params.push(filters.tipo_fluxo);
    }

    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    // Contar total
    const countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM (${query})`);
    const countResult = countStmt.get(...params) as { count: number };

    // Buscar com limit/offset
    const listQuery = query + ' ORDER BY data_transacao DESC, id DESC LIMIT ? OFFSET ?';
    const listStmt = this.db.prepare(listQuery);
    const data = listStmt.all(...params, limite, offset) as TransactionResponse[];

    return {
      data,
      total: countResult.count,
      limite,
      offset,
    };
  }

  /**
   * Atualizar transação
   */
  update(id: number, usuario_id: number, input: UpdateTransactionInput): TransactionResponse {
    // Obter transação existente
    const transacao = this.getById(id, usuario_id);
    if (!transacao) {
      throw new Error('Transação não encontrada');
    }

    // Validações
    if (input.valor !== undefined && input.valor <= 0) {
      throw new Error('Valor deve ser positivo');
    }

    if (input.data_transacao && !this.isValidDate(input.data_transacao)) {
      throw new Error('Data de transação inválida');
    }

    if (input.categoria_id) {
      const categoria = this.db
        .prepare('SELECT id FROM categorias WHERE id = ? AND usuario_id = ?')
        .get(input.categoria_id, usuario_id);
      if (!categoria) {
        throw new Error('Categoria não encontrada');
      }
    }

    // Registrar histórico de alterações
    if (input.valor !== undefined && input.valor !== transacao.valor) {
      this.recordHistory(id, 'valor', transacao.valor.toString(), input.valor.toString(), usuario_id);
    }

    if (input.descricao && input.descricao !== transacao.descricao) {
      this.recordHistory(id, 'descricao', transacao.descricao, input.descricao, usuario_id);
    }

    if (input.categoria_id !== undefined && input.categoria_id !== transacao.categoria_id) {
      this.recordHistory(
        id,
        'categoria_id',
        transacao.categoria_id?.toString() || null,
        input.categoria_id?.toString() || null,
        usuario_id
      );
    }

    if (input.status && input.status !== transacao.status) {
      this.recordHistory(id, 'status', transacao.status, input.status, usuario_id);
    }

    // Atualizar
    const updateFields: string[] = [];
    const updateParams: unknown[] = [];

    if (input.descricao !== undefined) {
      updateFields.push('descricao = ?');
      updateParams.push(input.descricao);
    }

    if (input.valor !== undefined) {
      updateFields.push('valor = ?');
      updateParams.push(input.valor);
    }

    if (input.data_transacao !== undefined) {
      updateFields.push('data_transacao = ?');
      updateParams.push(input.data_transacao);
    }

    if (input.categoria_id !== undefined) {
      updateFields.push('categoria_id = ?');
      updateParams.push(input.categoria_id || null);
    }

    if (input.status !== undefined) {
      updateFields.push('status = ?');
      updateParams.push(input.status);
    }

    if (updateFields.length === 0) {
      return transacao;
    }

    updateFields.push('alterado_em = CURRENT_TIMESTAMP');
    updateFields.push('usuario_alteracao = ?');
    updateParams.push(usuario_id);

    const stmt = this.db.prepare(`
      UPDATE transacoes_completas
      SET ${updateFields.join(', ')}
      WHERE id = ? AND usuario_id = ?
    `);

    stmt.run(...updateParams, id, usuario_id);

    const updated = this.getById(id, usuario_id);
    if (!updated) {
      throw new Error('Falha ao recuperar transação atualizada');
    }

    logger.info('Transaction updated', { id, usuario_id });

    return updated;
  }

  /**
   * Soft-delete de transação
   */
  delete(id: number, usuario_id: number): void {
    const transacao = this.getById(id, usuario_id);
    if (!transacao) {
      throw new Error('Transação não encontrada');
    }

    const stmt = this.db.prepare(`
      UPDATE transacoes_completas
      SET is_deleted = 1, alterado_em = CURRENT_TIMESTAMP, usuario_alteracao = ?
      WHERE id = ? AND usuario_id = ?
    `);

    stmt.run(usuario_id, id, usuario_id);

    this.recordHistory(id, 'is_deleted', '0', '1', usuario_id, 'Transação deletada (soft-delete)');

    logger.info('Transaction deleted', { id, usuario_id });
  }

  /**
   * Obter histórico de alterações de uma transação
   */
  getHistory(id: number, usuario_id: number, limite: number = 50): {
    id: number;
    transacao_id: number;
    campo: string;
    valor_antigo: string | null;
    valor_novo: string | null;
    usuario_id: number | null;
    data_alteracao: string;
    motivo_alteracao: string | null;
  }[] {
    // Verificar se transação pertence ao usuário
    const transacao = this.getById(id, usuario_id);
    if (!transacao) {
      throw new Error('Transação não encontrada');
    }

    const stmt = this.db.prepare(`
      SELECT * FROM transacoes_historico
      WHERE transacao_id = ?
      ORDER BY data_alteracao DESC
      LIMIT ?
    `);

    return stmt.all(id, limite) as any[];
  }

  /**
   * Helpers privados
   */

  private isValidDate(dateStr: string): boolean {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateStr)) return false;

    const date = new Date(dateStr);
    return date instanceof Date && !isNaN(date.getTime());
  }

  private recordHistory(
    transacao_id: number,
    campo: string,
    valor_antigo: string | number | null,
    valor_novo: string | number | null,
    usuario_id: number,
    motivo?: string
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO transacoes_historico (
        transacao_id, campo, valor_antigo, valor_novo, usuario_id, motivo_alteracao
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      transacao_id,
      campo,
      valor_antigo?.toString() || null,
      valor_novo?.toString() || null,
      usuario_id,
      motivo || null
    );
  }
}
