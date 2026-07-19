// Hook para gerenciar configuração da Claude API
// FASE 11: Claude API Configuration

import { useState, useEffect } from 'react'
import { ClaudeApiService } from '../services/claudeApiService'

const STORAGE_KEY = 'claude_api_config'

interface ClaudeConfig {
  apiKey: string
  isConfigured: boolean
}

export function useClaudeApiConfig() {
  const [config, setConfig] = useState<ClaudeConfig>({
    apiKey: '',
    isConfigured: false,
  })
  const [loading, setLoading] = useState(true)

  // Carrega configuração do localStorage ao montar
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setConfig({
          apiKey: parsed.apiKey || '',
          isConfigured: !!parsed.apiKey,
        })
        // Aplica ao serviço
        if (parsed.apiKey) {
          ClaudeApiService.setApiKey(parsed.apiKey)
        }
      } catch (err) {
        console.error('Erro ao carregar configuração Claude:', err)
      }
    }
    setLoading(false)
  }, [])

  // Salva configuração
  const saveConfig = (apiKey: string) => {
    const newConfig = {
      apiKey,
      isConfigured: !!apiKey,
    }
    setConfig(newConfig)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig))
    ClaudeApiService.setApiKey(apiKey)
  }

  // Limpa configuração
  const clearConfig = () => {
    setConfig({ apiKey: '', isConfigured: false })
    localStorage.removeItem(STORAGE_KEY)
    ClaudeApiService.setApiKey('')
  }

  return {
    config,
    loading,
    saveConfig,
    clearConfig,
  }
}
