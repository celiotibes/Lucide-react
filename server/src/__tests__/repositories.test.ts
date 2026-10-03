/**
 * Testes para Repository Pattern
 * Validar que repositórios funcionam e são mockáveis
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { CobrancaRepository } from '../domain/repositories/CobrancaRepository.js';
import { UsuarioRepository } from '../domain/repositories/UsuarioRepository.js';
import { AnomaliaRepository } from '../domain/repositories/AnomaliaRepository.js';
import type { Cobranca } from '../domain/repositories/ICobrancaRepository.js';
import type { Usuario } from '../domain/repositories/IUsuarioRepository.js';
import type { Anomalia } from '../domain/repositories/IAnomaliaRepository.js';

describe('Repository Pattern', () => {
  let db: Database.Database;

  beforeEach(() => {
    // Cria banco de dados em memória para testes
    db = new Database(':memory:');

    // Cria tabelas necessárias
    db.exec(`
      CREATE TABLE IF NOT EXISTS cobrancas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        imovel_id INTEGER NOT NULL,
        data_cobranca TEXT NOT NULL,
        data_vencimento TEXT NOT NULL,
        valor REAL NOT NULL,
        status TEXT NOT NULL,
        descricao TEXT,
        criado_em TEXT NOT NULL,
        atualizado_em TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        nome TEXT NOT NULL,
        cpf TEXT UNIQUE,
        telefone TEXT,
        ativo INTEGER DEFAULT 1,
        papel TEXT NOT NULL,
        criado_em TEXT NOT NULL,
        atualizado_em TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS anomalias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        tipo TEXT NOT NULL,
        severidade TEXT NOT NULL,
        descricao TEXT NOT NULL,
        status TEXT NOT NULL,
        data_deteccao TEXT NOT NULL,
        data_resolucao TEXT,
        criado_em TEXT NOT NULL,
        atualizado_em TEXT NOT NULL
      );
    `);
  });

  describe('CobrancaRepository', () => {
    it('should save and retrieve a Cobranca', async () => {
      const repo = new CobrancaRepository(db);

      const cobranca: Cobranca = {
        id: 0,
        usuarioId: 1,
        imovelId: 1,
        dataCobranca: '2026-10-03',
        dataVencimento: '2026-11-03',
        valor: 1000.0,
        status: 'pendente',
        descricao: 'Aluguel',
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      };

      const saved = await repo.save(cobranca);
      expect(saved.id).toBeGreaterThan(0);

      const retrieved = await repo.findById(saved.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.usuarioId).toBe(1);
      expect(retrieved?.valor).toBe(1000.0);
    });

    it('should find cobrancas by status', async () => {
      const repo = new CobrancaRepository(db);

      const cobranca1: Cobranca = {
        id: 0,
        usuarioId: 1,
        imovelId: 1,
        dataCobranca: '2026-10-03',
        dataVencimento: '2026-11-03',
        valor: 1000.0,
        status: 'pendente',
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      };

      const cobranca2: Cobranca = {
        id: 0,
        usuarioId: 1,
        imovelId: 1,
        dataCobranca: '2026-09-03',
        dataVencimento: '2026-10-03',
        valor: 500.0,
        status: 'pago',
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      };

      await repo.save(cobranca1);
      await repo.save(cobranca2);

      const pendentes = await repo.findByStatus('pendente');
      const pagos = await repo.findByStatus('pago');

      expect(pendentes).toHaveLength(1);
      expect(pagos).toHaveLength(1);
    });

    it('should update status', async () => {
      const repo = new CobrancaRepository(db);

      const cobranca: Cobranca = {
        id: 0,
        usuarioId: 1,
        imovelId: 1,
        dataCobranca: '2026-10-03',
        dataVencimento: '2026-11-03',
        valor: 1000.0,
        status: 'pendente',
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      };

      const saved = await repo.save(cobranca);
      const updated = await repo.updateStatus(saved.id, 'pago');

      expect(updated).toBe(true);

      const retrieved = await repo.findById(saved.id);
      expect(retrieved?.status).toBe('pago');
    });
  });

  describe('UsuarioRepository', () => {
    it('should save and retrieve a Usuario', async () => {
      const repo = new UsuarioRepository(db);

      const usuario: Usuario = {
        id: 0,
        email: 'test@example.com',
        nome: 'Test User',
        cpf: '12345678900',
        ativo: true,
        papel: 'usuario',
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      };

      const saved = await repo.save(usuario);
      expect(saved.id).toBeGreaterThan(0);

      const retrieved = await repo.findById(saved.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.email).toBe('test@example.com');
    });

    it('should find usuario by email', async () => {
      const repo = new UsuarioRepository(db);

      const usuario: Usuario = {
        id: 0,
        email: 'user@example.com',
        nome: 'Test User',
        ativo: true,
        papel: 'usuario',
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      };

      await repo.save(usuario);

      const retrieved = await repo.findByEmail('user@example.com');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.email).toBe('user@example.com');
    });

    it('should find ativos usuarios', async () => {
      const repo = new UsuarioRepository(db);

      const user1: Usuario = {
        id: 0,
        email: 'ativo@example.com',
        nome: 'Active User',
        ativo: true,
        papel: 'usuario',
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      };

      const user2: Usuario = {
        id: 0,
        email: 'inativo@example.com',
        nome: 'Inactive User',
        ativo: false,
        papel: 'usuario',
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      };

      await repo.save(user1);
      await repo.save(user2);

      const ativos = await repo.findAtivos();
      expect(ativos).toHaveLength(1);
      expect(ativos[0].email).toBe('ativo@example.com');
    });
  });

  describe('AnomaliaRepository', () => {
    it('should save and retrieve an Anomalia', async () => {
      const repo = new AnomaliaRepository(db);

      const anomalia: Anomalia = {
        id: 0,
        usuarioId: 1,
        tipo: 'financeira',
        severidade: 'alta',
        descricao: 'Transação suspeita',
        status: 'detectada',
        dataDeteccao: new Date().toISOString(),
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      };

      const saved = await repo.save(anomalia);
      expect(saved.id).toBeGreaterThan(0);

      const retrieved = await repo.findById(saved.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.tipo).toBe('financeira');
    });

    it('should find critical anomalias', async () => {
      const repo = new AnomaliaRepository(db);

      const anomalia: Anomalia = {
        id: 0,
        usuarioId: 1,
        tipo: 'seguranca',
        severidade: 'critica',
        descricao: 'Acesso não autorizado',
        status: 'detectada',
        dataDeteccao: new Date().toISOString(),
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      };

      await repo.save(anomalia);

      const criticas = await repo.findCriticasAbertas();
      expect(criticas).toHaveLength(1);
      expect(criticas[0].severidade).toBe('critica');
    });
  });

  describe('Repository Mocking', () => {
    it('should support mocking for unit tests', async () => {
      // Mock repository
      const mockRepository = {
        findById: async (id: number) => ({
          id,
          usuarioId: 1,
          imovelId: 1,
          dataCobranca: '2026-10-03',
          dataVencimento: '2026-11-03',
          valor: 1000.0,
          status: 'pendente' as const,
          criadoEm: new Date().toISOString(),
          atualizadoEm: new Date().toISOString(),
        }),
        findAll: async () => [],
        save: async (entity: Cobranca) => entity,
        delete: async (id: number) => true,
        exists: async (id: number) => true,
        count: async () => 1,
        findByUsuarioId: async () => [],
        findByImovelId: async () => [],
        findByStatus: async () => [],
        findVencidas: async () => [],
        updateStatus: async () => true,
        deleteOlderThan: async () => 0,
      };

      const cobranca = await mockRepository.findById(1);
      expect(cobranca.valor).toBe(1000.0);
      expect(cobranca.status).toBe('pendente');
    });

    it('should allow partial mocking for integration tests', async () => {
      const realRepo = new CobrancaRepository(db);

      // Spy-like mock that wraps the real repository
      const spiedRepo = {
        ...realRepo,
        callCount: 0,
        findById: async (id: number) => {
          spiedRepo.callCount++;
          return realRepo.findById(id);
        },
      };

      await spiedRepo.findById(999);
      expect(spiedRepo.callCount).toBe(1);
    });
  });
});
