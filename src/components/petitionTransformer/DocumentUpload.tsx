/**
 * Document Upload Component
 * Drag-and-drop file upload for Petition Transformer
 */

import { useState, useRef } from 'react'
import { InputFormat } from '../../types/petitionTransformer'
import './DocumentUpload.css'

interface DocumentUploadProps {
  onFileSelect: (file: File, format: InputFormat) => void
  isLoading: boolean
}

export function DocumentUpload({ onFileSelect, isLoading }: DocumentUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const getFormatFromFile = (file: File): InputFormat => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'md':
        return 'markdown'
      case 'docx':
        return 'docx'
      case 'pdf':
        return 'pdf'
      case 'html':
        return 'html'
      default:
        return 'plain-text'
    }
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      const file = files[0]
      setSelectedFile(file)
      const format = getFormatFromFile(file)
      onFileSelect(file, format)
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files
    if (files && files.length > 0) {
      const file = files[0]
      setSelectedFile(file)
      const format = getFormatFromFile(file)
      onFileSelect(file, format)
    }
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  return (
    <div className="document-upload">
      <div
        className={`upload-area ${isDragging ? 'dragging' : ''} ${isLoading ? 'loading' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.docx,.pdf,.html,.txt"
          onChange={handleFileInputChange}
          disabled={isLoading}
          style={{ display: 'none' }}
        />

        <div className="upload-content">
          {selectedFile ? (
            <>
              <div className="file-icon">📄</div>
              <p className="file-name">{selectedFile.name}</p>
              <p className="file-size">{formatFileSize(selectedFile.size)}</p>
              {!isLoading && <p className="file-ready">✅ Pronto para processar</p>}
            </>
          ) : (
            <>
              <div className="upload-icon">📤</div>
              <p className="upload-title">Arraste sua petição aqui</p>
              <p className="upload-subtitle">ou clique para selecionar</p>
              <p className="upload-formats">Formatos: MD, DOCX, PDF, HTML, TXT</p>
            </>
          )}
        </div>
      </div>

      {selectedFile && (
        <div className="file-preview">
          <div className="preview-item">
            <span className="preview-label">Arquivo:</span>
            <span className="preview-value">{selectedFile.name}</span>
          </div>
          <div className="preview-item">
            <span className="preview-label">Tamanho:</span>
            <span className="preview-value">{formatFileSize(selectedFile.size)}</span>
          </div>
          <div className="preview-item">
            <span className="preview-label">Tipo:</span>
            <span className="preview-value">{selectedFile.type || 'Text'}</span>
          </div>
        </div>
      )}
    </div>
  )
}
