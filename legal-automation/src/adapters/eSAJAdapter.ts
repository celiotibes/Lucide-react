import axios, { AxiosInstance } from 'axios';
import { logger } from '@utils/logger';
import { Process, Petition } from '@/types';
import { TribunalAdapter, Movement, ProtocolResponse, PetitionStatus, SearchCriteria } from './TribunalAdapter';

interface eSAJConfig {
  code: string;
  name: string;
  apiUrl: string;
  courtSystem: string;
  clientId?: string;
  clientSecret?: string;
}

interface eSAJProcess extends Process {
  currentPhase?: string;
  movements?: Movement[];
  documents?: any[];
  deadlines?: any[];
  subjectCode?: string;
  judgeId?: string;
  origin?: string;
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

export class eSAJAdapter implements TribunalAdapter {
  private client: AxiosInstance;
  private config: eSAJConfig;
  private accessToken?: string;
  private tokenExpiry?: Date;

  constructor(config: eSAJConfig) {
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
      logger.info(`Inicializando eSAJ adapter para ${this.config.name}`);
      const health = await this.getHealthStatus();

      if (health.status === 'ok') {
        logger.info('✓ eSAJ adapter inicializado com sucesso');
      } else {
        throw new Error(health.message);
      }
    } catch (error) {
      logger.error({ err: error }, 'Erro ao inicializar eSAJ adapter');
      throw error;
    }
  }

  async getProcess(number: string): Promise<Process> {
    try {
      const cleanNumber = number.replace(/\D/g, '');

      const response = await this.client.post('/consultarprocesso', {
        cdProcesso: cleanNumber,
        sgTribunal: this.config.courtSystem,
      });

      if (!response.data || !response.data.processo) {
        throw new ProcessNotFoundError(number, 'eSAJ');
      }

      return this.mapeSAJResponse(response.data.processo, number);
    } catch (error) {
      logger.error({ err: error }, `Erro ao buscar processo ${number} em eSAJ`);

      if (error instanceof ProcessNotFoundError) {
        throw error;
      }

      throw new ProcessNotFoundError(number, 'eSAJ');
    }
  }

  async searchProcesses(criteria: SearchCriteria): Promise<Process[]> {
    try {
      if (criteria.partyName) {
        const response = await this.client.post('/consultarpartes', {
          nmParte: criteria.partyName,
          sgTribunal: this.config.courtSystem,
          maxRegistros: criteria.limit || 50,
          inicioRegistro: criteria.offset || 0,
        });

        return (response.data.processos || []).map((p: any) =>
          this.mapeSAJResponse(p, p.cdProcesso),
        );
      }

      return [];
    } catch (error) {
      logger.error({ err: error }, `Erro ao buscar processos em eSAJ`);
      return [];
    }
  }

