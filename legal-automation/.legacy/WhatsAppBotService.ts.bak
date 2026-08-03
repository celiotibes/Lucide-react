import { logger } from '@utils/logger';
import { crmService } from '@services/CRMService';
import { persistenceService } from '@services/PersistenceService';

// ============================================================================
// WHATSAPP BOT SERVICE - Phase 1.1 - Automated Client Onboarding
// ============================================================================

export interface WhatsAppMessage {
  id: string;
  phoneNumber: string;
  senderName: string;
  messageText: string;
  messageType: 'text' | 'document' | 'image' | 'audio';
  attachmentUrl?: string;
  attachmentType?: string;
  timestamp: Date;
  processedAt?: Date;
  conversationContext?: string;
}

export interface ConversationState {
  clientId: string;
  phoneNumber: string;
  stage: 'greeting' | 'qualification' | 'document_collection' | 'payment' | 'completed' | 'handoff';
  documentCollected: {
    rg?: boolean;
    cpf?: boolean;
    comprovante?: boolean;
    procuração?: boolean;
    outros?: string[];
  };
  caseDetails?: {
    type?: string;
    description?: string;
    complexity?: string;
    urgency?: string;
  };
  paymentLink?: string;
  lastInteractionAt: Date;
  agentHandoffRequired?: boolean;
}

export interface BotResponse {
  messageId: string;
  phoneNumber: string;
  responseText: string;
  suggestedActions?: string[];
  nextStage?: string;
  requiresHumanReview?: boolean;
}

export class WhatsAppBotService {
  private conversationStates: Map<string, ConversationState> = new Map();
  private messageHistory: Map<string, WhatsAppMessage[]> = new Map();
  private readonly DOCUMENT_REQUIREMENTS = ['rg', 'cpf', 'comprovante'];
  private readonly HANDOFF_KEYWORDS = ['preciso falar com', 'quero falar com', 'advogado', 'atendente'];

  /**
   * Process incoming WhatsApp message
   */
  async processMessage(message: WhatsAppMessage): Promise<BotResponse> {
    try {
      logger.debug(`Processando mensagem de ${message.phoneNumber}: ${message.messageText}`);

      // Find or create client
      let client = await crmService.findClientByContact(message.phoneNumber);

      if (!client) {
        client = await crmService.createOrUpdateClient({
          phone: message.phoneNumber,
          name: message.senderName || 'Cliente WhatsApp',
          email: '',
          source: 'whatsapp',
        });
      }

      // Get or create conversation state
      let state = this.conversationStates.get(client.id);
      if (!state) {
        state = this.createConversationState(client.id, message.phoneNumber);
      }

      // Store message history
      if (!this.messageHistory.has(client.id)) {
        this.messageHistory.set(client.id, []);
      }
      this.messageHistory.get(client.id)!.push(message);

      // Log interaction
      await crmService.logInteraction(
        client.id,
        'message',
        'whatsapp',
        message.messageText,
        message.attachmentUrl ? [message.attachmentUrl] : undefined,
      );

      // Route to appropriate handler based on current stage
      let response: BotResponse;
      switch (state.stage) {
        case 'greeting':
          response = await this.handleGreeting(client.id, message, state);
          break;
        case 'qualification':
          response = await this.handleQualification(client.id, message, state);
          break;
        case 'document_collection':
          response = await this.handleDocumentCollection(client.id, message, state);
          break;
        case 'payment':
          response = await this.handlePayment(client.id, message, state);
          break;
        case 'completed':
          response = await this.handleCompleted(client.id, message, state);
          break;
        default:
          response = await this.handleDefault(client.id, message, state);
      }

      // Update state
      state.lastInteractionAt = new Date();
      this.conversationStates.set(client.id, state);

      // Update client status based on progression
      await this.updateClientStatus(client.id, state);

      return response;
    } catch (error) {
      logger.error({ err: error }, `Erro ao processar mensagem WhatsApp de ${message.phoneNumber}`);
      throw error;
    }
  }

  /**
   * Handle greeting stage
   */
  private async handleGreeting(
    clientId: string,
    message: WhatsAppMessage,
    state: ConversationState,
  ): Promise<BotResponse> {
    const responseText = `Olá! 👋 Bem-vindo ao atendimento de serviços jurídicos.

Estou aqui para ajudar você com suas questões legais. Para melhor atendê-lo, poderia descrever brevemente qual é o seu problema jurídico?

Por exemplo:
• Trabalhista (demissão, assédio)
• Familiar (divórcio, pensão)
• Cível (cobranças, contratos)
• Criminal (defesa)
• Imobiliário (propriedade)
• Consumidor (compras, serviços)`;

    state.stage = 'qualification';
    this.conversationStates.set(clientId, state);

    return {
      messageId: message.id,
      phoneNumber: message.phoneNumber,
      responseText,
      suggestedActions: [
        'Descrever problema',
        'Falar com atendente',
        'Cancelar',
      ],
      nextStage: 'qualification',
    };
  }

