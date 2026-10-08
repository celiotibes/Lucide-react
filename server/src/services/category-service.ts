/**
 * Category Service - Phase 22.20.4
 *
 * Lógica de negócio para hierarquia de categorias:
 * - CRUD com suporte a parent_id (subcategorias)
 * - Validação de uso (antes de deletar)
 * - Recuperação de transações da categoria
 * - Árvore de categorias completa
 */

import Database from 'better-sqlite3';
import { logger } from './logger-service.js';

export interface CreateCategoryInput {
  usuario_id: number;
  nome: string;
  descricao?: string;
  parent_id?: number; // null = categoria raiz
  tipo_fluxo: 'receita' | 'despesa' | 'ambos';
  cor_hex?: string;
  icone_nome?: string;
}

export interface UpdateCategoryInput {
  nome?: string;
  descricao?: string;
  parent_id?: number;
  tipo_fluxo?: string;
  cor_hex?: string;
  icone_nome?: string;
}

export interface CategoryResponse {
  id: number;
  usuario_id: number;
  nome: string;
  descricao: string | null;
  parent_id: number | null;
  tipo_fluxo: string;
  cor_hex: string | null;
  icone_nome: string | null;
  ordem: number;
  criado_em: string;
  alterado_em: string;
}

export interface CategoryTree extends CategoryResponse {
  filhos: CategoryTree[];
}

