/**
 * RAG Service - Retrieval-Augmented Generation
 * Handles jurisprudence search and document analysis
 */

import { llmRouter } from './llmRouter'
import type {
  JurisprudentialReference,
  LegislativeReference,
  RAGSearchQuery,
  RAGSearchResult,
  PetitionAnalysisRequest,
  PetitionAnalysisResult,
  PetitionFinding,
  RAGConfig,
  CacheEntry,
  ConflictDetection,
  ComparisonAnalysis,
} from '../types/rag'
import { DocumentType, AnalysisType } from '../types/rag'

class RAGService {
  private config: RAGConfig
  private cache: Map<string, CacheEntry<any>>
  private searchHistory: Array<{
    query: RAGSearchQuery
    results: JurisprudentialReference[]
    timestamp: number
  }>

  constructor(config: Partial<RAGConfig> = {}) {
    this.config = {
      enableCaching: config.enableCaching ?? true,
      cacheTTL: config.cacheTTL ?? 3600000, // 1 hour
      minRelevanceThreshold: config.minRelevanceThreshold ?? 60,
      maxResults: config.maxResults ?? 10,
      searchTimeout: config.searchTimeout ?? 30000,
    }
    this.cache = new Map()
    this.searchHistory = []
  }

  /**
   * Search jurisprudence (simulated - in production, would call Legal Data Hunter API)
   */
  async searchJurisprudence(query: RAGSearchQuery): Promise<RAGSearchResult> {
    const startTime = Date.now()
    const cacheKey = this.generateCacheKey('jurisprudence', query)

    // Check cache
    if (this.config.enableCaching) {
      const cached = this.cache.get(cacheKey)
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data as RAGSearchResult
      }
    }

