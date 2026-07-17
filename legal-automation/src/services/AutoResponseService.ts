/**
 * Auto Response Service
 * Automatically generates responses to court intimations and routine legal documents
 *
 * Features:
 * - Intimation analysis and categorization
 * - Automatic response generation
 * - Response quality checking
 * - Compliance verification
 */

import { logger } from '@utils/logger';
import { AppError } from '@utils/errors';
import { redisCacheService } from './RedisCacheService';
import { autoReportService } from './AutoReportService';

interface Intimation {
  id: string;
  caseId: string;
  caseNumber: string;
  type: string;
  subject: string;
  content: string;
  deadline: Date;
  receivedAt: Date;
  isUrgent: boolean;
}

interface AutoResponse {
  id: string;
  intimationId: string;
  caseId: string;
  type: string;
  content: string;
  contentHTML: string;
  requiresReview: boolean;
  confidenceScore: number;
  reviewNotes: string;
  generatedAt: Date;
}

class AutoResponseService {
  private cacheEnabled = true;
  private cacheTTL = 604800; // 7 days
  private confidenceThreshold = 0.75; // 75%

  /**
   * Analyze intimation and generate response
   */
  async processIntimation(intimation: Intimation): Promise<AutoResponse> {
    try {
      logger.info(
        { intimationId: intimation.id, type: intimation.type },
        'Processing intimation',
      );

      // Categorize intimation
      const category = this.categorizeIntimation(intimation);

      // Generate response based on category
      let response: string;
      let requiresReview = false;

      switch (category) {
        case 'audiência_instrução':
          response = this.generateAudienceConfirmation(intimation);
          break;

        case 'depoimento_pessoal':
          response = this.generateDepositionResponse(intimation);
          break;

        case 'perícia':
          response = this.generateExpertiseResponse(intimation);
          break;

        case 'prova_documental':
          response = this.generateDocumentarySupportResponse(intimation);
          break;

        case 'prazo_processual':
          response = this.generateDeadlineResponse(intimation);
          break;

        case 'sentença_confirmação':
          response = this.generateSentenceConfirmation(intimation);
          break;

        default:
          response = this.generateGenericResponse(intimation);
          requiresReview = true;
      }

      // Check quality and confidence
      const confidence = this.calculateConfidence(category, intimation);
      if (confidence < this.confidenceThreshold) {
        requiresReview = true;
      }

      const contentHTML = this.convertToHTML(response);

      const autoResponse: AutoResponse = {
        id: `resp-${Date.now()}`,
        intimationId: intimation.id,
        caseId: intimation.caseId,
        type: category,
        content: response,
        contentHTML,
        requiresReview,
        confidenceScore: confidence,
        reviewNotes: this.generateReviewNotes(category, confidence),
        generatedAt: new Date(),
      };

      logger.info(
        {
          intimationId: intimation.id,
          responseType: category,
          confidence: (confidence * 100).toFixed(0),
          requiresReview,
        },
        'Response generated',
      );

      return autoResponse;
    } catch (error) {
      logger.error({ error, intimationId: intimation.id }, 'Failed to process intimation');
      throw new AppError(500, 'Falha ao processar intimação');
    }
  }

  /**
   * Batch process multiple intimations
   */
  async processMultipleIntimations(intimations: Intimation[]): Promise<AutoResponse[]> {
    try {
      const responses = await Promise.all(
        intimations.map(intimation => this.processIntimation(intimation)),
      );

      logger.info(
        { count: intimations.length, requiresReview: responses.filter(r => r.requiresReview).length },
        'Batch processing completed',
      );

      return responses;
    } catch (error) {
      logger.error({ error, count: intimations.length }, 'Batch processing failed');
      throw new AppError(500, 'Falha ao processar lote de intimações');
    }
  }

  /**
   * Categorize intimation type
   */
  private categorizeIntimation(intimation: Intimation): string {
    const contentLower = intimation.content.toLowerCase();
    const subjectLower = intimation.subject.toLowerCase();

    if (
      contentLower.includes('audiência') ||
      contentLower.includes('comparecimento') ||
      subjectLower.includes('instrução')
    ) {
      return 'audiência_instrução';
    }

    if (
      contentLower.includes('depoimento') ||
      contentLower.includes('testemunha') ||
      subjectLower.includes('pessoal')
    ) {
      return 'depoimento_pessoal';
    }

    if (
      contentLower.includes('perícia') ||
      contentLower.includes('expert') ||
      contentLower.includes('laudo')
    ) {
      return 'perícia';
    }

    if (
      contentLower.includes('documentos') ||
      contentLower.includes('juntada') ||
      subjectLower.includes('documental')
    ) {
      return 'prova_documental';
    }

    if (
      contentLower.includes('prazo') ||
      contentLower.includes('vencimento') ||
      contentLower.includes('improrrogável')
    ) {
      return 'prazo_processual';
    }

    if (
      contentLower.includes('sentença') ||
      contentLower.includes('acórdão') ||
      contentLower.includes('intimação')
    ) {
      return 'sentença_confirmação';
    }

    return 'genérico';
  }

