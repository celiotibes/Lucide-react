/**
 * LLM Test Panel
 * Allows users to test the LLM router with different strategies
 */

import { useState } from 'react'
import { useLLM } from '../../hooks/useLLM'
import './LLMTestPanel.css'

export function LLMTestPanel() {
  const [prompt, setPrompt] = useState('')
  const [strategy, setStrategy] = useState<string>('balanced')
  const [systemPrompt, setSystemPrompt] = useState('')
  const { response, loading, error, request, reset } = useLLM()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim()) return

    await request(prompt, {
      system: systemPrompt || undefined,
      strategy: strategy as any,
      maxTokens: 1000,
    })
  }

  const handleClear = () => {
    setPrompt('')
    setSystemPrompt('')
    reset()
  }

  return (
    <div className="llm-test-panel">
      <div className="test-header">
        <h2>🧪 LLM Router Test</h2>
        <p>Test different routing strategies and LLM providers</p>
      </div>

      <div className="test-container">
        <form onSubmit={handleSubmit} className="test-form">
          <div className="form-group">
            <label htmlFor="strategy">Routing Strategy:</label>
            <select
              id="strategy"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              disabled={loading}
            >
              <option value="balanced">⚖️ Balanced</option>
              <option value="cost-optimized">💰 Cost Optimized</option>
              <option value="speed-optimized">⚡ Speed Optimized</option>
              <option value="quality-optimized">✨ Quality Optimized</option>
              <option value="fastest-available">🚀 Fastest Available</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="system">System Prompt (Optional):</label>
            <textarea
              id="system"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="You are a legal expert..."
              disabled={loading}
              rows={3}
            />
          </div>

          <div className="form-group">
            <label htmlFor="prompt">Your Question:</label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask your question here..."
              disabled={loading}
              rows={4}
              required
            />
          </div>

          <div className="form-actions">
            <button type="submit" disabled={loading} className="btn-submit">
              {loading ? '⏳ Processing...' : '▶️ Send Request'}
            </button>
            <button type="button" onClick={handleClear} disabled={loading} className="btn-clear">
              🔄 Clear
            </button>
          </div>
        </form>

        <div className="test-results">
          {error && (
            <div className="error-message">
              <strong>❌ Error:</strong> {error}
            </div>
          )}

          {response && (
            <div className="response-container">
              <div className="response-header">
                <h3>Response</h3>
                <div className="response-meta">
                  <span className="meta-item">
                    <strong>Provider:</strong> {response.provider}
                  </span>
                  <span className="meta-item">
                    <strong>Model:</strong> {response.model}
                  </span>
                  <span className="meta-item">
                    <strong>Latency:</strong> {response.latency}ms
                  </span>
                  <span className="meta-item">
                    <strong>Tokens:</strong> {response.tokensUsed}
                  </span>
                  <span className="meta-item">
                    <strong>Cost:</strong> ${response.cost.toFixed(4)}
                  </span>
                </div>
              </div>

              <div className="response-content">
                {response.content}
              </div>

              {response.cached && (
                <div className="cached-indicator">
                  ⚡ Cached response (instant, no cost)
                </div>
              )}
            </div>
          )}

          {!response && !error && !loading && (
            <div className="empty-state">
              <p>Send a request to see the response here</p>
            </div>
          )}
        </div>
      </div>

      <div className="strategy-info">
        <h3>📚 About Routing Strategies</h3>
        <div className="strategy-grid">
          <div className="strategy-card">
            <h4>💰 Cost Optimized</h4>
            <p>Uses cheapest available model (Groq free tier or Gemini Flash). Best for high-volume queries where cost matters most.</p>
          </div>
          <div className="strategy-card">
            <h4>⚡ Speed Optimized</h4>
            <p>Routes to fastest model available. Ideal for real-time applications where latency is critical.</p>
          </div>
          <div className="strategy-card">
            <h4>✨ Quality Optimized</h4>
            <p>Uses Claude Opus for best quality reasoning. Best for complex legal analysis and high-stakes decisions.</p>
          </div>
          <div className="strategy-card">
            <h4>⚖️ Balanced (Default)</h4>
            <p>Balances speed, quality, and cost. Recommended for most use cases combining quality and affordability.</p>
          </div>
          <div className="strategy-card">
            <h4>🚀 Fastest Available</h4>
            <p>Selects model with lowest latency. Similar to speed-optimized but uses actual latency measurements.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
