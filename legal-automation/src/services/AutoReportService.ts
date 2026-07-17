/**
 * Auto Report Generation Service
 * Automatically generates legal reports, motions, and documents
 *
 * Features:
 * - Case summary generation
 * - Motion generation from templates
 * - Procedural checklist generation
 * - Legal opinion generation
 */

import { logger } from '@utils/logger';
import { AppError } from '@utils/errors';
import { redisCacheService } from './RedisCacheService';
import { mlPredictionService } from './MLPredictionService';

interface CaseData {
  id: string;
  caseNumber: string;
  caseType: string;
  subject: string;
  tribunal: string;
  clientName: string;
  clientCPF: string;
  defendants: Array<{ name: string; type: 'person' | 'entity'; cpfCnpj: string }>;
  claimAmount?: number;
  filingDate: Date;
  description: string;
  lawyerName: string;
  lawyerOAB: string;
}

interface GeneratedReport {
  id: string;
  caseId: string;
  type: string;
  title: string;
  content: string;
  contentHTML: string;
  metadata: {
    generatedAt: Date;
    generatedBy: string;
    templateVersion: string;
    wordCount: number;
  };
}

interface MotionRequest {
  caseId: string;
  motionType: 'moção_antecipação_tutela' | 'moção_suspensão_processo' | 'moção_arquivamento';
  basis: string[];
  facts: string;
  legal_arguments: string;
}

interface ProceduralChecklist {
  caseId: string;
  steps: Array<{
    order: number;
    title: string;
    description: string;
    deadline?: Date;
    status: 'pending' | 'completed' | 'na';
    observations?: string;
  }>;
  completionPercentage: number;
  generatedAt: Date;
}

class AutoReportService {
  private cacheEnabled = true;
  private cacheTTL = 604800; // 7 days

  /**
   * Generate case summary report
   */
  async generateCaseSummary(caseData: CaseData): Promise<GeneratedReport> {
    const cacheKey = `report:summary:${caseData.id}`;

    // Check cache
    if (this.cacheEnabled) {
      const cached = await redisCacheService.get<GeneratedReport>(cacheKey);
      if (cached) {
        logger.info({ caseId: caseData.id }, 'Case summary from cache');
        return cached;
      }
    }

    try {
      // Get ML predictions for context
      const predictions = await mlPredictionService.predictDecision({
        caseType: caseData.caseType,
        tribunal: caseData.tribunal,
        subject: caseData.subject,
        defendantType: caseData.defendants[0]?.type || 'person',
        claimAmount: caseData.claimAmount,
      });

      const summary = this.compileCaseSummary(caseData, predictions);
      const htmlVersion = this.convertToHTML(summary);

      const report: GeneratedReport = {
        id: `rpt-${Date.now()}`,
        caseId: caseData.id,
        type: 'case_summary',
        title: `Resumo do Processo ${caseData.caseNumber}`,
        content: summary,
        contentHTML: htmlVersion,
        metadata: {
          generatedAt: new Date(),
          generatedBy: 'AutoReportService/ML',
          templateVersion: '1.0',
          wordCount: summary.split(/\s+/).length,
        },
      };

      // Cache result
      if (this.cacheEnabled) {
        await redisCacheService.setex(cacheKey, this.cacheTTL, report);
      }

      logger.info(
        {
          caseId: caseData.id,
          caseNumber: caseData.caseNumber,
          wordCount: report.metadata.wordCount,
        },
        'Case summary generated',
      );

      return report;
    } catch (error) {
      logger.error({ error, caseId: caseData.id }, 'Failed to generate case summary');
      throw new AppError(500, 'Falha ao gerar resumo do caso');
    }
  }

  /**
   * Generate legal motion
   */
  async generateMotion(request: MotionRequest, caseData: CaseData): Promise<GeneratedReport> {
    const cacheKey = `report:motion:${caseData.id}:${request.motionType}`;

    try {
      const motion = this.compileMotion(request, caseData);
      const htmlVersion = this.convertToHTML(motion);

      const report: GeneratedReport = {
        id: `rpt-${Date.now()}`,
        caseId: caseData.id,
        type: request.motionType,
        title: this.getMotionTitle(request.motionType),
        content: motion,
        contentHTML: htmlVersion,
        metadata: {
          generatedAt: new Date(),
          generatedBy: 'AutoReportService/Templates',
          templateVersion: '1.0',
          wordCount: motion.split(/\s+/).length,
        },
      };

      // Cache result
      if (this.cacheEnabled) {
        await redisCacheService.setex(cacheKey, this.cacheTTL, report);
      }

      logger.info(
        {
          caseId: caseData.id,
          motionType: request.motionType,
          wordCount: report.metadata.wordCount,
        },
        'Motion generated',
      );

      return report;
    } catch (error) {
      logger.error({ error, caseId: caseData.id }, 'Failed to generate motion');
      throw new AppError(500, 'Falha ao gerar moção');
    }
  }

