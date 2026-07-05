import axios, { AxiosInstance } from 'axios';
import { logger } from '@utils/logger';
import {
  TribunalAdapter,
  SearchOptions,
  SubmitPetitionResponse,
} from './TribunalAdapter';
import {
  eSAJConfig,
  eSAJProcess,
  eSAJSearchResult,
  ProcessNotFoundError,
} from '@types/tribunalAdapters';

export class eSAJAdapter implements TribunalAdapter {
  private client: AxiosInstance;
  private config: eSAJConfig;

  constructor(config: eSAJConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.apiUrl,
      timeout: 30000,
    });
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

  async searchProcess(processNumber: string): Promise<eSAJProcess> {
    try {
      const cleanNumber = processNumber.replace(/\D/g, '');

      const response = await this.client.post('/consultarprocesso', {
        cdProcesso: cleanNumber,
        sgTribunal: this.config.courtSystem,
      });

      if (!response.data || !response.data.processo) {
        throw new ProcessNotFoundError(processNumber, 'eSAJ');
      }

      return this.mapeSAJResponse(response.data.processo, processNumber);
    } catch (error) {
      logger.error({ err: error }, `Erro ao buscar processo ${processNumber} em eSAJ`);

      if (error instanceof ProcessNotFoundError) {
        throw error;
      }

      throw new ProcessNotFoundError(processNumber, 'eSAJ');
    }
  }

  async searchProcessByParty(partyName: string, options?: SearchOptions): Promise<eSAJSearchResult[]> {
    try {
      const response = await this.client.post('/consultarpartes', {
        nmParte: partyName,
        sgTribunal: this.config.courtSystem,
        maxRegistros: options?.limit || 50,
        inicioRegistro: options?.offset || 0,
      });

      return (response.data.processos || []).map((p: any) => ({
        cdProcesso: p.cdProcesso,
        dsProcesso: p.dsAssunto,
        nmParte: p.nmParte,
        dtMovimentacao: new Date(p.dtMovimentacao),
      }));
    } catch (error) {
      logger.error({ err: error }, `Erro ao buscar processos pela parte ${partyName} em eSAJ`);
      return [];
    }
  }

  async submitPetition(caseNumber: string, petition: any): Promise<SubmitPetitionResponse> {
    try {
      const cleanNumber = caseNumber.replace(/\D/g, '');

      const payload = {
        cdProcesso: cleanNumber,
        sgTribunal: this.config.courtSystem,
        dsDocumento: petition.content,
        tpDocumento: petition.type || 'Petição',
        nrSequencia: petition.sequence || 1,
      };

      if (petition.attachments) {
        payload.arquivos = petition.attachments.map((att: any) => ({
          nmArquivo: att.name,
          dsBinario: att.content,
        }));
      }

      const response = await this.client.post('/protocolarpdocumento', payload);

      if (response.status === 200 && response.data.idDocumento) {
        return {
          success: true,
          caseNumber,
          submissionId: response.data.idDocumento,
          timestamp: new Date(),
          message: 'Petição protocolada com sucesso no eSAJ',
        };
      }

      throw new Error('Falha ao protocolar petição');
    } catch (error) {
      logger.error({ err: error }, `Erro ao submeter petição ao eSAJ para caso ${caseNumber}`);

      return {
        success: false,
        caseNumber,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        timestamp: new Date(),
      };
    }
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
      processNumber,
      status: this.mapStatus(data.stProcesso),
      currentPhase: data.dsAssunto || 'Fase desconhecida',
      lastUpdate: new Date(data.dtUltimaMovimentacao),
      origin: 'eSAJ',
      subjectCode: data.cdAssunto || '',
      judgeId: data.idJuiz,
      forum: data.nmForo || 'Foro desconhecido',
      movements: (data.movimentacoes || []).map((m: any) => ({
        id: m.idMovimentacao,
        type: m.tpMovimentacao,
        description: m.dsMovimentacao,
        date: new Date(m.dtMovimentacao),
      })),
      parties: (data.partes || []).map((p: any) => ({
        id: p.idParte,
        name: p.nmParte,
        role: this.mapRole(p.tpParte),
        documentId: p.cdCPF || p.cdCNPJ,
        representative: p.nmAdvogado,
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
        priority: this.mapPriority(p.priority),
      })),
    };
  }

  private mapStatus(status: string): 'active' | 'pending' | 'concluded' | 'archived' {
    const statusMap: Record<string, 'active' | 'pending' | 'concluded' | 'archived'> = {
      'A': 'active',
      'P': 'pending',
      'E': 'concluded',
      'X': 'archived',
    };
    return statusMap[status] || 'pending';
  }

  private mapRole(role: string): string {
    const roleMap: Record<string, string> = {
      'A': 'plaintiff',
      'R': 'defendant',
      'T': 'third_party',
    };
    return roleMap[role] || 'third_party';
  }

  private mapPriority(priority: string): 'low' | 'medium' | 'high' | 'critical' {
    const priorityMap: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
      '1': 'low',
      '2': 'medium',
      '3': 'high',
      '4': 'critical',
    };
    return priorityMap[priority] || 'medium';
  }
}
