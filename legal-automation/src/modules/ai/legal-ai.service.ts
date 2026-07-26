// src/modules/ai/legal-ai.service.ts
import { Database } from '@/database';
import {
  CaseAnalysisRequest,
  PrecedentAnalysis,
  OutcomePrediction,
  ArgumentSuggestion,
  JudgePattern,
  SentenceDataExtraction,
  PrecedentCase,
  AIServiceConfig,
} from './types';

export class LegalAIService {
  private config: AIServiceConfig;

  constructor(private db: Database, config: AIServiceConfig) {
    this.config = config;
  }

  /**
   * Analyze similar precedent cases using semantic search
   */
  async analyzePrecedents(caseAnalysis: CaseAnalysisRequest): Promise<PrecedentAnalysis> {
    const { caseType, jurisdiction, claimAmount, summary, mainIssue } = caseAnalysis;

    // Query precedent cases from database
    const query = `
      SELECT
        id, case_number, court, year, case_type, plaintiff, defendant,
        claim_amount, decision, reason, judges, relevance_score, citation_count
      FROM precedent_cases
      WHERE
        case_type = $1
        AND (jurisdiction ILIKE $2 OR court ILIKE $2)
        AND status = 'ACTIVE'
        AND (
          claim_amount IS NULL
          OR (claim_amount >= $3 * 0.7 AND claim_amount <= $3 * 1.3)
        )
      ORDER BY relevance_score DESC, citation_count DESC
      LIMIT 50
    `;

    const similarCases = await this.db.query<PrecedentCase>(query, [
      caseType,
      `%${jurisdiction}%`,
      claimAmount || 0,
    ]);

    if (!similarCases.rows.length) {
      return {
        similarCases: [],
        winRate: 0,
        averageAmount: undefined,
        commonArguments: [],
        reversalRate: 0,
        averageTimeToDecision: 0,
      };
    }

    const cases = similarCases.rows;
    const decisions = cases.filter(c => c.decision.toLowerCase() === 'favorable');
    const winRate = decisions.length / cases.length;
    const averageAmount = cases.reduce((sum, c) => sum + (c.claimAmount || 0), 0) / cases.length;

    // Extract common arguments from reasons
    const argumentsMap = new Map<string, number>();
    cases.forEach(c => {
      const args = this.extractArgumentsFromReason(c.reason);
      args.forEach(arg => {
        argumentsMap.set(arg, (argumentsMap.get(arg) || 0) + 1);
      });
    });

    const commonArguments = Array.from(argumentsMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([arg]) => arg);

    const reversalCount = cases.filter(c => c.decision.toLowerCase() === 'reversed').length;
    const reversalRate = reversalCount / cases.length;

    // Calculate average time to decision (in days)
    const currentYear = new Date().getFullYear();
    const averageTimeToDecision = Math.ceil(
      cases.reduce((sum, c) => sum + (currentYear - c.year) * 365, 0) / cases.length
    );

    return {
      similarCases: cases.slice(0, 10),
      winRate: Math.round(winRate * 100) / 100,
      averageAmount,
      commonArguments,
      reversalRate: Math.round(reversalRate * 100) / 100,
      averageTimeToDecision,
    };
  }

  /**
   * Predict case outcome with confidence and risk factors
   */
  async predictOutcome(caseAnalysis: CaseAnalysisRequest): Promise<OutcomePrediction> {
    const precedents = await this.analyzePrecedents(caseAnalysis);

    if (!precedents.similarCases.length) {
      return {
        probabilityOfWin: 50,
        confidence: 20,
        riskFactors: ['Insufficient precedent data', 'Unique case characteristics'],
        favorableFactors: [],
        estimatedResolutionTime: 365,
        recommendations: [
          'Conduct broader legal research',
          'Prepare for extended proceedings',
          'Consider settlement options',
        ],
        baselineComparison: undefined,
      };
    }

    // Calculate probability based on similar cases
    const baseWinRate = precedents.winRate * 100;
    const caseSpecificAdjustment = this.calculateCaseAdjustment(caseAnalysis, precedents);
    const probabilityOfWin = Math.min(95, Math.max(5, baseWinRate + caseSpecificAdjustment));

    // Confidence based on sample size and consistency
    const confidenceScore = Math.min(95, (precedents.similarCases.length / 50) * 100);

    // Identify risk and favorable factors
    const riskFactors = this.identifyRiskFactors(caseAnalysis, precedents);
    const favorableFactors = this.identifyFavorableFactors(caseAnalysis, precedents);

    // Estimate resolution time
    const estimatedResolutionTime = Math.ceil(precedents.averageTimeToDecision * 1.1);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      probabilityOfWin,
      riskFactors,
      favorableFactors
    );

