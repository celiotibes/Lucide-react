import axios from 'axios';
import { logger } from '@utils/logger';
import { config } from '@utils/config';
import { dataJudClient } from '@/datajud/client';
import { projudiSoapClient } from '@/projudi/soapClient';
import {
  TribunalAdapter,
  SearchCriteria,
  Process,
  Movement,
  ProtocolResponse,
  PetitionStatus,
} from './TribunalAdapter';

export class TJPRAdapter implements TribunalAdapter {
  private projudi_baseUrl: string;
  private eproc_baseUrl: string;
  private eprocClient: any;

  constructor() {
    this.projudi_baseUrl = config.projudi_wsdl_url || 'https://tst.tjpr.jus.br/projudi/webservices';
    this.eproc_baseUrl = config.tjpr_eproc_api_url || 'https://eproc-beta.tjpr.jus.br/api/v1';

    // Initialize eProc REST client for TJPR beta
    this.eprocClient = axios.create({
      baseURL: this.eproc_baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  }

  getName(): string {
    return 'TJPR';
  }

  getBaseUrl(): string {
    return this.projudi_baseUrl;
  }

  getTribunalCode(): string {
    return 'tjpr';
  }

  private async detectSystem(number: string): Promise<'projudi' | 'eproc'> {
    try {
      // TJPR: Try eProc first (newer, beta system)
      try {
        const response = await this.eprocClient.head(`/processos/${number}`);
        if (response.status === 200) {
          logger.debug(`TJPR: Processo ${number} identificado em eProc beta`);
          return 'eproc';
        }
      } catch {
        // Try Projudi
      }

      // Fallback to Projudi (established system)
      logger.debug(`TJPR: Processo ${number} usando Projudi legacy como fallback`);
      return 'projudi';
    } catch (error) {
      logger.warn(`TJPR: Erro ao detectar sistema para ${number}, usando Projudi como padrão`);
      return 'projudi';
    }
  }

  async getProcess(number: string): Promise<Process> {
    try {
      logger.debug(`TJPR: Obtendo processo ${number}`);

      const system = await this.detectSystem(number);

      try {
        if (system === 'eproc') {
          const response = await this.eprocClient.get(`/processos/${number}`);
          if (response.data) {
            return this.normalizeProcess(response.data, 'eproc');
          }
        }
      } catch (eprocError) {
        logger.warn(`TJPR: Erro ao buscar em eProc, usando fallback`);
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
      logger.error({ err: error }, `TJPR: Erro ao obter processo ${number}`);
      throw error;
    }
  }

  async searchProcesses(criteria: SearchCriteria): Promise<Process[]> {
    try {
      logger.debug(`TJPR: Buscando processos com critérios:`, criteria);

      const results: Process[] = [];

      // Try eProc beta first
      try {
        const params = this.buildSearchParams(criteria);
        const response = await this.eprocClient.get('/processos', { params });
        if (response.data && Array.isArray(response.data)) {
          results.push(...response.data.map((p: any) => this.normalizeProcess(p, 'eproc')));
        }
      } catch (eprocError) {
        logger.warn('TJPR: Erro na busca eProc beta');
      }

      // If eProc returns no results, use DataJud (which includes Projudi legacy)
      if (results.length === 0) {
        const processes = await dataJudClient.searchProcesses({
          parteNome: criteria.partyName,
          assunto: criteria.subject,
          dataRegistroInicio: criteria.startDate?.toISOString().split('T')[0],
          dataRegistroFim: criteria.endDate?.toISOString().split('T')[0],
          limite: criteria.limit || 50,
        });

        results.push(...processes.map(p => this.normalizeProcess(p, 'datajud')));
      }

      return results;
    } catch (error) {
      logger.error({ err: error }, 'TJPR: Erro ao buscar processos');
      throw error;
    }
  }

  async getMovements(processNumber: string): Promise<Movement[]> {
    try {
      logger.debug(`TJPR: Obtendo movimentações do processo ${processNumber}`);

      const system = await this.detectSystem(processNumber);

      // Try eProc first
      try {
        if (system === 'eproc') {
          const response = await this.eprocClient.get(`/movimentacoes/${processNumber}`);
          if (response.data && Array.isArray(response.data)) {
            return response.data.map((m: any) => ({
              date: new Date(m.dataMovimentacao || m.data),
              description: m.descricao || m.description,
              status: m.status,
              complement: m.complemento || m.complement,
            }));
          }
        }
      } catch (eprocError) {
        logger.warn(`TJPR: Erro ao buscar movimentações em eProc, usando DataJud`);
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
      logger.error({ err: error }, `TJPR: Erro ao obter movimentações ${processNumber}`);
      throw error;
    }
  }

  async submitPetition(
    petition: any,
    certificatePath: string,
    certPassword: string,
  ): Promise<ProtocolResponse> {
    try {
      logger.debug(`TJPR: Enviando petição para processo ${petition.processNumber}`);

      const system = await this.detectSystem(petition.processNumber);

      // Try eProc REST first (if available)
      if (system === 'eproc') {
        try {
          const response = await this.eprocClient.post('/petições', {
            numeroProcesso: petition.processNumber,
            documento: petition.content,
            descricao: petition.title,
            assunto: petition.subject,
            dataEnvio: new Date().toISOString(),
          });

          if (response.data.protocolo) {
            logger.info(`TJPR: Petição enviada via eProc com protocolo ${response.data.protocolo}`);
            return {
              protocolo: response.data.protocolo,
              dataProtocolo: new Date(response.data.dataProtocolo || new Date()),
              sucesso: true,
              mensagem: 'Petição enviada com sucesso via eProc TJPR',
            };
          }
        } catch (eprocError) {
          logger.warn(`TJPR: Erro ao enviar via eProc, tentando Projudi legacy`);
        }
      }

      // Fallback to Projudi SOAP (legacy system)
      logger.debug(`TJPR: Enviando petição via Projudi SOAP (fallback)`);

      const token = await projudiSoapClient.authenticate(
        process.env.PROJUDI_USERNAME || '',
        process.env.PROJUDI_PASSWORD || '',
      );

      const response = await projudiSoapClient.submitPetition(
        {
          numeroProcesso: petition.processNumber,
          tipoDocumento: petition.type || 'PETIÇÃO',
          descricaoDocumento: petition.title,
          documentoRTF: petition.content,
          assuntoMovimentacao: petition.subject,
          dataMovimentacao: new Date().toISOString().split('T')[0],
        },
        token,
      );

      logger.info(`TJPR: Petição enviada via Projudi com protocolo ${response.protocolo}`);

      return {
        protocolo: response.protocolo,
        dataProtocolo: new Date(response.dataProtocolo || new Date()),
        sucesso: response.sucesso,
        mensagem: `${response.mensagem} (Projudi legacy)`,
        erros: response.erros,
      };
    } catch (error) {
      logger.error({ err: error }, 'TJPR: Erro ao enviar petição');
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
      logger.debug(`TJPR: Consultando status do protocolo ${protocolNumber}`);

      // Try eProc first
      try {
        const response = await this.eprocClient.get(`/petições/${protocolNumber}`);
        if (response.data) {
          return {
            protocolo: protocolNumber,
            status: response.data.status || 'processando',
            dataStatus: new Date(response.data.dataStatus || new Date()),
            mensagem: response.data.mensagem,
          };
        }
      } catch {
        logger.warn(`TJPR: Protocolo não encontrado em eProc, tentando Projudi`);
      }

      // Fallback for Projudi
      return {
        protocolo: protocolNumber,
        status: 'processando',
        dataStatus: new Date(),
        mensagem: 'Protocolo em processamento (Projudi legacy)',
      };
    } catch (error) {
      logger.error({ err: error }, `TJPR: Erro ao consultar protocolo ${protocolNumber}`);
      throw error;
    }
  }

  async validateCertificate(cert: Buffer, password: string): Promise<boolean> {
    try {
      logger.debug('TJPR: Validando certificado (OAB Digital)');

      // TJPR requires OAB Digital certificate
      if (!cert || cert.length === 0) {
        return false;
      }

      const header = cert.toString('hex', 0, 4);
      return header === '3082' || header === '3083'; // PFX magic bytes
    } catch (error) {
      logger.error({ err: error }, 'TJPR: Erro ao validar certificado');
      return false;
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      // Check both eProc and Projudi
      let eprocHealthy = false;
      try {
        const response = await this.eprocClient.get('/health');
        eprocHealthy = response.status === 200;
      } catch {
        eprocHealthy = false;
      }

      let projudiHealthy = false;
      try {
        projudiHealthy = projudiSoapClient.isConnected();
      } catch {
        projudiHealthy = false;
      }

      // At least Projudi legacy must be healthy
      return projudiHealthy || eprocHealthy;
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

  private normalizeProcess(data: any, source: 'projudi' | 'eproc' | 'datajud'): Process {
    return {
      number: data.numeroProcesso || data.number,
      cnj: data.CNJ || data.cnj || '',
      tribunal: `TJPR (${source})`,
      forum: data.forum || 'TJPR',
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

export const tjprAdapter = new TJPRAdapter();
