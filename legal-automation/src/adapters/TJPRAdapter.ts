import { logger } from '@utils/logger';
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
  getName(): string {
    return 'TJPR';
  }

  getBaseUrl(): string {
    return 'https://tst.tjpr.jus.br/projudi/webservices';
  }

  getTribunalCode(): string {
    return 'tjpr';
  }

  async getProcess(number: string): Promise<Process> {
    try {
      logger.debug(`TJPR: Obtendo processo ${number}`);

      const processes = await dataJudClient.searchProcesses({
        numeroProcesso: number,
      });

      if (processes.length === 0) {
        throw new Error(`Processo não encontrado: ${number}`);
      }

      return this.normalizeProcess(processes[0]);
    } catch (error) {
      logger.error({ err: error }, `TJPR: Erro ao obter processo ${number}`);
      throw error;
    }
  }

  async searchProcesses(criteria: SearchCriteria): Promise<Process[]> {
    try {
      logger.debug(`TJPR: Buscando processos com critérios:`, criteria);

      const processes = await dataJudClient.searchProcesses({
        parteNome: criteria.partyName,
        assunto: criteria.subject,
        dataRegistroInicio: criteria.startDate?.toISOString().split('T')[0],
        dataRegistroFim: criteria.endDate?.toISOString().split('T')[0],
        limite: criteria.limit || 50,
      });

      return processes.map(p => this.normalizeProcess(p));
    } catch (error) {
      logger.error({ err: error }, 'TJPR: Erro ao buscar processos');
      throw error;
    }
  }

  async getMovements(processNumber: string): Promise<Movement[]> {
    try {
      logger.debug(`TJPR: Obtendo movimentações do processo ${processNumber}`);

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
      logger.debug(`TJPR: Enviando petição para processo ${petition.processNumber} via Projudi`);

      // Use Projudi SOAP client
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

      logger.info(`TJPR: Petição enviada com protocolo ${response.protocolo}`);

      return {
        protocolo: response.protocolo,
        dataProtocolo: new Date(response.dataProtocolo || new Date()),
        sucesso: response.sucesso,
        mensagem: response.mensagem,
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

      // In Projudi, we would query the status via SOAP
      // For now, return a basic status
      return {
        protocolo: protocolNumber,
        status: 'processando',
        dataStatus: new Date(),
        mensagem: 'Protocolo em processamento',
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
      // Check if Projudi SOAP client is connected
      return projudiSoapClient.isConnected();
    } catch {
      return false;
    }
  }

  private normalizeProcess(data: any): Process {
    return {
      number: data.numeroProcesso || data.number,
      cnj: data.CNJ || data.cnj || '',
      tribunal: 'TJPR',
      status: data.status || 'Ativo',
      plaintiff: data.partes?.[0]?.nome || data.plaintiff,
      defendant: data.partes?.[1]?.nome || data.defendant,
      subject: data.assunto || data.subject,
      lastMovement: data.dataAtualizacao || data.lastMovement,
      openDate: data.dataAbertura || data.openDate,
    };
  }
}

export const tjprAdapter = new TJPRAdapter();
