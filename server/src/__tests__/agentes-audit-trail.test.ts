/**
 * Audit Trail Tests for Economic Agents (Agentes Econômicos)
 *
 * Tests audit trail functionality:
 * - Create generates audit entry
 * - Update preserves previous values
 * - Delete (soft) is auditable
 * - User attribution on all changes
 * - Timestamp accuracy
 * - Immutability of audit fields
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createSamplePessoaFisicaTenant,
  TEST_ADMIN_USER,
  TEST_REGULAR_USER,
} from './fixtures/agentes-fixtures.js';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, `test-agentes-audit-${process.pid}.db`);

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

  // Insert test users
  const users = [TEST_ADMIN_USER, TEST_REGULAR_USER];
  users.forEach(user => {
    db.prepare(
      `INSERT OR IGNORE INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao)
       VALUES (?, ?, ?, 'hash_test', ?, true, '2026-01-01')`
    ).run(user.id, user.nome, user.email, user.role);
  });

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

describe('Agentes Audit Trail Tests', () => {
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

  describe('Create Audit Entry', () => {
    it('should record criado_por on agent creation', () => {
      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      const record = db.prepare(
        'SELECT criado_por FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as unknown;

      expect(record.criado_por).toBe(TEST_ADMIN_USER.id);
    });

    it('should record criado_em timestamp on agent creation', () => {
      const beforeCreate = new Date();

      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      const afterCreate = new Date();

      const record = db.prepare(
        'SELECT criado_em FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as unknown;

      const createdAt = new Date(record.criado_em);

      expect(createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
      expect(createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
    });

    it('should record initial atualizado_por same as criado_por', () => {
      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      const record = db.prepare(
        'SELECT criado_por, atualizado_por FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as unknown;

      expect(record.criado_por).toBe(record.atualizado_por);
    });

    it('should record validation entry on approval', () => {
      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

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

      const validation = db.prepare(
        'SELECT * FROM agentes_validacoes WHERE id = ?'
      ).get(validacaoId) as unknown;

      expect(validation).toBeDefined();
      expect(validation.agente_id).toBe(agent.id);
      expect(validation.resultado).toBe('aprovado');
      expect(validation.executado_por).toBe(TEST_ADMIN_USER.id);
    });
  });

  describe('Update Audit Trail', () => {
    it('should update atualizado_por on agent modification', () => {
      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      // Simulate update by different user
      db.prepare(
        'UPDATE agentes_economicos SET nome = ?, atualizado_por = ?, atualizado_em = ? WHERE id = ?'
      ).run(
        'Updated Name',
        TEST_REGULAR_USER.id,
        new Date().toISOString(),
        agent.id,
      );

      const record = db.prepare(
        'SELECT criado_por, atualizado_por, nome FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as unknown;

      expect(record.criado_por).toBe(TEST_ADMIN_USER.id);
      expect(record.atualizado_por).toBe(TEST_REGULAR_USER.id);
      expect(record.nome).toBe('Updated Name');
    });

    it('should update atualizado_em timestamp on modification', () => {
      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      // Wait a bit
      const delay = () => new Promise(resolve => setTimeout(resolve, 10));
      delay();

      const beforeUpdate = new Date();

      db.prepare(
        'UPDATE agentes_economicos SET nome = ?, atualizado_em = ?, atualizado_por = ? WHERE id = ?'
      ).run(
        'New Name',
        new Date().toISOString(),
        TEST_ADMIN_USER.id,
        agent.id,
      );

      const afterUpdate = new Date();

      const updatedRecord = db.prepare(
        'SELECT atualizado_em FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as unknown;

      const updatedAt = new Date(updatedRecord.atualizado_em);

      expect(updatedAt.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
      expect(updatedAt.getTime()).toBeLessThanOrEqual(afterUpdate.getTime());
    });

    it('should preserve criado_em when updating', () => {
      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      const originalCriado = db.prepare(
        'SELECT criado_em FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as unknown;

      db.prepare(
        'UPDATE agentes_economicos SET nome = ?, atualizado_em = ?, atualizado_por = ? WHERE id = ?'
      ).run(
        'Updated Name',
        new Date().toISOString(),
        TEST_REGULAR_USER.id,
        agent.id,
      );

      const afterUpdate = db.prepare(
        'SELECT criado_em FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as unknown;

      expect(afterUpdate.criado_em).toBe(originalCriado.criado_em);
    });

    it('should preserve criado_por when updating', () => {
      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      db.prepare(
        'UPDATE agentes_economicos SET nome = ?, atualizado_em = ?, atualizado_por = ? WHERE id = ?'
      ).run(
        'Updated Name',
        new Date().toISOString(),
        TEST_REGULAR_USER.id,
        agent.id,
      );

      const record = db.prepare(
        'SELECT criado_por FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as unknown;

      expect(record.criado_por).toBe(TEST_ADMIN_USER.id);
    });

    it('should record multiple updates in sequence', () => {
      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      const updates = [
        { nome: 'Update 1', user: TEST_ADMIN_USER.id },
        { nome: 'Update 2', user: TEST_REGULAR_USER.id },
        { nome: 'Update 3', user: TEST_ADMIN_USER.id },
      ];

      updates.forEach(update => {
        db.prepare(
          'UPDATE agentes_economicos SET nome = ?, atualizado_em = ?, atualizado_por = ? WHERE id = ?'
        ).run(
          update.nome,
          new Date().toISOString(),
          update.user,
          agent.id,
        );
      });

      const finalRecord = db.prepare(
        'SELECT nome, atualizado_por, criado_por FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as unknown;

      expect(finalRecord.nome).toBe('Update 3');
      expect(finalRecord.atualizado_por).toBe(TEST_ADMIN_USER.id);
      expect(finalRecord.criado_por).toBe(TEST_ADMIN_USER.id);
    });
  });

  describe('Delete Audit Trail', () => {
    it('should record soft delete through atualizado_por', () => {
      const agent = createSamplePessoaFisicaTenant({
        ativo: true,
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      db.prepare(
        'UPDATE agentes_economicos SET ativo = 0, atualizado_em = ?, atualizado_por = ? WHERE id = ?'
      ).run(
        new Date().toISOString(),
        TEST_REGULAR_USER.id,
        agent.id,
      );

      const record = db.prepare(
        'SELECT ativo, atualizado_por FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as unknown;

      expect(record.ativo).toBe(0);
      expect(record.atualizado_por).toBe(TEST_REGULAR_USER.id);
    });

    it('should maintain audit trail after soft delete', () => {
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

      const afterDelete = db.prepare(
        'SELECT criado_por, criado_em FROM agentes_economicos WHERE id = ?'
      ).get(agent.id) as unknown;

      expect(afterDelete.criado_por).toBeDefined();
      expect(afterDelete.criado_em).toBeDefined();
    });
  });

  describe('Validation Audit', () => {
    it('should create multiple validation records over time', () => {
      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      const validations = [
        { type: 'cpf_cnpj', result: 'pendente' },
        { type: 'email', result: 'pendente' },
        { type: 'cpf_cnpj', result: 'aprovado' },
      ];

      validations.forEach(v => {
        db.prepare(
          `INSERT INTO agentes_validacoes (
            id, agente_id, tipo_validacao, resultado,
            executado_em, executado_por
          ) VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
          uuidv4(),
          agent.id,
          v.type,
          v.result,
          new Date().toISOString(),
          TEST_ADMIN_USER.id,
        );
      });

      const records = db.prepare(
        'SELECT tipo_validacao, resultado FROM agentes_validacoes WHERE agente_id = ? ORDER BY executado_em'
      ).all(agent.id) as unknown[];

      expect(records.length).toBe(3);
      expect(records[0].tipo_validacao).toBe('cpf_cnpj');
      expect(records[1].tipo_validacao).toBe('email');
      expect(records[2].resultado).toBe('aprovado');
    });

    it('should track who validated the agent', () => {
      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      db.prepare(
        `INSERT INTO agentes_validacoes (
          id, agente_id, tipo_validacao, resultado,
          executado_em, executado_por
        ) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        uuidv4(),
        agent.id,
        'cpf_cnpj',
        'aprovado',
        new Date().toISOString(),
        TEST_REGULAR_USER.id,
      );

      const validation = db.prepare(
        'SELECT executado_por FROM agentes_validacoes WHERE agente_id = ?'
      ).get(agent.id) as unknown;

      expect(validation.executado_por).toBe(TEST_REGULAR_USER.id);
    });
  });

  describe('Duplicata Audit', () => {
    it('should record who identified the duplicata', () => {
      const agent1 = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      const agent2 = createSamplePessoaFisicaTenant({
        cpf_cnpj: agent1.cpf_cnpj.slice(0, -4) + '0000',
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent1);
      insertAgente(db, agent2);

      const duplicataId = uuidv4();

      db.prepare(
        `INSERT INTO agentes_duplicatas_suspeitas (
          id, agente_id_1, agente_id_2, score, motivo,
          status, criado_em, criado_por
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        duplicataId,
        agent1.id,
        agent2.id,
        85,
        'nome_similar',
        'pendente',
        new Date().toISOString(),
        TEST_ADMIN_USER.id,
      );

      const duplicata = db.prepare(
        'SELECT criado_por FROM agentes_duplicatas_suspeitas WHERE id = ?'
      ).get(duplicataId) as unknown;

      expect(duplicata.criado_por).toBe(TEST_ADMIN_USER.id);
    });

    it('should track duplicata analysis decision', () => {
      const agent1 = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      const agent2 = createSamplePessoaFisicaTenant({
        cpf_cnpj: agent1.cpf_cnpj.slice(0, -4) + '0001',
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent1);
      insertAgente(db, agent2);

      const duplicataId = uuidv4();

      db.prepare(
        `INSERT INTO agentes_duplicatas_suspeitas (
          id, agente_id_1, agente_id_2, score, motivo,
          status, criado_em, criado_por
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        duplicataId,
        agent1.id,
        agent2.id,
        75,
        'nome_similar',
        'pendente',
        new Date().toISOString(),
        TEST_ADMIN_USER.id,
      );

      // Mark as analyzed
      db.prepare(
        'UPDATE agentes_duplicatas_suspeitas SET status = ?, analisado_em = ?, analisado_por = ?, decisao = ? WHERE id = ?'
      ).run(
        'refutada',
        new Date().toISOString(),
        TEST_REGULAR_USER.id,
        'Not actual duplicates',
        duplicataId,
      );

      const analyzed = db.prepare(
        'SELECT status, analisado_por, decisao FROM agentes_duplicatas_suspeitas WHERE id = ?'
      ).get(duplicataId) as unknown;

      expect(analyzed.status).toBe('refutada');
      expect(analyzed.analisado_por).toBe(TEST_REGULAR_USER.id);
      expect(analyzed.decisao).toContain('Not');
    });
  });

  describe('Vinculação Audit', () => {
    it('should record who created vinculação', () => {
      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      const vinculacaoId = uuidv4();
      const entidadeId = uuidv4();

      db.prepare(
        `INSERT INTO agentes_vinculacoes (
          id, agente_id, tipo_vinculacao, entidade_id,
          ativo, criado_em, criado_por
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        vinculacaoId,
        agent.id,
        'pagamento',
        entidadeId,
        1,
        new Date().toISOString(),
        TEST_REGULAR_USER.id,
      );

      const vinculacao = db.prepare(
        'SELECT criado_por FROM agentes_vinculacoes WHERE id = ?'
      ).get(vinculacaoId) as unknown;

      expect(vinculacao.criado_por).toBe(TEST_REGULAR_USER.id);
    });
  });

  describe('Audit Trail Completeness', () => {
    it('should have complete audit trail for agent lifecycle', () => {
      const agent = createSamplePessoaFisicaTenant({
        criado_por: TEST_ADMIN_USER.id,
        atualizado_por: TEST_ADMIN_USER.id,
      });

      insertAgente(db, agent);

      const record = db.prepare(
        `SELECT criado_em, criado_por, atualizado_em, atualizado_por,
                validado, validado_em, validado_por
         FROM agentes_economicos WHERE id = ?`
      ).get(agent.id) as unknown;

      expect(record.criado_em).toBeDefined();
      expect(record.criado_por).toBeDefined();
      expect(record.atualizado_em).toBeDefined();
      expect(record.atualizado_por).toBeDefined();
    });
  });
});
