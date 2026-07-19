/**
 * Hook de Exportação
 * Gerencia exportação de documentos em múltiplos formatos
 */

import { useState, useCallback } from 'react'
import { exportService } from '../services/exportService'
import type { LegalDocument } from '../types/editor'

interface UseExportState {
  exportando: boolean
  erro: string | null
  sucesso: boolean
  nomeArquivo: string
}

export function useExport() {
  const [estado, setEstado] = useState<UseExportState>({
    exportando: false,
    erro: null,
    sucesso: false,
    nomeArquivo: '',
  })

  const exportarPDF = useCallback(async (documento: LegalDocument, conteudo: string) => {
    setEstado((prev) => ({ ...prev, exportando: true, erro: null }))

    try {
      const { filename, blob } = await exportService.exportToPDF(documento, conteudo)
      exportService.downloadFile(blob, filename)

      setEstado({
        exportando: false,
        erro: null,
        sucesso: true,
        nomeArquivo: filename,
      })

      setTimeout(() => {
        setEstado((prev) => ({ ...prev, sucesso: false }))
      }, 3000)
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Erro desconhecido'
      setEstado({
        exportando: false,
        erro: `Erro ao exportar PDF: ${mensagem}`,
        sucesso: false,
        nomeArquivo: '',
      })
    }
  }, [])

  const exportarDOCX = useCallback(async (documento: LegalDocument, conteudo: string) => {
    setEstado((prev) => ({ ...prev, exportando: true, erro: null }))

    try {
      const { filename, blob } = await exportService.exportToDOCX(documento, conteudo)
      exportService.downloadFile(blob, filename)

      setEstado({
        exportando: false,
        erro: null,
        sucesso: true,
        nomeArquivo: filename,
      })

      setTimeout(() => {
        setEstado((prev) => ({ ...prev, sucesso: false }))
      }, 3000)
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Erro desconhecido'
      setEstado({
        exportando: false,
        erro: `Erro ao exportar DOCX: ${mensagem}`,
        sucesso: false,
        nomeArquivo: '',
      })
    }
  }, [])

  const exportarMarkdown = useCallback(async (documento: LegalDocument, conteudo: string) => {
    setEstado((prev) => ({ ...prev, exportando: true, erro: null }))

    try {
      const { filename, blob } = await exportService.exportToMarkdown(documento, conteudo)
      exportService.downloadFile(blob, filename)

      setEstado({
        exportando: false,
        erro: null,
        sucesso: true,
        nomeArquivo: filename,
      })

      setTimeout(() => {
        setEstado((prev) => ({ ...prev, sucesso: false }))
      }, 3000)
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Erro desconhecido'
      setEstado({
        exportando: false,
        erro: `Erro ao exportar Markdown: ${mensagem}`,
        sucesso: false,
        nomeArquivo: '',
      })
    }
  }, [])

  const limpar = useCallback(() => {
    setEstado({
      exportando: false,
      erro: null,
      sucesso: false,
      nomeArquivo: '',
    })
  }, [])

  return {
    exportando: estado.exportando,
    erro: estado.erro,
    sucesso: estado.sucesso,
    nomeArquivo: estado.nomeArquivo,
    exportarPDF,
    exportarDOCX,
    exportarMarkdown,
    limpar,
  }
}
