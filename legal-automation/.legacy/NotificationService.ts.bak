/**
 * Notification Service
 * Handles email, SMS, and in-app notifications for legal events
 */

import { logger } from '@utils/logger';
import { eventService, EVENTS, EventPayload } from '@services/EventEmitterService';
import db from '@db/connection';
import nodemailer from 'nodemailer';

export interface Notification {
  id: string;
  userId: string;
  type: 'email' | 'sms' | 'push' | 'in-app';
  subject: string;
  message: string;
  metadata?: Record<string, any>;
  sentAt?: Date;
  status: 'pending' | 'sent' | 'failed';
  createdAt: Date;
}

export class NotificationService {
  private emailTransporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initializeEmailTransport();
    this.setupEventListeners();
  }

  /**
   * Inicializar transporte de email
   */
  private initializeEmailTransport(): void {
    try {
      // Configuração SMTP para produção
      this.emailTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      });

      logger.info('Email transporter inicializado');
    } catch (error) {
      logger.warn({ error }, 'Erro ao inicializar email transporter');
    }
  }

  /**
   * Configurar listeners para eventos
   */
  private setupEventListeners(): void {
    // Notificar quando petição é juntada
    eventService.on(EVENTS.PETITION_JUNTADA, (payload: EventPayload) => {
      this.handlePetitionJuntada(payload);
    });

    // Notificar quando polling timeout
    eventService.on(EVENTS.PETITION_POLLING_TIMEOUT, (payload: EventPayload) => {
      this.handlePetitionPollingTimeout(payload);
    });

    // Notificar quando petição é submetida
    eventService.on(EVENTS.PETITION_SUBMITTED, (payload: EventPayload) => {
      this.handlePetitionSubmitted(payload);
    });

    // Notificar quando petição é rejeitada
    eventService.on(EVENTS.PETITION_REJECTED, (payload: EventPayload) => {
      this.handlePetitionRejected(payload);
    });

    logger.info('Event listeners para notificações configurados');
  }

  /**
   * Manipular notificação de petição juntada
   */
  private async handlePetitionJuntada(payload: EventPayload): Promise<void> {
    try {
      const { petitionId, caseId, processNumber, protocolNumber, juntadaAt, pollCount } =
        payload.data;

      // Obter informações do advogado responsável
      const petitionResult = await db.query(
        `SELECT lawyer_id, lawyer_email, lawyer_name FROM petitions
         WHERE id = $1`,
        [petitionId],
      );

      if (petitionResult.rows.length === 0) {
        logger.warn(`Petição ${petitionId} não encontrada`);
        return;
      }

      const { lawyer_id, lawyer_email, lawyer_name } = petitionResult.rows[0];

      // Enviar email de confirmação
      const emailSubject = `✅ Petição Confirmada - Processo ${processNumber}`;
      const emailBody = `
        <h2>Petição Confirmada no Tribunal</h2>
        <p>Prezado(a) ${lawyer_name},</p>
        <p>A petição foi confirmada como recebida e juntada ao processo.</p>

        <h3>Detalhes da Confirmação:</h3>
        <ul>
          <li><strong>Processo:</strong> ${processNumber}</li>
          <li><strong>Protocolo:</strong> ${protocolNumber}</li>
          <li><strong>Confirmado em:</strong> ${new Date(juntadaAt).toLocaleString('pt-BR')}</li>
          <li><strong>Tentativas de confirmação:</strong> ${pollCount}</li>
          <li><strong>Tempo total de espera:</strong> ${pollCount * 5} minutos</li>
        </ul>

        <p>A petição está agora oficialmente registrada no tribunal e seus movimentos serão acompanhados automaticamente.</p>

        <p>Sistema de Automação Jurídica</p>
      `;

      await this.sendEmail({
        to: lawyer_email,
        subject: emailSubject,
        html: emailBody,
        metadata: {
          petitionId,
          caseId,
          processNumber,
          protocolNumber,
          eventType: 'petition.juntada',
        },
      });

      // Registrar notificação no banco
      await this.logNotification({
        userId: lawyer_id,
        type: 'email',
        subject: emailSubject,
        message: `Petição ${processNumber} confirmada no tribunal`,
        metadata: {
          petitionId,
          caseId,
          processNumber,
          protocolNumber,
          pollCount,
        },
      });

      logger.info(
        {
          petitionId,
          lawyerId: lawyer_id,
          lawyerEmail: lawyer_email,
        },
        'Notificação de juntada enviada',
      );
    } catch (error) {
      logger.error({ error, payload }, 'Erro ao enviar notificação de juntada');
    }
  }

  /**
   * Manipular notificação de timeout de polling
   */
  private async handlePetitionPollingTimeout(payload: EventPayload): Promise<void> {
    try {
      const { petitionId, caseId, processNumber, protocolNumber, pollCount, maxPolls } =
        payload.data;

      // Obter informações do advogado
      const petitionResult = await db.query(
        `SELECT lawyer_id, lawyer_email, lawyer_name FROM petitions
         WHERE id = $1`,
        [petitionId],
      );

      if (petitionResult.rows.length === 0) {
        return;
      }

      const { lawyer_id, lawyer_email, lawyer_name } = petitionResult.rows[0];

      const emailSubject = `⚠️ Confirmação Pendente - Processo ${processNumber}`;
      const emailBody = `
        <h2>Confirmação de Petição Pendente</h2>
        <p>Prezado(a) ${lawyer_name},</p>
        <p>A petição foi submetida ao tribunal, porém não conseguimos confirmar a juntada automática dentro do tempo limite.</p>

        <h3>Detalhes:</h3>
        <ul>
          <li><strong>Processo:</strong> ${processNumber}</li>
          <li><strong>Protocolo:</strong> ${protocolNumber}</li>
          <li><strong>Tentativas de confirmação:</strong> ${pollCount}/${maxPolls}</li>
          <li><strong>Tempo de espera:</strong> ${maxPolls * 5} minutos</li>
        </ul>

        <p><strong>Ação Necessária:</strong></p>
        <ul>
          <li>Acesse o sistema do tribunal para confirmar manualmente o recebimento</li>
          <li>Verifique o protocolo ${protocolNumber} no processo ${processNumber}</li>
          <li>Contacte o tribunal se houver dúvidas</li>
        </ul>

        <p>A petição continuará sendo monitorada periodicamente.</p>

        <p>Sistema de Automação Jurídica</p>
      `;

      await this.sendEmail({
        to: lawyer_email,
        subject: emailSubject,
        html: emailBody,
        metadata: {
          petitionId,
          caseId,
          processNumber,
          protocolNumber,
          eventType: 'petition.polling_timeout',
        },
      });

      // Registrar notificação
      await this.logNotification({
        userId: lawyer_id,
        type: 'email',
        subject: emailSubject,
        message: `Confirmação pendente para petição ${processNumber}`,
        metadata: {
          petitionId,
          caseId,
          processNumber,
          protocolNumber,
          pollCount,
          maxPolls,
        },
      });

      logger.info(
        {
          petitionId,
          lawyerId: lawyer_id,
        },
        'Notificação de timeout enviada',
      );
    } catch (error) {
      logger.error({ error, payload }, 'Erro ao enviar notificação de timeout');
    }
  }

  /**
   * Manipular notificação de petição submetida
   */
  private async handlePetitionSubmitted(payload: EventPayload): Promise<void> {
    try {
      const { petitionId, caseId, processNumber, protocolNumber, submittedAt } = payload.data;

      // Obter informações do advogado
      const petitionResult = await db.query(
        `SELECT lawyer_id, lawyer_email, lawyer_name FROM petitions
         WHERE id = $1`,
        [petitionId],
      );

      if (petitionResult.rows.length === 0) {
        return;
      }

      const { lawyer_id, lawyer_email, lawyer_name } = petitionResult.rows[0];

      const emailSubject = `📤 Petição Enviada - Processo ${processNumber}`;
      const emailBody = `
        <h2>Petição Enviada ao Tribunal</h2>
        <p>Prezado(a) ${lawyer_name},</p>
        <p>Sua petição foi enviada com sucesso ao tribunal.</p>

        <h3>Informações:</h3>
        <ul>
          <li><strong>Processo:</strong> ${processNumber}</li>
          <li><strong>Protocolo:</strong> ${protocolNumber}</li>
          <li><strong>Data/Hora do envio:</strong> ${new Date(submittedAt).toLocaleString('pt-BR')}</li>
        </ul>

        <p>A confirmação de recebimento (juntada) será monitorada automaticamente. Você receberá uma notificação assim que for confirmada.</p>

        <p>Sistema de Automação Jurídica</p>
      `;

      await this.sendEmail({
        to: lawyer_email,
        subject: emailSubject,
        html: emailBody,
        metadata: {
          petitionId,
          caseId,
          processNumber,
          eventType: 'petition.submitted',
        },
      });

      await this.logNotification({
        userId: lawyer_id,
        type: 'email',
        subject: emailSubject,
        message: `Petição ${processNumber} enviada ao tribunal`,
        metadata: {
          petitionId,
          caseId,
          processNumber,
          protocolNumber,
        },
      });

      logger.info(
        {
          petitionId,
          lawyerId: lawyer_id,
        },
        'Notificação de envio enviada',
      );
    } catch (error) {
      logger.error({ error, payload }, 'Erro ao enviar notificação de envio');
    }
  }

  /**
   * Manipular notificação de petição rejeitada
   */
  private async handlePetitionRejected(payload: EventPayload): Promise<void> {
    try {
      const { petitionId, caseId, processNumber, rejectionReason } = payload.data;

      // Obter informações do advogado
      const petitionResult = await db.query(
        `SELECT lawyer_id, lawyer_email, lawyer_name FROM petitions
         WHERE id = $1`,
        [petitionId],
      );

      if (petitionResult.rows.length === 0) {
        return;
      }

      const { lawyer_id, lawyer_email, lawyer_name } = petitionResult.rows[0];

      const emailSubject = `❌ Petição Rejeitada - Processo ${processNumber}`;
      const emailBody = `
        <h2>Petição Rejeitada</h2>
        <p>Prezado(a) ${lawyer_name},</p>
        <p>A petição foi rejeitada pelo tribunal.</p>

        <h3>Informações:</h3>
        <ul>
          <li><strong>Processo:</strong> ${processNumber}</li>
          <li><strong>Motivo da rejeição:</strong> ${rejectionReason || 'Não especificado'}</li>
        </ul>

        <p><strong>Ação Necessária:</strong></p>
        <ul>
          <li>Revise o conteúdo e formatação da petição</li>
          <li>Corrija os problemas identificados</li>
          <li>Reenvie a petição</li>
        </ul>

        <p>Para maiores detalhes, acesse o sistema.</p>

        <p>Sistema de Automação Jurídica</p>
      `;

      await this.sendEmail({
        to: lawyer_email,
        subject: emailSubject,
        html: emailBody,
        metadata: {
          petitionId,
          caseId,
          processNumber,
          eventType: 'petition.rejected',
        },
      });

      await this.logNotification({
        userId: lawyer_id,
        type: 'email',
        subject: emailSubject,
        message: `Petição ${processNumber} rejeitada pelo tribunal`,
        metadata: {
          petitionId,
          caseId,
          processNumber,
          rejectionReason,
        },
      });

      logger.info(
        {
          petitionId,
          lawyerId: lawyer_id,
        },
        'Notificação de rejeição enviada',
      );
    } catch (error) {
      logger.error({ error, payload }, 'Erro ao enviar notificação de rejeição');
    }
  }

  /**
   * Enviar email
   */
  private async sendEmail(options: {
    to: string;
    subject: string;
    html: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      if (!this.emailTransporter) {
        logger.warn('Email transporter não configurado');
        return;
      }

      await this.emailTransporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@legalauto.com',
        to: options.to,
        subject: options.subject,
        html: options.html,
      });

      logger.info({ to: options.to, subject: options.subject }, 'Email enviado com sucesso');
    } catch (error) {
      logger.error({ error, to: options.to }, 'Erro ao enviar email');
    }
  }

  /**
   * Registrar notificação no banco de dados
   */
  private async logNotification(notification: Omit<Notification, 'id' | 'createdAt' | 'sentAt'>): Promise<void> {
    try {
      await db.query(
        `INSERT INTO notifications
         (user_id, type, subject, message, metadata, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          notification.userId,
          notification.type,
          notification.subject,
          notification.message,
          JSON.stringify(notification.metadata || {}),
          notification.status,
          new Date(),
        ],
      );
    } catch (error) {
      logger.error({ error }, 'Erro ao registrar notificação no banco');
    }
  }

  /**
   * Obter notificações de um usuário
   */
  async getUserNotifications(userId: string, limit: number = 50): Promise<Notification[]> {
    try {
      const result = await db.query(
        `SELECT id, user_id as userId, type, subject, message, metadata, status, created_at as createdAt, sent_at as sentAt
         FROM notifications
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [userId, limit],
      );

      return result.rows.map((row: any) => ({
        ...row,
        metadata: JSON.parse(row.metadata || '{}'),
      }));
    } catch (error) {
      logger.error({ error, userId }, 'Erro ao obter notificações');
      return [];
    }
  }
}

export const notificationService = new NotificationService();
