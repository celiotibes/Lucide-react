/**
 * LLM Configuration Panel
 * Allows users to configure API keys for different LLM providers
 */

import { useState } from 'react'
import { llmRouter } from '../../services/llmRouter'
import type { LLMProvider, RoutingStrategy } from '../../types/llm'
import './LLMConfigPanel.css'

interface ConfigFormData {
  [key: string]: string
}

export function LLMConfigPanel() {
  const [activeTab, setActiveTab] = useState<LLMProvider>('claude')
  const [formData, setFormData] = useState<ConfigFormData>({
    claudeKey: localStorage.getItem('llm_claude_key') || '',
    groqKey: localStorage.getItem('llm_groq_key') || '',
    geminiKey: localStorage.getItem('llm_gemini_key') || '',
    ollamaUrl: localStorage.getItem('llm_ollama_url') || 'http://localhost:11434',
  })
  const [saved, setSaved] = useState(false)
  const [strategy, setStrategy] = useState<RoutingStrategy>(
    (localStorage.getItem('llm_strategy') as RoutingStrategy) || 'balanced'
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    setSaved(false)
  }

  const handleStrategyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStrategy = e.target.value as RoutingStrategy
    setStrategy(newStrategy)
    localStorage.setItem('llm_strategy', newStrategy)
    setSaved(true)
  }

  const handleSave = () => {
    // Save to localStorage
    localStorage.setItem('llm_claude_key', formData.claudeKey)
    localStorage.setItem('llm_groq_key', formData.groqKey)
    localStorage.setItem('llm_gemini_key', formData.geminiKey)
    localStorage.setItem('llm_ollama_url', formData.ollamaUrl)

    // Register configurations with llmRouter
    if (formData.claudeKey) {
      llmRouter.registerConfig({
        provider: 'claude',
        model: LLMModel.CLAUDE_SONNET,
        apiKey: formData.claudeKey,
      })
    }

    if (formData.groqKey) {
      llmRouter.registerConfig({
        provider: 'groq',
        model: LLMModel.GROQ_MIXTRAL,
        apiKey: formData.groqKey,
      })
    }

    if (formData.geminiKey) {
      llmRouter.registerConfig({
        provider: 'gemini',
        model: LLMModel.GEMINI_FLASH,
        apiKey: formData.geminiKey,
      })
    }

    if (formData.ollamaUrl) {
      llmRouter.registerConfig({
        provider: 'ollama',
        model: LLMModel.OLLAMA_MISTRAL,
        baseUrl: formData.ollamaUrl,
      })
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="llm-config-panel">
      <div className="config-header">
        <h2>🤖 LLM Configuration</h2>
        <p>Configure API keys for different language models</p>
      </div>

      <div className="strategy-selector">
        <label htmlFor="strategy">Routing Strategy:</label>
        <select id="strategy" value={strategy} onChange={handleStrategyChange}>
          <option value="cost-optimized">💰 Cost Optimized (Cheapest)</option>
          <option value="speed-optimized">⚡ Speed Optimized (Fastest)</option>
          <option value="quality-optimized">✨ Quality Optimized (Best)</option>
          <option value="balanced">⚖️ Balanced (Default)</option>
          <option value="fastest-available">🚀 Fastest Available</option>
        </select>
      </div>

      <div className="config-tabs">
        {Object.values(LLMProvider).map((provider) => (
          <button
            key={provider}
            className={`tab-button ${activeTab === provider ? 'active' : ''}`}
            onClick={() => setActiveTab(provider)}
          >
            {getProviderIcon(provider)} {formatProviderName(provider)}
          </button>
        ))}
      </div>

      <div className="config-content">
        {activeTab === LLMProvider.CLAUDE && (
          <div className="provider-config">
            <h3>🔵 Claude (Anthropic)</h3>
            <p>High-quality, reasoning-focused models with large context windows</p>
            <div className="form-group">
              <label htmlFor="claudeKey">API Key:</label>
              <input
                id="claudeKey"
                type="password"
                name="claudeKey"
                placeholder="sk-ant-..."
                value={formData.claudeKey}
                onChange={handleInputChange}
              />
              <small>Get your API key from https://console.anthropic.com</small>
            </div>
            <div className="model-info">
              <p>
                <strong>Default Model:</strong> Claude Sonnet 5 (balanced cost/quality)
              </p>
              <ul>
                <li>Context: 200K tokens</li>
                <li>Cost: ~$0.003 per 1K tokens</li>
                <li>Speed: 6/10</li>
                <li>Quality: 9/10</li>
              </ul>
            </div>
          </div>
        )}

        {activeTab === LLMProvider.GROQ && (
          <div className="provider-config">
            <h3>🟢 Groq (Free & Fast)</h3>
            <p>Ultra-fast inference, free tier available, great for speed-critical applications</p>
            <div className="form-group">
              <label htmlFor="groqKey">API Key:</label>
              <input
                id="groqKey"
                type="password"
                name="groqKey"
                placeholder="gsk_..."
                value={formData.groqKey}
                onChange={handleInputChange}
              />
              <small>Get your API key from https://console.groq.com</small>
            </div>
            <div className="model-info">
              <p>
                <strong>Default Model:</strong> Mixtral 8x7B (balanced performance)
              </p>
              <ul>
                <li>Context: 32K tokens</li>
                <li>Cost: FREE (with free tier)</li>
                <li>Speed: 9/10</li>
                <li>Quality: 7/10</li>
              </ul>
            </div>
          </div>
        )}

        {activeTab === LLMProvider.GEMINI && (
          <div className="provider-config">
            <h3>🟠 Google Gemini</h3>
            <p>Large context window, multimodal capabilities, competitive pricing</p>
            <div className="form-group">
              <label htmlFor="geminiKey">API Key:</label>
              <input
                id="geminiKey"
                type="password"
                name="geminiKey"
                placeholder="AIza..."
                value={formData.geminiKey}
                onChange={handleInputChange}
              />
              <small>Get your API key from https://aistudio.google.com/app/apikey</small>
            </div>
            <div className="model-info">
              <p>
                <strong>Default Model:</strong> Gemini 1.5 Flash (best for cost-quality)
              </p>
              <ul>
                <li>Context: 1M tokens</li>
                <li>Cost: ~$0.00005 per 1K tokens (Flash)</li>
                <li>Speed: 9/10</li>
                <li>Quality: 7/10</li>
              </ul>
            </div>
          </div>
        )}

        {activeTab === LLMProvider.OLLAMA && (
          <div className="provider-config">
            <h3>🟣 Ollama (Local)</h3>
            <p>Run models locally, no API costs, full privacy</p>
            <div className="form-group">
              <label htmlFor="ollamaUrl">Server URL:</label>
              <input
                id="ollamaUrl"
                type="text"
                name="ollamaUrl"
                placeholder="http://localhost:11434"
                value={formData.ollamaUrl}
                onChange={handleInputChange}
              />
              <small>Ensure Ollama server is running at this URL</small>
            </div>
            <div className="model-info">
              <p>
                <strong>Default Model:</strong> Mistral 7B (good balance)
              </p>
              <ul>
                <li>Setup: Download from https://ollama.ai</li>
                <li>Context: 8K tokens (varies by model)</li>
                <li>Cost: FREE</li>
                <li>Speed: 8/10 (hardware dependent)</li>
                <li>Quality: 6/10</li>
              </ul>
              <div className="setup-guide">
                <h4>Setup Instructions:</h4>
                <code>ollama pull mistral</code>
                <code>ollama serve</code>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="config-actions">
        <button onClick={handleSave} className="btn-save">
          💾 Save Configuration
        </button>
        {saved && <span className="save-indicator">✓ Saved</span>}
      </div>

      <div className="usage-stats">
        <h3>📊 Usage Statistics</h3>
        <div className="stats-grid">
          <div className="stat-item">
            <span className="stat-label">Total Requests:</span>
            <span className="stat-value">0</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Total Cost:</span>
            <span className="stat-value">$0.00</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Avg Cost/Request:</span>
            <span className="stat-value">$0.00</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Most Used Model:</span>
            <span className="stat-value">-</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function getProviderIcon(provider: LLMProvider): string {
  switch (provider) {
    case LLMProvider.CLAUDE:
      return '🔵'
    case LLMProvider.GROQ:
      return '🟢'
    case LLMProvider.GEMINI:
      return '🟠'
    case LLMProvider.OLLAMA:
      return '🟣'
    default:
      return '🤖'
  }
}

function formatProviderName(provider: LLMProvider): string {
  return provider.charAt(0).toUpperCase() + provider.slice(1)
}
