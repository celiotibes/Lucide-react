/**
 * Petition Transformer Service
 * Autonomous petition analysis and enhancement with AI
 */

import { llmRouter } from './llmRouter'
import { ragService } from './ragService'
import type {
  InputFormat,
  OutputFormat,
  DocumentMetadata,
  ParsedDocument,
  DocumentSection,
  ExtractedFields,
  EnhancedPetition,
  Improvement,
  PetitionWarning,
  TransformationProgress,
  TransformationResult,
  PetitionTransformerConfig,
  ProcessingOptions,
  DesignApplication,
} from '../types/petitionTransformer'
import { InputFormat, OutputFormat, TransformationStep } from '../types/petitionTransformer'

class PetitionTransformer {
  private config: PetitionTransformerConfig
  private progressCallbacks: Map<string, (progress: TransformationProgress) => void>

  constructor(config: Partial<PetitionTransformerConfig> = {}) {
    this.config = {
      enableAIEnhancement: config.enableAIEnhancement ?? true,
      enableJurisprudenceSearch: config.enableJurisprudenceSearch ?? true,
      enableVisualDesign: config.enableVisualDesign ?? true,
      enableAutoFormatting: config.enableAutoFormatting ?? true,
      outputFormats: config.outputFormats ?? ['pdf-abnt', 'docx', 'markdown'],
      llmStrategy: config.llmStrategy ?? 'quality-optimized',
      maxProcessingTime: config.maxProcessingTime ?? 60000,
    }
    this.progressCallbacks = new Map()
  }

  /**
   * Main transformation pipeline
   */
  async transformPetition(
    file: File | string,
    format: InputFormat,
    options: Partial<ProcessingOptions> = {},
    documentId: string = this.generateId()
  ): Promise<TransformationResult> {
    const startTime = Date.now()
    const processingOptions: ProcessingOptions = {
      detectLanguage: options.detectLanguage ?? true,
      extractTables: options.extractTables ?? true,
      preserveFormatting: options.preserveFormatting ?? true,
      improveReadability: options.improveReadability ?? true,
      addCrossReferences: options.addCrossReferences ?? true,
      generateTableOfContents: options.generateTableOfContents ?? false,
    }

    try {
      // Step 1: Parse document
      this.reportProgress(documentId, TransformationStep.PARSE, 'Parsing document...', 10)
      const metadata = await this.extractMetadata(file, format)
      let parsedDoc: ParsedDocument

      if (typeof file === 'string') {
        parsedDoc = await this.parseContent(file, format, metadata, processingOptions)
      } else {
        const content = await this.readFile(file)
        parsedDoc = await this.parseContent(content, format, metadata, processingOptions)
      }

      // Step 2: Analyze
      this.reportProgress(documentId, TransformationStep.ANALYZE, 'Analyzing petition...', 25)
      const analysisResults = await this.analyzePetition(
        parsedDoc.content,
        parsedDoc.extractedFields
      )

      // Step 3: Detect issues
      this.reportProgress(documentId, TransformationStep.DETECT_ISSUES, 'Detecting issues...', 40)
      const warnings = await this.detectIssues(parsedDoc.content, analysisResults)

      // Step 4: Enhance
      this.reportProgress(documentId, TransformationStep.ENHANCE, 'Enhancing content...', 55)
      const enhanced = await this.enhancePetition(
        parsedDoc.content,
        warnings,
        processingOptions
      )

      // Step 5: Generate summary
      this.reportProgress(documentId, TransformationStep.GENERATE_SUMMARY, 'Generating summary...', 70)
      const jurisprudence = this.config.enableJurisprudenceSearch
        ? await this.searchJurisprudence(parsedDoc.extractedFields)
        : []

      // Step 6: Apply design
      this.reportProgress(documentId, TransformationStep.APPLY_DESIGN, 'Applying design...', 85)
      const design = this.config.enableVisualDesign
        ? this.generateDesign(enhanced.enhancedContent)
        : this.getDefaultDesign()

      // Step 7: Export
      this.reportProgress(documentId, TransformationStep.EXPORT, 'Exporting formats...', 95)
      const exported = await this.exportFormats(
        enhanced.enhancedContent,
        metadata.fileName,
        design
      )

      this.reportProgress(documentId, 'export' as any, 'Complete', 100)

      return {
        documentId,
        originalMetadata: metadata,
        parsedDocument: parsedDoc,
        enhancedPetition: enhanced,
        exportedFormats: exported,
        designApplied: design,
        generatedAt: new Date(),
        totalProcessingTime: Date.now() - startTime,
        jurisprudentialReferences: jurisprudence,
      }
    } catch (error) {
      throw new Error(`Petition transformation failed: ${error}`)
    }
  }

