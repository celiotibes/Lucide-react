/**
 * Budget Service - Phase 22.20.4
 *
 * Lógica de negócio para orçamentos:
 * - CRUD de orçamentos
 * - Cálculo de variance (real vs orçado)
 * - Tracking de progresso (% utilizado)
 * - Alertas de limite
 * - Suporte a categorias específicas ou global
 */

import Database from 'better-sqlite3';
import { logger } from './logger-service.js';

export interface CreateBudgetInput {
  usuario_id: number;
  categoria_id?: number; // null = orçamento global
  nome: string;
  descricao?: string;
  data_inicio: string; // YYYY-MM-DD
  data_fim: string;    // YYYY-MM-DD
  valor_limite: number;
  valor_alerta?: number;
  percentual_alerta?: number; // padrão 80%
}

export interface UpdateBudgetInput {
  nome?: string;
  descricao?: string;
  valor_limite?: number;
  valor_alerta?: number;
  percentual_alerta?: number;
  ativo?: boolean;
  data_inicio?: string;
  data_fim?: string;
}

export interface BudgetResponse {
  id: number;
  usuario_id: number;
  categoria_id: number | null;
  nome: string;
  descricao: string | null;
  data_inicio: string;
  data_fim: string;
  valor_limite: number;
  valor_utilizado: number;
  valor_alerta: number | null;
  percentual_alerta: number;
  ativo: number;
  criado_em: string;
  alterado_em: string;
}

export interface BudgetVariance {
  orcamento_id: number;
  valor_limite: number;
  valor_utilizado: number;
  valor_disponivel: number;
  percentual_utilizado: number;
  acima_do_limite: boolean;
  status_alerta: 'normal' | 'alerta' | 'critico';
}

export interface BudgetTracking {
  orcamento_id: number;
  nome: string;
  percentual: number;
  cor_status: string; // 'green' | 'yellow' | 'red'
  valor_utilizado: number;
  valor_limite: number;
}

