/**
 * Transaction Service Tests - Phase 22.20.4
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { TransactionService } from '../transaction-service.js';
import { CategoryService } from '../category-service.js';

let db: Database.Database;
let transactionService: TransactionService;
let categoryService: CategoryService;

describe('TransactionService', () => {
  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(':memory:');

    // Create required tables
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
        FOREIGN KEY (parent_id) REFERENCES categorias(id) ON DELETE SET NULL,
        FOREIGN KEY (usuario_criacao) REFERENCES usuarios(id) ON DELETE SET NULL,
        FOREIGN KEY (usuario_alteracao) REFERENCES usuarios(id) ON DELETE SET NULL
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
        FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL,
        FOREIGN KEY (usuario_criacao) REFERENCES usuarios(id) ON DELETE SET NULL,
        FOREIGN KEY (usuario_alteracao) REFERENCES usuarios(id) ON DELETE SET NULL,
        UNIQUE (referencia_externa, fonte)
      );

      CREATE TABLE transacoes_historico (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transacao_id INTEGER NOT NULL,
        campo TEXT NOT NULL,
        valor_antigo TEXT,
        valor_novo TEXT,
        usuario_id INTEGER,
        data_alteracao DATETIME DEFAULT CURRENT_TIMESTAMP,
        motivo_alteracao TEXT,
        FOREIGN KEY (transacao_id) REFERENCES transacoes_completas(id) ON DELETE CASCADE,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
      );
    `);

    // Insert test user
    db.prepare('INSERT INTO usuarios (id, email, nome) VALUES (?, ?, ?)').run(1, 'test@example.com', 'Test User');

    transactionService = new TransactionService(db);
    categoryService = new CategoryService(db);
  });

  describe('create', () => {
    it('should create a transaction', () => {
      const transaction = transactionService.create({
        usuario_id: 1,
        descricao: 'Test transaction',
        tipo_fluxo: 'receita',
        valor: 100.00,
        data_transacao: '2024-01-15',
      });

      expect(transaction.id).toBeDefined();
      expect(transaction.descricao).toBe('Test transaction');
      expect(transaction.valor).toBe(100.00);
      expect(transaction.status).toBe('confirmada');
    });

    it('should fail with invalid valor', () => {
      expect(() =>
        transactionService.create({
          usuario_id: 1,
          descricao: 'Test',
          tipo_fluxo: 'receita',
          valor: -100,
          data_transacao: '2024-01-15',
        })
      ).toThrow('Valor deve ser positivo');
    });

    it('should fail with invalid tipo_fluxo', () => {
      expect(() =>
        transactionService.create({
          usuario_id: 1,
          descricao: 'Test',
          tipo_fluxo: 'invalid' as any,
          valor: 100,
          data_transacao: '2024-01-15',
        })
      ).toThrow('Tipo de fluxo inválido');
    });

    it('should fail with invalid date', () => {
      expect(() =>
        transactionService.create({
          usuario_id: 1,
          descricao: 'Test',
          tipo_fluxo: 'receita',
          valor: 100,
          data_transacao: '01-15-2024',
        })
      ).toThrow('Data de transação inválida');
    });
  });

  describe('getById', () => {
    it('should retrieve a transaction', () => {
      const created = transactionService.create({
        usuario_id: 1,
        descricao: 'Test transaction',
        tipo_fluxo: 'receita',
        valor: 100.00,
        data_transacao: '2024-01-15',
      });

      const retrieved = transactionService.getById(created.id, 1);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.descricao).toBe('Test transaction');
    });

    it('should return null for non-existent transaction', () => {
      const retrieved = transactionService.getById(9999, 1);
      expect(retrieved).toBeNull();
    });
  });

  describe('list', () => {
    it('should list transactions', () => {
      transactionService.create({
        usuario_id: 1,
        descricao: 'Test 1',
        tipo_fluxo: 'receita',
        valor: 100,
        data_transacao: '2024-01-15',
      });

      transactionService.create({
        usuario_id: 1,
        descricao: 'Test 2',
        tipo_fluxo: 'despesa',
        valor: 50,
        data_transacao: '2024-01-16',
      });

      const result = transactionService.list({ usuario_id: 1 });
      expect(result.data.length).toBe(2);
      expect(result.total).toBe(2);
    });

    it('should filter by tipo_fluxo', () => {
      transactionService.create({
        usuario_id: 1,
        descricao: 'Receita',
        tipo_fluxo: 'receita',
        valor: 100,
        data_transacao: '2024-01-15',
      });

      transactionService.create({
        usuario_id: 1,
        descricao: 'Despesa',
        tipo_fluxo: 'despesa',
        valor: 50,
        data_transacao: '2024-01-16',
      });

      const result = transactionService.list({
        usuario_id: 1,
        tipo_fluxo: 'receita',
      });

      expect(result.data.length).toBe(1);
      expect(result.data[0].tipo_fluxo).toBe('receita');
    });

    it('should filter by date range', () => {
      transactionService.create({
        usuario_id: 1,
        descricao: 'Before',
        tipo_fluxo: 'receita',
        valor: 100,
        data_transacao: '2024-01-10',
      });

      transactionService.create({
        usuario_id: 1,
        descricao: 'Within range',
        tipo_fluxo: 'receita',
        valor: 100,
        data_transacao: '2024-01-15',
      });

      transactionService.create({
        usuario_id: 1,
        descricao: 'After',
        tipo_fluxo: 'receita',
        valor: 100,
        data_transacao: '2024-01-20',
      });

      const result = transactionService.list({
        usuario_id: 1,
        data_inicio: '2024-01-12',
        data_fim: '2024-01-18',
      });

      expect(result.data.length).toBe(1);
      expect(result.data[0].descricao).toBe('Within range');
    });
  });

  describe('update', () => {
    it('should update a transaction', () => {
      const created = transactionService.create({
        usuario_id: 1,
        descricao: 'Original',
        tipo_fluxo: 'receita',
        valor: 100,
        data_transacao: '2024-01-15',
      });

      const updated = transactionService.update(created.id, 1, {
        descricao: 'Updated',
        valor: 200,
      });

      expect(updated.descricao).toBe('Updated');
      expect(updated.valor).toBe(200);
    });

    it('should record history on update', () => {
      const created = transactionService.create({
        usuario_id: 1,
        descricao: 'Original',
        tipo_fluxo: 'receita',
        valor: 100,
        data_transacao: '2024-01-15',
      });

      transactionService.update(created.id, 1, { valor: 200 });

      const history = transactionService.getHistory(created.id, 1);
      expect(history.length).toBeGreaterThan(0);
      expect(history.some(h => h.campo === 'valor')).toBe(true);
    });
  });

  describe('delete', () => {
    it('should soft-delete a transaction', () => {
      const created = transactionService.create({
        usuario_id: 1,
        descricao: 'Test',
        tipo_fluxo: 'receita',
        valor: 100,
        data_transacao: '2024-01-15',
      });

      transactionService.delete(created.id, 1);

      const retrieved = transactionService.getById(created.id, 1);
      expect(retrieved).toBeNull();
    });
  });

  describe('getHistory', () => {
    it('should retrieve transaction history', () => {
      const created = transactionService.create({
        usuario_id: 1,
        descricao: 'Original',
        tipo_fluxo: 'receita',
        valor: 100,
        data_transacao: '2024-01-15',
      });

      transactionService.update(created.id, 1, { valor: 200 });
      transactionService.update(created.id, 1, { descricao: 'Updated' });

      const history = transactionService.getHistory(created.id, 1);
      expect(history.length).toBeGreaterThan(0);
    });
  });
});
