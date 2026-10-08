/**
 * Phase 22.18 - Compliance & Regulatory Reporting Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import {
  SPEDReportGenerator,
  LGPDComplianceManager,
  GDPRComplianceManager,
  AuditTrailManager,
  TaxComplianceManager,
} from './regulatory-reporting';

describe('Phase 22.18 - Compliance & Regulatory Reporting', () => {
  let db: Database.Database;
  let spedGenerator: SPEDReportGenerator;
  let lgpdManager: LGPDComplianceManager;
  let gdprManager: GDPRComplianceManager;
  let auditTrail: AuditTrailManager;
  let taxManager: TaxComplianceManager;

  beforeEach(() => {
    db = new Database(':memory:');

    // Create minimal schema for testing
    db.exec(`
      CREATE TABLE usuarios (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        email TEXT NOT NULL,
        telefone TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE transactions (
        id TEXT PRIMARY KEY,
        usuario_id TEXT,
        propriedade_id TEXT,
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
        data_inicio DATETIME,
        data_expiracao DATETIME,
        status TEXT,
        data_liberacao DATETIME,
        motivo_liberacao TEXT,
        criado_por TEXT,
        liberado_por TEXT
      );

      CREATE TABLE lgpd_consent_log (
        id TEXT PRIMARY KEY,
        usuario_id TEXT,
        tipo_consentimento TEXT,
        versao TEXT,
        concedido_em DATETIME,
        revogado_em DATETIME,
        ip_address TEXT,
        user_agent TEXT,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      );

      CREATE TABLE lgpd_deletion_requests (
        request_id TEXT PRIMARY KEY,
        usuario_id TEXT,
        motivo TEXT,
        status TEXT,
        criado_em DATETIME,
        data_exclusao_agendada DATETIME,
        data_exclusao_efetiva DATETIME,
        revisado_por TEXT,
        data_revisao DATETIME,
        motivo_rejeicao TEXT
      );

      CREATE TABLE lgpd_data_processing (
        id TEXT PRIMARY KEY,
        usuario_id TEXT,
        tipo_dado TEXT,
        proposito_processamento TEXT,
        base_legal TEXT,
        periodo_retencao_dias INTEGER,
        data_expiracao DATETIME,
        ativo TINYINT,
        criado_em DATETIME,
        atualizado_em DATETIME
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
        data_notificacao_autoridade DATETIME,
        medidas_tomadas TEXT,
        status_resolucao TEXT,
        investigador_id TEXT,
        criado_em DATETIME
      );

      CREATE TABLE gdpr_consents (
        id TEXT PRIMARY KEY,
        usuario_id TEXT,
        tipo_consentimento TEXT,
        categoria_dados TEXT,
        concedido TINYINT,
        data_consentimento DATETIME,
        data_revogacao DATETIME,
        versao_politica TEXT,
        ip_address TEXT,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      );

      CREATE TABLE gdpr_deletion_log (
        id TEXT PRIMARY KEY,
        usuario_id TEXT,
        data_exclusao DATETIME,
        motivo TEXT,
        hash_verificacao TEXT
      );

      CREATE TABLE tax_obligations (
        id TEXT PRIMARY KEY,
        tipo_imposto TEXT,
        periodo_ano INTEGER,
        periodo_mes INTEGER,
        valor_base DECIMAL,
        valor_imposto DECIMAL,
        valor_multa DECIMAL,
        data_vencimento DATE,
        data_pagamento DATE,
        status TEXT,
        comprovante_pagamento TEXT,
        criado_em DATETIME
      );
    `);

    spedGenerator = new SPEDReportGenerator(db);
    lgpdManager = new LGPDComplianceManager(db);
    gdprManager = new GDPRComplianceManager(db);
    auditTrail = new AuditTrailManager(db);
    taxManager = new TaxComplianceManager(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('SPED Report Generation', () => {
    it('should generate ECF report with proper format', () => {
      // Setup
      db.prepare(`INSERT INTO usuarios (id, nome, email) VALUES (?, ?, ?)`).run(
        'user1',
        'Test User',
        'test@example.com'
      );

      db.prepare(
        `INSERT INTO transactions (id, usuario_id, propriedade_id, data_transacao, tipo, valor, descricao)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run('tx1', 'user1', 'prop1', '2026-01-15', 'INCOME', 1000, 'Test transaction');

      // Execute
      const report = spedGenerator.generateECF(new Date('2026-01-01'), new Date('2026-12-31'));

      // Assert
      expect(report).toContain('|0|0|');
      expect(report).toContain('|D|1|00|');
      expect(report).toContain('|D|5|00|');
      expect(report).toContain('|D|9|90|');
    });

    it('should sanitize special characters in SPED output', () => {
      const sanitized = spedGenerator['sanitizeForSPED']('Test|with|pipes|and\nnewlines');
      expect(sanitized).not.toContain('|');
      expect(sanitized).not.toContain('\n');
      expect(sanitized).toMatch(/^Test/);
    });

    it('should generate CFe XML with proper structure', () => {
      db.prepare(`INSERT INTO usuarios (id, nome, email) VALUES (?, ?, ?)`).run(
        'user1',
        'Test User',
        'test@example.com'
      );

      db.prepare(
        `INSERT INTO transactions (id, usuario_id, propriedade_id, data_transacao, tipo, valor, descricao)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run('tx1', 'user1', 'prop1', '2026-01-15', 'INCOME', 500, 'Consumer tax transaction');

      const report = spedGenerator.generateCFe(new Date('2026-01-01'), new Date('2026-12-31'));

      expect(report).toContain('<?xml version="1.0"?>');
      expect(report).toContain('<CFe>');
      expect(report).toContain('<Transacao>');
      expect(report).toContain('</CFe>');
    });
  });

  describe('LGPD Compliance', () => {
    it('should export user personal data', () => {
      db.prepare(`INSERT INTO usuarios (id, nome, email, telefone) VALUES (?, ?, ?, ?)`).run(
        'user1',
        'João Silva',
        'joao@example.com',
        '11999999999'
      );

      const exported = lgpdManager.exportUserData('user1');

      expect(exported).toHaveProperty('user');
      expect(exported).toHaveProperty('accessLog');
      expect(exported).toHaveProperty('dataProcessing');
      expect(exported.user.email).toBe('joao@example.com');
    });

    it('should create deletion request with 30-day grace period', () => {
      db.prepare(`INSERT INTO usuarios (id, nome, email) VALUES (?, ?, ?)`).run(
        'user1',
        'Test User',
        'test@example.com'
      );

      const request = lgpdManager.requestUserDeletion('user1', 'User requested deletion');

      expect(request).toHaveProperty('requestId');
      expect(request.status).toBe('PENDING');

      // Verify in database
      const dbRecord = db.prepare('SELECT * FROM lgpd_deletion_requests WHERE request_id = ?').get(
        request.requestId
      ) as any;

      expect(dbRecord).toBeDefined();
      expect(dbRecord.status).toBe('PENDING');
    });

    it('should log consent with timestamp', () => {
      db.prepare(`INSERT INTO usuarios (id, nome, email) VALUES (?, ?, ?)`).run(
        'user1',
        'Test User',
        'test@example.com'
      );

      lgpdManager.logConsent('user1', 'MARKETING', '1.0');

      const record = db
        .prepare('SELECT * FROM lgpd_consent_log WHERE usuario_id = ?')
        .get('user1') as any;

      expect(record).toBeDefined();
      expect(record.tipo_consentimento).toBe('MARKETING');
      expect(record.versao).toBe('1.0');
    });

    it('should generate LGPD audit report for period', () => {
      db.prepare(`INSERT INTO usuarios (id, nome, email) VALUES (?, ?, ?)`).run(
        'user1',
        'Test User',
        'test@example.com'
      );

      lgpdManager.logConsent('user1', 'MARKETING', '1.0');

      const report = lgpdManager.generateLGPDAuditReport({
        start: new Date('2026-01-01'),
        end: new Date('2026-12-31'),
      });

      expect(report).toHaveProperty('period');
      expect(report).toHaveProperty('consentRecords');
      expect(report.consentRecords.length).toBeGreaterThan(0);
    });
  });

  describe('GDPR Compliance', () => {
    it('should export user data in JSON format', () => {
      db.prepare(`INSERT INTO usuarios (id, nome, email) VALUES (?, ?, ?)`).run(
        'user1',
        'Test User',
        'test@example.com'
      );

      const exported = gdprManager.exportPersonalData('user1');
      const data = JSON.parse(exported);

      expect(data).toHaveProperty('user');
      expect(data).toHaveProperty('transactions');
      expect(data).toHaveProperty('properties');
      expect(data).toHaveProperty('consents');
    });

    it('should delete user data with pseudonymization', () => {
      db.prepare(`INSERT INTO usuarios (id, nome, email) VALUES (?, ?, ?)`).run(
        'user1',
        'Test User',
        'test@example.com'
      );

      const result = gdprManager.deleteUserData('user1');

      expect(result.status).toBe('COMPLETED');
      expect(result.deletedRecords).toBe(1);

      // Verify user email is pseudonymized
      const user = db.prepare('SELECT * FROM usuarios WHERE id = ?').get('user1') as any;
      expect(user.email).toMatch(/^GDPR-DELETED-/);
      expect(user.telefone).toBeNull();
    });

    it('should generate DPA document', () => {
      const dpa = gdprManager.generateDPA('Data Processor Inc.');

      expect(dpa).toContain('DATA PROCESSING AGREEMENT');
      expect(dpa).toContain('Data Processor Inc.');
      expect(dpa).toContain('DEFINITIONS');
      expect(dpa).toContain('SECURITY MEASURES');
      expect(dpa).toContain('DATA SUBJECT RIGHTS');
    });
  });

  describe('Audit Trail', () => {
    it('should log changes with unique ID', () => {
      db.prepare(`INSERT INTO usuarios (id, nome, email) VALUES (?, ?, ?)`).run(
        'user1',
        'Admin',
        'admin@example.com'
      );

      const id = auditTrail.logChange({
        userId: 'user1',
        action: 'UPDATE_TRANSACTION',
        resourceType: 'transaction',
        resourceId: 'tx123',
        oldValue: { amount: 100 },
        newValue: { amount: 200 },
        timestamp: new Date(),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        status: 'SUCCESS',
      });

      expect(id).toMatch(/^AUD-/);

      const record = db.prepare('SELECT * FROM audit_log WHERE id = ?').get(id) as any;
      expect(record).toBeDefined();
      expect(record.acao).toBe('UPDATE_TRANSACTION');
    });

    it('should place and track legal hold', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const holdId = auditTrail.placeLegalHold('doc123', 'Litigation support', expiresAt);

      expect(holdId).toMatch(/^HOLD-/);

      const record = db.prepare('SELECT * FROM legal_holds WHERE hold_id = ?').get(holdId) as any;
      expect(record).toBeDefined();
      expect(record.status).toBe('ACTIVE');
      expect(record.motivo).toBe('Litigation support');
    });

    it('should generate audit trail report with filters', () => {
      db.prepare(`INSERT INTO usuarios (id, nome, email) VALUES (?, ?, ?)`).run(
        'user1',
        'Admin',
        'admin@example.com'
      );

      auditTrail.logChange({
        userId: 'user1',
        action: 'DELETE_TRANSACTION',
        resourceType: 'transaction',
        resourceId: 'tx123',
        oldValue: { amount: 500 },
        newValue: null,
        timestamp: new Date(),
        ipAddress: '192.168.1.1',
        userAgent: 'Chrome',
        status: 'SUCCESS',
      });

      const report = auditTrail.generateAuditTrailReport({
        userId: 'user1',
        action: 'DELETE_TRANSACTION',
      });

      expect(report.length).toBeGreaterThan(0);
      expect(report[0].acao).toBe('DELETE_TRANSACTION');
    });
  });

  describe('Tax Compliance', () => {
    it('should calculate tax obligations with rates', () => {
      db.prepare(`INSERT INTO transactions (id, tipo, valor, data_transacao) VALUES (?, ?, ?, ?)`).run(
        'tx1',
        'INCOME',
        10000,
        '2026-01-15'
      );

      db.prepare(`INSERT INTO transactions (id, tipo, valor, data_transacao) VALUES (?, ?, ?, ?)`).run(
        'tx2',
        'EXPENSE',
        3000,
        '2026-01-20'
      );

      const obligations = taxManager.calculateTaxObligations({
        start: new Date('2026-01-01'),
        end: new Date('2026-12-31'),
      });

      expect(obligations).toHaveProperty('income');
      expect(obligations).toHaveProperty('expenses');
      expect(obligations).toHaveProperty('grossProfit');
      expect(obligations).toHaveProperty('taxes');
      expect(obligations.income).toBe(10000);
      expect(obligations.expenses).toBe(3000);
      expect(obligations.grossProfit).toBe(7000);
    });

    it('should generate tax payment schedule', () => {
      const schedule = taxManager.generateTaxSchedule(2026);

      expect(schedule).toHaveLength(12);
      expect(schedule[0]).toHaveProperty('dueDate');
      expect(schedule[0]).toHaveProperty('amount');
      expect(schedule[0]).toHaveProperty('type');
      expect(schedule[0].type).toBe('MONTHLY_ESTIMATION');
    });
  });

  describe('Integration', () => {
    it('should handle complete compliance workflow', () => {
      // Setup
      db.prepare(`INSERT INTO usuarios (id, nome, email) VALUES (?, ?, ?)`).run(
        'user1',
        'Test User',
        'test@example.com'
      );

      // Log consent
      lgpdManager.logConsent('user1', 'PROCESSING', '1.0');

      // Log transaction
      auditTrail.logChange({
        userId: 'user1',
        action: 'CREATE_TRANSACTION',
        resourceType: 'transaction',
        resourceId: 'tx1',
        oldValue: null,
        newValue: { amount: 500 },
        timestamp: new Date(),
        ipAddress: '192.168.1.1',
        userAgent: 'Chrome',
        status: 'SUCCESS',
      });

      // Place legal hold if needed
      const holdId = auditTrail.placeLegalHold('tx1', 'Document preservation', new Date());

      // Verify all pieces are in place
      const consent = db.prepare('SELECT * FROM lgpd_consent_log WHERE usuario_id = ?').get('user1');
      const audit = db
        .prepare('SELECT * FROM audit_log WHERE usuario_id = ? AND acao = ?')
        .get('user1', 'CREATE_TRANSACTION');
      const hold = db.prepare('SELECT * FROM legal_holds WHERE hold_id = ?').get(holdId);

      expect(consent).toBeDefined();
      expect(audit).toBeDefined();
      expect(hold).toBeDefined();
    });
  });
});
