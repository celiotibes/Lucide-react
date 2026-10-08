/**
 * Budget Service Tests - Phase 22.20.4
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { BudgetService } from '../budget-service.js';

let db: Database.Database;
let budgetService: BudgetService;

describe('BudgetService', () => {
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
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
      );

      CREATE TABLE orcamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        categoria_id INTEGER,
        nome TEXT NOT NULL,
        descricao TEXT,
        data_inicio DATE NOT NULL,
        data_fim DATE NOT NULL,
        valor_limite REAL NOT NULL,
        valor_utilizado REAL DEFAULT 0,
        valor_alerta REAL,
        percentual_alerta INTEGER DEFAULT 80,
        ativo INTEGER DEFAULT 1,
        is_deleted INTEGER DEFAULT 0,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        usuario_criacao INTEGER,
        alterado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        usuario_alteracao INTEGER,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
        FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL
      );

      CREATE TABLE orcamentos_historico (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orcamento_id INTEGER NOT NULL,
        campo TEXT NOT NULL,
        valor_antigo TEXT,
        valor_novo TEXT,
        usuario_id INTEGER,
        data_alteracao DATETIME DEFAULT CURRENT_TIMESTAMP,
        motivo TEXT,
        FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id) ON DELETE CASCADE
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

    budgetService = new BudgetService(db);
  });

  describe('create', () => {
    it('should create a budget', () => {
      const budget = budgetService.create({
        usuario_id: 1,
        nome: 'Monthly Budget',
        data_inicio: '2024-01-01',
        data_fim: '2024-01-31',
        valor_limite: 1000,
      });

      expect(budget.id).toBeDefined();
      expect(budget.nome).toBe('Monthly Budget');
      expect(budget.valor_limite).toBe(1000);
    });

    it('should fail with invalid valor_limite', () => {
      expect(() =>
        budgetService.create({
          usuario_id: 1,
          nome: 'Budget',
          data_inicio: '2024-01-01',
          data_fim: '2024-01-31',
          valor_limite: -100,
        })
      ).toThrow('Valor limite deve ser positivo');
    });

    it('should fail with invalid date range', () => {
      expect(() =>
        budgetService.create({
          usuario_id: 1,
          nome: 'Budget',
          data_inicio: '2024-01-31',
          data_fim: '2024-01-01',
          valor_limite: 1000,
        })
      ).toThrow('Data de início deve ser anterior à data de fim');
    });
  });

  describe('getById', () => {
    it('should retrieve a budget', () => {
      const created = budgetService.create({
        usuario_id: 1,
        nome: 'Monthly Budget',
        data_inicio: '2024-01-01',
        data_fim: '2024-01-31',
        valor_limite: 1000,
      });

      const retrieved = budgetService.getById(created.id, 1);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.nome).toBe('Monthly Budget');
    });

    it('should return null for non-existent budget', () => {
      const retrieved = budgetService.getById(9999, 1);
      expect(retrieved).toBeNull();
    });
  });

  describe('update', () => {
    it('should update a budget', () => {
      const created = budgetService.create({
        usuario_id: 1,
        nome: 'Original',
        data_inicio: '2024-01-01',
        data_fim: '2024-01-31',
        valor_limite: 1000,
      });

      const updated = budgetService.update(created.id, 1, {
        nome: 'Updated',
        valor_limite: 2000,
      });

      expect(updated.nome).toBe('Updated');
      expect(updated.valor_limite).toBe(2000);
    });
  });

  describe('getVariance', () => {
    it('should calculate variance correctly', () => {
      const budget = budgetService.create({
        usuario_id: 1,
        nome: 'Budget',
        data_inicio: '2024-01-01',
        data_fim: '2024-01-31',
        valor_limite: 1000,
      });

      // Add a transaction
      db.prepare(`
        INSERT INTO transacoes_completas (
          usuario_id, descricao, tipo_fluxo, valor, data_transacao
        ) VALUES (?, ?, ?, ?, ?)
      `).run(1, 'Test expense', 'despesa', 300, '2024-01-15');

      const variance = budgetService.getVariance(budget.id, 1);
      expect(variance.valor_utilizado).toBe(300);
      expect(variance.valor_disponivel).toBe(700);
      expect(variance.percentual_utilizado).toBe(30);
    });

    it('should report status_alerta correctly', () => {
      const budget = budgetService.create({
        usuario_id: 1,
        nome: 'Budget',
        data_inicio: '2024-01-01',
        data_fim: '2024-01-31',
        valor_limite: 1000,
        percentual_alerta: 80,
      });

      // Add 90% of budget as expense
      db.prepare(`
        INSERT INTO transacoes_completas (
          usuario_id, descricao, tipo_fluxo, valor, data_transacao
        ) VALUES (?, ?, ?, ?, ?)
      `).run(1, 'Large expense', 'despesa', 900, '2024-01-15');

      const variance = budgetService.getVariance(budget.id, 1);
      expect(variance.status_alerta).toBe('alerta');
    });
  });

  describe('getTracking', () => {
    it('should return tracking info', () => {
      const budget = budgetService.create({
        usuario_id: 1,
        nome: 'Monthly Budget',
        data_inicio: '2024-01-01',
        data_fim: '2024-01-31',
        valor_limite: 1000,
      });

      const tracking = budgetService.getTracking(budget.id, 1);
      expect(tracking.nome).toBe('Monthly Budget');
      expect(tracking.valor_limite).toBe(1000);
      expect(tracking.percentual).toBe(0);
    });
  });

  describe('delete', () => {
    it('should soft-delete a budget', () => {
      const created = budgetService.create({
        usuario_id: 1,
        nome: 'Budget',
        data_inicio: '2024-01-01',
        data_fim: '2024-01-31',
        valor_limite: 1000,
      });

      budgetService.delete(created.id, 1);

      const retrieved = budgetService.getById(created.id, 1);
      expect(retrieved).toBeNull();
    });
  });

  describe('listByPeriod', () => {
    it('should list budgets in a period', () => {
      budgetService.create({
        usuario_id: 1,
        nome: 'January',
        data_inicio: '2024-01-01',
        data_fim: '2024-01-31',
        valor_limite: 1000,
      });

      budgetService.create({
        usuario_id: 1,
        nome: 'February',
        data_inicio: '2024-02-01',
        data_fim: '2024-02-29',
        valor_limite: 1200,
      });

      const result = budgetService.listByPeriod(1, '2024-01-01', '2024-01-31');
      expect(result.data.length).toBe(1);
      expect(result.data[0].nome).toBe('January');
    });
  });
});
