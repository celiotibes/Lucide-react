import { logger } from '@utils/logger';
import { crmService } from '@services/CRMService';
import { persistenceService } from '@services/PersistenceService';

// ============================================================================
// INTIMATION CAPTURE SERVICE - Phase 2 - Legal Document & Deadline Processing
// ============================================================================

export interface IntimationDocument {
  id: string;
  clientId: string;
  documentType: 'citação' | 'intimação' | 'notificação' | 'mandado' | 'sentença' | 'acórdão' | 'outro';
  title: string;
  source: 'whatsapp' | 'email' | 'upload' | 'api' | 'manual';
  documentUrl: string;
  documentText: string;
  ocrProcessed: boolean;
  extractedData?: ExtractedDocumentData;
  createdAt: Date;
  processedAt?: Date;
}

export interface ExtractedDocumentData {
  caseNumber: string;
  court: string;
  judge: string;
  parties: Party[];
  deadlineDate: Date;
  deadlineType: string; // recurso, manifestação, resposta, comparecimento, etc
  description: string;
  legalBasis?: string;
  penalties?: string;
}

export interface Party {
  name: string;
  role: string; // plaintiff, defendant, appellant, respondent
  lawyerName?: string;
  lawyerOab?: string;
}

export interface CaseDeadline {
  id: string;
  clientId: string;
  caseNumber: string;
  court: string;
  documentId: string;
  deadlineDate: Date;
  deadlineType: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'missed' | 'extended';
  notificationsSent: NotificationRecord[];
  reminderDays: number[];
  completionDate?: Date;
  completionNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationRecord {
  id: string;
  type: 'email' | 'sms' | 'whatsapp' | 'push';
  sentAt: Date;
  recipient: string;
  status: 'sent' | 'failed' | 'read';
  message: string;
}

export interface OcrResult {
  text: string;
  confidence: number;
  detectedLanguage: string;
  documentType?: string;
}

export class IntimationCaptureService {
  private documents: Map<string, IntimationDocument> = new Map();
  private deadlines: Map<string, CaseDeadline> = new Map();
  private ocrCache: Map<string, OcrResult> = new Map();
  private readonly DEFAULT_REMINDERS = [30, 15, 7, 3, 1]; // days before deadline

  /**
   * Process uploaded document and extract deadlines
   */
  async processDocument(
    clientId: string,
    documentUrl: string,
    documentType: 'citação' | 'intimação' | 'notificação' | 'mandado' | 'sentença' | 'acórdão' | 'outro',
    source: 'whatsapp' | 'email' | 'upload' | 'api' | 'manual',
  ): Promise<IntimationDocument> {
    try {
      const documentId = `doc-${Date.now()}`;

      // Placeholder: Simulate OCR processing
      const ocrResult = await this.performOcr(documentUrl);

      const extractedData = await this.extractDeadlineData(ocrResult.text);

      const document: IntimationDocument = {
        id: documentId,
        clientId,
        documentType,
        title: `${documentType} - ${extractedData.caseNumber}`,
        source,
        documentUrl,
        documentText: ocrResult.text,
        ocrProcessed: true,
        extractedData,
        createdAt: new Date(),
        processedAt: new Date(),
      };

      this.documents.set(documentId, document);

      // Create deadline entry if deadline found
      if (extractedData.deadlineDate) {
        await this.createDeadline(clientId, documentId, extractedData);
      }

      logger.info(`Documento ${documentId} processado para cliente ${clientId}`);
      return document;
    } catch (error) {
      logger.error({ err: error }, `Erro ao processar documento para cliente ${clientId}`);
      throw error;
    }
  }

