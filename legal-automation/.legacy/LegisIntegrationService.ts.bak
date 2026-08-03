/**
 * Legis Integration Service
 * Integrates with STJ (Superior Court of Justice) and STF (Federal Supreme Court) jurisprudence databases
 * Provides access to legal precedents and case law
 */

import { logger } from '@utils/logger';
import { redisCacheService } from '@services/RedisCacheService';
import { auditLogService } from '@services/AuditLogService';
import db from '@db/connection';
import crypto from 'crypto';

export interface LegisJurisprudence {
  id: string;
  court: 'STJ' | 'STF';
  caseNumber: string;
  decisionDate: Date;
  title: string;
  summary: string;
  content: string;
  rapporteur: string;
  parties: string[];
  subjects: string[];
  keywords: string[];
  jurisprudentialTheme?: string;
  repeatCount?: number;
  source: string;
  url?: string;
}

export interface LegisSearchResult {
  jurisprudence: LegisJurisprudence[];
  totalResults: number;
  pageNumber: number;
  pageSize: number;
  relevanceScore: number[];
}

export interface LegisAnalysis {
  caseNumber: string;
  relevantPrecedents: LegisJurisprudence[];
  favorablePrecedents: number;
  unfavorablePrecedents: number;
  neutralPrecedents: number;
  confidenceScore: number;
  analysis: string;
}

export class LegisIntegrationService {
  private readonly STJ_API_URL = 'https://www.stj.jus.br/SCON/';
  private readonly STF_API_URL = 'https://jurisprudencia.stf.jus.br/pages/search/';
  private readonly CACHE_TTL = 86400; // 24 hours

  private readonly SUBJECTS_MAP = {
    'direito civil': ['civil', 'obrigações', 'contratos', 'família'],
    'direito comercial': ['empresarial', 'concursal', 'propriedade intelectual'],
    'direito tributário': ['impostos', 'taxas', 'contribuições', 'fiscal'],
    'direito administrativo': ['serviço público', 'licitações', 'servidor público'],
    'direito processual': ['procedimento', 'litispendência', 'coisa julgada'],
    'direito constitucional': ['direitos fundamentais', 'estado', 'poderes'],
    'direito penal': ['crime', 'pena', 'infrações penais'],
    'direito trabalhista': ['relação de trabalho', 'empregador', 'empregado'],
    'direito ambiental': ['meio ambiente', 'proteção', 'recursos naturais'],
    'direito internacional': ['tratados', 'convenções', 'direito comparado'],
  };

  /**
   * Buscar jurisprudência por palavras-chave
   */
  async searchJurisprudence(
    keywords: string[],
    court: 'STJ' | 'STF' | 'both' = 'both',
    pageNumber: number = 1,
    pageSize: number = 10,
  ): Promise<LegisSearchResult> {
    try {
      const cacheKey = `legis:search:${court}:${keywords.join(',')}:${pageNumber}`;

      // Verificar cache primeiro
      const cached = await redisCacheService.get(cacheKey);
      if (cached) {
        logger.debug(`Jurisprudência encontrada em cache: ${cacheKey}`);
        return JSON.parse(cached);
      }

      let results: LegisJurisprudence[] = [];

      if (court === 'STJ' || court === 'both') {
        const stjResults = await this.searchSTJ(keywords, pageNumber, pageSize);
        results = [...results, ...stjResults];
      }

      if (court === 'STF' || court === 'both') {
        const stfResults = await this.searchSTF(keywords, pageNumber, pageSize);
        results = [...results, ...stfResults];
      }

      // Calcular scores de relevância
      const relevanceScores = this.calculateRelevanceScores(results, keywords);

      const searchResult: LegisSearchResult = {
        jurisprudence: results,
        totalResults: results.length,
        pageNumber,
        pageSize,
        relevanceScore: relevanceScores,
      };

      // Cachear resultados
      await redisCacheService.set(cacheKey, JSON.stringify(searchResult), this.CACHE_TTL);

      logger.info(
        {
          keywords: keywords.join(', '),
          court,
          resultsCount: results.length,
        },
        'Jurisprudência obtida com sucesso',
      );

      return searchResult;
    } catch (error) {
      logger.error({ error, keywords, court }, 'Erro ao buscar jurisprudência');
      throw error;
    }
  }

