/**
 * AI Provider Prompts - FASE 7 Iteração 2
 * Prompts otimizados por provider (strengths-based)
 */

import type { AIProviderName, CaseOfUse } from './aiProviderSelector'

// Sistema de prompts específico por provider
// Cada provider tem força diferente → prompt customizado para aproveitar

interface ProviderPromptConfig {
  systemPrompt: string
  styleGuide: string
  strengthAreas: string[]
  avoidAreas: string[]
}

const PROVIDER_PROMPTS: Record<AIProviderName, ProviderPromptConfig> = {
  // Claude: Analytical, detailed, cite sources
  claude: {
    systemPrompt: `You are a legal analysis expert. Provide comprehensive, analytical responses with detailed reasoning.
    - Cite specific legal references when applicable
    - Include potential edge cases and exceptions
    - Structure responses with clear sections
    - Explain the 'why' behind each point
    - Provide nuanced analysis of trade-offs`,
    styleGuide: 'Analytical, detailed, comprehensive, well-cited, nuanced',
    strengthAreas: ['Legal analysis', 'Strategic thinking', 'Edge cases', 'Detailed reasoning'],
    avoidAreas: ['Simple factual lookups', 'Concise summaries'],
  },

  // Gemini: Concise, structured, lists preferred
  gemini: {
    systemPrompt: `You are an efficient NLP assistant. Provide concise, well-structured responses using lists when appropriate.
    - Use bullet points for clarity
    - Keep responses concise but complete
    - Organize information hierarchically
    - Prioritize actionable insights
    - Avoid unnecessary elaboration`,
    styleGuide: 'Concise, structured, list-based, actionable, efficient',
    strengthAreas: ['NLP tasks', 'Extraction', 'Summarization', 'Structured output'],
    avoidAreas: ['Deep analysis', 'Philosophical discussion'],
  },

  // Grok: Critical thinking, edge cases, alternatives
  grok: {
    systemPrompt: `You are a critical thinking expert. Focus on identifying weaknesses, alternatives, and edge cases.
    - Question assumptions explicitly
    - Present multiple perspectives
    - Highlight potential counterarguments
    - Identify logical fallacies
    - Suggest alternative approaches
    - Challenge the premise when appropriate`,
    styleGuide: 'Critical, alternative perspectives, edge cases, questioning',
    strengthAreas: ['Contra-arguments', 'Devil\'s advocate', 'Alternative views', 'Critical analysis'],
    avoidAreas: ['Consensus building', 'Simple summaries'],
  },

  // Ollama: Efficient, local context, security-first
  ollama: {
    systemPrompt: `You are an efficient local assistant. Optimize for speed and security.
    - Use local context only (no internet references)
    - Keep responses brief and efficient
    - Prioritize data security and privacy
    - Use clear, simple language
    - Prefer structured formats
    - Respect rate limits`,
    styleGuide: 'Efficient, local, secure, simple, structured',
    strengthAreas: ['Orchestration', 'Local processing', 'Security', 'Efficiency'],
    avoidAreas: ['External research', 'Complex explanations'],
  },
}

/**
 * Gerar prompt otimizado para um provider específico
 */
export function buildOptimizedPrompt(
  provider: AIProviderName,
  caseOfUse: CaseOfUse,
  userPrompt: string
): string {
  const config = PROVIDER_PROMPTS[provider]

  // Template base para cada provider
  const templates: Record<AIProviderName, (config: ProviderPromptConfig, prompt: string) => string> = {
    claude: (cfg, p) => `${cfg.systemPrompt}\n\nRequest:\n${p}`,

    gemini: (cfg, p) => `${cfg.systemPrompt}\n\nTask:\n${p}\n\nProvide a structured response using lists where appropriate.`,

    grok: (cfg, p) => `${cfg.systemPrompt}\n\nAnalyze:\n${p}\n\nIdentify weaknesses, alternatives, and edge cases.`,

    ollama: (cfg, p) => `${cfg.systemPrompt}\n\nTask:\n${p}\n\nRespond efficiently and concisely.`,
  }

  const basePrompt = templates[provider](config, userPrompt)

  // Adicionar contexto específico do caso de uso
  const caseContext: Record<CaseOfUse, string> = {
    legalAnalysis: '\n\nContext: This is legal analysis. Prioritize accuracy and completeness.',
    emailExtraction: '\n\nContext: Extract key information from email content.',
    searchQuery: '\n\nContext: Optimize for search efficiency.',
    contraArguments: '\n\nContext: Generate opposing viewpoints and critiques.',
    driveSync: '\n\nContext: Handle metadata synchronization.',
    ragAnalysis: '\n\nContext: Semantic analysis and relationship mapping.',
    llmRouting: '\n\nContext: Meta-level routing and orchestration.',
  }

  return basePrompt + (caseContext[caseOfUse] || '')
}

