/**
 * Hook de Anotações
 * Gerencia anotações e comentários em documentos
 */

import { useState, useCallback } from 'react'
import { servicoAnotacoes } from '../services/annotationService'
import type { Anotacao, TipoAnotacao, EstatisticasAnotacoes } from '../types/annotations'

interface UseAnnotationsState {
  anotacoes: Anotacao[]
  carregando: boolean
  erro: string | null
  sucesso: string | null
}

export function useAnnotations(documentoId?: string) {
  const [estado, setEstado] = useState<UseAnnotationsState>({
    anotacoes: documentoId ? servicoAnotacoes.obterPorDocumento(documentoId) : [],
    carregando: false,
    erro: null,
    sucesso: null,
  })

  const recarregar = useCallback(() => {
    if (documentoId) {
      const anotacoes = servicoAnotacoes.obterPorDocumento(documentoId)
      setEstado(prev => ({ ...prev, anotacoes }))
    }
  }, [documentoId])

  const criar = useCallback(
    (
      tipo: TipoAnotacao,
      conteudo: string,
      autor: string,
      textoselecionado?: string,
      posicao?: number
    ) => {
      if (!documentoId) return { sucesso: false }

      const resultado = servicoAnotacoes.criar(
        documentoId,
        tipo,
        conteudo,
        autor,
        textoselecionado,
        posicao
      )

      if (resultado.sucesso) {
        setEstado(prev => ({
          ...prev,
          anotacoes: servicoAnotacoes.obterPorDocumento(documentoId),
          sucesso: resultado.mensagem,
        }))
        return { sucesso: true, anotacaoId: resultado.anotacaoId }
      } else {
        setEstado(prev => ({
          ...prev,
          erro: resultado.mensagem,
        }))
        return { sucesso: false }
      }
    },
    [documentoId]
  )

  const atualizar = useCallback((anotacaoId: string, atualizacoes: Partial<Anotacao>) => {
    const resultado = servicoAnotacoes.atualizar(anotacaoId, atualizacoes)

    if (resultado.sucesso) {
      if (documentoId) {
        setEstado(prev => ({
          ...prev,
          anotacoes: servicoAnotacoes.obterPorDocumento(documentoId),
          sucesso: resultado.mensagem,
        }))
      }
    } else {
      setEstado(prev => ({
        ...prev,
        erro: resultado.mensagem,
      }))
    }
  }, [documentoId])

  const marcarResolvida = useCallback((anotacaoId: string, resolvida: boolean) => {
    atualizar(anotacaoId, { resolvida })
  }, [atualizar])

  const deletar = useCallback((anotacaoId: string) => {
    const resultado = servicoAnotacoes.deletar(anotacaoId)

    if (resultado.sucesso) {
      if (documentoId) {
        setEstado(prev => ({
          ...prev,
          anotacoes: servicoAnotacoes.obterPorDocumento(documentoId),
          sucesso: resultado.mensagem,
        }))
      }
    } else {
      setEstado(prev => ({
        ...prev,
        erro: resultado.mensagem,
      }))
    }
  }, [documentoId])

  const adicionarComentario = useCallback((anotacaoId: string, conteudo: string, autor: string) => {
    const resultado = servicoAnotacoes.adicionarComentario(anotacaoId, conteudo, autor)

    if (resultado.sucesso) {
      if (documentoId) {
        setEstado(prev => ({
          ...prev,
          anotacoes: servicoAnotacoes.obterPorDocumento(documentoId),
          sucesso: resultado.mensagem,
        }))
      }
      return { sucesso: true }
    } else {
      setEstado(prev => ({
        ...prev,
        erro: resultado.mensagem,
      }))
      return { sucesso: false }
    }
  }, [documentoId])

  const obterComentarios = useCallback((anotacaoId: string) => {
    return servicoAnotacoes.obterComentariosPorAnotacao(anotacaoId)
  }, [])

  const deletarComentario = useCallback((comentarioId: string) => {
    const resultado = servicoAnotacoes.deletarComentario(comentarioId)

    if (resultado.sucesso) {
      if (documentoId) {
        setEstado(prev => ({
          ...prev,
          anotacoes: servicoAnotacoes.obterPorDocumento(documentoId),
          sucesso: resultado.mensagem,
        }))
      }
    } else {
      setEstado(prev => ({
        ...prev,
        erro: resultado.mensagem,
      }))
    }
  }, [documentoId])

  const obterEstatisticas = useCallback((): EstatisticasAnotacoes | null => {
    if (!documentoId) return null
    return servicoAnotacoes.obterEstatisticas(documentoId)
  }, [documentoId])

  const limparDocumento = useCallback(() => {
    if (!documentoId) return

    const resultado = servicoAnotacoes.limparDocumento(documentoId)

    if (resultado.sucesso) {
      setEstado(prev => ({
        ...prev,
        anotacoes: [],
        sucesso: resultado.mensagem,
      }))
    } else {
      setEstado(prev => ({
        ...prev,
        erro: resultado.mensagem,
      }))
    }
  }, [documentoId])

  const limparMensagens = useCallback(() => {
    setEstado(prev => ({
      ...prev,
      erro: null,
      sucesso: null,
    }))
  }, [])

  return {
    anotacoes: estado.anotacoes,
    carregando: estado.carregando,
    erro: estado.erro,
    sucesso: estado.sucesso,
    criar,
    atualizar,
    marcarResolvida,
    deletar,
    adicionarComentario,
    obterComentarios,
    deletarComentario,
    obterEstatisticas,
    limparDocumento,
    recarregar,
    limparMensagens,
  }
}
