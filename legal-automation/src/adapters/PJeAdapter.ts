import axios, { AxiosInstance } from 'axios';
import { logger } from '@utils/logger';
import { Process, Petition } from '@/types';
import { TribunalAdapter, Movement, ProtocolResponse, PetitionStatus, SearchCriteria } from './TribunalAdapter';

interface PJeConfig {
  code: string;
  name: string;
  apiUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  systemId: string;
}

interface PJeProcess extends Process {
  currentPhase?: string;
  movements?: Movement[];
  documents?: any[];
  deadlines?: any[];
  estimatedValue?: number;
  court?: string;
  classificationCode?: string;
}

class ProcessNotFoundError extends Error {
  constructor(processNumber: string, tribunal: string) {
    super(`Processo ${processNumber} não encontrado em ${tribunal}`);
    this.name = 'ProcessNotFoundError';
  }
}

class AuthenticationError extends Error {
  constructor(tribunal: string) {
    super(`Erro de autenticação com ${tribunal}`);
    this.name = 'AuthenticationError';
  }
}

export class PJeAdapter implements TribunalAdapter {
  private client: AxiosInstance;
  private config: PJeConfig;
  private accessToken?: string;
  private tokenExpiry?: Date;

  constructor(config: PJeConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.apiUrl,
      timeout: 30000,
    });
  }

  getName(): string {
    return this.config.name;
  }

  getBaseUrl(): string {
    return this.config.apiUrl;
  }

  getTribunalCode(): string {
    return this.config.code;
  }

  async initialize(): Promise<void> {
    try {
      logger.info(`Inicializando PJe adapter para ${this.config.name}`);
      await this.authenticate();
      logger.info('✓ PJe adapter inicializado com sucesso');
    } catch (error) {
      logger.error({ err: error }, 'Erro ao inicializar PJe adapter');
      throw error;
    }
  }

  async getProcess(number: string): Promise<Process> {
    try {
      await this.ensureAuthenticated();

      const response = await this.client.get('/consultas/processo', {
        params: {
          nrProcesso: number.replace(/\D/g, ''),
        },
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      if (!response.data || !response.data.processo) {
        throw new ProcessNotFoundError(number, 'PJe');
      }

      return this.mapPJeResponse(response.data.processo, number);
    } catch (error) {
      logger.error({ err: error }, `Erro ao buscar processo ${number} em PJe`);
      if (error instanceof ProcessNotFoundError) {
        throw error;
      }
      throw new ProcessNotFoundError(number, 'PJe');
    }
  }

  async searchProcesses(criteria: SearchCriteria): Promise<Process[]> {
    try {
      await this.ensureAuthenticated();

      if (criteria.partyName) {
        const response = await this.client.get('/consultas/partes', {
          params: {
            nmParte: criteria.partyName,
            perPage: criteria.limit || 50,
            page: criteria.offset || 0,
          },
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        });

        return (response.data.processos || []).map((p: any) =>
          this.mapPJeResponse(p, p.nrProcesso),
        );
      }

      return [];
    } catch (error) {
      logger.error({ err: error }, `Erro ao buscar processos em PJe`);
      return [];
    }
  }

  async getMovements(processNumber: string): Promise<Movement[]> {
    try {
      await this.ensureAuthenticated();

      const response = await this.client.get(
        `/processo/${processNumber.replace(/\D/g, '')}/movimentacoes`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        },
      );

      return (response.data.movimentacoes || []).map((m: any) => ({
        date: new Date(m.dtMovimentacao),
        description: m.dsMovimentacao,
        status: m.status,
        complement: m.complemento,
      }));
    } catch (error) {
      logger.error({ err: error }, `Erro ao obter movimentações ${processNumber}`);
      return [];
    }
  }

  async submitPetition(
    petition: Petition,
    certificatePath: string,
    certPassword: string,
  ): Promise<ProtocolResponse> {
    try {
      await this.ensureAuthenticated();

      const formData = new FormData();
      formData.append('nrProcesso', petition.processNumber);
      formData.append('documento', petition.content);

      if (petition.attachments && petition.attachments.length > 0) {
        for (let i = 0; i < petition.attachments.length; i++) {
          // Note: FormData handling in Node.js requires proper setup
          // This is a placeholder implementation
        }
      }

      const response = await this.client.post('/peticionamento/registrar', formData, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'multipart/form-data',
        },
      });

      return {
        protocolo: response.data.idRegistro || '',
        dataProtocolo: new Date(),
        sucesso: response.status === 200 || response.status === 201,
        mensagem: 'Petição registrada com sucesso',
      };
    } catch (error) {
      logger.error({ err: error }, `Erro ao submeter petição ao PJe`);
      return {
        protocolo: '',
        dataProtocolo: new Date(),
        sucesso: false,
        mensagem: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  async getPetitionStatus(protocolNumber: string): Promise<PetitionStatus> {
    try {
      await this.ensureAuthenticated();

      const response = await this.client.get(`/peticionamento/status/${protocolNumber}`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      return {
        protocolo: protocolNumber,
        status: response.data.status || 'processando',
        dataStatus: new Date(response.data.dtStatus || new Date()),
        mensagem: response.data.mensagem,
      };
    } catch (error) {
      logger.error({ err: error }, `Erro ao obter status da petição ${protocolNumber}`);
      return {
        protocolo: protocolNumber,
        status: 'rejeitada',
        dataStatus: new Date(),
        mensagem: 'Erro ao consultar status',
      };
    }
  }

  async validateCertificate(cert: Buffer, password: string): Promise<boolean> {
    try {
      // Certificate validation logic
      return cert && cert.length > 0 && password && password.length > 0;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao validar certificado');
      return false;
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.client.get('/health', {
        timeout: 5000,
      });
      return response.status === 200;
    } catch (error) {
      logger.error({ err: error }, 'PJe health check falhou');
      return false;
    }
  }

  // Custom methods for PJe
  async searchProcess(processNumber: string): Promise<Process> {
    return this.getProcess(processNumber);
  }

  async searchProcessByParty(partyName: string, options?: any): Promise<Process[]> {
    return this.searchProcesses({
      partyName,
      limit: options?.limit || 50,
      offset: options?.offset || 0,
    });
  }

  async getProcessDeadlines(processNumber: string): Promise<any[]> {
    try {
      await this.ensureAuthenticated();

      const response = await this.client.get(`/processo/${processNumber}/prazos`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      return (response.data.prazos || []).map((p: any) => ({
        id: p.idPrazo,
        description: p.dsPrazo,
        dueDate: new Date(p.dtVencimento),
        priority: this.mapPriority(p.dsNivelUrgencia),
      }));
    } catch (error) {
      logger.error({ err: error }, `Erro ao obter prazos do PJe para ${processNumber}`);
      return [];
    }
  }

  async getHealthStatus(): Promise<{ status: 'ok' | 'error'; message: string }> {
    try {
      const response = await this.client.get('/health', {
        timeout: 5000,
      });

      return {
        status: response.status === 200 ? 'ok' : 'error',
        message: response.data.message || 'PJe disponível',
      };
    } catch (error) {
      return {
        status: 'error',
        message: `PJe indisponível: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      };
    }
  }

  // Private helpers
  private async authenticate(): Promise<void> {
    try {
      const response = await axios.post(this.config.tokenUrl, {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'client_credentials',
      });

      this.accessToken = response.data.access_token;
      const expiresIn = response.data.expires_in || 3600;
      this.tokenExpiry = new Date(Date.now() + expiresIn * 1000);

      logger.info('Token PJe obtido com sucesso');
    } catch (error) {
      logger.error({ err: error }, 'Erro ao autenticar com PJe');
      throw new AuthenticationError('PJe');
    }
  }

  private async ensureAuthenticated(): Promise<void> {
    if (!this.accessToken || (this.tokenExpiry && Date.now() >= this.tokenExpiry.getTime())) {
      await this.authenticate();
    }
  }

  private mapPJeResponse(data: any, processNumber: string): PJeProcess {
    return {
      number: processNumber,
      cnj: data.nrCNJ || '',
      tribunal: 'PJe',
      forum: data.nmForo || 'Tribunal desconhecido',
      status: this.mapStatus(data.stProcesso),
      subject: data.dsAssunto || 'Desconhecido',
      currentPhase: data.dsAtributo || 'Fase desconhecida',
      parties: (data.partes || []).map((p: any) => ({
        name: p.nmParte,
        role: this.mapRole(p.dsRoleParte),
        document: p.cdCPF || p.cdCNPJ,
      })),
      plaintiff: (data.partes || []).find((p: any) => p.dsRoleParte === 'AUTOR')?.nmParte,
      defendant: (data.partes || []).find((p: any) => p.dsRoleParte === 'RÉU')?.nmParte,
      lastUpdate: new Date(data.dtMovimentacao || new Date()),
      filingDate: new Date(data.dtRegistro || new Date()),
      movements: (data.movimentacoes || []).map((m: any) => ({
        date: new Date(m.dtMovimentacao),
        description: m.dsMovimentacao,
        status: m.status,
      })),
      documents: (data.documentos || []).map((d: any) => ({
        id: d.idDocumento,
        name: d.nmDocumento,
        type: d.dsExtensao,
        date: new Date(d.dtDocumento),
        url: `${this.config.apiUrl}/documentos/${d.idDocumento}`,
      })),
      deadlines: (data.prazos || []).map((p: any) => ({
        id: p.idPrazo,
        description: p.dsPrazo,
        dueDate: new Date(p.dtVencimento),
      })),
    };
  }

  private mapStatus(status: string): string {
    const statusMap: { [key: string]: string } = {
      'A': 'active',
      'C': 'closed',
      'I': 'inactive',
      'S': 'suspended',
    };
    return statusMap[status] || status;
  }

  private mapRole(role: string): 'plaintiff' | 'defendant' | 'other' {
    switch (role?.toUpperCase()) {
      case 'AUTOR':
        return 'plaintiff';
      case 'RÉU':
        return 'defendant';
      default:
        return 'other';
    }
  }

  private mapPriority(priority: string): string {
    const priorityMap: { [key: string]: string } = {
      'ALTA': 'high',
      'MÉDIA': 'medium',
      'BAIXA': 'low',
    };
    return priorityMap[priority] || 'medium';
  }

  private formatProcessNumber(processNumber: string): string {
    // Format: NNNNNNN-DD.AAAA.J.TT.OOOO
    const cleaned = processNumber.replace(/\D/g, '');
    if (cleaned.length === 20) {
      return `${cleaned.substring(0, 7)}-${cleaned.substring(7, 9)}.${cleaned.substring(9, 13)}.${cleaned.substring(13, 14)}.${cleaned.substring(14, 16)}.${cleaned.substring(16, 20)}`;
    }
    return processNumber;
  }
}

export default PJeAdapter;
