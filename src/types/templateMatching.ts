/**
 * Tipos de Correspondência de Modelos
 * Estruturas para busca e comparação de modelos jurídicos
 */

export interface ModeloJuridico {
  id: string
  titulo: string
  descricao: string
  areaJuridica: string
  tribunal: string
  resultado: 'favoravel' | 'desfavoravel' | 'acordo'
  dataDecisao: Date
  argumentosPrincipais: string[]
  estrutura: SecaoModelo[]
  taxaSucesso: number // percentual
  citacoes: string[]
  tags: string[]
}

export interface SecaoModelo {
  tipo: 'introducao' | 'fundamentos' | 'argumentacao' | 'pedidos' | 'conclusao'
  conteudo: string
  palavrasChave: string[]
  importancia: 'alta' | 'media' | 'baixa'
}

export interface ResultadoCorrespondencia {
  modeloId: string
  titulo: string
  pontuacao: number // 0-100
  similares: number
  secoesCorespondentes: CorrespondenciaSecao[]
  argumentosAplicaveis: string[]
  recomendacoes: string[]
  estruturaSugerida: string[]
}

export interface CorrespondenciaSecao {
  secaoModelo: SecaoModelo
  tipoSecao: string
  relevancia: number // 0-100
  sugestoes: string[]
}

export interface BuscaTemplateParams {
  areaJuridica: string
  tribunal?: string
  resultadoDesejado?: 'favoravel' | 'desfavoravel' | 'acordo'
  palavrasChave?: string[]
}

export interface BibliotecaModelos {
  totalModelos: number
  modelosPorArea: Record<string, number>
  modelosPorTribunal: Record<string, number>
  taxaSucessoMedia: number
}