  /**
   * Generate procedural checklist
   */
  async generateProceduralChecklist(caseData: CaseData): Promise<ProceduralChecklist> {
    const cacheKey = `report:checklist:${caseData.id}`;

    // Check cache
    if (this.cacheEnabled) {
      const cached = await redisCacheService.get<ProceduralChecklist>(cacheKey);
      if (cached) {
        logger.info({ caseId: caseData.id }, 'Procedural checklist from cache');
        return cached;
      }
    }

    try {
      const steps = this.generateSteps(caseData);

      const checklist: ProceduralChecklist = {
        caseId: caseData.id,
        steps,
        completionPercentage: 0,
        generatedAt: new Date(),
      };

      // Cache result
      if (this.cacheEnabled) {
        await redisCacheService.setex(cacheKey, this.cacheTTL, checklist);
      }

      logger.info(
        {
          caseId: caseData.id,
          stepsCount: steps.length,
        },
        'Procedural checklist generated',
      );

      return checklist;
    } catch (error) {
      logger.error({ error, caseId: caseData.id }, 'Failed to generate checklist');
      throw new AppError(500, 'Falha ao gerar checklist processual');
    }
  }

  /**
   * Generate legal opinion
   */
  async generateLegalOpinion(caseData: CaseData): Promise<GeneratedReport> {
    try {
      // Get predictions for analysis
      const predictions = await mlPredictionService.predictDecision({
        caseType: caseData.caseType,
        tribunal: caseData.tribunal,
        subject: caseData.subject,
        defendantType: caseData.defendants[0]?.type || 'person',
        claimAmount: caseData.claimAmount,
      });

      const opinion = this.compileOpinion(caseData, predictions);
      const htmlVersion = this.convertToHTML(opinion);

      const report: GeneratedReport = {
        id: `rpt-${Date.now()}`,
        caseId: caseData.id,
        type: 'legal_opinion',
        title: `Parecer Jurídico - ${caseData.caseNumber}`,
        content: opinion,
        contentHTML: htmlVersion,
        metadata: {
          generatedAt: new Date(),
          generatedBy: 'AutoReportService/ML',
          templateVersion: '1.0',
          wordCount: opinion.split(/\s+/).length,
        },
      };

      logger.info(
        {
          caseId: caseData.id,
          prediction: predictions.prediction,
          confidence: (predictions.confidence * 100).toFixed(2),
        },
        'Legal opinion generated',
      );

      return report;
    } catch (error) {
      logger.error({ error, caseId: caseData.id }, 'Failed to generate legal opinion');
      throw new AppError(500, 'Falha ao gerar parecer jurídico');
    }
  }

  /**
   * Compile case summary
   */
  private compileCaseSummary(caseData: CaseData, predictions: any): string {
    return `
RESUMO DO CASO

Processo: ${caseData.caseNumber}
Tribunal: ${caseData.tribunal}
Tipo: ${caseData.caseType}

PARTES
Autor: ${caseData.clientName} (CPF: ${caseData.clientCPF})
Advogado: ${caseData.lawyerName} (OAB: ${caseData.lawyerOAB})

Réus:
${caseData.defendants.map(d => `- ${d.name} (${d.type === 'entity' ? 'CNPJ' : 'CPF'}: ${d.cpfCnpj})`).join('\n')}

OBJETO DA AÇÃO
Matéria: ${caseData.subject}
Descrição: ${caseData.description}
${caseData.claimAmount ? `Valor da Causa: R$ ${(caseData.claimAmount / 100).toLocaleString('pt-BR')}` : ''}

ANÁLISE PRELIMINAR
Perspectiva: ${predictions.prediction.toUpperCase()}
Confiança: ${(predictions.confidence * 100).toFixed(0)}%
Observações: ${predictions.explanation}

Data de Geração: ${new Date().toLocaleDateString('pt-BR')}
`;
  }

  /**
   * Compile motion
   */
  private compileMotion(request: MotionRequest, caseData: CaseData): string {
    const motionTitles: Record<string, string> = {
      moção_antecipação_tutela: 'MOÇÃO DE ANTECIPAÇÃO DE TUTELA',
      moção_suspensão_processo: 'MOÇÃO PARA SUSPENSÃO DO PROCESSO',
      moção_arquivamento: 'MOÇÃO DE ARQUIVAMENTO',
    };

    return `
${motionTitles[request.motionType]}

Processo: ${caseData.caseNumber}
Tribunal: ${caseData.tribunal}

À Excelentíssima Justiça,

${caseData.lawyerName}, OAB ${caseData.lawyerOAB}, vem respeitosamente requerer
${this.getMotionDescription(request.motionType)} nos termos a seguir:

FATOS
${request.facts}

FUNDAMENTOS JURÍDICOS
${request.legal_arguments}

PEDIDO
Requer-se ${this.getMotionPetition(request.motionType)}.

Respeitosamente requer,

${caseData.lawyerName}
OAB ${caseData.lawyerOAB}

${new Date().toLocaleDateString('pt-BR')}
`;
  }