  /**
   * Handle qualification stage - determine case type
   */
  private async handleQualification(
    clientId: string,
    message: WhatsAppMessage,
    state: ConversationState,
  ): Promise<BotResponse> {
    // Check for handoff keywords
    const lowerText = message.messageText.toLowerCase();
    if (this.HANDOFF_KEYWORDS.some((keyword) => lowerText.includes(keyword))) {
      state.stage = 'handoff';
      state.agentHandoffRequired = true;
      this.conversationStates.set(clientId, state);

      return {
        messageId: message.id,
        phoneNumber: message.phoneNumber,
        responseText: '📞 Conectando você a um atendente humano. Por favor, aguarde...',
        nextStage: 'handoff',
        requiresHumanReview: true,
      };
    }

    // Classify case using CRM service
    const classification = await crmService.classifyCase(message.messageText);

    state.caseDetails = {
      type: classification.caseType,
      complexity: classification.complexity,
      urgency: classification.urgency,
      description: message.messageText,
    };

    // Update client case type
    await crmService.createOrUpdateClient({
      id: clientId,
      caseType: classification.caseType,
    });

    const urgencyEmoji = {
      low: '🟢',
      medium: '🟡',
      high: '🔴',
    }[classification.urgency];

    const responseText = `Entendi! ✓

Tipo de caso: **${classification.caseType}**
Complexidade: ${classification.complexity}
Urgência: ${urgencyEmoji} ${classification.urgency}
Tempo estimado: ~${classification.estimatedHours}h

Para melhor atender você, preciso de alguns documentos. Você pode compartilhá-los agora?`;

    state.stage = 'document_collection';
    this.conversationStates.set(clientId, state);

    return {
      messageId: message.id,
      phoneNumber: message.phoneNumber,
      responseText,
      suggestedActions: [
        'Compartilhar documentos',
        'Depois',
        'Falar com atendente',
      ],
      nextStage: 'document_collection',
    };
  }

  /**
   * Handle document collection stage
   */
  private async handleDocumentCollection(
    clientId: string,
    message: WhatsAppMessage,
    state: ConversationState,
  ): Promise<BotResponse> {
    // Check for document attachment
    if (message.messageType === 'document' && message.attachmentUrl) {
      const docType = this.identifyDocumentType(message.messageText, message.attachmentType);

      if (docType) {
        state.documentCollected[docType] = true;
      }

      const collected = Object.entries(state.documentCollected)
        .filter(([_, v]) => v === true)
        .map(([k]) => k);

      const remaining = this.DOCUMENT_REQUIREMENTS.filter(
        (doc) => !collected.includes(doc),
      );

      let responseText: string;
      if (remaining.length === 0) {
        responseText = `Ótimo! ✓ Recebi todos os documentos necessários.

Analisando seus dados...`;
        state.stage = 'payment';
      } else {
        responseText = `Documento recebido com sucesso! ✓

Ainda preciso de:
${remaining.map((doc) => `• ${this.getDocumentLabel(doc)}`).join('\n')}`;
      }

      this.conversationStates.set(clientId, state);

      return {
        messageId: message.id,
        phoneNumber: message.phoneNumber,
        responseText,
        suggestedActions: remaining.length > 0 ? ['Compartilhar próximo', 'Pular'] : [],
        nextStage: state.stage,
      };
    }

    // Text response about documents
    const responseText = `Para processar seu caso, preciso dos seguintes documentos:

📄 ${this.DOCUMENT_REQUIREMENTS.map((doc) => this.getDocumentLabel(doc)).join('\n📄 ')}

Você pode compartilhá-los agora como imagem ou PDF?`;

    return {
      messageId: message.id,
      phoneNumber: message.phoneNumber,
      responseText,
      suggestedActions: ['Compartilhar', 'Depois', 'Falar com atendente'],
      nextStage: 'document_collection',
    };
  }

  /**
   * Handle payment stage
   */
  private async handlePayment(
    clientId: string,
    message: WhatsAppMessage,
    state: ConversationState,
  ): Promise<BotResponse> {
    // Generate payment link (placeholder - would integrate with payment service)
    const paymentLink = await this.generatePaymentLink(clientId, state);
    state.paymentLink = paymentLink;

    const responseText = `Pronto! Sua análise inicial foi realizada.

**Próximos passos:**
1️⃣ Realiza o pagamento da consulta inicial
2️⃣ Você receberá um parecer jurídico detalhado
3️⃣ Podemos agendar uma videochamada com o advogado

💳 Link de pagamento (Pix/Boleto):
${paymentLink}

Após o pagamento, nosso advogado entrará em contato em breve.`;

    state.stage = 'completed';
    this.conversationStates.set(clientId, state);

    return {
      messageId: message.id,
      phoneNumber: message.phoneNumber,
      responseText,
      suggestedActions: ['Pagar agora', 'Precisamos conversar'],
      nextStage: 'completed',
    };
  }

