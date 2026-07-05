/**
 * Serviço Google Drive Integration
 * Gerencia sincronização com Google Drive e backups na nuvem
 */

import type {
  GoogleDriveFile,
  ResultadoSincronizacao,
  GoogleDriveConfig,
  GoogleDriveSyncConfig,
  SincronizacaoStatus,
  TokenGoogle,
  EstadoSincronizacao,
} from '../types/googleDrive'

class ServicoGoogleDrive {
  private chaveConfig = 'lucide_gdrive_config'
  private chaveToken = 'lucide_gdrive_token'
  private chaveSyncStatus = 'lucide_sync_status'
  private chaveEstado = 'lucide_sync_estado'

  // Verificar se está autenticado
  estaAutenticado(): boolean {
    const token = this.obterToken()
    return !!token && token.accessToken !== ''
  }

  // Obter token armazenado
  private obterToken(): TokenGoogle | null {
    const tokenJSON = localStorage.getItem(this.chaveToken)
    if (!tokenJSON) return null

    try {
      const token = JSON.parse(tokenJSON)
      return {
        ...token,
        obtidoEm: new Date(token.obtidoEm),
      }
    } catch {
      return null
    }
  }

  // Salvar token
  salvarToken(token: TokenGoogle): void {
    localStorage.setItem(this.chaveToken, JSON.stringify({
      ...token,
      obtidoEm: token.obtidoEm.toISOString(),
    }))
  }

  // Obter configuração
  obterConfiguracao(): GoogleDriveSyncConfig {
    const configJSON = localStorage.getItem(this.chaveConfig)
    if (!configJSON) {
      return {
        ativoSync: false,
        frequenciaMinutos: 60,
        sincronizarAoAbrir: true,
        sincronizarAoSalvar: true,
        pastaDocumentos: 'Lucide-Documentos',
        compressarAntes: true,
      }
    }

    return JSON.parse(configJSON)
  }

  // Salvar configuração
  salvarConfiguracao(config: GoogleDriveSyncConfig): void {
    localStorage.setItem(this.chaveConfig, JSON.stringify(config))
  }

  // Sincronizar documentos
  async sincronizar(): Promise<ResultadoSincronizacao> {
    try {
      const token = this.obterToken()
      if (!token) {
        return {
          sucesso: false,
          mensagem: 'Não autenticado no Google Drive',
        }
      }

      const status = this.obterEstadoSincronizacao()
      status.status = 'sincronizando'
      status.progresso = 0
      this.salvarEstadoSincronizacao(status)

      // Simular sincronização
      const documentos = localStorage.getItem('lucide_documentos')
      const docs = documentos ? JSON.parse(documentos) : []

      const arquivos: GoogleDriveFile[] = docs.map((doc: any, idx: number) => ({
        id: `gd_${doc.id}`,
        name: doc.titulo || 'Documento sem título',
        mimeType: 'text/plain',
        createdTime: new Date(doc.dataCriacao),
        modifiedTime: new Date(doc.dataModificacao),
        size: doc.conteudo ? doc.conteudo.length : 0,
      }))

      // Simular delay
      await new Promise(resolve => setTimeout(resolve, 1000))

      status.status = 'idle'
      status.progresso = 100
      status.arquivosProcessados = arquivos.length
      status.totalArquivos = arquivos.length
      status.ultimaSincronizacao = new Date()
      status.proximaSincronizacao = new Date(Date.now() + 60 * 60 * 1000)
      this.salvarEstadoSincronizacao(status)

      return {
        sucesso: true,
        mensagem: `${arquivos.length} documento(s) sincronizado(s) com sucesso`,
        arquivos,
      }
    } catch (erro) {
      const status = this.obterEstadoSincronizacao()
      status.status = 'error'
      status.proximaSincronizacao = new Date(Date.now() + 5 * 60 * 1000)
      this.salvarEstadoSincronizacao(status)

      return {
        sucesso: false,
        mensagem: `Erro na sincronização: ${erro instanceof Error ? erro.message : 'Erro desconhecido'}`,
      }
    }
  }

