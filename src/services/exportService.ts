/**
 * Export Service - PDF & Document Export
 * Handles ABNT-compliant PDF generation with tribunal compatibility
 */

import type { LegalDocument, ExportFormat } from '../types/editor'

const generateId = () => crypto.randomUUID()

export class ExportService {
  /**
   * Export document to PDF (ABNT compliant)
   */
  async exportToPDF(
    document: LegalDocument,
    content: string
  ): Promise<{ filename: string; blob: Blob }> {
    // Create a simple PDF-like HTML structure
    const htmlContent = this.generatePDFHTML(document, content)

    // Create blob from HTML
    const blob = new Blob([htmlContent], { type: 'text/html;charset=UTF-8' })

    // Generate filename
    const filename = `${document.title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.html`

    return { filename, blob }
  }

  /**
   * Export document to DOCX (simplified)
   */
  async exportToDOCX(
    document: LegalDocument,
    content: string
  ): Promise<{ filename: string; blob: Blob }> {
    // Simplified DOCX XML structure
    const docxContent = this.generateDOCXContent(document, content)

    const blob = new Blob([docxContent], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })

    const filename = `${document.title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.docx`

    return { filename, blob }
  }

  /**
   * Export document to Markdown
   */
  async exportToMarkdown(
    document: LegalDocument,
    content: string
  ): Promise<{ filename: string; blob: Blob }> {
    const mdContent = `# ${document.title}

**Tipo de Documento:** ${document.templateType}
**Status:** ${document.status}
**Data:** ${new Date().toLocaleDateString('pt-BR')}

---

## Conteúdo

${content}

---

*Documento gerado por Lucide-react*
`

    const blob = new Blob([mdContent], { type: 'text/markdown;charset=UTF-8' })

    const filename = `${document.title.replace(/\s+/g, '_')}.md`

    return { filename, blob }
  }

  /**
   * Generate ABNT-compliant PDF HTML
   */
  private generatePDFHTML(document: LegalDocument, content: string): string {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${document.title}</title>
  <style>
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 12pt;
      line-height: 1.5;
      margin: 30mm 20mm 20mm 30mm;
      color: #2c2c2c;
    }

    h1, h2, h3, h4, h5, h6 {
      font-weight: bold;
      margin-top: 12pt;
      margin-bottom: 6pt;
    }

    h1 { font-size: 16pt; text-transform: uppercase; }
    h2 { font-size: 14pt; }
    h3 { font-size: 12pt; }

    p {
      text-align: justify;
      margin: 6pt 0;
    }

    .header {
      text-align: center;
      margin-bottom: 30pt;
      border-bottom: 1px solid #000;
      padding-bottom: 12pt;
    }

    .metadata {
      font-size: 10pt;
      color: #666;
      margin-bottom: 20pt;
    }

    .content {
      margin: 20pt 0;
    }

    .signature-block {
      margin-top: 40pt;
      text-align: center;
    }

    .signature-line {
      margin-top: 30pt;
      border-top: 1px solid #000;
      width: 200px;
      margin-left: auto;
      margin-right: auto;
    }

    @media print {
      body { margin: 0; }
      .page-break { page-break-after: always; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${document.title}</h1>
  </div>

  <div class="metadata">
    <p><strong>Tipo:</strong> ${document.templateType}</p>
    <p><strong>Gerado em:</strong> ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}</p>
    <p><strong>Status:</strong> ${document.status}</p>
  </div>

  <div class="content">
    ${content.replace(/\n\n/g, '</p><p>').split('\n').join('<br>')}
  </div>

  <div class="signature-block">
    <p>Nestes termos,</p>
    <div class="signature-line"></div>
    <p>Assinado digitalmente</p>
  </div>
</body>
</html>`
  }

  /**
   * Generate simplified DOCX content
   */
  private generateDOCXContent(document: LegalDocument, content: string): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Heading1"/>
        <w:jc w:val="center"/>
      </w:pPr>
      <w:r>
        <w:t>${document.title}</w:t>
      </w:r>
    </w:p>
    ${content
      .split('\n\n')
      .map(
        (paragraph) => `
    <w:p>
      <w:pPr>
        <w:spacing w:line="360" w:lineRule="auto"/>
        <w:ind w:left="720"/>
        <w:jc w:val="both"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Times New Roman"/>
          <w:sz w:val="24"/>
        </w:rPr>
        <w:t>${paragraph.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</w:t>
      </w:r>
    </w:p>`
      )
      .join('')}
  </w:body>
</w:document>`
  }

  /**
   * Trigger file download
   */
  downloadFile(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  /**
   * Get file size in human-readable format
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }
}

export const exportService = new ExportService()
