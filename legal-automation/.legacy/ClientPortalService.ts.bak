import { pool } from '@/database/connection';
import { logger } from '@utils/logger';
import { AppError } from '@utils/errors';

interface CaseUpdate {
  id: string;
  caseId: string;
  updateType: string;
  title: string;
  description?: string;
  createdBy: string;
  visibility: string;
  createdAt: Date;
}

interface CaseDocument {
  id: string;
  caseId: string;
  documentId: string;
  documentName: string;
  documentType: string;
  documentUrl?: string;
  accessibleToClient: boolean;
  sharedAt: Date;
  expiresAt?: Date;
}

interface CaseMilestone {
  id: string;
  caseId: string;
  milestoneType: string;
  title: string;
  scheduledDate: Date;
  completedDate?: Date;
  description?: string;
  isCritical: boolean;
  createdAt: Date;
}

interface ClientMessage {
  id: string;
  caseId: string;
  senderId: string;
  receiverId: string;
  messageType: string;
  subject?: string;
  body: string;
  attachments: any[];
  read: boolean;
  readAt?: Date;
  createdAt: Date;
}

class ClientPortalService {
  async grantCaseAccess(
    clientId: string,
    caseId: string,
    lawyerId: string,
    accessLevel: string = 'view_only',
  ): Promise<any> {
    try {
      logger.info(`Granting case access to client ${clientId} for case ${caseId}`);

      const result = await pool.query(
        `INSERT INTO client_case_access (client_id, case_id, lawyer_id, access_level)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (client_id, case_id) DO UPDATE SET access_level = $4
         RETURNING *`,
        [clientId, caseId, lawyerId, accessLevel],
      );

      return result.rows[0];
    } catch (error) {
      logger.error({ err: error }, 'Error granting case access');
      throw new AppError(500, 'Erro ao conceder acesso ao caso');
    }
  }

  async getClientCases(clientId: string): Promise<any[]> {
    try {
      const result = await pool.query(
        `SELECT c.*, a.lawyer_id, a.access_level
         FROM cases c
         JOIN client_case_access a ON c.id = a.case_id
         WHERE a.client_id = $1
         ORDER BY c.updated_at DESC`,
        [clientId],
      );

      return result.rows;
    } catch (error) {
      logger.error({ err: error }, 'Error fetching client cases');
      throw new AppError(500, 'Erro ao buscar casos do cliente');
    }
  }

  async addCaseUpdate(
    caseId: string,
    updateType: string,
    title: string,
    description: string,
    createdBy: string,
    visibility: string = 'client_visible',
  ): Promise<CaseUpdate> {
    try {
      logger.info(`Adding update to case ${caseId}`);

      const result = await pool.query(
        `INSERT INTO case_updates (case_id, update_type, title, description, created_by, visibility)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [caseId, updateType, title, description, createdBy, visibility],
      );

      return this.mapRowToCaseUpdate(result.rows[0]);
    } catch (error) {
      logger.error({ err: error }, 'Error adding case update');
      throw new AppError(500, 'Erro ao adicionar atualização do caso');
    }
  }

  async getCaseUpdates(caseId: string, limit: number = 50): Promise<CaseUpdate[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM case_updates
         WHERE case_id = $1 AND visibility = 'client_visible'
         ORDER BY created_at DESC
         LIMIT $2`,
        [caseId, limit],
      );

      return result.rows.map(row => this.mapRowToCaseUpdate(row));
    } catch (error) {
      logger.error({ err: error }, 'Error fetching case updates');
      throw new AppError(500, 'Erro ao buscar atualizações do caso');
    }
  }

