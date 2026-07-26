// src/modules/portal/portal.service.ts
import { Database } from '@/database';
import {
  PortalCaseView,
  BillingStatement,
  ClientNotification,
  ClientMessage,
  PortalAccess,
  PortalInvitation,
  ClientActivityLog,
} from './types';
import crypto from 'crypto';

export class PortalService {
  constructor(private db: Database) {}

  /**
   * Get accessible cases for client
   */
  async getClientCases(clientId: string): Promise<PortalCaseView[]> {
    const query = `
      SELECT
        c.id,
        c.case_number,
        c.title,
        c.status,
        c.summary,
        COALESCE(
          ROUND((
            SELECT COUNT(*) * 100 / NULLIF(
              (SELECT COUNT(*) FROM tasks WHERE case_id = c.id),
              0
            )
            FROM tasks
            WHERE case_id = c.id AND status = 'completed'
          )::INT, 0),
          0
        ) as progress,
        c.updated_at as last_update,
        (SELECT MIN(due_date) FROM deadlines WHERE case_id = c.id AND completed = FALSE) as next_deadline
      FROM cases c
      WHERE c.client_id = $1 AND c.status != 'archived'
      ORDER BY c.updated_at DESC
    `;

    const result = await this.db.query<PortalCaseView>(query, [clientId]);

    return result.rows;
  }

  /**
   * Get case details for client
   */
  async getClientCaseDetails(caseId: string, clientId: string): Promise<PortalCaseView | null> {
    // Check access
    const accessQuery = `
      SELECT * FROM portal_access
      WHERE case_id = $1 AND client_id = $2 AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `;

    const accessResult = await this.db.query(accessQuery, [caseId, clientId]);

    if (!accessResult.rows.length) {
      // Try direct client relationship
      const directQuery = `
        SELECT * FROM cases
        WHERE id = $1 AND client_id = $2
      `;

      const directResult = await this.db.query(directQuery, [caseId, clientId]);

      if (!directResult.rows.length) {
        return null;
      }
    }

    const caseQuery = `
      SELECT
        c.id,
        c.case_number,
        c.title,
        c.status,
        c.summary,
        COALESCE(
          ROUND((
            SELECT COUNT(*) * 100 / NULLIF(
              (SELECT COUNT(*) FROM tasks WHERE case_id = c.id),
              0
            )
            FROM tasks
            WHERE case_id = c.id AND status = 'completed'
          )::INT, 0),
          0
        ) as progress,
        c.updated_at as last_update,
        (SELECT MIN(due_date) FROM deadlines WHERE case_id = c.id AND completed = FALSE) as next_deadline
      FROM cases c
      WHERE c.id = $1
    `;

    const caseResult = await this.db.query<PortalCaseView>(caseQuery, [caseId]);

    return caseResult.rows[0] || null;
  }

  /**
   * Get case documents accessible to client
   */
  async getCaseDocuments(caseId: string, clientId: string) {
    const query = `
      SELECT
        d.id,
        d.name,
        d.document_type as type,
        d.created_at as uploaded_at,
        d.file_size as size,
        TRUE as viewable,
        TRUE as downloadable
      FROM documents d
      WHERE d.case_id = $1
      ORDER BY d.created_at DESC
    `;

    const result = await this.db.query(query, [caseId]);

    return result.rows;
  }

  /**
   * Get client billing statements
   */
  async getClientBillingStatements(clientId: string): Promise<BillingStatement[]> {
    const query = `
      SELECT
        i.id,
        i.case_id,
        i.id as invoice_number,
        i.total as amount,
        i.status,
        i.created_at as issued_date,
        i.due_date
      FROM invoices i
      WHERE i.client_id = $1
      ORDER BY i.created_at DESC
    `;

    const result = await this.db.query<BillingStatement>(query, [clientId]);

    return result.rows;
  }

  /**
   * Get billing statement details
   */
  async getBillingStatementDetails(invoiceId: string, clientId: string): Promise<BillingStatement | null> {
    const query = `
      SELECT
        i.id,
        i.case_id,
        i.id as invoice_number,
        i.total as amount,
        i.status,
        i.created_at as issued_date,
        i.due_date,
        i.notes
      FROM invoices i
      WHERE i.id = $1 AND i.client_id = $2
    `;

    const result = await this.db.query<BillingStatement>(query, [invoiceId, clientId]);

    return result.rows[0] || null;
  }

  /**
   * Get client notifications
   */
  async getClientNotifications(clientId: string, limit: number = 50): Promise<ClientNotification[]> {
    const query = `
      SELECT * FROM client_notifications
      WHERE client_id = $1
      ORDER BY received_at DESC
      LIMIT $2
    `;

    const result = await this.db.query<ClientNotification>(query, [clientId, limit]);

    return result.rows;
  }

