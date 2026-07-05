/**
 * Contêiner de Notificações
 * Renderiza notificações como toasts no canto inferior direito
 */

import { useContext } from 'react'
import { NotificationContext } from '../../context/NotificationContext'
import './NotificationContainer.css'

export function NotificationContainer() {
  const context = useContext(NotificationContext)

  if (!context) {
    return null
  }

  const { notificacoes, removerNotificacao } = context

  const getIcone = (tipo: string) => {
    switch (tipo) {
      case 'sucesso':
        return '✓'
      case 'erro':
        return '✕'
      case 'aviso':
        return '⚠'
      case 'info':
        return 'ℹ'
      default:
        return '•'
    }
  }

  return (
    <div className="notification-container">
      {notificacoes.map(notif => (
        <div key={notif.id} className={`notification notification-${notif.tipo}`}>
          <div className="notification-icone">{getIcone(notif.tipo)}</div>
          <div className="notification-conteudo">
            <div className="notification-titulo">{notif.titulo}</div>
            {notif.mensagem && <div className="notification-mensagem">{notif.mensagem}</div>}
            {notif.acao && (
              <button
                className="notification-acao"
                onClick={() => {
                  notif.acao?.callback()
                  removerNotificacao(notif.id)
                }}
              >
                {notif.acao.label}
              </button>
            )}
          </div>
          {notif.dismissivel && (
            <button
              className="notification-fechar"
              onClick={() => removerNotificacao(notif.id)}
              aria-label="Fechar notificação"
            >
              ✕
            </button>
          )}
          <div
            className="notification-progress"
            style={{
              animation: `notification-fade ${notif.duracao}ms linear forwards`,
            }}
          />
        </div>
      ))}
    </div>
  )
}
