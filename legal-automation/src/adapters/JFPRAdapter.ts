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

export class JFPRAdapter implements TribunalAdapter {
  private baseUrl: string;
  private httpClient: any;

  constructor() {
    this.baseUrl = config.jfpr_api_url || 'https://eproc.jfpr.jus.br/api';
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    if (config.jfpr_login && config.jfpr_password) {
      this.httpClient.defaults.auth = {
        username: config.jfpr_login,
        password: config.jfpr_password,
      };
    }
  }

  getName(): string {
    return 'JFPR';
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getTribunalCode(): string {
    return 'jfpr';
  }

  async getProcess(number: string): Promise<Process> {
    try {
      logger.debug(`JFPR: Obtendo processo ${number}`);

      const processes = await dataJudClient.searchProcesses({
        numeroProcesso: number,
      });

      if (processes.length === 0) {
        throw new Error(`Processo não encontrado: ${number}`);
      }

      return this.normalizeProcess(processes[0]);
    } catch (error) {
      logger.error({ err: error }, `JFPR: Erro ao obter processo ${number}`);
      throw error;
    }
  }

  async searchProcesses(criteria: SearchCriteria): Promise<Process[]> {
    try {
      logger.debug(`JFPR: Buscando processos com critérios:`, criteria);

      const processes = await dataJudClient.searchProcesses({
        parteNome: criteria.partyName,
        assunto: criteria.subject,
        dataRegistroInicio: criteria.startDate?.toISOString().split('T')[0],
        dataRegistroFim: criteria.endDate?.toISOString().split('T')[0],
        limite: criteria.limit || 50,
      });

      return processes.map(p => this.normalizeProcess(p));
    } catch (error) {
      logger.error({ err: error }, 'JFPR: Erro ao buscar processos');
      throw error;
    }
  }

  async getMovements(processNumber: string): Promise<Movement[]> {
    try {
      logger.debug(`JFPR: Obtendo movimentações do processo ${processNumber}`);

      const movements = await dataJudClient.getMovements(processNumber);

      return movements.map((m: any) => ({
        date: new Date(m.dataMovimentacao || m.data),
        description: m.descricao || m.description,
        status: m.status,
        complement: m.complemento || m.complement,
      }));
    } catch (error) {
      logger.error({ err: error }, `JFPR: Erro ao obter movimentações ${processNumber}`);
      throw error;
    }
  }

  async submitPetition(
    petition: any,
    certificatePath: string,
    certPassword: string,
  ): Promise<ProtocolResponse> {
    try {
      logger.debug(`JFPR: Enviando petição para processo ${petition.processNumber}`);

      const response = await this.httpClient.post('/petitions', {
        numeroProcesso: petition.processNumber,
        documento: petition.content,
        descricao: petition.title,
        documentoRTF: petition.content,
        assunto: petition.subject,
      });

      if (!response.data.protocolo) {
        throw new Error('Protocolo não retornado pela API');
      }

      logger.info(`JFPR: Petição enviada com protocolo ${response.data.protocolo}`);

      return {
        protocolo: response.data.protocolo,
        dataProtocolo: new Date(response.data.dataProtocolo || new Date()),
        sucesso: true,
        mensagem: 'Petição enviada com sucesso',
      };
    } catch (error) {
      logger.error({ err: error }, 'JFPR: Erro ao enviar petição');
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
      logger.debug(`JFPR: Consultando status do protocolo ${protocolNumber}`);

      const response = await this.httpClient.get(`/petitions/${protocolNumber}`);

      return {
        protocolo: protocolNumber,
        status: response.data.status || 'processando',
        dataStatus: new Date(response.data.dataStatus || new Date()),
        mensagem: response.data.mensagem,
      };
    } catch (error) {
      logger.error({ err: error }, `JFPR: Erro ao consultar protocolo ${protocolNumber}`);
      throw error;
    }
  }

  async validateCertificate(cert: Buffer, password: string): Promise<boolean> {
    try {
      logger.debug('JFPR: Validando certificado');

      if (!cert || cert.length === 0) {
        return false;
      }

      const header = cert.toString('hex', 0, 4);
      return header === '3082' || header === '3083'; // PFX magic bytes
    } catch (error) {
      logger.error({ err: error }, 'JFPR: Erro ao validar certificado');
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

  private normalizeProcess(data: any): Process {
    return {
      number: data.numeroProcesso || data.number,
      cnj: data.CNJ || data.cnj || '',
      tribunal: 'JFPR',
      forum: data.forum || 'JFPR',
      status: data.status || 'Ativo',
      subject: data.assunto || data.subject,
      parties: data.partes || [],
      plaintiff: data.partes?.[0]?.nome || data.plaintiff,
      defendant: data.partes?.[1]?.nome || data.defendant,
      lastUpdate: data.dataAtualizacao ? new Date(data.dataAtualizacao) : new Date(),
      lastMovement: data.dataAtualizacao || data.lastMovement,
      filingDate: data.dataProtocolo ? new Date(data.dataProtocolo) : new Date(),
      openDate: data.dataAbertura || data.openDate,
    };
  }
}

export const jfprAdapter = new JFPRAdapter();
