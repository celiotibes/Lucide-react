/**
 * Academic Research Type Definitions
 * Types for PubMed article search, metadata, and citation analysis
 */

/**
 * Publicação e tipos de artigos
 */
export type PublicationType =
  | 'research_article'
  | 'review'
  | 'meta_analysis'
  | 'systematic_review'
  | 'clinical_trial'
  | 'case_report'
  | 'commentary'
  | 'editorial'
  | 'letter'
  | 'news'

/**
 * Formatos de citação
 */
export type CitationFormat = 'apa' | 'mla' | 'chicago' | 'harvard' | 'vancouver' | 'abnt' | 'iso'

/**
 * Parâmetros para pesquisa acadêmica no PubMed
 */
export interface PubmedQuery {
  keywords: string[]
  filters?: {
    yearFrom?: number
    yearTo?: number
    publicationType?: PublicationType
    language?: string
    humanStudiesOnly?: boolean
    clinicalTrialsOnly?: boolean
    freeFullTextOnly?: boolean
  }
  limit?: number
  offset?: number
}

/**
 * Autor de artigo
 */
export interface Author {
  id?: string
  name: string
  email?: string
  affiliation?: string
  country?: string
  orcid?: string
}

/**
 * Journal (periódico científico)
 */
export interface Journal {
  id?: string
  name: string
  issn?: string
  abbreviation?: string
  impactFactor?: number
  publicationType?: string
}

/**
 * Artigo acadêmico/científico
 */
export interface Article {
  pmid: string
  title: string
  authors: Author[]

  journal: Journal

  publicationDate: string
  year: number
  volume?: string
  issue?: string
  pages?: string

  abstract: string

  keywords?: string[]
  meshTerms?: string[]

  doi?: string

  citationCount: number
  citedByCount?: number

  fullTextUrl?: string
  pubmedUrl: string
  pdfUrl?: string

  studyType?: string
  sampleSize?: number

  funding?: string

  availability: 'free_full_text' | 'partial_access' | 'subscription_required'
}

/**
 * Resultado de busca no PubMed
 */
export interface PubmedSearchResult {
  searchId: string
  query: PubmedQuery
  executedAt: Date

  totalResults: number
  articles: Article[]

  nextPage?: string
  previousPage?: string

  executionTimeMs: number
}

/**
 * Sessão de pesquisa acadêmica
 */
export interface AcademicResearchSession {
  id: string
  createdAt: Date
  updatedAt: Date

  queries: PubmedQuery[]
  results: Article[]

  favorites: string[] // PMIDs
  collections: ArticleCollection[]

  notes?: string
  tags?: string[]
}

/**
 * Coleção de artigos
 */
export interface ArticleCollection {
  id: string
  name: string
  description?: string
  articles: string[] // PMIDs
  createdAt: Date
  updatedAt: Date
  isPublic: boolean
}

/**
 * Citação formatada
 */
export interface FormattedCitation {
  pmid: string
  format: CitationFormat
  citationText: string
  bibtex?: string
  ris?: string
}

/**
 * Análise de citações
 */
export interface CitationAnalysis {
  articleId: string
  analyzedAt: Date

  totalCitations: number
  citedByCount: number

  citationTrend?: {
    year: number
    count: number
  }[]

  influentialCitations: InfluentialCitation[]

  citationNetwork?: {
    nodes: CiteNode[]
    edges: CiteEdge[]
  }

  topCitingArticles: Article[]

  researchImpact: 'highly_influential' | 'influential' | 'moderate' | 'low'
}

/**
 * Citação influente (artigo que cita nosso artigo)
 */
export interface InfluentialCitation {
  citingArticle: Article
  citedCount: number // Quantas vezes nosso artigo foi citado neste
  context: string // Contexto em que foi citado
  impactFactor: number // Do journal do citing article
}

/**
 * Nó em rede de citações
 */
export interface CiteNode {
  id: string
  pmid: string
  title: string
  year: number
  citationCount: number
  isSelected?: boolean
}

/**
 * Aresta em rede de citações
 */
export interface CiteEdge {
  source: string
  target: string
  weight?: number
}

/**
 * Artigos relacionados
 */
export interface RelatedArticles {
  sourcePmid: string
  relatedArticles: Article[]
  retrievedAt: Date
  relatednessScore: number // 0-1
}

/**
 * Meta-análise de múltiplos artigos
 */
export interface MetaAnalysis {
  id: string
  topic: string
  articles: Article[]
  numberOfStudies: number

  effect: {
    size: number
    confidence_interval: [number, number]
  }

  heterogeneity: {
    i_squared: number
    p_value: number
  }

  biasAssessment: string

  conclusions: string

  limitations: string[]
}

/**
 * Resumo de literatura
 */
export interface LiteratureReview {
  id: string
  topic: string
  reviewedArticles: Article[]
  reviewDate: Date

  introduction: string
  methods: string
  results: string
  discussion: string
  conclusion: string

  futureResearchDirections: string[]
  keyFindings: string[]

  bibliography: FormattedCitation[]
}

/**
 * Estatísticas de busca
 */
export interface SearchStatistics {
  totalQueries: number
  totalResultsRetrieved: number
  articlesBookmarked: number

  topKeywords: {
    keyword: string
    frequency: number
  }[]

  publicationTypeDistribution: {
    type: PublicationType
    count: number
  }[]

  yearDistribution: {
    year: number
    count: number
  }[]

  journalDistribution: {
    journalName: string
    count: number
  }[]

  citationRateStats: {
    averageCitations: number
    medianCitations: number
    maxCitations: number
  }
}

/**
 * Busca avançada com operadores booleanos
 */
export interface AdvancedSearchQuery {
  mustInclude: string[] // AND
  shouldInclude: string[] // OR
  mustExclude: string[] // NOT
  phrase?: string // Busca exata
  authorName?: string
  journalName?: string
  meshTerms?: string[]
  dateRange?: {
    from: Date
    to: Date
  }
}

/**
 * Resultado de busca avançada
 */
export interface AdvancedSearchResult {
  query: AdvancedSearchQuery
  results: Article[]
  totalFound: number
  executedAt: Date
  filters: {
    appliedFilters: string[]
    availableFilters: string[]
  }
}

/**
 * Export de dados de pesquisa
 */
export interface ResearchExport {
  exportId: string
  exportFormat: 'csv' | 'json' | 'bibtex' | 'ris' | 'pdf'
  articles: Article[]
  exportedAt: Date
  fileName: string
  metadata: {
    totalArticles: number
    dateRange: {
      from: string
      to: string
    }
  }
}
