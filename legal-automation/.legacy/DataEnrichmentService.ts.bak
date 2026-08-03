import { logger } from '@utils/logger';
import { dataJudClient } from '@/datajud/client';
import { juditClient, JUDITProcess } from '@integrations/JUDITClient';
import { codiloClient, CodiloAlert } from '@integrations/CodiloClient';
import { jusbrasilClient, CaseAnalysis } from '@integrations/JusbrasilClient';

export interface EnrichedProcess {
  numeroProcesso: string;
  tribunal: string;
  status: string;
  partes: any[];
  movimentacoes: any[];
  prazos: any[];
  documentos: any[];
  decisoes: any[];
  alertas: CodiloAlert[];
  analise: CaseAnalysis | null;
  datasReferencia: {
    datajud: Date;
    judit: Date | null;
    codilo: Date | null;
    jusbrasil: Date | null;
  };
  confiabilidade: {
    percentual: number;
    fontesAtivas: string[];
    fontesErro: string[];
  };
}

export interface DataSourceStatus {
  nome: string;
  disponivel: boolean;
  velocidade: number; // em ms
  ultimaAtualizacao: Date;
  erro?: string;
}

export class DataEnrichmentService {
  async getProcessEnriched(numeroProcesso: string): Promise<EnrichedProcess> {
    logger.info(`Enriquecendo dados do processo ${numeroProcesso}`);

    const start = Date.now();
    const sourcesStatus: DataSourceStatus[] = [];
    const sourcesAtivas: string[] = [];
    const sourcesErro: string[] = [];

    // Step 1: DataJud (fallback obrigatório)
    let datajudData = null;
    let datajudTime = Date.now();
    try {
      logger.debug(`DataJud: Consultando ${numeroProcesso}`);
      const result = await dataJudClient.searchProcesses({
        numeroProcesso,
      });
      datajudData = result[0] || null;
      datajudTime = Date.now() - datajudTime;
      sourcesAtivas.push('datajud');
      sourcesStatus.push({
        nome: 'DataJud',
        disponivel: true,
        velocidade: datajudTime,
        ultimaAtualizacao: new Date(),
      });
      logger.debug(`DataJud: Consulta concluída em ${datajudTime}ms`);
    } catch (error) {
      sourcesErro.push('datajud');
      logger.warn(`DataJud: Erro - ${error instanceof Error ? error.message : 'Desconhecido'}`);
      sourcesStatus.push({
        nome: 'DataJud',
        disponivel: false,
        velocidade: 0,
        ultimaAtualizacao: new Date(),
        erro: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }

    // Step 2: JUDIT (prioridade alta)
    let juditData: JUDITProcess | null = null;
    let juditTime = Date.now();
    try {
      logger.debug(`JUDIT: Consultando ${numeroProcesso}`);
      juditData = await juditClient.consultarProcesso(numeroProcesso);
      juditTime = Date.now() - juditTime;
      sourcesAtivas.push('judit');
      sourcesStatus.push({
        nome: 'JUDIT',
        disponivel: true,
        velocidade: juditTime,
        ultimaAtualizacao: new Date(),
      });
      logger.debug(`JUDIT: Consulta concluída em ${juditTime}ms`);
    } catch (error) {
      sourcesErro.push('judit');
      logger.warn(`JUDIT: Erro - ${error instanceof Error ? error.message : 'Desconhecido'}`);
      sourcesStatus.push({
        nome: 'JUDIT',
        disponivel: false,
        velocidade: 0,
        ultimaAtualizacao: new Date(),
        erro: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }

    // Step 3: Codilo (alertas e monitoramento)
    let codiloAlerts: CodiloAlert[] = [];
    let codiloTime = Date.now();
    try {
      logger.debug(`Codilo: Buscando alertas para ${numeroProcesso}`);
      codiloAlerts = await codiloClient.obterAlertas(10);
      // Filter alerts for this process
      codiloAlerts = codiloAlerts.filter((a) => a.processNumber === numeroProcesso);
      codiloTime = Date.now() - codiloTime;
      sourcesAtivas.push('codilo');
      sourcesStatus.push({
        nome: 'Codilo',
        disponivel: true,
        velocidade: codiloTime,
        ultimaAtualizacao: new Date(),
      });
      logger.debug(`Codilo: ${codiloAlerts.length} alertas obtidos em ${codiloTime}ms`);
    } catch (error) {
      sourcesErro.push('codilo');
      logger.warn(`Codilo: Erro - ${error instanceof Error ? error.message : 'Desconhecido'}`);
      sourcesStatus.push({
        nome: 'Codilo',
        disponivel: false,
        velocidade: 0,
        ultimaAtualizacao: new Date(),
        erro: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }

    // Step 4: Jusbrasil (análise e ML)
    let jusbrasil: CaseAnalysis | null = null;
    let jusbrassilTime = Date.now();
    try {
      logger.debug(`Jusbrasil: Analisando ${numeroProcesso}`);
      jusbrasil = await jusbrasilClient.analisarProcesso(numeroProcesso);
      jusbrassilTime = Date.now() - jusbrassilTime;
      sourcesAtivas.push('jusbrasil');
      sourcesStatus.push({
        nome: 'Jusbrasil',
        disponivel: true,
        velocidade: jusbrassilTime,
        ultimaAtualizacao: new Date(),
      });
      logger.debug(`Jusbrasil: Análise concluída em ${jusbrassilTime}ms`);
    } catch (error) {
      sourcesErro.push('jusbrasil');
      logger.warn(`Jusbrasil: Erro - ${error instanceof Error ? error.message : 'Desconhecido'}`);
      sourcesStatus.push({
        nome: 'Jusbrasil',
        disponivel: false,
        velocidade: 0,
        ultimaAtualizacao: new Date(),
        erro: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }

    // Step 5: Merge data
    const merged = this.mergeData(datajudData, juditData, codiloAlerts, jusbrasil);

    const totalTime = Date.now() - start;
    logger.info(
      `Enriquecimento concluído em ${totalTime}ms (${sourcesAtivas.length} fontes ativas, ${sourcesErro.length} erros)`,
    );

    return {
      ...merged,
      datasReferencia: {
        datajud: new Date(),
        judit: juditData ? new Date() : null,
        codilo: codiloAlerts.length > 0 ? new Date() : null,
        jusbrasil: jusbrasil ? new Date() : null,
      },
      confiabilidade: {
        percentual: (sourcesAtivas.length / 4) * 100,
        fontesAtivas: sourcesAtivas,
        fontesErro: sourcesErro,
      },
    };
  }

  async getSourcesStatus(): Promise<DataSourceStatus[]> {
    const statuses: DataSourceStatus[] = [];

    const sources = [
      { nome: 'DataJud', check: () => dataJudClient.searchProcesses({ numeroProcesso: '0' }) },
      { nome: 'JUDIT', check: () => juditClient.healthCheck() },
      { nome: 'Codilo', check: () => codiloClient.healthCheck() },
      { nome: 'Jusbrasil', check: () => jusbrasilClient.healthCheck() },
    ];

    for (const source of sources) {
      const start = Date.now();
      try {
        await source.check();
        const velocity = Date.now() - start;
        statuses.push({
          nome: source.nome,
          disponivel: true,
          velocidade: velocity,
          ultimaAtualizacao: new Date(),
        });
      } catch (error) {
        statuses.push({
          nome: source.nome,
          disponivel: false,
          velocidade: 0,
          ultimaAtualizacao: new Date(),
          erro: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      }
    }

    return statuses;
  }

  private mergeData(
    datajud: any,
    judit: JUDITProcess | null,
    codilo: CodiloAlert[],
    jusbrasil: CaseAnalysis | null,
  ): Omit<EnrichedProcess, 'datasReferencia' | 'confiabilidade'> {
    // Use JUDIT as primary, fall back to DataJud
    const primarySource = judit || datajud;

    if (!primarySource) {
      throw new Error('Nenhuma fonte de dados disponível');
    }

    return {
      numeroProcesso: primarySource.numeroProcesso || primarySource.number,
      tribunal: primarySource.tribunal || 'Desconhecido',
      status: (judit?.status || datajud?.status) || 'Desconhecido',
      partes: (judit?.partes || datajud?.partes) || [],
      movimentacoes: (judit?.movimentacoes || datajud?.movimentacoes) || [],
      prazos: (judit?.prazos || datajud?.prazos) || [],
      documentos: (judit?.documentos || datajud?.documentos) || [],
      decisoes: (judit?.decisoes || datajud?.decisoes) || [],
      alertas: codilo,
      analise: jusbrasil,
    };
  }
}

export const dataEnrichmentService = new DataEnrichmentService();
