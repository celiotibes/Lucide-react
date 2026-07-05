/**
 * Hook de PDF Export
 * Gerencia exportação de documentos como PDF
 */

import { useState, useCallback } from 'react'
import { servicoPDFExport } from '../services/pdfExportService'
import type { OpcoesPDFExport, CapaDocumento } from '../types/pdfExport'

interface UsePDFExportState {
  exportando: boolean
  erro: string | null
  sucesso: string | null
}

export function usePDFExport() {
  const [estado, setEstado] = useState<UsePDFExportState>({
    exportando: false,
    erro: null,
    sucesso: null,
  })

  const obterOpcoesPadrao = useCallback((): OpcoesPDFExport => {
    return {
      tamanho: 'A4',
      orientacao: 'portrait',
      incluirCapa: false,
      incluirIndice: false,
      incluirRodape: true,
      incluirNumeroPagina: true,
      incluirAssinatura: false,
      margemTop: 20,
      margemBottom: 20,
      margemLeft: 20,
      margemRight: 20,
      qualidadeImagem: 'media',
      comprimido: false,
    }
  }, [])

  const exportarPDF = useCallback((documentoId: string, opcoes?: Partial<OpcoesPDFExport>) => {
    setEstado({
      exportando: true,
      erro: null,
      sucesso: null,
    })

    const opcoesCompletas = {
      ...obterOpcoesPadrao(),
      ...opcoes,
    }

    const resultado = servicoPDFExport.exportarPDF(documentoId, opcoesCompletas)

    if (resultado.sucesso) {
      setEstado({
        exportando: false,
        erro: null,
        sucesso: resultado.mensagem,
      })
      return { sucesso: true, nomeArquivo: resultado.nomeArquivo, tamanhoKB: resultado.tamanhoKB }
    } else {
      setEstado({
        exportando: false,
        erro: resultado.mensagem,
        sucesso: null,
      })
      return { sucesso: false }
    }
  }, [obterOpcoesPadrao])

  const exportarPDFComCapa = useCallback(
    (documentoId: string, capa: CapaDocumento, opcoes?: Partial<OpcoesPDFExport>) => {
      setEstado({
        exportando: true,
        erro: null,
        sucesso: null,
      })

      const opcoesCompletas = {
        ...obterOpcoesPadrao(),
        ...opcoes,
      }

      const resultado = servicoPDFExport.exportarPDFComCapa(documentoId, capa, opcoesCompletas)

      if (resultado.sucesso) {
        setEstado({
          exportando: false,
          erro: null,
          sucesso: resultado.mensagem,
        })
        return { sucesso: true, nomeArquivo: resultado.nomeArquivo, tamanhoKB: resultado.tamanhoKB }
      } else {
        setEstado({
          exportando: false,
          erro: resultado.mensagem,
          sucesso: null,
        })
        return { sucesso: false }
      }
    },
    [obterOpcoesPadrao]
  )

  const exportarMultiplosPDF = useCallback(
    (documentoIds: string[], opcoes?: Partial<OpcoesPDFExport>, nomeArquivo?: string) => {
      setEstado({
        exportando: true,
        erro: null,
        sucesso: null,
      })

      const opcoesCompletas = {
        ...obterOpcoesPadrao(),
        ...opcoes,
      }

      const resultado = servicoPDFExport.exportarMultiplosPDF(
        documentoIds,
        opcoesCompletas,
        nomeArquivo
      )

      if (resultado.sucesso) {
        setEstado({
          exportando: false,
          erro: null,
          sucesso: resultado.mensagem,
        })
        return { sucesso: true, nomeArquivo: resultado.nomeArquivo, tamanhoKB: resultado.tamanhoKB }
      } else {
        setEstado({
          exportando: false,
          erro: resultado.mensagem,
          sucesso: null,
        })
        return { sucesso: false }
      }
    },
    [obterOpcoesPadrao]
  )

  const obterTamanhosPagina = useCallback(() => {
    return servicoPDFExport.obterTamanhosPagina()
  }, [])

  const obterQualidadesImagem = useCallback(() => {
    return servicoPDFExport.obterQualidadesImagem()
  }, [])

  const limparMensagens = useCallback(() => {
    setEstado({
      exportando: false,
      erro: null,
      sucesso: null,
    })
  }, [])

  return {
    exportando: estado.exportando,
    erro: estado.erro,
    sucesso: estado.sucesso,
    exportarPDF,
    exportarPDFComCapa,
    exportarMultiplosPDF,
    obterOpcoesPadrao,
    obterTamanhosPagina,
    obterQualidadesImagem,
    limparMensagens,
  }
}
