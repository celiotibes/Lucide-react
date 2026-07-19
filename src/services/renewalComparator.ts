/**
 * FASE 13: Renewal Comparator Service
 * Compara contrato original com renovação
 */

import { IPCACalculator } from './ipcaCalculator'

export interface ContractSnapshot {
  id: string
  version: 'original' | 'renewal' | 'addendum'
  date: string
  rent: number
  caution: number
  adminFee?: number
  insurance?: number
  indexType?: string
  indexRate?: number
  startDate: string
  endDate: string
}

export interface RenewalComparison {
  original: ContractSnapshot
  renewal: ContractSnapshot
  changes: {
    rentChange: { absolute: number; percentage: number }
    cautionChange: { absolute: number; percentage: number }
    adminFeeChange: { absolute: number; percentage: number }
    insuranceChange: { absolute: number; percentage: number }
  }
  analysis: {
    ipcaAdjustmentExpected: number
    actualAdjustment: number
    adjustmentVsIPCA: number
    adjustmentType: 'below-ipca' | 'at-ipca' | 'above-ipca'
    fairnessScore: number // 0-100, where 100 is perfectly fair
    warnings: string[]
    recommendations: string[]
  }
}

export class RenewalComparator {
  /**
   * Compara dois contratos
   */
  static compare(original: ContractSnapshot, renewal: ContractSnapshot): RenewalComparison {
    // Validações
    if (renewal.startDate < original.endDate) {
      throw new Error('Data de início da renovação deve ser após o fim do contrato original')
    }

    // Calcula mudanças
    const rentChange = {
      absolute: renewal.rent - original.rent,
      percentage: ((renewal.rent - original.rent) / original.rent) * 100,
    }

    const cautionChange = {
      absolute: renewal.caution - original.caution,
      percentage: ((renewal.caution - original.caution) / original.caution) * 100,
    }

    const adminFeeChange = {
      absolute: (renewal.adminFee || 0) - (original.adminFee || 0),
      percentage:
        original.adminFee && renewal.adminFee
          ? ((renewal.adminFee - original.adminFee) / original.adminFee) * 100
          : 0,
    }

    const insuranceChange = {
      absolute: (renewal.insurance || 0) - (original.insurance || 0),
      percentage:
        original.insurance && renewal.insurance
          ? ((renewal.insurance - original.insurance) / original.insurance) * 100
          : 0,
    }

    // Calcula IPCA esperado
    const ipcaAdjustmentExpected = IPCACalculator.getIPCAForPeriod(
      original.endDate,
      renewal.startDate
    )

    // Análise
    const actualAdjustment = rentChange.percentage
    const adjustmentVsIPCA = actualAdjustment - ipcaAdjustmentExpected

    let adjustmentType: 'below-ipca' | 'at-ipca' | 'above-ipca'
    if (Math.abs(adjustmentVsIPCA) < 0.5) {
      adjustmentType = 'at-ipca'
    } else if (adjustmentVsIPCA < 0) {
      adjustmentType = 'below-ipca'
    } else {
      adjustmentType = 'above-ipca'
    }

    const fairnessScore = this.calculateFairnessScore(
      ipcaAdjustmentExpected,
      actualAdjustment,
      cautionChange,
      adminFeeChange
    )

    const warnings = this.generateWarnings(
      original,
      renewal,
      rentChange,
      cautionChange,
      ipcaAdjustmentExpected,
      actualAdjustment
    )

    const recommendations = this.generateRecommendations(
      adjustmentType,
      adjustmentVsIPCA,
      fairnessScore,
      rentChange
    )

    return {
      original,
      renewal,
      changes: {
        rentChange,
        cautionChange,
        adminFeeChange,
        insuranceChange,
      },
      analysis: {
        ipcaAdjustmentExpected,
        actualAdjustment,
        adjustmentVsIPCA,
        adjustmentType,
        fairnessScore,
        warnings,
        recommendations,
      },
    }
  }

  /**
   * Calcula score de equidade (0-100)
   */
  private static calculateFairnessScore(
    ipcaExpected: number,
    actualAdjustment: number,
    cautionChange: { percentage: number },
    adminFeeChange: { percentage: number }
  ): number {
    let score = 100

    // Penalidade: diferença em relação ao IPCA
    const ipcaDiff = Math.abs(actualAdjustment - ipcaExpected)
    if (ipcaDiff > 5) {
      score -= 20
    } else if (ipcaDiff > 2) {
      score -= 10
    } else if (ipcaDiff > 0.5) {
      score -= 5
    }

    // Penalidade: caução mudou
    if (cautionChange.percentage > 5) {
      score -= 15
    } else if (cautionChange.percentage < -5) {
      score -= 5 // Redução de caução é melhor, mas pode ser suspeita
    }

    // Penalidade: taxa admin mudou significativamente
    if (Math.abs(adminFeeChange.percentage) > 10) {
      score -= 10
    }

    return Math.max(0, Math.min(100, score))
  }