  /**
   * Buscar no STJ (Superior Court of Justice)
   */
  private async searchSTJ(
    keywords: string[],
    pageNumber: number,
    pageSize: number,
  ): Promise<LegisJurisprudence[]> {
    try {
      // Simular busca no STJ - em produção, fazer requisição HTTP real
      const query = keywords.map((kw) => `"${kw}"`).join(' OU ');

      logger.debug(`Buscando STJ com query: ${query}`);

      // Para demo, retornar precedentes conhecidos
      const results: LegisJurisprudence[] = [];

      // Exemplo de resultado simulado
      if (keywords.some((k) => k.toLowerCase().includes('responsabilidade'))) {
        results.push({
          id: `stj_resp_${crypto.randomUUID()}`,
          court: 'STJ',
          caseNumber: 'REsp 1.234.567',
          decisionDate: new Date('2023-06-15'),
          title: 'Responsabilidade Civil - Obrigação de Reparar Dano',
          summary:
            'Estabelece jurisprudência sobre responsabilidade civil objetiva em casos de prestação de serviço.',
          content: `Ementa: [...]. Acórdão que trata da responsabilidade civil nas obrigações de serviço.`,
          rapporteur: 'Min. Roberto Barroso',
          parties: ['Requerente', 'Requerido'],
          subjects: ['Responsabilidade Civil', 'Dano Moral'],
          keywords: ['responsabilidade', 'dano', 'indenização'],
          jurisprudentialTheme: 'Tema 1234',
          repeatCount: 45,
          source: 'STJ',
          url: 'https://www.stj.jus.br/SCON/cgi/r',
        });
      }

      if (keywords.some((k) => k.toLowerCase().includes('contrato'))) {
        results.push({
          id: `stj_contrato_${crypto.randomUUID()}`,
          court: 'STJ',
          caseNumber: 'REsp 2.345.678',
          decisionDate: new Date('2023-08-20'),
          title: 'Direito das Obrigações - Interpretação de Contratos',
          summary: 'Esclarece os critérios de interpretação de cláusulas contratuais ambíguas.',
          content: `Ementa: [...]. A interpretação de contrato deve ser feita conforme a boa-fé.`,
          rapporteur: 'Min. Nancy Andrighi',
          parties: ['Contratante', 'Contratado'],
          subjects: ['Contratos', 'Boa-fé'],
          keywords: ['contrato', 'interpretação', 'boa-fé'],
          repeatCount: 62,
          source: 'STJ',
          url: 'https://www.stj.jus.br/SCON/cgi/r',
        });
      }

      return results;
    } catch (error) {
      logger.error({ error, keywords }, 'Erro ao buscar STJ');
      return [];
    }
  }

  /**
   * Buscar no STF (Federal Supreme Court)
   */
  private async searchSTF(
    keywords: string[],
    pageNumber: number,
    pageSize: number,
  ): Promise<LegisJurisprudence[]> {
    try {
      logger.debug(`Buscando STF com keywords: ${keywords.join(', ')}`);

      const results: LegisJurisprudence[] = [];

      // Exemplo de resultado simulado
      if (keywords.some((k) => k.toLowerCase().includes('direito'))) {
        results.push({
          id: `stf_direito_${crypto.randomUUID()}`,
          court: 'STF',
          caseNumber: 'ADI 7.890',
          decisionDate: new Date('2023-10-10'),
          title: 'Ação Direta de Inconstitucionalidade - Direitos Fundamentais',
          summary: 'Decisão sobre constitucionalidade de lei que afeta direitos fundamentais.',
          content: `Acórdão que julga ação direta de inconstitucionalidade.`,
          rapporteur: 'Min. Luiz Fux',
          parties: ['Requerente', 'União'],
          subjects: ['Direitos Fundamentais', 'Constitucionalidade'],
          keywords: ['direito', 'constitucionalidade', 'lei'],
          jurisprudentialTheme: 'Tema 9999',
          repeatCount: 28,
          source: 'STF',
          url: 'https://jurisprudencia.stf.jus.br/pages/search/',
        });
      }

      return results;
    } catch (error) {
      logger.error({ error, keywords }, 'Erro ao buscar STF');
      return [];
    }
  }

