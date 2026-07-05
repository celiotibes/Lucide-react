/**
 * Hook de Gerenciamento de Documentos
 * Gerencia documento atual, auto-save, versioning
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { servicoDocumento } from '../services/documentService'
import type { Documento, OpcoesCriacao, ResultadoSave } from '../types/document'

interface UseDocumentState {
  documento: Documento | null
  salvando: boolean
  erro: string | null
  ultimoSalvo?: Date
  mudancasNaoSalvas: boolean
}

const AUTO_SAVE_INTERVALO = 30000 // 30 segundos

export function useDocument() {
  const [estado, setEstado] = useState<UseDocumentState>({
    documento: null,
    salvando: false,
    erro: null,
    mudancasNaoSalvas: false,
  })

  const intervalId = useRef<NodeJS.Timeout | null>(null)
  const ultimoConteudoRef = useRef<string>('')

  // Auto-save
  useEffect(() => {
    intervalId.current = setInterval(() => {
      if (estado.documento && estado.mudancasNaoSalvas) {
        salvarAutomaticamente()
      }
    }, AUTO_SAVE_INTERVALO)

    return () => {
      if (intervalId.current) {
        clearInterval(intervalId.current)
      }
    }
  }, [estado.documento, estado.mudancasNaoSalvas])

  const criarDocumento = useCallback((opcoes: OpcoesCriacao) => {
    try {
      const novoDoc = servicoDocumento.criarDocumento(opcoes)
      ultimoConteudoRef.current = novoDoc.conteudo

      setEstado({
        documento: novoDoc,
        salvando: false,
        erro: null,
        ultimoSalvo: new Date(),
        mudancasNaoSalvas: false,
      })

      return novoDoc
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Erro desconhecido'
      setEstado((prev) => ({
        ...prev,
        erro: `Erro ao criar documento: ${mensagem}`,
      }))
      return null
    }
  }, [])

  const carregarDocumento = useCallback((documentoId: string) => {
    try {
      const doc = servicoDocumento.carregarDocumento(documentoId, {
        incluirVersoes: true,
        incluirMetadata: true,
      })

      if (!doc) {
        setEstado((prev) => ({
          ...prev,
          erro: 'Documento não encontrado',
        }))
        return null
      }

      ultimoConteudoRef.current = doc.conteudo

      setEstado({
        documento: doc,
        salvando: false,
        erro: null,
        ultimoSalvo: new Date(doc.dataModificacao),
        mudancasNaoSalvas: false,
      })

      return doc
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Erro desconhecido'
      setEstado((prev) => ({
        ...prev,
        erro: `Erro ao carregar documento: ${mensagem}`,
      }))
      return null
    }
  }, [])

  const atualizarConteudo = useCallback((novoConteudo: string, html?: string) => {
    setEstado((prev) => {
      if (!prev.documento) return prev

      return {
        ...prev,
        documento: {
          ...prev.documento,
          conteudo: novoConteudo,
          html,
        },
        mudancasNaoSalvas: ultimoConteudoRef.current !== novoConteudo,
      }
    })
  }, [])

  const salvarAutomaticamente = useCallback(async () => {
    if (!estado.documento || !estado.mudancasNaoSalvas) return

    setEstado((prev) => ({
      ...prev,
      salvando: true,
    }))

    try {
      const resultado = servicoDocumento.salvarDocumento(estado.documento)

      if (resultado.sucesso) {
        ultimoConteudoRef.current = estado.documento.conteudo
        setEstado((prev) => ({
          ...prev,
          salvando: false,
          erro: null,
          ultimoSalvo: resultado.timestamp,
          mudancasNaoSalvas: false,
        }))
      } else {
        setEstado((prev) => ({
          ...prev,
          salvando: false,
          erro: resultado.mensagem || 'Erro ao salvar automaticamente',
        }))
      }
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Erro desconhecido'
      setEstado((prev) => ({
        ...prev,
        salvando: false,
        erro: mensagem,
      }))
    }
  }, [estado.documento, estado.mudancasNaoSalvas])

  const salvarManualmente = useCallback(async () => {
    if (!estado.documento) {
      setEstado((prev) => ({
        ...prev,
        erro: 'Nenhum documento carregado',
      }))
      return null
    }

    setEstado((prev) => ({
      ...prev,
      salvando: true,
      erro: null,
    }))

    try {
      const resultado = servicoDocumento.salvarDocumento(estado.documento)

      if (resultado.sucesso) {
        ultimoConteudoRef.current = estado.documento.conteudo
        setEstado((prev) => ({
          ...prev,
          salvando: false,
          erro: null,
          ultimoSalvo: resultado.timestamp,
          mudancasNaoSalvas: false,
        }))
        return resultado
      } else {
        setEstado((prev) => ({
          ...prev,
          salvando: false,
          erro: resultado.mensagem || 'Erro ao salvar',
        }))
        return null
      }
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Erro desconhecido'
      setEstado((prev) => ({
        ...prev,
        salvando: false,
        erro: mensagem,
      }))
      return null
    }
  }, [estado.documento])

  const atualizarMetadados = useCallback(
    (atualizacoes: Partial<Documento>) => {
      if (!estado.documento) return false

      const sucesso = servicoDocumento.atualizarMetadados(
        estado.documento.id,
        atualizacoes
      )

      if (sucesso) {
        setEstado((prev) => ({
          ...prev,
          documento: {
            ...prev.documento!,
            ...atualizacoes,
          },
        }))
      }

      return sucesso
    },
    [estado.documento]
  )

  const restaurarVersao = useCallback(
    (numeroVersao: number) => {
      if (!estado.documento) return false

      const sucesso = servicoDocumento.restaurarVersao(
        estado.documento.id,
        numeroVersao
      )

      if (sucesso) {
        carregarDocumento(estado.documento.id)
      }

      return sucesso
    },
    [estado.documento, carregarDocumento]
  )

  const duplicar = useCallback(
    (novoTitulo?: string) => {
      if (!estado.documento) return null

      const copia = servicoDocumento.duplicarDocumento(
        estado.documento.id,
        novoTitulo
      )

      return copia
    },
    [estado.documento]
  )

  const deletar = useCallback(() => {
    if (!estado.documento) return false

    const sucesso = servicoDocumento.deletarDocumento(estado.documento.id)

    if (sucesso) {
      setEstado({
        documento: null,
        salvando: false,
        erro: null,
        mudancasNaoSalvas: false,
      })
    }

    return sucesso
  }, [estado.documento])

  const fechar = useCallback(() => {
    if (estado.mudancasNaoSalvas) {
      if (
        !confirm('Há mudanças não salvas. Deseja sair sem salvar?')
      ) {
        return false
      }
    }

    setEstado({
      documento: null,
      salvando: false,
      erro: null,
      mudancasNaoSalvas: false,
    })

    return true
  }, [estado.mudancasNaoSalvas])

  return {
    documento: estado.documento,
    salvando: estado.salvando,
    erro: estado.erro,
    ultimoSalvo: estado.ultimoSalvo,
    mudancasNaoSalvas: estado.mudancasNaoSalvas,
    criarDocumento,
    carregarDocumento,
    atualizarConteudo,
    salvarAutomaticamente,
    salvarManualmente,
    atualizarMetadados,
    restaurarVersao,
    duplicar,
    deletar,
    fechar,
  }
}
