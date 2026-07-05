import { logger } from '@utils/logger';
import { llmPool, LLMOptions } from './llmPool';
import { Petition, Process } from '@/types';

export interface GeneratePetitionOptions {
  processNumber: string;
  petitionType: 'initial' | 'intermediate' | 'final' | 'other';
  context: {
    plaintiff?: string;
    defendant?: string;
    subject?: string;
    relief?: string[];
    arguments?: string[];
    caseHistory?: string;
  };
}

export interface PetitionGenerationResult {
  rtfContent: string;
  plainText: string;
  confidence: number;
  warnings: string[];
  suggestedEdits: string[];
}

export interface MovementAnalysisResult {
  summary: string;
  phase: string;
  nextDeadline?: Date;
  riskLevel: 'low' | 'medium' | 'high';
  recommendations: string[];
  confidence: number;
}

export interface DocumentExtractionResult {
  partes: Array<{ nome: string; role: string }>;
  pretensoes: string[];
  fundamentos: string[];
  prazos: Array<{ descricao: string; data: string }>;
  confidence: number;
}

export interface PetitionValidationResult {
  isValid: boolean;
  score: number;
  issues: string[];
  warnings: string[];
  suggestions: string[];
}

export class AIService {
  private petitionPrompts: Record<string, string> = {
    initial: `Você é um advogado especialista em petições judiciais.
Gere uma PETIÇÃO INICIAL completa em português, estruturada em RTF, com:
1. Qualificação das partes
2. Narração dos fatos
3. Fundamentação jurídica
4. Pedido(s) claro(s) e fundamentado(s)
5. Requerimentos finais
Contexto: {context}

Gere apenas o conteúdo da petição, sem explicações.`,

    intermediate: `Você é um advogado especialista em procedimentos judiciais.
Gere uma PETIÇÃO INTERMEDIÁRIA em português, estruturada em RTF, com:
1. Identificação do processo
2. Narração concisa dos fatos relevantes
3. Fundamentos jurídicos atualizados
4. Pedido específico
5. Fundamentação técnica
Contexto: {context}

Gere apenas o conteúdo da petição, sem explicações.`,
  };

