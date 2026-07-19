/**
 * Hook de Integração Documento
 * Conecta servicoDocumento com useDocumentEditor para persistência
 */

import { useState, useCallback, useEffect } from 'react'
import { servicoDocumento } from '../services/documentService'
import type { Documento } from '../types/document'
import type { LegalDocument, TemplateType } from '../types/editor'

interface UseDocumentIntegrationProps {
  documentId?: string
  tipoDocumento?: 'editor-novo' | 'editor' | 'analise' | 'transformacao'
}

const converterParaLegalDocument = (doc: Documento, template: TemplateType): LegalDocument => ({
  id: doc.id,
  title: doc.titulo,
  content: doc.conteudo,
  plainText: doc.conteudo,
  templateType: template,
  status: doc.status === 'rascunho' ? 'draft' : doc.status === 'ativo' ? 'saved' : 'archived',
  version: doc.versoes ? doc.versoes.length : 1,
  abntFormat: true,
  spellCheckDone: false,
  aiAnalysisDone: false,
  characterCount: doc.conteudo.length,
  wordCount: doc.conteudo.split(/\s+/).filter(w => w.length > 0).length,
  pageCount: Math.ceil(doc.conteudo.length / 2000),
  estimatedReadingTime: Math.ceil(doc.conteudo.split(/\s+/).length / 200),
  sourceQueries: [],
  linkedDocuments: [],
  tags: [],
  createdAt: new Date(doc.dataCriacao),
  updatedAt: new Date(doc.dataModificacao),
  lastAccessedAt: new Date(),
  exportedFormats: [],
})

const converterDoLegalDocument = (doc: LegalDocument): Omit<Documento, 'versoes' | 'dataCriacao' | 'dataModificacao'> => ({
  id: doc.id,
  titulo: doc.title,
  tipo: 'editor-novo',
  areaJuridica: 'civil',
  conteudo: doc.content,
  status: doc.status === 'draft' ? 'rascunho' : doc.status === 'saved' ? 'ativo' : 'arquivado',
  tamanho: doc.content.length,
})

export function useDocumentIntegration({ documentId, tipoDocumento = 'editor-novo' }: UseDocumentIntegrationProps) {
  const [document, setDocument] = useState<LegalDocument | null>(null)
  const [content, setContent] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Carregar documento ao montar
  useEffect(() => {
    if (documentId) {
      const doc = servicoDocumento.carregarDocumento(documentId, {
        incluirVersoes: true,
        incluirMetadata: true,
      })

      if (doc) {
        const templateTypeMap: Record<string, TemplateType> = {
          'editor-novo': 'petition',
          'editor': 'petition',
          'analise': 'analysis',
          'transformacao': 'petition',
        }
        const legalDoc = converterParaLegalDocument(doc, templateTypeMap[tipoDocumento])
        setDocument(legalDoc)
        setContent(doc.conteudo)
        setIsDirty(false)
      } else {
        setErro(`Documento ${documentId} não encontrado`)
      }
    }
  }, [documentId, tipoDocumento])

  // Auto-save a cada 30 segundos quando há mudanças
  useEffect(() => {
    if (!isDirty || !document) return

    const timer = setInterval(() => {
      salvarDocumento()
    }, 30000)

    return () => clearInterval(timer)
  }, [isDirty, document, content])

  const criarNovoDocumento = useCallback((titulo: string, areaJuridica: string = 'civil') => {
    const templateTypeMap: Record<string, TemplateType> = {
      'editor-novo': 'petition',
      'editor': 'petition',
      'analise': 'analysis',
      'transformacao': 'petition',
    }

    const docCriado = servicoDocumento.criarDocumento({
      titulo,
      tipo: tipoDocumento,
      areaJuridica,
      conteudoInicial: '',
      autor: 'Usuário',
    })

    const legalDoc = converterParaLegalDocument(docCriado, templateTypeMap[tipoDocumento])
    setDocument(legalDoc)
    setContent('')
    setIsDirty(false)
    setErro(null)

    return docCriado.id
  }, [tipoDocumento])

  const atualizarConteudo = useCallback((novoConteudo: string) => {
    setContent(novoConteudo)
    setIsDirty(true)

    if (document) {
      setDocument(prev => prev ? {
        ...prev,
        characterCount: novoConteudo.length,
        wordCount: novoConteudo.split(/\s+/).filter(w => w.length > 0).length,
        updatedAt: new Date(),
      } : null)
    }
  }, [document])

  const salvarDocumento = useCallback(async () => {
    if (!document) return

    setIsSaving(true)
    try {
      const resultado = servicoDocumento.salvarDocumento({
        id: document.id,
        titulo: document.title,
        tipo: tipoDocumento,
        areaJuridica: 'civil',
        conteudo: content,
        html: content,
        dataCriacao: document.createdAt,
        dataModificacao: new Date(),
        autor: 'Usuário',
        status: document.status === 'draft' ? 'rascunho' : 'ativo',
        tags: document.tags,
        versoes: [],
      })

      if (resultado.sucesso) {
        setIsDirty(false)
        setErro(null)
        setDocument(prev => prev ? {
          ...prev,
          status: 'saved',
          version: resultado.versao,
          updatedAt: resultado.timestamp,
        } : null)
      } else {
        setErro(resultado.mensagem || 'Erro ao salvar documento')
      }
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : 'Erro desconhecido ao salvar'
      setErro(mensagem)
    } finally {
      setIsSaving(false)
    }
  }, [document, content, tipoDocumento])

  const salvarManualmente = useCallback(async () => {
    return salvarDocumento()
  }, [salvarDocumento])

  const atualizarMetadados = useCallback((atualizacoes: Partial<LegalDocument>) => {
    if (!document) return false

    const sucesso = servicoDocumento.atualizarMetadados(document.id, {
      titulo: atualizacoes.title || document.title,
      areaJuridica: 'civil',
      status: atualizacoes.status === 'draft' ? 'rascunho' : 'ativo',
    })

    if (sucesso) {
      setDocument(prev => prev ? { ...prev, ...atualizacoes } : null)
      return true
    }
    return false
  }, [document])

  const fechar = useCallback(() => {
    if (isDirty) {
      return !confirm('Há mudanças não salvas. Deseja sair sem salvar?')
    }
    setDocument(null)
    setContent('')
    return true
  }, [isDirty])

  return {
    document,
    content,
    isDirty,
    isSaving,
    erro,
    criarNovoDocumento,
    atualizarConteudo,
    salvarDocumento,
    salvarManualmente,
    atualizarMetadados,
    fechar,
  }
}
