import axios, { AxiosInstance } from 'axios';
import { logger } from '@utils/logger';
import { config } from '@utils/config';

export interface JUDITMovement {
  data: Date;
  descricao: string;
  status?: string;
  complemento?: string;
}

export interface JUDITParte {
  nome: string;
  capacidade: string;
  polo?: string;
}

export interface JUDITPrazo {
  descricao: string;
  dataVencimento: Date;
  tipo?: string;
}

export interface JUDITDocumento {
  nome: string;
  dataJuntada: Date;
  tipo?: string;
  url?: string;
}

export interface JUDITDecisao {
  data: Date;
  texto: string;
  julgador: string;
  classe?: string;
}

export interface JUDITProcess {
  numeroProcesso: string;
  cnj: string;
  tribunal: string;
  status: string;
  partes: JUDITParte[];
  movimentacoes: JUDITMovement[];
  prazos: JUDITPrazo[];
  documentos: JUDITDocumento[];
  decisoes: JUDITDecisao[];
  dataAbertura?: Date;
  dataAtualizacao?: Date;
}

export interface JUDITMonitoringSubscription {
  id: string;
  numero: string;
  webhookUrl: string;
  events: string[];
  createdAt: Date;
  expiresAt?: Date;
  ativo: boolean;
}

export interface JUDITSearchCriteria {
  parteNome?: string;
  assunto?: string;
  dataInicio?: Date;
  dataFim?: Date;
  status?: string;
  tribunal?: string;
  limit?: number;
  offset?: number;
}

