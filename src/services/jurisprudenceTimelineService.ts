/**
 * Jurisprudence Timeline Service
 * Generates and analyzes temporal evolution of case law on specific legal issues
 */

import type {
  TimelineEvent,
  TimelineCluster,
  TimelineAnalysis,
  TimelineFilter,
  TimelineStats,
} from '../types/jurisprudenceTimeline'

export class JurisprudenceTimelineService {
  /**
   * Generate timeline for a specific legal issue
   * In production, this would integrate with Legal Data Hunter API
   */
  async generateTimeline(
    legalIssue: string,
    startYear: number,
    endYear: number,
    filter?: TimelineFilter
  ): Promise<TimelineAnalysis> {
    try {
      // Fetch events from Legal Data Hunter or use mock data
      const events = await this.fetchTimelineEvents(legalIssue, startYear, endYear, filter)

      // Cluster events by year
      const clusters = this.clusterEventsByYear(events)

      // Identify trends
      const trends = this.analyzeTrends(clusters)

      // Find turning points
      const turningPoints = this.identifyTurningPoints(events)

      // Calculate statistics
      const stats = this.calculateStats(events)

      return {
        legalIssue,
        startYear,
        endYear,
        totalEvents: events.length,
        clusters: clusters.map((cluster, idx) => ({
          ...cluster,
          trend: trends[idx]?.type || 'stable',
          trendDescription: trends[idx]?.description || 'No significant changes',
        })),
        majorTurningPoints: turningPoints,
        currentTrend: this.determineTrend(stats),
        summary: this.generateSummary(legalIssue, events, stats),
        recommendations: this.generateRecommendations(legalIssue, stats, turningPoints),
      }
    } catch (error) {
      console.error('Error generating timeline:', error)
      throw new Error(`Failed to generate timeline for "${legalIssue}"`)
    }
  }

  /**
   * Fetch timeline events from API (mocked for now)
   */
  private async fetchTimelineEvents(
    legalIssue: string,
    startYear: number,
    endYear: number,
    filter?: TimelineFilter
  ): Promise<TimelineEvent[]> {
    // Mock implementation - in production would call Legal Data Hunter API
    const mockEvents: TimelineEvent[] = [
      {
        id: 'case-001',
        date: new Date(2015, 5, 15),
        year: 2015,
        title: 'STJ estabelece precedente sobre responsabilidade civil',
        description:
          'Tribunal Superior de Justiça estabelece jurisprudência sobre responsabilidade civil em contratos',
        tribunal: 'STJ',
        caseNumber: 'REsp 1.234.567/SP',
        decision: 'favorable',
        legalArea: 'Civil',
        keywords: ['responsabilidade', 'civil', 'contrato'],
        citations: ['LEI 10.406/2002', 'STJ REsp 1.000.000/SP'],
        importance: 'high',
        impact: 'Define padrão para responsabilidade em contratos similares',
      },
      {
        id: 'case-002',
        date: new Date(2017, 9, 20),
        year: 2017,
        title: 'TJ-SP rejeita aplicação ampla de precedente',
        description: 'Tribunal de Justiça de São Paulo restringe aplicação do precedente anterior',
        tribunal: 'TJ-SP',
        caseNumber: 'AP 9.876.543/SP',
        decision: 'unfavorable',
        legalArea: 'Civil',
        keywords: ['responsabilidade', 'restrição'],
        citations: ['REsp 1.234.567/SP'],
        importance: 'medium',
        impact: 'Mostra divergência jurisprudencial nas instâncias inferiores',
      },
      {
        id: 'case-003',
        date: new Date(2019, 2, 10),
        year: 2019,
        title: 'STF reconhece efeito erga omnes da jurisprudência',
        description: 'Supremo Tribunal Federal estende aplicação para todos os casos similares',
        tribunal: 'STF',
        caseNumber: 'RE 1.234.567/SP',
        decision: 'favorable',
        legalArea: 'Civil',
        keywords: ['precedente', 'vinculante'],
        citations: ['STJ REsp 1.234.567/SP', 'CPC 2015'],
        importance: 'high',
        impact: 'Precedente se torna praticamente obrigatório para todos os tribunais',
      },
      {
        id: 'case-004',
        date: new Date(2021, 7, 5),
        year: 2021,
        title: 'Jurisprudência em evolução: novas interpretações',
        description: 'Cortes começam a interpretar precedente de forma mais favorável a certos casos',
        tribunal: 'TJ-SP',
        caseNumber: 'AP 1.234.567/SP',
        decision: 'favorable',
        legalArea: 'Civil',
        keywords: ['interpretação', 'evolução'],
        citations: ['STF RE 1.234.567/SP'],
        importance: 'medium',
        impact: 'Mostra flexibilização na aplicação do precedente',
      },
      {
        id: 'case-005',
        date: new Date(2023, 11, 12),
        year: 2023,
        title: 'STJ consolida orientação progressiva',
        description: 'Tribunal Superior de Justiça consolida tendência mais favorável dos últimos anos',
        tribunal: 'STJ',
        caseNumber: 'REsp 1.987.654/SP',
        decision: 'favorable',
        legalArea: 'Civil',
        keywords: ['consolidação', 'tendência'],
        citations: ['STF RE 1.234.567/SP', 'TJ-SP AP 1.234.567/SP'],
        importance: 'high',
        impact: 'Consolida três anos de orientação progressiva',
      },
    ]

    // Apply filters if provided
    return this.applyFilters(mockEvents, filter)
  }

