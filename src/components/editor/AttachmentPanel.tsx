/**
 * AttachmentPanel Component
 * Manages document attachments with upload and organization
 */

import { useState } from 'react'
import type { DocumentAttachment, AttachmentOrganizationConfig } from '../../types/editor'
import { attachmentManager } from '../../services/attachmentManager'

interface AttachmentPanelProps {
  documentId: string
}

export function AttachmentPanel({ documentId }: AttachmentPanelProps) {
  const [attachments, setAttachments] = useState<DocumentAttachment[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [organizationConfig, setOrganizationConfig] = useState<AttachmentOrganizationConfig>({
    autoRename: true,
    autoNumbering: 'roman',
    groupByType: true,
    includeSizeInBox: true,
    includePreviewInBox: false,
    enableSearch: true,
    enablePreview: true,
  })

  const handleUploadLocal = async (files: FileList | null) => {
    if (!files) return

    setIsUploading(true)
    try {
      for (const file of Array.from(files)) {
        const attachment = await attachmentManager.uploadLocalFile(documentId, file)
        setAttachments((prev) => [...prev, attachment])
      }
    } catch (error) {
      console.error('Error uploading file:', error)
      alert('Erro ao fazer upload: ' + (error as Error).message)
    } finally {
      setIsUploading(false)
    }
  }

  const handleOrganizeAttachments = () => {
    const organized = attachmentManager.organizeAttachments(attachments, organizationConfig)
    setAttachments(organized)
  }

  const handleDeleteAttachment = (attachmentId: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== attachmentId))
  }

  const handleInsertAttachmentBox = (attachment: DocumentAttachment) => {
    const html = attachmentManager.generateAttachmentBoxHTML(attachment)
    console.log('Insert HTML:', html)
    alert('Caixa de anexo pronta para inserir no documento')
  }

  return (
    <div className="attachment-panel">
      <h3>📎 Anexos ({attachments.length})</h3>

      {/* Upload Section */}
      <div className="attachment-upload">
        <div className="upload-buttons">
          <label className="btn-upload">
            ⬆️ Upload do PC
            <input
              type="file"
              multiple
              onChange={(e) => handleUploadLocal(e.target.files)}
              style={{ display: 'none' }}
              disabled={isUploading}
            />
          </label>
          {isUploading && <span className="loading">Enviando...</span>}
        </div>
      </div>

      {/* Organization Section */}
      <div className="attachment-organization">
        <h4>⚙️ Organização</h4>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={organizationConfig.autoRename}
            onChange={(e) =>
              setOrganizationConfig({
                ...organizationConfig,
                autoRename: e.target.checked,
              })
            }
          />
          Renomear automaticamente (Anexo I, II, III)
        </label>

        <label className="select-label">
          Tipo de numeração:
          <select
            value={organizationConfig.autoNumbering}
            onChange={(e) =>
              setOrganizationConfig({
                ...organizationConfig,
                autoNumbering: e.target.value as any,
              })
            }
          >
            <option value="roman">Numeração Romana (I, II, III)</option>
            <option value="arabic">Numeração Árabe (1, 2, 3)</option>
            <option value="letter">Letras (A, B, C)</option>
          </select>
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={organizationConfig.groupByType}
            onChange={(e) =>
              setOrganizationConfig({
                ...organizationConfig,
                groupByType: e.target.checked,
              })
            }
          />
          Agrupar por tipo (documentos, imagens, etc)
        </label>

        <button onClick={handleOrganizeAttachments} className="btn-organize">
          ✓ Organizar Anexos
        </button>
      </div>

      {/* Attachments List */}
      <div className="attachment-list">
        {attachments.length === 0 ? (
          <p className="empty-message">Nenhum anexo adicionado ainda</p>
        ) : (
          attachments.map((attachment) => (
            <div key={attachment.id} className="attachment-item">
              <div className="attachment-info">
                <span className="attachment-icon">📄</span>
                <div>
                  <span className="attachment-number">
                    Anexo {attachmentManager.toRoman(attachment.attachmentNumber)}
                  </span>
                  <span className="attachment-name">{attachment.filename}</span>
                </div>
              </div>

              <div className="attachment-meta">
                <span className="attachment-size">
                  {attachmentManager.formatFileSize(attachment.fileSize)}
                </span>
                <span className="attachment-source">{attachment.source}</span>
              </div>

              <div className="attachment-actions">
                <button
                  onClick={() => handleInsertAttachmentBox(attachment)}
                  className="btn-small"
                  title="Inserir link no documento"
                >
                  🔗 Link
                </button>
                <button
                  onClick={() => handleDeleteAttachment(attachment.id)}
                  className="btn-small btn-danger"
                  title="Remover anexo"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Attachment Index */}
      {attachments.length > 0 && (
        <div className="attachment-index-preview">
          <h4>📑 Índice de Anexos (Preview)</h4>
          <div
            dangerouslySetInnerHTML={{
              __html: attachmentManager.generateAttachmentIndex(attachments),
            }}
          />
        </div>
      )}
    </div>
  )
}
