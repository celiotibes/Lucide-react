// src/modules/ai/types.ts
export interface PrecedentCase {
  id: string;
  caseNumber: string;
  court: string;
  year: number;
  caseType: string;
  plaintiff: string;
  defendant: string;
  claimAmount?: number;
  decision: string;
  reason: string;
  judges: string[];
  relevanceScore: number;
  citationCount: number;
}

export interface CaseAnalysisRequest {
  caseType: string;
  jurisdiction: string;
  claimAmount?: number;
  summary: string;
  mainIssue?: string;
}

export interface PrecedentAnalysis {
  similarCases: PrecedentCase[];
  winRate: number;
  averageAmount?: number;
  commonArguments: string[];
  reversalRate: number;
  averageTimeToDecision: number; // dias
}

export interface OutcomePrediction {
  probabilityOfWin: number; // 0-100
  confidence: number; // 0-100
  riskFactors: string[];
  favorableFactors: string[];
  estimatedResolutionTime: number; // dias
  recommendations: string[];
  baselineComparison?: {
    winRate: number;
    averageAmount: number;
  };
}

export interface ArgumentSuggestion {
  argument: string;
  strength: 'strong' | 'moderate' | 'weak';
  supportingCases: string[];
  counterArguments: string[];
  precedentCitations: string[];
}

export interface JudgePattern {
  judgeId: string;
  judgeName: string;
  totalDecisions: number;
  winRate: number;
  reversalRate: number;
  averageTimeToDecision: number;
  favoriteArguments: string[];
  reversalReasons: string[];
  specializations: string[];
  yearsOfExperience: number;
}

export interface SentenceDataExtraction {
  judge: string;
  date: Date;
  plaintiff: string;
  defendant: string;
  amount: number;
  mainIssue: string;
  decision: string;
  reasoning: string[];
  citations: string[];
  dissenting?: string;
  precedentsUsed: string[];
}

export interface AIServiceConfig {
  provider: 'openai' | 'anthropic';
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  embeddingModel?: string;
}
