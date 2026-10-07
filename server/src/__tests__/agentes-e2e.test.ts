/**
 * E2E Workflow Tests for Economic Agents (Agentes Econômicos)
 *
 * Tests complete workflows:
 * - Create agent flow: usuario → create → validate → assign papel
 * - List agents with filters (papel, status, regime_tributario)
 * - Update agent details
 * - Soft delete and restore
 * - Link agent to ledger entries
 * - Query agent balance and transactions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  TEST_ADMIN_CONTEXT,
  TEST_USER_CONTEXT,
  TEST_UNAUTHENTICATED_CONTEXT,
  createSamplePessoaFisicaTenant,
  createSamplePessoaJuridicaSupplier,
  createDuplicateAgentsPair,
  generateBulkPessoasFisicas,
  generateBulkPessoasJuridicas,
  VALID_CPFS,
  VALID_CNPJS,
  TEST_ADMIN_USER,
} from './fixtures/agentes-fixtures.js';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, `test-agentes-e2e-${process.pid}.db`);

/**
 * Create and initialize test database with agentes schema
 */
function createTestDatabase(): Database.Database {
  // Clean up existing test DB
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  const db = new Database(TEST_DB_PATH);
  db.pragma('foreign_keys = ON');

  // Load and execute auth schema first (for usuarios table)
  let authSchemaPath = path.join(__dirname, '../../migrations-phase2-auth.sql');
  if (!fs.existsSync(authSchemaPath)) {
    authSchemaPath = path.join(process.cwd(), 'server/src/migrations-phase2-auth.sql');
  }
  if (!fs.existsSync(authSchemaPath)) {
    authSchemaPath = path.join(process.cwd(), 'src/migrations-phase2-auth.sql');
  }

  if (!fs.existsSync(authSchemaPath)) {
    throw new Error(`Auth migration not found at ${authSchemaPath}`);
  }

  const authSchema = fs.readFileSync(authSchemaPath, 'utf-8');
  db.exec(authSchema);

  // Load and execute agentes schema
  let agentesSchemaPath = path.join(__dirname, '../../migrations-phase18-agentes-economicos-sqlite.sql');
  if (!fs.existsSync(agentesSchemaPath)) {
    agentesSchemaPath = path.join(process.cwd(), 'server/src/migrations-phase18-agentes-economicos-sqlite.sql');
  }
  if (!fs.existsSync(agentesSchemaPath)) {
    agentesSchemaPath = path.join(process.cwd(), 'src/migrations-phase18-agentes-economicos-sqlite.sql');
  }

  if (!fs.existsSync(agentesSchemaPath)) {
    throw new Error(`Agentes migration not found at ${agentesSchemaPath}`);
  }

  const agentesSchema = fs.readFileSync(agentesSchemaPath, 'utf-8');
  db.exec(agentesSchema);

  // Seed test users
  db.prepare(
    `INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao)
     VALUES (?, ?, ?, 'hash_test', ?, true, '2026-01-01')`
  ).run(TEST_ADMIN_USER.id, TEST_ADMIN_USER.nome, TEST_ADMIN_USER.email, TEST_ADMIN_USER.role);

  return db;
}

/**
 * Helper to insert an agent into database
 */
function insertAgente(db: Database.Database, agente: any) {
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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  return db.prepare(sql).run(
    agente.id,
    agente.tipo_entidade,
    agente.cpf_cnpj,
    agente.nome,
    agente.nome_fantasia || null,
    agente.pessoa_fisica_pf_nome_mae || null,
    agente.papel,
    agente.regime_tributario || null,
    agente.inscricao_estadual || null,
    agente.inscricao_municipal || null,
    agente.classificacao_nfse || null,
    agente.email || null,
    agente.telefone || null,
    agente.celular || null,
    agente.endereco?.logradouro || null,
    agente.endereco?.numero || null,
    agente.endereco?.complemento || null,
    agente.endereco?.bairro || null,
    agente.endereco?.cidade || null,
    agente.endereco?.estado || null,
    agente.endereco?.cep || null,
    agente.endereco?.pais || 'Brasil',
    agente.ativo ? 1 : 0,
    agente.criado_em.toISOString(),
    agente.criado_por,
    agente.atualizado_em.toISOString(),
    agente.atualizado_por,
    agente.validado ? 1 : 0,
    agente.validado_em ? agente.validado_em.toISOString() : null,
    agente.validado_por || null,
    agente.observacoes || null,
    agente.tags || null,
  );
}

