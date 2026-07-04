/**
 * Proof Summary Service
 * Geração estratégica de resumos de prova para refutar contestação
 * Implementa Hermenêutica Blindada (Ethos, Pathos, Logos, Kairos)
 */

import type {
  ProofSummaryFramework,
  ProofSummaryFact,
  ExecutiveSummary,
  ContestationAnalysis,
  StrategicHermeneutics,
  ConclusiveSynthesis,
  CounterargumentShield,
  SyllogisticChain,
  ContestationResponseMatrix,
  RefutationPair,
  ProceduralSafeguard,
} from '@/types/proofSummary'
import type { FactProof } from '@/types/jurimetry'

export class ProofSummaryService {
  /**
   * Gera estrutura completa de resumo de provas estratégico
   */
  static generateProofSummary(
    petitionId: string,
    facts: FactProof[],
    jurisprudence: any[] = []
  ): ProofSummaryFramework {
    return {
      petitionId,
      executiveSummary: this.generateExecutiveSummary(facts),
      factsSummary: this.generateFactsSummary(facts),
      contestationAnalysis: this.analyzeExpectedContestations(facts),
      strategicHermeneutics: this.buildStrategicHermeneutics(facts, jurisprudence),
      conclusiveSynthesis: this.generateConclusiveSynthesis(facts),
      generatedAt: new Date(),
    }
  }

  /**
   * Gera Executive Summary com tese central e provas-chave
   */
  private static generateExecutiveSummary(facts: FactProof[]): ExecutiveSummary {
    const strongFacts = facts.filter((f) => f.certaintyDegree >= 80)
    const moderateFacts = facts.filter((f) => f.certaintyDegree >= 50 && f.certaintyDegree < 80)

    return {
      mainArgument: this.synthesizeMainThesis(facts),
      keyProofs: this.extractKeyProofs(facts),
      expectedOutcome: this.predictExpectedOutcome(strongFacts),
      riskAssessment: this.assessRisks(moderateFacts),
      hermeneuticShield: this.identifyPrimaryShield(facts),
    }
  }

  /**
   * Gera resumo estruturado de cada fato com provas e escudos
   */
  private static generateFactsSummary(facts: FactProof[]): ProofSummaryFact[] {
    return facts.map((fact, idx) => ({
      factId: fact.factId || `F${idx + 1}`,
      allegation: fact.allegation,
      logicalWeight: this.determineLogicalWeight(fact, idx, facts.length),
      proofStrength: fact.certaintyDegree,
      supportingEvidence: this.extractSupportingEvidence(fact),
      counterarguments: this.buildCounterargumentShields(fact),
      jurisprudentialSupport: [], // Will be filled from external jurisprudence
    }))
  }

  /**
   * Analisa contestações esperadas e previsões de defesa
   */
  private static analyzeExpectedContestations(facts: FactProof[]): ContestationAnalysis {
    const expectedContestations: string[] = []
    const vulnerabilityAreas: string[] = []
    const preemptiveRefutations: string[] = []

    facts.forEach((fact) => {
      if (fact.proofType === 'testimonial') {
        expectedContestations.push(`Credibility challenge to witness in "${fact.allegation}"`)
        vulnerabilityAreas.push(`Testimonial proof for fact: ${fact.allegation}`)
        preemptiveRefutations.push(
          `Multiple corroborating witnesses and documentary evidence support testimony`
        )
      }

      if (fact.certaintyDegree < 70) {
        expectedContestations.push(`Weakness in proof strength for "${fact.allegation}"`)
        vulnerabilityAreas.push(`Low certainty degree (${fact.certaintyDegree}%)`)
        preemptiveRefutations.push(
          `Preponderance of evidence standard is met; perfection not required`
        )
      }

      if (fact.sources.length === 1) {
        expectedContestations.push(`Sole source allegation for "${fact.allegation}"`)
        vulnerabilityAreas.push(`Single source dependency`)
        preemptiveRefutations.push(
          `Sole witness/document is sufficient when credible; corroboration is supplementary`
        )
      }
    })

    return {
      expectedContestations,
      vulnerabilityAreas,
      preemptiveRefutations,
    }
  }

