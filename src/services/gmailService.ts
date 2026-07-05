/**
 * Serviço Gmail Integration
 * Gerencia sincronização com Gmail e extração de referências jurídicas
 */

import type {
  MensagemGmail,
  ResultadoBuscaGmail,
  ConfiguracaoSincronizacaoGmail,
  EstadoSincronizacaoGmail,
  TokenGmail,
  ReferenceExtraida,
} from '../types/gmail'

class ServicoGmail {
  private chaveConfig = 'lucide_gmail_config'
  private chaveToken = 'lucide_gmail_token'
  private chaveSyncStatus = 'lucide_gmail_sync_status'
  private chaveEstado = 'lucide_gmail_estado'
  private chaveReferences = 'lucide_gmail_references'

  // Verificar se está autenticado
  estaAutenticado(): boolean {
    const token = this.obterToken()
    return !!token && token.accessToken !== ''
  }

  // Obter token armazenado
  private obterToken(): TokenGmail | null {
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
  salvarToken(token: TokenGmail): void {
    localStorage.setItem(this.chaveToken, JSON.stringify({
      ...token,
      obtidoEm: token.obtidoEm.toISOString(),
    }))
  }

  // Obter configuração
  obterConfiguracao(): ConfiguracaoSincronizacaoGmail {
    const configJSON = localStorage.getItem(this.chaveConfig)
    if (!configJSON) {
      return {
        ativaSincronizacao: false,
        frequenciaMinutos: 30,
        sincronizarAoAbrir: true,
        filtroLabels: ['INBOX'],
        baixarAnexos: false,
        marcarComoLida: false,
      }
    }

    return JSON.parse(configJSON)
  }

  // Salvar configuração
  salvarConfiguracao(config: ConfiguracaoSincronizacaoGmail): void {
    localStorage.setItem(this.chaveConfig, JSON.stringify(config))
  }

  // Buscar mensagens
  async buscarMensagens(query: string = ''): Promise<ResultadoBuscaGmail> {
    try {
      const token = this.obterToken()
      if (!token) {
        return {
          sucesso: false,
          mensagem: 'Não autenticado no Gmail',
        }
      }

      // Simular busca de mensagens
      const mensagensSimuladas: MensagemGmail[] = [
        {
          id: 'msg_1',
          threadId: 'thread_1',
          remetente: {
            nome: 'Legal Database',
            email: 'info@legaldatabase.com',
          },
          assunto: 'Jurisprudência: STF sobre direitos autorais',
          corpo: 'Nova decisão do STF sobre direitos autorais em plataformas digitais...',
          data: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          naoLida: false,
          temAnexos: true,
          labels: ['INBOX', 'JURISPRUDENCIA'],
          importante: true,
        },
        {
          id: 'msg_2',
          threadId: 'thread_2',
          remetente: {
            nome: 'Research Portal',
            email: 'research@portal.com',
          },
          assunto: 'Análise: Lei de Proteção de Dados - LGPD',
          corpo: 'Análise comparativa LGPD vs GDPR para conformidade...',
          data: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          naoLida: true,
          temAnexos: false,
          labels: ['INBOX', 'LEGISLACAO'],
          importante: false,
        },
      ]

      return {
        sucesso: true,
        mensagem: `${mensagensSimuladas.length} mensagem(ns) encontrada(s)`,
        mensagens: mensagensSimuladas,
        total: mensagensSimuladas.length,
      }
    } catch (erro) {
      return {
        sucesso: false,
        mensagem: `Erro ao buscar mensagens: ${erro instanceof Error ? erro.message : 'Erro desconhecido'}`,
      }
    }
  }

  // Sincronizar mensagens
  async sincronizar(): Promise<ResultadoBuscaGmail> {
    try {
      const token = this.obterToken()
      if (!token) {
        return {
          sucesso: false,
          mensagem: 'Não autenticado no Gmail',
        }
      }

      const config = this.obterConfiguracao()
      const estado = this.obterEstadoSincronizacao()

      estado.status = 'sincronizando'
      estado.progresso = 0
      this.salvarEstadoSincronizacao(estado)

      // Simular delay de sincronização
      await new Promise(resolve => setTimeout(resolve, 1500))

      const resultado = await this.buscarMensagens()

      if (resultado.sucesso && resultado.mensagens) {
        estado.status = 'idle'
        estado.progresso = 100
        estado.totalMensagens = resultado.mensagens.length
        estado.mensagensProcessadas = resultado.mensagens.length
        estado.ultimaSincronizacao = new Date()
        estado.proximaSincronizacao = new Date(Date.now() + config.frequenciaMinutos * 60 * 1000)

        // Extrair referências
        this.extrairReferenciasMensagens(resultado.mensagens)
      } else {
        estado.status = 'error'
        estado.erroUltimo = resultado.mensagem
      }

      this.salvarEstadoSincronizacao(estado)
      return resultado
    } catch (erro) {
      const estado = this.obterEstadoSincronizacao()
      estado.status = 'error'
      estado.erroUltimo = erro instanceof Error ? erro.message : 'Erro desconhecido'
      this.salvarEstadoSincronizacao(estado)

      return {
        sucesso: false,
        mensagem: `Erro na sincronização: ${estado.erroUltimo}`,
      }
    }
  }

  // Extrair referências das mensagens
  private extrairReferenciasMensagens(mensagens: MensagemGmail[]): void {
    const references: ReferenceExtraida[] = []

    for (const msg of mensagens) {
      // Simular extração de referências do corpo da mensagem
      if (msg.labels.includes('JURISPRUDENCIA')) {
        references.push({
          tipo: 'jurisprudencia',
          titulo: msg.assunto,
          fonte: `${msg.remetente.nome} (${msg.remetente.email})`,
          dataPublicacao: msg.data,
          resumo: msg.corpo.substring(0, 200),
          emailOrigem: msg.id,
        })
      } else if (msg.labels.includes('LEGISLACAO')) {
        references.push({
          tipo: 'legislacao',
          titulo: msg.assunto,
          fonte: `${msg.remetente.nome} (${msg.remetente.email})`,
          dataPublicacao: msg.data,
          resumo: msg.corpo.substring(0, 200),
          emailOrigem: msg.id,
        })
      } else if (msg.labels.includes('DOUTRINA')) {
        references.push({
          tipo: 'doutrina',
          titulo: msg.assunto,
          fonte: `${msg.remetente.nome} (${msg.remetente.email})`,
          dataPublicacao: msg.data,
          resumo: msg.corpo.substring(0, 200),
          emailOrigem: msg.id,
        })
      }
    }

    if (references.length > 0) {
      const referenciasExistentes = this.obterReferenciasExtraidas()
      const novasReferencias = [
        ...referenciasExistentes,
        ...references,
      ]
      localStorage.setItem(this.chaveReferences, JSON.stringify(novasReferencias))
    }
  }

  // Obter status de sincronização
  obterStatusSincronizacao() {
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
  obterEstadoSincronizacao(): EstadoSincronizacaoGmail {
    const estadoJSON = localStorage.getItem(this.chaveEstado)
    if (!estadoJSON) {
      return {
        status: 'idle',
        progresso: 0,
        totalMensagens: 0,
        mensagensProcessadas: 0,
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
        totalMensagens: 0,
        mensagensProcessadas: 0,
      }
    }
  }

  // Salvar estado
  private salvarEstadoSincronizacao(estado: EstadoSincronizacaoGmail): void {
    localStorage.setItem(this.chaveEstado, JSON.stringify(estado))
  }

  // Obter referências extraídas
  obterReferenciasExtraidas(): ReferenceExtraida[] {
    const refJSON = localStorage.getItem(this.chaveReferences)
    if (!refJSON) {
      return []
    }

    try {
      const refs = JSON.parse(refJSON)
      return refs.map((ref: any) => ({
        ...ref,
        dataPublicacao: ref.dataPublicacao ? new Date(ref.dataPublicacao) : undefined,
      }))
    } catch {
      return []
    }
  }

  // Limpar referências extraídas
  limparReferencias(): void {
    localStorage.removeItem(this.chaveReferences)
  }

  // Desconectar
  desconectar(): void {
    localStorage.removeItem(this.chaveToken)
    localStorage.removeItem(this.chaveSyncStatus)
    localStorage.removeItem(this.chaveEstado)
  }
}

export const servicoGmail = new ServicoGmail()