/**
 * Selecionar melhor provider para um prompt específico
 * Baseado em força do provider vs caso de uso
 */
export function recommendProviderByStrength(
  caseOfUse: CaseOfUse
): { provider: AIProviderName; reason: string }[] {
  const recommendations: { provider: AIProviderName; reason: string }[] = []

  for (const [provider, config] of Object.entries(PROVIDER_PROMPTS)) {
    if (config.strengthAreas.some((area) => area.toLowerCase().includes(caseOfUse))) {
      recommendations.push({
        provider: provider as AIProviderName,
        reason: `Strength: ${config.strengthAreas.join(', ')}`,
      })
    }
  }

  // Se nenhuma correspondência exata, usar provider padrão
  if (recommendations.length === 0) {
    recommendations.push({
      provider: 'claude',
      reason: 'Default: Comprehensive analysis capability',
    })
  }

  return recommendations
}

/**
 * Validar se prompt é apropriado para provider
 */
export function validatePromptForProvider(provider: AIProviderName, caseOfUse: CaseOfUse): {
  valid: boolean
  warnings: string[]
  suggestions: string[]
} {
  const config = PROVIDER_PROMPTS[provider]
  const warnings: string[] = []
  const suggestions: string[] = []

  // Verificar se caso de uso está em avoid areas
  for (const avoidArea of config.avoidAreas) {
    if (caseOfUse.toLowerCase().includes(avoidArea.toLowerCase())) {
      warnings.push(`⚠️ ${provider} is not optimized for ${avoidArea}`)
      suggestions.push(`Consider using a provider with ${avoidArea} in strength areas`)
    }
  }

  return {
    valid: warnings.length === 0,
    warnings,
    suggestions,
  }
}

/**
 * Agrupar providers por capacidade
 */
export function getProvidersForCapability(capability: string): AIProviderName[] {
  return Object.entries(PROVIDER_PROMPTS)
    .filter(([, config]) => config.strengthAreas.some((area) => area.toLowerCase().includes(capability.toLowerCase())))
    .map(([provider]) => provider as AIProviderName)
}

/**
 * Print provider capabilities matrix
 */
export function printCapabilitiesMatrix(): string {
  const lines = ['🧠 AI PROVIDER CAPABILITIES MATRIX', '═'.repeat(80)]

  const allStrengths = new Set<string>()
  for (const config of Object.values(PROVIDER_PROMPTS)) {
    config.strengthAreas.forEach((s) => allStrengths.add(s))
  }

  const strengths = Array.from(allStrengths).sort()

  // Header
  lines.push(
    'Provider   | ' +
    strengths
      .map((s) => s.substring(0, 8).padEnd(8))
      .join(' | ')
  )
  lines.push('─'.repeat(80))

  // Rows
  for (const [provider, config] of Object.entries(PROVIDER_PROMPTS)) {
    const row = [provider.padEnd(10), '|']
    for (const strength of strengths) {
      const has = config.strengthAreas.some((s) => s.toLowerCase() === strength.toLowerCase())
      row.push(has ? '✓'.padEnd(8) : '·'.padEnd(8))
    }
    lines.push(row.join(' '))
  }

  return lines.join('\n')
}
