// src/modules/ai/index.ts
export { LegalAIService } from './legal-ai.service';
export { setupAIRoutes } from './routes';
export type {
  PrecedentCase,
  CaseAnalysisRequest,
  PrecedentAnalysis,
  OutcomePrediction,
  ArgumentSuggestion,
  JudgePattern,
  SentenceDataExtraction,
  AIServiceConfig,
} from './types';
