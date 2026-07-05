/**
 * EditorWorkspace Component
 * Main container for the legal document editor
 */

import { useState } from 'react'
import { useDocumentIntegration } from '../../hooks/useDocumentIntegration'
import { TemplateType } from '../../types/editor'
import { TemplateSelector } from './TemplateSelector'
import { DocumentEditor } from './DocumentEditor'
import { AttachmentPanel } from './AttachmentPanel'
import { EmentaEditor } from './EmentaEditor'
import { RevisionHistory } from './RevisionHistory'
import { ExportDialog } from './ExportDialog'
import './EditorStyles.css'

interface EditorWorkspaceProps {
  documentId?: string
  tipoDocumento?: 'editor-novo' | 'editor' | 'analise' | 'transformacao'
  onClose?: () => void
}

export function EditorWorkspace({ documentId, tipoDocumento = 'editor-novo', onClose }: EditorWorkspaceProps) {
  const { document, content, isDirty, isSaving, criarNovoDocumento, atualizarConteudo, salvarDocumento } =
    useDocumentIntegration({ documentId, tipoDocumento })
  const [activeTab, setActiveTab] = useState<'editor' | 'attachments' | 'ementa' | 'revisions'>(
    'editor'
  )
  const [showExportDialog, setShowExportDialog] = useState(false)

  const handleCreateDocument = (templateType: TemplateType) => {
    criarNovoDocumento(`Novo ${templateType}`, 'civil')
  }

  if (!document) {
    return (
      <TemplateSelector
        onSelect={handleCreateDocument}
        onClose={onClose}
      />
    )
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
          {isSaving && <span className="saving-indicator">⏳ Auto-salvando...</span>}
          {!isDirty && !isSaving && <span className="saved-indicator">✓ Salvo</span>}
          <button onClick={salvarDocumento} disabled={!isDirty || isSaving} className="btn-save">
            {isSaving ? '💾 Salvando...' : isDirty ? '💾 Salvar Agora' : '✓ Salvo'}
          </button>
          <button onClick={() => setShowExportDialog(true)} className="btn-export">
            📤 Exportar
          </button>
          <button onClick={() => criarNovoDocumento('Novo Documento', 'civil')} className="btn-new">
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
          <DocumentEditor content={content} onChange={atualizarConteudo} />
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

      {/* Export Dialog */}
      {showExportDialog && document && (
        <ExportDialog
          document={document}
          content={content}
          onClose={() => setShowExportDialog(false)}
        />
      )}
    </div>
  )
}