  async shareDocument(
    caseId: string,
    documentId: string,
    documentName: string,
    documentType: string,
    documentUrl?: string,
    expiresAt?: Date,
  ): Promise<CaseDocument> {
    try {
      logger.info(`Sharing document ${documentId} for case ${caseId}`);

      const result = await pool.query(
        `INSERT INTO case_documents_client (
          case_id, document_id, document_name, document_type, document_url, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [caseId, documentId, documentName, documentType, documentUrl || null, expiresAt || null],
      );

      return this.mapRowToCaseDocument(result.rows[0]);
    } catch (error) {
      logger.error({ err: error }, 'Error sharing document');
      throw new AppError(500, 'Erro ao compartilhar documento');
    }
  }

  async getAccessibleDocuments(caseId: string, limit: number = 100): Promise<CaseDocument[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM case_documents_client
         WHERE case_id = $1 AND accessible_to_client = true
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
         ORDER BY shared_at DESC
         LIMIT $2`,
        [caseId, limit],
      );

      return result.rows.map(row => this.mapRowToCaseDocument(row));
    } catch (error) {
      logger.error({ err: error }, 'Error fetching accessible documents');
      throw new AppError(500, 'Erro ao buscar documentos acessíveis');
    }
  }

  async addMilestone(
    caseId: string,
    milestoneType: string,
    title: string,
    scheduledDate: Date,
    description?: string,
    isCritical: boolean = false,
  ): Promise<CaseMilestone> {
    try {
      logger.info(`Adding milestone to case ${caseId}`);

      const result = await pool.query(
        `INSERT INTO case_milestones (
          case_id, milestone_type, title, scheduled_date, description, is_critical
        ) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [caseId, milestoneType, title, scheduledDate, description || null, isCritical],
      );

      return this.mapRowToCaseMilestone(result.rows[0]);
    } catch (error) {
      logger.error({ err: error }, 'Error adding milestone');
      throw new AppError(500, 'Erro ao adicionar marco do caso');
    }
  }

  async completeMilestone(milestoneId: string): Promise<CaseMilestone> {
    try {
      logger.info(`Completing milestone ${milestoneId}`);

      const result = await pool.query(
        `UPDATE case_milestones
         SET completed_date = CURRENT_DATE
         WHERE id = $1
         RETURNING *`,
        [milestoneId],
      );

      if (result.rows.length === 0) {
        throw new AppError(404, 'Marco não encontrado');
      }

      return this.mapRowToCaseMilestone(result.rows[0]);
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ err: error }, 'Error completing milestone');
      throw new AppError(500, 'Erro ao completar marco');
    }
  }

  async getCaseMilestones(caseId: string): Promise<CaseMilestone[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM case_milestones
         WHERE case_id = $1
         ORDER BY scheduled_date ASC`,
        [caseId],
      );

      return result.rows.map(row => this.mapRowToCaseMilestone(row));
    } catch (error) {
      logger.error({ err: error }, 'Error fetching milestones');
      throw new AppError(500, 'Erro ao buscar marcos do caso');
    }
  }

  async sendMessage(
    caseId: string,
    senderId: string,
    receiverId: string,
    messageType: string,
    body: string,
    subject?: string,
    attachments?: any[],
  ): Promise<ClientMessage> {
    try {
      logger.info(`Sending message from ${senderId} to ${receiverId} for case ${caseId}`);

      const result = await pool.query(
        `INSERT INTO client_messages (
          case_id, sender_id, receiver_id, message_type, subject, body, attachments
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          caseId,
          senderId,
          receiverId,
          messageType,
          subject || null,
          body,
          JSON.stringify(attachments || []),
        ],
      );

      return this.mapRowToClientMessage(result.rows[0]);
    } catch (error) {
      logger.error({ err: error }, 'Error sending message');
      throw new AppError(500, 'Erro ao enviar mensagem');
    }
  }

  async getMessages(
    caseId: string,
    userId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<ClientMessage[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM client_messages
         WHERE case_id = $1 AND (sender_id = $2 OR receiver_id = $2)
         ORDER BY created_at DESC
         LIMIT $3 OFFSET $4`,
        [caseId, userId, limit, offset],
      );

      return result.rows.map(row => this.mapRowToClientMessage(row));
    } catch (error) {
      logger.error({ err: error }, 'Error fetching messages');
      throw new AppError(500, 'Erro ao buscar mensagens');
    }
  }

