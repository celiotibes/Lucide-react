/**
 * RAG Analysis Panel
 * Analyzes petitions for strengths, weaknesses, and jurisprudential support
 */

import { useState } from 'react'
import { useRAG } from '../../hooks/useRAG'
import './RAGAnalysisPanel.css'

interface RAGAnalysisPanelProps {
  documentId?: string
  documentTitle?: string
  documentContent?: string
}

export function RAGAnalysisPanel({
  documentId = 'new-doc',
  documentTitle = 'Minha Petição',
  documentContent = '',
}: RAGAnalysisPanelProps) {
  const rag = useRAG()
  const [activeTab, setActiveTab] = useState<'analyze' | 'search' | 'conflicts' | 'counter'>('analyze')
  const [contentInput, setContentInput] = useState(documentContent)
  const [titleInput, setTitleInput] = useState(documentTitle)
  const [selectedAnalysisTypes, setSelectedAnalysisTypes] = useState<string[]>([
    'strengths',
    'weaknesses',
    'gaps',
  ])

  const handleAnalyze = async () => {
    if (!contentInput.trim()) {
      alert('Please enter petition content')
      return
    }

    await rag.analyzePetition({
      documentId,
      content: contentInput,
      title: titleInput,
      analysisTypes: selectedAnalysisTypes as any,
    })
  }

  const handleDetectConflicts = async () => {
    await rag.detectConflicts(contentInput, titleInput)
  }

  const handleGenerateCounterArguments = async () => {
    if (!rag.analysisResults?.relevantJurisprudence) {
      alert('Run analysis first to generate counter-arguments')
      return
    }

    await rag.generateCounterArguments(
      contentInput,
      titleInput,
      rag.analysisResults.relevantJurisprudence
    )
  }

  const toggleAnalysisType = (type: string) => {
    setSelectedAnalysisTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  const analysisTypeLabels: Record<string, string> = {
    strengths: '💪 Strengths',
    weaknesses: '⚠️ Weaknesses',
    contradictions: '🔄 Contradictions',
    gaps: '⛔ Gaps',
    'procedural-issues': '📋 Procedural Issues',
    'counter-arguments': '🛡️ Counter-Arguments',
  }

  return (
    <div className="rag-analysis-panel">
      <div className="panel-header">
        <h2>📊 RAG Petition Analysis</h2>
        <p>Analyze petitions for strengths, weaknesses, and jurisprudential support</p>
      </div>

      <div className="analysis-tabs">
        <button
          className={`tab-button ${activeTab === 'analyze' ? 'active' : ''}`}
          onClick={() => setActiveTab('analyze')}
        >
          🔍 Analyze Petition
        </button>
        <button
          className={`tab-button ${activeTab === 'search' ? 'active' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          📚 Search Jurisprudence
        </button>
        <button
          className={`tab-button ${activeTab === 'conflicts' ? 'active' : ''}`}
          onClick={() => setActiveTab('conflicts')}
        >
          ⚡ Detect Conflicts
        </button>
        <button
          className={`tab-button ${activeTab === 'counter' ? 'active' : ''}`}
          onClick={() => setActiveTab('counter')}
        >
          🛡️ Counter-Arguments
        </button>
      </div>

      <div className="analysis-content">
        {activeTab === 'analyze' && (
          <div className="tab-pane">
            <div className="input-section">
              <div className="form-group">
                <label htmlFor="title">Document Title:</label>
                <input
                  id="title"
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  placeholder="Enter petition title..."
                />
              </div>

              <div className="form-group">
                <label htmlFor="content">Petition Content:</label>
                <textarea
                  id="content"
                  value={contentInput}
                  onChange={(e) => setContentInput(e.target.value)}
                  placeholder="Paste or enter petition content here..."
                  rows={8}
                />
              </div>

              <div className="analysis-options">
                <label>Analysis Types:</label>
                <div className="checkbox-group">
                  {Object.entries(analysisTypeLabels).map(([type, label]) => (
                    <label key={type} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={selectedAnalysisTypes.includes(type)}
                        onChange={() => toggleAnalysisType(type)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <button
                onClick={handleAnalyze}
                disabled={rag.loading}
                className="btn-analyze"
              >
                {rag.loading ? '⏳ Analyzing...' : '🚀 Analyze Petition'}
              </button>
            </div>

            {rag.error && <div className="error-message">{rag.error}</div>}

            {rag.analysisResults && (
              <div className="results-section">
                <h3>Analysis Results</h3>
                <p className="summary">{rag.analysisResults.summary}</p>

                <div className="findings">
                  <h4>Findings:</h4>
                  {rag.analysisResults.findings.map((finding, idx) => (
                    <div key={idx} className={`finding finding-${finding.severity}`}>
                      <div className="finding-header">
                        <span className="type">{finding.type}</span>
                        <span className={`severity severity-${finding.severity}`}>
                          {finding.severity.toUpperCase()}
                        </span>
                      </div>
                      <p>{finding.description}</p>
                      {finding.suggestion && (
                        <p className="suggestion">💡 {finding.suggestion}</p>
                      )}
                    </div>
                  ))}
                </div>

                {rag.analysisResults.relevantJurisprudence.length > 0 && (
                  <div className="jurisprudence-section">
                    <h4>Relevant Jurisprudence:</h4>
                    {rag.analysisResults.relevantJurisprudence.slice(0, 3).map((j) => (
                      <div key={j.id} className="jurisprudence-item">
                        <strong>{j.title}</strong>
                        <p>{j.summary}</p>
                        <span className="tribunal">{j.tribunal}</span>
                        <span className="relevance">
                          Relevance: {j.relevanceScore}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'conflicts' && (
          <div className="tab-pane">
            <div className="conflict-section">
              <p>Analyze the petition for internal contradictions and conflicts.</p>
              <button onClick={handleDetectConflicts} disabled={rag.loading} className="btn-analyze">
                {rag.loading ? '⏳ Detecting...' : '⚡ Detect Conflicts'}
              </button>

              {rag.conflictDetection && (
                <div className="conflict-results">
                  {rag.conflictDetection.hasConflicts ? (
                    <>
                      <h4>⚠️ Conflicts Detected:</h4>
                      {rag.conflictDetection.conflicts.map((conflict, idx) => (
                        <div key={idx} className={`conflict conflict-${conflict.severity}`}>
                          <p><strong>{conflict.description}</strong></p>
                          {conflict.resolution && (
                            <p className="resolution">Resolution: {conflict.resolution}</p>
                          )}
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="no-conflicts">✅ No conflicts detected</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'counter' && (
          <div className="tab-pane">
            <div className="counter-section">
              <p>Generate potential counter-arguments based on the petition and jurisprudence.</p>
              <button
                onClick={handleGenerateCounterArguments}
                disabled={rag.loading || !rag.analysisResults}
                className="btn-analyze"
              >
                {rag.loading ? '⏳ Generating...' : '🛡️ Generate Counter-Arguments'}
              </button>

              {rag.error && <div className="error-message">{rag.error}</div>}
            </div>
          </div>
        )}

        {activeTab === 'search' && (
          <div className="tab-pane">
            <div className="search-section">
              <p>Search for supporting jurisprudence and legislation.</p>
              <div className="form-group">
                <label htmlFor="search-query">Search Query:</label>
                <input
                  id="search-query"
                  type="text"
                  placeholder="Enter your search query..."
                  defaultValue={contentInput.substring(0, 100)}
                />
              </div>

              {rag.searchResults && (
                <div className="search-results">
                  <h4>Results ({rag.searchResults.documents.length}):</h4>
                  {rag.searchResults.documents.map((doc) => (
                    <div key={doc.id} className="search-item">
                      <strong>{doc.title}</strong>
                      <p>{doc.summary}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
