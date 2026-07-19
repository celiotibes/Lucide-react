// Configuração da Claude API para análise de contratos
// FASE 11: Claude API Setup Component

import { useState } from 'react'
import { useClaudeApiConfig } from '../../hooks/useClaudeApiConfig'
import './ClaudeApiConfig.css'

export function ClaudeApiConfig() {
  const { config, saveConfig, clearConfig } = useClaudeApiConfig()
  const [apiKey, setApiKey] = useState(config.apiKey)
  const [mostrarChave, setMostrarChave] = useState(false)
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)

  const handleSalvar = () => {
    if (!apiKey.trim()) {
      setMensagem({ tipo: 'erro', texto: 'API Key não pode estar vazia' })
      return
    }

    if (!apiKey.startsWith('sk-')) {
      setMensagem({ tipo: 'erro', texto: 'API Key deve começar com sk-' })
      return
    }

    saveConfig(apiKey)
    setMensagem({ tipo: 'sucesso', texto: 'Configuração salva com sucesso!' })
    setTimeout(() => setMensagem(null), 3000)
  }

  const handleLimpar = () => {
    if (confirm('Tem certeza que deseja remover a configuração da Claude API?')) {
      clearConfig()
      setApiKey('')
      setMensagem({ tipo: 'sucesso', texto: 'Configuração removida' })
      setTimeout(() => setMensagem(null), 3000)
    }
  }

  return (
    <div className="claude-api-config">
      <div className="config-card">
        <h3>⚙️ Configuração da Claude API</h3>
        <p className="description">
          Configure sua API Key da Anthropic para ativar análise automática de contratos com IA em tempo real.
        </p>

        {/* Status */}
        <div className={`status-badge ${config.isConfigured ? 'configured' : 'not-configured'}`}>
          {config.isConfigured ? '✅ Configurada' : '⚠️ Não configurada'}
        </div>

        {/* API Key Input */}
        <div className="config-group">
          <label htmlFor="api-key">API Key (sk-...)</label>
          <div className="input-group">
            <input
              id="api-key"
              type={mostrarChave ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Cole sua Claude API Key aqui"
              className="api-key-input"
            />
            <button
              onClick={() => setMostrarChave(!mostrarChave)}
              className="toggle-btn"
              title={mostrarChave ? 'Ocultar' : 'Mostrar'}
            >
              {mostrarChave ? '🙈' : '👁️'}
            </button>
          </div>
          <small>
            Obtenha sua API Key em{' '}
            <a href="https://console.anthropic.com/api_keys" target="_blank" rel="noopener noreferrer">
              console.anthropic.com
            </a>
          </small>
        </div>

        {/* Benefícios */}
        <div className="benefits">
          <h4>Benefícios com Claude API ativada:</h4>
          <ul>
            <li>✨ Análise automática de contratos com IA</li>
            <li>📊 Extração de dados estruturados (partes, valores, datas)</li>
            <li>🔍 Identificação automática de cláusulas importantes</li>
            <li>⚠️ Avisos inteligentes sobre termos incomuns</li>
            <li>📈 Comparação automática de renovações</li>
            <li>💰 Cálculo de IPCA e reajustes</li>
          </ul>
        </div>

        {/* Avisos */}
        <div className="warnings">
          <p>
            <strong>⚠️ Segurança:</strong> Sua API Key é armazenada localmente no navegador. Nunca compartilhe sua
            chave com terceiros.
          </p>
        </div>

        {/* Mensagens */}
        {mensagem && <div className={`message ${mensagem.tipo}`}>{mensagem.texto}</div>}

        {/* Botões */}
        <div className="button-group">
          <button onClick={handleSalvar} className="btn-primary">
            💾 Salvar Configuração
          </button>
          {config.isConfigured && (
            <button onClick={handleLimpar} className="btn-danger">
              🗑️ Remover
            </button>
          )}
        </div>

        {/* Info */}
        {!config.isConfigured && (
          <div className="info-box">
            <strong>ℹ️ Sem configuração?</strong>
            <p>
              Por enquanto, o sistema funcionará com análise básica (extração de padrões). Configure a Claude API para
              ativar análise completa com IA.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
