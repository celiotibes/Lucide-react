// src/modules/mobile/mobile.service.ts
import { Database } from '@/database';
import {
  MobileUser,
  MobileSession,
  MobileNotification,
  MobileCase,
  MobilePushPayload,
  SyncStatus,
  CaseUpdate,
  MobileDeadline,
} from './types';
import crypto from 'crypto';

export class MobileService {
  constructor(private db: Database) {}

  /**
   * Create or update mobile user session
   */
  async createMobileSession(
    userId: string,
    deviceId: string,
    userAgent: string,
    ipAddress: string
  ): Promise<MobileSession> {
    const accessToken = this.generateToken(32);
    const refreshToken = this.generateToken(64);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const query = `
      INSERT INTO mobile_sessions (user_id, access_token, refresh_token, expires_at, device_id, ip_address, user_agent, active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
      RETURNING *
    `;

    const result = await this.db.query<MobileSession>(query, [
      userId,
      accessToken,
      refreshToken,
      expiresAt,
      deviceId,
      ipAddress,
      userAgent,
    ]);

    return result.rows[0];
  }

  /**
   * Verify mobile session validity
   */
  async verifyMobileSession(
    userId: string,
    accessToken: string
  ): Promise<MobileSession | null> {
    const query = `
      SELECT * FROM mobile_sessions
      WHERE user_id = $1 AND access_token = $2 AND active = TRUE AND expires_at > CURRENT_TIMESTAMP
      LIMIT 1
    `;

    const result = await this.db.query<MobileSession>(query, [userId, accessToken]);

    return result.rows[0] || null;
  }

  /**
   * Refresh mobile session tokens
   */
  async refreshMobileSession(userId: string, refreshToken: string): Promise<MobileSession> {
    const query = `
      SELECT * FROM mobile_sessions
      WHERE user_id = $1 AND refresh_token = $2 AND active = TRUE
      LIMIT 1
    `;

    const result = await this.db.query<MobileSession>(query, [userId, refreshToken]);

    if (!result.rows.length) {
      throw new Error('Invalid refresh token');
    }

    const newAccessToken = this.generateToken(32);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const updateQuery = `
      UPDATE mobile_sessions
      SET access_token = $1, expires_at = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;

    const updated = await this.db.query<MobileSession>(updateQuery, [
      newAccessToken,
      expiresAt,
      result.rows[0].id,
    ]);

    return updated.rows[0];
  }

  /**
   * Register device push token for notifications
   */
  async registerDeviceToken(userId: string, deviceToken: string): Promise<void> {
    const query = `
      UPDATE mobile_users
      SET device_tokens = array_append(device_tokens, $1)
      WHERE id = $2
    `;

    await this.db.query(query, [deviceToken, userId]);
  }

  /**
   * Send push notification to user
   */
  async sendPushNotification(
    userId: string,
    payload: MobilePushPayload
  ): Promise<MobileNotification> {
    // Create notification record
    const notifQuery = `
      INSERT INTO mobile_notifications (user_id, type, title, message, case_id, action_url, read)
      VALUES ($1, $2, $3, $4, $5, $6, FALSE)
      RETURNING *
    `;

    const notifResult = await this.db.query<MobileNotification>(notifQuery, [
      userId,
      payload.data?.type || 'general',
      payload.title,
      payload.body,
      payload.caseId,
      payload.actionUrl,
    ]);

    // In production, send to Firebase Cloud Messaging or Apple Push Notification service
    // For now, just log the intent
    console.log(`[Mobile] Push notification sent to ${userId}:`, payload);

    return notifResult.rows[0];
  }

  /**
   * Get user's mobile notifications
   */
  async getUserNotifications(userId: string, limit: number = 50): Promise<MobileNotification[]> {
    const query = `
      SELECT * FROM mobile_notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await this.db.query<MobileNotification>(query, [userId, limit]);

    return result.rows;
  }

