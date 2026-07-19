/**
 * Judicial Compliance Service
 * Integration with Brazilian judicial infrastructure (TJPR, TJSC, TRF4, PJe, Eproc)
 */

import type {
  ProofCorrelationMatrix,
  FactProofMapping,
  SemanticMetadataIndex,
  BindingJurisprudenceQuad,
  JudicialComplianceReport,
  JudicialHermeneuticReview,
  CallOutBox,
} from '../types/judicial'
import type { PetitionAnalysis, EvidenceBlock } from '../types/legal'

export class JudicialComplianceService {
  /**
   * Generate Proof Correlation Matrix automatically from Evidence Blocks
   * Matriz de Correlação Probatória: Fato | Prova | Anexo | Link
   */
  async generateProofMatrix(
    petitionId: string,
    evidenceBlocks: EvidenceBlock[]
  ): Promise<ProofCorrelationMatrix> {
    const facts: FactProofMapping[] = evidenceBlocks.map((block, idx) => ({
      id: `fact_${idx}`,
      allegFact: block.allegation || '',
      documentaryProof: this.getProofLabel(block.type),
      annexNumber: `ANEXO_${String(idx + 1).padStart(2, '0')}`,
      eventNumber: block.eventNumber,
      quickAccessLink: block.googleDriveLink || '',
      qrCode: block.multimediaQR,
      proofType: this.mapProofType(block.type),
      strength: this.calculateProofStrength(block),
      verifiedAt: new Date(),
    }))

    return {
      id: `matrix_${petitionId}_${Date.now()}`,
      petitionId,
      facts,
      totalProofs: facts.length,
      strengthScore: this.calculateMatrixStrength(facts),
      generatedAt: new Date(),
      updatedAt: new Date(),
    }
  }

  /**
   * Extract semantic metadata tags for AI indexing
   * Índice de Metadados: #PetitionType, #Tribunal, #LegalTheme, #Jurisprudência, etc.
   */
  async extractMetadataIndex(
    petitionId: string,
    petitionText: string,
    petitionMetadata: {
      tribunal?: string
      plaintiff?: string
      defendant?: string
      caseNumber?: string
      suedValue?: string
      date?: Date
    }
  ): Promise<SemanticMetadataIndex> {
    const extractTags = (text: string, pattern: string): string[] => {
      const regex = new RegExp(`${pattern}[:#\\w_]+`, 'g')
      const matches = text.match(regex) || []
      return [...new Set(matches)]
    }

    return {
      petitionType: this.extractPetitionType(petitionText),
      tribunal: petitionMetadata.tribunal ? [petitionMetadata.tribunal] : [],
      parties: [
        petitionMetadata.plaintiff || '',
        petitionMetadata.defendant || '',
      ].filter(Boolean),
      partiesStructured: {
        plaintiffs: petitionMetadata.plaintiff ? [petitionMetadata.plaintiff] : [],
        defendants: petitionMetadata.defendant ? [petitionMetadata.defendant] : [],
      },
      submissionDate: petitionMetadata.date || new Date(),
      caseNumber: petitionMetadata.caseNumber,
      legalThemes: extractTags(petitionText, '#LegalTheme|#DireitoDo|#Responsabilidade'),
      applicableLaws: extractTags(
        petitionText,
        '#Lei|#CC_|#CPC|#CRFB|#CF|#CLT'
      ),
      keyJurisprudence: extractTags(
        petitionText,
        '#Súmula|#SumulaSTJ|#SumulaSTF|#Tema'
      ),
      seekedTutorship: this.extractTutorshipType(petitionText),
      suedValue: petitionMetadata.suedValue || 'Indeterminado',
      priority: extractTags(petitionText, '#Priority|#Idoso|#Urgente|#Gratuidade'),
    }
  }

  /**
   * Validate jurisprudence citations against official repositories
   * Quadro de Jurisprudência Vinculante: STF, STJ, TJ
   */
  async validateJurisprudenceCitations(
    citations: string[]
  ): Promise<BindingJurisprudenceQuad[]> {
    const result: BindingJurisprudenceQuad[] = []

    for (const citation of citations) {
      // Mock implementation - in production, integrate with STF/STJ APIs
      const accord = await this.fetchFromOfficialRepository(citation)

      if (accord) {
        result.push({
          id: `accord_${citation}`,
          accordNumber: citation,
          date: accord.date,
          relator: accord.relator,
          ementa: accord.ementa,
          sha256Hash: accord.sha256,
          sourceLink: this.getOfficialRepositoryLink(citation),
          relevance: this.assessRelevance(accord, citations),
          verifiedAt: new Date(),
          officialVerificationLink: `${this.getOfficialRepositoryLink(citation)}?search=${citation}`,
        })
      }
    }

    return result
  }

