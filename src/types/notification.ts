/**
 * Tipos para Sistema de Notificações
 */

export type TipoNotificacao = 'sucesso' | 'erro' | 'aviso' | 'info'

export interface Notificacao {
  id: string
  tipo: TipoNotificacao
  titulo: string
  mensagem?: string
  duracao?: number
  acao?: {
    label: string
    callback: () => void
  }
  dismissivel?: boolean
  timestamp: Date
}

export interface ResultadoNotificacao {
  id: string
  tipo: TipoNotificacao
}

export interface EstruturaNotificacoes {
  notificacoes: Notificacao[]
  adicionarNotificacao: (notif: Omit<Notificacao, 'id' | 'timestamp'>) => ResultadoNotificacao
  removerNotificacao: (id: string) => void
  limparTodas: () => void
}
