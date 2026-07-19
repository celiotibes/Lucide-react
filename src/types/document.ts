/**
 * Tipos de Documentos
 * Estrutura de dados para petições e análises
 */

export interface Documento {
  id: string
  titulo: string
  tipo: 'editor' | 'editor-novo' | 'analise' | 'transformacao'
  areaJuridica: string
  conteudo: string
  html?: string
  dataCriacao: Date
  dataModificacao: Date
  autor: string
  status: 'ativo' | 'rascunho' | 'arquivado'
  tags: string[]
  metadata?: {
    numeroProcesso?: string
    tribunal?: string
    partes?: string[]
    resumo?: string
  }
  versoes: VersaoDocumento[]
}

export interface VersaoDocumento {
  id: string
  numero: number
  dataCriacao: Date
  conteudo: string
  html?: string
  descricao: string
  autor: string
  tamanho: number
}

export interface DocumentoSalvo {
  id: string
  titulo: string
  tipo: 'editor' | 'editor-novo' | 'analise' | 'transformacao'
  areaJuridica: string
  dataCriacao: string
  dataModificacao: string
  status: 'ativo' | 'rascunho' | 'arquivado'
  tamanho: number
  versoes: number
}

export interface ResultadoSave {
  sucesso: boolean
  documentoId: string
  timestamp: Date
  versao: number
  mensagem?: string
}

export interface OpcoesCriacao {
  titulo: string
  tipo: 'editor' | 'editor-novo' | 'analise' | 'transformacao'
  areaJuridica: string
  conteudoInicial?: string
  autor?: string
}

export interface OpcoesCarregamento {
  incluirVersoes?: boolean
  incluirMetadata?: boolean
}

export interface ConfiguracaoDocumento {
  autoSaveIntervalo: number
  maxVersoes: number
  maxTamanoArquivo: number
  formatoPadrao: 'html' | 'markdown' | 'plaintext'
}

export interface EstatisticasDocumento {
  totalPalavras: number
  totalCaracteres: number
  totalLinhas: number
  paragrafos: number
  tempoEscrita: number
}