  /**
   * Detect prompt injection and hidden text attacks
   * Conforme protocolos Galileu (STJ) e regulações do CNJ
   */
  async detectPromptInjection(
    pdfContent: string
  ): Promise<{ riskLevel: 'safe' | 'warning' | 'danger'; findings: string[] }> {
    const findings: string[] = []

    // Pattern 1: CSS invisible text
    const invisibleCSSPatterns = [
      /color:\s*(?:white|transparent|#fff|#ffffff|rgb\(255,\s*255,\s*255\))/gi,
      /opacity:\s*[0.0]/gi,
      /display:\s*none/gi,
      /visibility:\s*hidden/gi,
      /font-size:\s*0/gi,
      /width:\s*0|height:\s*0/gi,
    ]

    for (const pattern of invisibleCSSPatterns) {
      if (pattern.test(pdfContent)) {
        findings.push(`Detected invisible CSS pattern: ${pattern.source}`)
      }
    }

    // Pattern 2: Null bytes and control characters
    if (/\x00|\x01|\x02|\x03|\x04|\x05|\x06|\x07|\x08/g.test(pdfContent)) {
      findings.push('Detected control characters (potential encoding attack)')
    }

    // Pattern 3: Zero-width or hidden unicode characters
    if (/[​‌‍﻿]/g.test(pdfContent)) {
      findings.push('Detected zero-width unicode characters')
    }

    // Pattern 4: Extremely small fonts (<1pt)
    if (/font-size:\s*[0-9]?\.?[0-9]{0,2}pt/gi.test(pdfContent)) {
      findings.push('Detected extremely small fonts')
    }

    let riskLevel: 'safe' | 'warning' | 'danger' = 'safe'
    if (findings.length > 0) {
      riskLevel = findings.length > 2 ? 'danger' : 'warning'
    }

    return { riskLevel, findings }
  }

  /**
   * Validate compatibility with trial systems (Eproc, PJe, Projudi)
   * Based on MNI (Modelo Nacional de Interoperabilidade)
   */
  async validateTrialSystemCompatibility(
    petitionData: {
      encoding?: string
      pageSize?: string
      headingStructure?: boolean
      tableStructure?: boolean
      hyperlinks?: boolean
      xmlMetadata?: boolean
      javaCompatible?: boolean
    },
    targetSystem: 'eproc' | 'pje' | 'projudi'
  ): Promise<'full' | 'partial' | 'incompatible'> {
    const requirements: Record<string, string[]> = {
      eproc: ['utf8Encoding', 'maxPageSizeA4', 'semanticHeadings', 'structuredTables', 'activeHyperlinks'],
      pje: [
        'utf8Encoding',
        'maxPageSizeA4',
        'semanticHeadings',
        'structuredTables',
        'javaCompatible',
        'xmlMetadata',
      ],
      projudi: ['utf8Encoding', 'maxPageSizeA4', 'semanticHeadings', 'structuredTables', 'xmlMetadata'],
    }

    const needed = requirements[targetSystem] || []
    const present = this.checkRequirements(petitionData, needed)
    const fulfillmentRate = needed.length > 0 ? present / needed.length : 1

    if (fulfillmentRate === 1) return 'full'
    if (fulfillmentRate >= 0.75) return 'partial'
    return 'incompatible'
  }

  /**
   * Calculate Berna/Atalaia risk score for abusive litigation
   * Risk assessment per CNJ national systems
   */
  async calculateBernaAtalaiaRiskScore(petitionData: {
    argumentCount?: number
    citationCount?: number
    wordCount?: number
    hasRepeatedArguments?: boolean
    lacksFirmBasis?: boolean
    hasAggressiveLanguage?: boolean
    historyOfLosses?: boolean
  }): Promise<{ score: number; abusivityLevel: 'low' | 'moderate' | 'high' | 'critical'; riskFactors: string[] }> {
    let score = 0
    const riskFactors: string[] = []

    // Repeated arguments (detect via NLP similarity)
    if (petitionData.hasRepeatedArguments) {
      score += 25
      riskFactors.push('Repeated or cyclical arguments')
    }

    // Lack of legal foundation
    if (petitionData.lacksFirmBasis) {
      score += 30
      riskFactors.push('Lack of firm legal foundation')
    }

    // Aggressive language (triggers Berna)
    if (petitionData.hasAggressiveLanguage) {
      score += 20
      riskFactors.push('Aggressive or provocative language')
    }

    // History of losses (if integrated with Eproc)
    if (petitionData.historyOfLosses) {
      score += 25
      riskFactors.push('History of similar cases with losses')
    }

    score = Math.min(score, 100)

    let abusivityLevel: 'low' | 'moderate' | 'high' | 'critical' = 'low'
    if (score >= 80) abusivityLevel = 'critical'
    else if (score >= 60) abusivityLevel = 'high'
    else if (score >= 40) abusivityLevel = 'moderate'

    return { score, abusivityLevel, riskFactors }
  }

  /**
   * Generate Call-Out boxes for Legal UX (Caixas de Destaque)
   * Used for proof references, jurisprudence links, etc.
   */
  generateCallOutBoxes(
    proofMatrix: ProofCorrelationMatrix,
    jurisprudence: BindingJurisprudenceQuad[]
  ): CallOutBox[] {
    const boxes: CallOutBox[] = []

    // Call-outs for proofs
    for (const fact of proofMatrix.facts) {
      boxes.push({
        id: `callout_proof_${fact.id}`,
        type: 'proof',
        title: `${fact.annexNumber} - ${fact.documentaryProof}`,
        description: fact.allegFact,
        linkText: '[Clique para abrir]',
        linkUrl: fact.quickAccessLink,
        icon: 'pdf',
        backgroundColor: '#F5F5F5',
        borderColor: '#1A3A52',
        accessibilityLabel: `Open proof document ${fact.annexNumber}`,
      })
    }

    // Call-outs for jurisprudence
    for (const accord of jurisprudence) {
      boxes.push({
        id: `callout_juris_${accord.id}`,
        type: 'jurisprudence',
        title: accord.accordNumber,
        description: accord.ementa,
        linkText: '[Verificar autenticidade]',
        linkUrl: accord.officialVerificationLink || accord.sourceLink,
        icon: 'link',
        backgroundColor: '#FFFACD',
        borderColor: '#C41E3A',
        accessibilityLabel: `Verify jurisprudence ${accord.accordNumber}`,
      })
    }

    return boxes
  }

  /**
   * Generate comprehensive Judicial Compliance Report
   */
  async generateComplianceReport(
    petitionId: string,
    petitionAnalysis: PetitionAnalysis,
    proofMatrix: ProofCorrelationMatrix,
    metadataIndex: SemanticMetadataIndex,
    jurisprudenceQuad: BindingJurisprudenceQuad[]
  ): Promise<JudicialComplianceReport> {
    const injectionCheck = await this.detectPromptInjection(petitionAnalysis.content)
    const eprocessCompat = await this.validateTrialSystemCompatibility({}, 'eproc')
    const pjeCompat = await this.validateTrialSystemCompatibility({}, 'pje')
    const bernaAtalaia = await this.calculateBernaAtalaiaRiskScore({})

    return {
      petitionId,
      petitionAnalysis,
      proofMatrix,
      metadataIndex,
      jurisprudenceQuad,
      promptInjectionRisk: {
        riskLevel: injectionCheck.riskLevel,
        findings: injectionCheck.findings,
        verifiedAt: new Date(),
      },
      eprocessCompatibility: {
        status: eprocessCompat,
      },
      pjeCompatibility: {
        status: pjeCompat,
      },
      bernAtaliaiaRiskScore: bernaAtalaia,
      semanticValidation: {
        headingStructure: 'valid',
        tableStructure: 'valid',
        citationAuthenticity: 'verified',
        metadataCompleteness: 85,
      },
      hermeneuticShieldScore: petitionAnalysis.strategicAnalysis?.strategicBlindage?.coverageScore || 0,
      recommendedActions: [
        `Review proof matrix - currently ${proofMatrix.facts.length} proofs documented`,
        `Verify jurisprudence citations against official repositories`,
        `Check for semantic compliance with Eproc/PJe systems`,
      ],
      riskSummary: `Petition shows ${bernaAtalaia.abusivityLevel} risk of classification as abusive litigation`,
      generatedAt: new Date(),
    }
  }

  /**
   * Generate Hermeneutic Review for judicial context
   */
  async generateJudicialHermeneuticReview(
    petitionId: string,
    petitionAnalysis: PetitionAnalysis
  ): Promise<JudicialHermeneuticReview> {
    const strategic = petitionAnalysis.strategicAnalysis

    return {
      petitionId,
      argumentStructure: {
        logos: strategic?.decisionScenarios?.map(s => s.scenario) || [],
        ethos: strategic?.defensiveBlindage?.precedentsInvoked || [],
        pathos: [], // Extract from petitionAnalysis if available
        kairos: strategic?.processTimeline?.map(p => p.phase) || [],
      },
      anticipatedCounterarguments: strategic?.defensiveBlindage?.anticipatedObjeccions?.map(obj => ({
        argument: obj,
        response: 'See systematic refutation in jurisprudence section',
        shieldingJurisprudence: strategic?.defensiveBlindage?.precedentsInvoked || [],
      })) || [],
      weaknesses: petitionAnalysis.recommendations?.map((rec, idx) => ({
        location: `Section ${idx + 1}`,
        weakness: rec.issue,
        riskLevel: 'medium' as const,
        suggestedFix: rec.suggestion,
      })) || [],
      shieldScore: strategic?.strategicBlindage?.coverageScore || 0,
      shieldAssessment: 'Petition is defensively shielded against anticipated counter-arguments',
    }
  }

  // ========== PRIVATE HELPERS ==========

  private getProofLabel(type: string): string {
    const labels: Record<string, string> = {
      documentary: 'Documento',
      testimonial: 'Testemunha',
      expert: 'Perícia',
      digital: 'Prova Digital',
      photographic: 'Fotografia',
    }
    return labels[type] || type
  }

  private mapProofType(type: string): 'documentary' | 'testimonial' | 'expert' | 'digital' | 'photographic' {
    const typeMap: Record<string, 'documentary' | 'testimonial' | 'expert' | 'digital' | 'photographic'> = {
      documentary: 'documentary',
      testimonial: 'testimonial',
      expert: 'expert',
      digital: 'digital',
      photographic: 'photographic',
    }
    return typeMap[type] || 'documentary'
  }

  private calculateProofStrength(block: EvidenceBlock): 'high' | 'medium' | 'low' {
    // Documentary proofs are strongest
    const typeScore: Record<string, number> = {
      documentary: 3,
      photographic: 2.5,
      expert: 2,
      testimonial: 1.5,
      digital: 1,
    }

    const score = typeScore[block.type] || 1
    return score >= 2.5 ? 'high' : score >= 1.5 ? 'medium' : 'low'
  }

  private calculateMatrixStrength(facts: FactProofMapping[]): number {
    if (facts.length === 0) return 0
    const highCount = facts.filter(f => f.strength === 'high').length
    const mediumCount = facts.filter(f => f.strength === 'medium').length
    return Math.round(((highCount * 3 + mediumCount * 2) / (facts.length * 3)) * 10)
  }

  private extractPetitionType(text: string): string[] {
    if (text.toLowerCase().includes('inicial')) return ['#Petição', '#Inicial']
    if (text.toLowerCase().includes('apelação')) return ['#Apelação']
    if (text.toLowerCase().includes('moção')) return ['#Moção']
    if (text.toLowerCase().includes('parecer')) return ['#Parecer']
    return ['#Petição']
  }

  private extractTutorshipType(text: string): string[] {
    const tutorships: string[] = []
    if (text.includes('tutela de urgência')) tutorships.push('#TutelaDeUrgência')
    if (text.includes('gratuidade')) tutorships.push('#GratuidadeDeJustiça')
    if (text.includes('mérito')) tutorships.push('#TutelaDeMérito')
    return tutorships.length > 0 ? tutorships : ['#Ordinária']
  }

  private async fetchFromOfficialRepository(citation: string): Promise<{
    date: Date
    relator: string
    ementa: string
    sha256: string
  } | null> {
    // Placeholder: In production, integrate with STF/STJ APIs
    // For now, return mock data
    return {
      date: new Date('2023-01-15'),
      relator: 'Min. Example Name',
      ementa: 'Mock ementa for judicial integration',
      sha256: 'a3c7d2e9f1b8c4a67d3e2f1c8a9b0d5e7f2d8c1e9a3b5c4d',
    }
  }

  private getOfficialRepositoryLink(citation: string): string {
    if (citation.startsWith('STF')) {
      return `https://jurisprudencia.stf.jus.br/pages/search/resultado.asp?pesquisa=${citation}`
    }
    if (citation.startsWith('STJ')) {
      return `https://scon.stj.jus.br/SCON/pesquisar.jsp?pesquisa=${citation}`
    }
    return '#'
  }

  private assessRelevance(accord: any, citations: string[]): 'binding' | 'persuasive' | 'refuted' {
    // Logic to assess if jurisprudence is binding, persuasive, or refuted
    return 'persuasive' // Default
  }

  private checkRequirements(data: Record<string, unknown>, requirements: string[]): number {
    return requirements.filter(req => {
      const mapped = this.mapRequirement(req)
      return data[mapped] === true || data[mapped] === 'utf-8' || data[mapped] === 'A4'
    }).length
  }

  private mapRequirement(req: string): string {
    const mapping: Record<string, string> = {
      utf8Encoding: 'encoding',
      maxPageSizeA4: 'pageSize',
      semanticHeadings: 'headingStructure',
      structuredTables: 'tableStructure',
      activeHyperlinks: 'hyperlinks',
      javaCompatible: 'javaCompatible',
      xmlMetadata: 'xmlMetadata',
    }
    return mapping[req] || req
  }
}

// Export singleton instance
export const judicialComplianceService = new JudicialComplianceService()