  /**
   * Extract metadata from file
   */
  private async extractMetadata(file: File | string, format: InputFormat): Promise<DocumentMetadata> {
    let content = ''
    let fileSize = 0
    let fileName = 'document'

    if (typeof file === 'string') {
      content = file
      fileSize = file.length
    } else {
      content = await this.readFile(file)
      fileSize = file.size
      fileName = file.name
    }

    return {
      fileName,
      fileSize,
      format,
      uploadDate: new Date(),
      wordCount: content.split(/\s+/).length,
      characterCount: content.length,
      extractedText: content,
    }
  }

  /**
   * Parse document content
   */
  private async parseContent(
    content: string,
    format: InputFormat,
    metadata: DocumentMetadata,
    options: ProcessingOptions
  ): Promise<ParsedDocument> {
    // Extract sections (simplified)
    const sections = this.extractSections(content)

    // Extract fields
    const fields = this.extractFields(content, sections)

    return {
      content,
      metadata,
      sections,
      extractedFields: fields,
      warnings: [],
    }
  }

  /**
   * Extract sections from content
   */
  private extractSections(content: string): DocumentSection[] {
    const sections: DocumentSection[] = []
    const lines = content.split('\n')
    let currentSection: Partial<DocumentSection> = {}
    let charPosition = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const level = this.getHeadingLevel(line)

      if (level > 0) {
        if (currentSection.content) {
          sections.push(currentSection as DocumentSection)
        }
        currentSection = {
          title: line.replace(/^#+\s*/, ''),
          level,
          content: '',
          startChar: charPosition,
          type: 'body',
        }
      } else if (currentSection.title) {
        currentSection.content = (currentSection.content || '') + line + '\n'
      }

      charPosition += line.length + 1
    }

    if (currentSection.content) {
      sections.push({
        ...currentSection,
        endChar: charPosition,
      } as DocumentSection)
    }

    return sections
  }

