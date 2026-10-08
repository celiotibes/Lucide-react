/**
 * Phase 22.18: Compliance & Regulatory Reporting
 *
 * Multi-jurisdiction compliance for CRMT accounting system:
 * - SPED (Brazilian tax filing)
 * - LGPD (Brazilian data protection)
 * - GDPR (European compliance)
 * - Tax reporting frameworks
 * - Audit trail generation
 */

import { Database } from 'better-sqlite3';
import { createWriteStream } from 'fs';
import { parse } from 'json2csv';
import { createHash } from 'crypto';

interface ComplianceReport {
  id: string;
  reportType: 'SPED' | 'LGPD' | 'GDPR' | 'TAX' | 'AUDIT';
  jurisdiction: 'BR' | 'EU' | 'INTL';
  period: {
    startDate: Date;
    endDate: Date;
  };
  generatedAt: Date;
  status: 'PENDING' | 'GENERATED' | 'VALIDATED' | 'SUBMITTED';
  fileHash: string;
  fileName: string;
}

interface AuditEntry {
  id: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  oldValue: any;
  newValue: any;
  timestamp: Date;
  ipAddress: string;
  userAgent: string;
  status: 'SUCCESS' | 'FAILED';
  reason?: string;
}

/**
 * Brazilian SPED (Sistema Público de Escrituração Digital)
 * Tax filing format for Brazilian companies
 */
export class SPEDReportGenerator {
  constructor(private db: Database) {}

  generateECF(startDate: Date, endDate: Date): string {
    const cnpj = process.env.COMPANY_CNPJ || '00000000000191';
    const records: string[] = [];
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // File header
    records.push(`|0|0|${cnpj}|01|2.0|1|0|0|0|0|0|0|0|0|0|0|`);

    // Get transactions
    const transactions = this.db.prepare(`
      SELECT id, data_transacao, tipo, valor, descricao, propriedade_id
      FROM transactions
      WHERE data_transacao BETWEEN ? AND ?
      ORDER BY data_transacao
    `).all(startDateStr, endDateStr) as any[];

    // Record D100 (opening balance)
    const openingBalance = this.db.prepare(`
      SELECT COALESCE(SUM(valor), 0) as total
      FROM transactions
      WHERE data_transacao < ?
    `).get(startDateStr) as any;

    records.push(`|D|1|00|${cnpj}|${openingBalance.total}|BRL|`);

    // Record D500 (transactions)
    transactions.forEach((tx) => {
      records.push(
        `|D|5|00|${tx.propriedade_id}|${tx.data_transacao}|${tx.tipo}|` +
        `${tx.valor}|${this.sanitizeForSPED(tx.descricao)}|`
      );
    });

    // Record D990 (closing balance)
    const closingBalance = this.db.prepare(`
      SELECT COALESCE(SUM(valor), 0) as total
      FROM transactions
      WHERE data_transacao <= ?
    `).get(endDateStr) as any;

    records.push(`|D|9|90|${cnpj}|${closingBalance.total}|`);

    return records.join('\n');
  }

  private sanitizeForSPED(value: string): string {
    return value
      .replace(/[|]/g, '')
      .replace(/[\n\r]/g, ' ')
      .substring(0, 255);
  }

