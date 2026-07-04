/**
 * PubMed Client
 * Integration with PubMed/MEDLINE for academic article research
 */

import type {
  Article,
  PubmedQuery,
  PubmedSearchResult,
  CitationFormat,
  FormattedCitation,
  RelatedArticles,
  AdvancedSearchQuery,
  AdvancedSearchResult,
} from '../types/academic'

export class PubmedClient {
  private apiEndpoint: string
  private timeout: number

  constructor(timeout = 30000) {
    this.apiEndpoint = 'https://www.ncbi.nlm.nih.gov/pmc/utils/webenv'
    this.timeout = timeout
  }

  /**
   * Pesquisar artigos no PubMed
   */
  async search(query: PubmedQuery): Promise<PubmedSearchResult> {
    try {
      const searchUrl = this._buildSearchUrl(query)

      const response = await this._fetchWithTimeout(searchUrl)
      const data = await response.json() as { results?: Article[], total?: number }

      return {
        searchId: `search_${Date.now()}`,
        query,
        executedAt: new Date(),
        totalResults: data.total || 0,
        articles: data.results || [],
        executionTimeMs: 0,
      }
    } catch (error) {
      throw new Error(`PubMed search failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Busca avançada com operadores booleanos
   */
  async advancedSearch(query: AdvancedSearchQuery): Promise<AdvancedSearchResult> {
    try {
      const queryString = this._buildBooleanQuery(query)

      const response = await this._fetchWithTimeout(
        `${this.apiEndpoint}/esearch.fcgi?db=pmc&term=${encodeURIComponent(queryString)}&rettype=json&retmax=100`,
      )

      const data = await response.json() as { result?: { total?: string, uids?: string[] } }
      const pmids = data.result?.uids || []

      // Fetch article details for each PMID
      const articles: Article[] = []
      for (const pmid of pmids) {
        try {
          const article = await this.getArticle(pmid)
          articles.push(article)
        } catch {
          // Continuar mesmo se um artigo falhar
        }
      }

      return {
        query,
        results: articles,
        totalFound: parseInt(data.result?.total || '0', 10),
        executedAt: new Date(),
        filters: {
          appliedFilters: [],
          availableFilters: [],
        },
      }
    } catch (error) {
      throw new Error(`Advanced search failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Obter detalhes completos de um artigo por PMID
   */
  async getArticle(pmid: string): Promise<Article> {
    try {
      const response = await this._fetchWithTimeout(
        `${this.apiEndpoint}/esummary.fcgi?db=pmc&id=${pmid}&rettype=json`,
      )

      const data = await response.json() as {
        result?: {
          [key: string]: {
            title?: string
            authors?: Author[]
            source?: string
            pubdate?: string
            pmcid?: string
            doi?: string
          }
        }
      }

      const article = data.result?.[pmid]
      if (!article) throw new Error(`Article ${pmid} not found`)

      return {
        pmid,
        title: article.title || '',
        authors: article.authors || [],
        journal: {
          name: article.source || '',
        },
        publicationDate: article.pubdate || '',
        year: parseInt(article.pubdate?.substring(0, 4) || '0', 10),
        abstract: '',
        citationCount: 0,
        fullTextUrl: `https://www.ncbi.nlm.nih.gov/pmc/articles/${article.pmcid || pmid}/`,
        pubmedUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        availability: 'free_full_text',
      }
    } catch (error) {
      throw new Error(`Failed to fetch article ${pmid}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Obter artigos relacionados
   */
  async getRelatedArticles(pmid: string, limit = 20): Promise<RelatedArticles> {
    try {
      const response = await this._fetchWithTimeout(
        `${this.apiEndpoint}/elink.fcgi?dbfrom=pmc&db=pmc&id=${pmid}&rettype=json&retmax=${limit}`,
      )

      const data = await response.json() as {
        linksets?: {
          dbhist?: { id?: string[] }
        }[]
      }

      const relatedPmids = data.linksets?.[0]?.dbhist?.id || []

      const articles: Article[] = []
      for (const relatedPmid of relatedPmids.slice(0, limit)) {
        try {
          const article = await this.getArticle(relatedPmid)
          articles.push(article)
        } catch {
          // Continuar
        }
      }

      return {
        sourcePmid: pmid,
        relatedArticles: articles,
        retrievedAt: new Date(),
        relatednessScore: 0.8,
      }
    } catch (error) {
      throw new Error(
        `Failed to fetch related articles: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  /**
   * Formatar citação em diferentes estilos
   */
  formatCitation(article: Article, style: CitationFormat): FormattedCitation {
    const { title, authors, journal, year, pages, doi } = article

    let citationText = ''

    switch (style) {
      case 'apa':
        citationText = this._formatAPA(title, authors, journal.name, year, pages, doi)
        break
      case 'abnt':
        citationText = this._formatABNT(title, authors, journal.name, year, pages, doi)
        break
      case 'chicago':
        citationText = this._formatChicago(title, authors, journal.name, year, pages, doi)
        break
      case 'mla':
        citationText = this._formatMLA(title, authors, journal.name, year, pages, doi)
        break
      case 'harvard':
        citationText = this._formatHarvard(title, authors, journal.name, year, pages, doi)
        break
      case 'vancouver':
        citationText = this._formatVancouver(title, authors, journal.name, year, pages, doi)
        break
      case 'iso':
        citationText = this._formatISO(title, authors, journal.name, year, pages, doi)
        break
    }

    return {
      pmid: article.pmid,
      format: style,
      citationText,
    }
  }

  /**
   * Buscar por autor específico
   */
  async searchByAuthor(authorName: string, limit = 20): Promise<Article[]> {
    const query: PubmedQuery = {
      keywords: [authorName],
      limit,
      filters: {},
    }

    const results = await this.search(query)
    return results.articles
  }

  /**
   * Buscar por journal específico
   */
  async searchByJournal(journalName: string, yearFrom?: number, yearTo?: number, limit = 20): Promise<Article[]> {
    const query: PubmedQuery = {
      keywords: [journalName],
      limit,
      filters: {
        yearFrom,
        yearTo,
      },
    }

    const results = await this.search(query)
    return results.articles
  }

  /**
   * Fetch com timeout automático
   */
  private async _fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      return response
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Construir URL de pesquisa
   */
  private _buildSearchUrl(query: PubmedQuery): string {
    const keywords = query.keywords.join(' AND ')
    let url = `${this.apiEndpoint}/esearch.fcgi?db=pmc&term=${encodeURIComponent(keywords)}&rettype=json&retmax=${query.limit || 20}`

    if (query.filters?.yearFrom) {
      url += `&mindate=${query.filters.yearFrom}01/01/&datetype=pdat`
    }
    if (query.filters?.yearTo) {
      url += `&maxdate=${query.filters.yearTo}12/31/&datetype=pdat`
    }

    return url
  }

  /**
   * Construir query booleano
   */
  private _buildBooleanQuery(query: AdvancedSearchQuery): string {
    const parts: string[] = []

    if (query.mustInclude.length > 0) {
      parts.push(query.mustInclude.join(' AND '))
    }

    if (query.shouldInclude.length > 0) {
      parts.push(`(${query.shouldInclude.join(' OR ')})`)
    }

    if (query.mustExclude.length > 0) {
      parts.push(query.mustExclude.map(term => `NOT ${term}`).join(' AND '))
    }

    if (query.phrase) {
      parts.push(`"${query.phrase}"`)
    }

    return parts.join(' AND ')
  }

  /**
   * Formatadores de citação
   */
  private _formatAPA(
    title: string,
    authors: Author[],
    journal: string,
    year: number,
    pages?: string,
    doi?: string,
  ): string {
    const authorStr = this._formatAuthors(authors, 'apa')
    return `${authorStr} (${year}). ${title}. ${journal}${pages ? `, ${pages}` : ''}${doi ? `. https://doi.org/${doi}` : ''}.`
  }

  private _formatABNT(
    title: string,
    authors: Author[],
    journal: string,
    year: number,
    pages?: string,
    doi?: string,
  ): string {
    const authorStr = this._formatAuthors(authors, 'abnt')
    return `${authorStr}. ${title}. ${journal}, ${year}${pages ? `, p. ${pages}` : ''}${doi ? `. DOI: ${doi}` : ''}.`
  }

  private _formatChicago(
    title: string,
    authors: Author[],
    journal: string,
    year: number,
    pages?: string,
    doi?: string,
  ): string {
    const authorStr = this._formatAuthors(authors, 'chicago')
    return `${authorStr}. "${title}." ${journal} (${year})${pages ? `: ${pages}` : ''}${doi ? `. DOI: ${doi}` : ''}.`
  }

  private _formatMLA(
    title: string,
    authors: Author[],
    journal: string,
    year: number,
    pages?: string,
    doi?: string,
  ): string {
    const authorStr = this._formatAuthors(authors, 'mla')
    return `${authorStr}. "${title}." ${journal}, vol. ${year}${pages ? `, pp. ${pages}` : ''}${doi ? `, https://doi.org/${doi}` : ''}.`
  }

  private _formatHarvard(
    title: string,
    authors: Author[],
    journal: string,
    year: number,
    pages?: string,
    doi?: string,
  ): string {
    const authorStr = this._formatAuthors(authors, 'harvard')
    return `${authorStr}, ${year}. ${title}. ${journal}${pages ? `, pp.${pages}` : ''}${doi ? `. doi: ${doi}` : ''}.`
  }

  private _formatVancouver(
    title: string,
    authors: Author[],
    journal: string,
    year: number,
    pages?: string,
    doi?: string,
  ): string {
    const authorStr = this._formatAuthors(authors, 'vancouver')
    return `${authorStr}. ${title}. ${journal}. ${year}${pages ? `;${pages}` : ''}${doi ? `. doi: ${doi}` : ''}.`
  }

  private _formatISO(
    title: string,
    authors: Author[],
    journal: string,
    year: number,
    pages?: string,
    doi?: string,
  ): string {
    const authorStr = this._formatAuthors(authors, 'iso')
    return `${authorStr}. ${title}. ${journal}, ${year}${pages ? `, pp. ${pages}` : ''}${doi ? `. DOI: ${doi}` : ''}. ${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}.`
  }

  private _formatAuthors(authors: Author[], style: string): string {
    if (authors.length === 0) return 'Unknown'
    if (authors.length === 1) return authors[0].name

    const firstAuthor = authors[0].name
    if (style === 'apa' || style === 'chicago' || style === 'iso') {
      return `${firstAuthor}, & ${authors.slice(1).map(a => a.name).join(', & ')}`
    }
    if (style === 'abnt') {
      return authors.map(a => a.name.toUpperCase()).join('; ')
    }

    return `${firstAuthor} et al.`
  }

  /**
   * Verificar conectividade com PubMed
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this._fetchWithTimeout(`${this.apiEndpoint}/einfo.fcgi?db=pmc&rettype=json`)
      return response.ok
    } catch {
      return false
    }
  }
}

/**
 * Interface Author para uso interno
 */
interface Author {
  name: string
  email?: string
  affiliation?: string
}

/**
 * Singleton instance
 */
export const pubmedClient = new PubmedClient()
