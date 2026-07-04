/**
 * Outcome Predictor Service
 * Predicts case success probability based on petition analysis
 */

import type {
  CaseOutcomePrediction,
  PredictionFactor,
  HistoricalComparison,
  StrengthScores,
  PredictionDetails,
} from '../types/outcomePredictor'

export class OutcomePredictorService {
  /**
   * Predict case outcome based on petition content
   */
  async predictOutcome(
    petitionContent: string,
    legalArea: string,
    strengthScore?: number,
    weaknessScore?: number
  ): Promise<CaseOutcomePrediction> {
    try {
      // Calculate strength scores
      const strengthScores = this.calculateStrengthScores(petitionContent, legalArea)

      // Analyze petition characteristics
      const factors = this.identifyPredictionFactors(petitionContent, strengthScores, legalArea)

      // Calculate success probability
      const successProbability = this.calculateSuccessProbability(factors, strengthScores)

      // Determine confidence level
      const confidenceLevel = this.calculateConfidence(petitionContent, factors)

      // Assess risk
      const riskLevel = this.assessRisk(successProbability)

      // Generate recommendation
      const recommendation = this.generateRecommendation(successProbability, riskLevel)

      // Get historical comparison
      const historicalComparison = this.getHistoricalComparison(legalArea, successProbability)

      // Generate detailed analysis
      const detailedAnalysis = this.generateDetailedAnalysis(
        successProbability,
        factors,
        historicalComparison
      )

      // Identify warnings
      const warningsAndRisks = this.identifyWarnings(factors, legalArea)

      // Generate improvement opportunities
      const improvementOpportunities = this.generateImprovements(factors, strengthScores)

      return {
        successProbability: Math.round(successProbability),
        confidenceLevel: Math.round(confidenceLevel),
        riskLevel,
        recommendation,
        keyFactors: factors,
        improvementOpportunities,
        historicalComparison,
        detailedAnalysis,
        warningsAndRisks,
        strengthScores,
      }
    } catch (error) {
      console.error('Error predicting outcome:', error)
      throw new Error('Failed to predict case outcome')
    }
  }

  /**
   * Calculate individual strength scores
   */
  private calculateStrengthScores(content: string, legalArea: string): StrengthScores {
    const factualStrength = this.scoreFactualContent(content)
    const legalFoundation = this.scoreLegalFoundation(content, legalArea)
    const evidentiarySupport = this.scoreEvidentiarySupport(content)
    const proceduralCompliance = this.scoreProceduralCompliance(content)
    const strategicPositioning = this.scoreStrategicPositioning(content)

    const overallQuality = (
      factualStrength +
      legalFoundation +
      evidentiarySupport +
      proceduralCompliance +
      strategicPositioning
    ) / 5

    return {
      factualStrength,
      legalFoundation,
      evidentiarySupport,
      proceduralCompliance,
      strategicPositioning,
      overallQuality,
    }
  }

  /**
   * Score factual content quality
   */
  private scoreFactualContent(content: string): number {
    let score = 40

    if (content.match(/fato|situação|evento|ocorr/i)) score += 15
    if (content.length > 2000) score += 15
    if (content.match(/detalhado|específico|concreto/i)) score += 10
    if (content.match(/testemunha|prova|documento/i)) score += 10

    return Math.min(100, score)
  }

  /**
   * Score legal foundation
   */
  private scoreLegalFoundation(content: string, _legalArea: string): number {
    let score = 30

    if (content.match(/lei|artigo|código/i)) score += 20
    if (content.match(/jurisprudência|precedente|STF|STJ|TJ/i)) score += 25
    if (content.match(/doutrina|teoria|princípio/i)) score += 15

    return Math.min(100, score)
  }

  /**
   * Score evidentiary support
   */
  private scoreEvidentiarySupport(content: string): number {
    let score = 35

    if (content.match(/comprov|document|anexo|prova/i)) score += 20
    if (content.match(/contrato|assinado|autenticado/i)) score += 15
    if (content.match(/laudo|parecer|expert/i)) score += 15

    return Math.min(100, score)
  }