export class CategoryService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Criar nova categoria
   */
  create(input: CreateCategoryInput): CategoryResponse {
    // Validações
    if (!input.nome || input.nome.trim().length === 0) {
      throw new Error('Nome da categoria é obrigatório');
    }

    if (!['receita', 'despesa', 'ambos'].includes(input.tipo_fluxo)) {
      throw new Error('Tipo de fluxo inválido');
    }

    // Validar parent_id se fornecido
    if (input.parent_id) {
      const parent = this.db
        .prepare('SELECT id FROM categorias WHERE id = ? AND usuario_id = ? AND is_deleted = 0')
        .get(input.parent_id, input.usuario_id);
      if (!parent) {
        throw new Error('Categoria pai não encontrada');
      }

      // Validar ciclo: parent_id não pode ser descendente de si mesmo
      if (this.hasCycle(input.usuario_id, input.parent_id, input.parent_id)) {
        throw new Error('Criaria ciclo na hierarquia de categorias');
      }
    }

    // Validar cor_hex se fornecida
    if (input.cor_hex && !this.isValidHexColor(input.cor_hex)) {
      throw new Error('Cor hexadecimal inválida (use #RRGGBB)');
    }

    const stmt = this.db.prepare(`
      INSERT INTO categorias (
        usuario_id, nome, descricao, parent_id, tipo_fluxo,
        cor_hex, icone_nome, usuario_criacao, usuario_alteracao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      input.usuario_id,
      input.nome,
      input.descricao || null,
      input.parent_id || null,
      input.tipo_fluxo,
      input.cor_hex || null,
      input.icone_nome || null,
      input.usuario_id,
      input.usuario_id
    );

    const categoria = this.getById(result.lastInsertRowid as number, input.usuario_id);
    if (!categoria) {
      throw new Error('Falha ao recuperar categoria criada');
    }

    logger.info('Category created', {
      id: result.lastInsertRowid,
      usuario_id: input.usuario_id,
      nome: input.nome,
    });

    return categoria;
  }

  /**
   * Obter categoria por ID
   */
  getById(id: number, usuario_id: number): CategoryResponse | null {
    const stmt = this.db.prepare(`
      SELECT * FROM categorias
      WHERE id = ? AND usuario_id = ? AND is_deleted = 0
    `);

    return stmt.get(id, usuario_id) as CategoryResponse | null;
  }

  /**
   * Listar todas as categorias do usuário (com opção de apenas raízes)
   */
  list(usuario_id: number, onlyRoots: boolean = false): CategoryResponse[] {
    let query = 'SELECT * FROM categorias WHERE usuario_id = ? AND is_deleted = 0';
    const params: unknown[] = [usuario_id];

    if (onlyRoots) {
      query += ' AND parent_id IS NULL';
    }

    query += ' ORDER BY ordem, nome';

    const stmt = this.db.prepare(query);
    return stmt.all(...params) as CategoryResponse[];
  }

  /**
   * Obter árvore completa de categorias
   */
  getTree(usuario_id: number): CategoryTree[] {
    const allCategories = this.list(usuario_id);
    const roots = allCategories.filter(c => !c.parent_id);

    return roots.map(root => this.buildTree(root, allCategories));
  }

  /**
   * Atualizar categoria
   */
  update(id: number, usuario_id: number, input: UpdateCategoryInput): CategoryResponse {
    const categoria = this.getById(id, usuario_id);
    if (!categoria) {
      throw new Error('Categoria não encontrada');
    }

    // Validações
    if (input.nome && input.nome.trim().length === 0) {
      throw new Error('Nome da categoria é obrigatório');
    }

    if (input.tipo_fluxo && !['receita', 'despesa', 'ambos'].includes(input.tipo_fluxo)) {
      throw new Error('Tipo de fluxo inválido');
    }

    if (input.cor_hex && !this.isValidHexColor(input.cor_hex)) {
      throw new Error('Cor hexadecimal inválida');
    }

    // Validar parent_id se fornecido
    if (input.parent_id !== undefined) {
      if (input.parent_id === id) {
        throw new Error('Categoria não pode ser pai de si mesma');
      }

      if (input.parent_id) {
        const parent = this.getById(input.parent_id, usuario_id);
        if (!parent) {
          throw new Error('Categoria pai não encontrada');
        }

        // Validar ciclo
        if (this.hasCycle(usuario_id, input.parent_id, id)) {
          throw new Error('Criaria ciclo na hierarquia');
        }
      }
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

    if (input.parent_id !== undefined) {
      updateFields.push('parent_id = ?');
      updateParams.push(input.parent_id || null);
    }

    if (input.tipo_fluxo !== undefined) {
      updateFields.push('tipo_fluxo = ?');
      updateParams.push(input.tipo_fluxo);
    }

    if (input.cor_hex !== undefined) {
      updateFields.push('cor_hex = ?');
      updateParams.push(input.cor_hex);
    }

    if (input.icone_nome !== undefined) {
      updateFields.push('icone_nome = ?');
      updateParams.push(input.icone_nome);
    }

    if (updateFields.length === 0) {
      return categoria;
    }

    updateFields.push('alterado_em = CURRENT_TIMESTAMP');
    updateFields.push('usuario_alteracao = ?');
    updateParams.push(usuario_id);

    const stmt = this.db.prepare(`
      UPDATE categorias
      SET ${updateFields.join(', ')}
      WHERE id = ? AND usuario_id = ?
    `);

    stmt.run(...updateParams, id, usuario_id);

    const updated = this.getById(id, usuario_id);
    if (!updated) {
      throw new Error('Falha ao recuperar categoria atualizada');
    }

    logger.info('Category updated', { id, usuario_id });

    return updated;
  }

  /**
   * Soft-delete de categoria
   * Verifica se há transações usando a categoria antes de deletar
   */
  delete(id: number, usuario_id: number): void {
    const categoria = this.getById(id, usuario_id);
    if (!categoria) {
      throw new Error('Categoria não encontrada');
    }

    // Verificar se há transações usando a categoria
    const usageCount = this.db
      .prepare(`
        SELECT COUNT(*) as count
        FROM transacoes_completas
        WHERE categoria_id = ? AND is_deleted = 0
      `)
      .get(id) as { count: number };

    if (usageCount.count > 0) {
      throw new Error(
        `Categoria tem ${usageCount.count} transação(ões) associada(s). ` +
        'Não é possível deletar. Remova ou reatribua as transações primeiro.'
      );
    }

    // Verificar se há subcategorias
    const childrenCount = this.db
      .prepare(`
        SELECT COUNT(*) as count
        FROM categorias
        WHERE parent_id = ? AND is_deleted = 0
      `)
      .get(id) as { count: number };

    if (childrenCount.count > 0) {
      throw new Error(
        `Categoria tem ${childrenCount.count} subcategoria(s). ` +
        'Dele(i)te as subcategorias primeiro ou remova o pai.'
      );
    }

    const stmt = this.db.prepare(`
      UPDATE categorias
      SET is_deleted = 1, alterado_em = CURRENT_TIMESTAMP, usuario_alteracao = ?
      WHERE id = ? AND usuario_id = ?
    `);

    stmt.run(usuario_id, id, usuario_id);

    logger.info('Category deleted', { id, usuario_id });
  }

  /**
   * Obter todas as transações de uma categoria (incluindo subcategorias)
   */
  getTransactions(
    id: number,
    usuario_id: number,
    includeSub: boolean = true,
    limit: number = 50,
    offset: number = 0
  ): {
    data: any[];
    total: number;
  } {
    const categoria = this.getById(id, usuario_id);
    if (!categoria) {
      throw new Error('Categoria não encontrada');
    }

    let categoryIds = [id];

    if (includeSub) {
      const subcategorias = this.getSubcategoriesRecursive(id);
      categoryIds = categoryIds.concat(subcategorias.map(c => c.id));
    }

    const placeholders = categoryIds.map(() => '?').join(',');
    const params = [usuario_id, ...categoryIds, limit, offset];

    const countQuery = `
      SELECT COUNT(*) as count
      FROM transacoes_completas
      WHERE usuario_id = ? AND categoria_id IN (${placeholders}) AND is_deleted = 0
    `;

    const countResult = this.db.prepare(countQuery).get(usuario_id, ...categoryIds) as { count: number };

    const listQuery = `
      SELECT * FROM transacoes_completas
      WHERE usuario_id = ? AND categoria_id IN (${placeholders}) AND is_deleted = 0
      ORDER BY data_transacao DESC
      LIMIT ? OFFSET ?
    `;

    const listStmt = this.db.prepare(listQuery);
    const data = listStmt.all(...params);

    return {
      data,
      total: countResult.count,
    };
  }

  /**
   * Helpers privados
   */

  private getSubcategoriesRecursive(parent_id: number): CategoryResponse[] {
    const children = this.db
      .prepare(`SELECT * FROM categorias WHERE parent_id = ? AND is_deleted = 0`)
      .all(parent_id) as CategoryResponse[];

    let result: CategoryResponse[] = [...children];

    for (const child of children) {
      result = result.concat(this.getSubcategoriesRecursive(child.id));
    }

    return result;
  }

  private buildTree(root: CategoryResponse, allCategories: CategoryResponse[]): CategoryTree {
    const filhos = allCategories
      .filter(c => c.parent_id === root.id)
      .map(child => this.buildTree(child, allCategories));

    return {
      ...root,
      filhos,
    };
  }

  private isValidHexColor(hex: string): boolean {
    return /^#[0-9A-F]{6}$/i.test(hex);
  }

  private hasCycle(usuario_id: number, startId: number, targetId: number, visited = new Set<number>()): boolean {
    if (visited.has(startId)) {
      return startId === targetId;
    }

    if (startId === targetId) {
      return true;
    }

    visited.add(startId);

    const children = this.db
      .prepare(`SELECT id FROM categorias WHERE parent_id = ? AND usuario_id = ? AND is_deleted = 0`)
      .all(startId, usuario_id) as { id: number }[];

    for (const child of children) {
      if (this.hasCycle(usuario_id, child.id, targetId, visited)) {
        return true;
      }
    }

    return false;
  }
}