  async markMessageAsRead(messageId: string): Promise<ClientMessage> {
    try {
      const result = await pool.query(
        `UPDATE client_messages
         SET read = true, read_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [messageId],
      );

      if (result.rows.length === 0) {
        throw new AppError(404, 'Mensagem não encontrada');
      }

      return this.mapRowToClientMessage(result.rows[0]);
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ err: error }, 'Error marking message as read');
      throw new AppError(500, 'Erro ao marcar mensagem como lida');
    }
  }

  async getUnreadMessageCount(userId: string): Promise<number> {
    try {
      const result = await pool.query(
        `SELECT COUNT(*) as count FROM client_messages
         WHERE receiver_id = $1 AND read = false`,
        [userId],
      );

      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error({ err: error }, 'Error counting unread messages');
      return 0;
    }
  }

  async addBillingEntry(
    caseId: string,
    billingDate: Date,
    description: string,
    totalAmount: number,
    billingType: string = 'hourly',
    hours?: number,
    hourlyRate?: number,
  ): Promise<any> {
    try {
      logger.info(`Adding billing entry for case ${caseId}`);

      const result = await pool.query(
        `INSERT INTO case_billing_timeline (
          case_id, billing_date, description, hours, hourly_rate, total_amount, billing_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [caseId, billingDate, description, hours || null, hourlyRate || null, totalAmount, billingType],
      );

      return result.rows[0];
    } catch (error) {
      logger.error({ err: error }, 'Error adding billing entry');
      throw new AppError(500, 'Erro ao adicionar lançamento de cobrança');
    }
  }

  async getCaseBillingHistory(caseId: string, limit: number = 100): Promise<any[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM case_billing_timeline
         WHERE case_id = $1
         ORDER BY billing_date DESC
         LIMIT $2`,
        [caseId, limit],
      );

      return result.rows;
    } catch (error) {
      logger.error({ err: error }, 'Error fetching billing history');
      throw new AppError(500, 'Erro ao buscar histórico de cobrança');
    }
  }

  async getCaseBillingTotal(caseId: string): Promise<number> {
    try {
      const result = await pool.query(
        `SELECT SUM(total_amount) as total FROM case_billing_timeline
         WHERE case_id = $1`,
        [caseId],
      );

      return result.rows[0].total ? parseFloat(result.rows[0].total) : 0;
    } catch (error) {
      logger.error({ err: error }, 'Error calculating billing total');
      return 0;
    }
  }

  async getCaseTimeline(caseId: string): Promise<any[]> {
    try {
      const updates = await pool.query(
        `SELECT 'update' as type, id, title as description, created_at
         FROM case_updates WHERE case_id = $1 AND visibility = 'client_visible'
         UNION ALL
         SELECT 'milestone' as type, id, title as description, CAST(scheduled_date AS TIMESTAMP)
         FROM case_milestones WHERE case_id = $1
         UNION ALL
         SELECT 'document' as type, id, document_name as description, shared_at as created_at
         FROM case_documents_client WHERE case_id = $1
         ORDER BY created_at DESC`,
        [caseId],
      );

      return updates.rows;
    } catch (error) {
      logger.error({ err: error }, 'Error fetching case timeline');
      throw new AppError(500, 'Erro ao buscar cronograma do caso');
    }
  }

  async getClientPreferences(clientId: string): Promise<any> {
    try {
      const result = await pool.query(
        `SELECT * FROM client_preferences WHERE client_id = $1`,
        [clientId],
      );

      if (result.rows.length === 0) {
        // Create default preferences
        return await this.createClientPreferences(clientId);
      }

      return result.rows[0];
    } catch (error) {
      logger.error({ err: error }, 'Error fetching client preferences');
      throw new AppError(500, 'Erro ao buscar preferências do cliente');
    }
  }

  async updateClientPreferences(
    clientId: string,
    preferences: {
      notificationFrequency?: string;
      digestEmailEnabled?: boolean;
      receiveDocumentNotifications?: boolean;
      receiveStatusUpdates?: boolean;
      receiveBillingUpdates?: boolean;
      themePreference?: string;
      language?: string;
    },
  ): Promise<any> {
    try {
      logger.info(`Updating preferences for client ${clientId}`);

      const result = await pool.query(
        `UPDATE client_preferences
         SET
           notification_frequency = COALESCE($2, notification_frequency),
           digest_email_enabled = COALESCE($3, digest_email_enabled),
           receive_document_notifications = COALESCE($4, receive_document_notifications),
           receive_status_updates = COALESCE($5, receive_status_updates),
           receive_billing_updates = COALESCE($6, receive_billing_updates),
           theme_preference = COALESCE($7, theme_preference),
           language = COALESCE($8, language)
         WHERE client_id = $1
         RETURNING *`,
        [
          clientId,
          preferences.notificationFrequency || null,
          preferences.digestEmailEnabled !== undefined ? preferences.digestEmailEnabled : null,
          preferences.receiveDocumentNotifications !== undefined
            ? preferences.receiveDocumentNotifications
            : null,
          preferences.receiveStatusUpdates !== undefined ? preferences.receiveStatusUpdates : null,
          preferences.receiveBillingUpdates !== undefined ? preferences.receiveBillingUpdates : null,
          preferences.themePreference || null,
          preferences.language || null,
        ],
      );

      return result.rows[0];
    } catch (error) {
      logger.error({ err: error }, 'Error updating preferences');
      throw new AppError(500, 'Erro ao atualizar preferências');
    }
  }

  private async createClientPreferences(clientId: string): Promise<any> {
    try {
      const result = await pool.query(
        `INSERT INTO client_preferences (client_id)
         VALUES ($1)
         RETURNING *`,
        [clientId],
      );

      return result.rows[0];
    } catch (error) {
      logger.error({ err: error }, 'Error creating default preferences');
      throw new AppError(500, 'Erro ao criar preferências padrão');
    }
  }

  async logPortalView(clientId: string, caseId: string, viewType: string, viewData?: any): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO client_portal_views (client_id, case_id, view_type, view_data)
         VALUES ($1, $2, $3, $4)`,
        [clientId, caseId, viewType, viewData ? JSON.stringify(viewData) : null],
      );
    } catch (error) {
      logger.debug({ err: error }, 'Error logging portal view');
    }
  }

  async getCaseStatusHistory(caseId: string, limit: number = 50): Promise<any[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM case_status_snapshot
         WHERE case_id = $1
         ORDER BY changed_at DESC
         LIMIT $2`,
        [caseId, limit],
      );

      return result.rows;
    } catch (error) {
      logger.error({ err: error }, 'Error fetching status history');
      throw new AppError(500, 'Erro ao buscar histórico de status');
    }
  }

  private mapRowToCaseUpdate(row: any): CaseUpdate {
    return {
      id: row.id,
      caseId: row.case_id,
      updateType: row.update_type,
      title: row.title,
      description: row.description,
      createdBy: row.created_by,
      visibility: row.visibility,
      createdAt: new Date(row.created_at),
    };
  }

  private mapRowToCaseDocument(row: any): CaseDocument {
    return {
      id: row.id,
      caseId: row.case_id,
      documentId: row.document_id,
      documentName: row.document_name,
      documentType: row.document_type,
      documentUrl: row.document_url,
      accessibleToClient: row.accessible_to_client,
      sharedAt: new Date(row.shared_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
    };
  }

  private mapRowToCaseMilestone(row: any): CaseMilestone {
    return {
      id: row.id,
      caseId: row.case_id,
      milestoneType: row.milestone_type,
      title: row.title,
      scheduledDate: new Date(row.scheduled_date),
      completedDate: row.completed_date ? new Date(row.completed_date) : undefined,
      description: row.description,
      isCritical: row.is_critical,
      createdAt: new Date(row.created_at),
    };
  }

  private mapRowToClientMessage(row: any): ClientMessage {
    return {
      id: row.id,
      caseId: row.case_id,
      senderId: row.sender_id,
      receiverId: row.receiver_id,
      messageType: row.message_type,
      subject: row.subject,
      body: row.body,
      attachments: typeof row.attachments === 'string' ? JSON.parse(row.attachments) : row.attachments,
      read: row.read,
      readAt: row.read_at ? new Date(row.read_at) : undefined,
      createdAt: new Date(row.created_at),
    };
  }
}

export const clientPortalService = new ClientPortalService();