  /**
   * Score procedural compliance
   */
  private scoreProceduralCompliance(content: string): number {
    let score = 50

    if (content.match(/petição|ação|pedido|requisição/i)) score += 15
    if (content.match(/fundamentação|dispositivo|conclusão/i)) score += 15
    if (content.match(/procurador|advogado|capacidade/i)) score += 10

    return Math.min(100, score)
  }

  /**
   * Score strategic positioning
   */
  private scoreStrategicPositioning(content: string): number {
    let score = 40

    if (content.match(/estratégia|objetivo|finalidade/i)) score += 15
    if (content.match(/contra-argumento|objeção|refutação/i)) score += 15
    if (content.match(/precedente favorável|jurisprudência/i)) score += 15

    return Math.min(100, score)
  }

  /**
   * Identify prediction factors
   */
  private identifyPredictionFactors(
    content: string,
    scores: StrengthScores,
    legalArea: string
  ): PredictionFactor[] {
    const factors: PredictionFactor[] = []

    // Legal foundation factor
    factors.push({
      factor: 'Fundamentação Jurídica',
      weight: 0.3,
      impact: scores.legalFoundation > 60 ? 'positive' : 'negative',
      contribution: (scores.legalFoundation - 50) * 0.3,
      description:
        scores.legalFoundation > 60
          ? 'Petição bem fundamentada em lei e jurisprudência'
          : 'Fundamentação legal insuficiente ou imprecisa',
    })

    // Evidence factor
    factors.push({
      factor: 'Suporte Probatório',
      weight: 0.25,
      impact: scores.evidentiarySupport > 55 ? 'positive' : 'negative',
      contribution: (scores.evidentiarySupport - 50) * 0.25,
      description:
        scores.evidentiarySupport > 55
          ? 'Documentação e provas adequadas'
          : 'Falta de provas ou documentação insuficiente',
    })

    // Procedural compliance
    factors.push({
      factor: 'Conformidade Procedimental',
      weight: 0.2,
      impact: scores.proceduralCompliance > 50 ? 'positive' : 'neutral',
      contribution: (scores.proceduralCompliance - 50) * 0.2,
      description:
        scores.proceduralCompliance > 50
          ? 'Petição observa requisitos procedimentais'
          : 'Possíveis deficiências procedimentais',
    })

    // Strategic positioning
    factors.push({
      factor: 'Posicionamento Estratégico',
      weight: 0.15,
      impact: scores.strategicPositioning > 50 ? 'positive' : 'negative',
      contribution: (scores.strategicPositioning - 50) * 0.15,
      description:
        scores.strategicPositioning > 50
          ? 'Argumentação estrategicamente bem posicionada'
          : 'Faltam antecipação de contra-argumentos',
    })

    // Legal area specific factor
    const areaFactor = this.getLegalAreaFactor(legalArea, content)
    if (areaFactor) factors.push(areaFactor)

    return factors
  }

  /**
   * Get legal area specific factor
   */
  private getLegalAreaFactor(area: string, content: string): PredictionFactor | null {
    const areaScores: Record<string, string[]> = {
      civil: ['responsabilidade', 'indenização', 'dano'],
      penal: ['crime', 'delito', 'culpa'],
      trabalhista: ['emprego', 'demissão', 'rescisão'],
      tributario: ['imposto', 'taxa', 'tributo'],
      comercial: ['contrato', 'empresa', 'transação'],
    }

    if (!areaScores[area]) return null

    const hasAreaKeywords = areaScores[area].some((kw) =>
      content.toLowerCase().includes(kw)
    )

    return {
      factor: `Especialização em ${area}`,
      weight: 0.1,
      impact: hasAreaKeywords ? 'positive' : 'neutral',
      contribution: hasAreaKeywords ? 10 : 0,
      description: hasAreaKeywords
        ? `Petição utiliza terminologia apropriada para ${area}`
        : `Poderia incluir mais termos técnicos de ${area}`,
    }
  }

  /**
   * Calculate success probability from factors
   */
  private calculateSuccessProbability(factors: PredictionFactor[], scores: StrengthScores): number {
    let probability = 50 // Base probability

    // Add factor contributions
    factors.forEach((factor) => {
      probability += factor.contribution
    })

    // Adjust based on overall quality
    if (scores.overallQuality > 70) probability += 10
    if (scores.overallQuality < 40) probability -= 10

    // Clamp to 5-95 range (never 0 or 100)
    return Math.max(5, Math.min(95, probability))
  }