  generateCFe(startDate: Date, endDate: Date): string {
    // Consumer tax generation (simplified)
    const xml: string[] = [];
    xml.push('<?xml version="1.0" encoding="UTF-8"?>');
    xml.push('<CFe>');

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    const transactions = this.db.prepare(`
      SELECT * FROM transactions
      WHERE data_transacao BETWEEN ? AND ?
    `).all(startDateStr, endDateStr) as any[];

    transactions.forEach((tx) => {
      xml.push(`  <Transacao>`);
      xml.push(`    <Data>${tx.data_transacao}</Data>`);
      xml.push(`    <Valor>${tx.valor}</Valor>`);
      xml.push(`    <Descricao>${this.escapeXml(tx.descricao)}</Descricao>`);
      xml.push(`  </Transacao>`);
    });

    xml.push('</CFe>');
    return xml.join('\n');
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

/**
 * LGPD Compliance (Lei Geral de Proteção de Dados - Brazil)
 */
export class LGPDComplianceManager {
  constructor(private db: Database) {}

  /**
   * Export user personal data (right to be informed)
   */
  exportUserData(userId: string): object {
    const user = this.db.prepare(`
      SELECT id, nome, email, telefone, criado_em
      FROM usuarios
      WHERE id = ?
    `).get(userId);

    const accessLog = this.db.prepare(`
      SELECT * FROM audit_log
      WHERE usuario_id = ?
      ORDER BY timestamp DESC
      LIMIT 100
    `).all(userId);

    const dataProcessing = this.db.prepare(`
      SELECT DISTINCT tipo_dado, proposito_processamento
      FROM lgpd_data_processing
      WHERE usuario_id = ?
    `).all(userId);

    return {
      user,
      accessLog,
      dataProcessing,
      exportedAt: new Date().toISOString(),
      exportedBy: userId,
    };
  }

  /**
   * Request user deletion (right to be forgotten)
   */
  requestUserDeletion(userId: string, reason: string): { requestId: string; status: string } {
    const requestId = `DEL-${Date.now()}`;

    this.db.prepare(`
      INSERT INTO lgpd_deletion_requests
      (request_id, usuario_id, motivo, status, criado_em)
      VALUES (?, ?, ?, 'PENDING', datetime('now'))
    `).run(requestId, userId, reason);

    // Schedule deletion (30 days grace period)
    const deletionDate = new Date();
    deletionDate.setDate(deletionDate.getDate() + 30);

    this.db.prepare(`
      UPDATE lgpd_deletion_requests
      SET data_exclusao_agendada = ?
      WHERE request_id = ?
    `).run(deletionDate.toISOString(), requestId);

    return {
      requestId,
      status: 'PENDING',
    };
  }

  /**
   * Log consent for data processing
   */
  logConsent(userId: string, consentType: string, version: string): void {
    this.db.prepare(`
      INSERT INTO lgpd_consent_log
      (usuario_id, tipo_consentimento, versao, concedido_em)
      VALUES (?, ?, ?, datetime('now'))
    `).run(userId, consentType, version);
  }

  /**
   * Generate LGPD audit report
   */
  generateLGPDAuditReport(period: { start: Date; end: Date }): object {
    const startStr = period.start.toISOString().split('T')[0];
    const endStr = period.end.toISOString().split('T')[0];

    const consentRecords = this.db.prepare(`
      SELECT * FROM lgpd_consent_log
      WHERE concedido_em BETWEEN ? AND ?
    `).all(startStr, endStr);

    const deletionRequests = this.db.prepare(`
      SELECT * FROM lgpd_deletion_requests
      WHERE criado_em BETWEEN ? AND ?
    `).all(startStr, endStr);

    const dataBreaches = this.db.prepare(`
      SELECT * FROM lgpd_incident_log
      WHERE data_incidente BETWEEN ? AND ?
    `).all(startStr, endStr);

    return {
      period,
      consentRecords,
      deletionRequests,
      dataBreaches,
      reportedAt: new Date(),
    };
  }
}

/**
 * GDPR Compliance (General Data Protection Regulation - EU)
 */
export class GDPRComplianceManager {
  constructor(private db: Database) {}

  /**
   * Right to data portability
   */
  exportPersonalData(userId: string): string {
    const data = {
      user: this.db.prepare('SELECT * FROM usuarios WHERE id = ?').get(userId),
      transactions: this.db.prepare('SELECT * FROM transactions WHERE usuario_id = ?').all(userId),
      properties: this.db.prepare('SELECT * FROM propriedades WHERE criado_por = ?').all(userId),
      consents: this.db.prepare('SELECT * FROM gdpr_consents WHERE usuario_id = ?').all(userId),
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * Right to be forgotten (immediate deletion)
   */
  deleteUserData(userId: string): { deletedRecords: number; status: string } {
    this.db.prepare('BEGIN TRANSACTION').run();

    try {
      const audit = this.db.prepare(`
        INSERT INTO gdpr_deletion_log (usuario_id, data_exclusao, motivo)
        VALUES (?, datetime('now'), 'Right to be forgotten - GDPR Article 17')
      `).run(userId);

      // Pseudonymize instead of delete (for audit trail)
      this.db.prepare(`
        UPDATE usuarios
        SET email = 'GDPR-DELETED-' || hex(randomblob(4)),
            telefone = NULL,
            criado_em = NULL
        WHERE id = ?
      `).run(userId);

      this.db.prepare('COMMIT').run();

      return {
        deletedRecords: 1,
        status: 'COMPLETED',
      };
    } catch (error) {
      this.db.prepare('ROLLBACK').run();
      throw error;
    }
  }

  /**
   * Generate Data Processing Agreement
   */
  generateDPA(processorName: string): string {
    const dpa = `
DATA PROCESSING AGREEMENT
Generated: ${new Date().toISOString()}

1. DEFINITIONS
1.1 "Personal Data" means any information relating to an identified or identifiable natural person
1.2 "Processing" means any operation performed on Personal Data
1.3 "Processor" means ${processorName}

2. SUBJECT MATTER AND DURATION
2.1 The Processor processes Personal Data on behalf of the Controller
2.2 Duration: From date of signature until termination

3. NATURE AND PURPOSE OF PROCESSING
3.1 Categories of Data: Name, Email, Transaction History, IP Address
3.2 Categories of Data Subjects: Customers, Employees, Partners
3.3 Types of Processing: Data collection, storage, analysis, reporting

4. SECURITY MEASURES
4.1 Encryption at rest (AES-256)
4.2 Encryption in transit (TLS 1.3)
4.3 Access controls (RBAC)
4.4 Audit logging
4.5 Data backup and recovery

5. SUBPROCESSORS
5.1 List of authorized subprocessors maintained
5.2 30-day notice for subprocessor changes

6. DATA SUBJECT RIGHTS
6.1 Right to access (Art. 15)
6.2 Right to rectification (Art. 16)
6.3 Right to erasure (Art. 17)
6.4 Right to restrict processing (Art. 18)
6.5 Right to data portability (Art. 20)

7. TERM AND TERMINATION
7.1 Term: Until canceled by either party
7.2 Upon termination: Data deleted or returned within 30 days
    `;

    return dpa.trim();
  }
}

/**
 * Universal Audit Trail & Legal Hold
 */
export class AuditTrailManager {
  constructor(private db: Database) {}

  /**
   * Log all data changes
   */
  logChange(entry: Omit<AuditEntry, 'id'>): string {
    const id = `AUD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.db.prepare(`
      INSERT INTO audit_log
      (id, usuario_id, acao, tipo_recurso, id_recurso, valor_anterior,
       valor_novo, timestamp, endereco_ip, user_agent, status, motivo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      entry.userId,
      entry.action,
      entry.resourceType,
      entry.resourceId,
      JSON.stringify(entry.oldValue),
      JSON.stringify(entry.newValue),
      entry.timestamp,
      entry.ipAddress,
      entry.userAgent,
      entry.status,
      entry.reason || null
    );

    return id;
  }

  /**
   * Place legal hold on data
   */
  placeLegalHold(resourceId: string, reason: string, expiresAt: Date): string {
    const holdId = `HOLD-${Date.now()}`;

    this.db.prepare(`
      INSERT INTO legal_holds
      (hold_id, id_recurso, motivo, data_inicio, data_expiracao, status)
      VALUES (?, ?, ?, datetime('now'), ?, 'ACTIVE')
    `).run(holdId, resourceId, reason, expiresAt.toISOString());

    return holdId;
  }

  /**
   * Generate audit trail report
   */
  generateAuditTrailReport(filters: {
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    action?: string;
  }): AuditEntry[] {
    let query = 'SELECT * FROM audit_log WHERE 1=1';
    const params: any[] = [];

    if (filters.userId) {
      query += ' AND usuario_id = ?';
      params.push(filters.userId);
    }
    if (filters.startDate) {
      query += ' AND timestamp >= ?';
      params.push(filters.startDate.toISOString().split('T')[0]);
    }
    if (filters.endDate) {
      query += ' AND timestamp <= ?';
      params.push(filters.endDate.toISOString().split('T')[0]);
    }
    if (filters.action) {
      query += ' AND acao = ?';
      params.push(filters.action);
    }

    query += ' ORDER BY timestamp DESC LIMIT 10000';

    return this.db.prepare(query).all(...params) as AuditEntry[];
  }

  /**
   * Verify audit trail integrity (detect tampering)
   */
  verifyIntegrity(): { isValid: boolean; tamperedRecords: string[] } {
    const records = this.db.prepare(`
      SELECT id, timestamp, usuario_id, acao, hash_valor
      FROM audit_log
      WHERE hash_valor IS NOT NULL
      ORDER BY timestamp
    `).all() as any[];

    const tamperedRecords: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const previousHash = i > 0 ? records[i - 1].hash_valor : '';

      const expectedHash = createHash('sha256')
        .update(`${previousHash}${record.usuario_id}${record.acao}${record.timestamp}`)
        .digest('hex');

      if (record.hash_valor !== expectedHash) {
        tamperedRecords.push(record.id);
      }
    }

    return {
      isValid: tamperedRecords.length === 0,
      tamperedRecords,
    };
  }
}

/**
 * Tax Compliance & Reporting
 */
export class TaxComplianceManager {
  constructor(private db: Database) {}

  /**
   * Calculate tax obligations
   */
  calculateTaxObligations(period: { start: Date; end: Date }): object {
    const startStr = period.start.toISOString().split('T')[0];
    const endStr = period.end.toISOString().split('T')[0];

    const transactions = this.db.prepare(`
      SELECT tipo, SUM(valor) as total
      FROM transactions
      WHERE data_transacao BETWEEN ? AND ?
      GROUP BY tipo
    `).all(startStr, endStr) as any[];

    const income = transactions.find((t) => t.tipo === 'INCOME')?.total || 0;
    const expenses = transactions.find((t) => t.tipo === 'EXPENSE')?.total || 0;
    const grossProfit = income - expenses;

    const taxRates = {
      BR: { ir: 0.15, pis: 0.0165, cofins: 0.076 },
    };

    const taxes = {
      incomeTax: grossProfit * taxRates.BR.ir,
      pis: income * taxRates.BR.pis,
      cofins: income * taxRates.BR.cofins,
    };

    return {
      period,
      income,
      expenses,
      grossProfit,
      taxes,
      totalTaxes: Object.values(taxes).reduce((a: number, b: number) => a + b, 0),
    };
  }

  /**
   * Generate estimated tax payment schedule
   */
  generateTaxSchedule(year: number): Array<{ dueDate: string; amount: number; type: string }> {
    const schedule = [];
    const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

    months.forEach((month) => {
      const dueDate = new Date(year, month, 15);
      schedule.push({
        dueDate: dueDate.toISOString().split('T')[0],
        amount: 0, // To be calculated
        type: 'MONTHLY_ESTIMATION',
      });
    });

    return schedule;
  }
}

export {
  ComplianceReport,
  AuditEntry,
};