  /**
   * Simulate OCR processing
   */
  private async performOcr(documentUrl: string): Promise<OcrResult> {
    try {
      // Check cache first
      if (this.ocrCache.has(documentUrl)) {
        return this.ocrCache.get(documentUrl)!;
      }

      // Placeholder: Real implementation would use Google Vision, AWS Textract, etc.
      const mockOcrText = `
        PODER JUDICIÁRIO
        TRIBUNAL DE JUSTIÇA DO ESTADO DE SÃO PAULO

        AÇÃO: 0001234567890123456789
        JUÍZO: 1ª Vara Cível
        JUIZ: João Silva de Oliveira

        AUTOR: ACME COMÉRCIO LTDA
        Advogado: Dr. Roberto Santos - OAB/SP 123456

        RÉU: JOÃO PEDRO SANTOS
        Advogado: Dra. Maria Silva - OAB/SP 654321

        INTIMAÇÃO PARA APRESENTAÇÃO DE RESPOSTA
        Prazo: 15 (quinze) dias a contar do recebimento desta intimação
        Data Limite: 25/07/2026

        A parte é intimada para apresentar resposta no prazo legal,
        sob pena de revelia.
      `;

      const result: OcrResult = {
        text: mockOcrText,
        confidence: 0.95,
        detectedLanguage: 'pt-BR',
        documentType: 'intimação',
      };

      this.ocrCache.set(documentUrl, result);
      return result;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao realizar OCR');
      throw error;
    }
  }

  /**
   * Extract deadline information from OCR text
   */
  private async extractDeadlineData(ocrText: string): Promise<ExtractedDocumentData> {
    const lowerText = ocrText.toLowerCase();

    // Extract case number (simplified pattern)
    const caseNumberMatch = ocrText.match(/\d{7}\d{2}\d{8}\d{2}\d{8}/);
    const caseNumber = caseNumberMatch ? caseNumberMatch[0] : 'UNKNOWN';

    // Extract court
    const courtMatch = ocrText.match(/tribunal.*?(?:\n|$)/i);
    const court = courtMatch ? courtMatch[0].trim() : 'Unknown Court';

    // Extract judge
    const judgeMatch = ocrText.match(/juiz[a]?:?\s*([^\n]+)/i);
    const judge = judgeMatch ? judgeMatch[1].trim() : 'Unknown Judge';

    // Extract parties
    const parties = this.extractParties(ocrText);

    // Extract deadline type and date
    const { deadlineType, deadlineDate } = this.extractDeadlineInfo(ocrText);

    // Extract penalties
    const penaltiesMatch = ocrText.match(/pena.*?(?:\n|$)/i);
    const penalties = penaltiesMatch ? penaltiesMatch[0].trim() : 'N/A';

    return {
      caseNumber,
      court,
      judge,
      parties,
      deadlineDate,
      deadlineType,
      description: `${deadlineType} para ${caseNumber}`,
      penalties,
    };
  }

  /**
   * Extract parties from document text
   */
  private extractParties(text: string): Party[] {
    const parties: Party[] = [];

    // Extract authors
    const authorMatches = text.matchAll(/autor[a]?:?\s*([^\n]+)/gi);
    for (const match of authorMatches) {
      parties.push({
        name: match[1].trim(),
        role: 'plaintiff',
      });
    }

    // Extract defendants
    const defendantMatches = text.matchAll(/r[ée]u[a]?:?\s*([^\n]+)/gi);
    for (const match of defendantMatches) {
      parties.push({
        name: match[1].trim(),
        role: 'defendant',
      });
    }

    // Extract lawyers
    const lawyerMatches = text.matchAll(/advogad[ao]:?\s*([^-]+)-\s*oab\/([a-z]{2})\s*(\d+)/gi);
    for (const match of lawyerMatches) {
      if (parties.length > 0) {
        parties[parties.length - 1].lawyerName = match[1].trim();
        parties[parties.length - 1].lawyerOab = `${match[2]}/${match[3]}`;
      }
    }

    return parties;
  }