  /**
   * Analisar caso contra jurisprudência
   */
  async analyzeCase(
    caseNumber: string,
    subjects: string[],
    keywords: string[],
    userId: string,
  ): Promise<LegisAnalysis> {
    try {
      logger.info(
        {
          caseNumber,
          subjects: subjects.join(', '),
          keywords: keywords.join(', '),
        },
        'Iniciando análise de jurisprudência',
      );

      // Buscar precedentes relevantes
      const searchResult = await this.searchJurisprudence(
        [...keywords, ...subjects],
        'both',
        1,
        20,
      );

      // Classificar precedentes como favoráveis, desfavoráveis ou neutros
      let favorable = 0;
      let unfavorable = 0;
      let neutral = 0;

      for (const jurisp of searchResult.jurisprudence) {
        if (jurisp.repeatCount && jurisp.repeatCount > 30) {
          favorable++;
        } else if (jurisp.repeatCount && jurisp.repeatCount < 10) {
          unfavorable++;
        } else {
          neutral++;
        }
      }

      const confidenceScore = Math.min(
        100,
        (favorable / (searchResult.jurisprudence.length || 1)) * 100,
      );

      const analysis: LegisAnalysis = {
        caseNumber,
        relevantPrecedents: searchResult.jurisprudence.slice(0, 5),
        favorablePrecedents: favorable,
        unfavorablePrecedents: unfavorable,
        neutralPrecedents: neutral,
        confidenceScore: Math.round(confidenceScore),
        analysis: this.generateAnalysis(
          caseNumber,
          favorable,
          unfavorable,
          neutral,
          searchResult.jurisprudence,
        ),
      };

      // Registrar na auditoria
      await auditLogService.log({
        action: 'JURISPRUDENCE_ANALYSIS',
        entityType: 'Case',
        entityId: caseNumber,
        userId,
        ipAddress: 'system',
        changes: {
          after: {
            analysis: 'jurisprudence',
            precedentsFound: searchResult.jurisprudence.length,
            confidenceScore: confidenceScore,
          },
        },
        status: 'success',
      });

      logger.info(
        {
          caseNumber,
          precedentsFound: searchResult.jurisprudence.length,
          confidenceScore: confidenceScore,
        },
        'Análise de jurisprudência concluída',
      );

      return analysis;
    } catch (error) {
      logger.error({ error, caseNumber }, 'Erro ao analisar jurisprudência');
      throw error;
    }
  }

  /**
   * Gerar análise textual
   */
  private generateAnalysis(
    caseNumber: string,
    favorable: number,
    unfavorable: number,
    neutral: number,
    precedents: LegisJurisprudence[],
  ): string {
    const total = favorable + unfavorable + neutral;
    const favorablePercentage = total > 0 ? Math.round((favorable / total) * 100) : 0;

    let analysis = `Análise Jurisprudencial para o processo ${caseNumber}:\n\n`;
    analysis += `Precedentes encontrados: ${total}\n`;
    analysis += `- Favoráveis: ${favorable} (${favorablePercentage}%)\n`;
    analysis += `- Desfavoráveis: ${unfavorable}\n`;
    analysis += `- Neutros: ${neutral}\n\n`;

    if (favorable > unfavorable) {
      analysis += `A jurisprudência favorece esta tese. Os tribunais superiores têm entendimento consolidado nesta matéria.\n\n`;
    } else if (unfavorable > favorable) {
      analysis += `A jurisprudência é contrária a esta tese. Recomenda-se revisar estratégia processual.\n\n`;
    } else {
      analysis += `A jurisprudência é mista nesta matéria. Entendimentos divergentes entre os tribunais.\n\n`;
    }

    if (precedents.length > 0) {
      analysis += `Precedentes principais:\n`;
      precedents.slice(0, 3).forEach((p) => {
        analysis += `- ${p.caseNumber} (${p.court}): ${p.title}\n`;
      });
    }

    return analysis;
  }