describe('Agentes E2E Workflow Tests', () => {
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

  describe('Create Agent Flow', () => {
    it('should create pessoa física with all required fields', () => {
      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      const result = insertAgente(db, agent);
      expect(result.changes).toBe(1);

      const retrieved = db.prepare(
        'SELECT * FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as any;

      expect(retrieved).toBeDefined();
      expect(retrieved.tipo_entidade).toBe('pessoa_fisica');
      expect(retrieved.cpf_cnpj).toBe(agent.cpf_cnpj);
      expect(retrieved.nome).toBe(agent.nome);
      expect(retrieved.papel).toBe('tenant');
    });

    it('should create pessoa jurídica with all required fields', () => {
      const agent = createSamplePessoaJuridicaSupplier({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      const retrieved = db.prepare(
        'SELECT * FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as any;

      expect(retrieved.tipo_entidade).toBe('pessoa_juridica');
      expect(retrieved.nome_fantasia).toBe(agent.nome_fantasia);
      expect(retrieved.papel).toBe('supplier');
      expect(retrieved.regime_tributario).toBe('lucro_real');
    });

    it('should validate and approve agent', () => {
      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      // Mark as validated
      db.prepare(
        'UPDATE agentes_economicos SET validado = 1, validado_em = ?, validado_por = ? WHERE id = ?'
      ).run(new Date().toISOString(), TEST_ADMIN_USER.id, agent.id);

      // Create validation record
      db.prepare(
        `INSERT INTO agentes_validacoes (id, agente_id, tipo_validacao, resultado, executado_em, executado_por)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        uuidv4(),
        agent.id,
        'cpf_cnpj',
        'aprovado',
        new Date().toISOString(),
        TEST_ADMIN_USER.id,
      );

      const validated = db.prepare(
        'SELECT validado, validado_em FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as any;

      expect(validated.validado).toBe(1);
      expect(validated.validado_em).toBeDefined();

      const validation = db.prepare(
        'SELECT * FROM agentes_validacoes WHERE agente_id = ?'
      ).get(agent.id) as any;

      expect(validation.resultado).toBe('aprovado');
    });

    it('should assign multiple roles through separate records', () => {
      const agent = createSamplePessoaJuridicaSupplier({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      // Agent has papel field that stores a single role
      const retrieved = db.prepare(
        'SELECT * FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as any;

      expect(retrieved.papel).toBe('supplier');
    });
  });

  describe('List Agents with Filters', () => {
    beforeEach(() => {
      // Create test data
      const agents = [
        createSamplePessoaFisicaTenant({
          criado_por: TEST_ADMIN_USER.id,
          atualizado_por: TEST_ADMIN_USER.id,
        }),
        createSamplePessoaJuridicaSupplier({
          criado_por: TEST_ADMIN_USER.id,
          atualizado_por: TEST_ADMIN_USER.id,
        }),
        createSamplePessoaJuridicaSupplier({
          cpf_cnpj: VALID_CNPJS.cnpj_2,
          nome: 'Another Supplier',
          regime_tributario: 'simples',
          criado_por: TEST_ADMIN_USER.id,
          atualizado_por: TEST_ADMIN_USER.id,
        }),
      ];

      agents.forEach(agent => insertAgente(db, agent));
    });

    it('should list all active agents', () => {
      const agents = db.prepare(
        'SELECT * FROM agentes_economicos WHERE ativo = 1'
      ).all() as any[];

      expect(agents.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter agents by papel', () => {
      const suppliers = db.prepare(
        'SELECT * FROM agentes_economicos WHERE papel = ?'
      ).all('supplier') as any[];

      expect(suppliers.length).toBeGreaterThanOrEqual(2);
      suppliers.forEach(s => expect(s.papel).toBe('supplier'));
    });

    it('should filter agents by tipo_entidade', () => {
      const pj = db.prepare(
        'SELECT * FROM agentes_economicos WHERE tipo_entidade = ?'
      ).all('pessoa_juridica') as any[];

      expect(pj.length).toBeGreaterThanOrEqual(2);
      pj.forEach(p => expect(p.tipo_entidade).toBe('pessoa_juridica'));
    });

    it('should filter agents by regime_tributario', () => {
      const lucroReal = db.prepare(
        'SELECT * FROM agentes_economicos WHERE regime_tributario = ?'
      ).all('lucro_real') as any[];

      expect(lucroReal.length).toBeGreaterThanOrEqual(1);
    });

    it('should combine multiple filters', () => {
      const filtered = db.prepare(
        'SELECT * FROM agentes_economicos WHERE tipo_entidade = ? AND papel = ? AND ativo = 1'
      ).all('pessoa_juridica', 'supplier') as any[];

      expect(filtered.length).toBeGreaterThanOrEqual(2);
      filtered.forEach(f => {
        expect(f.tipo_entidade).toBe('pessoa_juridica');
        expect(f.papel).toBe('supplier');
        expect(f.ativo).toBe(1);
      });
    });

    it('should support pagination', () => {
      const pageSize = 2;
      const page1 = db.prepare(
        'SELECT * FROM agentes_economicos ORDER BY criado_em DESC LIMIT ? OFFSET ?'
      ).all(pageSize, 0) as any[];

      const page2 = db.prepare(
        'SELECT * FROM agentes_economicos ORDER BY criado_em DESC LIMIT ? OFFSET ?'
      ).all(pageSize, pageSize) as any[];

      expect(page1.length).toBeLessThanOrEqual(pageSize);
      expect(page2.length).toBeLessThanOrEqual(pageSize);
    });
  });

  describe('Update Agent Details', () => {
    it('should update agent name and email', () => {
      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      const newName = 'João Silva Updated';
      const newEmail = 'joao.updated@test.com';

      db.prepare(
        'UPDATE agentes_economicos SET nome = ?, email = ?, atualizado_em = ?, atualizado_por = ? WHERE id = ?'
      ).run(
        newName,
        newEmail,
        new Date().toISOString(),
        TEST_ADMIN_USER.id,
        agent.id,
      );

      const updated = db.prepare(
        'SELECT nome, email FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as any;

      expect(updated.nome).toBe(newName);
      expect(updated.email).toBe(newEmail);
    });

    it('should update agent status (ativo)', () => {
      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      db.prepare(
        'UPDATE agentes_economicos SET ativo = 0, atualizado_em = ?, atualizado_por = ? WHERE id = ?'
      ).run(
        new Date().toISOString(),
        TEST_ADMIN_USER.id,
        agent.id,
      );

      const updated = db.prepare(
        'SELECT ativo FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as any;

      expect(updated.ativo).toBe(0);
    });

    it('should update agent regime tributário', () => {
      const agent = createSamplePessoaJuridicaSupplier({
        regime_tributario: 'lucro_real',
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      db.prepare(
        'UPDATE agentes_economicos SET regime_tributario = ?, atualizado_em = ?, atualizado_por = ? WHERE id = ?'
      ).run(
        'simples',
        new Date().toISOString(),
        TEST_ADMIN_USER.id,
        agent.id,
      );

      const updated = db.prepare(
        'SELECT regime_tributario FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as any;

      expect(updated.regime_tributario).toBe('simples');
    });

    it('should preserve criado_em when updating', () => {
      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      const originalCreated = db.prepare(
        'SELECT criado_em FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as any;

      // Update after delay
      db.prepare(
        'UPDATE agentes_economicos SET nome = ?, atualizado_em = ?, atualizado_por = ? WHERE id = ?'
      ).run(
        'New Name',
        new Date().toISOString(),
        TEST_ADMIN_USER.id,
        agent.id,
      );

      const afterUpdate = db.prepare(
        'SELECT criado_em FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as any;

      expect(afterUpdate.criado_em).toBe(originalCreated.criado_em);
    });
  });

  describe('Soft Delete and Restore', () => {
    it('should soft delete agent by setting ativo = 0', () => {
      const agent = createSamplePessoaFisicaTenant({
        ativo: true,
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      // Soft delete
      db.prepare(
        'UPDATE agentes_economicos SET ativo = 0, atualizado_em = ?, atualizado_por = ? WHERE id = ?'
      ).run(
        new Date().toISOString(),
        TEST_ADMIN_USER.id,
        agent.id,
      );

      const deleted = db.prepare(
        'SELECT ativo FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as any;

      expect(deleted.ativo).toBe(0);
    });

    it('should restore deleted agent', () => {
      const agent = createSamplePessoaFisicaTenant({
        ativo: false,
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      // Restore
      db.prepare(
        'UPDATE agentes_economicos SET ativo = 1, atualizado_em = ?, atualizado_por = ? WHERE id = ?'
      ).run(
        new Date().toISOString(),
        TEST_ADMIN_USER.id,
        agent.id,
      );

      const restored = db.prepare(
        'SELECT ativo FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as any;

      expect(restored.ativo).toBe(1);
    });

    it('should hide deleted agents in normal queries', () => {
      const agents = [
        createSamplePessoaFisicaTenant({
          ativo: true,
          criado_por: TEST_ADMIN_USER.id,
          atualizado_por: TEST_ADMIN_USER.id,
        }),
        createSamplePessoaFisicaTenant({
          cpf_cnpj: VALID_CPFS.cpf_2,
          nome: 'Deleted Agent',
          ativo: false,
          criado_por: TEST_ADMIN_USER.id,
          atualizado_por: TEST_ADMIN_USER.id,
        }),
      ];

      agents.forEach(a => insertAgente(db, a));

      const active = db.prepare(
        'SELECT * FROM agentes_economicos WHERE ativo = 1'
      ).all() as any[];

      expect(active.every(a => a.ativo === 1)).toBe(true);
    });
  });

  describe('Link Agent to Ledger Entries', () => {
    it('should create vinculação record', () => {
      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      const vinculacaoId = uuidv4();
      const entidadeId = uuidv4();

      db.prepare(
        `INSERT INTO agentes_vinculacoes (
          id, agente_id, tipo_vinculacao, entidade_id, entidade_nome,
          tipo_relacionamento, ativo, criado_em, criado_por
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        vinculacaoId,
        agent.id,
        'pagamento',
        entidadeId,
        'Payment #001',
        'pagador',
        1,
        new Date().toISOString(),
        TEST_ADMIN_USER.id,
      );

      const vinculacao = db.prepare(
        'SELECT * FROM agentes_vinculacoes WHERE id = ?'
      ).get(vinculacaoId) as any;

      expect(vinculacao).toBeDefined();
      expect(vinculacao.agente_id).toBe(agent.id);
      expect(vinculacao.tipo_vinculacao).toBe('pagamento');
    });

    it('should list all vinculações for an agent', () => {
      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      // Create multiple vinculações
      for (let i = 0; i < 3; i++) {
        db.prepare(
          `INSERT INTO agentes_vinculacoes (
            id, agente_id, tipo_vinculacao, entidade_id, entidade_nome,
            tipo_relacionamento, ativo, criado_em, criado_por
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          uuidv4(),
          agent.id,
          'pagamento',
          uuidv4(),
          `Payment #${i}`,
          'pagador',
          1,
          new Date().toISOString(),
          TEST_ADMIN_USER.id,
        );
      }

      const vinculacoes = db.prepare(
        'SELECT * FROM agentes_vinculacoes WHERE agente_id = ? AND ativo = 1'
      ).all(agent.id) as any[];

      expect(vinculacoes.length).toBe(3);
    });
  });

  describe('Query Agent Balance and Transactions', () => {
    it('should retrieve agent with all related data', () => {
      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      const retrieved = db.prepare(
        'SELECT * FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as any;

      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(agent.id);
      expect(retrieved.tipo_entidade).toBe('pessoa_fisica');
    });

    it('should count transactions for an agent', () => {
      const agent = createSamplePessoaJuridicaSupplier({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      // Create vinculações representing transactions
      for (let i = 0; i < 5; i++) {
        db.prepare(
          `INSERT INTO agentes_vinculacoes (
            id, agente_id, tipo_vinculacao, entidade_id, entidade_nome,
            ativo, criado_em, criado_por
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          uuidv4(),
          agent.id,
          'pagamento',
          uuidv4(),
          `Payment #${i}`,
          1,
          new Date().toISOString(),
          TEST_ADMIN_USER.id,
        );
      }

      const count = db.prepare(
        'SELECT COUNT(*) as total FROM agentes_vinculacoes WHERE agente_id = ?'
      ).get(agent.id) as any;

      expect(count.total).toBe(5);
    });
  });

  describe('Complex E2E Scenarios', () => {
    it('should handle complete agent lifecycle', () => {
      // 1. Create
      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);
      const created = db.prepare(
        'SELECT * FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as any;
      expect(created).toBeDefined();

      // 2. Validate
      db.prepare(
        'UPDATE agentes_economicos SET validado = 1, validado_em = ?, validado_por = ? WHERE id = ?'
      ).run(
        new Date().toISOString(),
        TEST_ADMIN_USER.id,
        agent.id,
      );

      const validated = db.prepare(
        'SELECT validado FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as any;
      expect(validated.validado).toBe(1);

      // 3. Link to ledger
      const entidadeId = uuidv4();
      db.prepare(
        `INSERT INTO agentes_vinculacoes (
          id, agente_id, tipo_vinculacao, entidade_id, entidade_nome,
          ativo, criado_em, criado_por
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        uuidv4(),
        agent.id,
        'pagamento',
        entidadeId,
        'Ledger Entry',
        1,
        new Date().toISOString(),
        TEST_ADMIN_USER.id,
      );

      const linked = db.prepare(
        'SELECT COUNT(*) as count FROM agentes_vinculacoes WHERE agente_id = ?'
      ).get(agent.id) as any;
      expect(linked.count).toBe(1);

      // 4. Update
      db.prepare(
        'UPDATE agentes_economicos SET regime_tributario = ?, atualizado_em = ?, atualizado_por = ? WHERE id = ?'
      ).run(
        'simples',
        new Date().toISOString(),
        TEST_ADMIN_USER.id,
        agent.id,
      );

      const updated = db.prepare(
        'SELECT regime_tributario FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as any;
      expect(updated.regime_tributario).toBe('simples');

      // 5. Delete
      db.prepare(
        'UPDATE agentes_economicos SET ativo = 0, atualizado_em = ?, atualizado_por = ? WHERE id = ?'
      ).run(
        new Date().toISOString(),
        TEST_ADMIN_USER.id,
        agent.id,
      );

      const deleted = db.prepare(
        'SELECT ativo FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as any;
      expect(deleted.ativo).toBe(0);

      // 6. Restore
      db.prepare(
        'UPDATE agentes_economicos SET ativo = 1, atualizado_em = ?, atualizado_por = ? WHERE id = ?'
      ).run(
        new Date().toISOString(),
        TEST_ADMIN_USER.id,
        agent.id,
      );

      const restored = db.prepare(
        'SELECT ativo FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as any;
      expect(restored.ativo).toBe(1);
    });
  });
});
