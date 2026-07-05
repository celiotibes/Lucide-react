import axios, { AxiosInstance } from 'axios';
import { logger } from '@utils/logger';
import { config } from '@utils/config';

export interface CodiloAlert {
  id: string;
  processNumber: string;
  tribunal: string;
  type: 'movementacao' | 'prazo' | 'decisao' | 'custom' | 'notificacao';
  description: string;
  timestamp: Date;
  importance: 'alta' | 'media' | 'baixa';
  read: boolean;
  details?: Record<string, any>;
}

export interface CodiloMonitoring {
  id: string;
  query: string;
  webhookUrl: string;
  active: boolean;
  createdAt: Date;
  lastAlert?: Date;
  totalAlerts: number;
}

export interface CodiloMonitoringQuery {
  parteNome?: string;
  assunto?: string;
  classes?: string[];
  segmentos?: string[];
  tribunais?: string[];
  dataInicio?: Date;
  dataFim?: Date;
}

export class CodiloClient {
  private http: AxiosInstance;
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = config.codilo_api_url || 'https://api.codilo.com.br/v2';
    this.apiKey = config.codilo_api_key || '';

    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (this.apiKey) {
      this.http.defaults.headers.common['Authorization'] = `Bearer ${this.apiKey}`;
    }
  }

  async monitorarNacional(query: CodiloMonitoringQuery, webhookUrl: string): Promise<CodiloMonitoring> {
    try {
      logger.info('Codilo: Iniciando monitoramento nacional', query);

      const params = {
        parteNome: query.parteNome,
        assunto: query.assunto,
        classes: query.classes,
        segmentos: query.segmentos,
        tribunais: query.tribunais,
        dataInicio: query.dataInicio?.toISOString().split('T')[0],
        dataFim: query.dataFim?.toISOString().split('T')[0],
        webhookUrl,
      };

      const response = await this.http.post('/monitoramento', params);

      return {
        id: response.data.id || response.data.monitoramento_id,
        query: JSON.stringify(query),
        webhookUrl,
        active: response.data.ativo !== false,
        createdAt: new Date(response.data.data_criacao || new Date()),
        lastAlert: response.data.ultimo_alerta ? new Date(response.data.ultimo_alerta) : undefined,
        totalAlerts: response.data.total_alertas || 0,
      };
    } catch (error) {
      logger.error({ err: error }, 'Codilo: Erro ao iniciar monitoramento');
      throw error;
    }
  }

  async obterAlertas(
    limite: number = 50,
    offset: number = 0,
    naoLidos: boolean = false,
  ): Promise<CodiloAlert[]> {
    try {
      logger.debug(`Codilo: Obtendo alertas (limite: ${limite}, offset: ${offset})`);

      const response = await this.http.get('/alertas', {
        params: {
          limit: limite,
          offset,
          nao_lidos: naoLidos,
        },
      });

      return (response.data.alertas || []).map((a: any) => ({
        id: a.id,
        processNumber: a.numero_processo || a.process_number,
        tribunal: a.tribunal,
        type: a.tipo || 'notificacao',
        description: a.descricao || a.description,
        timestamp: new Date(a.data || a.timestamp),
        importance: a.importancia || a.importance || 'media',
        read: a.lido === true || a.read === true,
        details: a.detalhes || a.details,
      }));
    } catch (error) {
      logger.error({ err: error }, 'Codilo: Erro ao obter alertas');
      throw error;
    }
  }

  async marcarAlertaComoLido(alertaId: string): Promise<void> {
    try {
      await this.http.post(`/alertas/${alertaId}/lido`);
      logger.debug(`Codilo: Alerta ${alertaId} marcado como lido`);
    } catch (error) {
      logger.error({ err: error }, 'Codilo: Erro ao marcar alerta');
      throw error;
    }
  }

  async marcarTodosComoLidos(): Promise<void> {
    try {
      await this.http.post('/alertas/marcar-todos-lidos');
      logger.info('Codilo: Todos os alertas marcados como lidos');
    } catch (error) {
      logger.error({ err: error }, 'Codilo: Erro ao marcar todos como lidos');
      throw error;
    }
  }

  async obterMonitoramentos(ativo: boolean = true): Promise<CodiloMonitoring[]> {
    try {
      logger.debug('Codilo: Listando monitoramentos', { ativo });

      const response = await this.http.get('/monitoramento', {
        params: { ativo },
      });

      return (response.data.monitoramentos || []).map((m: any) => ({
        id: m.id,
        query: m.query || '',
        webhookUrl: m.webhook_url,
        active: m.ativo !== false,
        createdAt: new Date(m.data_criacao),
        lastAlert: m.ultimo_alerta ? new Date(m.ultimo_alerta) : undefined,
        totalAlerts: m.total_alertas || 0,
      }));
    } catch (error) {
      logger.error({ err: error }, 'Codilo: Erro ao listar monitoramentos');
      throw error;
    }
  }

  async obterMonitoramento(monitoringId: string): Promise<CodiloMonitoring> {
    try {
      logger.debug(`Codilo: Obtendo detalhes do monitoramento ${monitoringId}`);

      const response = await this.http.get(`/monitoramento/${monitoringId}`);

      const m = response.data;
      return {
        id: m.id,
        query: m.query || '',
        webhookUrl: m.webhook_url,
        active: m.ativo !== false,
        createdAt: new Date(m.data_criacao),
        lastAlert: m.ultimo_alerta ? new Date(m.ultimo_alerta) : undefined,
        totalAlerts: m.total_alertas || 0,
      };
    } catch (error) {
      logger.error({ err: error }, `Codilo: Erro ao obter monitoramento ${monitoringId}`);
      throw error;
    }
  }

  async pararMonitoramento(monitoringId: string): Promise<void> {
    try {
      logger.info(`Codilo: Cancelando monitoramento ${monitoringId}`);

      await this.http.delete(`/monitoramento/${monitoringId}`);

      logger.info(`Codilo: Monitoramento ${monitoringId} cancelado`);
    } catch (error) {
      logger.error({ err: error }, 'Codilo: Erro ao cancelar monitoramento');
      throw error;
    }
  }

  async buscarProcesso(numeroProcesso: string): Promise<any> {
    try {
      logger.debug(`Codilo: Buscando processo ${numeroProcesso}`);

      const response = await this.http.get(`/processos/${numeroProcesso}`);

      return response.data;
    } catch (error) {
      logger.error({ err: error }, `Codilo: Erro ao buscar ${numeroProcesso}`);
      throw error;
    }
  }

  async buscarProcessos(query: CodiloMonitoringQuery): Promise<any[]> {
    try {
      logger.debug('Codilo: Buscando processos', query);

      const params = {
        parteNome: query.parteNome,
        assunto: query.assunto,
        classes: query.classes,
        segmentos: query.segmentos,
        tribunais: query.tribunais,
        dataInicio: query.dataInicio?.toISOString().split('T')[0],
        dataFim: query.dataFim?.toISOString().split('T')[0],
      };

      const response = await this.http.get('/processos/buscar', { params });

      return response.data.processos || [];
    } catch (error) {
      logger.error({ err: error }, 'Codilo: Erro ao buscar processos');
      throw error;
    }
  }

  async obterEstatisticas(): Promise<any> {
    try {
      logger.debug('Codilo: Obtendo estatísticas');

      const response = await this.http.get('/estatisticas');

      return response.data;
    } catch (error) {
      logger.error({ err: error }, 'Codilo: Erro ao obter estatísticas');
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      logger.debug('Codilo: Executando health check');
      const response = await this.http.get('/health');
      return response.status === 200;
    } catch (error) {
      logger.error({ err: error }, 'Codilo: Health check falhou');
      return false;
    }
  }
}

export const codiloClient = new CodiloClient();
