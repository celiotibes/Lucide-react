/**
 * EditorWorkspace Component
 * Main container for the legal document editor
 */

import { useState } from 'react'
import { useDocumentEditor } from '../../hooks/useDocumentEditor'
import { TemplateType } from '../../types/editor'
import { TemplateSelector } from './TemplateSelector'
import { DocumentEditor } from './DocumentEditor'
import { AttachmentPanel } from './AttachmentPanel'
import { EmentaEditor } from './EmentaEditor'
import { RevisionHistory } from './RevisionHistory'
import './EditorStyles.css'

export function EditorWorkspace() {
  const { document, content, isDirty, isSaving, createNewDocument, updateContent, saveDocument } =
    useDocumentEditor()
  const [activeTab, setActiveTab] = useState<'editor' | 'attachments' | 'ementa' | 'revisions'>(
    'editor'
  )

  const handleCreateDocument = (templateType: TemplateType) => {
    createNewDocument(templateType, `Novo ${templateType}`)
  }

  if (!document) {
    return <TemplateSelector onSelect={handleCreateDocument} />
  }

  return (
    <div className="editor-workspace">
      {/* Header */}
      <div className="editor-header">
        <div className="editor-title">
          <h2>{document.title}</h2>
          <span className={`status ${document.status}`}>{document.status}</span>
        </div>

        <div className="editor-actions">
          {isDirty && <span className="unsaved-indicator">● Não salvo</span>}
          <button onClick={saveDocument} disabled={!isDirty || isSaving} className="btn-save">
            {isSaving ? '💾 Salvando...' : '💾 Salvar'}
          </button>
          <button onClick={() => createNewDocument(TemplateType.PETITION, 'Novo Documento')} className="btn-new">
            📄 Novo
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="editor-tabs">
        <button
          className={`tab-button ${activeTab === 'editor' ? 'active' : ''}`}
          onClick={() => setActiveTab('editor')}
        >
          ✏️ Editor
        </button>
        <button
          className={`tab-button ${activeTab === 'attachments' ? 'active' : ''}`}
          onClick={() => setActiveTab('attachments')}
        >
          📎 Anexos
        </button>
        <button
          className={`tab-button ${activeTab === 'ementa' ? 'active' : ''}`}
          onClick={() => setActiveTab('ementa')}
        >
          📋 Ementa
        </button>
        <button
          className={`tab-button ${activeTab === 'revisions' ? 'active' : ''}`}
          onClick={() => setActiveTab('revisions')}
        >
          📚 Histórico
        </button>
      </div>

      {/* Content Area */}
      <div className="editor-content">
        {activeTab === 'editor' && (
          <DocumentEditor content={content} onChange={updateContent} />
        )}

        {activeTab === 'attachments' && document && (
          <AttachmentPanel documentId={document.id} />
        )}

        {activeTab === 'ementa' && document && (
          <EmentaEditor documentId={document.id} content={content} title={document.title} />
        )}

        {activeTab === 'revisions' && document && (
          <RevisionHistory documentId={document.id} />
        )}
      </div>

      {/* Footer */}
      <div className="editor-footer">
        <span>{content.length} caracteres</span>
        <span>{content.split(/\s+/).length} palavras</span>
        <span>Última atualização: {document.updatedAt.toLocaleTimeString()}</span>
      </div>
    </div>
  )
}
