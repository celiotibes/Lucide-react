/**
 * Tipos para Analytics & Estatísticas
 */

export interface EstatisticasDocumento {
  totalDocumentos: number
  documentosAbertos: number
  documentosArquivados: number
  palavrasTotais: number
  caracteresTotais: number
  tamanhoMedioKB: number
  areaComMaisDocumentos: string
  tipoComMaisDocumentos: string
}

export interface EstatisticasLLM {
  totalRequisicoes: number
  totalTokensUsados: number
  custoTotal: number
  modeloMaisUsado: string
  latenciaMedia: number
  provedorMaisUsado: string
  requisicoesHoje: number
  custoHoje: number
}

export interface EstatisticasAnalise {
  totalAnalisesRAG: number
  totalPeticionesAnalisadas: number
  mediaFraquezasEncontradas: number
  mediaContraArgumentosGerados: number
  analiseComMaisProblemas: string
  taxaDeteccaoMedia: number
}

export interface EstatisticasUso {
  ultimaAtividadeEm: Date
  tempoMediaSessao: number
  paginavisitadas: number
  componentesMaisUsados: string[]
  usuariosAtivos: number
  taxaRetencaoSemanal: number
}

export interface DadosGrafico {
  labels: string[]
  datasets: {
    label: string
    data: number[]
    backgroundColor?: string
    borderColor?: string
  }[]
}

export interface ResultadoEstatisticas {
  sucesso: boolean
  documentos: EstatisticasDocumento
  llm: EstatisticasLLM
  analise: EstatisticasAnalise
  uso: EstatisticasUso
  periodo: {
    inicio: Date
    fim: Date
  }
}