  /**
   * Apply filters to timeline events
   */
  private applyFilters(events: TimelineEvent[], filter?: TimelineFilter): TimelineEvent[] {
    if (!filter) return events

    return events.filter((event) => {
      if (filter.legalArea && event.legalArea !== filter.legalArea) return false
      if (filter.tribunal && event.tribunal !== filter.tribunal) return false
      if (filter.decisionType && event.decision !== filter.decisionType) return false
      if (filter.importance && event.importance !== filter.importance) return false
      if (
        filter.dateRange &&
        (event.year < filter.dateRange.startYear || event.year > filter.dateRange.endYear)
      ) {
        return false
      }
      return true
    })
  }

  /**
   * Cluster events by year
   */
  private clusterEventsByYear(events: TimelineEvent[]): TimelineCluster[] {
    const grouped = new Map<number, TimelineEvent[]>()

    events.forEach((event) => {
      if (!grouped.has(event.year)) {
        grouped.set(event.year, [])
      }
      grouped.get(event.year)!.push(event)
    })

    return Array.from(grouped.entries())
      .sort(([yearA], [yearB]) => yearA - yearB)
      .map(([year, yearEvents]) => ({
        year,
        events: yearEvents,
        trend: 'stable',
        trendDescription: '',
      }))
  }

  /**
   * Analyze trends in jurisprudence
   */
  private analyzeTrends(
    clusters: TimelineCluster[]
  ): Array<{ type: 'strengthening' | 'weakening' | 'stable' | 'shifting'; description: string }> {
    return clusters.map((cluster, idx) => {
      const favorableCount = cluster.events.filter((e) => e.decision === 'favorable').length
      const unfavorableCount = cluster.events.filter((e) => e.decision === 'unfavorable').length

      if (idx === 0) {
        return {
          type: favorableCount > unfavorableCount ? 'strengthening' : 'weakening',
          description: `Ano ${cluster.year} inicia com ${favorableCount} decisões favoráveis e ${unfavorableCount} desfavoráveis`,
        }
      }

      const prevCluster = clusters[idx - 1]
      const prevFavorable = prevCluster.events.filter((e) => e.decision === 'favorable').length

      let type: 'strengthening' | 'weakening' | 'stable' | 'shifting'
      if (favorableCount > prevFavorable) type = 'strengthening'
      else if (favorableCount < prevFavorable) type = 'weakening'
      else type = 'stable'

      return {
        type,
        description: `${cluster.year}: ${favorableCount > prevFavorable ? 'Melhoria' : favorableCount < prevFavorable ? 'Piora' : 'Estabilidade'} na jurisprudência`,
      }
    })
  }

