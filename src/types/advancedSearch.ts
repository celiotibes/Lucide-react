/**
 * Tipos para sistema avançado de busca e filtros
 */

export type TipoFiltro = 'texto' | 'data' | 'select' | 'checkbox' | 'range'
export type TipoDocumento = 'jurisprudencia' | 'legislacao' | 'doutrina' | 'artigo' | 'parecer' | 'peticao'
export type NivelRelevancia = 'baixa' | 'media' | 'alta' | 'critica'
export type StatusBusca = 'idle' | 'buscando' | 'concluida' | 'erro'

export interface FiltroAvancado {
  id: string
  nome: string
  tipo: TipoFiltro
  campo: string
  operador: 'contem' | 'nao-contem' | 'igual' | 'maior-que' | 'menor-que' | 'entre'
  valor: string | number | string[] | [number, number]
  ativo: boolean
}

export interface ConfiguracaoBusca {
  ativaAutoCompletar: boolean
  ativaSugestoesRelacionadas: boolean
  ativaHistoricoBusca: boolean
  ativaFavoritosBusca: boolean
  tamanhoResultadosPorPagina: number
  idiomas: string[]
  jurisdicoes: string[]
}

export interface HistoricoBusca {
  id: string
  query: string
  filtros: FiltroAvancado[]
  dataHora: Date
  quantidadeResultados: number
  tempoExecucao: number
}

export interface BuscaSalva {
  id: string
  nome: string
  descricao: string
  query: string
  filtros: FiltroAvancado[]
  dataCriacao: Date
  dataUltimaExecucao?: Date
  favorito: boolean
  quantidadeResultados?: number
}

export interface ResultadoBuscaAvancada {
  id: string
  titulo: string
  tipo: TipoDocumento
  relevancia: NivelRelevancia
  resumo: string
  autor?: string
  data: Date
  fonte: string
  url?: string
  tags: string[]
  destaque?: string
  corpoCompleto?: string
}

export interface PaginacaoBusca {
  paginaAtual: number
  totalPaginas: number
  quantidadeTotal: number
  resultadosPorPagina: number
  tempoExecucao: number
}

export interface ResultadoBuscaComPaginacao {
  resultados: ResultadoBuscaAvancada[]
  paginacao: PaginacaoBusca
  status: StatusBusca
  mensagem?: string
  sugestoes?: {
    buscarPor: string[]
    documentosRelacionados: ResultadoBuscaAvancada[]
    termosRelacionados: string[]
  }
}

export interface EstatisticasBusca {
  totalBuscas: number
  buscasAtualizadas: number
  termosPopulares: { termo: string; frequencia: number }[]
  tiposDocumentoMaisBuscados: { tipo: TipoDocumento; quantidade: number }[]
  tempoBuscaMedio: number
  taxaClique: number
}

export interface DefinicaoColuna {
  id: string
  titulo: string
  campo: string
  largura: string
  visivelPorPadrao: boolean
  ordenavel: boolean
}

export interface PreferenciaVisualizacao {
  colunas: DefinicaoColuna[]
  ordenarPor: string
  direcaoOrdenacao: 'asc' | 'desc'
  gruparPor?: string
  exibirMiniaturas: boolean
}