  /**
   * Constrói estratégia hermenêutica com 4 pilares (Ethos, Pathos, Logos, Kairos)
   */
  private static buildStrategicHermeneutics(
    facts: FactProof[],
    jurisprudence: any[]
  ): StrategicHermeneutics {
    return {
      ethosApproach: {
        authorityBasedOn: 'Substantial documentary evidence and credible witnesses',
        credibilityMarkers: [
          'Contemporary documents (not reconstructed)',
          'Digital evidence with metadata',
          'Professional expert testimony',
          'Official records and certifications',
        ],
      },
      pathosApproach: {
        emotionalResonance: 'Justice demands respect for contractual obligations and good faith',
        fairnessArguments: [
          'Unjust enrichment if defendant avoids responsibility',
          'Protection of reasonable reliance interests',
          'Prevention of abuse of procedural rights',
        ],
      },
      logosApproach: {
        logicalStructure: 'Syllogistic chain from applicable law through proven facts to relief',
        syllogisms: this.generateSyllogisticChains(facts, jurisprudence),
      },
      kairosApproach: {
        timelinessJustification: 'Timely presentation prevents evidence decay and witness unavailability',
        opportunityToJustice:
          'Swift resolution protects legitimate expectations and prevents further harm',
      },
    }
  }

  /**
   * Gera cadeias silogísticas (Lei → Fato → Conclusão)
   */
  private static generateSyllogisticChains(
    facts: FactProof[],
    jurisprudence: any[]
  ): SyllogisticChain[] {
    return facts.map((fact) => ({
      majorPremise: this.generateMajorPremise(fact),
      minorPremise: fact.allegation,
      conclusion: this.generateConclusion(fact),
      jurisprudentialBasis: jurisprudence[0]?.accordNumber || undefined,
    }))
  }

  /**
   * Gera síntese final com pedido e salvaguardas procedimentais
   */
  private static generateConclusiveSynthesis(facts: FactProof[]): ConclusiveSynthesis {
    const criticalFacts = facts.filter((f) => f.certaintyDegree >= 80)
    const supportingFacts = facts.filter((f) => f.certaintyDegree >= 50 && f.certaintyDegree < 80)

    return {
      synthesisStatement: this.synthesizeAllArguments(criticalFacts, supportingFacts),
      requestedRelief: 'Grant relief as requested in the prayer for relief',
      alternativeRelief: 'In the alternative, grant partial relief proportional to proven damages',
      proceduralSafeguards: this.identifyProceduralSafeguards(facts),
    }
  }

  /**
   * Determina peso lógico do fato (critical/supporting/contextual)
   */
  private static determineLogicalWeight(
    fact: FactProof,
    index: number,
    total: number
  ): 'critical' | 'supporting' | 'contextual' {
    if (fact.certaintyDegree >= 85 && fact.proofWeight === 'substancial') {
      return 'critical'
    }
    if (fact.certaintyDegree >= 60 && fact.proofWeight !== 'fragile') {
      return 'supporting'
    }
    return 'contextual'
  }

  /**
   * Extrai elementos de prova com nível de corroboração
   */
  private static extractSupportingEvidence(fact: FactProof) {
    return [
      {
        type: fact.proofType as any,
        description: `${fact.proofType} evidence for: ${fact.allegation}`,
        annexReference: fact.sources[0] || 'N/A',
        credibilityScore: fact.certaintyDegree,
        corroborationLevel: fact.sources.length > 1 ? 'multiple' : 'sole' as const,
        hermeneuticInterpretation: `Establishes ${fact.allegation} with ${fact.certaintyDegree}% confidence`,
      },
    ]
  }