  /**
   * Extract deadline information from text
   */
  private extractDeadlineInfo(
    text: string,
  ): { deadlineType: string; deadlineDate: Date } {
    // Look for date patterns
    const dateMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    let deadlineDate = new Date();

    if (dateMatch) {
      deadlineDate = new Date(
        parseInt(dateMatch[3]),
        parseInt(dateMatch[2]) - 1,
        parseInt(dateMatch[1]),
      );
    }

    // Determine deadline type
    let deadlineType = 'resposta';

    if (text.match(/recurso/i)) deadlineType = 'recurso';
    if (text.match(/manifestação/i)) deadlineType = 'manifestação';
    if (text.match(/comparecimento/i)) deadlineType = 'comparecimento';
    if (text.match(/pagamento/i)) deadlineType = 'pagamento';
    if (text.match(/apelação/i)) deadlineType = 'apelação';

    return { deadlineType, deadlineDate };
  }

  /**
   * Create deadline tracking entry
   */
  private async createDeadline(
    clientId: string,
    documentId: string,
    extractedData: ExtractedDocumentData,
  ): Promise<CaseDeadline> {
    const deadlineId = `deadline-${Date.now()}`;

    const deadline: CaseDeadline = {
      id: deadlineId,
      clientId,
      caseNumber: extractedData.caseNumber,
      court: extractedData.court,
      documentId,
      deadlineDate: extractedData.deadlineDate,
      deadlineType: extractedData.deadlineType,
      description: extractedData.description,
      status: 'pending',
      notificationsSent: [],
      reminderDays: this.DEFAULT_REMINDERS,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.deadlines.set(deadlineId, deadline);

    // Schedule notifications
    await this.scheduleNotifications(deadline);

    logger.info(`Prazo criado: ${deadlineId} para cliente ${clientId}`);
    return deadline;
  }

  /**
   * Schedule notifications for deadline
   */
  private async scheduleNotifications(deadline: CaseDeadline): Promise<void> {
    try {
      for (const daysBefore of deadline.reminderDays) {
        const notificationDate = new Date(deadline.deadlineDate);
        notificationDate.setDate(notificationDate.getDate() - daysBefore);

        // Placeholder: Real implementation would use a job queue
        logger.debug(
          `Notificação agendada para ${deadline.clientId} em ${notificationDate}: ${daysBefore} dias antes`,
        );
      }
    } catch (error) {
      logger.warn({ err: error }, `Erro ao agendar notificações para ${deadline.id}`);
    }
  }

  /**
   * Get all deadlines for a client
   */
  async getClientDeadlines(clientId: string): Promise<CaseDeadline[]> {
    try {
      return Array.from(this.deadlines.values()).filter((d) => d.clientId === clientId);
    } catch (error) {
      logger.error({ err: error }, `Erro ao obter prazos do cliente ${clientId}`);
      throw error;
    }
  }

  /**
   * Get upcoming deadlines
   */
  async getUpcomingDeadlines(daysAhead: number = 30): Promise<CaseDeadline[]> {
    try {
      const now = new Date();
      const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

      return Array.from(this.deadlines.values())
        .filter(
          (d) =>
            d.status === 'pending' &&
            d.deadlineDate >= now &&
            d.deadlineDate <= futureDate,
        )
        .sort((a, b) => a.deadlineDate.getTime() - b.deadlineDate.getTime());
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter prazos próximos');
      throw error;
    }
  }

  /**
   * Get overdue deadlines
   */
  async getOverdueDeadlines(): Promise<CaseDeadline[]> {
    try {
      const now = new Date();

      return Array.from(this.deadlines.values())
        .filter((d) => d.status === 'pending' && d.deadlineDate < now)
        .sort((a, b) => a.deadlineDate.getTime() - b.deadlineDate.getTime());
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter prazos vencidos');
      throw error;
    }
  }

  /**
   * Update deadline status
   */
  async updateDeadlineStatus(
    deadlineId: string,
    status: 'pending' | 'in_progress' | 'completed' | 'missed' | 'extended',
    completionNotes?: string,
  ): Promise<CaseDeadline> {
    try {
      const deadline = this.deadlines.get(deadlineId);
      if (!deadline) {
        throw new Error(`Prazo ${deadlineId} não encontrado`);
      }

      deadline.status = status;
      deadline.updatedAt = new Date();

      if (status === 'completed' || status === 'missed') {
        deadline.completionDate = new Date();
        deadline.completionNotes = completionNotes;
      }

      this.deadlines.set(deadlineId, deadline);

      logger.info(`Prazo ${deadlineId} atualizado para ${status}`);
      return deadline;
    } catch (error) {
      logger.error({ err: error }, `Erro ao atualizar prazo ${deadlineId}`);
      throw error;
    }
  }

  /**
   * Get document by ID
   */
  async getDocument(documentId: string): Promise<IntimationDocument | null> {
    try {
      return this.documents.get(documentId) || null;
    } catch (error) {
      logger.error({ err: error }, `Erro ao obter documento ${documentId}`);
      throw error;
    }
  }

  /**
   * Get all documents for client
   */
  async getClientDocuments(clientId: string): Promise<IntimationDocument[]> {
    try {
      return Array.from(this.documents.values()).filter((d) => d.clientId === clientId);
    } catch (error) {
      logger.error({ err: error }, `Erro ao obter documentos do cliente ${clientId}`);
      throw error;
    }
  }

  /**
   * Send notification for deadline
   */
  async sendDeadlineNotification(
    deadlineId: string,
    recipientPhone: string,
    type: 'email' | 'sms' | 'whatsapp' | 'push' = 'whatsapp',
  ): Promise<NotificationRecord> {
    try {
      const deadline = this.deadlines.get(deadlineId);
      if (!deadline) {
        throw new Error(`Prazo ${deadlineId} não encontrado`);
      }

      const daysUntil = Math.ceil(
        (deadline.deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );

      const message =
        daysUntil > 0
          ? `⚖️ Lembrete: Você tem ${daysUntil} dias para ${deadline.deadlineType} no caso ${deadline.caseNumber}`
          : `🚨 URGENTE: Prazo vencido para ${deadline.deadlineType} no caso ${deadline.caseNumber}`;

      const notification: NotificationRecord = {
        id: `notif-${Date.now()}`,
        type,
        sentAt: new Date(),
        recipient: recipientPhone,
        status: 'sent',
        message,
      };

      deadline.notificationsSent.push(notification);
      this.deadlines.set(deadlineId, deadline);

      logger.info(`Notificação enviada para ${recipientPhone} sobre prazo ${deadlineId}`);
      return notification;
    } catch (error) {
      logger.error({ err: error }, `Erro ao enviar notificação para prazo ${deadlineId}`);
      throw error;
    }
  }

  /**
   * Get deadline statistics
   */
  getStatistics(): {
    totalDocuments: number;
    totalDeadlines: number;
    pendingDeadlines: number;
    overdueDeadlines: number;
    completedDeadlines: number;
    missedDeadlines: number;
  } {
    const deadlineArray = Array.from(this.deadlines.values());

    return {
      totalDocuments: this.documents.size,
      totalDeadlines: this.deadlines.size,
      pendingDeadlines: deadlineArray.filter((d) => d.status === 'pending').length,
      overdueDeadlines: deadlineArray.filter((d) => d.status === 'pending' && d.deadlineDate < new Date()).length,
      completedDeadlines: deadlineArray.filter((d) => d.status === 'completed').length,
      missedDeadlines: deadlineArray.filter((d) => d.status === 'missed').length,
    };
  }

  /**
   * Reset data (for testing)
   */
  reset(): void {
    this.documents.clear();
    this.deadlines.clear();
    this.ocrCache.clear();
    logger.info('Intimation Capture Service resetado');
  }
}

export const intimationCaptureService = new IntimationCaptureService();
