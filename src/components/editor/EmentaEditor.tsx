/**
 * EmentaEditor Component
 * Generates and edits legal summaries (ementa) in CNJ/STJ format
 */

import { useState } from 'react'
import type { Ementa } from '../../types/editor'
import { ementaGenerator } from '../../services/ementaGenerator'

interface EmentaEditorProps {
  documentId: string
  content: string
  title: string
}

export function EmentaEditor({ documentId, content }: EmentaEditorProps) {
  const [ementa, setEmenta] = useState<Ementa | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  const handleGenerateEmenta = async () => {
    setIsGenerating(true)
    try {
      const generated = await ementaGenerator.generateEmenta(documentId, content)
      setEmenta(generated)
    } catch (error) {
      console.error('Error generating ementa:', error)
      alert('Erro ao gerar ementa')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSaveEmenta = () => {
    if (!ementa) return
    ementa.confirmedByUser = true
    console.log('Ementa salva:', ementa)
    alert('Ementa salva com sucesso!')
  }

  const handleUpdateEmenta = (field: keyof Ementa, value: any) => {
    if (!ementa) return
    setEmenta({ ...ementa, [field]: value })
  }

  return (
    <div className="ementa-editor">
      <div className="ementa-toolbar">
        <button
          onClick={handleGenerateEmenta}
          disabled={isGenerating || !content}
          className="btn-primary"
        >
          {isGenerating ? '⏳ Gerando...' : '✨ Gerar Ementa com IA'}
        </button>

        {ementa && (
          <>
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="btn-secondary"
            >
              {isEditing ? '✓ Pronto' : '✏️ Editar'}
            </button>
            <button
              onClick={handleSaveEmenta}
              className="btn-success"
            >
              💾 Salvar
            </button>
          </>
        )}
      </div>

      {ementa && (
        <div className="ementa-content">
          {isEditing ? (
            <div className="ementa-edit-form">
              <div className="form-group">
                <label>Ramo Jurídico:</label>
                <select
                  value={ementa.branch}
                  onChange={(e) => handleUpdateEmenta('branch', e.target.value)}
                  className="form-select"
                >
                  <option>Civil</option>
                  <option>Criminal</option>
                  <option>Trabalhista</option>
                  <option>Administrativo</option>
                  <option>Constitucional</option>
                  <option>Tributário</option>
                  <option>Família</option>
                </select>
              </div>

              <div className="form-group">
                <label>Assunto:</label>
                <input
                  type="text"
                  value={ementa.subject}
                  onChange={(e) => handleUpdateEmenta('subject', e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label>Ementa (Resumo):</label>
                <textarea
                  value={ementa.summary}
                  onChange={(e) => handleUpdateEmenta('summary', e.target.value)}
                  className="form-textarea"
                  rows={6}
                />
              </div>

              <div className="form-group">
                <label>Palavras-chave (separadas por vírgula):</label>
                <input
                  type="text"
                  value={ementa.keywords.join(', ')}
                  onChange={(e) =>
                    handleUpdateEmenta(
                      'keywords',
                      e.target.value.split(',').map((k) => k.trim())
                    )
                  }
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label>Tribunal:</label>
                <input
                  type="text"
                  value={ementa.tribunal}
                  onChange={(e) => handleUpdateEmenta('tribunal', e.target.value)}
                  className="form-input"
                />
              </div>
            </div>
          ) : (
            <div
              className="ementa-preview"
              dangerouslySetInnerHTML={{
                __html: ementaGenerator.renderEmentaHTML(ementa),
              }}
            />
          )}
        </div>
      )}

      {!ementa && !isGenerating && (
        <div className="empty-state">
          <p>📋 Clique em "Gerar Ementa com IA" para criar um resumo automático da petição</p>
          <p>A ementa será formatada conforme os padrões CNJ/STJ</p>
        </div>
      )}
    </div>
  )
}