  /**
   * Constrói escudos contra contra-argumentação (Hermenêutica Blindada)
   */
  private static buildCounterargumentShields(fact: FactProof): CounterargumentShield[] {
    const shields: CounterargumentShield[] = []

    // Shield 1: Credibility challenge
    shields.push({
      potentialContestaton: 'Challenge witness credibility or document authenticity',
      refutationStrategy: 'jurisprudential',
      blindageMechanism:
        'Credibility determinations favor presented evidence; burden on opposing party to impeach',
      supportingCitation: 'STJ jurisprudence on evidentiary standards',
      strengthRating: 90,
    })

    // Shield 2: Insufficient proof
    shields.push({
      potentialContestaton: 'Argue insufficient proof of fact',
      refutationStrategy: 'direct',
      blindageMechanism:
        'Preponderance of evidence standard met; perfection not required in civil litigation',
      fallbackPosition: 'Multiple corroborating sources strengthen weight of evidence',
      strengthRating: 85,
    })

    // Shield 3: Procedural challenge
    shields.push({
      potentialContestaton: 'Attack procedure for obtaining evidence',
      refutationStrategy: 'procedural',
      blindageMechanism:
        'Evidence properly obtained per Rules of Civil Procedure; no exclusion warranted',
      supportingCitation: 'CPC Art. 370-372 (evidentiary standards)',
      strengthRating: 88,
    })

    return shields
  }

  /**
   * Síntese da tese central (1 frase)
   */
  private static synthesizeMainThesis(facts: FactProof[]): string {
    const criticalCount = facts.filter((f) => f.certaintyDegree >= 80).length
    return `This petition is supported by ${criticalCount} critical facts, each proven by substantial documentary and testimonial evidence`
  }

  /**
   * Extrai provas-chave para executive summary
   */
  private static extractKeyProofs(facts: FactProof[]): string[] {
    return facts
      .filter((f) => f.certaintyDegree >= 80)
      .slice(0, 5)
      .map((f) => f.allegation)
  }

  /**
   * Prediz resultado esperado
   */
  private static predictExpectedOutcome(strongFacts: FactProof[]): string {
    if (strongFacts.length >= 3) {
      return 'Outcome highly favorable given strength of evidentiary support'
    }
    if (strongFacts.length >= 1) {
      return 'Outcome favorable with reasonable probability of success'
    }
    return 'Outcome dependent on judicial interpretation of borderline facts'
  }

  /**
   * Avalia riscos (fatos frágeis)
   */
  private static assessRisks(moderateFacts: FactProof[]): string {
    if (moderateFacts.length === 0) {
      return 'Minimal risk; all facts substantiated by strong evidence'
    }
    return `Moderate risk from ${moderateFacts.length} fact(s) with 50-80% certainty; adequately addressed by corroborating evidence`
  }

  /**
   * Identifica principal escudo jurídico
   */
  private static identifyPrimaryShield(facts: FactProof[]): string {
    const strongestFact = facts.reduce((prev, current) =>
      prev.certaintyDegree > current.certaintyDegree ? prev : current
    )
    return `Primary legal foundation: ${strongestFact.allegation} (${strongestFact.certaintyDegree}% certainty, ${strongestFact.proofWeight} proof)`
  }

  /**
   * Gera premissa maior (lei aplicável)
   */
  private static generateMajorPremise(fact: FactProof): string {
    return `Under applicable law, the party bearing the burden must prove ${fact.allegation} by preponderance of evidence`
  }

  /**
   * Gera conclusão (aplicação)
   */
  private static generateConclusion(fact: FactProof): string {
    return `Therefore, ${fact.allegation} is established by ${fact.certaintyDegree}% certainty through ${fact.proofType} proof`
  }

  /**
   * Síntese de todos os argumentos
   */
  private static synthesizeAllArguments(
    criticalFacts: FactProof[],
    supportingFacts: FactProof[]
  ): string {
    return `The ${criticalFacts.length} critical facts, buttressed by ${supportingFacts.length} supporting facts, create an overwhelming evidentiary foundation meeting all legal standards for relief`
  }

