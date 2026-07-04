/**
 * useDocumentEditor Hook
 * Manages document state, auto-save, and document operations
 */

import { useState, useCallback, useEffect } from 'react'
import type { LegalDocument, TemplateType, DocumentStatus } from '../types/editor'
import { getTemplate } from '../constants/documentTemplates'

const generateId = () => crypto.randomUUID()

export function useDocumentEditor() {
  const [document, setDocument] = useState<LegalDocument | null>(null)
  const [content, setContent] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Auto-save effect (every 5 seconds when dirty)
  useEffect(() => {
    if (!isDirty || !document) return

    const timer = setTimeout(() => {
      saveDocument()
    }, 5000)

    return () => clearTimeout(timer)
  }, [isDirty, content, document])

  // Also save on window unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault()
        e.returnValue = ''
        saveDocument()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty, content, document, saveDocument])

  const createNewDocument = useCallback((templateType: TemplateType, title: string) => {

    const newDoc: LegalDocument = {
      id: generateId(),
      title,
      content: '',
      plainText: '',
      templateType,
      status: 'draft' as DocumentStatus,
      version: 1,
      abntFormat: true,
      spellCheckDone: false,
      aiAnalysisDone: false,
      characterCount: 0,
      wordCount: 0,
      pageCount: 1,
      estimatedReadingTime: 0,
      sourceQueries: [],
      linkedDocuments: [],
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastAccessedAt: new Date(),
      exportedFormats: [],
    }

    setDocument(newDoc)
    setContent('')
    setIsDirty(false)
  }, [])

  const updateContent = useCallback((newContent: string) => {
    setContent(newContent)
    setIsDirty(true)

    // Update document stats
    if (document) {
      document.characterCount = newContent.length
      document.wordCount = newContent.split(/\s+/).length
      document.updatedAt = new Date()
    }
  }, [document])

  const saveDocument = useCallback(async () => {
    if (!document) return

    setIsSaving(true)
    try {
      // Simulate saving to backend
      document.content = content
      document.plainText = content
      document.status = 'saved' as DocumentStatus
      document.updatedAt = new Date()

      // In a real app, this would be an API call
      console.log('Document saved:', document)

      setIsDirty(false)
    } catch (error) {
      console.error('Error saving document:', error)
    } finally {
      setIsSaving(false)
    }
  }, [document, content])

  return {
    document,
    content,
    isDirty,
    isSaving,
    createNewDocument,
    updateContent,
    saveDocument,
    setDocument,
  }
}
