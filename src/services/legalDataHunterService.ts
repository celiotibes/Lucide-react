/**
 * Serviço de Integração com Legal Data Hunter
 * Pesquisa jurídica multi-jurisdicional em tempo real
 */

import type {
  LegalDataHunterQuery,
  DocumentoJuridico,
  JurisprudenciaResultado,
  LegislacaoResultado,
  BuscaAvancadaParams,
  ResultadoBuscaAvancada,
  AnalisisComparativa,
  AnaliseDetalhada,
  ConfiguracaoLDH,
} from '../types/legalDataHunter'

export class ServicoLegalDataHunter {
  private apiKey: string
  private baseUrl = 'https://api.legaldatahunter.com/v1'
  private config: ConfiguracaoLDH
  private cache: Map<string, { dados: unknown; timestamp: number }>

  constructor(apiKey: string, config?: Partial<ConfiguracaoLDH>) {
    this.apiKey = apiKey
    this.cache = new Map()
    this.config = {
      apiKey,
      jurisdicoesDefault: ['BR', 'US', 'EU'],
      areasDefault: ['civil', 'trabalhista', 'tributario'],
      tiposDefault: ['jurisprudencia', 'legislacao'],
      resultadosDefault: 20,
      cache: {
        habilitado: true,
        ttl: 3600000,
        maxItens: 100,
      },
      timeout: 30000,
      ...config,
    }
  }

