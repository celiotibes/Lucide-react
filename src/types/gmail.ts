/**
 * Tipos para integração com Gmail
 */

export interface ConfiguracaoGmail {
  clientId: string
  clientSecret?: string
  redirectUri: string
  scope: string[]
  autenticar: boolean
}

export interface MensagemGmail {
  id: string
  threadId: string
  remetente: {
    nome: string
    email: string
  }
  assunto: string
  corpo: string
  data: Date
  naoLida: boolean
  temAnexos: boolean
  labels: string[]
  importante: boolean
}

export interface AnexoGmail {
  id: string
  nomeArquivo: string
  mimeType: string
  tamanhoBytes: number
  dados?: string // base64 encoded
}

export interface TokenGmail {
  accessToken: string
  refreshToken?: string
  expiresIn: number
  tokenType: string
  scope: string
  obtidoEm: Date
}

export interface ResultadoBuscaGmail {
  sucesso: boolean
  mensagem: string
  mensagens?: MensagemGmail[]
  total?: number
  erros?: { assunto: string; erro: string }[]
}

export interface ConfiguracaoSincronizacaoGmail {
  ativaSincronizacao: boolean
  frequenciaMinutos: number
  sincronizarAoAbrir: boolean
  filtroLabels: string[]
  baixarAnexos: boolean
  marcarComoLida: boolean
}

export interface EstadoSincronizacaoGmail {
  status: 'idle' | 'sincronizando' | 'error'
  progresso: number
  totalMensagens: number
  mensagensProcessadas: number
  ultimaSincronizacao?: Date
  proximaSincronizacao?: Date
  erroUltimo?: string
}

export interface ReferenceExtraida {
  tipo: 'legislacao' | 'jurisprudencia' | 'doutrina' | 'caso' | 'artigo'
  titulo: string
  fonte: string
  dataPublicacao?: Date
  resumo?: string
  link?: string
  emailOrigem: string
}
