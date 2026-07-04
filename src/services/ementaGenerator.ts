/**
 * Ementa Generator Service
 * Automatically generates legal summaries in CNJ/STJ format
 */

import type { Ementa, StructuredSummary } from '../types/editor'

const generateId = () => crypto.randomUUID()

export class EmentaGenerator {
  /**
   * Gerar ementa automaticamente
   */
  async generateEmenta(
    documentId: string,
    content: string
  ): Promise<Ementa> {
    // 1. Extrair informações-chave
    const branch = this.detectBranch(content)
    const subject = this.detectSubject(content)
    const keywords = this.extractKeywords(content)

    // 2. Gerar sumário
    const summary = this.generateSummary(content, {
      branch,
      subject,
      keywords,
    })

    // 3. Criar ementa estruturada
    const ementa: Ementa = {
      id: generateId(),
      documentId,
      branch,
      subject,
      origin: 'Primeira Instância',
      tribunal: 'Tribunal de Justiça (a definir)',
      summary: summary.text,
      summaryStructured: summary.structured,
      keywords: keywords.slice(0, 5),
      format: 'cnj',
      aiGenerated: true,
      confirmedByUser: false,
      createdAt: new Date(),
    }

    return ementa
  }

  /**
   * Detectar ramo jurídico
   */
  private detectBranch(content: string): string {
    const contentLower = content.toLowerCase()

    const branchKeywords = {
      Civil: ['indenização', 'responsabilidade civil', 'contrato', 'direito civil', 'obrigação'],
      Criminal: ['crime', 'delito', 'acusado', 'direito penal', 'pena', 'condenação'],
      Trabalhista: ['empregado', 'empregador', 'salário', 'clt', 'direito do trabalho', 'justa causa'],
      Administrativo: ['administração pública', 'servidor público', 'licitação', 'ato administrativo'],
      Constitucional: ['inconstitucional', 'direito constitucional', 'mandado', 'constituição'],
      Tributário: ['imposto', 'tributo', 'direito tributário', 'irpf', 'icms', 'pis'],
      Família: ['divórcio', 'custódia', 'direito de família', 'sucessão', 'alimentos'],
    }

    for (const [branch, keywords] of Object.entries(branchKeywords)) {
      const matches = keywords.filter((kw) => contentLower.includes(kw)).length
      if (matches > 0) return branch
    }

    return 'Civil'
  }

  /**
   * Detectar assunto principal
   */
  private detectSubject(content: string): string {
    const lines = content.split('\n')
    const titleLine = lines.find((line) => line.length > 20 && line.length < 200)
    return titleLine?.trim() || 'Assunto a definir'
  }

  /**
   * Extrair palavras-chave
   */
  private extractKeywords(content: string): string[] {
    const words = content
      .toLowerCase()
      .replace(/[^a-záéíóúàâêôãõç\s]/g, '')
      .split(/\s+/)

    const commonWords = new Set([
      'o',
      'a',
      'de',
      'da',
      'do',
      'e',
      'é',
      'em',
      'para',
      'com',
      'por',
      'que',
      'se',
      'não',
      'como',
      'foi',
      'ser',
    ])

    const keywords = words
      .filter((w) => w.length > 4 && !commonWords.has(w))
      .reduce(
        (acc, word) => {
          acc[word] = (acc[word] || 0) + 1
          return acc
        },
        {} as Record<string, number>
      )

    return Object.entries(keywords)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word)
  }

  /**
   * Gerar sumário
   */
  private generateSummary(
    content: string,
    metadata: { branch: string; subject: string; keywords: string[] }
  ): { text: string; structured: StructuredSummary } {
    const lines = content.split('\n').filter((l) => l.trim())
    const mainFacts = lines
      .filter((l) => l.includes('fato') || l.includes('ocorr') || l.includes('acontec'))
      .slice(0, 3)
      .map((l) => l.trim().substring(0, 150))

    const legalBasis = lines
      .filter((l) => l.includes('art') || l.includes('lei') || l.includes('código'))
      .slice(0, 2)
      .map((l) => l.trim().substring(0, 150))

    const mainRequest = lines.find(
      (l) => l.includes('requer') || l.includes('pedido') || l.includes('ação')
    ) || 'A definir'

    return {
      text: `${metadata.subject}. ${mainFacts.join(' ')}. Fundamentado em legislação pertinente.`,
      structured: {
        actionType: metadata.subject,
        mainFacts: mainFacts.length > 0 ? mainFacts : ['Fatos relacionados à demanda'],
        legalBasis: legalBasis.length > 0 ? legalBasis : ['Legislação aplicável'],
        mainRequest: mainRequest.substring(0, 200),
        jurisprudentialSupport: false,
      },
    }
  }

  /**
   * Renderizar ementa em HTML (formato CNJ)
   */
  renderEmentaHTML(ementa: Ementa): string {
    return `
      <div class="ementa-container">
        <div class="ementa-header">EMENTA</div>

        <div class="ementa-metadata">
          <div class="ementa-field">
            <label>Ramo:</label>
            <span>${ementa.branch}</span>
          </div>
          <div class="ementa-field">
            <label>Assunto:</label>
            <span>${ementa.subject}</span>
          </div>
          <div class="ementa-field">
            <label>Origem:</label>
            <span>${ementa.origin}</span>
          </div>
          <div class="ementa-field">
            <label>Tribunal:</label>
            <span>${ementa.tribunal}</span>
          </div>
        </div>

        <div class="ementa-text">
          ${ementa.summary}
        </div>

        <div class="ementa-keywords">
          <strong>Palavras-chave:</strong>
          ${ementa.keywords.map((k) => `<span class="keyword">${k}</span>`).join('')}
        </div>
      </div>
    `
  }
}

export const ementaGenerator = new EmentaGenerator()