  /**
   * Busca jurisprudência
   */
  async buscarJurisprudencia(
    query: LegalDataHunterQuery
  ): Promise<JurisprudenciaResultado[]> {
    const cacheKey = `jurisprudencia:${JSON.stringify(query)}`

    if (this.config.cache.habilitado) {
      const cached = this.getFromCache(cacheKey)
      if (cached) return cached as JurisprudenciaResultado[]
    }

    try {
      const params = new URLSearchParams({
        q: query.texto,
        jurisdictions: query.jurisdicoes.join(','),
        type: 'jurisprudencia',
        area: query.areaJuridica || 'civil',
        limit: String(query.limite || 10),
        offset: String((query.pagina || 1) * (query.limite || 10) - (query.limite || 10)),
      })

      if (query.dataInicio) {
        params.append('date_from', query.dataInicio.toISOString().split('T')[0])
      }
      if (query.dataFim) {
        params.append('date_to', query.dataFim.toISOString().split('T')[0])
      }

      const response = await fetch(`${this.baseUrl}/search?${params}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Erro na API: ${response.statusText}`)
      }

      const dados = await response.json()
      const resultados = this.transformarJurisprudencia(dados.results || [])

      if (this.config.cache.habilitado) {
        this.setInCache(cacheKey, resultados)
      }

      return resultados
    } catch (erro) {
      console.error('Erro ao buscar jurisprudência:', erro)
      return []
    }
  }

  /**
   * Busca legislação
   */
  async buscarLegislacao(
    query: LegalDataHunterQuery
  ): Promise<LegislacaoResultado[]> {
    const cacheKey = `legislacao:${JSON.stringify(query)}`

    if (this.config.cache.habilitado) {
      const cached = this.getFromCache(cacheKey)
      if (cached) return cached as LegislacaoResultado[]
    }

    try {
      const params = new URLSearchParams({
        q: query.texto,
        jurisdictions: query.jurisdicoes.join(','),
        type: 'legislacao',
        limit: String(query.limite || 10),
        offset: String((query.pagina || 1) * (query.limite || 10) - (query.limite || 10)),
      })

      const response = await fetch(`${this.baseUrl}/search?${params}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Erro na API: ${response.statusText}`)
      }

      const dados = await response.json()
      const resultados = this.transformarLegislacao(dados.results || [])

      if (this.config.cache.habilitado) {
        this.setInCache(cacheKey, resultados)
      }

      return resultados
    } catch (erro) {
      console.error('Erro ao buscar legislação:', erro)
      return []
    }
  }

  /**
   * Busca avançada com múltiplos filtros
   */
  async buscaAvancada(
    params: BuscaAvancadaParams
  ): Promise<ResultadoBuscaAvancada> {
    const cacheKey = `busca-avancada:${JSON.stringify(params)}`

    if (this.config.cache.habilitado) {
      const cached = this.getFromCache(cacheKey)
      if (cached) return cached as ResultadoBuscaAvancada
    }

    try {
      const queryParams = new URLSearchParams({
        q: params.consulta,
        jurisdictions: params.jurisdicoes.join(','),
        areas: params.areas.join(','),
        types: params.tipos.join(','),
        limit: String(params.limite || 20),
        offset: String((params.pagina || 1) * (params.limite || 20) - (params.limite || 20)),
        sort: params.ordenarPor || 'relevancia',
      })

      if (params.dataInicio) {
        queryParams.append('date_from', params.dataInicio.toISOString().split('T')[0])
      }
      if (params.dataFim) {
        queryParams.append('date_to', params.dataFim.toISOString().split('T')[0])
      }
      if (params.resultadoDesejado) {
        queryParams.append('result', params.resultadoDesejado)
      }
      if (params.citacaoMinima) {
        queryParams.append('min_citations', String(params.citacaoMinima))
      }

      const response = await fetch(`${this.baseUrl}/advanced-search?${queryParams}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Erro na API: ${response.statusText}`)
      }

      const dados = await response.json()
      const resultado: ResultadoBuscaAvancada = {
        total: dados.total || 0,
        pagina: params.pagina || 1,
        limite: params.limite || 20,
        resultados: this.transformarDocumentos(dados.results || []),
        filtrosAplicados: params,
        tempoResposta: dados.response_time || 0,
        statisticas: {
          documentosPorTipo: dados.stats?.by_type || {},
          documentosPorJurisdica: dados.stats?.by_jurisdiction || {},
          documentosPorArea: dados.stats?.by_area || {},
          documentosPorAno: dados.stats?.by_year || {},
          documentosPorResultado: dados.stats?.by_result || {},
        },
      }

      if (this.config.cache.habilitado) {
        this.setInCache(cacheKey, resultado)
      }

      return resultado
    } catch (erro) {
      console.error('Erro ao buscar com filtros avançados:', erro)
      return {
        total: 0,
        pagina: params.pagina || 1,
        limite: params.limite || 20,
        resultados: [],
        filtrosAplicados: params,
        tempoResposta: 0,
        statisticas: {
          documentosPorTipo: {},
          documentosPorJurisdica: {},
          documentosPorArea: {},
          documentosPorAno: {},
          documentosPorResultado: {},
        },
      }
    }
  }

  /**
   * Análise comparativa entre jurisdições
   */
  async analisarComparativa(
    tema: string,
    jurisdicoes: string[]
  ): Promise<AnalisisComparativa> {
    try {
      const response = await fetch(`${this.baseUrl}/comparative-analysis`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic: tema,
          jurisdictions: jurisdicoes,
        }),
      })

      if (!response.ok) {
        throw new Error(`Erro na API: ${response.statusText}`)
      }

      return await response.json()
    } catch (erro) {
      console.error('Erro ao analisar comparativamente:', erro)
      return {
        tema,
        jurisdicoes: [],
        diferencas: [],
        jurisprudenciaAlinhada: [],
        recomendacoes: ['Não foi possível completar a análise comparativa'],
      }
    }
  }

  /**
   * Análise detalhada de documento
   */
  async analisarDetalhado(documentoId: string): Promise<AnaliseDetalhada | null> {
    try {
      const response = await fetch(`${this.baseUrl}/documents/${documentoId}/analysis`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Erro na API: ${response.statusText}`)
      }

      return await response.json()
    } catch (erro) {
      console.error('Erro ao analisar detalhadamente:', erro)
      return null
    }
  }

  /**
   * Transformar resposta em objeto JurisprudenciaResultado
   */
  private transformarJurisprudencia(dados: unknown[]): JurisprudenciaResultado[] {
    return (dados as Record<string, unknown>[]).map((item) => ({
      id: String(item.id),
      numeroProcesso: String(item.case_number || ''),
      ementa: String(item.summary || ''),
      decisao: String(item.decision || ''),
      dataDecisao: new Date(String(item.decision_date) || Date.now()),
      tribunal: String(item.court || ''),
      juiz: String(item.judge || ''),
      partes: Array.isArray(item.parties) ? item.parties : [],
      resultado: (item.result || 'parcial') as 'favoravel' | 'desfavoravel' | 'acordo' | 'parcial',
      fundamentosLegais: Array.isArray(item.legal_basis) ? item.legal_basis : [],
      citacoes: Array.isArray(item.citations) ? item.citations : [],
      relevancia: Number(item.relevance_score) || 0,
      disponivel: Boolean(item.available),
      url: String(item.url || ''),
    }))
  }

  /**
   * Transformar resposta em objeto LegislacaoResultado
   */
  private transformarLegislacao(dados: unknown[]): LegislacaoResultado[] {
    return (dados as Record<string, unknown>[]).map((item) => ({
      id: String(item.id),
      titulo: String(item.title || ''),
      tipo: (item.type || 'lei') as 'lei' | 'decreto' | 'resolucao' | 'portaria' | 'norma',
      numero: String(item.number || ''),
      data: new Date(String(item.date) || Date.now()),
      autoridade: String(item.authority || ''),
      jurisdicao: String(item.jurisdiction || ''),
      conteudo: String(item.content || ''),
      artigos: Array.isArray(item.articles)
        ? (item.articles as Record<string, unknown>[]).map((a) => ({
            numero: String(a.number || ''),
            titulo: String(a.title || ''),
            texto: String(a.text || ''),
            relevancia: Number(a.relevance) || 0,
          }))
        : [],
      emendas: Array.isArray(item.amendments)
        ? (item.amendments as Record<string, unknown>[]).map((e) => ({
            numero: String(e.number || ''),
            data: new Date(String(e.date) || Date.now()),
            texto: String(e.text || ''),
            descricao: String(e.description || ''),
          }))
        : [],
      status: (item.status || 'vigente') as 'vigente' | 'revogada' | 'suspensa',
      relevanciaPara: String(item.relevance_for || ''),
      url: String(item.url || ''),
    }))
  }

  /**
   * Transformar resposta genérica em DocumentoJuridico
   */
  private transformarDocumentos(dados: unknown[]): DocumentoJuridico[] {
    return (dados as Record<string, unknown>[]).map((item) => ({
      id: String(item.id),
      titulo: String(item.title || ''),
      tipo: (item.type || 'jurisprudencia') as 'jurisprudencia' | 'legislacao' | 'doutrina',
      jurisdicao: String(item.jurisdiction || ''),
      conteudo: String(item.content || ''),
      resumo: String(item.summary || ''),
      dataPublicacao: new Date(String(item.published_date) || Date.now()),
      autores: Array.isArray(item.authors) ? item.authors : [],
      citacoes: Number(item.citations_count) || 0,
      relevancia: Number(item.relevance_score) || 0,
      url: String(item.url || ''),
      areaJuridica: Array.isArray(item.legal_areas) ? item.legal_areas : [],
      palavrasChave: Array.isArray(item.keywords) ? item.keywords : [],
    }))
  }

  /**
   * Gerenciamento de cache
   */
  private getFromCache(chave: string): unknown | null {
    const item = this.cache.get(chave)
    if (!item) return null

    const agora = Date.now()
    if (agora - item.timestamp > this.config.cache.ttl) {
      this.cache.delete(chave)
      return null
    }

    return item.dados
  }

  private setInCache(chave: string, dados: unknown): void {
    if (this.cache.size >= this.config.cache.maxItens) {
      const primeiraChave = this.cache.keys().next().value
      if (primeiraChave) this.cache.delete(primeiraChave)
    }

    this.cache.set(chave, {
      dados,
      timestamp: Date.now(),
    })
  }

  /**
   * Limpar cache
   */
  limparCache(): void {
    this.cache.clear()
  }
}

let instancia: ServicoLegalDataHunter | null = null

export function inicializarLDH(apiKey: string): ServicoLegalDataHunter {
  instancia = new ServicoLegalDataHunter(apiKey)
  return instancia
}

export function obterLDH(): ServicoLegalDataHunter {
  if (!instancia) {
    const apiKey = import.meta.env.VITE_LEGAL_DATA_HUNTER_API_KEY || 'demo'
    instancia = new ServicoLegalDataHunter(apiKey)
  }
  return instancia
}
