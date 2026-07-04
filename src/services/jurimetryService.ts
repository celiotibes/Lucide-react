/**
 * Serviço de Jurimetria
 * Cálculos de: TCP (Taxa de Cobertura Probatória), Distribuição de Força, Análise de Gaps
 */

import type {
  FactProof,
  FactStrengthDistribution,
  JurimetricAnalysis,
  VisualProofMatrix,
  ArgumentProofCorrelation,
} from '@/types/jurimetry'

export class JurimetryService {
  /**
   * Calcula Taxa de Cobertura Probatória (TCP)
   * Proporção de fatos com prova substancial / total de fatos
   */
  static calculateTCP(facts: FactProof[]): number {
    if (facts.length === 0) return 0

    const substancialCount = facts.filter((f) => f.proofWeight === 'substancial').length
    return (substancialCount / facts.length) * 100
  }

  /**
   * Calcula média ponderada de grau de certeza
   */
  static calculateAverageCertainty(facts: FactProof[]): number {
    if (facts.length === 0) return 0

    const totalCertainty = facts.reduce((sum, f) => sum + f.certaintyDegree, 0)
    return totalCertainty / facts.length
  }

  /**
   * Analisa distribuição de força entre fatos
   */
  static analyzeStrengthDistribution(facts: FactProof[]): FactStrengthDistribution {
    const distribution: FactStrengthDistribution = {
      high: 0,
      moderate: 0,
      fragile: 0,
    }

    facts.forEach((fact) => {
      if (fact.certaintyDegree >= 80) {
        distribution.high += 1
      } else if (fact.certaintyDegree >= 50) {
        distribution.moderate += 1
      } else {
        distribution.fragile += 1
      }
    })

    return distribution
  }

  /**
   * Identifica lacunas críticas de prova
   */
  static identifyRiskGaps(facts: FactProof[]): string[] {
    const gaps: string[] = []

    facts.forEach((fact) => {
      if (fact.proofWeight === 'fragile') {
        gaps.push(
          `Fact "${fact.allegation.substring(0, 50)}..." is fragile (certainty: ${fact.certaintyDegree}%)`
        )
      }

      if (fact.proofType === 'testimonial' && fact.sources.length === 1) {
        gaps.push(
          `Fact "${fact.allegation.substring(0, 50)}..." relies on single witness (vulnerable to cross-examination)`
        )
      }
    })

    return gaps
  }

  /**
   * Calcula score jurimetria geral (0-100)
   * Fórmula: TCP (40%) + Certainty (40%) - Gap Penalty (20%)
   */
  static calculateJurimetricScore(facts: FactProof[]): number {
    const tcp = this.calculateTCP(facts)
    const certainty = this.calculateAverageCertainty(facts)
    const gaps = this.identifyRiskGaps(facts)
    const gapPenalty = gaps.length * 5 // 5 pontos por gap

    const score = tcp * 0.4 + certainty * 0.4 - gapPenalty
    return Math.max(0, Math.min(100, score))
  }

  /**
   * Gera matriz visual Argumento vs Prova para exibição
   */
  static generateVisualMatrix(facts: FactProof[]): VisualProofMatrix[] {
    return facts.map((fact, idx) => ({
      rowNumber: idx + 1,
      argument: fact.allegation.substring(0, 80),
      proofType: fact.proofType.charAt(0).toUpperCase() + fact.proofType.slice(1),
      certainty: `${fact.certaintyDegree}%`,
      supportingDocs: fact.sources.join(', '),
      strengthBar: this._createStrengthBar(fact.certaintyDegree),
    }))
  }

  /**
   * Cria barra visual de força (para HTML/CSS)
   */
  private static _createStrengthBar(certainty: number): string {
    const filled = Math.floor(certainty / 10)
    const empty = 10 - filled
    return `${'█'.repeat(filled)}${'░'.repeat(empty)} ${certainty}%`
  }

  /**
   * Análise completa de jurimetria
   */
  static analyzeJurimetry(facts: FactProof[]): JurimetricAnalysis {
    return {
      tcp: this.calculateTCP(facts),
      averageCertaintyDegree: this.calculateAverageCertainty(facts),
      factStrengthDistribution: this.analyzeStrengthDistribution(facts),
      argumentVsProofMatrix: this._buildArgumentMatrix(facts),
      riskGaps: this.identifyRiskGaps(facts),
      jurimetricScore: this.calculateJurimetricScore(facts),
      visualMatrix: this.generateVisualMatrix(facts),
    }
  }

  /**
   * Constrói matriz de correlação Argumento vs Prova
   */
  private static _buildArgumentMatrix(facts: FactProof[]): ArgumentProofCorrelation[] {
    return facts.map((fact) => ({
      argument: fact.allegation,
      supportingProofs: fact.sources,
      weaknessesInDefense: this._identifyWeaknesses(fact),
      counterargumentRisk: this._calculateCounterargumentRisk(fact),
      shieldingStrength: this._calculateShieldingStrength(fact),
    }))
  }

  /**
   * Identifica fraquezas na defesa do argumento
   */
  private static _identifyWeaknesses(fact: FactProof): string[] {
    const weaknesses: string[] = []

    if (fact.certaintyDegree < 50) {
      weaknesses.push('Low certainty degree - vulnerable to contestation')
    }

    if (fact.proofType === 'testimonial') {
      weaknesses.push('Testimonial proof - subject to credibility challenges')
    }

    if (fact.sources.length === 1) {
      weaknesses.push('Single source - lack of corroboration')
    }

    if (fact.proofWeight === 'fragile') {
      weaknesses.push('Fragile proof structure - needs reinforcement')
    }

    return weaknesses
  }