  /**
   * Mark notification as read
   */
  async markNotificationAsRead(notificationId: string): Promise<void> {
    const query = `
      UPDATE client_notifications
      SET read = TRUE, read_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    await this.db.query(query, [notificationId]);
  }

  /**
   * Send message to lawyer
   */
  async sendMessage(
    clientId: string,
    lawyerId: string,
    caseId: string,
    subject: string,
    content: string,
    attachments?: string[]
  ): Promise<ClientMessage> {
    const query = `
      INSERT INTO client_messages (case_id, sender_id, recipient_id, subject, content, attachments)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await this.db.query<ClientMessage>(query, [
      caseId,
      clientId,
      lawyerId,
      subject,
      content,
      JSON.stringify(attachments || []),
    ]);

    return result.rows[0];
  }

  /**
   * Get messages for client
   */
  async getClientMessages(clientId: string): Promise<ClientMessage[]> {
    const query = `
      SELECT * FROM client_messages
      WHERE sender_id = $1 OR recipient_id = $1
      ORDER BY sent_at DESC
    `;

    const result = await this.db.query<ClientMessage>(query, [clientId]);

    return result.rows;
  }

  /**
   * Create portal access for client
   */
  async grantPortalAccess(
    clientId: string,
    caseId: string,
    grantedBy: string,
    options?: {
      expiresAt?: Date;
      documentAccess?: 'view' | 'download' | 'none';
      timelineAccess?: boolean;
      billingAccess?: boolean;
    }
  ): Promise<PortalAccess> {
    const query = `
      INSERT INTO portal_access (client_id, case_id, granted_by, expires_at, document_access, timeline_access, billing_access)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (client_id, case_id) DO UPDATE
      SET expires_at = EXCLUDED.expires_at, document_access = EXCLUDED.document_access
      RETURNING *
    `;

    const result = await this.db.query<PortalAccess>(query, [
      clientId,
      caseId,
      grantedBy,
      options?.expiresAt,
      options?.documentAccess || 'view',
      options?.timelineAccess !== false,
      options?.billingAccess !== false,
    ]);

    return result.rows[0];
  }

  /**
   * Send portal invitation
   */
  async sendPortalInvitation(
    caseId: string,
    invitedEmail: string,
    invitedBy: string,
    expiresIn: number = 7 // days
  ): Promise<PortalInvitation> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000);

    const query = `
      INSERT INTO portal_invitations (case_id, invited_email, invited_by, token, status, expires_at)
      VALUES ($1, $2, $3, $4, 'pending', $5)
      RETURNING *
    `;

    const result = await this.db.query<PortalInvitation>(query, [
      caseId,
      invitedEmail,
      invitedBy,
      token,
      expiresAt,
    ]);

    return result.rows[0];
  }

  /**
   * Accept portal invitation
   */
  async acceptPortalInvitation(token: string, clientId: string): Promise<PortalInvitation> {
    const query = `
      UPDATE portal_invitations
      SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP
      WHERE token = $1 AND expires_at > CURRENT_TIMESTAMP AND status = 'pending'
      RETURNING *
    `;

    const result = await this.db.query<PortalInvitation>(query, [token]);

    if (!result.rows.length) {
      throw new Error('Invalid or expired invitation');
    }

    const invitation = result.rows[0];

    // Grant access
    await this.grantPortalAccess(clientId, invitation.caseId, invitation.invitedBy);

    return invitation;
  }

  /**
   * Log client activity
   */
  async logActivity(
    clientId: string,
    caseId: string,
    action: string,
    options?: {
      details?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<ClientActivityLog> {
    const query = `
      INSERT INTO client_activity_log (user_id, case_id, action, details, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await this.db.query<ClientActivityLog>(query, [
      clientId,
      caseId,
      action,
      options?.details,
      options?.ipAddress,
      options?.userAgent,
    ]);

    return result.rows[0];
  }

  /**
   * Download case summary
   */
  async generateCaseSummary(caseId: string, clientId: string): Promise<string> {
    const caseDetails = await this.getClientCaseDetails(caseId, clientId);

    if (!caseDetails) {
      throw new Error('Case not found');
    }

    // Generate HTML/PDF summary
    const summary = `
      Case: ${caseDetails.caseNumber}
      Title: ${caseDetails.title}
      Status: ${caseDetails.status}
      Progress: ${caseDetails.progress}%
      Last Update: ${caseDetails.lastUpdate.toLocaleDateString('pt-BR')}
      Summary: ${caseDetails.summary}
    `;

    return summary;
  }

  /**
   * Get case timeline for client
   */
  async getCaseTimeline(caseId: string) {
    const query = `
      SELECT
        timestamp as date,
        description as title,
        type
      FROM case_updates
      WHERE case_id = $1
      ORDER BY timestamp ASC
    `;

    const result = await this.db.query(query, [caseId]);

    return result.rows;
  }
}
