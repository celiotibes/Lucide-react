import { UUID } from 'crypto';

export type TemplateVariableType = 'string' | 'date' | 'number' | 'multiline' | 'email' | 'phone';
export type TemplateType = 'initial' | 'intermediate' | 'final' | 'motion' | 'appeal';
export type TemplateStatus = 'active' | 'inactive' | 'draft';
export type CustomizationLevel = 'minimal' | 'moderate' | 'high';
export type PreferredStyle = 'formal' | 'technical' | 'aggressive' | 'conciliatory';

export interface TemplateVariable {
  name: string;
  type: TemplateVariableType;
  required: boolean;
  default?: string;
  validation?: string; // RegExp pattern
  placeholder?: string;
  description?: string;
}

export interface Template {
  id: string;
  name: string;
  type: TemplateType;
  category?: string;
  content: string;
  variables: TemplateVariable[];
  jurisdiction: string[]; // ['tjsc', 'tjpr'] or [] for all
  status: TemplateStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  isTemplate: boolean;
  usageCount: number;
  successRate?: number;
  aiGenerated: boolean;
  tags?: string[];
}

export interface TemplateVersion {
  id: string;
  templateId: string;
  version: number;
  content: string;
  changelog?: string;
  createdAt: Date;
  createdBy?: string;
}

export interface TemplateUsageRecord {
  id: string;
  templateId: string;
  petitionId?: string;
  userId?: string;
  variables: Record<string, any>;
  customizations?: Record<string, any>;
  success: boolean;
  feedback?: string;
  rating?: number; // 1-5
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplatePreferences {
  id: string;
  userId: string;
  tribunalCode?: string;
  favoriteTemplates: string[];
  preferredStyle: PreferredStyle;
  aiCustomizationLevel: number; // 1-10
  autoSubstitute: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateCustomizationRequest {
  templateId: string;
  variables: Record<string, any>;
  context?: CaseContext;
  customizationLevel?: 'minimal' | 'moderate' | 'high';
  tribunal?: string;
}

export interface CaseContext {
  processNumber?: string;
  plaintiff?: string;
  defendant?: string;
  subject?: string;
  caseHistory?: string;
  reliefs?: string[];
  arguments?: string[];
  jurisdiction?: string;
}

export interface TemplateFilter {
  type?: TemplateType;
  category?: string;
  jurisdiction?: string;
  status?: TemplateStatus;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface TemplateValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  isValid: boolean;
  errors: TemplateValidationError[];
}

export interface UsageStats {
  templateId: string;
  totalUsage: number;
  successCount: number;
  successRate: number;
  averageRating: number;
  lastUsed: Date;
  tribunalStats: {
    tribunal: string;
    usage: number;
    successRate: number;
  }[];
}

export interface TemplateSuggestion {
  templateId: string;
  templateName: string;
  matchScore: number; // 0-100
  reason: string;
  jurisdiction?: string;
}