  /**
   * Identify major turning points
   */
  private identifyTurningPoints(events: TimelineEvent[]): TimelineEvent[] {
    return events.filter(
      (event) =>
        event.importance === 'high' && (event.tribunal === 'STF' || event.tribunal === 'STJ')
    )
  }

  /**
   * Calculate statistics
   */
  private calculateStats(events: TimelineEvent[]): TimelineStats {
    const favorable = events.filter((e) => e.decision === 'favorable').length
    const unfavorable = events.filter((e) => e.decision === 'unfavorable').length
    const mixed = events.filter((e) => e.decision === 'mixed').length

    return {
      totalCases: events.length,
      favorableCases: favorable,
      unfavorableCases: unfavorable,
      mixedCases: mixed,
      favorablePercentage: events.length > 0 ? (favorable / events.length) * 100 : 0,
      criticalTurningPoints: events.filter((e) => e.importance === 'high').length,
      trendsIdentified: this.extractTrends(events),
    }
  }

  /**
   * Extract identified trends from events
   */
  private extractTrends(events: TimelineEvent[]): string[] {
    const trends = new Set<string>()

    events.forEach((event) => {
      if (event.importance === 'high') {
        if (event.decision === 'favorable') {
          trends.add('Jurisprudência favorável consolidada')
        } else if (event.decision === 'unfavorable') {
          trends.add('Jurisprudência com restrições importantes')
        }
      }
    })

    return Array.from(trends)
  }

  /**
   * Determine current trend
   */
  private determineTrend(stats: TimelineStats): 'favorable' | 'unfavorable' | 'mixed' | 'evolving' {
    if (stats.favorablePercentage >= 70) return 'favorable'
    if (stats.favorablePercentage <= 30) return 'unfavorable'
    if (stats.favorablePercentage >= 40 && stats.favorablePercentage <= 60) return 'evolving'
    return 'mixed'
  }

  /**
   * Generate summary text
   */
  private generateSummary(
    legalIssue: string,
    events: TimelineEvent[],
    stats: TimelineStats
  ): string {
    const trend = this.determineTrend(stats)
    const trendText =
      trend === 'favorable'
        ? 'favorável'
        : trend === 'unfavorable'
          ? 'desfavorável'
          : 'em evolução'

    return `A jurisprudência sobre "${legalIssue}" apresenta uma tendência ${trendText} com ${stats.totalCases} casos analisados. ${stats.favorablePercentage.toFixed(0)}% dos casos foram decididos favoravelmente. ${stats.criticalTurningPoints} pontos de virada críticos foram identificados, indicando mudanças significativas na interpretação da lei.`
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    _legalIssue: string,
    stats: TimelineStats,
    turningPoints: TimelineEvent[]
  ): string[] {
    const recommendations: string[] = []

    if (stats.favorablePercentage >= 70) {
      recommendations.push('Jurisprudência favorável consolidada - utilize os precedentes com confiança')
      recommendations.push('Cite os casos mais recentes do STF/STJ como base argumentativa')
    } else if (stats.favorablePercentage <= 30) {
      recommendations.push('Jurisprudência predominantemente desfavorável - considere argumentação inovadora')
      recommendations.push('Estude os pontos de divergência entre as decisões para encontrar lacunas')
    }

    if (turningPoints.length > 0) {
      recommendations.push(
        `Pontos de virada identificados (${turningPoints.length}) - analise mudanças de posição dos tribunais`
      )
    }

    recommendations.push('Acompanhe evoluções futuras desta jurisprudência')

    return recommendations
  }
}

export const jurisprudenceTimelineService = new JurisprudenceTimelineService()
