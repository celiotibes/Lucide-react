/**
 * Database Constraint Tests for Economic Agents (Agentes Econômicos)
 *
 * Tests data integrity and database-level constraints:
 * - UNIQUE (CNPJ/CPF) enforcement
 * - FK relationships (to usuarios, ledger_entries)
 * - NOT NULL constraints on required fields
 * - Check constraints on papel values
 * - Cascade delete behavior
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createSamplePessoaFisicaTenant,
  createSamplePessoaJuridicaSupplier,
  VALID_CPFS,
  VALID_CNPJS,
  TEST_ADMIN_USER,
} from './fixtures/agentes-fixtures.js';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, `test-agentes-constraints-${process.pid}.db`);

function createTestDatabase(): Database.Database {
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  const db = new Database(TEST_DB_PATH);
  db.pragma('foreign_keys = ON');

  let authSchemaPath = path.join(__dirname, '../../migrations-phase2-auth.sql');
  if (!fs.existsSync(authSchemaPath)) {
    authSchemaPath = path.join(process.cwd(), 'src/migrations-phase2-auth.sql');
  }

  const authSchema = fs.readFileSync(authSchemaPath, 'utf-8');
  db.exec(authSchema);

  let agentesSchemaPath = path.join(__dirname, '../../migrations-phase18-agentes-economicos-sqlite.sql');
  if (!fs.existsSync(agentesSchemaPath)) {
    agentesSchemaPath = path.join(process.cwd(), 'src/migrations-phase18-agentes-economicos-sqlite.sql');
  }

  const agentesSchema = fs.readFileSync(agentesSchemaPath, 'utf-8');
  db.exec(agentesSchema);

  db.prepare(
    `INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao)
     VALUES (?, ?, ?, 'hash_test', ?, true, '2026-01-01')`
  ).run(TEST_ADMIN_USER.id, TEST_ADMIN_USER.nome, TEST_ADMIN_USER.email, TEST_ADMIN_USER.role);

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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

describe('Agentes Database Constraints Tests', () => {
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

  describe('UNIQUE Constraint - CNPJ/CPF', () => {
    it('should enforce UNIQUE constraint on cpf_cnpj', () => {
      const agent1 = createSamplePessoaFisicaTenant({
        cpf_cnpj: VALID_CPFS.cpf_1,
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent1);

      const agent2 = createSamplePessoaFisicaTenant({
        cpf_cnpj: VALID_CPFS.cpf_1,  // Duplicate
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      expect(() => {
        insertAgente(db, agent2);
      }).toThrow();
    });

    it('should allow different CPF/CNPJ values', () => {
      const agents = [
        createSamplePessoaFisicaTenant({
          cpf_cnpj: VALID_CPFS.cpf_1,
          criado_por: TEST_ADMIN_USER.id,
          atualizado_por: TEST_ADMIN_USER.id,
        }),
        createSamplePessoaFisicaTenant({
          cpf_cnpj: VALID_CPFS.cpf_2,
          criado_por: TEST_ADMIN_USER.id,
          atualizado_por: TEST_ADMIN_USER.id,
        }),
      ];

      agents.forEach(a => insertAgente(db, a));

      const count = db.prepare(
        'SELECT COUNT(*) as total FROM agentes_economicos'
      ).get() as unknown;

      expect(count.total).toBe(2);
    });

    it('should enforce UNIQUE across different tipo_entidade', () => {
      const cpf = VALID_CPFS.cpf_1;

      const pf = createSamplePessoaFisicaTenant({
        cpf_cnpj: cpf,
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, pf);

      // Try to insert with same CPF but different type (should fail on UNIQUE, not on tipo_entidade check)
      const pj = createSamplePessoaJuridicaSupplier({
        cpf_cnpj: cpf,
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      expect(() => {
        insertAgente(db, pj);
      }).toThrow();
    });
  });

  describe('NOT NULL Constraints', () => {
    it('should enforce NOT NULL on tipo_entidade', () => {
      const invalidInsert = () => {
        db.prepare(
          `INSERT INTO agentes_economicos (
            id, cpf_cnpj, nome, papel, ativo,
            criado_em, criado_por, atualizado_em, atualizado_por
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          uuidv4(), VALID_CPFS.cpf_1, 'Test', 'tenant', 1,
          new Date().toISOString(), TEST_ADMIN_USER.id,
          new Date().toISOString(), TEST_ADMIN_USER.id,
        );
      };

      expect(invalidInsert).toThrow();
    });

    it('should enforce NOT NULL on cpf_cnpj', () => {
      const invalidInsert = () => {
        db.prepare(
          `INSERT INTO agentes_economicos (
            id, tipo_entidade, nome, papel, ativo,
            criado_em, criado_por, atualizado_em, atualizado_por
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          uuidv4(), 'pessoa_fisica', 'Test', 'tenant', 1,
          new Date().toISOString(), TEST_ADMIN_USER.id,
          new Date().toISOString(), TEST_ADMIN_USER.id,
        );
      };

      expect(invalidInsert).toThrow();
    });

    it('should enforce NOT NULL on nome', () => {
      const invalidInsert = () => {
        db.prepare(
          `INSERT INTO agentes_economicos (
            id, tipo_entidade, cpf_cnpj, papel, ativo,
            criado_em, criado_por, atualizado_em, atualizado_por
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          uuidv4(), 'pessoa_fisica', VALID_CPFS.cpf_1, 'tenant', 1,
          new Date().toISOString(), TEST_ADMIN_USER.id,
          new Date().toISOString(), TEST_ADMIN_USER.id,
        );
      };

      expect(invalidInsert).toThrow();
    });

    it('should enforce NOT NULL on papel', () => {
      const invalidInsert = () => {
        db.prepare(
          `INSERT INTO agentes_economicos (
            id, tipo_entidade, cpf_cnpj, nome, ativo,
            criado_em, criado_por, atualizado_em, atualizado_por
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          uuidv4(), 'pessoa_fisica', VALID_CPFS.cpf_1, 'Test', 1,
          new Date().toISOString(), TEST_ADMIN_USER.id,
          new Date().toISOString(), TEST_ADMIN_USER.id,
        );
      };

      expect(invalidInsert).toThrow();
    });

    it('should enforce NOT NULL on criado_por and atualizado_por', () => {
      const invalidInsert = () => {
        db.prepare(
          `INSERT INTO agentes_economicos (
            id, tipo_entidade, cpf_cnpj, nome, papel, ativo,
            criado_em, atualizado_em
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          uuidv4(), 'pessoa_fisica', VALID_CPFS.cpf_1, 'Test', 'tenant', 1,
          new Date().toISOString(), new Date().toISOString(),
        );
      };

      expect(invalidInsert).toThrow();
    });
  });

  describe('Check Constraints', () => {
    it('should enforce CHECK on tipo_entidade values', () => {
      const invalidInsert = () => {
        db.prepare(
          `INSERT INTO agentes_economicos (
            id, tipo_entidade, cpf_cnpj, nome, papel, ativo,
            criado_em, criado_por, atualizado_em, atualizado_por
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          uuidv4(), 'invalid_type', VALID_CPFS.cpf_1, 'Test', 'tenant', 1,
          new Date().toISOString(), TEST_ADMIN_USER.id,
          new Date().toISOString(), TEST_ADMIN_USER.id,
        );
      };

      expect(invalidInsert).toThrow();
    });

    it('should enforce CHECK on papel values', () => {
      const invalidInsert = () => {
        db.prepare(
          `INSERT INTO agentes_economicos (
            id, tipo_entidade, cpf_cnpj, nome, papel, ativo,
            criado_em, criado_por, atualizado_em, atualizado_por
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          uuidv4(), 'pessoa_fisica', VALID_CPFS.cpf_1, 'Test', 'invalid_papel', 1,
          new Date().toISOString(), TEST_ADMIN_USER.id,
          new Date().toISOString(), TEST_ADMIN_USER.id,
        );
      };

      expect(invalidInsert).toThrow();
    });

    it('should accept valid papel values', () => {
      const validPapeis = ['tenant', 'supplier', 'provider', 'legal_party', 'co_owner', 'borrower', 'lender'];

      validPapeis.forEach((papel, index) => {
        const agent = createSamplePessoaFisicaTenant({
          cpf_cnpj: VALID_CPFS[`cpf_${index + 1}` as keyof typeof VALID_CPFS],
          papel: papel as unknown,
          criado_por: TEST_ADMIN_USER.id,
          atualizado_por: TEST_ADMIN_USER.id,
        });

        expect(() => {
          insertAgente(db, agent);
        }).not.toThrow();
      });

      const count = db.prepare(
        'SELECT COUNT(*) as total FROM agentes_economicos'
      ).get() as unknown;

      expect(count.total).toBe(validPapeis.length);
    });

    it('should enforce CHECK on CPF/CNPJ length by tipo_entidade', () => {
      // Try to insert PF with CNPJ length
      const invalidInsert = () => {
        db.prepare(
          `INSERT INTO agentes_economicos (
            id, tipo_entidade, cpf_cnpj, nome, papel, ativo,
            criado_em, criado_por, atualizado_em, atualizado_por
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          uuidv4(), 'pessoa_fisica', VALID_CNPJS.cnpj_1, 'Test', 'tenant', 1,
          new Date().toISOString(), TEST_ADMIN_USER.id,
          new Date().toISOString(), TEST_ADMIN_USER.id,
        );
      };

      expect(invalidInsert).toThrow();
    });

    it('should enforce CHECK on regime_tributario values', () => {
      const invalidInsert = () => {
        db.prepare(
          `INSERT INTO agentes_economicos (
            id, tipo_entidade, cpf_cnpj, nome, papel, ativo,
            regime_tributario,
            criado_em, criado_por, atualizado_em, atualizado_por
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          uuidv4(), 'pessoa_juridica', VALID_CNPJS.cnpj_1, 'Test', 'supplier', 1,
          'invalid_regime',
          new Date().toISOString(), TEST_ADMIN_USER.id,
          new Date().toISOString(), TEST_ADMIN_USER.id,
        );
      };

      expect(invalidInsert).toThrow();
    });
  });

  describe('Foreign Key Constraints', () => {
    it('should enforce FK constraint on criado_por', () => {
      const invalidInsert = () => {
        db.prepare(
          `INSERT INTO agentes_economicos (
            id, tipo_entidade, cpf_cnpj, nome, papel, ativo,
            criado_em, criado_por, atualizado_em, atualizado_por
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          uuidv4(), 'pessoa_fisica', VALID_CPFS.cpf_1, 'Test', 'tenant', 1,
          new Date().toISOString(), uuidv4(),  // Non-existent user
          new Date().toISOString(), TEST_ADMIN_USER.id,
        );
      };

      expect(invalidInsert).toThrow();
    });

    it('should enforce FK constraint on atualizado_por', () => {
      const invalidInsert = () => {
        db.prepare(
          `INSERT INTO agentes_economicos (
            id, tipo_entidade, cpf_cnpj, nome, papel, ativo,
            criado_em, criado_por, atualizado_em, atualizado_por
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          uuidv4(), 'pessoa_fisica', VALID_CPFS.cpf_1, 'Test', 'tenant', 1,
          new Date().toISOString(), TEST_ADMIN_USER.id,
          new Date().toISOString(), uuidv4(),  // Non-existent user
        );
      };

      expect(invalidInsert).toThrow();
    });

    it('should enforce FK constraint on validado_por (nullable)', () => {
      const agent = createSamplePessoaFisicaTenant({
        validado: true,
        validado_em: new Date(),
        validado_por: uuidv4(),  // Non-existent user
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      expect(() => {
        insertAgente(db, agent);
      }).toThrow();
    });

    it('should allow NULL validado_por', () => {
      const agent = createSamplePessoaFisicaTenant({
        validado: false,
        validado_em: null,
        validado_por: null,
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      expect(() => {
        insertAgente(db, agent);
      }).not.toThrow();
    });

    it('should enforce FK constraint on agentes_vinculacoes.agente_id', () => {
      const invalidInsert = () => {
        db.prepare(
          `INSERT INTO agentes_vinculacoes (
            id, agente_id, tipo_vinculacao, entidade_id,
            ativo, criado_em, criado_por
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          uuidv4(), uuidv4(),  // Non-existent agent
          'pagamento', uuidv4(), 1,
          new Date().toISOString(), TEST_ADMIN_USER.id,
        );
      };

      expect(invalidInsert).toThrow();
    });

    it('should enforce FK constraint on agentes_validacoes.agente_id', () => {
      const invalidInsert = () => {
        db.prepare(
          `INSERT INTO agentes_validacoes (
            id, agente_id, tipo_validacao, resultado,
            executado_em, executado_por
          ) VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
          uuidv4(), uuidv4(),  // Non-existent agent
          'cpf_cnpj', 'aprovado',
          new Date().toISOString(), TEST_ADMIN_USER.id,
        );
      };

      expect(invalidInsert).toThrow();
    });
  });

  describe('Cascade Delete Behavior', () => {
    it('should cascade delete vinculações when agent is deleted', () => {
      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      // Add vinculação
      db.prepare(
        `INSERT INTO agentes_vinculacoes (
          id, agente_id, tipo_vinculacao, entidade_id,
          ativo, criado_em, criado_por
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        uuidv4(), agent.id, 'pagamento', uuidv4(), 1,
        new Date().toISOString(), TEST_ADMIN_USER.id,
      );

      expect(db.prepare(
        'SELECT COUNT(*) as count FROM agentes_vinculacoes WHERE agente_id = ?'
      ).get(agent.id) as unknown).toHaveProperty('count', 1);

      // Delete agent
      db.prepare('DELETE FROM agentes_economicos WHERE id = ?').run(agent.id);

      // Verify vinculações were cascade deleted
      expect(db.prepare(
        'SELECT COUNT(*) as count FROM agentes_vinculacoes WHERE agente_id = ?'
      ).get(agent.id) as unknown).toHaveProperty('count', 0);
    });

    it('should cascade delete validações when agent is deleted', () => {
      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      // Add validação
      db.prepare(
        `INSERT INTO agentes_validacoes (
          id, agente_id, tipo_validacao, resultado,
          executado_em, executado_por
        ) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        uuidv4(), agent.id, 'cpf_cnpj', 'aprovado',
        new Date().toISOString(), TEST_ADMIN_USER.id,
      );

      expect(db.prepare(
        'SELECT COUNT(*) as count FROM agentes_validacoes WHERE agente_id = ?'
      ).get(agent.id) as unknown).toHaveProperty('count', 1);

      // Delete agent
      db.prepare('DELETE FROM agentes_economicos WHERE id = ?').run(agent.id);

      // Verify validações were cascade deleted
      expect(db.prepare(
        'SELECT COUNT(*) as count FROM agentes_validacoes WHERE agente_id = ?'
      ).get(agent.id) as unknown).toHaveProperty('count', 0);
    });

    it('should cascade delete duplicatas when agent is deleted', () => {
      const agent1 = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      const agent2 = createSamplePessoaFisicaTenant({
        cpf_cnpj: VALID_CPFS.cpf_2,
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent1);
      insertAgente(db, agent2);

      // Add duplicata record
      db.prepare(
        `INSERT INTO agentes_duplicatas_suspeitas (
          id, agente_id_1, agente_id_2, score, motivo,
          status, criado_em, criado_por
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        uuidv4(), agent1.id, agent2.id, 75, 'nome_similar',
        'pendente', new Date().toISOString(), TEST_ADMIN_USER.id,
      );

      // Delete agent1
      db.prepare('DELETE FROM agentes_economicos WHERE id = ?').run(agent1.id);

      // Verify duplicata record was cascade deleted
      const remaining = db.prepare(
        'SELECT COUNT(*) as count FROM agentes_duplicatas_suspeitas WHERE agente_id_1 = ?'
      ).get(agent1.id) as unknown;

      expect(remaining.count).toBe(0);
    });
  });

  describe('Reflexive Constraint - Duplicatas', () => {
    it('should prevent duplicata record with same agente on both sides', () => {
      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      const reflexiveInsert = () => {
        db.prepare(
          `INSERT INTO agentes_duplicatas_suspeitas (
            id, agente_id_1, agente_id_2, score, motivo,
            status, criado_em, criado_por
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          uuidv4(), agent.id, agent.id, 100, 'cpf_cnpj_similar',
          'pendente', new Date().toISOString(), TEST_ADMIN_USER.id,
        );
      };

      expect(reflexiveInsert).toThrow();
    });
  });
});
