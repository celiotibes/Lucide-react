/**
 * PWA Install Prompt
 * Solicita instalação do aplicativo
 */

import { useState, useEffect } from 'react'
import { usePWA } from '../../hooks/usePWA'
import './PWAPrompt.css'

export function PWAPrompt() {
  const { canInstall, isInstalled, hasUpdate, installApp, updateApp } = usePWA()
  const [mostrarInstall, setMostrarInstall] = useState(false)
  const [mostrarUpdate, setMostrarUpdate] = useState(false)
  const [mostrarOffline, setMostrarOffline] = useState(false)

  useEffect(() => {
    if (canInstall && !isInstalled) {
      setMostrarInstall(true)
    }
  }, [canInstall, isInstalled])

  useEffect(() => {
    if (hasUpdate) {
      setMostrarUpdate(true)
    }
  }, [hasUpdate])

  useEffect(() => {
    const handleOffline = () => setMostrarOffline(true)
    const handleOnline = () => setMostrarOffline(false)

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)

    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  return (
    <>
      {/* Install Prompt */}
      {mostrarInstall && (
        <div className="pwa-prompt pwa-install">
          <div className="pwa-content">
            <div className="pwa-icon">📱</div>
            <div className="pwa-texto">
              <div className="pwa-titulo">Instalar Lucide-react</div>
              <div className="pwa-descricao">Acesse a plataforma jurídica offline em qualquer lugar</div>
            </div>
          </div>
          <div className="pwa-acoes">
            <button
              className="pwa-btn-primario"
              onClick={async () => {
                const sucesso = await installApp()
                if (sucesso) {
                  setMostrarInstall(false)
                }
              }}
            >
              Instalar
            </button>
            <button
              className="pwa-btn-secundario"
              onClick={() => setMostrarInstall(false)}
            >
              Depois
            </button>
          </div>
        </div>
      )}

      {/* Update Prompt */}
      {mostrarUpdate && (
        <div className="pwa-prompt pwa-update">
          <div className="pwa-content">
            <div className="pwa-icon">🔄</div>
            <div className="pwa-texto">
              <div className="pwa-titulo">Atualização Disponível</div>
              <div className="pwa-descricao">Nova versão com melhorias e correções</div>
            </div>
          </div>
          <div className="pwa-acoes">
            <button
              className="pwa-btn-primario"
              onClick={() => {
                updateApp()
                setMostrarUpdate(false)
              }}
            >
              Atualizar
            </button>
            <button
              className="pwa-btn-secundario"
              onClick={() => setMostrarUpdate(false)}
            >
              Depois
            </button>
          </div>
        </div>
      )}

      {/* Offline Indicator */}
      {mostrarOffline && (
        <div className="pwa-prompt pwa-offline">
          <div className="pwa-content">
            <div className="pwa-icon">📡</div>
            <div className="pwa-texto">
              <div className="pwa-titulo">Modo Offline</div>
              <div className="pwa-descricao">Você está operando em modo offline. Dados em cache estão disponíveis.</div>
            </div>
          </div>
          <button
            className="pwa-btn-fechar"
            onClick={() => setMostrarOffline(false)}
          >
            ✕
          </button>
        </div>
      )}
    </>
  )
}
