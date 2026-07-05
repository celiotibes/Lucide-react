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

export class TRF4Adapter implements TribunalAdapter {
  private baseUrl: string;
  private httpClient: any;

  constructor() {
    this.baseUrl = config.trf4_api_url || 'https://portal-eproc.trf4.jus.br/eprocV2/';
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      auth: {
        username: config.trf4_login || '',
        password: config.trf4_password || '',
      },
    });
  }

  getName(): string {
    return 'TRF4';
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getTribunalCode(): string {
    return 'trf4';
  }

  async getProcess(number: string): Promise<Process> {
    try {
      logger.debug(`TRF4: Obtendo processo ${number}`);

      const processes = await dataJudClient.searchProcesses({
        numeroProcesso: number,
      });

      if (processes.length === 0) {
        throw new Error(`Processo não encontrado: ${number}`);
      }

      return this.normalizeProcess(processes[0]);
    } catch (error) {
      logger.error({ err: error }, `TRF4: Erro ao obter processo ${number}`);
      throw error;
    }
  }

  async searchProcesses(criteria: SearchCriteria): Promise<Process[]> {
    try {
      logger.debug(`TRF4: Buscando processos com critérios:`, criteria);

      const processes = await dataJudClient.searchProcesses({
        parteNome: criteria.partyName,
        assunto: criteria.subject,
        dataRegistroInicio: criteria.startDate?.toISOString().split('T')[0],
        dataRegistroFim: criteria.endDate?.toISOString().split('T')[0],
        limite: criteria.limit || 50,
      });

      return processes.map(p => this.normalizeProcess(p));
    } catch (error) {
      logger.error({ err: error }, 'TRF4: Erro ao buscar processos');
      throw error;
    }
  }

  async getMovements(processNumber: string): Promise<Movement[]> {
    try {
      logger.debug(`TRF4: Obtendo movimentações do processo ${processNumber}`);

      const movements = await dataJudClient.getMovements(processNumber);

      return movements.map((m: any) => ({
        date: new Date(m.dataMovimentacao || m.data),
        description: m.descricao || m.description,
        status: m.status,
        complement: m.complemento || m.complement,
      }));
    } catch (error) {
      logger.error({ err: error }, `TRF4: Erro ao obter movimentações ${processNumber}`);
      throw error;
    }
  }

  async submitPetition(
    petition: any,
    certificatePath: string,
    certPassword: string,
  ): Promise<ProtocolResponse> {
    try {
      logger.debug(`TRF4: Enviando petição para processo ${petition.processNumber}`);

      // TRF4 uses REST with basic auth + certificate
      const response = await this.httpClient.post('/consultar', {
        numeroProcesso: petition.processNumber,
        tipoDocumento: petition.type || 'INICIAL',
        descricaoDocumento: petition.title,
        documentoRTF: petition.content,
        assunto: petition.subject,
      });

      if (!response.data.protocolo) {
        throw new Error('Protocolo não retornado pela API');
      }

      logger.info(`TRF4: Petição enviada com protocolo ${response.data.protocolo}`);

      return {
        protocolo: response.data.protocolo,
        dataProtocolo: new Date(response.data.dataProtocolo || new Date()),
        sucesso: true,
        mensagem: 'Petição enviada com sucesso',
      };
    } catch (error) {
      logger.error({ err: error }, 'TRF4: Erro ao enviar petição');
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
      logger.debug(`TRF4: Consultando status do protocolo ${protocolNumber}`);

      const response = await this.httpClient.get(`/protocolo/${protocolNumber}`);

      return {
        protocolo: protocolNumber,
        status: response.data.status || 'processando',
        dataStatus: new Date(response.data.dataStatus || new Date()),
        mensagem: response.data.mensagem,
      };
    } catch (error) {
      logger.error({ err: error }, `TRF4: Erro ao consultar protocolo ${protocolNumber}`);
      throw error;
    }
  }

  async validateCertificate(cert: Buffer, password: string): Promise<boolean> {
    try {
      logger.debug('TRF4: Validando certificado');

      // TRF4 accepts digital certificates (not necessarily OAB)
      if (!cert || cert.length === 0) {
        return false;
      }

      const header = cert.toString('hex', 0, 4);
      return header === '3082' || header === '3083'; // PFX magic bytes
    } catch (error) {
      logger.error({ err: error }, 'TRF4: Erro ao validar certificado');
      return false;
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.httpClient.get('/api/health');
      return response.status === 200;
    } catch {
      return false;
    }
  }

  private normalizeProcess(data: any): Process {
    return {
      number: data.numeroProcesso || data.number,
      cnj: data.CNJ || data.cnj || '',
      tribunal: 'TRF4',
      status: data.status || 'Ativo',
      plaintiff: data.partes?.[0]?.nome || data.plaintiff,
      defendant: data.partes?.[1]?.nome || data.defendant,
      subject: data.assunto || data.subject,
      lastMovement: data.dataAtualizacao || data.lastMovement,
      openDate: data.dataAbertura || data.openDate,
    };
  }
}

export const trf4Adapter = new TRF4Adapter();
