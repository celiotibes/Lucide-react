import axios from 'axios';
import { logger } from '@utils/logger';
import { config } from '@utils/config';
import { dataJudClient } from '@/datajud/client';
import {
  TribunalAdapter,
  SearchCriteria,
  Process,
  Movement,
  ProtocolResponse,
  PetitionStatus,
} from './TribunalAdapter';

export class TJMTAdapter implements TribunalAdapter {
  private baseUrl: string;
  private httpClient: any;
  private authToken: string | null = null;

  constructor() {
    this.baseUrl = config.tjmt_api_url || 'https://eproc.tjmt.jus.br/api';
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  }

  getName(): string {
    return 'TJMT';
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getTribunalCode(): string {
    return 'tjmt';
  }

  async getProcess(number: string): Promise<Process> {
    try {
      logger.debug(`TJMT: Obtendo processo ${number}`);

      // TJMT: Try direct API first, fallback to DataJud
      try {
        const response = await this.httpClient.get(`/processos/${number}`);
        if (response.data) {
          return this.normalizeProcess(response.data);
        }
      } catch (apiError) {
        logger.warn(`TJMT: Erro na API direta, usando DataJud para ${number}`);
      }

      // Use DataJud API as fallback for TJMT
      const processes = await dataJudClient.searchProcesses({
        numeroProcesso: number,
      });

      if (processes.length === 0) {
        throw new Error(`Processo não encontrado: ${number}`);
      }

      return this.normalizeProcess(processes[0]);
    } catch (error) {
      logger.error({ err: error }, `TJMT: Erro ao obter processo ${number}`);
      throw error;
    }
  }

  async searchProcesses(criteria: SearchCriteria): Promise<Process[]> {
    try {
      logger.debug(`TJMT: Buscando processos com critérios:`, criteria);

      // Try TJMT API search first
      try {
        const params = this.buildSearchParams(criteria);
        const response = await this.httpClient.get('/processos', { params });

        if (response.data && Array.isArray(response.data)) {
          return response.data.map((p: any) => this.normalizeProcess(p));
        }
      } catch (apiError) {
        logger.warn('TJMT: Erro na busca via API direta, usando DataJud');
      }

      // Fallback to DataJud for TJMT searches
      const processes = await dataJudClient.searchProcesses({
        parteNome: criteria.partyName,
        assunto: criteria.subject,
        dataRegistroInicio: criteria.startDate?.toISOString().split('T')[0],
        dataRegistroFim: criteria.endDate?.toISOString().split('T')[0],
        limite: criteria.limit || 50,
      });

      return processes.map(p => this.normalizeProcess(p));
    } catch (error) {
      logger.error({ err: error }, 'TJMT: Erro ao buscar processos');
      throw error;
    }
  }

  async getMovements(processNumber: string): Promise<Movement[]> {
    try {
      logger.debug(`TJMT: Obtendo movimentações do processo ${processNumber}`);

      // Try TJMT API first
      try {
        const response = await this.httpClient.get(`/movimentacoes/${processNumber}`);
        if (response.data && Array.isArray(response.data)) {
          return response.data.map((m: any) => ({
            date: new Date(m.dataMovimentacao || m.data),
            description: m.descricao || m.description,
            status: m.status,
            complement: m.complemento || m.complement,
          }));
        }
      } catch (apiError) {
        logger.warn(`TJMT: Erro ao obter movimentações via API, usando DataJud`);
      }

      // Fallback to DataJud
      const movements = await dataJudClient.getMovements(processNumber);

      return movements.map((m: any) => ({
        date: new Date(m.dataMovimentacao || m.data),
        description: m.descricao || m.description,
        status: m.status,
        complement: m.complemento || m.complement,
      }));
    } catch (error) {
      logger.error({ err: error }, `TJMT: Erro ao obter movimentações ${processNumber}`);
      throw error;
    }
  }

  async submitPetition(
    petition: any,
    certificatePath: string,
    certPassword: string,
  ): Promise<ProtocolResponse> {
    try {
      logger.debug(`TJMT: Enviando petição para processo ${petition.processNumber}`);

      // TJMT uses REST API with OAuth 2.0 + Certificate
      const response = await this.httpClient.post('/petições', {
        numeroProcesso: petition.processNumber,
        documento: petition.content,
        descricao: petition.title,
        documentoRTF: petition.content,
        assunto: petition.subject,
        dataEnvio: new Date().toISOString(),
      });

      if (!response.data.protocolo) {
        throw new Error('Protocolo não retornado pela API TJMT');
      }

      logger.info(`TJMT: Petição enviada com protocolo ${response.data.protocolo}`);

      return {
        protocolo: response.data.protocolo,
        dataProtocolo: new Date(response.data.dataProtocolo || new Date()),
        sucesso: true,
        mensagem: 'Petição enviada com sucesso para TJMT',
      };
    } catch (error) {
      logger.error({ err: error }, 'TJMT: Erro ao enviar petição');
      return {
        protocolo: '',
        dataProtocolo: new Date(),
        sucesso: false,
        mensagem: error instanceof Error ? error.message : 'Erro ao enviar petição',
        erros: [error instanceof Error ? error.message : 'Erro desconhecido'],
      };
    }
  }

  async getPetitionStatus(protocolNumber: string): Promise<PetitionStatus> {
    try {
      logger.debug(`TJMT: Consultando status do protocolo ${protocolNumber}`);

      const response = await this.httpClient.get(`/petições/${protocolNumber}`);

      return {
        protocolo: protocolNumber,
        status: response.data.status || 'processando',
        dataStatus: new Date(response.data.dataStatus || new Date()),
        mensagem: response.data.mensagem,
      };
    } catch (error) {
      logger.error({ err: error }, `TJMT: Erro ao consultar protocolo ${protocolNumber}`);
      throw error;
    }
  }

  async validateCertificate(cert: Buffer, password: string): Promise<boolean> {
    try {
      logger.debug('TJMT: Validando certificado');

      // TJMT accepts OAB digital certificates or e-Notariado
      if (!cert || cert.length === 0) {
        return false;
      }

      // Check PFX magic bytes (3082 or 3083)
      const header = cert.toString('hex', 0, 4);
      return header === '3082' || header === '3083';
    } catch (error) {
      logger.error({ err: error }, 'TJMT: Erro ao validar certificado');
      return false;
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.httpClient.get('/health');
      return response.status === 200;
    } catch {
      return false;
    }
  }

  private buildSearchParams(criteria: SearchCriteria): any {
    const params: any = {};

    if (criteria.partyName) params.parteNome = criteria.partyName;
    if (criteria.subject) params.assunto = criteria.subject;
    if (criteria.startDate) params.dataInicio = criteria.startDate.toISOString().split('T')[0];
    if (criteria.endDate) params.dataFim = criteria.endDate.toISOString().split('T')[0];
    if (criteria.limit) params.limite = criteria.limit;

    return params;
  }

  private normalizeProcess(data: any): Process {
    return {
      number: data.numeroProcesso || data.number,
      cnj: data.CNJ || data.cnj || '',
      tribunal: 'TJMT',
      status: data.status || 'Ativo',
      plaintiff: data.partes?.[0]?.nome || data.plaintiff,
      defendant: data.partes?.[1]?.nome || data.defendant,
      subject: data.assunto || data.subject,
      lastMovement: data.dataAtualizacao || data.lastMovement,
      openDate: data.dataAbertura || data.openDate,
    };
  }
}

export const tjmtAdapter = new TJMTAdapter();