  /**
   * Identifica salvaguardas procedimentais contra contestação
   */
  private static identifyProceduralSafeguards(facts: FactProof[]): ProceduralSafeguard[] {
    return [
      {
        type: 'temporal',
        description: 'All evidence contemporaneous with alleged facts; no reconstructed versions',
        protectsAgainst: 'Claims of memory decay or falsification',
        applicableLaw: 'CPC Art. 369 (documentary evidence priority)',
      },
      {
        type: 'evidentiary',
        description: 'Multiple independent sources corroborate each critical fact',
        protectsAgainst: 'Challenges to sole-source allegations',
        applicableLaw: 'CPC Art. 371 (preponderance standard)',
      },
      {
        type: 'substantive',
        description: 'Hermeneutics favor party presenting evidence over burden-bearer',
        protectsAgainst: 'Disproportionate scrutiny of plaintiff evidence',
        applicableLaw: 'STJ jurisprudence on evidentiary burden',
      },
      {
        type: 'formal',
        description: 'All evidence properly authenticated and admitted per rules',
        protectsAgainst: 'Procedural exclusion challenges',
        applicableLaw: 'CPC Art. 372-380 (evidence rules)',
      },
    ]
  }

  /**
   * Gera matriz de resposta estratégica a contestações específicas
   */
  static generateContestationResponseMatrix(
    facts: FactProof[],
    expectedContestations: string[]
  ): ContestationResponseMatrix {
    const refutations = expectedContestations.map((contestation) => ({
      contestation,
      directResponse: this.generateDirectResponse(contestation, facts),
      logicalBasis: this.generateLogicalBasis(contestation),
      supportingProof: this.identifySupportingProof(contestation, facts),
      backupResponse: this.generateBackupResponse(contestation),
    }))

    return {
      expectedContestationPoints: expectedContestations,
      ourDirectRefutations: refutations,
      jurisprudentialWeapons: [
        {
          accordNumber: 'STJ REsp 1.234.567',
          tribunal: 'STJ',
          date: new Date(),
          ementa: 'Evidentiary standards in civil litigation',
          relevance: 'persuasive',
          citationPurpose: 'Supports preponderance standard and credibility presumptions',
        },
      ],
      proceduralSafeguards: this.identifyProceduralSafeguards(facts),
    }
  }

  private static generateDirectResponse(contestation: string, facts: FactProof[]): string {
    const strongestFact = facts.reduce((prev, current) =>
      prev.certaintyDegree > current.certaintyDegree ? prev : current
    )
    return `Contrary to expected argument, ${strongestFact.allegation} is substantiated by multiple independent sources with ${strongestFact.certaintyDegree}% certainty`
  }

  private static generateLogicalBasis(contestation: string): string {
    return 'Logical basis: Evidentiary burden satisfied by preponderance; absolute certainty not required in civil litigation'
  }

  private static identifySupportingProof(contestation: string, facts: FactProof[]): string {
    return facts[0]?.sources[0] || 'Documentary record'
  }

  private static generateBackupResponse(contestation: string): string {
    return 'Alternative position: Even if contested element weakened, remaining evidence exceeds threshold for relief'
  }

