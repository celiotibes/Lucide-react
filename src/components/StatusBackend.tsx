/**
 * Componente: StatusBackend
 * 
 * Exibe status de conexão com backend
 * Verde: Online
 * Vermelho: Offline
 * Amarelo: Carregando
 * 
 * Uso:
 * <StatusBackend />
 */

import { useEffect, useState } from 'react'
import useFetch from '@/hooks/useFetch'

interface BackendStatus {
  status: string
  service: string
  version: string
  timestamp: string
}

export function StatusBackend() {
  const { data, loading, error, fetch } = useFetch<BackendStatus>()
  const [isOnline, setIsOnline] = useState(false)

  useEffect(() => {
    // Verificar status inicial
    const checkStatus = async () => {
      try {
        await fetch('/health')
        setIsOnline(true)
      } catch {
        setIsOnline(false)
      }
    }

    checkStatus()

    // Verificar a cada 30 segundos
    const interval = setInterval(checkStatus, 30000)

    return () => clearInterval(interval)
  }, [fetch])

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={{ ...styles.indicator, backgroundColor: '#FFC107' }} />
        <span style={styles.text}>Backend: Verificando...</span>
      </div>
    )
  }

  return (
    <div style={styles.container} title={error ? error.message : 'Backend online'}>
      <div
        style={{
          ...styles.indicator,
          backgroundColor: isOnline ? '#4CAF50' : '#F44336',
        }}
      />
      <span style={styles.text}>
        Backend: {isOnline ? '✅ Online' : '❌ Offline'}
      </span>
      {!isOnline && error && (
        <span style={styles.error}>{error.message}</span>
      )}
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    fontSize: '12px',
    fontFamily: 'monospace',
  } as React.CSSProperties,
  indicator: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    animation: 'pulse 2s infinite',
  } as React.CSSProperties,
  text: {
    color: '#666',
  } as React.CSSProperties,
  error: {
    color: '#F44336',
    marginLeft: '8px',
    fontSize: '10px',
  } as React.CSSProperties,
}

export default StatusBackend
