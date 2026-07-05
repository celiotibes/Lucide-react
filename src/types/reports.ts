/**
 * Tipos para Sistema de Relatórios
 */

export type TipoRelatorio = 'peticio' | 'analise-estrategica' | 'resultado-predicao' | 'anotacoes-documento' | 'estatisticas-uso'

export type FormatoRelatorio = 'pdf' | 'docx' | 'html' | 'markdown' | 'json'

export type SecaoRelatorio =
  | 'resumo'
  | 'conteudo'
  | 'metadados'
  | 'analise'
  | 'recomendacoes'
  | 'graficos'
  | 'anexos'
  | 'assinatura'

export interface ConfiguracaoRelatorio {
  titulo: string
  descricao?: string
  tipo: TipoRelatorio
  formato: FormatoRelatorio
  secoes: SecaoRelatorio[]
  incluirCapaRelatorio: boolean
  incluirIndiceConteudo: boolean
  incluirRodape: boolean
  incluirNumeroPagina: boolean
  autor?: string
  empresa?: string
  logotipo?: string
  dataGeracao: boolean
  confidencial: boolean
}

export interface Relatorio {
  id: string
  titulo: string
  tipo: TipoRelatorio
  conteudo: string
  html?: string
  metadados: RelatorioMetadados
  dataCriacao: Date
  dataModificacao: Date
  autor?: string
  documentoId?: string
  tamanho: number
  favorito?: boolean
}

export interface RelatorioMetadados {
  titulo: string
  autor: string
  descricao?: string
  palavrasChave?: string[]
  versao: string
  empresa?: string
  confidencial: boolean
  dataGeracao: Date
  dataVencimento?: Date
}

export interface ResultadoRelatorio {
  sucesso: boolean
  mensagem: string
  relatorioId?: string
  conteudo?: string
}

export interface TemplateRelatorio {
  id: string
  nome: string
  descricao: string
  tipo: TipoRelatorio
  configuracao: ConfiguracaoRelatorio
  dataCriacao: Date
  vezes_usado: number
}