export class BudgetService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Criar novo orçamento
   */
  create(input: CreateBudgetInput): BudgetResponse {
    // Validações
    if (input.valor_limite <= 0) {
      throw new Error('Valor limite deve ser positivo');
    }

    if (!this.isValidDate(input.data_inicio) || !this.isValidDate(input.data_fim)) {
      throw new Error('Data inválida (YYYY-MM-DD)');
    }

    if (new Date(input.data_inicio) >= new Date(input.data_fim)) {
      throw new Error('Data de início deve ser anterior à data de fim');
    }

    // Validar categoria se fornecida
    if (input.categoria_id) {
      const categoria = this.db
        .prepare('SELECT id FROM categorias WHERE id = ? AND usuario_id = ?')
        .get(input.categoria_id, input.usuario_id);
      if (!categoria) {
        throw new Error('Categoria não encontrada');
      }
    }

    const stmt = this.db.prepare(`
      INSERT INTO orcamentos (
        usuario_id, categoria_id, nome, descricao, data_inicio, data_fim,
        valor_limite, valor_alerta, percentual_alerta, ativo,
        usuario_criacao, usuario_alteracao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);

    const result = stmt.run(
      input.usuario_id,
      input.categoria_id || null,
      input.nome,
      input.descricao || null,
      input.data_inicio,
      input.data_fim,
      input.valor_limite,
      input.valor_alerta || null,
      input.percentual_alerta || 80,
      input.usuario_id,
      input.usuario_id
    );

    const orcamento = this.getById(result.lastInsertRowid as number, input.usuario_id);
    if (!orcamento) {
      throw new Error('Falha ao recuperar orçamento criado');
    }

    logger.info('Budget created', {
      id: result.lastInsertRowid,
      usuario_id: input.usuario_id,
      valor_limite: input.valor_limite,
    });

    return orcamento;
  }

  /**
   * Obter orçamento por ID
   */
  getById(id: number, usuario_id: number): BudgetResponse | null {
    const stmt = this.db.prepare(`
      SELECT * FROM orcamentos
      WHERE id = ? AND usuario_id = ? AND is_deleted = 0
    `);

    return stmt.get(id, usuario_id) as BudgetResponse | null;
  }

  /**
   * Listar orçamentos do usuário em um período
   */
  listByPeriod(
    usuario_id: number,
    data_inicio?: string,
    data_fim?: string,
    limit: number = 50,
    offset: number = 0
  ): {
    data: BudgetResponse[];
    total: number;
  } {
    let query = 'SELECT * FROM orcamentos WHERE usuario_id = ? AND is_deleted = 0';
    const params: unknown[] = [usuario_id];

    // Se periodo fornecido, buscar orçamentos naquele período ou que o período se sobrepõe
    if (data_inicio && data_fim) {
      query += ' AND data_inicio <= ? AND data_fim >= ?';
      params.push(data_fim, data_inicio);
    }

    const countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM (${query})`);
    const countResult = countStmt.get(...params) as { count: number };

    const listQuery = query + ' ORDER BY data_inicio DESC LIMIT ? OFFSET ?';
    const listStmt = this.db.prepare(listQuery);
    const data = listStmt.all(...params, limit, offset) as BudgetResponse[];

    return {
      data,
      total: countResult.count,
    };
  }

  /**
   * Atualizar orçamento
   */
  update(id: number, usuario_id: number, input: UpdateBudgetInput): BudgetResponse {
    const orcamento = this.getById(id, usuario_id);
    if (!orcamento) {
      throw new Error('Orçamento não encontrado');
    }

    // Validações
    if (input.valor_limite !== undefined && input.valor_limite <= 0) {
      throw new Error('Valor limite deve ser positivo');
    }

    if (input.data_inicio || input.data_fim) {
      const inicio = input.data_inicio || orcamento.data_inicio;
      const fim = input.data_fim || orcamento.data_fim;

      if (!this.isValidDate(inicio) || !this.isValidDate(fim)) {
        throw new Error('Data inválida');
      }

      if (new Date(inicio) >= new Date(fim)) {
        throw new Error('Data de início deve ser anterior à data de fim');
      }
    }

    // Registrar histórico
    if (input.valor_limite !== undefined && input.valor_limite !== orcamento.valor_limite) {
      this.recordHistory(
        id,
        'valor_limite',
        orcamento.valor_limite.toString(),
        input.valor_limite.toString(),
        usuario_id
      );
    }

    if (input.percentual_alerta !== undefined && input.percentual_alerta !== orcamento.percentual_alerta) {
      this.recordHistory(
        id,
        'percentual_alerta',
        orcamento.percentual_alerta.toString(),
        input.percentual_alerta.toString(),
        usuario_id
      );
    }

    // Atualizar
    const updateFields: string[] = [];
    const updateParams: unknown[] = [];

    if (input.nome !== undefined) {
      updateFields.push('nome = ?');
      updateParams.push(input.nome);
    }

    if (input.descricao !== undefined) {
      updateFields.push('descricao = ?');
      updateParams.push(input.descricao);
    }

    if (input.valor_limite !== undefined) {
      updateFields.push('valor_limite = ?');
      updateParams.push(input.valor_limite);
    }

    if (input.valor_alerta !== undefined) {
      updateFields.push('valor_alerta = ?');
      updateParams.push(input.valor_alerta);
    }

    if (input.percentual_alerta !== undefined) {
      updateFields.push('percentual_alerta = ?');
      updateParams.push(input.percentual_alerta);
    }

    if (input.ativo !== undefined) {
      updateFields.push('ativo = ?');
      updateParams.push(input.ativo ? 1 : 0);
    }

    if (input.data_inicio !== undefined) {
      updateFields.push('data_inicio = ?');
      updateParams.push(input.data_inicio);
    }

    if (input.data_fim !== undefined) {
      updateFields.push('data_fim = ?');
      updateParams.push(input.data_fim);
    }

    if (updateFields.length === 0) {
      return orcamento;
    }

    updateFields.push('alterado_em = CURRENT_TIMESTAMP');
    updateFields.push('usuario_alteracao = ?');
    updateParams.push(usuario_id);

    const stmt = this.db.prepare(`
      UPDATE orcamentos
      SET ${updateFields.join(', ')}
      WHERE id = ? AND usuario_id = ?
    `);

    stmt.run(...updateParams, id, usuario_id);

    const updated = this.getById(id, usuario_id);
    if (!updated) {
      throw new Error('Falha ao recuperar orçamento atualizado');
    }

    logger.info('Budget updated', { id, usuario_id });

    return updated;
  }

  /**
   * Soft-delete de orçamento
   */
  delete(id: number, usuario_id: number): void {
    const orcamento = this.getById(id, usuario_id);
    if (!orcamento) {
      throw new Error('Orçamento não encontrado');
    }

    const stmt = this.db.prepare(`
      UPDATE orcamentos
      SET is_deleted = 1, alterado_em = CURRENT_TIMESTAMP, usuario_alteracao = ?
      WHERE id = ? AND usuario_id = ?
    `);

    stmt.run(usuario_id, id, usuario_id);

    logger.info('Budget deleted', { id, usuario_id });
  }

  /**
   * Calcular variance (real vs orçado) para um orçamento
   * - Busca transações na categoria do período
   * - Calcula valor utilizado
   * - Retorna % utilizado e status
   */
  getVariance(id: number, usuario_id: number): BudgetVariance {
    const orcamento = this.getById(id, usuario_id);
    if (!orcamento) {
      throw new Error('Orçamento não encontrado');
    }

    // Buscar transações que se aplicam ao orçamento
    let query = `
      SELECT COALESCE(SUM(valor), 0) as total
      FROM transacoes_completas
      WHERE usuario_id = ?
        AND tipo_fluxo = 'despesa'
        AND data_transacao >= ?
        AND data_transacao <= ?
        AND is_deleted = 0
    `;

    const params: unknown[] = [usuario_id, orcamento.data_inicio, orcamento.data_fim];

    // Se categoria específica, filtrar por ela
    if (orcamento.categoria_id) {
      query += ' AND categoria_id = ?';
      params.push(orcamento.categoria_id);
    }

    const result = this.db.prepare(query).get(...params) as { total: number };
    const valor_utilizado = result.total;

    // Atualizar valor_utilizado no banco (para não recalcular sempre)
    this.db
      .prepare('UPDATE orcamentos SET valor_utilizado = ? WHERE id = ?')
      .run(valor_utilizado, id);

    const valor_disponivel = orcamento.valor_limite - valor_utilizado;
    const percentual_utilizado = (valor_utilizado / orcamento.valor_limite) * 100;

    // Determinar status do alerta
    let status_alerta: 'normal' | 'alerta' | 'critico' = 'normal';
    if (percentual_utilizado >= 100) {
      status_alerta = 'critico';
    } else if (percentual_utilizado >= (orcamento.percentual_alerta || 80)) {
      status_alerta = 'alerta';
    }

    return {
      orcamento_id: id,
      valor_limite: orcamento.valor_limite,
      valor_utilizado,
      valor_disponivel: Math.max(0, valor_disponivel),
      percentual_utilizado: Math.min(100, percentual_utilizado),
      acima_do_limite: valor_utilizado > orcamento.valor_limite,
      status_alerta,
    };
  }

  /**
   * Obter tracking (progress bar) para um orçamento
   */
  getTracking(id: number, usuario_id: number): BudgetTracking {
    const orcamento = this.getById(id, usuario_id);
    if (!orcamento) {
      throw new Error('Orçamento não encontrado');
    }

    const variance = this.getVariance(id, usuario_id);

    const cor_status = variance.status_alerta === 'normal'
      ? 'green'
      : variance.status_alerta === 'alerta'
        ? 'yellow'
        : 'red';

    return {
      orcamento_id: id,
      nome: orcamento.nome,
      percentual: variance.percentual_utilizado,
      cor_status,
      valor_utilizado: variance.valor_utilizado,
      valor_limite: orcamento.valor_limite,
    };
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
    orcamento_id: number,
    campo: string,
    valor_antigo: string,
    valor_novo: string,
    usuario_id: number
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO orcamentos_historico (
        orcamento_id, campo, valor_antigo, valor_novo, usuario_id
      ) VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(orcamento_id, campo, valor_antigo, valor_novo, usuario_id);
  }
}