    return {
      probabilityOfWin: Math.round(probabilityOfWin),
      confidence: Math.round(confidenceScore),
      riskFactors,
      favorableFactors,
      estimatedResolutionTime,
      recommendations,
      baselineComparison: {
        winRate: Math.round(precedents.winRate * 100),
        averageAmount: Math.round(precedents.averageAmount || 0),
      },
    };
  }

  /**
   * Suggest legal arguments based on similar cases
   */
  async suggestArguments(
    caseAnalysis: CaseAnalysisRequest,
    side: 'plaintiff' | 'defendant'
  ): Promise<ArgumentSuggestion[]> {
    const precedents = await this.analyzePrecedents(caseAnalysis);

    if (!precedents.similarCases.length) {
      return [];
    }

    const argumentMap = new Map<string, ArgumentSuggestion>();

    for (const caseRecord of precedents.similarCases) {
      const arguments_ = this.extractArgumentsFromReason(caseRecord.reason);

      arguments_.forEach(arg => {
        if (!argumentMap.has(arg)) {
          argumentMap.set(arg, {
            argument: arg,
            strength: this.evaluateArgumentStrength(caseRecord, arg),
            supportingCases: [caseRecord.id],
            counterArguments: [],
            precedentCitations: [caseRecord.caseNumber],
          });
        } else {
          const existing = argumentMap.get(arg)!;
          existing.supportingCases.push(caseRecord.id);
          existing.precedentCitations.push(caseRecord.caseNumber);
        }
      });
    }

    return Array.from(argumentMap.values())
      .sort((a, b) => this.strengthScore(b.strength) - this.strengthScore(a.strength))
      .slice(0, 10);
  }

  /**
   * Analyze specific judge's decision patterns
   */
  async analyzeJudgePattern(judgeId: string): Promise<JudgePattern> {
    const query = `
      SELECT
        id, judge_name, total_decisions, win_rate, reversal_rate,
        average_time_to_decision, favorite_arguments, reversal_reasons,
        specializations, years_of_experience
      FROM judge_patterns
      WHERE judge_id = $1
    `;

    const result = await this.db.query<JudgePattern>(query, [judgeId]);

    if (!result.rows.length) {
      return {
        judgeId,
        judgeName: 'Unknown',
        totalDecisions: 0,
        winRate: 0,
        reversalRate: 0,
        averageTimeToDecision: 0,
        favoriteArguments: [],
        reversalReasons: [],
        specializations: [],
        yearsOfExperience: 0,
      };
    }

    return result.rows[0];
  }

  /**
   * Extract structured data from court sentence/decision text
   */
  async extractSentenceData(sentenceContent: string): Promise<SentenceDataExtraction> {
    // Extract judge name
    const judgeMatch = sentenceContent.match(
      /(?:Juiz|Desembargador|Ministro|Juíza|Desembargadora|Ministra)\s+([A-Za-z\s]+)(?:\.|,|;)/i
    );
    const judge = judgeMatch ? judgeMatch[1].trim() : 'Unknown';

    // Extract date
    const dateMatch = sentenceContent.match(
      /(\d{1,2})\s+de\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/i
    );
    let date = new Date();
    if (dateMatch) {
      const [, day, monthName, year] = dateMatch;
      const months: { [key: string]: number } = {
        janeiro: 0,
        fevereiro: 1,
        março: 2,
        abril: 3,
        maio: 4,
        junho: 5,
        julho: 6,
        agosto: 7,
        setembro: 8,
        outubro: 9,
        novembro: 10,
        dezembro: 11,
      };
      date = new Date(parseInt(year), months[monthName.toLowerCase()], parseInt(day));
    }

    // Extract parties
    const plaintiffMatch = sentenceContent.match(/[Aa]utora?:\s+([^\n]+)/);
    const defendantMatch = sentenceContent.match(/[Rr]éu:\s+([^\n]+)/);

    const plaintiff = plaintiffMatch ? plaintiffMatch[1].trim() : 'Unknown';
    const defendant = defendantMatch ? defendantMatch[1].trim() : 'Unknown';

    // Extract amount
    const amountMatch = sentenceContent.match(
      /R\$\s*([\d.,]+)|(?:valor|quantia)\s+de\s+R\$\s*([\d.,]+)/i
    );
    const amount = amountMatch
      ? parseFloat((amountMatch[1] || amountMatch[2]).replace(/\./g, '').replace(',', '.'))
      : 0;

    // Extract main issue
    const issueMatch = sentenceContent.match(/(?:[Qq]uestão|[Aa]ssunto|[Mm]atéria):\s+([^\n]+)/);
    const mainIssue = issueMatch ? issueMatch[1].trim() : 'General dispute';

    // Extract decision
    const decisionMatch = sentenceContent.match(
      /(?:[Jj]ulgado|[Pp]rocedência|[Ii]mprocedência|[Pp]arcialmente):\s+([^\n]+)/i
    );
    const decision = decisionMatch ? decisionMatch[1].trim() : 'Unknown';

    // Extract reasoning
    const reasoning = this.extractReasoningParagraphs(sentenceContent);

    // Extract citations
    const citations = this.extractCitations(sentenceContent);

    // Extract precedents used
    const precedentsUsed = this.extractPrecedents(sentenceContent);

    // Extract dissenting opinion if present
    const dissentingMatch = sentenceContent.match(
      /(?:[Vv]oto\s+[Vv]encido|[Dd]issenting):\s+([^\n]+)/
    );
    const dissenting = dissentingMatch ? dissentingMatch[1].trim() : undefined;

    return {
      judge,
      date,
      plaintiff,
      defendant,
      amount,
      mainIssue,
      decision,
      reasoning,
      citations,
      dissenting,
      precedentsUsed,
    };
  }

  // Private helper methods

  private extractArgumentsFromReason(reason: string): string[] {
    const argumentPatterns = [
      /(?:fundad|legítim|válid|razoável|proporcional|necessário)/gi,
      /(?:violação|ofensa|desrespeito|afronta)/gi,
      /(?:prejudíc|dano|prejuíz)/gi,
      /(?:direito|garantia|princípio)/gi,
    ];

    const arguments_: string[] = [];
    argumentPatterns.forEach(pattern => {
      const matches = reason.match(pattern);
      if (matches) {
        arguments_.push(...matches.map(m => m.toLowerCase()));
      }
    });

    return [...new Set(arguments_)];
  }

  private calculateCaseAdjustment(
    caseAnalysis: CaseAnalysisRequest,
    precedents: PrecedentAnalysis
  ): number {
    let adjustment = 0;

    // Positive adjustment for favorable arguments
    if (caseAnalysis.mainIssue && precedents.commonArguments.length > 0) {
      adjustment += 5;
    }

    // Negative adjustment if claim amount is unusually high
    if (caseAnalysis.claimAmount && precedents.averageAmount) {
      const ratio = caseAnalysis.claimAmount / precedents.averageAmount;
      if (ratio > 1.5) {
        adjustment -= 10;
      }
    }

    // Negative adjustment if reversal rate is high
    if (precedents.reversalRate > 0.3) {
      adjustment -= 8;
    }

    return adjustment;
  }

  private identifyRiskFactors(
    caseAnalysis: CaseAnalysisRequest,
    precedents: PrecedentAnalysis
  ): string[] {
    const factors: string[] = [];

    if (precedents.reversalRate > 0.2) {
      factors.push('High reversal rate in similar cases');
    }

    if (caseAnalysis.claimAmount && precedents.averageAmount) {
      const ratio = caseAnalysis.claimAmount / precedents.averageAmount;
      if (ratio > 2) {
        factors.push('Unusually high claim amount');
      }
    }

    if (precedents.averageTimeToDecision > 1000) {
      factors.push('Extended litigation timeline expected');
    }

    if (!caseAnalysis.mainIssue) {
      factors.push('Insufficient case characterization');
    }

    return factors;
  }

  private identifyFavorableFactors(
    caseAnalysis: CaseAnalysisRequest,
    precedents: PrecedentAnalysis
  ): string[] {
    const factors: string[] = [];

    if (precedents.winRate > 0.7) {
      factors.push('Strong precedent support');
    }

    if (precedents.commonArguments.length > 3) {
      factors.push('Multiple established legal arguments available');
    }

    if (precedents.similarCases.length > 20) {
      factors.push('Well-established jurisprudence');
    }

    if (caseAnalysis.mainIssue) {
      factors.push('Clear legal issue identified');
    }

    return factors;
  }

  private generateRecommendations(
    probability: number,
    riskFactors: string[],
    favorableFactors: string[]
  ): string[] {
    const recommendations: string[] = [];

    if (probability > 80) {
      recommendations.push('Strong case for prosecution');
      recommendations.push('Consider aggressive litigation strategy');
    } else if (probability > 60) {
      recommendations.push('Favorable case profile');
      recommendations.push('Prepare comprehensive evidence package');
    } else if (probability > 40) {
      recommendations.push('Balanced risk profile');
      recommendations.push('Evaluate settlement opportunities');
    } else {
      recommendations.push('Challenging case dynamics');
      recommendations.push('Consider alternative dispute resolution');
    }

    if (riskFactors.length > 0) {
      recommendations.push(`Address risk factors: ${riskFactors[0]}`);
    }

    if (favorableFactors.length > 0) {
      recommendations.push(`Emphasize strengths: ${favorableFactors[0]}`);
    }

    return recommendations;
  }

  private evaluateArgumentStrength(
    caseRecord: PrecedentCase,
    argument: string
  ): 'strong' | 'moderate' | 'weak' {
    const reasonLower = caseRecord.reason.toLowerCase();
    const argumentLower = argument.toLowerCase();

    if (
      caseRecord.decision.toLowerCase() === 'favorable' &&
      reasonLower.includes(argumentLower)
    ) {
      return caseRecord.citationCount > 5 ? 'strong' : 'moderate';
    }

    return 'weak';
  }

  private strengthScore(strength: 'strong' | 'moderate' | 'weak'): number {
    return strength === 'strong' ? 3 : strength === 'moderate' ? 2 : 1;
  }

  private extractReasoningParagraphs(content: string): string[] {
    const paragraphs = content.split(/\n\n+/);
    return paragraphs
      .filter(p => p.length > 100)
      .slice(0, 3)
      .map(p => p.trim());
  }

  private extractCitations(content: string): string[] {
    const citations: string[] = [];
    const citationPattern = /(?:Lei|Decreto|Resolução|Constituição|CF|CC|CPC|CPC\/2015)\s+(?:nº|n\.º)\s+([\d./]+)/g;
    let match;

    while ((match = citationPattern.exec(content)) !== null) {
      citations.push(`${match[0].split(/\s+/).slice(0, 2).join(' ')} ${match[1]}`);
    }

    return [...new Set(citations)];
  }

  private extractPrecedents(content: string): string[] {
    const precedents: string[] = [];
    const precedentPattern = /(?:Precedente|Jurisprudência|Acórdão):\s+([^\n]+)/gi;
    let match;

    while ((match = precedentPattern.exec(content)) !== null) {
      precedents.push(match[1].trim());
    }

    return precedents;
  }
}