  /**
   * Calcular scores de relevância
   */
  private calculateRelevanceScores(
    results: LegisJurisprudence[],
    keywords: string[],
  ): number[] {
    return results.map((result) => {
      let score = 0;

      // Verificar keywords
      const keywordMatches = keywords.filter((kw) =>
        result.keywords.some((k) => k.toLowerCase().includes(kw.toLowerCase())),
      ).length;
      score += keywordMatches * 20;

      // Verificar subjects
      keywords.forEach((kw) => {
        Object.entries(this.SUBJECTS_MAP).forEach(([subject, terms]) => {
          if (result.subjects.includes(subject)) {
            score += 15;
          }
        });
      });

      // Boost para decisões mais repetidas
      if (result.repeatCount) {
        score += Math.min(result.repeatCount / 10, 20);
      }

      return Math.min(score, 100);
    });
  }

  /**
   * Obter jurisprudência mais citada
   */
  async getMostCitedDecisions(
    court: 'STJ' | 'STF' | 'both' = 'both',
    limit: number = 10,
  ): Promise<LegisJurisprudence[]> {
    try {
      const cacheKey = `legis:most_cited:${court}`;

      const cached = await redisCacheService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Retornar decisões mais citadas (simulado)
      const mostCited: LegisJurisprudence[] = [
        {
          id: `stj_top_1_${crypto.randomUUID()}`,
          court: 'STJ',
          caseNumber: 'REsp 100.000',
          decisionDate: new Date('2020-01-01'),
          title: 'Responsabilidade Civil - Precedente Histórico',
          summary: 'Decisão histórica que estabeleceu parâmetros de responsabilidade civil.',
          content: 'Precedente consolidado em jurisprudência.',
          rapporteur: 'Min. Clássico',
          parties: [],
          subjects: ['Responsabilidade Civil'],
          keywords: ['responsabilidade'],
          repeatCount: 500,
          source: 'STJ',
        },
      ];

      await redisCacheService.set(cacheKey, JSON.stringify(mostCited), this.CACHE_TTL);

      return mostCited.slice(0, limit);
    } catch (error) {
      logger.error({ error }, 'Erro ao obter decisões mais citadas');
      return [];
    }
  }

  /**
   * Obter estatísticas de jurisprudência
   */
  async getStatistics(): Promise<{
    totalSearches: number;
    totalAnalyses: number;
    stjDecisions: number;
    stfDecisions: number;
    lastUpdate: Date;
  }> {
    try {
      const stats = await db.query(`
        SELECT
          COUNT(*) as total,
          COUNT(DISTINCT case WHEN court = 'STJ' THEN 1 END) as stj_decisions,
          COUNT(DISTINCT case WHEN court = 'STF' THEN 1 END) as stf_decisions
        FROM legis_searches
      `);

      return {
        totalSearches: stats.rows[0]?.total || 0,
        totalAnalyses: 0,
        stjDecisions: stats.rows[0]?.stj_decisions || 0,
        stfDecisions: stats.rows[0]?.stf_decisions || 0,
        lastUpdate: new Date(),
      };
    } catch (error) {
      logger.error({ error }, 'Erro ao obter estatísticas');
      return {
        totalSearches: 0,
        totalAnalyses: 0,
        stjDecisions: 0,
        stfDecisions: 0,
        lastUpdate: new Date(),
      };
    }
  }

  /**
   * Invalidar cache de jurisprudência
   */
  async invalidateCache(keywords?: string[]): Promise<void> {
    try {
      if (keywords) {
        const cacheKey = `legis:search:both:${keywords.join(',')}:1`;
        await redisCacheService.delete(cacheKey);
      } else {
        // Invalidar todo cache Legis
        logger.info('Invalidando todo cache de jurisprudência');
      }
    } catch (error) {
      logger.error({ error }, 'Erro ao invalidar cache');
    }
  }
}

export const legisIntegrationService = new LegisIntegrationService();
