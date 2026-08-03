import { logger } from '@utils/logger';
import { crmService } from '@services/CRMService';

// ============================================================================
// CONTRACT LIFECYCLE SERVICE - Phase 5 - Contract Management & Digital Signatures
// ============================================================================

export interface ContractTemplate {
  id: string;
  name: string;
  category: 'service' | 'employment' | 'nda' | 'purchase' | 'lease' | 'partnership' | 'other';
  description: string;
  content: string;
  variables: string[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

export interface ContractDocument {
  id: string;
  clientId: string;
  templateId: string;
  title: string;
  content: string;
  variables: Record<string, string>;
  version: number;
  status: 'draft' | 'review' | 'pending_signature' | 'signed' | 'executed' | 'archived';
  createdAt: Date;
  updatedAt: Date;
  versionHistory: ContractVersion[];
  signatures: ContractSignature[];
  compliance: ComplianceStatus;
}

export interface ContractVersion {
  versionNumber: number;
  timestamp: Date;
  author: string;
  changes: string;
  content: string;
}

export interface ContractSignature {
  id: string;
  signer: string;
  email: string;
  cpfCnpj: string;
  signatureMethod: 'digital_icp' | 'electronic' | 'wet_ink' | 'pending';
  signedAt?: Date;
  certificateNumber?: string;
  certificateIssuer?: string;
  status: 'pending' | 'signed' | 'rejected' | 'expired';
  expiresAt?: Date;
}

export interface ComplianceStatus {
  isCompliant: boolean;
  checklist: ComplianceCheck[];
  lastReviewedAt?: Date;
  reviewedBy?: string;
  issues: string[];
}

export interface ComplianceCheck {
  item: string;
  status: 'pass' | 'fail' | 'pending' | 'n/a';
  description: string;
}

export class ContractLifecycleService {
  private templates: Map<string, ContractTemplate> = new Map();
  private contracts: Map<string, ContractDocument> = new Map();
  private signatureRequests: Map<string, SignatureRequest> = new Map();
  private complianceRules: ComplianceRule[] = [];

  constructor() {
    this.initializeDefaultTemplates();
    this.initializeComplianceRules();
  }

  /**
   * Initialize default contract templates
   */
  private initializeDefaultTemplates(): void {
    const templates = [
      {
        name: 'Contrato de Prestação de Serviços Jurídicos',
        category: 'service' as const,
        content: `CONTRATO DE PRESTAÇÃO DE SERVIÇOS JURÍDICOS

Este Contrato é celebrado entre:
- CLIENTE: {{CLIENT_NAME}}, {{CLIENT_DOCUMENT}}
- ADVOGADO: {{LAWYER_NAME}}, OAB {{OAB_NUMBER}}

CLÁUSULAS:
1. DO SERVIÇO: O Advogado se compromete a prestar serviços jurídicos conforme solicitado.
2. DOS HONORÁRIOS: Os honorários serão de {{HOURLY_RATE}} por hora trabalhada.
3. DO PRAZO: Este contrato vigerá por {{CONTRACT_DURATION}} dias.
4. DISPOSIÇÕES FINAIS: Demais disposições conforme legislação vigente.`,
        variables: [
          'CLIENT_NAME',
          'CLIENT_DOCUMENT',
          'LAWYER_NAME',
          'OAB_NUMBER',
          'HOURLY_RATE',
          'CONTRACT_DURATION',
        ],
      },
      {
        name: 'Acordo de Confidencialidade (NDA)',
        category: 'nda' as const,
        content: `ACORDO DE CONFIDENCIALIDADE

Partes: {{PARTY_A}} e {{PARTY_B}}

O Acordo prevê:
1. Proteção de informações confidenciais
2. Proibição de divulgação a terceiros
3. Vigência de {{NDA_DURATION}} anos
4. Sanções por violação`,
        variables: ['PARTY_A', 'PARTY_B', 'NDA_DURATION'],
      },
    ];

    for (const template of templates) {
      const id = `template-${Date.now()}-${Math.random()}`;
      this.templates.set(id, {
        id,
        ...template,
        description: `Modelo padrão: ${template.name}`,
        createdBy: 'system',
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
      });
    }

    logger.info(`✓ ${templates.length} templates padrão inicializados`);
  }

  /**
   * Initialize compliance rules
   */
  private initializeComplianceRules(): void {
    this.complianceRules = [
      {
        name: 'Identificação das Partes',
        check: (contract) => contract.content.includes('{{CLIENT_NAME}}') === false,
        description: 'Contrato deve ter nomes das partes identificadas',
      },
      {
        name: 'Valores Definidos',
        check: (contract) => contract.content.includes('{{HOURLY_RATE}}') === false || contract.content.includes('R$'),
        description: 'Contrato deve conter valores monetários definidos',
      },
      {
        name: 'Prazos Estabelecidos',
        check: (contract) => contract.content.toLowerCase().includes('prazo') || contract.content.toLowerCase().includes('vigência'),
        description: 'Contrato deve ter prazos claramente estabelecidos',
      },
      {
        name: 'Assinatura Digital ICP',
        check: (contract) => contract.signatures.some((s) => s.status === 'signed'),
        description: 'Contrato deve ser assinado digitalmente',
      },
    ];
  }

  /**
   * Create contract from template
   */
  async createContractFromTemplate(
    clientId: string,
    templateId: string,
    variables: Record<string, string>,
    title: string,
  ): Promise<ContractDocument> {
    try {
      const client = await crmService.getClientById(clientId);
      if (!client) {
        throw new Error(`Cliente ${clientId} não encontrado`);
      }

      const template = this.templates.get(templateId);
      if (!template) {
        throw new Error(`Template ${templateId} não encontrado`);
      }

      // Replace variables in content
      let content = template.content;
      for (const [key, value] of Object.entries(variables)) {
        content = content.replace(`{{${key}}}`, value);
      }

      const contractId = `contract-${Date.now()}`;
      const now = new Date();

      const contract: ContractDocument = {
        id: contractId,
        clientId,
        templateId,
        title,
        content,
        variables,
        version: 1,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        versionHistory: [
          {
            versionNumber: 1,
            timestamp: now,
            author: 'system',
            changes: 'Criação inicial do contrato',
            content,
          },
        ],
        signatures: [],
        compliance: this.evaluateCompliance(content),
      };

      this.contracts.set(contractId, contract);

      logger.info(`Contrato ${contractId} criado a partir do template ${templateId}`);
      return contract;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao criar contrato do template');
      throw error;
    }
  }

  /**
   * Update contract content
   */
  async updateContract(
    contractId: string,
    newContent: string,
    author: string,
    changes: string,
  ): Promise<ContractDocument> {
    try {
      const contract = this.contracts.get(contractId);
      if (!contract) {
        throw new Error(`Contrato ${contractId} não encontrado`);
      }

      // Create new version
      const newVersion = contract.version + 1;
      contract.versionHistory.push({
        versionNumber: contract.version,
        timestamp: new Date(),
        author,
        changes,
        content: contract.content,
      });

      contract.content = newContent;
      contract.version = newVersion;
      contract.updatedAt = new Date();
      contract.compliance = this.evaluateCompliance(newContent);

      this.contracts.set(contractId, contract);

      logger.info(`Contrato ${contractId} atualizado para versão ${newVersion}`);
      return contract;
    } catch (error) {
      logger.error({ err: error }, `Erro ao atualizar contrato ${contractId}`);
      throw error;
    }
  }

  /**
   * Request signature on contract
   */
  async requestSignature(
    contractId: string,
    signer: string,
    email: string,
    cpfCnpj: string,
  ): Promise<ContractSignature> {
    try {
      const contract = this.contracts.get(contractId);
      if (!contract) {
        throw new Error(`Contrato ${contractId} não encontrado`);
      }

      const signatureId = `sig-${Date.now()}`;

      const signature: ContractSignature = {
        id: signatureId,
        signer,
        email,
        cpfCnpj,
        signatureMethod: 'digital_icp',
        status: 'pending',
        expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days
      };

      contract.signatures.push(signature);
      contract.status = 'pending_signature';
      contract.updatedAt = new Date();

      // Create signature request
      const requestId = `sreq-${Date.now()}`;
      this.signatureRequests.set(requestId, {
        id: requestId,
        contractId,
        signatureId,
        signer,
        email,
        status: 'pending',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      });

      this.contracts.set(contractId, contract);

      logger.info(`Solicitação de assinatura criada para ${signer} no contrato ${contractId}`);
      return signature;
    } catch (error) {
      logger.error({ err: error }, `Erro ao solicitar assinatura no contrato ${contractId}`);
      throw error;
    }
  }

  /**
   * Record digital signature (ICP-Brasil)
   */
  async recordDigitalSignature(
    contractId: string,
    signatureId: string,
    certificateNumber: string,
    certificateIssuer: string,
  ): Promise<ContractDocument> {
    try {
      const contract = this.contracts.get(contractId);
      if (!contract) {
        throw new Error(`Contrato ${contractId} não encontrado`);
      }

      const signature = contract.signatures.find((s) => s.id === signatureId);
      if (!signature) {
        throw new Error(`Assinatura ${signatureId} não encontrada`);
      }

      signature.signatureMethod = 'digital_icp';
      signature.status = 'signed';
      signature.signedAt = new Date();
      signature.certificateNumber = certificateNumber;
      signature.certificateIssuer = certificateIssuer;

      // Check if all signatures are complete
      const allSigned = contract.signatures.every((s) => s.status === 'signed');
      if (allSigned) {
        contract.status = 'signed';
      }

      contract.updatedAt = new Date();
      this.contracts.set(contractId, contract);

      logger.info(`Assinatura digital registrada no contrato ${contractId}`);
      return contract;
    } catch (error) {
      logger.error({ err: error }, `Erro ao registrar assinatura digital no contrato ${contractId}`);
      throw error;
    }
  }

  /**
   * Evaluate compliance
   */
  private evaluateCompliance(content: string): ComplianceStatus {
    const checklist: ComplianceCheck[] = [];

    for (const rule of this.complianceRules) {
      const pass = rule.check({ content, signatures: [] } as any);

      checklist.push({
        item: rule.name,
        status: pass ? 'pass' : 'fail',
        description: rule.description,
      });
    }

    const failedChecks = checklist.filter((c) => c.status === 'fail');

    return {
      isCompliant: failedChecks.length === 0,
      checklist,
      issues: failedChecks.map((c) => c.item),
    };
  }

  /**
   * Archive contract
   */
  async archiveContract(contractId: string): Promise<ContractDocument> {
    try {
      const contract = this.contracts.get(contractId);
      if (!contract) {
        throw new Error(`Contrato ${contractId} não encontrado`);
      }

      contract.status = 'archived';
      contract.updatedAt = new Date();

      this.contracts.set(contractId, contract);

      logger.info(`Contrato ${contractId} arquivado`);
      return contract;
    } catch (error) {
      logger.error({ err: error }, `Erro ao arquivar contrato ${contractId}`);
      throw error;
    }
  }

  /**
   * Get contract by ID
   */
  async getContract(contractId: string): Promise<ContractDocument | null> {
    try {
      return this.contracts.get(contractId) || null;
    } catch (error) {
      logger.error({ err: error }, `Erro ao obter contrato ${contractId}`);
      throw error;
    }
  }

  /**
   * Get client contracts
   */
  async getClientContracts(clientId: string): Promise<ContractDocument[]> {
    try {
      return Array.from(this.contracts.values()).filter((c) => c.clientId === clientId);
    } catch (error) {
      logger.error({ err: error }, `Erro ao obter contratos do cliente ${clientId}`);
      throw error;
    }
  }

  /**
   * Get contracts by status
   */
  async getContractsByStatus(
    status: 'draft' | 'review' | 'pending_signature' | 'signed' | 'executed' | 'archived',
  ): Promise<ContractDocument[]> {
    try {
      return Array.from(this.contracts.values()).filter((c) => c.status === status);
    } catch (error) {
      logger.error({ err: error }, `Erro ao obter contratos com status ${status}`);
      throw error;
    }
  }

  /**
   * Get all templates
   */
  getTemplates(): ContractTemplate[] {
    return Array.from(this.templates.values()).filter((t) => t.isActive);
  }

  /**
   * Get template by ID
   */
  getTemplate(templateId: string): ContractTemplate | null {
    return this.templates.get(templateId) || null;
  }

  /**
   * Create custom template
   */
  async createTemplate(
    name: string,
    category: ContractTemplate['category'],
    content: string,
    variables: string[],
    createdBy: string,
  ): Promise<ContractTemplate> {
    try {
      const templateId = `template-${Date.now()}`;

      const template: ContractTemplate = {
        id: templateId,
        name,
        category,
        description: name,
        content,
        variables,
        createdBy,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
      };

      this.templates.set(templateId, template);

      logger.info(`Template personalizado ${templateId} criado`);
      return template;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao criar template personalizado');
      throw error;
    }
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalContracts: number;
    draftContracts: number;
    pendingSignature: number;
    signedContracts: number;
    archivedContracts: number;
    totalTemplates: number;
    compliantContracts: number;
  } {
    const contractArray = Array.from(this.contracts.values());

    return {
      totalContracts: contractArray.length,
      draftContracts: contractArray.filter((c) => c.status === 'draft').length,
      pendingSignature: contractArray.filter((c) => c.status === 'pending_signature').length,
      signedContracts: contractArray.filter((c) => c.status === 'signed').length,
      archivedContracts: contractArray.filter((c) => c.status === 'archived').length,
      totalTemplates: Array.from(this.templates.values()).filter((t) => t.isActive).length,
      compliantContracts: contractArray.filter((c) => c.compliance.isCompliant).length,
    };
  }

  /**
   * Reset data (for testing)
   */
  reset(): void {
    this.contracts.clear();
    this.signatureRequests.clear();
    this.templates.clear();
    this.initializeDefaultTemplates();
    logger.info('Contract Lifecycle Service resetado');
  }
}

interface SignatureRequest {
  id: string;
  contractId: string;
  signatureId: string;
  signer: string;
  email: string;
  status: 'pending' | 'signed' | 'rejected' | 'expired';
  createdAt: Date;
  expiresAt: Date;
}

interface ComplianceRule {
  name: string;
  check: (contract: ContractDocument) => boolean;
  description: string;
}

export const contractLifecycleService = new ContractLifecycleService();