    try {
      // In production, this would call Legal Data Hunter API
      // For now, we'll generate mock results with relevant keywords
      const results = this.generateMockJurisprudence(query)

      // Cache results
      if (this.config.enableCaching) {
        this.cache.set(cacheKey, {
          data: results,
          timestamp: Date.now(),
          expiresAt: Date.now() + this.config.cacheTTL,
        })
      }

      // Track search
      this.searchHistory.push({
        query,
        results: results.documents,
        timestamp: Date.now(),
      })

      return results
    } catch (error) {
      throw new Error(`Jurisprudence search failed: ${error}`)
    }
  }

  /**
   * Search legislation
   */
  async searchLegislation(query: RAGSearchQuery): Promise<RAGSearchResult> {
    const cacheKey = this.generateCacheKey('legislation', query)

    if (this.config.enableCaching) {
      const cached = this.cache.get(cacheKey)
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data as RAGSearchResult
      }
    }

    // Mock legislation search
    const results = this.generateMockLegislation(query)

    if (this.config.enableCaching) {
      this.cache.set(cacheKey, {
        data: results,
        timestamp: Date.now(),
        expiresAt: Date.now() + this.config.cacheTTL,
      })
    }

    return results
  }

  /**
   * Analyze petition for strengths and weaknesses
   */
  async analyzePetition(request: PetitionAnalysisRequest): Promise<PetitionAnalysisResult> {
    // Search for supporting jurisprudence
    const jurisprudence = await this.searchJurisprudence({
      query: request.content.substring(0, 200),
      jurisdiction: request.jurisdiction,
      minRelevance: 70,
    })

    // Search for relevant legislation
    const legislation = await this.searchLegislation({
      query: request.content,
      jurisdiction: request.jurisdiction,
    })

    // Use LLM to analyze petition
    const analysisPrompt = this.buildAnalysisPrompt(
      request.content,
      request.title,
      request.analysisTypes,
      jurisprudence.documents,
      legislation.documents as any
    )

    const analysisResponse = await llmRouter.route({
      prompt: analysisPrompt,
      system: `You are a legal expert analyzing judicial petitions. Provide detailed analysis in Portuguese.
              Focus on strengths, weaknesses, contradictions, procedural issues, and gaps in the petition.
              Reference relevant jurisprudence and legislation when applicable.`,
      maxTokens: 3000,
      strategy: 'quality-optimized',
    })

    // Parse LLM response to extract findings
    const findings = this.parseAnalysisResponse(analysisResponse.content, request.content)

    return {
      documentId: request.documentId,
      analysisType: 'strengths' as AnalysisType,
      findings,
      relevantJurisprudence: jurisprudence.documents,
      relevantLegislation: legislation.documents as LegislativeReference[],
      summary: this.generateSummary(findings),
      confidence: 0.85,
      generatedAt: new Date(),
    }
  }

  /**
   * Detect conflicts within a petition
   */
  async detectConflicts(content: string, title: string): Promise<ConflictDetection> {
    const prompt = `Analyze the following legal petition for internal contradictions and conflicts.

Title: ${title}

Content:
${content}

Identify any contradictions between different statements, conflicting legal arguments,
procedural inconsistencies, or logical fallacies. Format your response as a JSON array of conflicts.`

    const response = await llmRouter.route({
      prompt,
      system: 'You are a legal expert analyzing for contradictions and conflicts.',
      maxTokens: 2000,
      strategy: 'quality-optimized',
    })

    // Parse response to extract conflicts
    const conflicts = this.parseConflictDetection(response.content)

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
    }
  }

  /**
   * Generate counter-arguments for opposing counsel
   */
  async generateCounterArguments(
    petitionContent: string,
    petitionTitle: string,
    relatedJurisprudence: JurisprudentialReference[]
  ): Promise<string[]> {
    const jurisprudenceSummary = relatedJurisprudence
      .slice(0, 3)
      .map((j) => `- ${j.title} (${j.tribunal}): ${j.summary}`)
      .join('\n')

    const prompt = `Based on the following petition and relevant jurisprudence,
generate 5-7 strong counter-arguments that an opposing counsel could use.

Petition:
${petitionContent}

Relevant Jurisprudence:
${jurisprudenceSummary}

Provide counter-arguments that are legally sound and grounded in the jurisprudence provided.
Each counter-argument should be specific and actionable.`

    const response = await llmRouter.route({
      prompt,
      system: 'You are an experienced opposing counsel preparing counter-arguments to a judicial petition.',
      maxTokens: 2000,
      strategy: 'quality-optimized',
    })

    return this.parseCounterArguments(response.content)
  }

  /**
   * Compare petition against jurisprudence to assess quality
   */
  async compareAgainstJurisprudence(
    petitionContent: string,
    jurisprudence: JurisprudentialReference[]
  ): Promise<ComparisonAnalysis> {
    const jurisprudenceSummary = jurisprudence
      .map((j) => `${j.title}: ${j.summary}`)
      .join('\n\n')

    const prompt = `Compare the following petition against these jurisprudential references.
Assess the petition's legal strength, identify gaps, and provide recommendations.

Petition (first 500 chars):
${petitionContent.substring(0, 500)}...

Jurisprudential References:
${jurisprudenceSummary}

Provide:
1. Assessment of strength (0-100)
2. Assessment of vulnerability (0-100)
3. List of gaps compared to jurisprudence
4. Recommendations for improvement`

    const response = await llmRouter.route({
      prompt,
      system: 'You are a legal analyst comparing petitions against established jurisprudence.',
      maxTokens: 2000,
    })

    return this.parseComparisonAnalysis(response.content, petitionContent, jurisprudence)
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(type: string, query: RAGSearchQuery): string {
    return `${type}-${query.query}-${query.jurisdiction || 'all'}`
  }

  /**
   * Build analysis prompt for LLM
   */
  private buildAnalysisPrompt(
    content: string,
    title: string,
    analysisTypes: AnalysisType[],
    jurisprudence: JurisprudentialReference[],
    legislation: LegislativeReference[]
  ): string {
    const analysisTypesList = analysisTypes.join(', ')
    const jurisprudenceList = jurisprudence
      .slice(0, 3)
      .map((j) => `- ${j.title} (${j.tribunal}): ${j.summary}`)
      .join('\n')

    return `Analyze the following judicial petition for: ${analysisTypesList}

Title: ${title}

Content:
${content}

Relevant Jurisprudence:
${jurisprudenceList}

Provide detailed findings for each analysis type, referencing the jurisprudence where applicable.
Format findings clearly with severity levels (critical, high, medium, low, info).`
  }

  /**
   * Parse analysis response from LLM
   */
  private parseAnalysisResponse(response: string, petitionContent: string): PetitionFinding[] {
    const findings: PetitionFinding[] = []

    // Extract findings based on analysis types
    const paragraphs = petitionContent.split('\n\n')

    // This is a simplified parser - in production, would use more sophisticated NLP
    if (response.toLowerCase().includes('weakness') || response.toLowerCase().includes('fraco')) {
      findings.push({
        type: 'weaknesses' as AnalysisType,
        description: 'Identified potential weakness in petition structure',
        severity: 'medium',
        location: {
          paragraph: 0,
          excerpt: paragraphs[0]?.substring(0, 100) || '',
        },
        suggestion: 'Consider reinforcing this section with additional jurisprudential support',
      })
    }

    if (response.toLowerCase().includes('gap') || response.toLowerCase().includes('lacuna')) {
      findings.push({
        type: 'gaps' as AnalysisType,
        description: 'Identified potential gaps in legal argumentation',
        severity: 'high',
        location: {
          paragraph: 1,
          excerpt: paragraphs[1]?.substring(0, 100) || '',
        },
        suggestion: 'Add missing legal arguments to strengthen petition',
      })
    }

    if (response.toLowerCase().includes('contradict') || response.toLowerCase().includes('contradit')) {
      findings.push({
        type: 'contradictions' as AnalysisType,
        description: 'Found internal contradictions',
        severity: 'critical',
        location: {
          paragraph: 0,
          excerpt: 'Check for consistency in legal arguments',
        },
      })
    }

    return findings.length > 0
      ? findings
      : [
          {
            type: 'strengths' as AnalysisType,
            description: 'Petition appears well-structured with clear legal arguments',
            severity: 'info',
            location: {
              excerpt: 'Overall assessment',
            },
          },
        ]
  }

  /**
   * Parse conflict detection response
   */
  private parseConflictDetection(
    response: string
  ): Array<{
    type: 'internal' | 'external'
    description: string
    paragraph1?: number
    paragraph2?: number
    severity: 'critical' | 'high' | 'medium'
    resolution?: string
  }> {
    const conflicts = []

    if (response.toLowerCase().includes('contradict') || response.toLowerCase().includes('conflito')) {
      conflicts.push({
        type: 'internal' as const,
        description: 'Internal contradiction detected in legal argumentation',
        severity: 'high' as const,
        resolution: 'Review and clarify conflicting statements',
      })
    }

    return conflicts
  }

  /**
   * Parse counter-arguments from LLM response
   */
  private parseCounterArguments(response: string): string[] {
    // Split response by numbered items or bullet points
    const lines = response.split('\n').filter((line) => line.trim())
    const args: string[] = []

    for (const line of lines) {
      if (line.match(/^[\d\-\*•]/)) {
        args.push(line.replace(/^[\d\-\*•\s]+/, '').trim())
      }
    }

    return args.length > 0 ? args : [response]
  }

  /**
   * Parse comparison analysis response
   */
  private parseComparisonAnalysis(
    response: string,
    petitionContent: string,
    jurisprudence: JurisprudentialReference[]
  ): ComparisonAnalysis {
    // Extract scores from response
    const strengthMatch = response.match(/(\d+)\s*(?:de|\/)\s*100.*strength|strengt/)
    const strengthScore = strengthMatch ? parseInt(strengthMatch[1]) : 70

    const vulnerabilityMatch = response.match(/(\d+)\s*(?:de|\/)\s*100.*vulnerab/)
    const vulnerabilityScore = vulnerabilityMatch ? parseInt(vulnerabilityMatch[1]) : 30

    return {
      petitionContent: petitionContent.substring(0, 200),
      jurisprudentialSupport: jurisprudence,
      gaps: this.extractGaps(response),
      strengthScore,
      vulnerabilityScore,
      recommendations: this.extractRecommendations(response),
    }
  }

  /**
   * Extract gaps from response
   */
  private extractGaps(response: string): string[] {
    const lines = response.split('\n')
    const gaps: string[] = []

    for (const line of lines) {
      if (line.toLowerCase().includes('gap') || line.toLowerCase().includes('lacuna')) {
        gaps.push(line.replace(/^[\d\-\*•\s]+/, '').trim())
      }
    }

    return gaps.length > 0 ? gaps : ['Review petition for completeness against jurisprudence']
  }

  /**
   * Extract recommendations from response
   */
  private extractRecommendations(response: string): string[] {
    const lines = response.split('\n')
    const recommendations: string[] = []

    for (const line of lines) {
      if (
        line.toLowerCase().includes('recommend') ||
        line.toLowerCase().includes('suggest') ||
        line.toLowerCase().includes('consider')
      ) {
        recommendations.push(line.replace(/^[\d\-\*•\s]+/, '').trim())
      }
    }

    return recommendations.length > 0 ? recommendations : ['Strengthen jurisprudential support']
  }

  /**
   * Generate summary from findings
   */
  private generateSummary(findings: PetitionFinding[]): string {
    const criticalCount = findings.filter((f) => f.severity === 'critical').length
    const highCount = findings.filter((f) => f.severity === 'high').length

    if (criticalCount > 0) {
      return `Petition has ${criticalCount} critical issues requiring immediate attention`
    } else if (highCount > 0) {
      return `Petition has ${highCount} high-priority improvements needed`
    } else {
      return 'Petition appears well-structured with no critical issues identified'
    }
  }

  /**
   * Generate mock jurisprudence (for testing)
   */
  private generateMockJurisprudence(query: RAGSearchQuery): RAGSearchResult {
    const mockResults: JurisprudentialReference[] = [
      {
        id: 'jur-001',
        title: 'STF - RE 123456/SP',
        tribunal: 'Supremo Tribunal Federal',
        date: new Date('2023-06-15'),
        citation: 'RE 123456/SP, Rel. Min. Rosa Weber, DJ 15.06.2023',
        summary:
          'Petition analysis jurisprudence establishing standards for judicial review. Relevant for validating petition structure and argumentation.',
        relevanceScore: 95,
        documentType: DocumentType.JURISPRUDENCE,
        jurisdiction: 'BR',
        keywords: ['judicial petition', 'structure', 'argumentation'],
      },
      {
        id: 'jur-002',
        title: 'TJ/SP - Apelação 987654/SP',
        tribunal: 'Tribunal de Justiça de São Paulo',
        date: new Date('2023-03-10'),
        citation: 'Ap 987654/SP, Rel. Des. João Silva, DJ 10.03.2023',
        summary: 'Appeals court decision on petition requirements and legal sufficiency.',
        relevanceScore: 87,
        documentType: DocumentType.PRECEDENT,
        jurisdiction: 'BR-SP',
        keywords: ['petition requirements', 'legal sufficiency'],
      },
      {
        id: 'jur-003',
        title: 'OJ nº 45/STJ',
        tribunal: 'Superior Tribunal de Justiça',
        date: new Date('2022-12-01'),
        citation: 'OJ 45/STJ',
        summary: 'Orientação jurisprudencial on procedural requirements for petitions.',
        relevanceScore: 82,
        documentType: DocumentType.CASE_LAW,
        jurisdiction: 'BR',
        keywords: ['procedural requirements', 'petition standards'],
      },
    ]

    return {
      documents: mockResults.filter((d) => d.relevanceScore >= (query.minRelevance || 0)),
      totalCount: mockResults.length,
      executionTime: Math.random() * 1000,
      query,
    }
  }

  /**
   * Generate mock legislation (for testing)
   */
  private generateMockLegislation(query: RAGSearchQuery): RAGSearchResult {
    // Cast as jurisprudence for compatibility
    const mockResults: any[] = [
      {
        id: 'leg-001',
        title: 'Lei nº 13.105/2015 - Código de Processo Civil',
        jurisdiction: 'BR',
        type: 'law',
        date: new Date('2015-03-16'),
        articles: [
          {
            number: '319',
            content:
              'A petição inicial deve conter os requisitos legais para uma ação válida e bem fundamentada.',
          },
        ],
        relevanceScore: 98,
        keywords: ['petition requirements', 'civil procedure'],
      },
    ]

    return {
      documents: mockResults,
      totalCount: mockResults.length,
      executionTime: Math.random() * 500,
      query,
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * Get search history
   */
  getSearchHistory() {
    return this.searchHistory
  }

  /**
   * Clear search history
   */
  clearHistory(): void {
    this.searchHistory = []
  }
}

export const ragService = new RAGService()
export { RAGService }
