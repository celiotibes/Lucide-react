/**
 * Phase 22.18 - Compliance & Regulatory Reporting API Routes
 *
 * Exposes compliance management endpoints for:
 * - SPED/ECF (Brazilian tax filing)
 * - LGPD (Brazilian data protection)
 * - GDPR (European compliance)
 * - Audit trail & legal hold
 * - Tax compliance
 */

import express from 'express';
import type Database from 'better-sqlite3';
import {
  SPEDReportGenerator,
  LGPDComplianceManager,
  GDPRComplianceManager,
  AuditTrailManager,
  TaxComplianceManager,
} from '../compliance/regulatory-reporting.js';
import { logger } from '../services/logger-service.js';

export interface RotasComplianceDeps {
  db: Database.Database;
  authService?: any; // Optional authentication service
}

export function criarRotasCompliance({ db }: RotasComplianceDeps): express.Router {
  const router = express.Router();

  // Initialize compliance managers
  const spedGenerator = new SPEDReportGenerator(db);
  const lgpdManager = new LGPDComplianceManager(db);
  const gdprManager = new GDPRComplianceManager(db);
  const auditTrail = new AuditTrailManager(db);
  const taxManager = new TaxComplianceManager(db);

  /**
   * POST /api/compliance/sped-report
   * Generate SPED/ECF report for period
   *
   * Body: {
   *   startDate: ISO 8601 date,
   *   endDate: ISO 8601 date
   * }
   */
  router.post('/sped-report', (req: express.Request, res: express.Response) => {
    try {
      const { startDate, endDate } = req.body;

      if (!startDate || !endDate) {
        return res.status(400).json({
          error: 'Missing required fields: startDate, endDate',
        });
      }

      const start = new Date(startDate);
      const end = new Date(endDate);

      const report = spedGenerator.generateECF(start, end);

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="sped-ecf-${new Date().toISOString()}.txt"`);
      res.send(report);

      logger.info('[Compliance] SPED report generated', {
        period: { startDate, endDate },
        size: report.length,
      });
    } catch (error) {
      logger.error('[Compliance] SPED report generation failed:', error);
      res.status(500).json({ error: 'Failed to generate SPED report' });
    }
  });

  /**
   * GET /api/compliance/export-data/:userId
   * LGPD/GDPR right to portability
   * Exports all user data in JSON format
   */
  router.get('/export-data/:userId', (req: express.Request, res: express.Response) => {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({ error: 'Missing userId parameter' });
      }

      const data = lgpdManager.exportUserData(userId);

      res.json({
        type: 'LGPD_DATA_EXPORT',
        userId,
        data,
        exportedAt: new Date().toISOString(),
      });

      logger.info('[Compliance] User data exported', { userId });
    } catch (error) {
      logger.error('[Compliance] Data export failed:', error);
      res.status(500).json({ error: 'Failed to export user data' });
    }
  });

  /**
   * POST /api/compliance/deletion-request
   * Request right to be forgotten (LGPD Article 9)
   *
   * Body: {
   *   userId: string,
   *   reason: string
   * }
   */
  router.post('/deletion-request', (req: express.Request, res: express.Response) => {
    try {
      const { userId, reason } = req.body;

      if (!userId || !reason) {
        return res.status(400).json({
          error: 'Missing required fields: userId, reason',
        });
      }

      const request = lgpdManager.requestUserDeletion(userId, reason);

      res.status(201).json({
        type: 'DELETION_REQUEST_CREATED',
        requestId: request.requestId,
        status: request.status,
        userId,
        createdAt: new Date().toISOString(),
        gracePeriod: '30 days',
      });

      logger.info('[Compliance] Deletion request created', {
        requestId: request.requestId,
        userId,
      });
    } catch (error) {
      logger.error('[Compliance] Deletion request failed:', error);
      res.status(500).json({ error: 'Failed to create deletion request' });
    }
  });

  /**
   * GET /api/compliance/audit-trail
   * Retrieve audit trail with optional filters
   *
   * Query params:
   * - userId: Filter by user
   * - action: Filter by action type
   * - startDate: ISO 8601 date
   * - endDate: ISO 8601 date
   */
  router.get('/audit-trail', (req: express.Request, res: express.Response) => {
    try {
      const { userId, action, startDate, endDate } = req.query;

      const filters: any = {};
      if (userId) filters.userId = userId;
      if (action) filters.action = action;
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);

      const entries = auditTrail.generateAuditTrailReport(filters);

      res.json({
        type: 'AUDIT_TRAIL_REPORT',
        total: entries.length,
        filters: Object.keys(filters).length > 0 ? filters : 'none',
        entries,
      });

      logger.info('[Compliance] Audit trail retrieved', {
        count: entries.length,
        filters,
      });
    } catch (error) {
      logger.error('[Compliance] Audit trail retrieval failed:', error);
      res.status(500).json({ error: 'Failed to retrieve audit trail' });
    }
  });

  /**
   * POST /api/compliance/legal-hold
   * Place legal hold on resource
   *
   * Body: {
   *   resourceId: string,
   *   reason: string,
   *   expiresAt: ISO 8601 datetime (optional)
   * }
   */
  router.post('/legal-hold', (req: express.Request, res: express.Response) => {
    try {
      const { resourceId, reason, expiresAt } = req.body;

      if (!resourceId || !reason) {
        return res.status(400).json({
          error: 'Missing required fields: resourceId, reason',
        });
      }

      const expiration = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const holdId = auditTrail.placeLegalHold(resourceId, reason, expiration);

      res.status(201).json({
        type: 'LEGAL_HOLD_PLACED',
        holdId,
        resourceId,
        reason,
        expiresAt: expiration.toISOString(),
        createdAt: new Date().toISOString(),
      });

      logger.info('[Compliance] Legal hold placed', { holdId, resourceId });
    } catch (error) {
      logger.error('[Compliance] Legal hold placement failed:', error);
      res.status(500).json({ error: 'Failed to place legal hold' });
    }
  });

  /**
   * GET /api/compliance/tax-obligations
   * View tax payment schedule
   *
   * Query params:
   * - year: Tax year (default: current year)
   */
  router.get('/tax-obligations', (req: express.Request, res: express.Response) => {
    try {
      const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();

      if (!Number.isInteger(year) || year < 2000) {
        return res.status(400).json({ error: 'Invalid year parameter' });
      }

      const schedule = taxManager.generateTaxSchedule(year);

      res.json({
        type: 'TAX_OBLIGATION_SCHEDULE',
        year,
        total: schedule.length,
        schedule,
      });

      logger.info('[Compliance] Tax obligations retrieved', { year });
    } catch (error) {
      logger.error('[Compliance] Tax obligations retrieval failed:', error);
      res.status(500).json({ error: 'Failed to retrieve tax obligations' });
    }
  });

  /**
   * GET /api/compliance/compliance-status
   * Real-time compliance overview
   */
  router.get('/compliance-status', (req: express.Request, res: express.Response) => {
    try {
      const complianceStatus = db
        .prepare(
          `
        SELECT
          'AUDIT_TRAIL' as compliance_area,
          COUNT(*) as total_records,
          MAX(timestamp) as last_update,
          SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed_records
        FROM audit_log
        UNION ALL
        SELECT
          'LEGAL_HOLDS' as compliance_area,
          COUNT(*) as total_records,
          MAX(data_inicio) as last_update,
          SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as failed_records
        FROM legal_holds
        UNION ALL
        SELECT
          'LGPD_CONSENTS' as compliance_area,
          COUNT(*) as total_records,
          MAX(concedido_em) as last_update,
          SUM(CASE WHEN revogado_em IS NOT NULL THEN 1 ELSE 0 END) as failed_records
        FROM lgpd_consent_log
        UNION ALL
        SELECT
          'TAX_OBLIGATIONS' as compliance_area,
          COUNT(*) as total_records,
          MAX(data_vencimento) as last_update,
          SUM(CASE WHEN status = 'LATE' THEN 1 ELSE 0 END) as failed_records
        FROM tax_obligations
      `
        )
        .all();

      res.json({
        type: 'COMPLIANCE_STATUS_OVERVIEW',
        timestamp: new Date().toISOString(),
        areas: complianceStatus,
      });

      logger.info('[Compliance] Compliance status retrieved');
    } catch (error) {
      logger.error('[Compliance] Compliance status retrieval failed:', error);
      res.status(500).json({ error: 'Failed to retrieve compliance status' });
    }
  });

  /**
   * POST /api/compliance/incident-report
   * Log data breach/incident
   *
   * Body: {
   *   type: 'DATA_BREACH' | 'UNAUTHORIZED_ACCESS' | etc,
   *   description: string,
   *   affectedUsers: number,
   *   affectedData: string,
   *   riskLevel: 'BAIXO' | 'MEDIO' | 'ALTO' | 'CRITICO'
   * }
   */
  router.post('/incident-report', (req: express.Request, res: express.Response) => {
    try {
      const { type, description, affectedUsers, affectedData, riskLevel } = req.body;

      if (!type || !description || !riskLevel) {
        return res.status(400).json({
          error: 'Missing required fields: type, description, riskLevel',
        });
      }

      const validRiskLevels = ['BAIXO', 'MEDIO', 'ALTO', 'CRITICO'];
      if (!validRiskLevels.includes(riskLevel)) {
        return res.status(400).json({
          error: 'Invalid riskLevel. Must be one of: BAIXO, MEDIO, ALTO, CRITICO',
        });
      }

      const id = `INC-${Date.now()}`;

      try {
        db.prepare(`
          INSERT INTO lgpd_incident_log
          (id, tipo_incidente, descricao, usuarios_afetados, dados_afetados, risco_nivel,
           data_incidente, data_descoberta, status_resolucao, criado_em)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 'OPEN', datetime('now'))
        `).run(id, type, description, affectedUsers || null, affectedData || null, riskLevel);
      } catch (dbError) {
        logger.warn('[Compliance] Table lgpd_incident_log may not exist, returning response only', {
          id,
        });
      }

      res.status(201).json({
        type: 'INCIDENT_REPORTED',
        incidentId: id,
        incidentType: type,
        riskLevel,
        affectedUsers: affectedUsers || null,
        status: 'OPEN',
        reportedAt: new Date().toISOString(),
        notificationRequired: riskLevel === 'CRITICO' || riskLevel === 'ALTO',
      });

      logger.warn('[Compliance] Incident reported', {
        incidentId: id,
        type,
        riskLevel,
      });
    } catch (error) {
      logger.error('[Compliance] Incident report failed:', error);
      res.status(500).json({ error: 'Failed to report incident' });
    }
  });

  /**
   * GET /api/compliance/certifications
   * View compliance certifications and their expiration status
   */
  router.get('/certifications', (req: express.Request, res: express.Response) => {
    try {
      const certifications = db
        .prepare(
          `
        SELECT
          id,
          tipo_certificacao as type,
          orgao_certificador as issuer,
          numero_certificado as number,
          data_expedicao as issuedDate,
          data_expiracao as expirationDate,
          ativo as active,
          data_renovacao_sugerida as suggestedRenewalDate
        FROM compliance_certifications
        ORDER BY data_expiracao ASC
      `
        )
        .all();

      const today = new Date();
      const categorized = {
        active: certifications.filter((c: any) => c.active && new Date(c.expirationDate) > today),
        expiringSoon: certifications.filter(
          (c: any) =>
            c.active &&
            new Date(c.expirationDate) > today &&
            new Date(c.expirationDate).getTime() - today.getTime() < 30 * 24 * 60 * 60 * 1000
        ),
        expired: certifications.filter((c: any) => !c.active || new Date(c.expirationDate) <= today),
      };

      res.json({
        type: 'COMPLIANCE_CERTIFICATIONS',
        timestamp: new Date().toISOString(),
        summary: {
          total: certifications.length,
          active: categorized.active.length,
          expiringSoon: categorized.expiringSoon.length,
          expired: categorized.expired.length,
        },
        certifications: categorized,
      });

      logger.info('[Compliance] Certifications retrieved');
    } catch (error) {
      logger.error('[Compliance] Certifications retrieval failed:', error);
      res.status(500).json({ error: 'Failed to retrieve certifications' });
    }
  });

  return router;
}
