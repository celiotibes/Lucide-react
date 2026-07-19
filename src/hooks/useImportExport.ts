/**
 * Hook de Import/Export
 * Gerencia operações de importação e exportação
 */

import { useState, useCallback } from 'react'
import { servicoImportExport, type FormatoExportacao } from '../services/importExportService'

interface UseImportExportState {
  exportando: boolean
  importando: boolean
  erro: string | null
  sucesso: string | null
}

export function useImportExport() {
  const [estado, setEstado] = useState<UseImportExportState>({
    exportando: false,
    importando: false,
    erro: null,
    sucesso: null,
  })

  const exportarDocumento = useCallback(
    (documentoId: string, formato: FormatoExportacao, nomeArquivo?: string) => {
      setEstado(prev => ({
        ...prev,
        exportando: true,
        erro: null,
        sucesso: null,
      }))

      try {
        const conteúdo = servicoImportExport.exportarDocumento(documentoId, {
          formato,
          incluirVersões: true,
          incluirMetadados: true,
        })

        const extensões: Record<FormatoExportacao, string> = {
          json: '.json',
          markdown: '.md',
          'texto-plano': '.txt',
          html: '.html',
          backup: '.backup.json',
        }

        const nomeFile = nomeArquivo || `documento-${Date.now()}${extensões[formato]}`

        const tipos: Record<FormatoExportacao, string> = {
          json: 'application/json',
          markdown: 'text/markdown',
          'texto-plano': 'text/plain',
          html: 'text/html',
          backup: 'application/json',
        }

        servicoImportExport.gerarDownload(conteúdo, nomeFile, tipos[formato])

        setEstado({
          exportando: false,
          importando: false,
          erro: null,
          sucesso: `Documento exportado como ${nomeFile}`,
        })
      } catch (erro) {
        const mensagem = erro instanceof Error ? erro.message : 'Erro ao exportar'
        setEstado(prev => ({
          ...prev,
          exportando: false,
          erro: mensagem,
        }))
      }
    },
    []
  )

  const exportarBackupCompleto = useCallback(() => {
    setEstado(prev => ({
      ...prev,
      exportando: true,
      erro: null,
      sucesso: null,
    }))

    try {
      const conteúdo = servicoImportExport.exportarBackupCompleto()
      const nomeArquivo = `backup-lucide-${new Date().toISOString().split('T')[0]}.json`

      servicoImportExport.gerarDownload(conteúdo, nomeArquivo, 'application/json')

      setEstado({
        exportando: false,
        importando: false,
        erro: null,
        sucesso: `Backup completo exportado como ${nomeArquivo}`,
      })
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Erro ao exportar backup'
      setEstado(prev => ({
        ...prev,
        exportando: false,
        erro: mensagem,
      }))
    }
  }, [])

  const importarDocumento = useCallback((json: string) => {
    setEstado(prev => ({
      ...prev,
      importando: true,
      erro: null,
      sucesso: null,
    }))

    const resultado = servicoImportExport.importarDocumento(json)

    if (resultado.sucesso) {
      setEstado({
        exportando: false,
        importando: false,
        erro: null,
        sucesso: resultado.mensagem,
      })
      return { sucesso: true, documentoId: resultado.documentoId }
    } else {
      setEstado(prev => ({
        ...prev,
        importando: false,
        erro: resultado.mensagem,
      }))
      return { sucesso: false }
    }
  }, [])

  const importarBackupCompleto = useCallback((json: string) => {
    setEstado(prev => ({
      ...prev,
      importando: true,
      erro: null,
      sucesso: null,
    }))

    const resultado = servicoImportExport.importarBackupCompleto(json)

    if (resultado.sucesso) {
      const mensagem = `${resultado.importados} documento(s) importado(s) com sucesso${resultado.erros.length > 0 ? ` (${resultado.erros.length} erro(s))` : ''}`
      setEstado({
        exportando: false,
        importando: false,
        erro: resultado.erros.length > 0 ? resultado.erros.join('\n') : null,
        sucesso: mensagem,
      })
      return { sucesso: true, importados: resultado.importados }
    } else {
      setEstado(prev => ({
        ...prev,
        importando: false,
        erro: resultado.erros[0] || 'Erro ao importar backup',
      }))
      return { sucesso: false, importados: 0 }
    }
  }, [])

  const limparMensagens = useCallback(() => {
    setEstado(prev => ({
      ...prev,
      erro: null,
      sucesso: null,
    }))
  }, [])

  return {
    exportando: estado.exportando,
    importando: estado.importando,
    erro: estado.erro,
    sucesso: estado.sucesso,
    exportarDocumento,
    exportarBackupCompleto,
    importarDocumento,
    importarBackupCompleto,
    limparMensagens,
  }
}
