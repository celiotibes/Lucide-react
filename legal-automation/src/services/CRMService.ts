import { logger } from '@utils/logger';

// ============================================================================
// CRM SERVICE - Phase 5.8 - Customer Relationship Management
// ============================================================================

export interface ClientProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  cpf?: string;
  cnpj?: string;
  status: 'prospect' | 'lead' | 'qualified' | 'customer' | 'inactive';
  source: 'whatsapp' | 'email' | 'referral' | 'website' | 'phone' | 'other';
  documentUrl?: string;
  caseType?: string;
  createdAt: Date;
  updatedAt: Date;
  lastInteractionAt?: Date;
}

export interface CRMInteraction {
  id: string;
  clientId: string;
  type: 'message' | 'call' | 'email' | 'meeting' | 'proposal';
  channel: 'whatsapp' | 'email' | 'phone' | 'in-person';
  content: string;
  attachments?: string[];
  outcome?: string;
  createdAt: Date;
}

export interface CaseClassification {
  caseType: string;
  complexity: 'simple' | 'moderate' | 'complex';
  urgency: 'low' | 'medium' | 'high';
  estimatedHours: number;
  suggestedService: string;
  confidence: number;
}

export interface ClientPipeline {
  prospectCount: number;
  leadCount: number;
  qualifiedCount: number;
  customerCount: number;
  conversionRate: number;
  avgTimeToConversion: number;
}

export class CRMService {
  private clients: Map<string, ClientProfile> = new Map();
  private interactions: Map<string, CRMInteraction[]> = new Map();
  private caseClassifications: Map<string, CaseClassification> = new Map();

  /**
   * Create or update client profile
   */
  async createOrUpdateClient(data: Partial<ClientProfile>): Promise<ClientProfile> {
    try {
      const clientId = data.id || `client-${Date.now()}`;

      const client: ClientProfile = {
        id: clientId,
        name: data.name || 'Unknown',
        email: data.email || '',
        phone: data.phone || '',
        cpf: data.cpf,
        cnpj: data.cnpj,
        status: data.status || 'prospect',
        source: data.source || 'other',
        documentUrl: data.documentUrl,
        caseType: data.caseType,
        createdAt: data.createdAt || new Date(),
        updatedAt: new Date(),
        lastInteractionAt: data.lastInteractionAt,
      };

      this.clients.set(clientId, client);
      logger.info(`Cliente ${clientId} criado/atualizado`);

      return client;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao criar/atualizar cliente');
      throw error;
    }
  }

  /**
   * Get client by ID
   */
  async getClientById(clientId: string): Promise<ClientProfile | null> {
    try {
      return this.clients.get(clientId) || null;
    } catch (error) {
      logger.error({ err: error }, `Erro ao buscar cliente ${clientId}`);
      throw error;
    }
  }

  /**
   * Find client by phone or email
   */
  async findClientByContact(phone?: string, email?: string): Promise<ClientProfile | null> {
    try {
      for (const client of this.clients.values()) {
        if ((phone && client.phone === phone) || (email && client.email === email)) {
          return client;
        }
      }
      return null;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao buscar cliente por contato');
      throw error;
    }
  }

  /**
   * Log client interaction
   */
  async logInteraction(
    clientId: string,
    type: CRMInteraction['type'],
    channel: CRMInteraction['channel'],
    content: string,
    attachments?: string[],
  ): Promise<CRMInteraction> {
    try {
      const interaction: CRMInteraction = {
        id: `interaction-${Date.now()}`,
        clientId,
        type,
        channel,
        content,
        attachments,
        createdAt: new Date(),
      };

      if (!this.interactions.has(clientId)) {
        this.interactions.set(clientId, []);
      }

      this.interactions.get(clientId)!.push(interaction);

      // Update last interaction time
      const client = this.clients.get(clientId);
      if (client) {
        client.lastInteractionAt = new Date();
      }

      logger.debug(`Interação registrada para cliente ${clientId}`);
      return interaction;
    } catch (error) {
      logger.error({ err: error }, `Erro ao registrar interação para ${clientId}`);
      throw error;
    }
  }

  /**
   * Get client interaction history
   */
  async getClientHistory(clientId: string, limit: number = 50): Promise<CRMInteraction[]> {
    try {
      const interactions = this.interactions.get(clientId) || [];
      return interactions.slice(-limit);
    } catch (error) {
      logger.error({ err: error }, `Erro ao obter histórico de ${clientId}`);
      throw error;
    }
  }

  /**
   * Update client status in pipeline
   */
  async updateClientStatus(
    clientId: string,
    status: ClientProfile['status'],
  ): Promise<ClientProfile> {
    try {
      const client = this.clients.get(clientId);
      if (!client) {
        throw new Error(`Cliente ${clientId} não encontrado`);
      }

      client.status = status;
      client.updatedAt = new Date();

      logger.info(`Status do cliente ${clientId} atualizado para ${status}`);
      return client;
    } catch (error) {
      logger.error({ err: error }, `Erro ao atualizar status do cliente`);
      throw error;
    }
  }