  /**
   * Handle completed stage
   */
  private async handleCompleted(
    clientId: string,
    message: WhatsAppMessage,
    state: ConversationState,
  ): Promise<BotResponse> {
    const responseText = `Obrigado por usar nosso serviço!

Você pode:
• Ver histórico de suas consultas
• Agendar nova consulta
• Falar com um atendente

Como posso ajudá-lo?`;

    return {
      messageId: message.id,
      phoneNumber: message.phoneNumber,
      responseText,
      suggestedActions: ['Histórico', 'Nova consulta', 'Falar com atendente'],
      nextStage: 'completed',
    };
  }

  /**
   * Handle default/fallback stage
   */
  private async handleDefault(
    clientId: string,
    message: WhatsAppMessage,
    state: ConversationState,
  ): Promise<BotResponse> {
    return {
      messageId: message.id,
      phoneNumber: message.phoneNumber,
      responseText: 'Desculpe, não entendi. Como posso ajudá-lo?',
      suggestedActions: ['Iniciar novamente', 'Falar com atendente'],
    };
  }

  /**
   * Identify document type from message context
   */
  private identifyDocumentType(messageText: string, attachmentType?: string): string | null {
    const lowerText = messageText.toLowerCase();

    if (lowerText.includes('rg') || lowerText.includes('identidade')) return 'rg';
    if (lowerText.includes('cpf')) return 'cpf';
    if (lowerText.includes('comprovante') || lowerText.includes('endereço')) return 'comprovante';
    if (lowerText.includes('procuração')) return 'procuração';

    return null;
  }

  /**
   * Get human-readable document label
   */
  private getDocumentLabel(docType: string): string {
    const labels: Record<string, string> = {
      rg: 'RG ou CNH',
      cpf: 'CPF',
      comprovante: 'Comprovante de Endereço',
      procuração: 'Procuração (se houver)',
    };
    return labels[docType] || docType;
  }

  /**
   * Generate payment link (placeholder)
   */
  private async generatePaymentLink(clientId: string, state: ConversationState): Promise<string> {
    try {
      // Placeholder - would integrate with payment service (Stripe, Pix, etc.)
      const baseLink = 'https://payment.legaltool.com/checkout';
      const params = new URLSearchParams({
        clientId,
        amount: '299.90',
        type: state.caseDetails?.type || 'general',
      });

      return `${baseLink}?${params.toString()}`;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao gerar link de pagamento');
      return 'https://payment.legaltool.com/checkout';
    }
  }

  /**
   * Update client status based on conversation progression
   */
  private async updateClientStatus(clientId: string, state: ConversationState): Promise<void> {
    try {
      let newStatus: 'prospect' | 'lead' | 'qualified' | 'customer' | 'inactive' = 'prospect';

      if (state.stage === 'document_collection' || state.stage === 'payment') {
        newStatus = 'qualified';
      } else if (state.stage === 'completed' && state.paymentLink) {
        newStatus = 'customer';
      } else if (state.stage === 'qualification') {
        newStatus = 'lead';
      }

      await crmService.updateClientStatus(clientId, newStatus);
    } catch (error) {
      logger.warn({ err: error }, `Erro ao atualizar status do cliente ${clientId}`);
    }
  }

  /**
   * Create new conversation state
   */
  private createConversationState(clientId: string, phoneNumber: string): ConversationState {
    return {
      clientId,
      phoneNumber,
      stage: 'greeting',
      documentCollected: {
        rg: false,
        cpf: false,
        comprovante: false,
        procuração: false,
      },
      lastInteractionAt: new Date(),
    };
  }

  /**
   * Get conversation history
   */
  async getConversationHistory(clientId: string): Promise<WhatsAppMessage[]> {
    return this.messageHistory.get(clientId) || [];
  }

  /**
   * Get current conversation state
   */
  getConversationState(clientId: string): ConversationState | undefined {
    return this.conversationStates.get(clientId);
  }

  /**
   * Reset conversation (start fresh)
   */
  resetConversation(clientId: string): void {
    this.conversationStates.delete(clientId);
    logger.info(`Conversa resetada para cliente ${clientId}`);
  }

  /**
   * Export all conversation states (for persistence)
   */
  exportConversationStates(): Record<string, ConversationState> {
    const exported: Record<string, ConversationState> = {};
    for (const [key, value] of this.conversationStates.entries()) {
      exported[key] = value;
    }
    return exported;
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    activeConversations: number;
    totalMessages: number;
    averageDocumentsCollected: number;
  } {
    const activeConversations = this.conversationStates.size;
    let totalMessages = 0;
    let totalDocuments = 0;

    for (const messages of this.messageHistory.values()) {
      totalMessages += messages.length;
    }

    for (const state of this.conversationStates.values()) {
      totalDocuments += Object.values(state.documentCollected).filter((v) => v === true).length;
    }

    return {
      activeConversations,
      totalMessages,
      averageDocumentsCollected: activeConversations > 0 ? totalDocuments / activeConversations : 0,
    };
  }
}

export const whatsAppBotService = new WhatsAppBotService();