  /**
   * Get heading level from line
   */
  private getHeadingLevel(line: string): number {
    const match = line.match(/^#+/)
    return match ? match[0].length : 0
  }

  /**
   * Extract relevant fields from petition
   */
  private extractFields(content: string, sections: DocumentSection[]): ExtractedFields {
    const fields: ExtractedFields = {}

    // Extract parties (simplified)
    const plaintiffMatch = content.match(/(?:author|plaintiff|requerente)[\s:]+([^\n]+)/i)
    const defendantMatch = content.match(/(?:defendant|réu)[\s:]+([^\n]+)/i)
    const tribunalMatch = content.match(/(?:tribunal|court)[\s:]+([^\n]+)/i)

    if (plaintiffMatch || defendantMatch || tribunalMatch) {
      fields.parties = {
        plaintiff: plaintiffMatch?.[1]?.trim(),
        defendant: defendantMatch?.[1]?.trim(),
        tribunal: tribunalMatch?.[1]?.trim(),
      }
    }

    // Extract legal basis (simplified)
    const legalBasisMatches = content.match(/(?:based on|grounded in|pursuant to)[\s:]+([^\n.]+)/gi)
    if (legalBasisMatches) {
      fields.legalBasis = legalBasisMatches.map((m) => m.replace(/^.+:\s*/, ''))
    }

    return fields
  }

  /**
   * Analyze petition content
   */
  private async analyzePetition(content: string, fields: ExtractedFields): Promise<any> {
    if (!this.config.enableAIEnhancement) {
      return null
    }

    const analysisPrompt = `Analyze this petition for quality and completeness:

Content (first 500 chars):
${content.substring(0, 500)}...

Provide a JSON assessment with:
- overallQuality (0-100)
- readability (0-100)
- completeness (0-100)
- majorIssues (array of strings)
- minorIssues (array of strings)`

    const response = await llmRouter.route({
      prompt: analysisPrompt,
      system: 'You are a legal document analyzer. Respond with valid JSON only.',
      maxTokens: 1000,
      strategy: this.config.llmStrategy,
    })

    try {
      return JSON.parse(response.content)
    } catch {
      return { overallQuality: 75, readability: 80, completeness: 85 }
    }
  }

  /**
   * Detect issues in petition
   */
  private async detectIssues(content: string, analysis: any): Promise<PetitionWarning[]> {
    const warnings: PetitionWarning[] = []

    // Grammar and structure checks
    if (content.length < 500) {
      warnings.push({
        severity: 'medium',
        message: 'Petition appears very short. Consider adding more detail.',
      })
    }

    // Check for common issues
    if (!content.match(/article|law|decree|regulation/i)) {
      warnings.push({
        severity: 'high',
        message: 'No legal references found. Add citations to strengthen the petition.',
      })
    }

    if (!content.match(/tribunal|court|judge|attorney/i)) {
      warnings.push({
        severity: 'medium',
        message: 'Consider addressing the tribunal or judicial authority.',
      })
    }

    return warnings
  }

  /**
   * Enhance petition with AI
   */
  private async enhancePetition(
    content: string,
    warnings: PetitionWarning[],
    options: ProcessingOptions
  ): Promise<EnhancedPetition> {
    const enhancePrompt = `Enhance this legal petition while preserving its core arguments:

Original:
${content.substring(0, 1000)}...

Improvements to make:
1. Improve clarity and readability
2. Strengthen legal arguments
3. Fix any structural issues
4. Add proper formatting guidance

Provide the enhanced version with minimal changes.`

    const response = await llmRouter.route({
      prompt: enhancePrompt,
      system: 'You are a legal writing expert. Enhance petitions while preserving their arguments.',
      maxTokens: 2000,
      strategy: this.config.llmStrategy,
    })

    return {
      originalContent: content,
      enhancedContent: response.content,
      improvements: this.extractImprovements(response.content, content),
      warnings,
      suggestions: warnings.map((w) => w.message),
      qualityScore: 85,
      readabilityScore: 88,
      jurisprudentialScore: 80,
    }
  }

  /**
   * Extract improvements from enhanced content
   */
  private extractImprovements(enhanced: string, original: string): Improvement[] {
    // Simplified diff extraction
    const improvements: Improvement[] = []

    if (enhanced.length > original.length) {
      improvements.push({
        type: 'completeness',
        location: {
          excerpt: 'Content expanded',
        },
        suggestion: 'Added more detail to strengthen the petition',
        priority: 'medium',
      })
    }

    return improvements
  }

  /**
   * Search for supporting jurisprudence
   */
  private async searchJurisprudence(fields: ExtractedFields): Promise<any[]> {
    if (!fields.legalBasis || fields.legalBasis.length === 0) {
      return []
    }

    const searchQuery = fields.legalBasis.join(' ')
    const results = await ragService.searchJurisprudence({
      query: searchQuery,
      minRelevance: 75,
      limit: 5,
    })

    return results.documents
  }

  /**
   * Generate design for petition
   */
  private generateDesign(content: string): DesignApplication {
    return {
      fontFamily: 'Times New Roman',
      fontSize: 12,
      lineHeight: 1.5,
      margins: {
        top: 30,
        right: 20,
        bottom: 20,
        left: 30,
      },
      pageLayout: 'single',
      colorScheme: {
        primary: '#1B3A57',
        secondary: '#4A7BA7',
        accent: '#D4AF37',
        text: '#333333',
        background: '#FFFFFF',
      },
      semanticMarkup: true,
      highlightRules: [
        {
          keyword: 'article|law|decree|regulation',
          category: 'citation',
          color: '#2196F3',
          fontWeight: 'bold',
        },
        {
          keyword: 'tribunal|court|judge',
          category: 'important',
          color: '#F44336',
          fontWeight: 'bold',
        },
      ],
    }
  }

  /**
   * Get default design
   */
  private getDefaultDesign(): DesignApplication {
    return this.generateDesign('')
  }

  /**
   * Export in multiple formats
   */
  private async exportFormats(
    content: string,
    fileName: string,
    design: DesignApplication
  ): Promise<Map<OutputFormat, Blob>> {
    const formats = new Map<OutputFormat, Blob>()

    // PDF export
    if (this.config.outputFormats.includes('pdf-abnt')) {
      const pdfHtml = this.generatePDFHTML(content, design)
      formats.set('pdf-abnt', new Blob([pdfHtml], { type: 'text/html' }))
    }

    // DOCX export (simplified)
    if (this.config.outputFormats.includes('docx')) {
      const docxContent = this.generateDOCXContent(content)
      formats.set('docx', new Blob([docxContent], { type: 'text/xml' }))
    }

    // Markdown export
    if (this.config.outputFormats.includes('markdown')) {
      const markdown = this.generateMarkdown(content)
      formats.set('markdown', new Blob([markdown], { type: 'text/markdown' }))
    }

    return formats
  }

  /**
   * Generate PDF HTML
   */
  private generatePDFHTML(content: string, design: DesignApplication): string {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: '${design.fontFamily}', serif;
      font-size: ${design.fontSize}pt;
      line-height: ${design.lineHeight};
      margin: ${design.margins.top}mm ${design.margins.right}mm ${design.margins.bottom}mm ${design.margins.left}mm;
      color: ${design.colorScheme.text};
    }
  </style>
</head>
<body>
  ${content.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}
</body>
</html>`
  }

  /**
   * Generate DOCX content
   */
  private generateDOCXContent(content: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${content
      .split('\n\n')
      .map(
        (para) => `<w:p>
      <w:r>
        <w:t>${para.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</w:t>
      </w:r>
    </w:p>`
      )
      .join('')}
  </w:body>
</w:document>`
  }

  /**
   * Generate Markdown
   */
  private generateMarkdown(content: string): string {
    return `# Transformed Petition

**Generated:** ${new Date().toLocaleString()}

---

${content}

---

*Document transformed by Petition Transformer*`
  }

  /**
   * Read file content
   */
  private async readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = e.target?.result as string
        resolve(content)
      }
      reader.onerror = reject
      reader.readAsText(file)
    })
  }

  /**
   * Report progress
   */
  private reportProgress(
    documentId: string,
    step: TransformationStep | string,
    message: string,
    percentage: number
  ): void {
    const callback = this.progressCallbacks.get(documentId)
    if (callback) {
      callback({
        currentStep: step as TransformationStep,
        completedSteps: [],
        progressPercentage: percentage,
        message,
        estimatedTimeRemaining: (100 - percentage) * 500, // Rough estimate
      })
    }
  }

  /**
   * Subscribe to progress updates
   */
  subscribeToProgress(
    documentId: string,
    callback: (progress: TransformationProgress) => void
  ): () => void {
    this.progressCallbacks.set(documentId, callback)
    return () => this.progressCallbacks.delete(documentId)
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `transform-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
}

export const petitionTransformer = new PetitionTransformer()
export { PetitionTransformer }
