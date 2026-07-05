import axios, { AxiosInstance } from 'axios';
import { logger } from '@utils/logger';
import { config } from '@utils/config';
import { DataJudError, RateLimitError } from '@utils/errors';
import { DataJudProcess, DataJudSearchParams, DataJudApiResponse } from './types';

export class DataJudClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.datajud_api_url,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    if (config.datajud_api_key) {
      this.client.defaults.headers.common['Authorization'] = `APIKey ${config.datajud_api_key}`;
    }

    this.client.interceptors.response.use(
      response => response,
      error => this.handleError(error),
    );
  }

  async searchProcesses(params: DataJudSearchParams): Promise<DataJudProcess[]> {
    try {
      logger.debug(`DataJud: Buscando processos com critérios:`, params);

      const queryParams = this.buildQueryParams(params);
      const response = await this.client.get<DataJudApiResponse<DataJudProcess>>(
        '/processos',
        { params: queryParams },
      );

      logger.info(`DataJud: ${response.data.dados.length} processos encontrados`);
      return response.data.dados;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getProcessByNumber(processNumber: string): Promise<DataJudProcess> {
    try {
      logger.debug(`DataJud: Obtendo processo: ${processNumber}`);

      const formatted = this.normalizeProcessNumber(processNumber);
      const response = await this.client.get<DataJudApiResponse<DataJudProcess>>(
        `/processos/${formatted}`,
      );

      if (response.data.dados.length === 0) {
        throw new DataJudError(`Processo não encontrado: ${processNumber}`);
      }

      return response.data.dados[0];
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async searchByParty(partyName: string, limit: number = 10): Promise<DataJudProcess[]> {
    try {
      logger.debug(`DataJud: Buscando processos da parte: ${partyName}`);

      const response = await this.client.get<DataJudApiResponse<DataJudProcess>>(
        '/processos',
        {
          params: {
            parteNome: partyName,
            limite: limit,
          },
        },
      );

      return response.data.dados;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async searchBySubject(subject: string, limit: number = 10): Promise<DataJudProcess[]> {
    try {
      logger.debug(`DataJud: Buscando por assunto: ${subject}`);

      const response = await this.client.get<DataJudApiResponse<DataJudProcess>>(
        '/processos',
        {
          params: {
            assunto: subject,
            limite: limit,
          },
        },
      );

      return response.data.dados;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async searchByDateRange(startDate: Date, endDate: Date, limit: number = 50): Promise<DataJudProcess[]> {
    try {
      logger.debug(`DataJud: Buscando por intervalo de datas`);

      const response = await this.client.get<DataJudApiResponse<DataJudProcess>>(
        '/processos',
        {
          params: {
            dataRegistroInicio: this.formatDate(startDate),
            dataRegistroFim: this.formatDate(endDate),
            limite: limit,
          },
        },
      );

      return response.data.dados;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getMovements(processNumber: string): Promise<any[]> {
    try {
      const process = await this.getProcessByNumber(processNumber);
      return process.movimentacoes || [];
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private normalizeProcessNumber(processNumber: string): string {
    return processNumber.replace(/\D/g, '');
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private buildQueryParams(params: DataJudSearchParams): Record<string, any> {
    const query: Record<string, any> = {};

    if (params.numeroProcesso) query.numeroProcesso = this.normalizeProcessNumber(params.numeroProcesso);
    if (params.numeroProcessoFormatado) query.numeroProcessoFormatado = params.numeroProcessoFormatado;
    if (params.parteNome) query.parteNome = params.parteNome;
    if (params.partePessoaJuridica) query.partePessoaJuridica = params.partePessoaJuridica;
    if (params.dataRegistroInicio) query.dataRegistroInicio = params.dataRegistroInicio;
    if (params.dataRegistroFim) query.dataRegistroFim = params.dataRegistroFim;
    if (params.dataAtualizacaoInicio) query.dataAtualizacaoInicio = params.dataAtualizacaoInicio;
    if (params.dataAtualizacaoFim) query.dataAtualizacaoFim = params.dataAtualizacaoFim;
    if (params.assunto) query.assunto = params.assunto;
    if (params.formato) query.formato = params.formato || 'json';
    if (params.pagina) query.pagina = params.pagina;
    if (params.limite) query.limite = params.limite;

    return query;
  }

  private handleError(error: any): never {
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.mensagem || error.message;

      if (status === 429) {
        logger.warn('DataJud: Rate limit excedido');
        throw new RateLimitError('Limite de requisições DataJud excedido');
      }

      if (status === 401 || status === 403) {
        logger.error('DataJud: Autenticação falhou');
        throw new DataJudError('API DataJud: Autenticação inválida');
      }

      if (status >= 500) {
        logger.error(`DataJud: Erro do servidor (${status})`);
        throw new DataJudError(`Servidor DataJud indisponível (${status})`);
      }

      logger.error(`DataJud: Erro ${status}: ${message}`);
      throw new DataJudError(`DataJud error: ${message}`);
    }

    if (error.code === 'ECONNABORTED') {
      logger.error('DataJud: Timeout na requisição');
      throw new DataJudError('Timeout ao conectar com DataJud');
    }

    logger.error({ err: error }, 'DataJud: Erro desconhecido');
    throw new DataJudError('Erro ao consultar DataJud');
  }
}

export const dataJudClient = new DataJudClient();
