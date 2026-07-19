/**
 * Export Dialog Component
 * Allows exporting documents to different formats
 */

import { useState } from 'react'
import type { LegalDocument } from '../../types/editor'
import { exportService } from '../../services/exportService'

interface ExportDialogProps {
  document: LegalDocument
  content: string
  onClose: () => void
}

export function ExportDialog({ document, content, onClose }: ExportDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<'pdf' | 'docx' | 'markdown'>('pdf')
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async () => {
    setIsExporting(true)
    try {
      let result

      switch (selectedFormat) {
        case 'pdf':
          result = await exportService.exportToPDF(document, content)
          break
        case 'docx':
          result = await exportService.exportToDOCX(document, content)
          break
        case 'markdown':
          result = await exportService.exportToMarkdown(document, content)
          break
      }

      exportService.downloadFile(result.blob, result.filename)
      alert(`Documento exportado com sucesso: ${result.filename}`)
      onClose()
    } catch (error) {
      console.error('Export error:', error)
      alert('Erro ao exportar documento')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="export-dialog-overlay" onClick={onClose}>
      <div className="export-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>📤 Exportar Documento</h2>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="dialog-content">
          <p className="dialog-description">Escolha o formato desejado para exportar:</p>

          <div className="format-options">
            <label className="format-option">
              <input
                type="radio"
                value="pdf"
                checked={selectedFormat === 'pdf'}
                onChange={(e) => setSelectedFormat(e.target.value as any)}
              />
              <span className="option-label">
                <strong>📄 PDF (ABNT)</strong>
                <small>Formato recomendado para tribunais</small>
              </span>
            </label>

            <label className="format-option">
              <input
                type="radio"
                value="docx"
                checked={selectedFormat === 'docx'}
                onChange={(e) => setSelectedFormat(e.target.value as any)}
              />
              <span className="option-label">
                <strong>📝 Word (.docx)</strong>
                <small>Editável em Microsoft Word</small>
              </span>
            </label>

            <label className="format-option">
              <input
                type="radio"
                value="markdown"
                checked={selectedFormat === 'markdown'}
                onChange={(e) => setSelectedFormat(e.target.value as any)}
              />
              <span className="option-label">
                <strong>📋 Markdown</strong>
                <small>Formato de texto estruturado</small>
              </span>
            </label>
          </div>

          <div className="format-details">
            {selectedFormat === 'pdf' && (
              <div className="details">
                <h4>📄 PDF - ABNT Compliant</h4>
                <ul>
                  <li>✅ Compatível com tribunais (eproc, projudi, STF)</li>
                  <li>✅ Formatação ABNT: Times New Roman 12pt, espaçamento 1.5</li>
                  <li>✅ Margens: 3cm esquerda/superior, 2cm direita/inferior</li>
                  <li>✅ Otimizado para leitura por sistemas IA</li>
                </ul>
              </div>
            )}

            {selectedFormat === 'docx' && (
              <div className="details">
                <h4>📝 Word - Editável</h4>
                <ul>
                  <li>✅ Abrir e editar em Microsoft Word</li>
                  <li>✅ Mantém formatação básica</li>
                  <li>✅ Pronto para aprimoramentos adicionais</li>
                  <li>✅ Compatible com Office 365</li>
                </ul>
              </div>
            )}

            {selectedFormat === 'markdown' && (
              <div className="details">
                <h4>📋 Markdown - Estruturado</h4>
                <ul>
                  <li>✅ Formato texto puro</li>
                  <li>✅ Versionável em Git</li>
                  <li>✅ Convertível para outros formatos</li>
                  <li>✅ Ideal para colaboração</li>
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="dialog-actions">
          <button onClick={onClose} className="btn-cancel">
            ✕ Cancelar
          </button>
          <button onClick={handleExport} disabled={isExporting} className="btn-export">
            {isExporting ? '⏳ Exportando...' : `📤 Exportar ${selectedFormat.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  )
}