  /**
   * Gera avisos automaticamente
   */
  private static generateWarnings(
    original: ContractSnapshot,
    renewal: ContractSnapshot,
    rentChange: { absolute: number; percentage: number },
    cautionChange: { percentage: number },
    ipcaExpected: number,
    actualAdjustment: number
  ): string[] {
    const warnings: string[] = []

    // Aviso: Aluguel aumentou muito além de IPCA
    if (actualAdjustment > ipcaExpected + 5) {
      warnings.push(
        `⚠️ Aluguel aumentou ${actualAdjustment.toFixed(2)}%, acima do IPCA esperado (${ipcaExpected.toFixed(2)}%)`
      )
    }

    // Aviso: Aluguel abaixo de IPCA (pode ser bom, mas verificar)
    if (actualAdjustment < ipcaExpected - 2 && actualAdjustment > 0) {
      warnings.push(
        `ℹ️ Aluguel aumentou abaixo do IPCA. Verificar se há outros ajustes.`
      )
    }

    // Aviso: Aluguel não reajustou
    if (Math.abs(rentChange.percentage) < 0.1) {
      warnings.push(`ℹ️ Aluguel manteve-se praticamente igual (${rentChange.percentage.toFixed(2)}%)`)
    }

    // Aviso: Caução aumentou
    if (cautionChange.percentage > 10) {
      warnings.push(
        `⚠️ Caução aumentou ${cautionChange.percentage.toFixed(2)}% - Verificar se é justificado`
      )
    }

    // Aviso: Intervalo entre contratos
    const daysBetween = this.daysBetween(original.endDate, renewal.startDate)
    if (daysBetween > 30) {
      warnings.push(
        `⚠️ ${daysBetween} dias entre fim do contrato e renovação - Verifique se há contrato intermédio`
      )
    }

    // Aviso: Período do contrato mudou significativamente
    const originalDuration = this.daysBetween(original.startDate, original.endDate)
    const renewalDuration = this.daysBetween(renewal.startDate, renewal.endDate)
    const durationChange = ((renewalDuration - originalDuration) / originalDuration) * 100
    if (Math.abs(durationChange) > 10) {
      warnings.push(
        `ℹ️ Duração do contrato mudou de ${originalDuration} para ${renewalDuration} dias`
      )
    }

    return warnings
  }

  /**
   * Gera recomendações
   */
  private static generateRecommendations(
    adjustmentType: 'below-ipca' | 'at-ipca' | 'above-ipca',
    adjustmentVsIPCA: number,
    fairnessScore: number,
    rentChange: { absolute: number; percentage: number }
  ): string[] {
    const recommendations: string[] = []

    if (adjustmentType === 'above-ipca') {
      if (adjustmentVsIPCA > 10) {
        recommendations.push(
          `🚨 Rejeitar: Aumento muito acima de IPCA (+${adjustmentVsIPCA.toFixed(2)}%)`
        )
      } else if (adjustmentVsIPCA > 5) {
        recommendations.push(
          `⚠️ Negociar: Aumento ${adjustmentVsIPCA.toFixed(2)}% acima de IPCA`
        )
      } else {
        recommendations.push(`✓ Aceitável: Aumento dentro de parâmetros normais`)
      }
    } else if (adjustmentType === 'at-ipca') {
      recommendations.push(`✓ Justo: Reajuste alinhado ao IPCA`)
    } else {
      recommendations.push(
        `✓ Favorável: Reajuste abaixo de IPCA (${adjustmentVsIPCA.toFixed(2)}%)`
      )
    }

    if (fairnessScore < 50) {
      recommendations.push(
        `⚠️ Análise completa recomendada: Score de equidade baixo (${fairnessScore})`
      )
    }

    if (rentChange.absolute > 0) {
      const monthlyIncrease = rentChange.absolute
      recommendations.push(
        `💰 Impacto anual: +R$ ${(monthlyIncrease * 12).toFixed(2)} no orçamento`
      )
    }

    return recommendations
  }

  /**
   * Helper: Calcula dias entre datas
   */
  private static daysBetween(dateA: string, dateB: string): number {
    const date1 = new Date(dateA)
    const date2 = new Date(dateB)
    const diffTime = Math.abs(date2.getTime() - date1.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  /**
   * Simula diferentes cenários de reajuste
   */
  static simulateScenarios(
    original: ContractSnapshot,
    renewal: ContractSnapshot,
    percentages: number[]
  ): Array<{
    percentage: number
    newRent: number
    comparison: RenewalComparison
  }> {
    return percentages.map((percentage) => {
      const modified = {
        ...renewal,
        rent: original.rent * (1 + percentage / 100),
      }
      const comparison = this.compare(original, modified)
      return {
        percentage,
        newRent: modified.rent,
        comparison,
      }
    })
  }

  /**
   * Extrai insertos/aditivos de um contrato
   */
  static identifyAddendums(contracts: ContractSnapshot[]): {
    original: ContractSnapshot
    renewals: ContractSnapshot[]
    addendums: ContractSnapshot[]
  } {
    const sorted = contracts.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    const original = sorted.find((c) => c.version === 'original')!
    const renewals = sorted.filter((c) => c.version === 'renewal')
    const addendums = sorted.filter((c) => c.version === 'addendum')

    return { original, renewals, addendums }
  }
}
