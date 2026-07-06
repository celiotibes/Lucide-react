import axios, { AxiosInstance } from 'axios';
import { logger } from '@utils/logger';
import {
  TribunalAdapter,
  SearchOptions,
  SubmitPetitionResponse,
} from './TribunalAdapter';
import {
  PJeConfig,
  PJeProcess,
  PJeSearchResult,
  ProcessNotFoundError,
  AuthenticationError,
} from '@types/tribunalAdapters';

export class PJeAdapter implements TribunalAdapter {
  private client: AxiosInstance;
  private config: PJeConfig;
  private accessToken?: string;
  private tokenExpiry?: Date;

  constructor(config: PJeConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.apiUrl,
      timeout: 30000,
    });
  }

  async initialize(): Promise<void> {
    try {
      logger.info(`Inicializando PJe adapter para ${this.config.name}`);
      await this.authenticate();
      logger.info('✓ PJe adapter inicializado com sucesso');
    } catch (error) {
      logger.error({ err: error }, 'Erro ao inicializar PJe adapter');
      throw error;
    }
  }

  async searchProcess(processNumber: string): Promise<PJeProcess> {
    try {
      await this.ensureAuthenticated();

      const response = await this.client.get('/consultas/processo', {
        params: {
          nrProcesso: processNumber.replace(/\D/g, ''),
        },
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      if (!response.data || !response.data.processo) {
        throw new ProcessNotFoundError(processNumber, 'PJe');
      }

      return this.mapPJeResponse(response.data.processo, processNumber);
    } catch (error) {
      logger.error({ err: error }, `Erro ao buscar processo ${processNumber} em PJe`);

      if (error instanceof ProcessNotFoundError) {
        throw error;
      }

      throw new ProcessNotFoundError(processNumber, 'PJe');
    }
  }

  async searchProcessByParty(partyName: string, options?: SearchOptions): Promise<PJeSearchResult[]> {
    try {
      await this.ensureAuthenticated();

      const response = await this.client.get('/consultas/partes', {
        params: {
          nmParte: partyName,
          perPage: options?.limit || 50,
          page: options?.offset || 0,
        },
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      return (response.data.processos || []).map((p: any) => ({
        processNumber: this.formatProcessNumber(p.nrProcesso),
        partyName: p.nmParte,
        classified: p.classificado !== 'N',
        lastUpdate: new Date(p.dtMovimentacao),
        url: `${this.config.apiUrl}/consultas/processo/${p.nrProcesso}`,
      }));
    } catch (error) {
      logger.error({ err: error }, `Erro ao buscar processos pela parte ${partyName} em PJe`);
      return [];
    }
  }

  async submitPetition(caseNumber: string, petition: any): Promise<SubmitPetitionResponse> {
    try {
      await this.ensureAuthenticated();

      const formData = new FormData();
      formData.append('nrProcesso', caseNumber);
      formData.append('documento', JSON.stringify(petition));

      if (petition.attachments) {
        for (let i = 0; i < petition.attachments.length; i++) {
          formData.append(`anexo_${i}`, petition.attachments[i]);
        }
      }

      const response = await this.client.post('/peticionamento/registrar', formData, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.status === 200 || response.status === 201) {
        return {
          success: true,
          caseNumber,
          submissionId: response.data.idRegistro,
          timestamp: new Date(),
          message: 'Petição registrada com sucesso no PJe',
        };
      }

      throw new Error('Falha ao registrar petição');
    } catch (error) {
      logger.error({ err: error }, `Erro ao submeter petição ao PJe para caso ${caseNumber}`);

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
      await this.ensureAuthenticated();

      const response = await this.client.get(`/processo/${processNumber}/prazos`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      return (response.data.prazos || []).map((p: any) => ({
        id: p.idPrazo,
        description: p.dsPrazo,
        dueDate: new Date(p.dtVencimento),
        priority: this.mapPriority(p.dsNivelUrgencia),
      }));
    } catch (error) {
      logger.error({ err: error }, `Erro ao obter prazos do PJe para ${processNumber}`);
      return [];
    }
  }

  async getHealthStatus(): Promise<{ status: 'ok' | 'error'; message: string }> {
    try {
      const response = await this.client.get('/health', {
        timeout: 5000,
      });

      return {
        status: response.status === 200 ? 'ok' : 'error',
        message: response.data.message || 'PJe disponível',
      };
    } catch (error) {
      return {
        status: 'error',
        message: `PJe indisponível: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      };
    }
  }

  private async authenticate(): Promise<void> {
    try {
      const response = await axios.post(this.config.tokenUrl, {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'client_credentials',
      });

      this.accessToken = response.data.access_token;
      const expiresIn = response.data.expires_in || 3600;
      this.tokenExpiry = new Date(Date.now() + expiresIn * 1000);

      logger.info('Token PJe obtido com sucesso');
    } catch (error) {
      logger.error({ err: error }, 'Erro ao autenticar com PJe');
      throw new AuthenticationError('PJe');
    }
  }

  private async ensureAuthenticated(): Promise<void> {
    if (!this.accessToken || (this.tokenExpiry && Date.now() >= this.tokenExpiry.getTime())) {
      await this.authenticate();
    }
  }

  private mapPJeResponse(data: any, processNumber: string): PJeProcess {
    return {
      processNumber,
      status: this.mapStatus(data.stProcesso),
      currentPhase: data.dsAtributo || 'Fase desconhecida',
      lastUpdate: new Date(data.dtMovimentacao),
      caseType: data.dsCasoTipo || 'Desconhecido',
      classificationCode: data.cdClassificacao || '',
      estimatedValue: data.vlCausa ? parseFloat(data.vlCausa) : undefined,
      court: data.nmForo || 'Tribunal desconhecido',
      movements: (data.movimentacoes || []).map((m: any) => ({
        id: m.idMovimentacao,
        type: m.dsMovimentacao,
        description: m.deMovimentacao,
        date: new Date(m.dtMovimentacao),
      })),
      parties: (data.partes || []).map((p: any) => ({
        id: p.idParte,
        name: p.nmParte,
        role: this.mapRole(p.dsRoleParte),
        documentId: p.cdCPF || p.cdCNPJ,
        representative: p.nmAdvogado,
      })),
      documents: (data.documentos || []).map((d: any) => ({
        id: d.idDocumento,
        name: d.nmDocumento,
        type: d.dsExtensao,
        date: new Date(d.dtDocumento),
        url: `${this.config.apiUrl}/documentos/${d.idDocumento}`,
      })),
      deadlines: (data.prazos || []).map((p: any) => ({
        id: p.idPrazo,
        description: p.dsPrazo,
        dueDate: new Date(p.dtVencimento),
        priority: this.mapPriority(p.dsNivelUrgencia),
      })),
    };
  }

  private mapStatus(status: string): 'active' | 'pending' | 'concluded' | 'archived' {
    const statusMap: Record<string, 'active' | 'pending' | 'concluded' | 'archived'> = {
      'A': 'active',
      'P': 'pending',
      'C': 'concluded',
      'X': 'archived',
    };
    return statusMap[status] || 'pending';
  }

  private mapRole(role: string): string {
    const roleMap: Record<string, string> = {
      'A': 'plaintiff',
      'P': 'defendant',
      'T': 'third_party',
    };
    return roleMap[role] || 'third_party';
  }

  private mapPriority(urgency: string): 'low' | 'medium' | 'high' | 'critical' {
    const priorityMap: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
      '1': 'low',
      '2': 'medium',
      '3': 'high',
      '4': 'critical',
    };
    return priorityMap[urgency] || 'medium';
  }

  private formatProcessNumber(num: string): string {
    const digits = num.replace(/\D/g, '');
    return `${digits.substring(0, 7)}-${digits.substring(7, 9)}.${digits.substring(9, 13)}.${digits.substring(13, 14)}.${digits.substring(14, 16)}.${digits.substring(16)}`;
  }
}