  /**
   * Calcula risco de contra-argumentação (0-100)
   */
  private static _calculateCounterargumentRisk(fact: FactProof): number {
    let risk = 100 - fact.certaintyDegree // Base: inverse of certainty

    if (fact.proofType === 'testimonial') {
      risk += 15 // Testimonial is easier to challenge
    }

    if (fact.sources.length === 1) {
      risk += 20 // Single source increases risk
    }

    if (fact.proofWeight === 'fragile') {
      risk += 25 // Fragile proof has high contestation risk
    }

    return Math.min(100, risk)
  }

  /**
   * Calcula força de escudo de Hermenêutica Blindada (0-100)
   * Baseia-se na robustez das provas contra contra-argumentação
   */
  private static _calculateShieldingStrength(fact: FactProof): number {
    let shielding = fact.certaintyDegree // Base: certainty degree

    if (fact.proofType === 'documentary') {
      shielding += 15 // Documentary proof is harder to challenge
    }

    if (fact.sources.length > 1) {
      shielding += 10 // Multiple sources strengthen shielding
    }

    if (fact.proofWeight === 'substancial') {
      shielding += 20 // Substantial proof has strong defense
    }

    // Expert proof adds credibility
    if (fact.proofType === 'expert') {
      shielding += 15
    }

    return Math.min(100, shielding)
  }

  /**
   * Gera HTML table com matriz jurimetria para petição
   */
  static generateHtmlMatrix(analysis: JurimetricAnalysis): string {
    let html = `
    <section class="jurimetry-analysis" style="margin: 20px 0; padding: 15px; border-left: 4px solid #1A3A52;">
      <h2 style="color: #1A3A52; margin-top: 0;">Análise de Força Probatória (Jurimetria)</h2>

      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 20px;">
        <div style="background: #f0f0f0; padding: 12px; border-radius: 4px;">
          <strong>TCP (Taxa Cobertura)</strong><br>
          <span style="font-size: 1.8em; color: #2E7D32;">${analysis.tcp.toFixed(1)}%</span>
        </div>
        <div style="background: #f0f0f0; padding: 12px; border-radius: 4px;">
          <strong>Certeza Média</strong><br>
          <span style="font-size: 1.8em; color: #1A3A52;">${analysis.averageCertaintyDegree.toFixed(1)}%</span>
        </div>
        <div style="background: #f0f0f0; padding: 12px; border-radius: 4px;">
          <strong>Score Jurimetria</strong><br>
          <span style="font-size: 1.8em; color: #C41E3A;">${analysis.jurimetricScore.toFixed(1)}/100</span>
        </div>
      </div>

      <h3>Distribuição de Força dos Fatos</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr style="background: #1A3A52; color: white;">
          <th style="padding: 10px; text-align: left;">Categoria</th>
          <th style="padding: 10px; text-align: center;">Quantidade</th>
          <th style="padding: 10px; text-align: left;">Descrição</th>
        </tr>
        <tr style="background: #e8f5e9;">
          <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Alta</strong> (80-100%)</td>
          <td style="padding: 10px; text-align: center; border-bottom: 1px solid #ddd;">${analysis.factStrengthDistribution.high}</td>
          <td style="padding: 10px; border-bottom: 1px solid #ddd;">Fatos com prova sólida</td>
        </tr>
        <tr style="background: #fff3e0;">
          <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Moderada</strong> (50-80%)</td>
          <td style="padding: 10px; text-align: center; border-bottom: 1px solid #ddd;">${analysis.factStrengthDistribution.moderate}</td>
          <td style="padding: 10px; border-bottom: 1px solid #ddd;">Fatos com prova razoável</td>
        </tr>
        <tr style="background: #ffebee;">
          <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Frágil</strong> (&lt;50%)</td>
          <td style="padding: 10px; text-align: center; border-bottom: 1px solid #ddd;">${analysis.factStrengthDistribution.fragile}</td>
          <td style="padding: 10px; border-bottom: 1px solid #ddd;">Fatos que precisam reforço</td>
        </tr>
      </table>

      <h3>Matriz de Força Probatória Detalhada</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="background: #1A3A52; color: white;">
          <th style="padding: 10px; text-align: left;">Fato Alegado</th>
          <th style="padding: 10px; text-align: center;">Tipo de Prova</th>
          <th style="padding: 10px; text-align: center;">Certeza</th>
          <th style="padding: 10px; text-align: center;">Força Visual</th>
          <th style="padding: 10px; text-align: left;">Documentos</th>
        </tr>
        ${analysis.visualMatrix
          .map(
            (row) => `
        <tr style="border-bottom: 1px solid #ddd;">
          <td style="padding: 10px;">${row.argument}</td>
          <td style="padding: 10px; text-align: center;">${row.proofType}</td>
          <td style="padding: 10px; text-align: center;"><strong>${row.certainty}</strong></td>
          <td style="padding: 10px; text-align: center; font-family: monospace; font-size: 0.9em;">${row.strengthBar}</td>
          <td style="padding: 10px; font-size: 0.9em;">${row.supportingDocs}</td>
        </tr>
        `
          )
          .join('')}
      </table>

      ${
        analysis.riskGaps.length > 0
          ? `
      <h3 style="color: #C41E3A; margin-top: 20px;">⚠️ Lacunas Críticas Identificadas</h3>
      <ul style="background: #ffebee; padding: 15px; border-radius: 4px; border-left: 4px solid #C41E3A;">
        ${analysis.riskGaps.map((gap) => `<li style="margin-bottom: 8px;">${gap}</li>`).join('')}
      </ul>
      `
          : `
      <p style="background: #e8f5e9; padding: 12px; border-radius: 4px; border-left: 4px solid #2E7D32;">
        ✓ Nenhuma lacuna crítica identificada - petição com cobertura probatória sólida.
      </p>
      `
      }
    </section>
    `
    return html
  }
}
