/**
 * Tipos para Google Drive Integration
 */

export interface GoogleDriveConfig {
  clientId: string
  clientSecret?: string
  redirectUri: string
  scope: string[]
  autenticar: boolean
}

export interface GoogleDriveFile {
  id: string
  name: string
  mimeType: string
  createdTime: Date
  modifiedTime: Date
  size: number
  webViewLink?: string
  owners?: { displayName: string; emailAddress: string }[]
  description?: string
}

export interface GoogleDriveSyncConfig {
  ativoSync: boolean
  frequenciaMinutos: number
  sincronizarAoAbrir: boolean
  sincronizarAoSalvar: boolean
  pastaDocumentos: string
  compressarAntes: boolean
}

export interface SincronizacaoStatus {
  sincronizando: boolean
  ultimaSincronizacao?: Date
  proximaSincronizacao?: Date
  quantidadeSincronizados: number
  erro?: string
}

export interface ResultadoSincronizacao {
  sucesso: boolean
  mensagem: string
  arquivos?: GoogleDriveFile[]
  erros?: { arquivo: string; erro: string }[]
}

export interface ConfiguracaoCloudBackup {
  ativoBackup: boolean
  frequenciaBackupHoras: number
  ultimoBackupEm?: Date
  proximoBackupEm?: Date
  tamanhoBackupMB: number
  localizacao: 'google-drive' | 'dropbox' | 'onedrive'
  versionamento: boolean
  numeroPreviasMax: number
  compressao: 'nenhuma' | 'zip' | 'gzip'
}

export interface TokenGoogle {
  accessToken: string
  refreshToken?: string
  expiresIn: number
  tokenType: string
  scope: string
  obtidoEm: Date
}

export interface EstadoSincronizacao {
  status: 'idle' | 'sincronizando' | 'error'
  progresso: number
  totalArquivos: number
  arquivosProcessados: number
  proximaSincronizacao?: Date
  ultimaSincronizacao?: Date
}