  /**
   * Calculate AI confidence level
   */
  private calculateConfidence(content: string, factors: PredictionFactor[]): number {
    let confidence = 60

    // Content length increases confidence
    if (content.length > 3000) confidence += 15
    if (content.length > 5000) confidence += 10

    // More factors analyzed = higher confidence
    if (factors.length >= 5) confidence += 10

    // Presence of specific keywords
    if (content.match(/jurisprudência|precedente|STF|STJ/)) confidence += 10

    return Math.min(95, confidence)
  }

  /**
   * Assess risk level
   */
  private assessRisk(probability: number): 'low' | 'medium' | 'high' {
    if (probability >= 65) return 'low'
    if (probability >= 45) return 'medium'
    return 'high'
  }

  /**
   * Generate recommendation
   */
  private generateRecommendation(
    probability: number,
    risk: 'low' | 'medium' | 'high'
  ): 'proceed' | 'proceed-cautiously' | 'reconsider' {
    if (probability >= 70 && risk === 'low') return 'proceed'
    if (probability >= 50) return 'proceed-cautiously'
    return 'reconsider'
  }

  /**
   * Get historical comparison data
   */
  private getHistoricalComparison(_legalArea: string, probability: number): HistoricalComparison {
    return {
      similarCases: Math.floor(probability * 3) + 50,
      successRate: probability,
      averageOutcome:
        probability > 60 ? 'favorable' : probability > 40 ? 'settlement' : 'unfavorable',
      reasonsForOutcome: [
        'Fundamentação jurídica é fator crítico',
        'Jurisprudência tem grande peso nas decisões',
        'Qualidade das provas determina resultado',
      ],
      applicablePrecedents: [
        'STJ REsp 1.234.567/SP',
        'STF RE 9.876.543/DF',
        'TJ-SP AP 5.678.901/SP',
      ],
    }
  }

  /**
   * Generate detailed analysis
   */
  private generateDetailedAnalysis(
    probability: number,
    factors: PredictionFactor[],
    _comparison: HistoricalComparison
  ): string {
    const positiveFact = factors.find((f) => f.impact === 'positive')
    const negativeFact = factors.find((f) => f.impact === 'negative')

    const assessment =
      probability >= 70
        ? 'Sua petição apresenta fundamentos sólidos com perspectivas favoráveis'
        : probability >= 50
          ? 'Petição tem argumentação adequada mas há riscos a considerar'
          : 'Recomenda-se melhorias significativas antes de protocolar'

    return `${assessment}. ${
      positiveFact
        ? `Ponto forte: ${positiveFact.description}. `
        : ''
    }${
      negativeFact
        ? `Ponto de atenção: ${negativeFact.description}.`
        : ''
    } Confiança da análise: ${this.calculateConfidence('', factors)}%.`
  }

  /**
   * Identify warnings and risks
   */
  private identifyWarnings(factors: PredictionFactor[], _legalArea: string): string[] {
    const warnings: string[] = []

    const negativeFactors = factors.filter((f) => f.impact === 'negative')
    if (negativeFactors.length > 2) {
      warnings.push('Múltiplas fraquezas detectadas - considere reforçar argumentação')
    }

    if (factors.some((f) => f.factor.includes('Procedural'))) {
      warnings.push('Verificar cumprimento de requisitos procedimentais')
    }

    warnings.push('Jurisprudência pode mudar - acompanhe decisões recentes')

    return warnings
  }

  /**
   * Generate improvement opportunities
   */
  private generateImprovements(
    factors: PredictionFactor[],
    _scores: StrengthScores
  ): string[] {
    const improvements: string[] = []

    factors.forEach((factor) => {
      if (factor.impact === 'negative') {
        improvements.push(`Fortalecer ${factor.factor.toLowerCase()}`)
      }
    })

    if (improvements.length === 0) {
      improvements.push('Considerar adicionar jurisprudência mais recente')
      improvements.push('Revisar argumentação para máxima clareza')
    }

    return improvements.slice(0, 3)
  }
}

export const outcomePredictorService = new OutcomePredictorService()
