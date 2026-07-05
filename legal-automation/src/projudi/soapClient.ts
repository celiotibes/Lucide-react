import soap from 'node-soap';
import { logger } from '@utils/logger';
import { config } from '@utils/config';
import { ProjectudoIntegrationError } from '@utils/errors';
import {
  ProjudiAuthRequest,
  ProjudiAuthResponse,
  ProjudiPetition,
  ProjudiPetitionResponse,
  ProjudiProcessData,
  ProjudiDownloadRequest,
  ProjudiDownloadResponse,
} from './types';

export class ProjudiSoapClient {
  private client: any;
  private token: string | null = null;
  private tokenExpiry: Date | null = null;

  async initialize(): Promise<void> {
    try {
      logger.info('Inicializando cliente SOAP Projudi...');
      this.client = await soap.createClientAsync(config.projudi_wsdl_url);
      logger.info('Cliente SOAP Projudi inicializado com sucesso');
    } catch (error) {
      logger.error({ err: error }, 'Erro ao inicializar cliente SOAP Projudi');
      throw new ProjectudoIntegrationError('Falha ao conectar com Projudi WSDL');
    }
  }

  async authenticate(username: string, password: string): Promise<string> {
    try {
      if (this.token && this.tokenExpiry && new Date() < this.tokenExpiry) {
        logger.debug('Usando token Projudi em cache');
        return this.token;
      }

      logger.debug('Autenticando no Projudi...');

      const result = await this.client.autenticarAsync({
        usuario: username,
        senha: password,
      });

      const response = result[0] as any;

      if (!response.token) {
        throw new ProjectudoIntegrationError('Token não recebido na autenticação');
      }

      this.token = response.token;
      this.tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

      logger.info('Autenticação Projudi bem-sucedida');
      return this.token;
    } catch (error) {
      logger.error({ err: error }, 'Erro de autenticação Projudi');
      throw new ProjectudoIntegrationError(
        error instanceof Error ? error.message : 'Falha na autenticação Projudi',
      );
    }
  }

  async getProcessData(processNumber: string, token: string): Promise<ProjudiProcessData> {
    try {
      logger.debug(`Obtendo dados do processo: ${processNumber}`);

      const result = await this.client.obterProcessoAsync({
        numeroProcesso: processNumber,
        token,
      });

      const data = result[0] as any;

      if (!data.sucesso) {
        throw new ProjectudoIntegrationError(`Processo não encontrado: ${processNumber}`);
      }

      return this.mapProcessData(data);
    } catch (error) {
      logger.error({ err: error }, `Erro ao obter processo ${processNumber}`);
      throw new ProjectudoIntegrationError(
        error instanceof Error ? error.message : 'Erro ao obter dados do processo',
      );
    }
  }

  async submitPetition(
    petition: ProjudiPetition,
    token: string,
  ): Promise<ProjudiPetitionResponse> {
    try {
      logger.debug(`Peticionando no processo: ${petition.numeroProcesso}`);

      const result = await this.client.peticionar Async({
        numeroProcesso: petition.numeroProcesso,
        tipoDocumento: petition.tipoDocumento,
        descricaoDocumento: petition.descricaoDocumento,
        documentoRTF: petition.documentoRTF,
        assuntoMovimentacao: petition.assuntoMovimentacao,
        dataMovimentacao: petition.dataMovimentacao,
        token,
      });

      const response = result[0] as any;

      if (!response.sucesso) {
        logger.warn(`Petição falhou: ${response.mensagem}`);
        return {
          protocolo: '',
          dataProtocolo: '',
          descricao: response.mensagem,
          sucesso: false,
          mensagem: response.mensagem,
          erros: response.erros || [],
        };
      }

      logger.info(`Petição enviada com protocolo: ${response.protocolo}`);

      return {
        protocolo: response.protocolo,
        dataProtocolo: response.dataProtocolo,
        descricao: response.descricao || 'Petição enviada com sucesso',
        sucesso: true,
        mensagem: response.mensagem,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao enviar petição');
      throw new ProjectudoIntegrationError(
        error instanceof Error ? error.message : 'Erro ao enviar petição',
      );
    }
  }

  async downloadDocument(
    processNumber: string,
    documentId: string,
    token: string,
  ): Promise<ProjudiDownloadResponse> {
    try {
      logger.debug(`Download de documento: ${documentId} do processo ${processNumber}`);

      const result = await this.client.baixarDocumentoAsync({
        numeroProcesso: processNumber,
        idDocumento: documentId,
        token,
      });

      const response = result[0] as any;

      if (!response.sucesso) {
        throw new ProjectudoIntegrationError('Erro ao baixar documento');
      }

      return {
        conteudo: Buffer.from(response.conteudo, 'base64'),
        nomeArquivo: response.nomeArquivo,
        mimeType: response.mimeType || 'application/octet-stream',
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao baixar documento');
      throw new ProjectudoIntegrationError(
        error instanceof Error ? error.message : 'Erro ao baixar documento',
      );
    }
  }

  async searchProcesses(query: string, token: string): Promise<ProjudiProcessData[]> {
    try {
      logger.debug(`Buscando processos: ${query}`);

      const result = await this.client.buscarProcessosAsync({
        consulta: query,
        token,
      });

      const processes = result[0] as any[];

      if (!Array.isArray(processes)) {
        return [];
      }

      return processes.map(p => this.mapProcessData(p));
    } catch (error) {
      logger.error({ err: error }, 'Erro ao buscar processos');
      throw new ProjectudoIntegrationError(
        error instanceof Error ? error.message : 'Erro ao buscar processos',
      );
    }
  }

  private mapProcessData(data: any): ProjudiProcessData {
    return {
      numeroProcesso: data.numeroProcesso,
      numeroProcessoFormatado: data.numeroProcessoFormatado || data.numeroProcesso,
      anoJudicializado: data.anoJudicializado || new Date().getFullYear(),
      status: data.status || 'Ativo',
      dataAbertura: data.dataAbertura || '',
      dataUltimaMovimentacao: data.dataUltimaMovimentacao || '',
      partes: (data.partes || []).map((p: any) => ({
        nome: p.nome,
        pessoaJuridica: p.pessoaJuridica || false,
        documento: p.documento,
        tipo: p.tipo,
        advogados: p.advogados || [],
      })),
      movimentacoes: (data.movimentacoes || []).map((m: any) => ({
        dataMovimentacao: m.dataMovimentacao,
        descricao: m.descricao,
        status: m.status,
        complemento: m.complemento,
      })),
      documentos: (data.documentos || []).map((d: any) => ({
        id: d.id,
        descricao: d.descricao,
        tipo: d.tipo,
        dataUpload: d.dataUpload,
        tamanho: d.tamanho || 0,
        nomeArquivo: d.nomeArquivo,
      })),
    };
  }

  isConnected(): boolean {
    return this.client !== null;
  }

  invalidateToken(): void {
    this.token = null;
    this.tokenExpiry = null;
  }
}

export const projudiSoapClient = new ProjudiSoapClient();
