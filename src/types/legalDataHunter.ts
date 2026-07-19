/**
 * Tipos de Integração com Legal Data Hunter
 * Multi-jurisdição, jurisprudência em tempo real, análise comparativa
 */

export interface LegalDataHunterQuery {
  texto: string
  jurisdicoes: string[]
  tipoDocumento?: 'jurisprudencia' | 'legislacao' | 'doutrina'
  areaJuridica?: string
  dataInicio?: Date
  dataFim?: Date
  pagina?: number
  limite?: number
}

export interface DocumentoJuridico {
  id: string
  titulo: string
  tipo: 'jurisprudencia' | 'legislacao' | 'doutrina'
  jurisdicao: string
  conteudo: string
  resumo: string
  dataPublicacao: Date
  autores: string[]
  citacoes: number
  relevancia: number
  url: string
  areaJuridica: string[]
  palavrasChave: string[]
}

export interface JurisprudenciaResultado {
  id: string
  numeroProcesso: string
  ementa: string
  decisao: string
  dataDecisao: Date
  tribunal: string
  juiz: string
  partes: string[]
  resultado: 'favoravel' | 'desfavoravel' | 'acordo' | 'parcial'
  fundamentosLegais: string[]
  citacoes: string[]
  relevancia: number
  similaridade?: number
  disponivel: boolean
  url: string
}

export interface LegislacaoResultado {
  id: string
  titulo: string
  tipo: 'lei' | 'decreto' | 'resolucao' | 'portaria' | 'norma'
  numero: string
  data: Date
  autoridade: string
  jurisdicao: string
  conteudo: string
  artigos: ArtigoLegislacao[]
  emendas: EmendaLegislacao[]
  status: 'vigente' | 'revogada' | 'suspensa'
  relevanciaPara: string
  url: string
}

export interface ArtigoLegislacao {
  numero: string
  titulo: string
  texto: string
  relevancia: number
}

export interface EmendaLegislacao {
  numero: string
  data: Date
  texto: string
  descricao: string
}

export interface AnalisisComparativa {
  tema: string
  jurisdicoes: JurisdicsaoComparacao[]
  diferencas: DiferencaJurisdica[]
  jurisprudenciaAlinhada: JurisprudenciaComparacao[]
  recomendacoes: string[]
}

export interface JurisdicsaoComparacao {
  jurisdicao: string
  legislacao: LegislacaoResultado[]
  jurisprudencia: JurisprudenciaResultado[]
  tendencia: 'favoravel' | 'desfavoravel' | 'mista'
  taxa: number
}

export interface DiferencaJurisdica {
  tema: string
  jurisdicao1: string
  abordagem1: string
  jurisdicao2: string
  abordagem2: string
  impacto: 'alto' | 'medio' | 'baixo'
}

export interface JurisprudenciaComparacao {
  jurisprudencia: JurisprudenciaResultado
  jurisdicoes: string[]
  consenso: boolean
  divergencias: string[]
}

export interface BuscaAvancadaParams {
  consulta: string
  jurisdicoes: string[]
  areas: string[]
  tipos: string[]
  dataInicio?: Date
  dataFim?: Date
  resultadoDesejado?: 'favoravel' | 'desfavoravel'
  citacaoMinima?: number
  ordenarPor?: 'relevancia' | 'data' | 'citacoes'
  pagina?: number
  limite?: number
}

export interface ResultadoBuscaAvancada {
  total: number
  pagina: number
  limite: number
  resultados: DocumentoJuridico[]
  filtrosAplicados: BuscaAvancadaParams
  tempoResposta: number
  statisticas: StatisticasBusca
}

export interface StatisticasBusca {
  documentosPorTipo: Record<string, number>
  documentosPorJurisdica: Record<string, number>
  documentosPorArea: Record<string, number>
  documentosPorAno: Record<string, number>
  documentosPorResultado: Record<string, number>
}

export interface AnaliseDetalhada {
  documento: DocumentoJuridico
  contexto: string
  implicacoes: string[]
  casosRelacionados: DocumentoJuridico[]
  precedentes: JurisprudenciaResultado[]
  contraargumentos: string[]
  aplicabilidade: AplicabilidadeAnalise
  recomendacoes: RecomendacaoAnalise[]
}

export interface AplicabilidadeAnalise {
  jurisdicao: string
  nivel: 'alto' | 'medio' | 'baixo'
  restricoes: string[]
  observacoes: string
}

export interface RecomendacaoAnalise {
  tipo: 'citacao' | 'argumento' | 'estrategia' | 'precaucao'
  descricao: string
  impacto: 'alto' | 'medio' | 'baixo'
  fundamento: string
}

export interface CacheConfig {
  habilitado: boolean
  ttl: number
  maxItens: number
}

export interface ConfiguracaoLDH {
  apiKey: string
  jurisdicoesDefault: string[]
  areasDefault: string[]
  tiposDefault: string[]
  resultadosDefault: number
  cache: CacheConfig
  timeout: number
}