  /**
   * Compile legal opinion
   */
  private compileOpinion(caseData: CaseData, predictions: any): string {
    return `
PARECER JURÍDICO

Processo: ${caseData.caseNumber}
Parecer sobre: ${caseData.subject}
Data: ${new Date().toLocaleDateString('pt-BR')}

I. QUESTÃO APRESENTADA
${caseData.description}

II. ANÁLISE DO CASO
O caso em tela versa sobre matéria de ${caseData.caseType}, envolvendo
questões relacionadas a ${caseData.subject}.

III. POSICIONAMENTO
Com base na análise de jurisprudência aplicável e dos fatos apresentados,
avalia-se que a perspectiva para ${caseData.clientName} é
${predictions.prediction.toUpperCase()} (confiança: ${(predictions.confidence * 100).toFixed(0)}%).

${predictions.explanation}

IV. CONCLUSÃO
Recomenda-se prosseguimento com a estratégia processual indicada,
considerando a análise de riscos e oportunidades do caso.

V. OBSERVAÇÕES
Este parecer tem natureza meramente consultiva e não substitui
aconselhamento jurídico individualizado.

Parecer elaborado por: AutoReportService/ML v1.0
`;
  }

  /**
   * Generate procedural steps
   */
  private generateSteps(caseData: CaseData): ProceduralChecklist['steps'] {
    const baseDate = new Date();

    return [
      {
        order: 1,
        title: 'Petição Inicial',
        description: 'Apresentação da petição inicial do caso',
        deadline: new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000),
        status: 'completed',
      },
      {
        order: 2,
        title: 'Citação do Réu',
        description: 'Notificação do réu para apresentar defesa',
        deadline: new Date(baseDate.getTime() + 60 * 24 * 60 * 60 * 1000),
        status: 'pending',
      },
      {
        order: 3,
        title: 'Contestação',
        description: 'Prazo para apresentação de contestação (30 dias)',
        deadline: new Date(baseDate.getTime() + 90 * 24 * 60 * 60 * 1000),
        status: 'pending',
      },
      {
        order: 4,
        title: 'Fase Probatória',
        description: 'Produção de provas (perícias, depoimentos, documentos)',
        deadline: new Date(baseDate.getTime() + 180 * 24 * 60 * 60 * 1000),
        status: 'pending',
      },
      {
        order: 5,
        title: 'Audiência de Instrução',
        description: 'Realização de audiência para instrução da causa',
        deadline: new Date(baseDate.getTime() + 210 * 24 * 60 * 60 * 1000),
        status: 'pending',
      },
      {
        order: 6,
        title: 'Memoriais',
        description: 'Apresentação de memoriais finais',
        deadline: new Date(baseDate.getTime() + 240 * 24 * 60 * 60 * 1000),
        status: 'pending',
      },
      {
        order: 7,
        title: 'Sentença',
        description: 'Proferimento de sentença pelo juiz',
        deadline: new Date(baseDate.getTime() + 300 * 24 * 60 * 60 * 1000),
        status: 'pending',
      },
    ];
  }

  /**
   * Convert text to HTML
   */
  private convertToHTML(text: string): string {
    return `
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; margin: 2cm; }
    h1 { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; }
    .section { margin-top: 20px; }
    .field { margin: 10px 0; }
  </style>
</head>
<body>
  <div class="content">
    ${text.split('\n').map(line => {
      if (line.match(/^[A-Z\s\.]+$/)) return `<h2>${line}</h2>`;
      if (line.trim()) return `<p>${line}</p>`;
      return '<br>';
    }).join('\n')}
  </div>
</body>
</html>
`;
  }

  /**
   * Get motion title
   */
  private getMotionTitle(motionType: string): string {
    const titles: Record<string, string> = {
      moção_antecipação_tutela: 'Moção de Antecipação de Tutela',
      moção_suspensão_processo: 'Moção de Suspensão do Processo',
      moção_arquivamento: 'Moção de Arquivamento',
    };
    return titles[motionType] || 'Moção';
  }

  /**
   * Get motion description
   */
  private getMotionDescription(motionType: string): string {
    const descriptions: Record<string, string> = {
      moção_antecipação_tutela: 'antecipar os efeitos da tutela recursal',
      moção_suspensão_processo: 'suspender o andamento do processo',
      moção_arquivamento: 'requerer o arquivamento da ação',
    };
    return descriptions[motionType] || 'requerer medida processual';
  }

  /**
   * Get motion petition
   */
  private getMotionPetition(motionType: string): string {
    const petitions: Record<string, string> = {
      moção_antecipação_tutela: 'a antecipação dos efeitos da tutela, conforme fundamentação acima',
      moção_suspensão_processo: 'a suspensão do processo pelo prazo necessário',
      moção_arquivamento: 'a extinção da ação com resolução de mérito',
    };
    return petitions[motionType] || 'a medida requerida';
  }
}

export const autoReportService = new AutoReportService();
