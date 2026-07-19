/**
 * Tipos para Compartilhamento de Documentos
 */

export type PermissaoCompartilhamento = 'visualizar' | 'comentar' | 'editar'
export type TipoCompartilhamento = 'link' | 'email'

export interface CompartilhamentoDocumento {
  id: string
  documentoId: string
  tipo: TipoCompartilhamento
  permissao: PermissaoCompartilhamento
  chaveAcesso: string
  email?: string
  nome?: string
  dataCriacao: Date
  dataExpiracao?: Date
  ativo: boolean
  visualizacoes: number
  ultimaVisualizacao?: Date
}

export interface ResultadoCompartilhamento {
  sucesso: boolean
  mensagem: string
  compartilhamentoId?: string
  link?: string
}

export interface ResultadoDeletarCompartilhamento {
  sucesso: boolean
  mensagem: string
}

export interface VisualizacaoCompartilhado {
  id: string
  compartilhamentoId: string
  dataVisualizacao: Date
  enderecoIP?: string
  navegador?: string
}
