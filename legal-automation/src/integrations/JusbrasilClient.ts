import axios, { AxiosInstance } from 'axios';
import { logger } from '@utils/logger';
import { config } from '@utils/config';

export interface SimilarCase {
  numero: string;
  tribunal: string;
  resultado: string;
  data: Date;
  similarity: number;
  descricao?: string;
}

export interface JurisprudenceItem {
  texto: string;
  fonte: string;
  relevancia: number;
  dataDecisao: Date;
  tribunal?: string;
  julgador?: string;
  ementa?: string;
}

export interface CasePrediction {
  likelyOutcome: string;
  confidence: number;
  reasoning: string;
  factors: Record<string, number>;
}

export interface CaseAnalysis {
  processNumber: string;
  similarCases: SimilarCase[];
  jurisprudence: JurisprudenceItem[];
  prediction: CasePrediction;
  createdAt: Date;
}

export interface JusbrasilSearchCriteria {
  assunto?: string;
  partes?: string[];
  tribunal?: string;
  classe?: string;
  dataInicio?: Date;
  dataFim?: Date;
  limit?: number;
}

export class JusbrasilClient {
  private http: AxiosInstance;
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = config.jusbrasil_api_url || 'https://api.jusbrasil.com.br/v2';
    this.apiKey = config.jusbrasil_api_key || '';

    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (this.apiKey) {
      this.http.defaults.headers.common['Authorization'] = `Token ${this.apiKey}`;
    }
  }

  async buscarCasesSimilares(criteria: JusbrasilSearchCriteria): Promise<SimilarCase[]> {
    try {
      logger.debug('Jusbrasil: Buscando casos similares', criteria);

      const params = {
        assunto: criteria.assunto,
        tribunal: criteria.tribunal,
        classe: criteria.classe,
        dataInicio: criteria.dataInicio?.toISOString().split('T')[0],
        dataFim: criteria.dataFim?.toISOString().split('T')[0],
        limit: criteria.limit || 20,
      };

      if (criteria.partes && criteria.partes.length > 0) {
        params['partes'] = criteria.partes.join(',');
      }

      const response = await this.http.post('/casos/similares', params);

      return (response.data.casos || []).map((c: any) => ({
        numero: c.numero_processo || c.numero,
        tribunal: c.tribunal,
        resultado: c.resultado || c.outcome,
        data: new Date(c.data_decisao || c.data),
        similarity: c.similaridade || c.similarity || 0,
        descricao: c.descricao || c.description,
      }));
    } catch (error) {
      logger.error({ err: error }, 'Jusbrasil: Erro ao buscar casos');
      throw error;
    }
  }

  async analisarProcesso(numeroProcesso: string): Promise<CaseAnalysis> {
    try {
      logger.debug(`Jusbrasil: Analisando processo ${numeroProcesso}`);

      const response = await this.http.get(`/processos/${numeroProcesso}/analise`);

      const data = response.data;

      return {
        processNumber: numeroProcesso,
        similarCases: (data.casos_similares || []).map((c: any) => ({
          numero: c.numero,
          tribunal: c.tribunal,
          resultado: c.resultado,
          data: new Date(c.data),
          similarity: c.similarity || 0,
        })),
        jurisprudence: (data.jurisprudencia || []).map((j: any) => ({
          texto: j.texto || j.ementa,
          fonte: j.fonte || 'Jusbrasil',
          relevancia: j.relevancia || 0,
          dataDecisao: new Date(j.data_decisao),
          tribunal: j.tribunal,
          julgador: j.julgador,
          ementa: j.ementa,
        })),
        prediction: {
          likelyOutcome: data.predicao?.resultado_provavel || 'Desconhecido',
          confidence: data.predicao?.confianca || 0,
          reasoning: data.predicao?.reasoning || '',
          factors: data.predicao?.factors || {},
        },
        createdAt: new Date(),
      };
    } catch (error) {
      logger.error({ err: error }, 'Jusbrasil: Erro ao analisar');
      throw error;
    }
  }

  async buscarJurisprudencia(tema: string, tribunal?: string, limit: number = 20): Promise<JurisprudenceItem[]> {
    try {
      logger.debug(`Jusbrasil: Buscando jurisprudência para "${tema}"`);

      const response = await this.http.get('/jurisprudencia', {
        params: {
          tema,
          tribunal,
          limit,
        },
      });

      return (response.data.decisoes || []).map((d: any) => ({
        texto: d.texto || d.ementa,
        fonte: d.fonte || 'Jusbrasil',
        relevancia: d.relevancia || 0,
        dataDecisao: new Date(d.data_decisao),
        tribunal: d.tribunal,
        julgador: d.julgador,
        ementa: d.ementa,
      }));
    } catch (error) {
      logger.error({ err: error }, 'Jusbrasil: Erro ao buscar jurisprudência');
      throw error;
    }
  }

  async obterPerfilTribunal(tribunal: string): Promise<any> {
    try {
      logger.debug(`Jusbrasil: Obtendo perfil do tribunal ${tribunal}`);

      const response = await this.http.get(`/tribunais/${tribunal}`);

      return response.data;
    } catch (error) {
      logger.error({ err: error }, `Jusbrasil: Erro ao obter perfil ${tribunal}`);
      throw error;
    }
  }

  async obterEstatisticasTribunal(tribunal: string, periodo: string = 'mes'): Promise<any> {
    try {
      logger.debug(`Jusbrasil: Obtendo estatísticas de ${tribunal} (período: ${periodo})`);

      const response = await this.http.get(`/tribunais/${tribunal}/estatisticas`, {
        params: { periodo },
      });

      return response.data;
    } catch (error) {
      logger.error({ err: error }, 'Jusbrasil: Erro ao obter estatísticas');
      throw error;
    }
  }

  async buscarAdvogado(nome: string): Promise<any> {
    try {
      logger.debug(`Jusbrasil: Buscando advogado "${nome}"`);

      const response = await this.http.get('/advogados', {
        params: { nome },
      });

      return response.data;
    } catch (error) {
      logger.error({ err: error }, 'Jusbrasil: Erro ao buscar advogado');
      throw error;
    }
  }

  async obterPerfectilAdvogado(oabNumber: string): Promise<any> {
    try {
      logger.debug(`Jusbrasil: Obtendo perfil do advogado ${oabNumber}`);

      const response = await this.http.get(`/advogados/${oabNumber}`);

      return response.data;
    } catch (error) {
      logger.error({ err: error }, 'Jusbrasil: Erro ao obter perfil advogado');
      throw error;
    }
  }

  async obterTaxaVitoriaAdvogado(oabNumber: string, periodo: string = 'ano'): Promise<any> {
    try {
      logger.debug(`Jusbrasil: Obtendo taxa de vitória de ${oabNumber}`);

      const response = await this.http.get(`/advogados/${oabNumber}/taxa-vitoria`, {
        params: { periodo },
      });

      return response.data;
    } catch (error) {
      logger.error({ err: error }, 'Jusbrasil: Erro ao obter taxa vitória');
      throw error;
    }
  }

  async gerarRelatorioComparativo(processosIds: string[]): Promise<any> {
    try {
      logger.debug('Jusbrasil: Gerando relatório comparativo');

      const response = await this.http.post('/relatorios/comparativo', {
        processos: processosIds,
      });

      return response.data;
    } catch (error) {
      logger.error({ err: error }, 'Jusbrasil: Erro ao gerar relatório');
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      logger.debug('Jusbrasil: Executando health check');
      const response = await this.http.get('/health');
      return response.status === 200;
    } catch (error) {
      logger.error({ err: error }, 'Jusbrasil: Health check falhou');
      return false;
    }
  }
}

export const jusbrasilClient = new JusbrasilClient();
