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

export class TJROAdapter implements TribunalAdapter {
  private eproc_baseUrl: string;
  private pje_baseUrl: string;
  private httpClient: any;
  private pjeClient: any;

  constructor() {
    this.eproc_baseUrl = config.tjro_eproc_api_url || 'https://eproc.tjro.jus.br/api/v1';
    this.pje_baseUrl = config.tjro_pje_api_url || 'https://pje.tjro.jus.br/api';

    this.httpClient = axios.create({
      baseURL: this.eproc_baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    this.pjeClient = axios.create({
      baseURL: this.pje_baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  }

  getName(): string {
    return 'TJRO';
  }

  getBaseUrl(): string {
    return this.eproc_baseUrl;
  }

  getTribunalCode(): string {
    return 'tjro';
  }

  private async detectSystem(number: string): Promise<'eproc' | 'pje'> {
    try {
      // TJRO hybrid detection: check if process is in eProc (preferred) or PJe
      // Process number format helps identify the system:
      // - eProc numbers: newer format with specific digit patterns
      // - PJe numbers: older format
      // First try to get metadata about the process
      try {
        const response = await this.httpClient.head(`/processos/${number}`);
        if (response.status === 200) {
          logger.debug(`TJRO: Processo ${number} identificado em eProc`);
          return 'eproc';
        }
      } catch {
        // Try PJe
      }

      try {
        const response = await this.pjeClient.head(`/processos/${number}`);
        if (response.status === 200) {
          logger.debug(`TJRO: Processo ${number} identificado em PJe`);
          return 'pje';
        }
      } catch {
        // Fall through to DataJud
      }

      // Default to eProc (migration direction)
      logger.debug(`TJRO: Sistema não detectado para ${number}, usando eProc como padrão`);
      return 'eproc';
    } catch (error) {
      logger.warn(`TJRO: Erro ao detectar sistema para ${number}`, error);
      return 'eproc'; // Default fallback
    }
  }

  async getProcess(number: string): Promise<Process> {
    try {
      logger.debug(`TJRO: Obtendo processo ${number}`);

      const system = await this.detectSystem(number);

      try {
        if (system === 'eproc') {
          const response = await this.httpClient.get(`/processos/${number}`);
          if (response.data) {
            return this.normalizeProcess(response.data, 'eproc');
          }
        } else {
          const response = await this.pjeClient.get(`/processos/${number}`);
          if (response.data) {
            return this.normalizeProcess(response.data, 'pje');
          }
        }
      } catch (systemError) {
        logger.warn(`TJRO: Erro ao buscar em ${system}, tentando alternativa`);
      }

      // Fallback to DataJud for both systems
      const processes = await dataJudClient.searchProcesses({
        numeroProcesso: number,
      });

      if (processes.length === 0) {
        throw new Error(`Processo não encontrado: ${number}`);
      }

      return this.normalizeProcess(processes[0], 'datajud');
    } catch (error) {
      logger.error({ err: error }, `TJRO: Erro ao obter processo ${number}`);
      throw error;
    }
  }

  async searchProcesses(criteria: SearchCriteria): Promise<Process[]> {
    try {
      logger.debug(`TJRO: Buscando processos com critérios:`, criteria);

      const results: Process[] = [];

      // Try eProc first (newer system)
      try {
        const params = this.buildSearchParams(criteria);
        const response = await this.httpClient.get('/processos', { params });
        if (response.data && Array.isArray(response.data)) {
          results.push(...response.data.map((p: any) => this.normalizeProcess(p, 'eproc')));
        }
      } catch (eprocError) {
        logger.warn('TJRO: Erro na busca eProc');
      }

      // Try PJe if eProc didn't return results
      if (results.length === 0) {
        try {
          const params = this.buildSearchParams(criteria);
          const response = await this.pjeClient.get('/processos', { params });
          if (response.data && Array.isArray(response.data)) {
            results.push(...response.data.map((p: any) => this.normalizeProcess(p, 'pje')));
          }
        } catch (pjeError) {
          logger.warn('TJRO: Erro na busca PJe');
        }
      }

      // If both fail or return empty, use DataJud
      if (results.length === 0) {
        const dataJudResults = await dataJudClient.searchProcesses({
          parteNome: criteria.partyName,
          assunto: criteria.subject,
          dataRegistroInicio: criteria.startDate?.toISOString().split('T')[0],
          dataRegistroFim: criteria.endDate?.toISOString().split('T')[0],
          limite: criteria.limit || 50,
        });

        results.push(...dataJudResults.map(p => this.normalizeProcess(p, 'datajud')));
      }

      return results;
    } catch (error) {
      logger.error({ err: error }, 'TJRO: Erro ao buscar processos');
      throw error;
    }
  }

  async getMovements(processNumber: string): Promise<Movement[]> {
    try {
      logger.debug(`TJRO: Obtendo movimentações do processo ${processNumber}`);

      const system = await this.detectSystem(processNumber);

      // Try detected system first
      try {
        if (system === 'eproc') {
          const response = await this.httpClient.get(`/movimentacoes/${processNumber}`);
          if (response.data && Array.isArray(response.data)) {
            return this.normalizeMovements(response.data);
          }
        } else {
          const response = await this.pjeClient.get(`/movimentacoes/${processNumber}`);
          if (response.data && Array.isArray(response.data)) {
            return this.normalizeMovements(response.data);
          }
        }
      } catch (systemError) {
        logger.warn(`TJRO: Erro ao buscar movimentações em ${system}, tentando alternativa`);
      }

      // Fallback to DataJud
      const movements = await dataJudClient.getMovements(processNumber);
      return this.normalizeMovements(movements);
    } catch (error) {
      logger.error({ err: error }, `TJRO: Erro ao obter movimentações ${processNumber}`);
      throw error;
    }
  }

  async submitPetition(
    petition: any,
    certificatePath: string,
    certPassword: string,
  ): Promise<ProtocolResponse> {
    try {
      logger.debug(`TJRO: Enviando petição para processo ${petition.processNumber}`);

      // Detect system and submit to appropriate endpoint
      const system = await this.detectSystem(petition.processNumber);

      const client = system === 'eproc' ? this.httpClient : this.pjeClient;
      const response = await client.post('/petições', {
        numeroProcesso: petition.processNumber,
        documento: petition.content,
        descricao: petition.title,
        assunto: petition.subject,
        dataEnvio: new Date().toISOString(),
      });

      if (!response.data.protocolo) {
        throw new Error(`Protocolo não retornado pela API TJRO (${system})`);
      }

      logger.info(`TJRO: Petição enviada em ${system} com protocolo ${response.data.protocolo}`);

      return {
        protocolo: response.data.protocolo,
        dataProtocolo: new Date(response.data.dataProtocolo || new Date()),
        sucesso: true,
        mensagem: `Petição enviada com sucesso para TJRO (${system})`,
      };
    } catch (error) {
      logger.error({ err: error }, 'TJRO: Erro ao enviar petição');
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
      logger.debug(`TJRO: Consultando status do protocolo ${protocolNumber}`);

      // Try both systems (protocol format may indicate which system)
      let response;
      let system = 'eproc';

      try {
        response = await this.httpClient.get(`/petições/${protocolNumber}`);
      } catch {
        try {
          response = await this.pjeClient.get(`/petições/${protocolNumber}`);
          system = 'pje';
        } catch {
          throw new Error('Protocolo não encontrado em nenhum sistema TJRO');
        }
      }

      return {
        protocolo: protocolNumber,
        status: response.data.status || 'processando',
        dataStatus: new Date(response.data.dataStatus || new Date()),
        mensagem: response.data.mensagem,
      };
    } catch (error) {
      logger.error({ err: error }, `TJRO: Erro ao consultar protocolo ${protocolNumber}`);
      throw error;
    }
  }

  async validateCertificate(cert: Buffer, password: string): Promise<boolean> {
    try {
      logger.debug('TJRO: Validando certificado');

      if (!cert || cert.length === 0) {
        return false;
      }

      // TJRO accepts OAB digital certificates
      const header = cert.toString('hex', 0, 4);
      return header === '3082' || header === '3083';
    } catch (error) {
      logger.error({ err: error }, 'TJRO: Erro ao validar certificado');
      return false;
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      // Check both eProc and PJe
      const eprocCheck = this.httpClient
        .get('/health')
        .then((r: any) => r.status === 200)
        .catch(() => false);

      const pjeCheck = this.pjeClient
        .get('/health')
        .then((r: any) => r.status === 200)
        .catch(() => false);

      const results = await Promise.all([eprocCheck, pjeCheck]);
      return results.some(r => r); // At least one system should be healthy
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

  private normalizeMovements(data: any[]): Movement[] {
    return data.map((m: any) => ({
      date: new Date(m.dataMovimentacao || m.data),
      description: m.descricao || m.description,
      status: m.status,
      complement: m.complemento || m.complement,
    }));
  }

  private normalizeProcess(data: any, source: 'eproc' | 'pje' | 'datajud'): Process {
    return {
      number: data.numeroProcesso || data.number,
      cnj: data.CNJ || data.cnj || '',
      tribunal: `TJRO (${source})`,
      status: data.status || 'Ativo',
      plaintiff: data.partes?.[0]?.nome || data.plaintiff,
      defendant: data.partes?.[1]?.nome || data.defendant,
      subject: data.assunto || data.subject,
      lastMovement: data.dataAtualizacao || data.lastMovement,
      openDate: data.dataAbertura || data.openDate,
    };
  }
}

export const tjroAdapter = new TJROAdapter();
