/**
 * Category Service Tests - Phase 22.20.4
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { CategoryService } from '../category-service.js';

let db: Database.Database;
let categoryService: CategoryService;

describe('CategoryService', () => {
  beforeEach(() => {
    db = new Database(':memory:');

    db.exec(`
      CREATE TABLE usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        nome TEXT NOT NULL
      );

      CREATE TABLE categorias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        nome TEXT NOT NULL,
        descricao TEXT,
        parent_id INTEGER,
        tipo_fluxo TEXT NOT NULL,
        cor_hex TEXT,
        icone_nome TEXT,
        ordem INTEGER DEFAULT 0,
        is_deleted INTEGER DEFAULT 0,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        usuario_criacao INTEGER,
        alterado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        usuario_alteracao INTEGER,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES categorias(id) ON DELETE SET NULL
      );

      CREATE TABLE transacoes_completas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        categoria_id INTEGER,
        descricao TEXT NOT NULL,
        tipo_fluxo TEXT NOT NULL,
        valor REAL NOT NULL,
        data_transacao DATE NOT NULL,
        referencia_externa TEXT,
        fonte TEXT,
        status TEXT DEFAULT 'confirmada',
        is_deleted INTEGER DEFAULT 0,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        usuario_criacao INTEGER,
        alterado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        usuario_alteracao INTEGER,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
        FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL
      );
    `);

    db.prepare('INSERT INTO usuarios (id, email, nome) VALUES (?, ?, ?)').run(1, 'test@example.com', 'Test User');

    categoryService = new CategoryService(db);
  });

  describe('create', () => {
    it('should create a root category', () => {
      const category = categoryService.create({
        usuario_id: 1,
        nome: 'Utilities',
        tipo_fluxo: 'despesa',
      });

      expect(category.id).toBeDefined();
      expect(category.nome).toBe('Utilities');
      expect(category.parent_id).toBeNull();
    });

    it('should create a subcategory', () => {
      const parent = categoryService.create({
        usuario_id: 1,
        nome: 'Utilities',
        tipo_fluxo: 'despesa',
      });

      const child = categoryService.create({
        usuario_id: 1,
        nome: 'Electricity',
        tipo_fluxo: 'despesa',
        parent_id: parent.id,
      });

      expect(child.parent_id).toBe(parent.id);
    });

    it('should fail with empty nome', () => {
      expect(() =>
        categoryService.create({
          usuario_id: 1,
          nome: '',
          tipo_fluxo: 'despesa',
        })
      ).toThrow('Nome da categoria é obrigatório');
    });

    it('should fail with invalid tipo_fluxo', () => {
      expect(() =>
        categoryService.create({
          usuario_id: 1,
          nome: 'Category',
          tipo_fluxo: 'invalid' as any,
        })
      ).toThrow('Tipo de fluxo inválido');
    });

    it('should fail with invalid hex color', () => {
      expect(() =>
        categoryService.create({
          usuario_id: 1,
          nome: 'Category',
          tipo_fluxo: 'despesa',
          cor_hex: 'not-a-color',
        })
      ).toThrow('Cor hexadecimal inválida');
    });
  });

  describe('getById', () => {
    it('should retrieve a category', () => {
      const created = categoryService.create({
        usuario_id: 1,
        nome: 'Utilities',
        tipo_fluxo: 'despesa',
      });

      const retrieved = categoryService.getById(created.id, 1);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.nome).toBe('Utilities');
    });

    it('should return null for non-existent category', () => {
      const retrieved = categoryService.getById(9999, 1);
      expect(retrieved).toBeNull();
    });
  });

  describe('list', () => {
    it('should list all categories', () => {
      categoryService.create({
        usuario_id: 1,
        nome: 'Utilities',
        tipo_fluxo: 'despesa',
      });

      categoryService.create({
        usuario_id: 1,
        nome: 'Salary',
        tipo_fluxo: 'receita',
      });

      const result = categoryService.list(1);
      expect(result.length).toBe(2);
    });

    it('should list only root categories when requested', () => {
      const parent = categoryService.create({
        usuario_id: 1,
        nome: 'Parent',
        tipo_fluxo: 'despesa',
      });

      categoryService.create({
        usuario_id: 1,
        nome: 'Child',
        tipo_fluxo: 'despesa',
        parent_id: parent.id,
      });

      const result = categoryService.list(1, true);
      expect(result.length).toBe(1);
      expect(result[0].nome).toBe('Parent');
    });
  });

  describe('getTree', () => {
    it('should return hierarchical tree structure', () => {
      const parent = categoryService.create({
        usuario_id: 1,
        nome: 'Utilities',
        tipo_fluxo: 'despesa',
      });

      const child = categoryService.create({
        usuario_id: 1,
        nome: 'Electricity',
        tipo_fluxo: 'despesa',
        parent_id: parent.id,
      });

      const tree = categoryService.getTree(1);
      expect(tree.length).toBe(1);
      expect(tree[0].nome).toBe('Utilities');
      expect(tree[0].filhos.length).toBe(1);
      expect(tree[0].filhos[0].nome).toBe('Electricity');
    });
  });

  describe('update', () => {
    it('should update a category', () => {
      const created = categoryService.create({
        usuario_id: 1,
        nome: 'Original',
        tipo_fluxo: 'despesa',
      });

      const updated = categoryService.update(created.id, 1, {
        nome: 'Updated',
      });

      expect(updated.nome).toBe('Updated');
    });

    it('should fail when making category a parent of itself', () => {
      const created = categoryService.create({
        usuario_id: 1,
        nome: 'Category',
        tipo_fluxo: 'despesa',
      });

      expect(() =>
        categoryService.update(created.id, 1, { parent_id: created.id })
      ).toThrow('Categoria não pode ser pai de si mesma');
    });
  });

  describe('delete', () => {
    it('should soft-delete a category without transactions', () => {
      const created = categoryService.create({
        usuario_id: 1,
        nome: 'Category',
        tipo_fluxo: 'despesa',
      });

      categoryService.delete(created.id, 1);

      const retrieved = categoryService.getById(created.id, 1);
      expect(retrieved).toBeNull();
    });

    it('should fail when category has transactions', () => {
      const category = categoryService.create({
        usuario_id: 1,
        nome: 'Category',
        tipo_fluxo: 'despesa',
      });

      // Add a transaction to this category
      db.prepare(`
        INSERT INTO transacoes_completas (
          usuario_id, categoria_id, descricao, tipo_fluxo, valor, data_transacao
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(1, category.id, 'Test', 'despesa', 100, '2024-01-15');

      expect(() =>
        categoryService.delete(category.id, 1)
      ).toThrow('transação');
    });

    it('should fail when category has subcategories', () => {
      const parent = categoryService.create({
        usuario_id: 1,
        nome: 'Parent',
        tipo_fluxo: 'despesa',
      });

      categoryService.create({
        usuario_id: 1,
        nome: 'Child',
        tipo_fluxo: 'despesa',
        parent_id: parent.id,
      });

      expect(() =>
        categoryService.delete(parent.id, 1)
      ).toThrow('subcategoria');
    });
  });

  describe('getTransactions', () => {
    it('should retrieve transactions for a category', () => {
      const category = categoryService.create({
        usuario_id: 1,
        nome: 'Category',
        tipo_fluxo: 'despesa',
      });

      db.prepare(`
        INSERT INTO transacoes_completas (
          usuario_id, categoria_id, descricao, tipo_fluxo, valor, data_transacao
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(1, category.id, 'Test 1', 'despesa', 100, '2024-01-15');

      db.prepare(`
        INSERT INTO transacoes_completas (
          usuario_id, categoria_id, descricao, tipo_fluxo, valor, data_transacao
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(1, category.id, 'Test 2', 'despesa', 200, '2024-01-16');

      const result = categoryService.getTransactions(category.id, 1);
      expect(result.data.length).toBe(2);
      expect(result.total).toBe(2);
    });

    it('should include subcategory transactions when requested', () => {
      const parent = categoryService.create({
        usuario_id: 1,
        nome: 'Parent',
        tipo_fluxo: 'despesa',
      });

      const child = categoryService.create({
        usuario_id: 1,
        nome: 'Child',
        tipo_fluxo: 'despesa',
        parent_id: parent.id,
      });

      db.prepare(`
        INSERT INTO transacoes_completas (
          usuario_id, categoria_id, descricao, tipo_fluxo, valor, data_transacao
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(1, parent.id, 'Parent trans', 'despesa', 100, '2024-01-15');

      db.prepare(`
        INSERT INTO transacoes_completas (
          usuario_id, categoria_id, descricao, tipo_fluxo, valor, data_transacao
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(1, child.id, 'Child trans', 'despesa', 200, '2024-01-16');

      const result = categoryService.getTransactions(parent.id, 1, true);
      expect(result.data.length).toBe(2);

      const resultNoSub = categoryService.getTransactions(parent.id, 1, false);
      expect(resultNoSub.data.length).toBe(1);
    });
  });
});
