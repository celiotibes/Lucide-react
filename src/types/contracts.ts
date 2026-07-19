// Tipos para Gestão de Contratos Imobiliários

export type ContractType = 'aluguel' | 'venda' | 'locacao-comercial' | 'outro'
export type DocumentType = 'contrato' | 'renovacao' | 'aditivo' | 'vistoria' | 'outro'
export type AnalysisStatus = 'pendente' | 'processando' | 'concluido' | 'erro' | 'validando'

// Documento de Contrato
export interface ContractDocument {
  id: string
  fileName: string
  fileType: 'pdf' | 'docx' | 'jpg' | 'png' | 'txt'
  fileSizeKB: number
  uploadDate: Date
  documentType: DocumentType
  contractType: ContractType
  rawText?: string // Texto extraído
  markdownText?: string // Markdown para IA
  uploadedBy: string
  status: AnalysisStatus
}

// Dados Extraídos do Contrato
export interface ExtractedContractData {
  // Identificação
  partes: {
    locador?: string
    locatario?: string
    imobiliaria?: string
  }

  // Imóvel
  imovel: {
    endereco?: string
    complemento?: string
    cep?: string
    cidade?: string
    estado?: string
    tipo?: string // 'apartamento', 'casa', etc
  }

  // Valores
  valores: {
    aluguel?: number
    caução?: number
    taxa_administracao?: number
    seguro_incendio?: number
    iptu?: number
    outras_despesas?: number
  }

  // Datas
  datas: {
    data_inicio?: string // ISO string
    data_fim?: string
    data_renovacao?: string
    dia_vencimento_aluguel?: number
  }

  // Índices de Atualização
  indices: {
    indice_tipo?: string // 'IPCA', 'IGP-M', 'outro'
    indice_anual?: number // % de atualização anual
    mes_reajuste?: number
  }

  // Cláusulas Importantes
  clausulas: {
    permite_animais?: boolean
    permite_reforma?: boolean
    fianca_obrigatoria?: boolean
    avalista_obrigatorio?: boolean
    multa_rescisao?: number
    dias_aviso_previo?: number
  }

  // Custos Obrigatórios
  custos_obrigatorios: string[]

  // Questões para Validação Manual
  questoes_validacao: string[]

  // Resumo Executivo
  resumo?: string
}

// Análise de Contrato
export interface ContractAnalysis {
  id: string
  documentId: string
  dataAnalise: Date
  status: AnalysisStatus
  dadosExtraidos: ExtractedContractData
  confiancaExtracao: number // 0-100
  errosDetectados: string[]
  avisos: string[] // Cláusulas incomuns, valores fora do padrão, etc
  analista: string
  dataValidacao?: Date
  validado: boolean
  observacoes?: string
}

// Comparação de Renovação
export interface RenewalComparison {
  id: string
  contratoOriginal: ContractAnalysis
  renovacao: ContractAnalysis
  mudancas: {
    aluguel_novo?: number
    aluguel_anterior?: number
    percentual_aumento?: number
    novas_clausulas?: string[]
    clausulas_removidas?: string[]
  }
  alertas: string[]
}

// Relatório de Vistoria
export interface InspectionReport {
  id: string
  documentId: string
  dataVistoria: Date
  tipo: 'entrada' | 'saida' | 'problemas'
  achados: {
    titulo: string
    descricao: string
    impacto?: 'baixo' | 'medio' | 'alto'
    foto?: string // base64 ou URL
  }[]
  resumo?: string
}

// Dashboard de Contratos
export interface ContractSummary {
  id: string
  tipo: ContractType
  documentType: DocumentType
  partes: {
    locador?: string
    locatario?: string
  }
  imovel_endereco?: string
  aluguel_atual?: number
  data_inicio?: string
  data_fim?: string
  dias_para_vencimento?: number
  status_validacao: 'validado' | 'pendente' | 'erro'
  proxima_acao?: string
}

// Armazenamento em localStorage
export interface ContractStorage {
  documentos: ContractDocument[]
  analises: ContractAnalysis[]
  renovacoes: RenewalComparison[]
  vistorias: InspectionReport[]
  ultimaAtualizacao: Date
}