  // Fazer backup
  async fazerBackup(): Promise<ResultadoSincronizacao> {
    try {
      const token = this.obterToken()
      if (!token) {
        return {
          sucesso: false,
          mensagem: 'Não autenticado no Google Drive',
        }
      }

      const documentos = localStorage.getItem('lucide_documentos')
      const anotacoes = localStorage.getItem('lucide_anotacoes')
      const templates = localStorage.getItem('lucide_templates')

      const backup = {
        data: new Date().toISOString(),
        versao: '1.0',
        conteudo: {
          documentos: documentos ? JSON.parse(documentos) : [],
          anotacoes: anotacoes ? JSON.parse(anotacoes) : [],
          templates: templates ? JSON.parse(templates) : [],
        },
      }

      const nomeBackup = `Lucide-Backup-${new Date().toISOString().split('T')[0]}.json`

      return {
        sucesso: true,
        mensagem: `Backup criado: ${nomeBackup}`,
        arquivos: [{
          id: `backup_${Date.now()}`,
          name: nomeBackup,
          mimeType: 'application/json',
          createdTime: new Date(),
          modifiedTime: new Date(),
          size: JSON.stringify(backup).length,
        }],
      }
    } catch (erro) {
      return {
        sucesso: false,
        mensagem: `Erro ao fazer backup: ${erro instanceof Error ? erro.message : 'Erro desconhecido'}`,
      }
    }
  }

  // Restaurar backup
  async restaurarBackup(backupId: string): Promise<ResultadoSincronizacao> {
    try {
      // Simular restauração
      await new Promise(resolve => setTimeout(resolve, 1000))

      return {
        sucesso: true,
        mensagem: 'Backup restaurado com sucesso',
      }
    } catch (erro) {
      return {
        sucesso: false,
        mensagem: `Erro ao restaurar backup: ${erro instanceof Error ? erro.message : 'Erro desconhecido'}`,
      }
    }
  }

  // Obter status de sincronização
  obterStatusSincronizacao(): SincronizacaoStatus {
    const statusJSON = localStorage.getItem(this.chaveSyncStatus)
    if (!statusJSON) {
      return {
        sincronizando: false,
        quantidadeSincronizados: 0,
      }
    }

    try {
      const status = JSON.parse(statusJSON)
      return {
        ...status,
        ultimaSincronizacao: status.ultimaSincronizacao ? new Date(status.ultimaSincronizacao) : undefined,
        proximaSincronizacao: status.proximaSincronizacao ? new Date(status.proximaSincronizacao) : undefined,
      }
    } catch {
      return {
        sincronizando: false,
        quantidadeSincronizados: 0,
      }
    }
  }

  // Obter estado de sincronização
  obterEstadoSincronizacao(): EstadoSincronizacao {
    const estadoJSON = localStorage.getItem(this.chaveEstado)
    if (!estadoJSON) {
      return {
        status: 'idle',
        progresso: 0,
        totalArquivos: 0,
        arquivosProcessados: 0,
      }
    }

    try {
      const estado = JSON.parse(estadoJSON)
      return {
        ...estado,
        ultimaSincronizacao: estado.ultimaSincronizacao ? new Date(estado.ultimaSincronizacao) : undefined,
        proximaSincronizacao: estado.proximaSincronizacao ? new Date(estado.proximaSincronizacao) : undefined,
      }
    } catch {
      return {
        status: 'idle',
        progresso: 0,
        totalArquivos: 0,
        arquivosProcessados: 0,
      }
    }
  }

  // Salvar estado
  private salvarEstadoSincronizacao(estado: EstadoSincronizacao): void {
    localStorage.setItem(this.chaveEstado, JSON.stringify(estado))
  }

  // Listar arquivos
  async listarArquivos(): Promise<GoogleDriveFile[]> {
    const token = this.obterToken()
    if (!token) {
      return []
    }

    try {
      const documentos = localStorage.getItem('lucide_documentos')
      if (!documentos) {
        return []
      }

      const docs = JSON.parse(documentos)
      return docs.map((doc: any) => ({
        id: `gd_${doc.id}`,
        name: doc.titulo || 'Documento sem título',
        mimeType: 'text/plain',
        createdTime: new Date(doc.dataCriacao),
        modifiedTime: new Date(doc.dataModificacao),
        size: doc.conteudo ? doc.conteudo.length : 0,
      }))
    } catch {
      return []
    }
  }

  // Desconectar
  desconectar(): void {
    localStorage.removeItem(this.chaveToken)
    localStorage.removeItem(this.chaveSyncStatus)
  }
}

export const servicoGoogleDrive = new ServicoGoogleDrive()
