// src/modules/alerts/alerts.service.ts
import { Database } from '@/database';
import {
  Alert,
  AlertRule,
  AlertChannel,
  AlertType,
  AlertPriority,
  AlertStatus,
  DeadlineAlert,
  AlertPreference,
  PredictiveAlert,
} from './types';
import nodemailer from 'nodemailer';

export class AlertsService {
  private emailTransporter?: nodemailer.Transporter;

  constructor(private db: Database) {
    this.initializeEmailTransport();
  }

  /**
   * Initialize email transporter for sending alerts
   */
  private initializeEmailTransport(): void {
    const smtpConfig = {
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
          }
        : undefined,
    };

    if (process.env.SMTP_HOST) {
      this.emailTransporter = nodemailer.createTransport(smtpConfig);
    }
  }

  /**
   * Create and send an alert
   */
  async createAlert(
    userId: string,
    type: AlertType,
    priority: AlertPriority,
    title: string,
    message: string,
    options?: {
      caseId?: string;
      actionUrl?: string;
      metadata?: Record<string, any>;
      channels?: AlertChannel[];
      scheduleFor?: Date;
    }
  ): Promise<Alert> {
    const query = `
      INSERT INTO alerts (user_id, type, priority, title, message, case_id, action_url, metadata, status, schedule_for)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const result = await this.db.query<Alert>(query, [
      userId,
      type,
      priority,
      title,
      message,
      options?.caseId,
      options?.actionUrl,
      options?.metadata,
      'pending',
      options?.scheduleFor,
    ]);

    const alert = result.rows[0];

    // Send immediately if no schedule specified
    if (!options?.scheduleFor) {
      const channels = options?.channels || ['email', 'in_app'];
      await this.sendAlert(alert, channels);
    }

    return alert;
  }

  /**
   * Send alert through specified channels
   */
  async sendAlert(alert: Alert, channels: AlertChannel[]): Promise<void> {
    const sendPromises: Promise<any>[] = [];

    for (const channel of channels) {
      switch (channel) {
        case 'email':
          sendPromises.push(this.sendEmailAlert(alert));
          break;
        case 'sms':
          sendPromises.push(this.sendSmsAlert(alert));
          break;
        case 'push':
          sendPromises.push(this.sendPushAlert(alert));
          break;
        case 'in_app':
          // In-app alerts are already stored in database
          break;
      }
    }

    try {
      await Promise.all(sendPromises);

      // Update alert status to sent
      const updateQuery = `
        UPDATE alerts
        SET status = $1, sent_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `;

      await this.db.query(updateQuery, ['sent', alert.id]);
    } catch (error) {
      console.error(`[Alerts] Failed to send alert ${alert.id}:`, error);

      // Update alert status to failed
      const updateQuery = `
        UPDATE alerts
        SET status = $1, failure_reason = $2
        WHERE id = $3
      `;

      await this.db.query(updateQuery, ['failed', String(error), alert.id]);
    }
  }

  /**
   * Create and send deadline alerts
   */
  async createDeadlineAlerts(): Promise<DeadlineAlert[]> {
    // Query deadlines in the next 30 days
    const query = `
      SELECT
        d.id as deadline_id,
        c.id as case_id,
        c.title,
        d.due_date,
        d.title as deadline_title,
        EXTRACT(DAY FROM d.due_date - CURRENT_TIMESTAMP)::INT as days_until,
        c.lawyer_id,
        (
          SELECT COUNT(*)
          FROM deadlines d2
          WHERE d2.case_id = c.id AND d2.due_date <= d.due_date
        )::INT as total_deadlines,
        c.claim_amount
      FROM deadlines d
      JOIN cases c ON d.case_id = c.id
      WHERE
        d.completed = FALSE
        AND d.due_date > CURRENT_TIMESTAMP
        AND d.due_date <= CURRENT_TIMESTAMP + INTERVAL '30 days'
      ORDER BY days_until ASC
    `;

    const result = await this.db.query<any>(query);
    const deadlineAlerts: DeadlineAlert[] = [];

    for (const row of result.rows) {
      const riskLevel = this.calculateDeadlineRiskLevel(row.days_until);

      const alert = await this.createAlert(
        row.lawyer_id,
        'deadline',
        this.riskToAlertPriority(riskLevel),
        `Deadline Alert: ${row.deadline_title}`,
        `Case "${row.title}" has a deadline on ${row.due_date.toLocaleDateString()}. ${row.days_until} days remaining.`,
        {
          caseId: row.case_id,
          metadata: {
            deadline_id: row.deadline_id,
            days_until: row.days_until,
            risk_level: riskLevel,
          },
        }
      );

      deadlineAlerts.push({
        id: alert.id,
        caseId: row.case_id,
        deadlineId: row.deadline_id,
        title: row.deadline_title,
        dueDate: row.due_date,
        daysUntilDeadline: row.days_until,
        risk_level: riskLevel,
        related_cases: [row.case_id],
        suggested_actions: this.suggestDeadlineActions(riskLevel, row.days_until),
        createdAt: new Date(),
      });
    }

    return deadlineAlerts;
  }

  /**
   * Create predictive alerts based on case analysis
   */
  async createPredictiveAlerts(): Promise<PredictiveAlert[]> {
    // Query cases at risk of unfavorable outcomes
    const query = `
      SELECT
        c.id as case_id,
        c.title,
        c.lawyer_id,
        c.claim_amount,
        (
          SELECT COUNT(*) FROM ai_analysis_results
          WHERE case_id = c.id AND analysis_type = 'outcome_prediction'
          ORDER BY created_at DESC LIMIT 1
        ) as has_analysis
      FROM cases c
      WHERE c.status = 'open'
        AND c.created_at < CURRENT_TIMESTAMP - INTERVAL '90 days'
      LIMIT 20
    `;

    const result = await this.db.query<any>(query);
    const predictiveAlerts: PredictiveAlert[] = [];

    for (const row of result.rows) {
      // In production, use actual AI analysis results
      const prediction = this.generatePredictiveWarning(row);

      if (prediction) {
        const alert = await this.createAlert(
          row.lawyer_id,
          'deadline_at_risk',
          'high',
          `Predictive Alert: ${row.title}`,
          `Case may require attention: ${prediction.reasoning}`,
          {
            caseId: row.case_id,
            metadata: {
              confidence: prediction.confidence,
              recommended_actions: prediction.recommendedActions,
            },
          }
        );

        predictiveAlerts.push({
          id: alert.id,
          caseId: row.case_id,
          type: 'risk_assessment',
          prediction: prediction.prediction,
          confidence: prediction.confidence,
          reasoning: prediction.reasoning,
          recommendedActions: prediction.recommendedActions,
          scheduledFor: new Date(),
        });
      }
    }

    return predictiveAlerts;
  }

  /**
   * Get user's alerts
   */
  async getUserAlerts(userId: string, limit: number = 50): Promise<Alert[]> {
    const query = `
      SELECT * FROM alerts
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await this.db.query<Alert>(query, [userId, limit]);

    return result.rows;
  }

  /**
   * Get unread alerts count
   */
  async getUnreadAlertsCount(userId: string): Promise<number> {
    const query = `
      SELECT COUNT(*) as count FROM alerts
      WHERE user_id = $1 AND status IN ('pending', 'sent')
    `;

    const result = await this.db.query<{ count: number }>(query, [userId]);

    return parseInt(result.rows[0].count);
  }

  /**
   * Create alert rule
   */
  async createAlertRule(
    userId: string,
    name: string,
    type: AlertType,
    priority: AlertPriority,
    conditions: any[],
    channels: AlertChannel[],
    notifyBefore: number
  ): Promise<AlertRule> {
    const query = `
      INSERT INTO alert_rules (user_id, name, type, priority, conditions, channels, notify_before, active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
      RETURNING *
    `;

    const result = await this.db.query<AlertRule>(query, [
      userId,
      name,
      type,
      priority,
      JSON.stringify(conditions),
      JSON.stringify(channels),
      notifyBefore,
    ]);

    return result.rows[0];
  }

  /**
   * Get user's alert rules
   */
  async getUserAlertRules(userId: string): Promise<AlertRule[]> {
    const query = `
      SELECT * FROM alert_rules
      WHERE user_id = $1 AND active = TRUE
      ORDER BY created_at DESC
    `;

    const result = await this.db.query<AlertRule>(query, [userId]);

    return result.rows;
  }

  /**
   * Set alert preferences
   */
  async setAlertPreferences(
    userId: string,
    alertType: AlertType,
    enabled: boolean,
    preferredChannels: AlertChannel[]
  ): Promise<AlertPreference> {
    const query = `
      INSERT INTO alert_preferences (user_id, alert_type, enabled, preferred_channels)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, alert_type) DO UPDATE
      SET enabled = EXCLUDED.enabled, preferred_channels = EXCLUDED.preferred_channels
      RETURNING *
    `;

    const result = await this.db.query<AlertPreference>(query, [
      userId,
      alertType,
      enabled,
      JSON.stringify(preferredChannels),
    ]);

    return result.rows[0];
  }

  /**
   * Get alert preferences
   */
  async getAlertPreferences(userId: string): Promise<AlertPreference[]> {
    const query = `
      SELECT * FROM alert_preferences
      WHERE user_id = $1
      ORDER BY alert_type
    `;

    const result = await this.db.query<AlertPreference>(query, [userId]);

    return result.rows;
  }

  /**
   * Process scheduled alerts
   */
  async processScheduledAlerts(): Promise<number> {
    const query = `
      SELECT * FROM alerts
      WHERE status = 'pending'
        AND schedule_for IS NOT NULL
        AND schedule_for <= CURRENT_TIMESTAMP
      LIMIT 100
    `;

    const result = await this.db.query<Alert>(query);

    for (const alert of result.rows) {
      await this.sendAlert(alert, ['email', 'push']);
    }

    return result.rows.length;
  }

  // Private helper methods

  private async sendEmailAlert(alert: Alert): Promise<void> {
    if (!this.emailTransporter) {
      console.warn('[Alerts] Email transporter not configured');
      return;
    }

    // Get user email
    const userQuery = `SELECT email FROM users WHERE id = $1`;
    const userResult = await this.db.query<{ email: string }>(userQuery, [alert.userId]);

    if (!userResult.rows.length) {
      throw new Error(`User ${alert.userId} not found`);
    }

    const userEmail = userResult.rows[0].email;

    const mailOptions = {
      from: process.env.SMTP_FROM || 'noreply@legal-automation.local',
      to: userEmail,
      subject: alert.title,
      html: `
        <h2>${alert.title}</h2>
        <p>${alert.message}</p>
        ${
          alert.actionUrl
            ? `<p><a href="${alert.actionUrl}">View Details</a></p>`
            : ''
        }
        <p style="color: #999; font-size: 12px;">
          Priority: ${alert.priority}
        </p>
      `,
    };

    await this.emailTransporter.sendMail(mailOptions);
  }

  private async sendSmsAlert(alert: Alert): Promise<void> {
    // SMS implementation would go here (Twilio, AWS SNS, etc.)
    console.log(`[Alerts] SMS alert would be sent: ${alert.title}`);
  }

  private async sendPushAlert(alert: Alert): Promise<void> {
    // Push notification implementation would go here (Firebase, APNS, etc.)
    console.log(`[Alerts] Push alert would be sent: ${alert.title}`);
  }

  private calculateDeadlineRiskLevel(daysUntil: number): 'low' | 'medium' | 'high' | 'critical' {
    if (daysUntil <= 0) return 'critical';
    if (daysUntil <= 3) return 'high';
    if (daysUntil <= 7) return 'medium';
    return 'low';
  }

  private riskToAlertPriority(risk: string): AlertPriority {
    if (risk === 'critical') return 'critical';
    if (risk === 'high') return 'high';
    if (risk === 'medium') return 'medium';
    return 'low';
  }

  private suggestDeadlineActions(riskLevel: string, daysUntil: number): string[] {
    const actions: string[] = [];

    if (riskLevel === 'critical') {
      actions.push('Review case immediately');
      actions.push('Prepare response document');
      actions.push('Consult with co-counsel if needed');
    } else if (riskLevel === 'high') {
      actions.push('Start preparing necessary documents');
      actions.push('Gather evidence and materials');
    } else if (riskLevel === 'medium') {
      actions.push('Plan preparation timeline');
      actions.push('Assign tasks to team');
    }

    if (daysUntil <= 7) {
      actions.push('Send client status update');
    }

    return actions;
  }

  private generatePredictiveWarning(caseData: any): {
    prediction: string;
    confidence: number;
    reasoning: string;
    recommendedActions: string[];
  } | null {
    // In production, this would use actual AI analysis
    if (caseData.claim_amount > 1000000) {
      return {
        prediction: 'high_complexity_case',
        confidence: 75,
        reasoning: 'Large claim amount and extended timeline suggest complex proceedings',
        recommendedActions: [
          'Schedule status meeting with client',
          'Review appellate case law',
          'Consider settlement discussions',
        ],
      };
    }

    return null;
  }
}