export class JUDITClient {
  private http: AxiosInstance;
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = config.judit_api_url || 'https://api.cnj.jus.br/judit/v1';
    this.apiKey = config.judit_api_key || '';

    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'LegalAutomationTool/1.0',
      },
    });

    if (this.apiKey) {
      this.http.defaults.headers.common['X-API-Key'] = this.apiKey;
    }
  }

  async consultarProcesso(numeroProcesso: string): Promise<JUDITProcess> {
    try {
      logger.debug(`JUDIT: Consultando processo ${numeroProcesso}`);

      const response = await this.http.get(`/processos/${numeroProcesso}`);

      return this.normalizeProcess(response.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        logger.warn(`JUDIT: Processo ${numeroProcesso} não encontrado`);
        throw new Error(`Processo ${numeroProcesso} não encontrado na JUDIT`);
      }
      logger.error({ err: error }, `JUDIT: Erro ao consultar ${numeroProcesso}`);
      throw error;
    }
  }

  async buscarProcessos(criteria: JUDITSearchCriteria): Promise<JUDITProcess[]> {
    try {
      logger.debug('JUDIT: Buscando processos', criteria);

      const params = {
        parteNome: criteria.parteNome,
        assunto: criteria.assunto,
        dataInicio: criteria.dataInicio?.toISOString().split('T')[0],
        dataFim: criteria.dataFim?.toISOString().split('T')[0],
        status: criteria.status,
        tribunal: criteria.tribunal,
        limit: criteria.limit || 50,
        offset: criteria.offset || 0,
      };

      // Remove undefined params
      Object.keys(params).forEach(
        (key) => params[key as keyof typeof params] === undefined && delete params[key as keyof typeof params],
      );

      const response = await this.http.get('/processos/search', { params });

      return response.data.processos?.map((p: any) => this.normalizeProcess(p)) || [];
    } catch (error) {
      logger.error({ err: error }, 'JUDIT: Erro ao buscar processos');
      throw error;
    }
  }

  async monitorarProcesso(
    numeroProcesso: string,
    webhookUrl: string,
    events: string[] = ['movimentacao', 'prazo', 'decisao'],
  ): Promise<JUDITMonitoringSubscription> {
    try {
      logger.info(`JUDIT: Criando monitoramento para ${numeroProcesso}`);

      const response = await this.http.post('/monitoramento/subscribe', {
        numeroProcesso,
        webhookUrl,
        eventos: events,
      });

      return {
        id: response.data.subscricao_id || response.data.id,
        numero: numeroProcesso,
        webhookUrl,
        events,
        createdAt: new Date(response.data.data_criacao || new Date()),
        expiresAt: response.data.data_expiracao
          ? new Date(response.data.data_expiracao)
          : undefined,
        ativo: response.data.ativo !== false,
      };
    } catch (error) {
      logger.error({ err: error }, 'JUDIT: Erro ao monitorar processo');
      throw error;
    }
  }

  async pararMonitoramento(subscriptionId: string): Promise<void> {
    try {
      logger.info(`JUDIT: Cancelando monitoramento ${subscriptionId}`);

      await this.http.delete(`/monitoramento/${subscriptionId}`);

      logger.info(`JUDIT: Monitoramento ${subscriptionId} cancelado`);
    } catch (error) {
      logger.error({ err: error }, 'JUDIT: Erro ao cancelar monitoramento');
      throw error;
    }
  }

  async listarMonitoramentos(): Promise<JUDITMonitoringSubscription[]> {
    try {
      logger.debug('JUDIT: Listando monitoramentos ativos');

      const response = await this.http.get('/monitoramento/subscricoes');

      return (response.data.subscricoes || []).map((s: any) => ({
        id: s.subscricao_id || s.id,
        numero: s.numero_processo,
        webhookUrl: s.webhook_url,
        events: s.eventos || [],
        createdAt: new Date(s.data_criacao),
        expiresAt: s.data_expiracao ? new Date(s.data_expiracao) : undefined,
        ativo: s.ativo !== false,
      }));
    } catch (error) {
      logger.error({ err: error }, 'JUDIT: Erro ao listar monitoramentos');
      throw error;
    }
  }

  async validarOAB(numeroOAB: string, estado: string): Promise<boolean> {
    try {
      logger.debug(`JUDIT: Validando OAB ${numeroOAB}/${estado}`);

      const response = await this.http.get('/oab/validar', {
        params: { numero: numeroOAB, estado },
      });

      return response.data.valida === true || response.data.valid === true;
    } catch (error) {
      logger.error({ err: error }, 'JUDIT: Erro ao validar OAB');
      throw error;
    }
  }

  async obterDadosOAB(numeroOAB: string, estado: string): Promise<any> {
    try {
      logger.debug(`JUDIT: Obtendo dados da OAB ${numeroOAB}/${estado}`);

      const response = await this.http.get('/oab/informacoes', {
        params: { numero: numeroOAB, estado },
      });

      return response.data;
    } catch (error) {
      logger.error({ err: error }, 'JUDIT: Erro ao obter dados OAB');
      throw error;
    }
  }

  async obterEstatisticas(tribunal?: string): Promise<any> {
    try {
      logger.debug(`JUDIT: Obtendo estatísticas` + (tribunal ? ` para ${tribunal}` : ''));

      const response = await this.http.get('/estatisticas', {
        params: tribunal ? { tribunal } : {},
      });

      return response.data;
    } catch (error) {
      logger.error({ err: error }, 'JUDIT: Erro ao obter estatísticas');
      throw error;
    }
  }

  private normalizeProcess(data: any): JUDITProcess {
    return {
      numeroProcesso: data.numero_processo || data.numeroProcesso || data.numero,
      cnj: data.cnj || data.cnj_processual || '',
      tribunal: data.tribunal_nome || data.tribunal || 'Desconhecido',
      status: data.status || data.situacao || 'Desconhecido',
      partes: (data.partes || []).map((p: any) => ({
        nome: p.nome,
        capacidade: p.capacidade || 'Parte',
        polo: p.polo || p.tipo,
      })),
      movimentacoes: (data.movimentacoes || []).map((m: any) => ({
        data: new Date(m.data || m.data_movimentacao),
        descricao: m.descricao || m.tipo,
        status: m.status,
        complemento: m.complemento || m.descricao_complementar,
      })),
      prazos: (data.prazos || []).map((p: any) => ({
        descricao: p.descricao || p.nome,
        dataVencimento: new Date(p.data_vencimento || p.dataVencimento),
        tipo: p.tipo,
      })),
      documentos: (data.documentos || []).map((d: any) => ({
        nome: d.nome || d.titulo,
        dataJuntada: new Date(d.data_juntada || d.dataJuntada),
        tipo: d.tipo,
        url: d.url,
      })),
      decisoes: (data.decisoes || []).map((d: any) => ({
        data: new Date(d.data_decisao || d.data),
        texto: d.texto || d.ementa,
        julgador: d.julgador || d.magistrado || 'Desconhecido',
        classe: d.classe || d.tipo_decisao,
      })),
      dataAbertura: data.data_abertura || data.dataAbertura
        ? new Date(data.data_abertura || data.dataAbertura)
        : undefined,
      dataAtualizacao: data.data_atualizacao || data.dataAtualizacao
        ? new Date(data.data_atualizacao || data.dataAtualizacao)
        : new Date(),
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      logger.debug('JUDIT: Executando health check');
      const response = await this.http.get('/health');
      return response.status === 200;
    } catch (error) {
      logger.error({ err: error }, 'JUDIT: Health check falhou');
      return false;
    }
  }
}

export const juditClient = new JUDITClient();
