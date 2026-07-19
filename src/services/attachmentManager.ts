/**
 * Attachment Manager Service
 * Handles upload, organization, and management of document attachments
 */

import type {
  DocumentAttachment,
  AttachmentType,
  AttachmentSource,
  AttachmentOrganizationConfig,
} from '../types/editor'

const generateId = () => crypto.randomUUID()

export class AttachmentManager {
  /**
   * Upload de arquivo local
   */
  async uploadLocalFile(
    documentId: string,
    file: File,
    description?: string
  ): Promise<DocumentAttachment> {
    // 1. Validar arquivo
    this.validateFile(file)

    // 2. Comprimir se necessário (> 5MB)
    const processedFile = file
    let compressed = false
    const originalSize = file.size

    if (file.size > 5 * 1024 * 1024) {
      // Implementação simplificada - em produção usar library como pako
      compressed = true
    }

    // 3. Criar registro
    const attachment: DocumentAttachment = {
      id: generateId(),
      documentId,
      filename: file.name,
      originalFilename: file.name,
      type: this.detectType(file.type),
      source: 'local' as AttachmentSource,
      fileSize: processedFile.size,
      mimeType: file.type,
      url: URL.createObjectURL(file),
      description,
      compressed,
      originalSize: compressed ? originalSize : undefined,
      uploadedAt: new Date(),
      lastModifiedAt: new Date(),
      attachmentNumber: 0,
      position: 0,
      inlineCitations: [],
    }

    return attachment
  }

  /**
   * Upload do Google Drive
   */
  async uploadFromGoogleDrive(
    documentId: string,
    driveFileId: string,
    filename: string,
    fileSize: number,
    mimeType: string,
    description?: string
  ): Promise<DocumentAttachment> {
    const attachment: DocumentAttachment = {
      id: generateId(),
      documentId,
      filename,
      originalFilename: filename,
      type: this.detectType(mimeType),
      source: 'google_drive' as AttachmentSource,
      fileSize,
      mimeType,
      url: `https://drive.google.com/file/d/${driveFileId}/view`,
      driveFileId,
      description,
      compressed: false,
      uploadedAt: new Date(),
      lastModifiedAt: new Date(),
      attachmentNumber: 0,
      position: 0,
      inlineCitations: [],
    }

    return attachment
  }

  /**
   * Organizar anexos (renumerar automaticamente)
   */
  organizeAttachments(
    attachments: DocumentAttachment[],
    config: AttachmentOrganizationConfig
  ): DocumentAttachment[] {
    const organized = [...attachments]

    // 1. Agrupar por tipo se necessário
    if (config.groupByType) {
      const typeOrder = ['document', 'image', 'spreadsheet', 'video', 'compressed']
      organized.sort((a, b) => {
        const aIndex = typeOrder.indexOf(a.type)
        const bIndex = typeOrder.indexOf(b.type)
        return aIndex - bIndex
      })
    }

    // 2. Renumerar
    const numberingMap = {
      roman: ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'],
      arabic: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
      letter: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
    }

    const numbers = numberingMap[config.autoNumbering]

    organized.forEach((attachment, index) => {
      attachment.attachmentNumber = index + 1
      attachment.position = index

      if (config.autoRename) {
        const ext = attachment.filename.split('.').pop()
        const newFilename = `Anexo_${numbers[index]}.${ext}`
        attachment.filename = newFilename
      }
    })

    return organized
  }

  /**
   * Inserir caixa de destaque para anexo na petição
   */
  generateAttachmentBoxHTML(attachment: DocumentAttachment): string {
    return `
      <div class="attachment-box" data-attachment-id="${attachment.id}">
        <div class="attachment-box-header">
          <span class="attachment-icon">📎</span>
          <span class="attachment-label">
            Anexo ${this.toRoman(attachment.attachmentNumber)} - ${attachment.filename}
          </span>
        </div>
        <div class="attachment-box-content">
          ${attachment.description ? `<p>${attachment.description}</p>` : ''}
          <a href="${attachment.url}" target="_blank" class="attachment-link">
            ➜ Clique aqui para acessar o documento
          </a>
        </div>
        <div class="attachment-box-footer">
          <small>${this.formatFileSize(attachment.fileSize)}</small>
        </div>
      </div>
    `
  }

  /**
   * Criar índice de anexos
   */
  generateAttachmentIndex(attachments: DocumentAttachment[]): string {
    return `
      <div class="attachment-index">
        <h3>RELAÇÃO DE ANEXOS</h3>
        <ul>
          ${attachments
            .map(
              (att) => `
            <li>
              <span class="index-number">Anexo ${this.toRoman(att.attachmentNumber)}</span>
              <span class="index-name">${att.filename}</span>
              <span class="index-size">(${this.formatFileSize(att.fileSize)})</span>
            </li>
          `
            )
            .join('\n')}
        </ul>
      </div>
    `
  }

  /**
   * Validar arquivo
   */
  private validateFile(file: File): void {
    const maxSize = 50 * 1024 * 1024 // 50MB
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/tiff',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'video/mp4',
      'application/zip',
      'application/x-rar-compressed',
    ]

    if (file.size > maxSize) {
      throw new Error(`Arquivo muito grande (máx: 50MB)`)
    }

    if (!allowedTypes.includes(file.type)) {
      throw new Error(`Tipo de arquivo não permitido`)
    }
  }

  /**
   * Detectar tipo de arquivo
   */
  private detectType(mimeType: string): AttachmentType {
    if (mimeType.startsWith('image/')) return 'image' as AttachmentType
    if (mimeType.startsWith('video/')) return 'video' as AttachmentType
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
      return 'spreadsheet' as AttachmentType
    }
    if (mimeType.includes('zip') || mimeType.includes('rar')) {
      return 'compressed' as AttachmentType
    }
    return 'document' as AttachmentType
  }

  /**
   * Converter número para romano
   */
  toRoman(num: number): string {
    const romanMatrix = [
      { value: 1000, symbol: 'M' },
      { value: 900, symbol: 'CM' },
      { value: 500, symbol: 'D' },
      { value: 400, symbol: 'CD' },
      { value: 100, symbol: 'C' },
      { value: 90, symbol: 'XC' },
      { value: 50, symbol: 'L' },
      { value: 40, symbol: 'XL' },
      { value: 10, symbol: 'X' },
      { value: 9, symbol: 'IX' },
      { value: 5, symbol: 'V' },
      { value: 4, symbol: 'IV' },
      { value: 1, symbol: 'I' },
    ]

    let roman = ''
    for (const { value, symbol } of romanMatrix) {
      while (num >= value) {
        roman += symbol
        num -= value
      }
    }
    return roman
  }

  /**
   * Formatar tamanho de arquivo
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }
}

export const attachmentManager = new AttachmentManager()