  /**
   * Mark notification as read
   */
  async markNotificationAsRead(notificationId: string): Promise<void> {
    const query = `
      UPDATE mobile_notifications
      SET read = TRUE, read_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    await this.db.query(query, [notificationId]);
  }

  /**
   * Get mobile case summary for quick display
   */
  async getMobileCasesList(userId: string): Promise<MobileCase[]> {
    const query = `
      SELECT
        c.id,
        c.case_number,
        c.title,
        c.status,
        c.summary,
        c.plaintiff,
        c.defendant,
        c.claim_amount,
        (SELECT MIN(due_date) FROM deadlines WHERE case_id = c.id AND completed = FALSE) as next_deadline,
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
        (SELECT COUNT(*) FROM documents WHERE case_id = c.id) as document_count,
        (SELECT COUNT(*) FROM time_entries WHERE case_id = c.id) as time_entry_count,
        c.updated_at as last_updated
      FROM cases c
      WHERE c.lawyer_id = $1 OR c.client_id = $1
      ORDER BY c.updated_at DESC
      LIMIT 20
    `;

    const result = await this.db.query<MobileCase>(query, [userId]);

    return result.rows;
  }

  /**
   * Get mobile case details with recent updates
   */
  async getMobileCaseDetails(caseId: string, userId: string): Promise<MobileCase | null> {
    const query = `
      SELECT
        c.id,
        c.case_number,
        c.title,
        c.status,
        c.summary,
        c.plaintiff,
        c.defendant,
        c.claim_amount,
        (SELECT MIN(due_date) FROM deadlines WHERE case_id = c.id AND completed = FALSE) as next_deadline,
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
        (SELECT COUNT(*) FROM documents WHERE case_id = c.id) as document_count,
        (SELECT COUNT(*) FROM time_entries WHERE case_id = c.id) as time_entry_count,
        c.updated_at as last_updated
      FROM cases c
      WHERE c.id = $1 AND (c.lawyer_id = $2 OR c.client_id = $2)
      LIMIT 1
    `;

    const result = await this.db.query<MobileCase>(query, [caseId, userId]);

    return result.rows[0] || null;
  }

  /**
   * Get upcoming deadlines for mobile display
   */
  async getUpcomingDeadlines(userId: string, daysAhead: number = 30): Promise<MobileDeadline[]> {
    const query = `
      SELECT
        d.id,
        d.case_id,
        d.title,
        d.description,
        d.due_date,
        d.reminder_days,
        d.reminder_sent,
        d.completed,
        d.completed_at,
        d.type
      FROM deadlines d
      JOIN cases c ON d.case_id = c.id
      WHERE (c.lawyer_id = $1 OR c.client_id = $1)
        AND d.completed = FALSE
        AND d.due_date <= CURRENT_TIMESTAMP + INTERVAL '1 day' * $2
        AND d.due_date > CURRENT_TIMESTAMP
      ORDER BY d.due_date ASC
      LIMIT 10
    `;

    const result = await this.db.query<MobileDeadline>(query, [userId, daysAhead]);

    return result.rows;
  }

  /**
   * Record case updates for mobile feed
   */
  async recordCaseUpdate(
    caseId: string,
    type: string,
    description: string,
    actor: string,
    metadata?: Record<string, any>
  ): Promise<CaseUpdate> {
    const query = `
      INSERT INTO case_updates (case_id, type, description, actor, metadata)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const result = await this.db.query<CaseUpdate>(query, [caseId, type, description, actor, metadata]);

    return result.rows[0];
  }

  /**
   * Get case updates feed
   */
  async getCaseUpdatesFeed(caseId: string, limit: number = 50): Promise<CaseUpdate[]> {
    const query = `
      SELECT * FROM case_updates
      WHERE case_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `;

    const result = await this.db.query<CaseUpdate>(query, [caseId, limit]);

    return result.rows;
  }

  /**
   * Initialize sync status for offline mode
   */
  async initializeSyncStatus(userId: string): Promise<SyncStatus> {
    const existingQuery = `
      SELECT * FROM sync_status
      WHERE user_id = $1
      LIMIT 1
    `;

    const existing = await this.db.query<SyncStatus>(existingQuery, [userId]);

    if (existing.rows.length) {
      return existing.rows[0];
    }

    const query = `
      INSERT INTO sync_status (user_id, last_sync_time, pending_changes, sync_in_progress, retry_count)
      VALUES ($1, CURRENT_TIMESTAMP, 0, FALSE, 0)
      RETURNING *
    `;

    const result = await this.db.query<SyncStatus>(query, [userId]);

    return result.rows[0];
  }

  /**
   * Update sync status
   */
  async updateSyncStatus(userId: string, pendingChanges: number): Promise<SyncStatus> {
    const query = `
      UPDATE sync_status
      SET last_sync_time = CURRENT_TIMESTAMP, pending_changes = $1, retry_count = 0
      WHERE user_id = $2
      RETURNING *
    `;

    const result = await this.db.query<SyncStatus>(query, [pendingChanges, userId]);

    return result.rows[0];
  }

  /**
   * Clear all notifications for a user
   */
  async clearNotifications(userId: string): Promise<void> {
    const query = `
      UPDATE mobile_notifications
      SET read = TRUE, read_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND read = FALSE
    `;

    await this.db.query(query, [userId]);
  }

  /**
   * Get app configuration
   */
  async getAppConfig() {
    return {
      apiBaseUrl: process.env.API_BASE_URL || 'https://api.legal-automation.local',
      appVersion: '1.0.0',
      minVersionRequired: '1.0.0',
      features: {
        offlineMode: true,
        biometric: true,
        documentScan: true,
        voiceNotes: false,
      },
      theme: {
        primary: '#1a5490',
        secondary: '#f26f52',
        accent: '#ffd700',
      },
    };
  }

  private generateToken(length: number): string {
    return crypto.randomBytes(length).toString('hex').substring(0, length);
  }
}
