/**
 * Petition Transformer Panel
 * Main component for autonomous petition analysis and enhancement
 */

import { useState } from 'react'
import { usePetitionTransformer } from '../../hooks/usePetitionTransformer'
import { DocumentUpload } from './DocumentUpload'
import { TransformationProgress } from './TransformationProgress'
import { InputFormat, OutputFormat } from '../../types/petitionTransformer'
import './PetitionTransformerPanel.css'

export function PetitionTransformerPanel() {
  const transformer = usePetitionTransformer()
  const [activeTab, setActiveTab] = useState<'upload' | 'preview' | 'export'>('upload')
  const [selectedExportFormats, setSelectedExportFormats] = useState<Set<string>>(
    new Set(['pdf-abnt', 'docx'])
  )

  const handleFileSelect = async (file: File, format: InputFormat) => {
    await transformer.transform(file, format, {
      improveReadability: true,
      addCrossReferences: true,
      extractTables: true,
    })
  }

  const toggleExportFormat = (format: string) => {
    setSelectedExportFormats((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(format)) {
        newSet.delete(format)
      } else {
        newSet.add(format)
      }
      return newSet
    })
  }

  const handleDownload = (format: string) => {
    const fileName = transformer.result?.originalMetadata.fileName || 'petition'
    const baseName = fileName.substring(0, fileName.lastIndexOf('.')) || fileName
    transformer.downloadFormat(format, `${baseName}-enhanced.${format === 'pdf-abnt' ? 'pdf' : format}`)
  }

  return (
    <div className="petition-transformer-panel">
      <div className="panel-header">
        <h2>🚀 Transformador de Petições Autônomo</h2>
        <p>Upload automático, análise inteligente e aprimoramento com IA</p>
      </div>

      <div className="transformer-tabs">
        <button
          className={`tab-button ${activeTab === 'upload' ? 'active' : ''}`}
          onClick={() => setActiveTab('upload')}
          disabled={transformer.loading}
        >
          📤 Upload
        </button>
        <button
          className={`tab-button ${activeTab === 'preview' ? 'active' : ''}`}
          onClick={() => setActiveTab('preview')}
          disabled={!transformer.result}
        >
          👁️ Preview
        </button>
        <button
          className={`tab-button ${activeTab === 'export' ? 'active' : ''}`}
          onClick={() => setActiveTab('export')}
          disabled={!transformer.result}
        >
          📥 Exportar
        </button>
      </div>

      <div className="transformer-content">
        {activeTab === 'upload' && (
          <div className="tab-pane">
            <DocumentUpload
              onFileSelect={handleFileSelect}
              isLoading={transformer.loading}
            />

            {transformer.progress && (
              <TransformationProgress
                progress={transformer.progress}
                isComplete={transformer.result !== null}
              />
            )}

            {transformer.error && (
              <div className="error-message">
                <strong>❌ Erro:</strong> {transformer.error}
              </div>
            )}
          </div>
        )}

        {activeTab === 'preview' && transformer.result && (
          <div className="tab-pane">
            <div className="preview-container">
              <div className="preview-section">
                <h3>📊 Metadados da Transformação</h3>
                <div className="metadata-grid">
                  <div className="metadata-item">
                    <span className="metadata-label">Arquivo Original:</span>
                    <span className="metadata-value">
                      {transformer.result.originalMetadata.fileName}
                    </span>
                  </div>
                  <div className="metadata-item">
                    <span className="metadata-label">Palavras:</span>
                    <span className="metadata-value">
                      {transformer.result.originalMetadata.wordCount}
                    </span>
                  </div>
                  <div className="metadata-item">
                    <span className="metadata-label">Caracteres:</span>
                    <span className="metadata-value">
                      {transformer.result.originalMetadata.characterCount}
                    </span>
                  </div>
                  <div className="metadata-item">
                    <span className="metadata-label">Tempo de Processamento:</span>
                    <span className="metadata-value">
                      {(transformer.result.totalProcessingTime / 1000).toFixed(2)}s
                    </span>
                  </div>
                </div>
              </div>

              {transformer.result.enhancedPetition.improvements.length > 0 && (
                <div className="preview-section">
                  <h3>✨ Aprimoramentos Aplicados</h3>
                  <div className="improvements-list">
                    {transformer.result.enhancedPetition.improvements.slice(0, 5).map((imp, idx) => (
                      <div key={idx} className={`improvement improvement-${imp.priority}`}>
                        <span className="improvement-type">{imp.type}</span>
                        <span className="improvement-suggestion">{imp.suggestion}</span>
                        <span className={`improvement-priority priority-${imp.priority}`}>
                          {imp.priority.toUpperCase()}
                        </span>
                      </div>
                    ))}
                    {transformer.result.enhancedPetition.improvements.length > 5 && (
                      <p className="more-items">
                        +{transformer.result.enhancedPetition.improvements.length - 5} mais aprimoramentos
                      </p>
                    )}
                  </div>
                </div>
              )}

              {transformer.result.enhancedPetition.warnings.length > 0 && (
                <div className="preview-section">
                  <h3>⚠️ Advertências Detectadas</h3>
                  <div className="warnings-list">
                    {transformer.result.enhancedPetition.warnings.slice(0, 5).map((warning, idx) => (
                      <div key={idx} className={`warning warning-${warning.severity}`}>
                        <p className="warning-message">{warning.message}</p>
                        {warning.resolution && (
                          <p className="warning-resolution">💡 {warning.resolution}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {transformer.result.jurisprudentialReferences.length > 0 && (
                <div className="preview-section">
                  <h3>📚 Referências Jurisprudenciais Encontradas</h3>
                  <div className="jurisprudence-list">
                    {transformer.result.jurisprudentialReferences.slice(0, 3).map((ref: any) => (
                      <div key={ref.id} className="jurisprudence-item">
                        <strong>{ref.title}</strong>
                        <p>{ref.summary}</p>
                        <span className="tribunal">{ref.tribunal}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="preview-section">
                <h3>📈 Pontuações de Qualidade</h3>
                <div className="scores-grid">
                  <div className="score-item">
                    <span className="score-label">Qualidade Geral</span>
                    <div className="score-bar">
                      <div
                        className="score-fill"
                        style={{
                          width: `${transformer.result.enhancedPetition.qualityScore}%`,
                        }}
                      />
                    </div>
                    <span className="score-value">
                      {transformer.result.enhancedPetition.qualityScore}%
                    </span>
                  </div>
                  <div className="score-item">
                    <span className="score-label">Legibilidade</span>
                    <div className="score-bar">
                      <div
                        className="score-fill"
                        style={{
                          width: `${transformer.result.enhancedPetition.readabilityScore}%`,
                        }}
                      />
                    </div>
                    <span className="score-value">
                      {transformer.result.enhancedPetition.readabilityScore}%
                    </span>
                  </div>
                  <div className="score-item">
                    <span className="score-label">Apoio Jurisprudencial</span>
                    <div className="score-bar">
                      <div
                        className="score-fill"
                        style={{
                          width: `${transformer.result.enhancedPetition.jurisprudentialScore}%`,
                        }}
                      />
                    </div>
                    <span className="score-value">
                      {transformer.result.enhancedPetition.jurisprudentialScore}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'export' && transformer.result && (
          <div className="tab-pane">
            <div className="export-section">
              <h3>📥 Exportar Versão Aprimorada</h3>
              <p className="export-description">
                Selecione os formatos desejados e clique para fazer download
              </p>

              <div className="export-formats">
                <label className="format-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedExportFormats.has('pdf-abnt')}
                    onChange={() => toggleExportFormat('pdf-abnt')}
                  />
                  <span className="format-label">
                    <strong>📄 PDF (ABNT)</strong>
                    <small>Formato recomendado para tribunais</small>
                  </span>
                </label>

                <label className="format-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedExportFormats.has('docx')}
                    onChange={() => toggleExportFormat('docx')}
                  />
                  <span className="format-label">
                    <strong>📝 Word (.docx)</strong>
                    <small>Editável em Microsoft Word</small>
                  </span>
                </label>

                <label className="format-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedExportFormats.has('markdown')}
                    onChange={() => toggleExportFormat('markdown')}
                  />
                  <span className="format-label">
                    <strong>📋 Markdown</strong>
                    <small>Para versionamento e colaboração</small>
                  </span>
                </label>
              </div>

              <div className="export-buttons">
                {Array.from(selectedExportFormats).map((format) => (
                  <button
                    key={format}
                    onClick={() => handleDownload(format)}
                    className="btn-download"
                  >
                    ⬇️ {format === 'pdf-abnt' ? 'PDF' : format.toUpperCase()}
                  </button>
                ))}
              </div>

              {selectedExportFormats.size === 0 && (
                <p className="export-empty">Selecione pelo menos um formato para exportar</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
