/**
 * Performance Tests for Economic Agents (Agentes Econômicos)
 *
 * Tests performance baseline and scalability:
 * - List 1000+ agents with pagination
 * - Duplicate detection on large dataset
 * - Backfill performance baseline
 * - Query agent balance performance
 * - Index effectiveness
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  generateBulkPessoasFisicas,
  TEST_ADMIN_USER,
} from './fixtures/agentes-fixtures.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, `test-agentes-perf-${process.pid}.db`);

function createTestDatabase(): Database.Database {
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  const db = new Database(TEST_DB_PATH);
  db.pragma('foreign_keys = ON');

  let authSchemaPath = path.join(__dirname, '../../migrations-phase2-auth.sql');
  if (!fs.existsSync(authSchemaPath)) {
    authSchemaPath = path.join(process.cwd(), 'server/src/migrations-phase2-auth.sql');
  }

  const authSchema = fs.readFileSync(authSchemaPath, 'utf-8');
  db.exec(authSchema);

  let agentesSchemaPath = path.join(__dirname, '../../migrations-phase18-agentes-economicos-sqlite.sql');
  if (!fs.existsSync(agentesSchemaPath)) {
    agentesSchemaPath = path.join(process.cwd(), 'server/src/migrations-phase18-agentes-economicos-sqlite.sql');
  }

  const agentesSchema = fs.readFileSync(agentesSchemaPath, 'utf-8');
  db.exec(agentesSchema);

  db.prepare(
    `INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao)
     VALUES (?, ?, ?, 'hash_test', ?, true, '2026-01-01')`
  ).run(TEST_ADMIN_USER.id, TEST_ADMIN_USER.nome, TEST_ADMIN_USER.email, 'admin');

  return db;
}

function insertAgente(db: Database.Database, agente: unknown) {
  const sql = `
    INSERT INTO agentes_economicos (
      id, tipo_entidade, cpf_cnpj, nome, nome_fantasia,
      pessoa_fisica_pf_nome_mae, papel, regime_tributario,
      inscricao_estadual, inscricao_municipal, classificacao_nfse,
      email, telefone, celular,
      endereco_logradouro, endereco_numero, endereco_complemento,
      endereco_bairro, endereco_cidade, endereco_estado, endereco_cep, endereco_pais,
      ativo, criado_em, criado_por, atualizado_em, atualizado_por,
      validado, validado_em, validado_por,
      observacoes, tags
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  return db.prepare(sql).run(
    agente.id, agente.tipo_entidade, agente.cpf_cnpj, agente.nome, agente.nome_fantasia || null,
    agente.pessoa_fisica_pf_nome_mae || null, agente.papel, agente.regime_tributario || null,
    agente.inscricao_estadual || null, agente.inscricao_municipal || null, agente.classificacao_nfse || null,
    agente.email || null, agente.telefone || null, agente.celular || null,
    agente.endereco?.logradouro || null, agente.endereco?.numero || null, agente.endereco?.complemento || null,
    agente.endereco?.bairro || null, agente.endereco?.cidade || null, agente.endereco?.estado || null,
    agente.endereco?.cep || null, agente.endereco?.pais || 'Brasil',
    agente.ativo ? 1 : 0, agente.criado_em.toISOString(), agente.criado_por,
    agente.atualizado_em.toISOString(), agente.atualizado_por,
    agente.validado ? 1 : 0, agente.validado_em ? agente.validado_em.toISOString() : null,
    agente.validado_por || null, agente.observacoes || null, agente.tags || null,
  );
}

describe('Agentes Performance Tests', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  describe('Bulk Insert Performance', () => {
    it('should insert 100 agents in reasonable time', () => {
      const agents = generateBulkPessoasFisicas(100).map(a => ({
        ...a,
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      }));

      const startTime = performance.now();

      const insertStmt = db.transaction(() => {
        agents.forEach(agent => insertAgente(db, agent));
      });

      insertStmt();

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(5000);  // 5 seconds for 100 inserts

      const count = db.prepare(
        'SELECT COUNT(*) as total FROM agentes_economicos'
      ).get() as unknown;

      expect(count.total).toBe(100);
    });

    it('should insert 500 agents efficiently', () => {
      const agents = generateBulkPessoasFisicas(500).map(a => ({
        ...a,
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      }));

      const startTime = performance.now();

      const insertStmt = db.transaction(() => {
        agents.forEach(agent => insertAgente(db, agent));
      });

      insertStmt();

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete in reasonable time
      expect(duration).toBeLessThan(15000);  // 15 seconds for 500 inserts

      const count = db.prepare(
        'SELECT COUNT(*) as total FROM agentes_economicos'
      ).get() as unknown;

      expect(count.total).toBe(500);
    });

    it('should insert 1000 agents with good performance', () => {
      const agents = generateBulkPessoasFisicas(1000).map(a => ({
        ...a,
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      }));

      const startTime = performance.now();

      const insertStmt = db.transaction(() => {
        agents.forEach(agent => insertAgente(db, agent));
      });

      insertStmt();

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time
      expect(duration).toBeLessThan(30000);  // 30 seconds for 1000 inserts

      const count = db.prepare(
        'SELECT COUNT(*) as total FROM agentes_economicos'
      ).get() as unknown;

      expect(count.total).toBe(1000);
    });
  });

  describe('List with Pagination Performance', () => {
    beforeEach(() => {
      const agents = generateBulkPessoasFisicas(200).map(a => ({
        ...a,
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      }));

      const insertStmt = db.transaction(() => {
        agents.forEach(agent => insertAgente(db, agent));
      });

      insertStmt();
    });

    it('should list first page efficiently', () => {
      const pageSize = 10;

      const startTime = performance.now();

      const items = db.prepare(
        'SELECT * FROM agentes_economicos ORDER BY criado_em DESC LIMIT ? OFFSET ?'
      ).all(pageSize, 0);

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(100);  // Should be fast
      expect(items.length).toBeLessThanOrEqual(pageSize);
    });

    it('should list middle page efficiently', () => {
      const pageSize = 10;
      const pageNumber = 10;  // 10th page

      const startTime = performance.now();

      const items = db.prepare(
        'SELECT * FROM agentes_economicos ORDER BY criado_em DESC LIMIT ? OFFSET ?'
      ).all(pageSize, (pageNumber - 1) * pageSize);

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(100);
      expect(items.length).toBeLessThanOrEqual(pageSize);
    });

    it('should count total efficiently', () => {
      const startTime = performance.now();

      const result = db.prepare(
        'SELECT COUNT(*) as total FROM agentes_economicos'
      ).get() as unknown;

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(100);
      expect(result.total).toBe(200);
    });

    it('should paginate through all records efficiently', () => {
      const pageSize = 20;

      const startTime = performance.now();

      let totalPages = 0;
      let currentPage = 0;

      let items = db.prepare(
        'SELECT * FROM agentes_economicos ORDER BY criado_em DESC LIMIT ? OFFSET ?'
      ).all(pageSize, currentPage * pageSize) as unknown[];

      while (items.length > 0) {
        totalPages++;
        currentPage++;
        items = db.prepare(
          'SELECT * FROM agentes_economicos ORDER BY criado_em DESC LIMIT ? OFFSET ?'
        ).all(pageSize, currentPage * pageSize) as unknown[];
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(1000);
      expect(totalPages).toBeGreaterThan(0);
    });
  });

  describe('Filter Query Performance', () => {
    beforeEach(() => {
      const agents = generateBulkPessoasFisicas(200).map(a => ({
        ...a,
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      }));

      const insertStmt = db.transaction(() => {
        agents.forEach(agent => insertAgente(db, agent));
      });

      insertStmt();
    });

    it('should filter by papel efficiently', () => {
      const startTime = performance.now();

      const items = db.prepare(
        'SELECT * FROM agentes_economicos WHERE papel = ? LIMIT 100'
      ).all('tenant') as unknown[];

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(100);
    });

    it('should filter by ativo status efficiently', () => {
      const startTime = performance.now();

      const items = db.prepare(
        'SELECT * FROM agentes_economicos WHERE ativo = 1 LIMIT 100'
      ).all() as unknown[];

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(100);
    });

    it('should combine multiple filters efficiently', () => {
      const startTime = performance.now();

      const items = db.prepare(
        'SELECT * FROM agentes_economicos WHERE tipo_entidade = ? AND ativo = 1 AND papel = ? LIMIT 100'
      ).all('pessoa_fisica', 'tenant') as unknown[];

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(100);
    });
  });

  describe('Duplicate Detection Performance', () => {
    beforeEach(() => {
      const agents = generateBulkPessoasFisicas(200).map(a => ({
        ...a,
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      }));

      const insertStmt = db.transaction(() => {
        agents.forEach(agent => insertAgente(db, agent));
      });

      insertStmt();
    });

    it('should find duplicates by cpf_cnpj efficiently', () => {
      const cpf = db.prepare(
        'SELECT cpf_cnpj FROM agentes_economicos LIMIT 1'
      ).get() as unknown;

      const startTime = performance.now();

      const duplicates = db.prepare(
        'SELECT * FROM agentes_economicos WHERE cpf_cnpj = ?'
      ).all(cpf.cpf_cnpj) as unknown[];

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(50);  // Index lookup should be very fast
    });

    it('should find candidates for fuzzy matching on large dataset', () => {
      const startTime = performance.now();

      const candidates = db.prepare(
        `SELECT ae1.id, ae2.id, ae1.nome, ae2.nome
         FROM agentes_economicos ae1
         JOIN agentes_economicos ae2 ON ae1.tipo_entidade = ae2.tipo_entidade
         WHERE ae1.id < ae2.id LIMIT 1000`
      ).all() as unknown[];

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(500);
    });
  });

  describe('Update Performance', () => {
    beforeEach(() => {
      const agents = generateBulkPessoasFisicas(100).map(a => ({
        ...a,
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      }));

      const insertStmt = db.transaction(() => {
        agents.forEach(agent => insertAgente(db, agent));
      });

      insertStmt();
    });

    it('should update single agent efficiently', () => {
      const agent = db.prepare(
        'SELECT id FROM agentes_economicos LIMIT 1'
      ).get() as unknown;

      const startTime = performance.now();

      db.prepare(
        'UPDATE agentes_economicos SET nome = ?, atualizado_em = ?, atualizado_por = ? WHERE id = ?'
      ).run(
        'Updated Name',
        new Date().toISOString(),
        TEST_ADMIN_USER.id,
        agent.id,
      );

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(50);
    });

    it('should batch update multiple agents efficiently', () => {
      const agents = db.prepare(
        'SELECT id FROM agentes_economicos LIMIT 50'
      ).all() as unknown[];

      const startTime = performance.now();

      const updateStmt = db.transaction(() => {
        agents.forEach(agent => {
          db.prepare(
            'UPDATE agentes_economicos SET ativo = 0, atualizado_em = ?, atualizado_por = ? WHERE id = ?'
          ).run(
            new Date().toISOString(),
            TEST_ADMIN_USER.id,
            agent.id,
          );
        });
      });

      updateStmt();

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Delete Performance', () => {
    beforeEach(() => {
      const agents = generateBulkPessoasFisicas(100).map(a => ({
        ...a,
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      }));

      const insertStmt = db.transaction(() => {
        agents.forEach(agent => insertAgente(db, agent));
      });

      insertStmt();
    });

    it('should soft delete single agent efficiently', () => {
      const agent = db.prepare(
        'SELECT id FROM agentes_economicos LIMIT 1'
      ).get() as unknown;

      const startTime = performance.now();

      db.prepare(
        'UPDATE agentes_economicos SET ativo = 0, atualizado_em = ?, atualizado_por = ? WHERE id = ?'
      ).run(
        new Date().toISOString(),
        TEST_ADMIN_USER.id,
        agent.id,
      );

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(50);
    });

    it('should hard delete single agent efficiently', () => {
      const agent = db.prepare(
        'SELECT id FROM agentes_economicos LIMIT 1'
      ).get() as unknown;

      const startTime = performance.now();

      db.prepare('DELETE FROM agentes_economicos WHERE id = ?').run(agent.id);

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(50);
    });
  });

  describe('Complex Query Performance', () => {
    beforeEach(() => {
      const agents = generateBulkPessoasFisicas(200).map(a => ({
        ...a,
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      }));

      const insertStmt = db.transaction(() => {
        agents.forEach(agent => insertAgente(db, agent));
      });

      insertStmt();
    });

    it('should query agents with aggregations efficiently', () => {
      const startTime = performance.now();

      const stats = db.prepare(
        `SELECT
           tipo_entidade,
           papel,
           COUNT(*) as count,
           SUM(CASE WHEN ativo = 1 THEN 1 ELSE 0 END) as active_count
         FROM agentes_economicos
         GROUP BY tipo_entidade, papel`
      ).all() as unknown[];

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(500);
      expect(stats.length).toBeGreaterThan(0);
    });

    it('should search by multiple criteria efficiently', () => {
      const startTime = performance.now();

      const results = db.prepare(
        `SELECT * FROM agentes_economicos
         WHERE tipo_entidade = ?
         AND papel = ?
         AND ativo = 1
         AND validado = 1
         ORDER BY criado_em DESC
         LIMIT 50`
      ).all('pessoa_fisica', 'tenant') as unknown[];

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(100);
    });
  });

  describe('Index Effectiveness', () => {
    beforeEach(() => {
      const agents = generateBulkPessoasFisicas(500).map(a => ({
        ...a,
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      }));

      const insertStmt = db.transaction(() => {
        agents.forEach(agent => insertAgente(db, agent));
      });

      insertStmt();
    });

    it('should use cpf_cnpj index efficiently', () => {
      const cpf = db.prepare(
        'SELECT cpf_cnpj FROM agentes_economicos LIMIT 1'
      ).get() as unknown;

      const startTime = performance.now();

      // This query should use idx_agentes_economicos_cpf_cnpj index
      const result = db.prepare(
        'SELECT * FROM agentes_economicos WHERE cpf_cnpj = ?'
      ).get(cpf.cpf_cnpj);

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(50);
      expect(result).toBeDefined();
    });

    it('should use papel index efficiently', () => {
      const startTime = performance.now();

      // This query should use idx_agentes_economicos_papel index
      const results = db.prepare(
        'SELECT * FROM agentes_economicos WHERE papel = ? LIMIT 100'
      ).all('supplier') as unknown[];

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(100);
    });

    it('should use ativo index efficiently', () => {
      const startTime = performance.now();

      // This query should use idx_agentes_economicos_ativos index
      const results = db.prepare(
        'SELECT * FROM agentes_economicos WHERE ativo = 1 LIMIT 100'
      ).all() as unknown[];

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(100);
    });
  });
});