  async getMovements(processNumber: string): Promise<Movement[]> {
    try {
      const cleanNumber = processNumber.replace(/\D/g, '');

      const response = await this.client.post('/consultarmovimentacoes', {
        cdProcesso: cleanNumber,
        sgTribunal: this.config.courtSystem,
      });

      return (response.data.movimentacoes || []).map((m: any) => ({
        date: new Date(m.dtMovimentacao),
        description: m.dsMovimentacao,
        status: m.tpMovimentacao,
        complement: m.deMovimentacao,
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
      const cleanNumber = petition.processNumber.replace(/\D/g, '');

      const payload = {
        cdProcesso: cleanNumber,
        sgTribunal: this.config.courtSystem,
        dsDocumento: petition.content,
        tpDocumento: petition.type || 'Petição',
        nrSequencia: 1,
      };

      if (petition.attachments && petition.attachments.length > 0) {
        payload.arquivos = petition.attachments.map((att: any) => ({
          nmArquivo: att.title || att.name,
          dsBinario: att.url || att.content,
        }));
      }

      const response = await this.client.post('/protocolarpdocumento', payload);

      if (response.status === 200 && response.data.idDocumento) {
        return {
          protocolo: response.data.idDocumento || '',
          dataProtocolo: new Date(),
          sucesso: true,
          mensagem: 'Petição protocolada com sucesso no eSAJ',
        };
      }

      throw new Error('Falha ao protocolar petição');
    } catch (error) {
      logger.error({ err: error }, `Erro ao submeter petição ao eSAJ`);
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
      const response = await this.client.post('/consultarstatuspeticao', {
        idDocumento: protocolNumber,
        sgTribunal: this.config.courtSystem,
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
      return cert && cert.length > 0 && password && password.length > 0;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao validar certificado');
      return false;
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.client.get('/status', {
        timeout: 5000,
      });
      return response.status === 200;
    } catch (error) {
      logger.error({ err: error }, 'eSAJ health check falhou');
      return false;
    }
  }

  // Custom methods for eSAJ
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
      const cleanNumber = processNumber.replace(/\D/g, '');

      const response = await this.client.post('/consultarprazos', {
        cdProcesso: cleanNumber,
        sgTribunal: this.config.courtSystem,
      });

      return (response.data.prazos || []).map((p: any) => ({
        id: p.idPrazo,
        description: p.dsPrazo,
        dueDate: new Date(p.dtVencimento),
        priority: this.mapPriority(p.priority),
      }));
    } catch (error) {
      logger.error({ err: error }, `Erro ao obter prazos do eSAJ para ${processNumber}`);
      return [];
    }
  }

  async getHealthStatus(): Promise<{ status: 'ok' | 'error'; message: string }> {
    try {
      const response = await this.client.get('/status', {
        timeout: 5000,
      });

      return {
        status: response.status === 200 ? 'ok' : 'error',
        message: response.data.message || 'eSAJ disponível',
      };
    } catch (error) {
      return {
        status: 'error',
        message: `eSAJ indisponível: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      };
    }
  }

  private mapeSAJResponse(data: any, processNumber: string): eSAJProcess {
    return {
      number: processNumber,
      cnj: data.nrCNJ || '',
      tribunal: 'eSAJ',
      forum: data.nmForo || 'Foro desconhecido',
      status: this.mapStatus(data.stProcesso),
      subject: data.dsAssunto || 'Desconhecido',
      currentPhase: data.dsAssunto || 'Fase desconhecida',
      parties: (data.partes || []).map((p: any) => ({
        name: p.nmParte,
        role: this.mapRole(p.tpParte),
        document: p.cdCPF || p.cdCNPJ,
      })),
      plaintiff: (data.partes || []).find((p: any) => p.tpParte === 'A')?.nmParte,
      defendant: (data.partes || []).find((p: any) => p.tpParte === 'R')?.nmParte,
      lastUpdate: new Date(data.dtUltimaMovimentacao || new Date()),
      filingDate: new Date(data.dtRegistro || new Date()),
      movements: (data.movimentacoes || []).map((m: any) => ({
        date: new Date(m.dtMovimentacao),
        description: m.dsMovimentacao,
        status: m.tpMovimentacao,
      })),
      documents: (data.documentos || []).map((d: any) => ({
        id: d.idDocumento,
        name: d.nmDocumento,
        type: d.tpDocumento,
        date: new Date(d.dtDocumento),
        url: `${this.config.apiUrl}/documentos/${d.idDocumento}`,
      })),
      deadlines: (data.prazos || []).map((p: any) => ({
        id: p.idPrazo,
        description: p.dsPrazo,
        dueDate: new Date(p.dtVencimento),
      })),
      subjectCode: data.cdAssunto || '',
      judgeId: data.idJuiz,
      origin: 'eSAJ',
    };
  }

  private mapStatus(status: string): string {
    const statusMap: { [key: string]: string } = {
      'A': 'active',
      'P': 'pending',
      'E': 'closed',
      'X': 'archived',
    };
    return statusMap[status] || status;
  }

  private mapRole(role: string): 'plaintiff' | 'defendant' | 'other' {
    switch (role?.toUpperCase()) {
      case 'A':
        return 'plaintiff';
      case 'R':
        return 'defendant';
      default:
        return 'other';
    }
  }

  private mapPriority(priority: string): string {
    const priorityMap: { [key: string]: string } = {
      '1': 'low',
      '2': 'medium',
      '3': 'high',
      '4': 'critical',
    };
    return priorityMap[priority] || 'medium';
  }
}

export default eSAJAdapter;
