/**
 * Tipos de Busca Avançada
 * Interface para pesquisa jurídica multi-critério
 */

export interface FiltrosBuscaAvancada {
  consulta: string
  jurisdicoes: string[]
  areas: string[]
  tipos: string[]
  dataInicio?: Date
  dataFim?: Date
  resultadoDesejado?: 'favoravel' | 'desfavoravel'
  citacaoMinima?: number
  ordenarPor: 'relevancia' | 'data' | 'citacoes'
  pagina: number
  limite: number
}

export interface OpcaoFiltro {
  valor: string
  label: string
  descricao?: string
  icone?: string
}

export interface GrupoFiltro {
  nome: string
  chave: string
  opcoes: OpcaoFiltro[]
  multiplo: boolean
  expandido: boolean
}

export interface PresetBusca {
  id: string
  nome: string
  descricao: string
  filtros: FiltrosBuscaAvancada
  criado: Date
  modificado: Date
  favorito: boolean
  uso: number
}

export interface ResultadoBuscaUI {
  id: string
  titulo: string
  tipo: 'jurisprudencia' | 'legislacao' | 'doutrina'
  descricao: string
  dataPublicacao: Date
  jurisdicao: string
  relevancia: number
  citacoes: number
  tags: string[]
  preview: string
  url: string
  selecionado: boolean
}

export interface EstatsticasBuscaUI {
  totalResultados: number
  tempoResposta: number
  filtrosAtivos: number
  paginasDisponiveis: number
  documentosPorTipo: Record<string, number>
  documentosPorArea: Record<string, number>
  documentosPorJurisdica: Record<string, number>
  documentosPorAno: Record<string, number>
}

export interface HistoricoBusca {
  id: string
  consulta: string
  filtros: Partial<FiltrosBuscaAvancada>
  dataRealizada: Date
  resultados: number
  tempo: number
  favorito: boolean
}

export interface SugestoesAutocomplete {
  sugestoes: string[]
  termosRelacionados: string[]
  jurisprudenciaRelacionada: string[]
}

export interface ExportacaoBusca {
  formato: 'json' | 'csv' | 'pdf' | 'docx'
  incluirPreview: boolean
  incluirMetadata: boolean
  somenteUm: boolean
  intervalo?: {
    inicio: number
    fim: number
  }
}

export interface ConfiguracaoBuscaAvancada {
  resultadosPorPagina: number[]
  ordenacoesPadrao: string[]
  jurisdicoesPadrao: string[]
  areasPadrao: string[]
  tiposPadrao: string[]
  salvarHistorico: boolean
  maxHistorico: number
  maxPresets: number
  timeoutBusca: number
  mostrarPreview: boolean
  previewLinhas: number
}
