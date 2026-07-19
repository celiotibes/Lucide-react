/**
 * Tipos para Anotações e Comentários em Documentos
 */

export type TipoAnotacao = 'comentario' | 'destaque' | 'bookmark' | 'duvida' | 'aprovo'

export interface Anotacao {
  id: string
  documentoId: string
  tipo: TipoAnotacao
  conteudo: string
  posicao?: number
  textoselecionado?: string
  autor: string
  dataCriacao: Date
  dataModificacao: Date
  resolvida: boolean
}

export interface Comentario {
  id: string
  anotacaoId: string
  conteudo: string
  autor: string
  dataCriacao: Date
}

export interface ResultadoAnotacao {
  sucesso: boolean
  mensagem: string
  anotacaoId?: string
}

export interface ResultadoDeleteAnotacao {
  sucesso: boolean
  mensagem: string
}

export interface EstatisticasAnotacoes {
  totalAnotacoes: number
  totalComentarios: number
  anotacoesResolvidas: number
  anotacoesPendentes: number
  porTipo: Record<TipoAnotacao, number>
}
