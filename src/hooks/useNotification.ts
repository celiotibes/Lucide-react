/**
 * Hook para usar notificações globais
 * Fornece métodos simplificados para cada tipo de notificação
 */

import { useContext } from 'react'
import { NotificationContext } from '../context/NotificationContext'
import type { Notificacao } from '../types/notification'

export function useNotification() {
  const context = useContext(NotificationContext)

  if (!context) {
    throw new Error('useNotification deve ser usado dentro de NotificationProvider')
  }

  const { adicionarNotificacao, removerNotificacao, limparTodas } = context

  return {
    sucesso: (titulo: string, mensagem?: string, duracao?: number) =>
      adicionarNotificacao({ tipo: 'sucesso', titulo, mensagem, duracao }),

    erro: (titulo: string, mensagem?: string, duracao?: number) =>
      adicionarNotificacao({ tipo: 'erro', titulo, mensagem, duracao: duracao ?? 6000 }),

    aviso: (titulo: string, mensagem?: string, duracao?: number) =>
      adicionarNotificacao({ tipo: 'aviso', titulo, mensagem, duracao }),

    info: (titulo: string, mensagem?: string, duracao?: number) =>
      adicionarNotificacao({ tipo: 'info', titulo, mensagem, duracao }),

    comAcao: (notif: Omit<Notificacao, 'id' | 'timestamp'>) =>
      adicionarNotificacao(notif),

    remover: removerNotificacao,

    limpar: limparTodas,
  }
}