  /**
   * Classify case type and complexity
   */
  async classifyCase(clientMessage: string): Promise<CaseClassification> {
    try {
      // Simple keyword-based classification
      const lowerMessage = clientMessage.toLowerCase();

      let caseType = 'general';
      let complexity: 'simple' | 'moderate' | 'complex' = 'moderate';
      let urgency: 'low' | 'medium' | 'high' = 'medium';
      let estimatedHours = 8;

      // Detect case type
      if (lowerMessage.includes('trabalhista') || lowerMessage.includes('demissão')) {
        caseType = 'trabalhista';
        estimatedHours = 12;
      } else if (lowerMessage.includes('família') || lowerMessage.includes('divórcio')) {
        caseType = 'familia';
        estimatedHours = 16;
      } else if (lowerMessage.includes('cível') || lowerMessage.includes('débito')) {
        caseType = 'civil';
        estimatedHours = 10;
      } else if (lowerMessage.includes('criminal') || lowerMessage.includes('crime')) {
        caseType = 'criminal';
        estimatedHours = 20;
        complexity = 'complex';
      } else if (lowerMessage.includes('imóvel') || lowerMessage.includes('propriedade')) {
        caseType = 'imobiliario';
        estimatedHours = 14;
      } else if (lowerMessage.includes('consumidor') || lowerMessage.includes('compra')) {
        caseType = 'consumidor';
        estimatedHours = 6;
        complexity = 'simple';
      }

      // Detect urgency
      if (
        lowerMessage.includes('urgente') ||
        lowerMessage.includes('prazo') ||
        lowerMessage.includes('rápido')
      ) {
        urgency = 'high';
      }

      // Detect complexity
      if (lowerMessage.length > 500 || lowerMessage.split('\n').length > 5) {
        complexity = 'complex';
      } else if (lowerMessage.length < 100) {
        complexity = 'simple';
      }

      const classification: CaseClassification = {
        caseType,
        complexity,
        urgency,
        estimatedHours,
        suggestedService: `${caseType}_${complexity}`,
        confidence: 0.75,
      };

      return classification;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao classificar caso');
      throw error;
    }
  }

  /**
   * Get pipeline statistics
   */
  async getPipelineStatistics(): Promise<ClientPipeline> {
    try {
      const statuses = Array.from(this.clients.values()).reduce(
        (acc, client) => {
          acc[client.status]++;
          return acc;
        },
        { prospect: 0, lead: 0, qualified: 0, customer: 0, inactive: 0 },
      );

      const totalProspects = statuses.prospect + statuses.lead;
      const customers = statuses.customer;
      const conversionRate = totalProspects > 0 ? customers / totalProspects : 0;

      return {
        prospectCount: statuses.prospect,
        leadCount: statuses.lead,
        qualifiedCount: statuses.qualified,
        customerCount: statuses.customer,
        conversionRate,
        avgTimeToConversion: 7, // dias (placeholder)
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter estatísticas de pipeline');
      throw error;
    }
  }

  /**
   * Get all clients by status
   */
  async getClientsByStatus(status: ClientProfile['status']): Promise<ClientProfile[]> {
    try {
      return Array.from(this.clients.values()).filter((client) => client.status === status);
    } catch (error) {
      logger.error({ err: error }, `Erro ao obter clientes com status ${status}`);
      throw error;
    }
  }

  /**
   * Generate follow-up recommendations
   */
  async getFollowUpRecommendations(): Promise<any[]> {
    try {
      const recommendations: any[] = [];

      for (const client of this.clients.values()) {
        const daysSinceLastInteraction = client.lastInteractionAt
          ? Math.floor((Date.now() - client.lastInteractionAt.getTime()) / (1000 * 60 * 60 * 24))
          : 999;

        if (client.status === 'prospect' && daysSinceLastInteraction > 3) {
          recommendations.push({
            clientId: client.id,
            clientName: client.name,
            type: 'follow_up_prospect',
            reason: `Prospect sem interação há ${daysSinceLastInteraction} dias`,
            priority: 'high',
          });
        } else if (client.status === 'qualified' && daysSinceLastInteraction > 7) {
          recommendations.push({
            clientId: client.id,
            clientName: client.name,
            type: 'convert_to_customer',
            reason: `Cliente qualificado pronto para conversão`,
            priority: 'high',
          });
        } else if (client.status === 'customer' && daysSinceLastInteraction > 30) {
          recommendations.push({
            clientId: client.id,
            clientName: client.name,
            type: 'retention_contact',
            reason: `Cliente sem interação há ${daysSinceLastInteraction} dias`,
            priority: 'medium',
          });
        }
      }

      return recommendations;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao gerar recomendações de follow-up');
      throw error;
    }
  }

  /**
   * Reset CRM data (for testing)
   */
  reset(): void {
    this.clients.clear();
    this.interactions.clear();
    this.caseClassifications.clear();
    logger.info('CRM resetado');
  }

  /**
   * Get all clients
   */
  getAllClients(): ClientProfile[] {
    return Array.from(this.clients.values());
  }
}

export const crmService = new CRMService();
