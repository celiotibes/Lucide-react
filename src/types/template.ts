/**
 * Tipos para Templates de Documentos
 */

export interface TemplateDocumento {
  id: string
  nome: string
  descricao: string
  categoria: 'editorial' | 'contrato' | 'petição' | 'parecer' | 'memorando' | 'outro'
  areaJuridica: string
  conteudo: string
  html?: string
  tags: string[]
  dataCriacao: Date
  dataModificacao: Date
  autor: string
  vezes_usado: number
  ativo: boolean
}

export interface ResultadoSaveTemplate {
  sucesso: boolean
  mensagem: string
  templateId?: string
}

export interface ResultadoDeleteTemplate {
  sucesso: boolean
  mensagem: string
}
