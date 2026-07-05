/**
 * Tipos de Dashboard
 * Gerenciamento central da aplicação
 */

export interface DocumentoRecente {
  id: string
  titulo: string
  tipo: 'editor' | 'editor-novo' | 'analise' | 'transformacao'
  dataModificacao: Date
  areaJuridica?: string
  ultimoEditor?: string
  tamanho: number
  status: 'ativo' | 'arquivado' | 'rascunho'
}

export interface EstatisticasDashboard {
  totalDocumentos: number
  documentosHoje: number
  ultimaAtualizado: Date
  areaMaisUsada?: string
  tempoMedioEdicao?: number
}

export interface AtalhoRapido {
  id: string
  titulo: string
  descricao: string
  icone: string
  pagina: string
  cor: string
}

export interface AtividadeRecente {
  id: string
  tipo: 'criacao' | 'edicao' | 'exportacao' | 'analise' | 'busca'
  descricao: string
  documento?: string
  data: Date
  usuario?: string
}

export interface CartaoInfo {
  titulo: string
  valor: string | number
  unidade?: string
  icone: string
  destaque: boolean
  acao?: () => void
}

export interface SessaoAtiva {
  id: string
  documento: string
  tipo: 'edicao' | 'analise' | 'busca'
  iniciadoEm: Date
  ultimaAtividade: Date
  status: 'ativa' | 'pausada' | 'finalizada'
}

export interface ConfiguracaoDashboard {
  mostrarEstatisticas: boolean
  mostrarAtividades: boolean
  mostrarAtalhos: boolean
  mostrarDocumentosRecentes: boolean
  itemsPorPagina: number
  ordenarPor: 'data' | 'nome' | 'area'
  filtroArea?: string
}