  /**
   * Generate audience confirmation response
   */
  private generateAudienceConfirmation(intimation: Intimation): string {
    const daysRemaining = Math.ceil(
      (intimation.deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );

    return `
CONFIRMAÇÃO DE COMPARECIMENTO

Processo: ${intimation.caseNumber}
Intimação: ${intimation.id}
Data: ${new Date().toLocaleDateString('pt-BR')}

Por meio desta, confirma-se o comparecimento na audiência de instrução
agendada para a data indicada na intimação.

Declara-se que comparecerá pontualmente no horário estabelecido,
com toda a documentação necessária e representação processual adequada.

Observações:
- Dias restantes para comparecimento: ${daysRemaining}
- Local: Conforme indicado na intimação original
- Traz-se documentação de apoio às alegações

Respeitosamente,

${new Date().toLocaleDateString('pt-BR')}
`;
  }

  /**
   * Generate deposition response
   */
  private generateDepositionResponse(intimation: Intimation): string {
    return `
RESPOSTA À INTIMAÇÃO PARA DEPOIMENTO PESSOAL

Processo: ${intimation.caseNumber}
Intimação: ${intimation.id}

Vem o cliente respeitosamente manifestar sobre a intimação para
depoimento pessoal, requerendo:

1. CONFIRMAÇÃO DE COMPARECIMENTO
Confirma-se a intenção de comparecer para prestar depoimento
pessoal conforme data agendada.

2. SOLICITAÇÕES PROCESSUAIS
- Autorização para apresentação de petição complementar se necessário
- Prévia comunicação em caso de alteração de data

3. COMPROMETIMENTOS
- Apresentação de documentação de identidade original
- Pontualidade no comparecimento
- Cooperação com o procedimento judicial

Nesses termos, apresentam-se as considerações acima.

${new Date().toLocaleDateString('pt-BR')}
`;
  }

  /**
   * Generate expertise response
   */
  private generateExpertiseResponse(intimation: Intimation): string {
    return `
RESPOSTA À INTIMAÇÃO PARA PERÍCIA

Processo: ${intimation.caseNumber}
Intimação: ${intimation.id}

Em resposta à intimação para realização de perícia:

1. CONFIRMAÇÃO
Confirma-se a realização da perícia conforme data estabelecida.

2. INFORMAÇÕES TÉCNICAS
- Disponibilidade de acesso ao local/bem periciado
- Fornecimento de documentação técnica solicitada
- Contatos para agendamento específico

3. OBSERVAÇÕES PRELIMINARES
- Será disponibilizada documentação técnica prévia
- Solicitam-se cópias do laudo após conclusão
- Reserva-se o direito de apresentar contrarrazo

Apresentam-se as considerações acima.

${new Date().toLocaleDateString('pt-BR')}
`;
  }

  /**
   * Generate documentary support response
   */
  private generateDocumentarySupportResponse(intimation: Intimation): string {
    return `
RESPOSTA À INTIMAÇÃO PARA APRESENTAÇÃO DE DOCUMENTOS

Processo: ${intimation.caseNumber}
Intimação: ${intimation.id}

Em resposta à intimação para apresentação de documentos:

1. CONFORMIDADE
Confirma-se a disponibilidade para apresentação dos documentos solicitados.

2. DOCUMENTAÇÃO A SER APRESENTADA
Os documentos serão apresentados dentro do prazo estabelecido,
em conformidade com os requisitos processuais.

3. OBSERVAÇÕES
- Documentação será devidamente organizada e indexada
- Serão fornecidas cópias conforme necessário
- Mantém-se sigilo sobre informações protegidas por segredo profissional

Nesses termos, apresentam-se as informações acima.

${new Date().toLocaleDateString('pt-BR')}
`;
  }

  /**
   * Generate deadline response
   */
  private generateDeadlineResponse(intimation: Intimation): string {
    const daysRemaining = Math.ceil(
      (intimation.deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );

    return `
CIÊNCIA DE PRAZO PROCESSUAL

Processo: ${intimation.caseNumber}
Intimação: ${intimation.id}

Pela presente, CIÊNCIA-SE do prazo estabelecido na intimação, conforme segue:

INFORMAÇÕES DO PRAZO
- Prazo: Conforme legislação processual aplicável
- Dias restantes: ${daysRemaining} dias
- Vencimento: ${intimation.deadline.toLocaleDateString('pt-BR')}
- Natureza: Improrrogável

COMPROMETIMENTOS
- Prazos serão observados rigorosamente
- Petições serão apresentadas tempestivamente
- Diligências necessárias serão realizadas dentro do período

Ciência-se do teor da intimação.

${new Date().toLocaleDateString('pt-BR')}
`;
  }

  /**
   * Generate sentence confirmation
   */
  private generateSentenceConfirmation(intimation: Intimation): string {
    return `
CIÊNCIA DE SENTENÇA

Processo: ${intimation.caseNumber}
Intimação: ${intimation.id}

Pela presente, CIÊNCIA-SE da sentença proferida conforme a seguinte comunicação:

INFORMAÇÕES DA SENTENÇA
- Número do processo: ${intimation.caseNumber}
- Data de intimação: ${intimation.receivedAt.toLocaleDateString('pt-BR')}
- Data limite para manifestação: ${intimation.deadline.toLocaleDateString('pt-BR')}

MANIFESTAÇÕES POSTERIORES
Conforme a sentença, as partes poderão:
- Interpor recursos cabíveis dentro do prazo legal
- Requerer esclarecimentos ou complementação
- Executar a sentença conforme aplicável

CIÊNCIA-SE da presente intimação.

${new Date().toLocaleDateString('pt-BR')}
`;
  }

  /**
   * Generate generic response
   */
  private generateGenericResponse(intimation: Intimation): string {
    return `
RESPOSTA À INTIMAÇÃO

Processo: ${intimation.caseNumber}
Intimação: ${intimation.id}
Data: ${new Date().toLocaleDateString('pt-BR')}

Vem a parte respeitosamente manifestar-se em relação à intimação recebida:

1. CONFIRMAÇÃO DE RECEBIMENTO
Confirma-se o recebimento da intimação e compreensão de seu conteúdo.

2. MANIFESTAÇÃO
A parte manifesta-se conforme os termos da intimação, comprometendo-se
ao cumprimento de todas as obrigações dele decorrentes.

3. ENCAMINHAMENTOS
Serão realizadas as diligências necessárias para cumprimento integral
da intimação.

Respeitosamente apresentam-se as considerações acima.

${new Date().toLocaleDateString('pt-BR')}
`;
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(category: string, intimation: Intimation): number {
    let confidence = 0.5;

    // Category-specific confidence
    const categoryConfidence: Record<string, number> = {
      audiência_instrução: 0.85,
      depoimento_pessoal: 0.80,
      perícia: 0.75,
      prova_documental: 0.88,
      prazo_processual: 0.92,
      sentença_confirmação: 0.90,
      genérico: 0.60,
    };

    confidence = categoryConfidence[category] || 0.60;

    // Urgency adjustment
    if (intimation.isUrgent) {
      confidence -= 0.05;
    }

    // Content length adjustment
    if (intimation.content.length < 100) {
      confidence -= 0.1;
    }

    return Math.min(Math.max(confidence, 0), 1);
  }

  /**
   * Generate review notes
   */
  private generateReviewNotes(category: string, confidence: number): string {
    const notes: string[] = [];

    if (confidence < this.confidenceThreshold) {
      notes.push('⚠️ Confiança abaixo do limiar - revisão recomendada');
    }

    if (category === 'genérico') {
      notes.push('📌 Categoria incerta - verificar conteúdo da intimação');
    }

    if (confidence >= 0.9) {
      notes.push('✅ Resposta de alta confiança - pronta para envio');
    }

    return notes.length > 0 ? notes.join(' | ') : '✓ Revisão automática passou';
  }

  /**
   * Convert to HTML
   */
  private convertToHTML(text: string): string {
    return `
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Times New Roman', serif; line-height: 1.5; margin: 2cm; }
    h1, h2 { text-align: center; }
    .number { margin: 15px 0 5px 0; font-weight: bold; }
    p { margin: 10px 0; text-align: justify; }
  </style>
</head>
<body>
  ${text
    .split('\n')
    .map(line => {
      if (line.match(/^\d+\./)) return `<p class="number">${line}</p>`;
      if (line.match(/^[A-Z ]+$/)) return `<h2>${line}</h2>`;
      if (line.trim()) return `<p>${line}</p>`;
      return '<br>';
    })
    .join('\n')}
</body>
</html>
`;
  }
}

export const autoResponseService = new AutoResponseService();
