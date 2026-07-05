/**
 * Tipos para PDF Export Avançado
 */

export type TamanhoPagina = 'A4' | 'A3' | 'Letter' | 'Legal'
export type OrientacaoPagina = 'portrait' | 'landscape'
export type QualidadeImagem = 'baixa' | 'media' | 'alta'

export interface OpcoesPDFExport {
  tamanho: TamanhoPagina
  orientacao: OrientacaoPagina
  incluirCapa: boolean
  incluirIndice: boolean
  incluirRodape: boolean
  incluirNumeroPagina: boolean
  incluirAssinatura: boolean
  assinatura?: string
  margemTop: number
  margemBottom: number
  margemLeft: number
  margemRight: number
  qualidadeImagem: QualidadeImagem
  comprimido: boolean
  senha?: string
}

export interface CapaDocumento {
  titulo: string
  subtitulo: string
  autor: string
  data: Date
  areaJuridica: string
  tipo: string
}

export interface ResultadoPDFExport {
  sucesso: boolean
  mensagem: string
  nomeArquivo?: string
  tamanhoKB?: number
}