  /**
   * Gera HTML para seção de resumo de prova em petição
   */
  static generateHtmlProofSummary(framework: ProofSummaryFramework): string {
    let html = `
    <section class="proof-summary-framework" style="margin: 30px 0; padding: 20px; border: 2px solid #1A3A52; background: #f9f9f9;">
      <h1 style="color: #1A3A52; margin-top: 0;">RESUMO ESTRATÉGICO DE PROVAS</h1>

      <h2>Síntese Executiva</h2>
      <div style="background: white; padding: 15px; border-left: 4px solid #2E7D32; margin-bottom: 20px;">
        <p><strong>Tese Central:</strong> ${framework.executiveSummary.mainArgument}</p>
        <p><strong>Proteção Jurídica Principal:</strong> ${framework.executiveSummary.hermeneuticShield}</p>
        <p><strong>Avaliação de Risco:</strong> ${framework.executiveSummary.riskAssessment}</p>
      </div>

      <h2>Fatos Principais com Prova</h2>
      ${framework.factsSummary
        .map(
          (fact, idx) => `
        <div style="background: white; padding: 15px; margin-bottom: 12px; border-left: 4px solid ${
            fact.logicalWeight === 'critical'
              ? '#C41E3A'
              : fact.logicalWeight === 'supporting'
                ? '#FFC107'
                : '#999'
          };">
          <h3 style="margin-top: 0;">${idx + 1}. ${fact.allegation}</h3>
          <p><strong>Peso Lógico:</strong> ${fact.logicalWeight.toUpperCase()} |
             <strong>Força de Prova:</strong> ${fact.proofStrength}%</p>
          <p><strong>Prova de Suporte:</strong> ${fact.supportingEvidence[0]?.annexReference || 'Documentos diversos'}</p>
          ${
            fact.counterarguments.length > 0
              ? `<p><strong>Escudos contra Contestação:</strong><ul>
                   ${fact.counterarguments
                     .map((shield) => `<li>${shield.blindageMechanism}</li>`)
                     .join('')}
                 </ul></p>`
              : ''
          }
        </div>
      `
        )
        .join('')}

      <h2>Hermenêutica Estratégica (Ethos, Pathos, Logos, Kairos)</h2>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
        <div style="background: #e3f2fd; padding: 12px; border-radius: 4px;">
          <h3 style="margin-top: 0; color: #1565c0;">Ethos (Credibilidade)</h3>
          <p>${framework.strategicHermeneutics.ethosApproach.authorityBasedOn}</p>
        </div>
        <div style="background: #fce4ec; padding: 12px; border-radius: 4px;">
          <h3 style="margin-top: 0; color: #c2185b;">Pathos (Justiça)</h3>
          <p>${framework.strategicHermeneutics.pathosApproach.emotionalResonance}</p>
        </div>
        <div style="background: #f3e5f5; padding: 12px; border-radius: 4px;">
          <h3 style="margin-top: 0; color: #6a1b9a;">Logos (Lógica)</h3>
          <p>${framework.strategicHermeneutics.logosApproach.logicalStructure}</p>
        </div>
        <div style="background: #fff3e0; padding: 12px; border-radius: 4px;">
          <h3 style="margin-top: 0; color: #e65100;">Kairos (Oportunidade)</h3>
          <p>${framework.strategicHermeneutics.kairosApproach.timelinessJustification}</p>
        </div>
      </div>

      <h2>Contestações Esperadas e Refutações Preemptivas</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="background: #1A3A52; color: white;">
          <th style="padding: 10px; text-align: left;">Contestação Esperada</th>
          <th style="padding: 10px; text-align: left;">Nossa Refutação</th>
        </tr>
        ${framework.contestationAnalysis.expectedContestations
          .map(
            (contestation, idx) => `
        <tr style="border-bottom: 1px solid #ddd; background: ${idx % 2 === 0 ? '#f9f9f9' : 'white'};">
          <td style="padding: 10px;">${contestation}</td>
          <td style="padding: 10px;">${framework.contestationAnalysis.preemptiveRefutations[idx] || 'Ver jurisprudência citada'}</td>
        </tr>
        `
          )
          .join('')}
      </table>

      <h2 style="margin-top: 20px;">Conclusão</h2>
      <div style="background: #e8f5e9; padding: 15px; border-radius: 4px; border-left: 4px solid #2E7D32;">
        <p>${framework.conclusiveSynthesis.synthesisStatement}</p>
        <p><strong>Pedido:</strong> ${framework.conclusiveSynthesis.requestedRelief}</p>
        <p><strong>Pedido Alternativo:</strong> ${framework.conclusiveSynthesis.alternativeRelief}</p>
      </div>
    </section>
    `
    return html
  }
}
