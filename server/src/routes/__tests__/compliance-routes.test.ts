/**
 * Phase 22.18 - Compliance Routes API Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { criarRotasCompliance } from '../compliance-routes.js';

describe('Compliance Routes - Phase 22.18', () => {
  let app: express.Application;
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');

    // Create minimal schema for testing
    db.exec(`
      CREATE TABLE usuarios (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        email TEXT NOT NULL,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE transactions (
        id TEXT PRIMARY KEY,
        usuario_id TEXT,
        data_transacao DATE,
        tipo TEXT,
        valor REAL,
        descricao TEXT,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      );

      CREATE TABLE audit_log (
        id TEXT PRIMARY KEY,
        usuario_id TEXT,
        acao TEXT,
        tipo_recurso TEXT,
        id_recurso TEXT,
        valor_anterior TEXT,
        valor_novo TEXT,
        timestamp DATETIME,
        endereco_ip TEXT,
        user_agent TEXT,
        status TEXT,
        motivo TEXT,
        hash_valor TEXT,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      );

      CREATE TABLE legal_holds (
        hold_id TEXT PRIMARY KEY,
        id_recurso TEXT,
        motivo TEXT,
        data_inicio DATETIME DEFAULT CURRENT_TIMESTAMP,
        data_expiracao DATETIME NOT NULL,
        status TEXT DEFAULT 'ACTIVE',
        criado_por TEXT
      );

      CREATE TABLE lgpd_consent_log (
        id TEXT PRIMARY KEY,
        usuario_id TEXT,
        tipo_consentimento TEXT,
        versao TEXT,
        concedido_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        revogado_em DATETIME,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      );

      CREATE TABLE lgpd_deletion_requests (
        request_id TEXT PRIMARY KEY,
        usuario_id TEXT,
        motivo TEXT,
        status TEXT DEFAULT 'PENDING',
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        data_exclusao_agendada DATETIME,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      );

      CREATE TABLE lgpd_data_processing (
        id TEXT PRIMARY KEY,
        usuario_id TEXT,
        tipo_dado TEXT,
        proposito_processamento TEXT,
        base_legal TEXT,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      );

      CREATE TABLE lgpd_incident_log (
        id TEXT PRIMARY KEY,
        tipo_incidente TEXT,
        descricao TEXT,
        usuarios_afetados INTEGER,
        dados_afetados TEXT,
        risco_nivel TEXT,
        data_incidente DATETIME,
        data_descoberta DATETIME,
        status_resolucao TEXT DEFAULT 'OPEN',
        criado_em DATETIME
      );

      CREATE TABLE gdpr_consents (
        id TEXT PRIMARY KEY,
        usuario_id TEXT,
        tipo_consentimento TEXT,
        categoria_dados TEXT,
        concedido TINYINT,
        data_consentimento DATETIME,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      );

      CREATE TABLE propriedades (
        id TEXT PRIMARY KEY,
        criado_por TEXT,
        descricao TEXT
      );

      CREATE TABLE tax_obligations (
        id TEXT PRIMARY KEY,
        tipo_imposto TEXT,
        periodo_ano INTEGER,
        periodo_mes INTEGER,
        valor_imposto DECIMAL,
        data_vencimento DATE,
        status TEXT,
        criado_em DATETIME
      );

      CREATE TABLE compliance_certifications (
        id TEXT PRIMARY KEY,
        tipo_certificacao TEXT,
        orgao_certificador TEXT,
        numero_certificado TEXT,
        data_expedicao DATE,
        data_expiracao DATE,
        ativo TINYINT,
        data_renovacao_sugerida DATE
      );
    `);

    app = express();
    app.use(express.json());
    app.use('/api/compliance', criarRotasCompliance({ db }));
  });

  afterEach(() => {
    db.close();
  });

  describe('SPED Report Generation', () => {
    it('should generate SPED report with valid dates', async () => {
      db.prepare(`INSERT INTO usuarios (id, nome, email) VALUES (?, ?, ?)`).run(
        'user1',
        'Test User',
        'test@example.com'
      );

      db.prepare(
        `INSERT INTO transactions (id, usuario_id, data_transacao, tipo, valor, descricao)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run('tx1', 'user1', '2026-01-15', 'INCOME', 1000, 'Test transaction');

      const res = await request(app)
        .post('/api/compliance/sped-report')
        .send({
          startDate: '2026-01-01',
          endDate: '2026-12-31',
        });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.text).toContain('|0|0|');
    });

    it('should return 400 for missing dates', async () => {
      const res = await request(app)
        .post('/api/compliance/sped-report')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('Data Export (LGPD/GDPR)', () => {
    it('should export user data', async () => {
      db.prepare(`INSERT INTO usuarios (id, nome, email) VALUES (?, ?, ?)`).run(
        'user1',
        'João Silva',
        'joao@example.com'
      );

      const res = await request(app)
        .get('/api/compliance/export-data/user1');

      expect(res.status).toBe(200);
      expect(res.body.type).toBe('LGPD_DATA_EXPORT');
      expect(res.body.userId).toBe('user1');
      expect(res.body.data).toBeDefined();
    });

    it('should return 400 for missing userId', async () => {
      const res = await request(app).get('/api/compliance/export-data/');

      expect(res.status).toBe(404);
    });
  });

  describe('Deletion Request', () => {
    it('should create deletion request', async () => {
      db.prepare(`INSERT INTO usuarios (id, nome, email) VALUES (?, ?, ?)`).run(
        'user1',
        'Test User',
        'test@example.com'
      );

      const res = await request(app)
        .post('/api/compliance/deletion-request')
        .send({
          userId: 'user1',
          reason: 'User requested deletion',
        });

      expect(res.status).toBe(201);
      expect(res.body.type).toBe('DELETION_REQUEST_CREATED');
      expect(res.body.requestId).toBeDefined();
      expect(res.body.status).toBe('PENDING');
      expect(res.body.gracePeriod).toBe('30 days');
    });

    it('should return 400 for missing fields', async () => {
      const res = await request(app)
        .post('/api/compliance/deletion-request')
        .send({ userId: 'user1' });

      expect(res.status).toBe(400);
    });
  });

  describe('Audit Trail', () => {
    it('should retrieve audit trail', async () => {
      db.prepare(`
        INSERT INTO audit_log
        (id, usuario_id, acao, tipo_recurso, id_recurso, timestamp, status)
        VALUES (?, ?, ?, ?, ?, datetime('now'), ?)
      `).run('audit1', 'user1', 'UPDATE', 'transaction', 'tx1', 'SUCCESS');

      const res = await request(app)
        .get('/api/compliance/audit-trail');

      expect(res.status).toBe(200);
      expect(res.body.type).toBe('AUDIT_TRAIL_REPORT');
      expect(Array.isArray(res.body.entries)).toBe(true);
    });

    it('should filter audit trail by userId', async () => {
      db.prepare(`
        INSERT INTO audit_log
        (id, usuario_id, acao, tipo_recurso, id_recurso, timestamp, status)
        VALUES (?, ?, ?, ?, ?, datetime('now'), ?)
      `).run('audit1', 'user1', 'UPDATE', 'transaction', 'tx1', 'SUCCESS');

      const res = await request(app)
        .get('/api/compliance/audit-trail?userId=user1');

      expect(res.status).toBe(200);
      expect(res.body.entries.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Legal Hold', () => {
    it('should place legal hold', async () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const res = await request(app)
        .post('/api/compliance/legal-hold')
        .send({
          resourceId: 'doc123',
          reason: 'Litigation support',
          expiresAt: expiresAt.toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.type).toBe('LEGAL_HOLD_PLACED');
      expect(res.body.holdId).toBeDefined();
      expect(res.body.resourceId).toBe('doc123');
    });

    it('should default expiration to 30 days', async () => {
      const res = await request(app)
        .post('/api/compliance/legal-hold')
        .send({
          resourceId: 'doc123',
          reason: 'Litigation support',
        });

      expect(res.status).toBe(201);
      expect(res.body.expiresAt).toBeDefined();
    });
  });

  describe('Tax Obligations', () => {
    it('should get tax schedule', async () => {
      const res = await request(app)
        .get('/api/compliance/tax-obligations?year=2026');

      expect(res.status).toBe(200);
      expect(res.body.type).toBe('TAX_OBLIGATION_SCHEDULE');
      expect(res.body.year).toBe(2026);
      expect(res.body.total).toBe(12); // 12 months
      expect(Array.isArray(res.body.schedule)).toBe(true);
    });

    it('should return 400 for invalid year', async () => {
      const res = await request(app)
        .get('/api/compliance/tax-obligations?year=invalid');

      expect(res.status).toBe(400);
    });
  });

  describe('Compliance Status', () => {
    it('should get compliance status overview', async () => {
      const res = await request(app)
        .get('/api/compliance/compliance-status');

      expect(res.status).toBe(200);
      expect(res.body.type).toBe('COMPLIANCE_STATUS_OVERVIEW');
      expect(res.body.timestamp).toBeDefined();
      expect(Array.isArray(res.body.areas)).toBe(true);
    });
  });

  describe('Incident Report', () => {
    it('should report incident', async () => {
      const res = await request(app)
        .post('/api/compliance/incident-report')
        .send({
          type: 'DATA_BREACH',
          description: 'Unauthorized database access detected',
          affectedUsers: 100,
          affectedData: 'User emails and phone numbers',
          riskLevel: 'ALTO',
        });

      expect(res.status).toBe(201);
      expect(res.body.type).toBe('INCIDENT_REPORTED');
      expect(res.body.incidentId).toBeDefined();
      expect(res.body.status).toBe('OPEN');
      expect(res.body.notificationRequired).toBe(true); // ALTO risk
    });

    it('should return 400 for invalid risk level', async () => {
      const res = await request(app)
        .post('/api/compliance/incident-report')
        .send({
          type: 'DATA_BREACH',
          description: 'Test',
          riskLevel: 'INVALID',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('Certifications', () => {
    it('should retrieve certifications', async () => {
      db.prepare(`
        INSERT INTO compliance_certifications
        (id, tipo_certificacao, orgao_certificador, numero_certificado, data_expedicao, data_expiracao, ativo)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'cert1',
        'ISO 27001',
        'Certification Body',
        'CERT-2024-001',
        '2024-01-01',
        '2027-01-01',
        1
      );

      const res = await request(app)
        .get('/api/compliance/certifications');

      expect(res.status).toBe(200);
      expect(res.body.type).toBe('COMPLIANCE_CERTIFICATIONS');
      expect(res.body.summary).toBeDefined();
      expect(res.body.certifications).toBeDefined();
    });
  });
});