  async generatePetition(options: GeneratePetitionOptions): Promise<PetitionGenerationResult> {
    try {
      logger.info(`Gerando petição para processo: ${options.processNumber}`);

      const template = this.petitionPrompts[options.petitionType] || this.petitionPrompts.intermediate;

      const contextStr = JSON.stringify(options.context, null, 2);
      const prompt = template.replace('{context}', contextStr);

      const response = await llmPool.call(prompt, {
        temperature: 0.3,
        maxTokens: 3000,
        cacheKey: `petition:${options.processNumber}:${options.petitionType}`,
      });

      // Converter para RTF
      const rtfContent = this.convertToRTF(response.content);

      // Validar conteúdo gerado
      const warnings = this.validatePetitionContent(response.content);

      logger.info(`Petição gerada com confiança ${response.provider}`);

      return {
        rtfContent,
        plainText: response.content,
        confidence: 0.85,
        warnings,
        suggestedEdits: this.suggestEdits(response.content),
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao gerar petição');
      throw error;
    }
  }

  async analyzeMovements(processNumber: string, movements: any[]): Promise<MovementAnalysisResult> {
    try {
      logger.debug(`Analisando movimentações do processo: ${processNumber}`);

      const movementsStr = movements
        .map(
          m =>
            `${m.date || m.dataMovimentacao}: ${m.description || m.descricao}`,
        )
        .join('\n');

      const prompt = `Você é um analista jurídico especializado em processos judiciários brasileiros.
Analise as seguintes movimentações processuais e forneça:
1. Resumo executivo em 1-2 linhas
2. Fase processual atual
3. Próximo prazo importante (se houver)
4. Nível de risco: baixo/médio/alto
5. Recomendações para próximos passos

Movimentações:
${movementsStr}

Processo: ${processNumber}

Forneça análise estruturada em JSON.`;

      const response = await llmPool.call(prompt, {
        temperature: 0.2,
        maxTokens: 1000,
        cacheKey: `analysis:${processNumber}`,
      });

      const analysis = this.parseAnalysisJSON(response.content);

      return {
        summary: analysis.summary || 'Análise disponível',
        phase: analysis.phase || 'Desconhecida',
        nextDeadline: analysis.nextDeadline ? new Date(analysis.nextDeadline) : undefined,
        riskLevel: (analysis.riskLevel as 'low' | 'medium' | 'high') || 'medium',
        recommendations: analysis.recommendations || [],
        confidence: 0.8,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao analisar movimentações');
      throw error;
    }
  }

  async extractFromDocument(fileContent: string): Promise<DocumentExtractionResult> {
    try {
      logger.debug('Extraindo dados de documento');

      const prompt = `Você é um especialista em processamento de documentos jurídicos.
Extraia as seguintes informações do documento abaixo, retornando em JSON:
{
  "partes": [{"nome": "...", "role": "autor|ré|outro"}],
  "pretensoes": ["..."],
  "fundamentos": ["..."],
  "prazos": [{"descricao": "...", "data": "YYYY-MM-DD"}]
}

DOCUMENTO:
${fileContent}

Retorne APENAS o JSON, sem explicações.`;

      const response = await llmPool.call(prompt, {
        temperature: 0.1,
        maxTokens: 2000,
      });

      return this.parseExtractionJSON(response.content);
    } catch (error) {
      logger.error({ err: error }, 'Erro ao extrair documento');
      throw error;
    }
  }

  async validatePetition(content: string, petitionType: string): Promise<PetitionValidationResult> {
    try {
      logger.debug('Validando petição');

      const prompt = `Você é um validador de petições jurídicas. Analise a petição abaixo e valide:
1. Presença de todas as partes necessárias (cabeçalho, narração, fundamentos, pedido)
2. Clareza e completude do pedido
3. Fundamentação jurídica adequada
4. Formatação profissional
5. Ausência de erros óbvios

Retorne em JSON:
{
  "isValid": true/false,
  "score": 0-100,
  "issues": ["..."],
  "warnings": ["Verifique citações em STF/TJ", "..."],
  "suggestions": ["..."]
}

PETIÇÃO (${petitionType}):
${content}

Retorne APENAS o JSON.`;

      const response = await llmPool.call(prompt, {
        temperature: 0.2,
        maxTokens: 1500,
      });

      const validation = this.parseValidationJSON(response.content);

      return {
        isValid: validation.isValid || false,
        score: validation.score || 0,
        issues: validation.issues || [],
        warnings: validation.warnings || [],
        suggestions: validation.suggestions || [],
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao validar petição');
      throw error;
    }
  }

  async suggestArguments(
    processNumber: string,
    subject: string,
    context: string,
  ): Promise<string[]> {
    try {
      logger.debug(`Sugerindo argumentos para: ${subject}`);

      const prompt = `Você é um advogado especialista. Baseado no seguinte contexto processual,
sugira 3-5 argumentos jurídicos principais (com referência a leis/jurisprudência quando aplicável):

Assunto: ${subject}
Contexto: ${context}
Processo: ${processNumber}

Retorne como array JSON de strings.`;

      const response = await llmPool.call(prompt, {
        temperature: 0.4,
        maxTokens: 1000,
      });

      try {
        const suggestions = JSON.parse(response.content);
        if (Array.isArray(suggestions)) {
          return suggestions.map(s => String(s));
        }
      } catch {
        // Fallback: dividir por linhas numeradas
        return response.content
          .split('\n')
          .filter(l => l.match(/^\d+\./))
          .map(l => l.replace(/^\d+\.\s*/, ''));
      }

      return [];
    } catch (error) {
      logger.error({ err: error }, 'Erro ao sugerir argumentos');
      return [];
    }
  }

  // Helpers privados

  private convertToRTF(plainText: string): string {
    // Conversão básica para RTF
    const rtf = `{\\rtf1\\ansi\\ansicpg1252\\cocoartf1
{\\colortbl;\\red0\\green0\\blue0;}
{\\*\\expandedcolortbl;;}
\\margl1440\\margr1440\\vieww11900\\viewh8605\\trowd

{\\fonttbl\\f0\\fswiss Helvetica;}
{\\colortbl;\\red0\\green0\\blue0;}

\\f0\\fs20

${plainText.replace(/\n/g, '\\par\n')}
}`;

    return rtf;
  }

  private validatePetitionContent(content: string): string[] {
    const warnings: string[] = [];

    if (!content.toLowerCase().includes('pedido')) {
      warnings.push('Pedido pode estar ausente ou pouco claro');
    }

    if (!content.toLowerCase().includes('fundament')) {
      warnings.push('Falta fundamentação jurídica');
    }

    // Verificar alucinações comuns
    if (content.match(/artigo\s*\d{3,4}[a-z]?/i)) {
      warnings.push('⚠️ Verifique todas as referências de artigos em fontes oficiais');
    }

    if (content.match(/jurisprudência|julgado|decisão/i)) {
      warnings.push('⚠️ Consulte STF/TJ para verificar citações de jurisprudência');
    }

    return warnings;
  }

  private suggestEdits(content: string): string[] {
    const suggestions: string[] = [];

    if (content.length < 500) {
      suggestions.push('Conteúdo pode estar muito resumido - considere expandir fundamentação');
    }

    if (content.split('pedido').length < 2) {
      suggestions.push('Esclareça melhor o pedido principal');
    }

    if (!content.match(/\b(considerando|fundamenta|conforme)\b/i)) {
      suggestions.push('Use conexões lógicas mais claras (considerando, fundamenta-se, conforme)');
    }

    return suggestions.slice(0, 3);
  }

  private parseAnalysisJSON(content: string): any {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      logger.warn('Falha ao parsear JSON de análise');
    }
    return {};
  }

  private parseExtractionJSON(content: string): DocumentExtractionResult {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        return {
          partes: data.partes || [],
          pretensoes: data.pretensoes || [],
          fundamentos: data.fundamentos || [],
          prazos: data.prazos || [],
          confidence: 0.8,
        };
      }
    } catch (e) {
      logger.warn('Falha ao extrair dados de documento');
    }

    return {
      partes: [],
      pretensoes: [],
      fundamentos: [],
      prazos: [],
      confidence: 0,
    };
  }

  private parseValidationJSON(content: string): any {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      logger.warn('Falha ao parsear validação');
    }
    return { isValid: false, score: 0, issues: [], warnings: [], suggestions: [] };
  }
}

export const aiService = new AIService();
