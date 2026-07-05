/**
 * Tipos de Exportação e Geração de Relatórios
 * Suporte para múltiplos formatos de saída
 */

export type FormatoExportacao = 'pdf' | 'docx' | 'json' | 'markdown'

export interface OpcoesExportacao {
  formato: FormatoExportacao
  titulo: string
  incluirCapa: boolean
  incluirTabelaConteudos: boolean
  incluirReferencias: boolean
  incluirMetadados: boolean
  incluirAnalise: boolean
  orientacao: 'portrait' | 'landscape'
  tamanhoFonte: 'pequena' | 'normal' | 'grande'
  idioma: 'pt-BR' | 'en-US' | 'es-ES'
}

export interface MetadadosDocumento {
  titulo: string
  autor: string
  dataAtualizacao: Date
  versao: string
  areaJuridica: string
  partes?: string[]
  numeroProcesso?: string
  tribunal?: string
  tags: string[]
  resumo?: string
}

export interface CapaRelatorio {
  titulo: string
  autor: string
  data: Date
  tribunal?: string
  numeroProcesso?: string
  areaJuridica: string
}

export interface TabelaConteudos {
  habilitada: boolean
  nivelMaximo: number
  paginasAutomaticas: boolean
}

export interface ReferenciaRelatorio {
  id: string
  tipo: 'jurisprudencia' | 'legislacao' | 'doutrina'
  titulo: string
  autor?: string
  data: Date
  url?: string
  tribunal?: string
  numero?: string
  citacao: string
}

export interface EstatisticasRelatorio {
  totalPaginas: number
  totalPalavras: number
  totalCaracteres: number
  totalReferencias: number
  tempoGeracao: number
  tamanhoArquivo: number
}

export interface ResumoExecutivo {
  habilitado: boolean
  conteudo: string
  enfase: string[]
  conclusoes: string[]
  recomendacoes: string[]
}

export interface AnaliseRelatorio {
  foco: 'peticion' | 'jurisprudencia' | 'legislacao' | 'comparativa'
  secoes: SecaoAnalise[]
  tabelas: TabelaRelatorio[]
  graficos: GraficoRelatorio[]
  conclusoes: string[]
}

export interface SecaoAnalise {
  titulo: string
  conteudo: string
  subsecoes?: SecaoAnalise[]
  enfase?: string[]
  citacoes?: string[]
}

export interface TabelaRelatorio {
  titulo: string
  colunas: string[]
  dados: Record<string, unknown>[]
  destaque?: string[]
}

export interface GraficoRelatorio {
  tipo: 'linha' | 'barra' | 'pizza' | 'dispersao'
  titulo: string
  dados: Record<string, unknown>[]
  eixoX?: string
  eixoY?: string
}

export interface ConfiguracaoExportacao {
  formatosPadrao: FormatoExportacao[]
  includirCapaPadrao: boolean
  includirTabelaPadrao: boolean
  includirMetadadosPadrao: boolean
  tamanhoFontePadrao: 'pequena' | 'normal' | 'grande'
  orientacaoPadrao: 'portrait' | 'landscape'
  idiomaPadrao: 'pt-BR' | 'en-US' | 'es-ES'
  maxTamanoArquivo: number
  timeoutExportacao: number
  salvarHistorico: boolean
}

export interface HistoricoExportacao {
  id: string
  dataHora: Date
  documento: string
  formato: FormatoExportacao
  tamano: number
  status: 'sucesso' | 'erro' | 'cancelado'
  erro?: string
}

export interface TemplateRelatorio {
  id: string
  nome: string
  descricao: string
  tipo: 'peticion' | 'analise' | 'comparativa' | 'customizado'
  opcoes: Partial<OpcoesExportacao>
  criado: Date
  modificado: Date
  favorito: boolean
  uso: number
}

export interface ResultadoExportacao {
  sucesso: boolean
  arquivo?: Blob
  nomeArquivo: string
  formato: FormatoExportacao
  tamanho: number
  tempo: number
  mensagem?: string
  erro?: string
}
