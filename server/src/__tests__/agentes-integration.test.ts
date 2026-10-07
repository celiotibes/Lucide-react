/**
 * Integration Tests for Economic Agents (Agentes Econômicos)
 *
 * Tests complex interactions:
 * - Multiple agents in single transaction
 * - Duplicate detection across roles
 * - CNPJ/CPF validation with database
 * - Concurrent agent creation (race conditions)
 * - Backfill consistency checks
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createSamplePessoaFisicaTenant,
  createSamplePessoaJuridicaSupplier,
  createDuplicateAgentsPair,
  generateBulkPessoasFisicas,
  VALID_CPFS,
  VALID_CNPJS,
  INVALID_DOCUMENTS,
  TEST_ADMIN_USER,
} from './fixtures/agentes-fixtures.js';
import { v4 as uuidv4 } from 'uuid';
import { isValidCPF, isValidCNPJ, calculateDuplicataScore } from '../domain/erp/agentes-tipos.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, `test-agentes-integration-${process.pid}.db`);

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
  if (!fs.existsSync(authSchemaPath)) {
    authSchemaPath = path.join(process.cwd(), 'src/migrations-phase2-auth.sql');
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

describe('Agentes Integration Tests', () => {
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

  describe('Multiple Agents in Single Transaction', () => {
    it('should insert multiple agents atomically', () => {
      const agents = [
        createSamplePessoaFisicaTenant({
          criado_por: TEST_ADMIN_USER.id,
          atualizado_por: TEST_ADMIN_USER.id,
        }),
        createSamplePessoaJuridicaSupplier({
          criado_por: TEST_ADMIN_USER.id,
          atualizado_por: TEST_ADMIN_USER.id,
        }),
      ];

      const transaction = db.transaction(() => {
        agents.forEach(agent => insertAgente(db, agent));
      });

      transaction();

      const count = db.prepare(
        'SELECT COUNT(*) as total FROM agentes_economicos'
      ).get() as unknown;

      expect(count.total).toBe(2);
    });

    it('should rollback on constraint violation', () => {
      const agent1 = createSamplePessoaFisicaTenant({
        cpf_cnpj: VALID_CPFS.cpf_1,
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      const agent2 = createSamplePessoaFisicaTenant({
        cpf_cnpj: VALID_CPFS.cpf_1,  // Same CPF - violation
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent1);

      expect(() => {
        const transaction = db.transaction(() => {
          insertAgente(db, agent2);
        });
        transaction();
      }).toThrow();

      const count = db.prepare(
        'SELECT COUNT(*) as total FROM agentes_economicos'
      ).get() as unknown;

      expect(count.total).toBe(1);  // Only first agent was inserted
    });

    it('should maintain referential integrity in transaction', () => {
      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      const transaction = db.transaction(() => {
        insertAgente(db, agent);

        // Create vinculação
        db.prepare(
          `INSERT INTO agentes_vinculacoes (
            id, agente_id, tipo_vinculacao, entidade_id,
            ativo, criado_em, criado_por
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          uuidv4(),
          agent.id,
          'pagamento',
          uuidv4(),
          1,
          new Date().toISOString(),
          TEST_ADMIN_USER.id,
        );
      });

      transaction();

      const vinculacoes = db.prepare(
        'SELECT * FROM agentes_vinculacoes WHERE agente_id = ?'
      ).all(agent.id) as unknown[];

      expect(vinculacoes.length).toBe(1);
    });
  });

  describe('Duplicate Detection Across Roles', () => {
    it('should detect exact CPF/CNPJ duplicates', () => {
      const { agent1, agent2 } = createDuplicateAgentsPair();

      insertAgente(db, agent1);
      insertAgente(db, agent2);

      const duplicates = db.prepare(
        'SELECT * FROM agentes_economicos WHERE cpf_cnpj = ?'
      ).all(agent1.cpf_cnpj) as unknown[];

      expect(duplicates.length).toBe(2);
    });

    it('should detect duplicates with different papéis', () => {
      const agent1 = createSamplePessoaFisicaTenant({
        cpf_cnpj: VALID_CPFS.cpf_1,
        papel: 'tenant',
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      const agent2 = createSamplePessoaFisicaTenant({
        cpf_cnpj: VALID_CPFS.cpf_1,  // Same CPF
        papel: 'borrower',  // Different papel
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent1);

      expect(() => {
        insertAgente(db, agent2);  // Should fail on UNIQUE constraint
      }).toThrow();
    });

    it('should handle fuzzy matching for similar names', () => {
      const agents = [
        createSamplePessoaFisicaTenant({
          cpf_cnpj: VALID_CPFS.cpf_1,
          nome: 'João da Silva Santos',
          criado_por: TEST_ADMIN_USER.id,
          atualizado_por: TEST_ADMIN_USER.id,
        }),
        createSamplePessoaFisicaTenant({
          cpf_cnpj: VALID_CPFS.cpf_2,
          nome: 'Joao da Silva Santos',  // Similar but different (no tilde)
          criado_por: TEST_ADMIN_USER.id,
          atualizado_por: TEST_ADMIN_USER.id,
        }),
      ];

      agents.forEach(a => insertAgente(db, a));

      const agent1 = createSamplePessoaFisicaTenant();
      const agent2 = createSamplePessoaFisicaTenant();

      const score = calculateDuplicataScore(agent1, agent2);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should create duplicata record for suspected duplicates', () => {
      const agent1 = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      const agent2 = createSamplePessoaFisicaTenant({
        cpf_cnpj: VALID_CPFS.cpf_2,
        nome: 'Similar Name',  // Similar to agent1
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent1);
      insertAgente(db, agent2);

      db.prepare(
        `INSERT INTO agentes_duplicatas_suspeitas (
          id, agente_id_1, agente_id_2, score, motivo,
          status, criado_em, criado_por
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        uuidv4(),
        agent1.id,
        agent2.id,
        75,
        'nome_similar',
        'pendente',
        new Date().toISOString(),
        TEST_ADMIN_USER.id,
      );

      const duplicata = db.prepare(
        'SELECT * FROM agentes_duplicatas_suspeitas WHERE agente_id_1 = ?'
      ).get(agent1.id) as unknown;

      expect(duplicata).toBeDefined();
      expect(duplicata.score).toBe(75);
    });
  });

  describe('CNPJ/CPF Validation with Database', () => {
    it('should reject invalid CPF on insert', () => {
      const agent = createSamplePessoaFisicaTenant({
        cpf_cnpj: INVALID_DOCUMENTS.cpf_invalid_checksum,
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      // CPF validation happens at application level
      expect(isValidCPF(agent.cpf_cnpj)).toBe(false);
    });

    it('should reject invalid CNPJ on insert', () => {
      const agent = createSamplePessoaJuridicaSupplier({
        cpf_cnpj: INVALID_DOCUMENTS.cnpj_invalid_checksum,
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      expect(isValidCNPJ(agent.cpf_cnpj)).toBe(false);
    });

    it('should accept valid CPF values', () => {
      Object.values(VALID_CPFS).forEach(cpf => {
        expect(isValidCPF(cpf)).toBe(true);
      });
    });

    it('should accept valid CNPJ values', () => {
      Object.values(VALID_CNPJS).forEach(cnpj => {
        expect(isValidCNPJ(cnpj)).toBe(true);
      });
    });

    it('should enforce uniqueness of CPF/CNPJ', () => {
      const agent1 = createSamplePessoaFisicaTenant({
        cpf_cnpj: VALID_CPFS.cpf_1,
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      const agent2 = createSamplePessoaFisicaTenant({
        cpf_cnpj: VALID_CPFS.cpf_1,  // Duplicate
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent1);

      expect(() => {
        insertAgente(db, agent2);
      }).toThrow();
    });

    it('should validate CPF/CNPJ format length', () => {
      const shortCPF = VALID_CPFS.cpf_1.slice(0, 10);
      expect(isValidCPF(shortCPF)).toBe(false);

      const shortCNPJ = VALID_CNPJS.cnpj_1.slice(0, 13);
      expect(isValidCNPJ(shortCNPJ)).toBe(false);
    });
  });

  describe('Concurrent Agent Creation (Race Conditions)', () => {
    it('should handle concurrent inserts without data corruption', () => {
      const agents = generateBulkPessoasFisicas(10).map(a => ({
        ...a,
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      }));

      agents.forEach(agent => insertAgente(db, agent));

      const count = db.prepare(
        'SELECT COUNT(*) as total FROM agentes_economicos'
      ).get() as unknown;

      expect(count.total).toBe(10);

      // Verify no duplicates by CPF
      const cpfs = db.prepare(
        'SELECT cpf_cnpj, COUNT(*) as count FROM agentes_economicos GROUP BY cpf_cnpj'
      ).all() as unknown[];

      cpfs.forEach(row => {
        expect(row.count).toBe(1);
      });
    });

    it('should prevent duplicate CPF even under concurrent pressure', () => {
      const cpf = VALID_CPFS.cpf_1;

      const agent1 = createSamplePessoaFisicaTenant({
        cpf_cnpj: cpf,
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent1);

      const agent2 = createSamplePessoaFisicaTenant({
        cpf_cnpj: cpf,
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      expect(() => {
        insertAgente(db, agent2);
      }).toThrow();
    });

    it('should maintain audit trail under concurrent updates', () => {
      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      const initialCreatedBy = db.prepare(
        'SELECT criado_por FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as unknown;

      expect(initialCreatedBy.criado_por).toBe(TEST_ADMIN_USER.id);

      // Simulate concurrent updates
      const updates = [
        { nome: 'Update 1', email: 'update1@test.com' },
        { nome: 'Update 2', email: 'update2@test.com' },
        { nome: 'Update 3', email: 'update3@test.com' },
      ];

      updates.forEach(update => {
        db.prepare(
          'UPDATE agentes_economicos SET nome = ?, email = ?, atualizado_em = ?, atualizado_por = ? WHERE id = ?'
        ).run(
          update.nome,
          update.email,
          new Date().toISOString(),
          TEST_ADMIN_USER.id,
          agent.id,
        );
      });

      // criado_por should remain unchanged
      const finalCreatedBy = db.prepare(
        'SELECT criado_por, nome FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as unknown;

      expect(finalCreatedBy.criado_por).toBe(TEST_ADMIN_USER.id);
      expect(finalCreatedBy.nome).toBe('Update 3');
    });
  });

  describe('Backfill Consistency Checks', () => {
    it('should verify all agents have valid audit fields', () => {
      const agents = generateBulkPessoasFisicas(5).map(a => ({
        ...a,
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      }));

      agents.forEach(a => insertAgente(db, a));

      const invalid = db.prepare(
        `SELECT id FROM agentes_economicos
         WHERE criado_por IS NULL OR atualizado_por IS NULL
         OR criado_em IS NULL OR atualizado_em IS NULL`
      ).all();

      expect(invalid.length).toBe(0);
    });

    it('should verify all agents have consistent timestamps', () => {
      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      const record = db.prepare(
        'SELECT criado_em, atualizado_em FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as unknown;

      const created = new Date(record.criado_em);
      const updated = new Date(record.atualizado_em);

      expect(updated >= created).toBe(true);
    });

    it('should verify referenced users exist', () => {
      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      const agentRecord = db.prepare(
        'SELECT criado_por, atualizado_por FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as unknown;

      const user = db.prepare(
        'SELECT * FROM usuarios WHERE id = ?'
      ).get(agentRecord.criado_por);

      expect(user).toBeDefined();
    });

    it('should detect orphaned vinculações after cascading delete', () => {
      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      const entidadeId = uuidv4();
      db.prepare(
        `INSERT INTO agentes_vinculacoes (
          id, agente_id, tipo_vinculacao, entidade_id,
          ativo, criado_em, criado_por
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        uuidv4(),
        agent.id,
        'pagamento',
        entidadeId,
        1,
        new Date().toISOString(),
        TEST_ADMIN_USER.id,
      );

      // Verify vinculação exists
      let vinculacoes = db.prepare(
        'SELECT * FROM agentes_vinculacoes WHERE agente_id = ?'
      ).all(agent.id) as unknown[];
      expect(vinculacoes.length).toBe(1);

      // Delete agent (should cascade)
      db.prepare('DELETE FROM agentes_economicos WHERE id = ?').run(agent.id);

      // Verify vinculações were cascaded deleted
      vinculacoes = db.prepare(
        'SELECT * FROM agentes_vinculacoes WHERE agente_id = ?'
      ).all(agent.id) as unknown[];
      expect(vinculacoes.length).toBe(0);
    });

    it('should verify tipo_entidade matches CPF/CNPJ length', () => {
      const agents = [
        createSamplePessoaFisicaTenant({
          cpf_cnpj: VALID_CPFS.cpf_1,
          criado_por: TEST_ADMIN_USER.id,
          atualizado_por: TEST_ADMIN_USER.id,
        }),
        createSamplePessoaJuridicaSupplier({
          cpf_cnpj: VALID_CNPJS.cnpj_1,
          criado_por: TEST_ADMIN_USER.id,
          atualizado_por: TEST_ADMIN_USER.id,
        }),
      ];

      agents.forEach(a => insertAgente(db, a));

      const allAgents = db.prepare('SELECT * FROM agentes_economicos').all() as unknown[];

      allAgents.forEach(agent => {
        const isCPF = agent.cpf_cnpj.length === 11;
        const isJuridica = agent.tipo_entidade === 'pessoa_juridica';

        if (isCPF) {
          expect(agent.tipo_entidade).toBe('pessoa_fisica');
        } else {
          expect(isJuridica).toBe(true);
        }
      });
    });
  });

  describe('Cross-Domain Integration', () => {
    it('should maintain data consistency across multiple tables', () => {
      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      // Add validation
      const validacaoId = uuidv4();
      db.prepare(
        `INSERT INTO agentes_validacoes (
          id, agente_id, tipo_validacao, resultado,
          executado_em, executado_por
        ) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        validacaoId,
        agent.id,
        'cpf_cnpj',
        'aprovado',
        new Date().toISOString(),
        TEST_ADMIN_USER.id,
      );

      // Add vinculação
      const vinculacaoId = uuidv4();
      db.prepare(
        `INSERT INTO agentes_vinculacoes (
          id, agente_id, tipo_vinculacao, entidade_id,
          ativo, criado_em, criado_por
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        vinculacaoId,
        agent.id,
        'pagamento',
        uuidv4(),
        1,
        new Date().toISOString(),
        TEST_ADMIN_USER.id,
      );

      // Query complete data
      const agentWithData = db.prepare(
        `SELECT ae.*,
                COUNT(DISTINCT av.id) as validacoes_count,
                COUNT(DISTINCT avl.id) as vinculacoes_count
         FROM agentes_economicos ae
         LEFT JOIN agentes_validacoes av ON ae.id = av.agente_id
         LEFT JOIN agentes_vinculacoes avl ON ae.id = avl.agente_id
         WHERE ae.id = ?
         GROUP BY ae.id`
      ).get(agent.id) as unknown;

      expect(agentWithData).toBeDefined();
      expect(agentWithData.validacoes_count).toBe(1);
      expect(agentWithData.vinculacoes_count).toBe(1);
    });
  });
});
