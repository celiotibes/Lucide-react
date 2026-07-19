/**
 * Context para Notificações Globais
 * Gerencia fila de notificações em toda a aplicação
 */

import { createContext, useState, useCallback, type ReactNode } from 'react'
import type { Notificacao } from '../types/notification'

interface NotificationContextType {
  notificacoes: Notificacao[]
  adicionarNotificacao: (notif: Omit<Notificacao, 'id' | 'timestamp'>) => string
  removerNotificacao: (id: string) => void
  limparTodas: () => void
}

export const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

interface NotificationProviderProps {
  children: ReactNode
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([])

  const adicionarNotificacao = useCallback((notif: Omit<Notificacao, 'id' | 'timestamp'>) => {
    const id = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const novaNotificacao: Notificacao = {
      ...notif,
      id,
      timestamp: new Date(),
      duracao: notif.duracao ?? 4000,
      dismissivel: notif.dismissivel ?? true,
    }

    setNotificacoes(prev => [...prev, novaNotificacao])

    if (novaNotificacao.duracao > 0) {
      setTimeout(() => {
        removerNotificacao(id)
      }, novaNotificacao.duracao)
    }

    return id
  }, [])

  const removerNotificacao = useCallback((id: string) => {
    setNotificacoes(prev => prev.filter(n => n.id !== id))
  }, [])

  const limparTodas = useCallback(() => {
    setNotificacoes([])
  }, [])

  return (
    <NotificationContext.Provider value={{ notificacoes, adicionarNotificacao, removerNotificacao, limparTodas }}>
      {children}
    </NotificationContext.Provider>
  )
}
