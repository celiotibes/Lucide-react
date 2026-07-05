/**
 * Hook de Compartilhamento
 * Gerencia compartilhamentos de documentos
 */

import { useState, useCallback } from 'react'
import { servicoCompartilhamento } from '../services/sharingService'
import type { CompartilhamentoDocumento, PermissaoCompartilhamento } from '../types/sharing'

interface UseSharingState {
  compartilhamentos: CompartilhamentoDocumento[]
  carregando: boolean
  erro: string | null
  sucesso: string | null
}

export function useSharing() {
  const [estado, setEstado] = useState<UseSharingState>({
    compartilhamentos: servicoCompartilhamento.obterTodos(),
    carregando: false,
    erro: null,
    sucesso: null,
  })

  const compartilharPorLink = useCallback(
    (documentoId: string, permissao: PermissaoCompartilhamento, dataExpiracao?: Date) => {
      setEstado(prev => ({
        ...prev,
        carregando: true,
        erro: null,
      }))

      const resultado = servicoCompartilhamento.compartilharPorLink(
        documentoId,
        permissao,
        dataExpiracao
      )

      if (resultado.sucesso) {
        setEstado({
          compartilhamentos: servicoCompartilhamento.obterTodos(),
          carregando: false,
          erro: null,
          sucesso: resultado.mensagem,
        })
        return { sucesso: true, link: resultado.link, compartilhamentoId: resultado.compartilhamentoId }
      } else {
        setEstado(prev => ({
          ...prev,
          carregando: false,
          erro: resultado.mensagem,
        }))
        return { sucesso: false }
      }
    },
    []
  )

  const compartilharPorEmail = useCallback(
    (
      documentoId: string,
      email: string,
      nome: string,
      permissao: PermissaoCompartilhamento
    ) => {
      setEstado(prev => ({
        ...prev,
        carregando: true,
        erro: null,
      }))

      const resultado = servicoCompartilhamento.compartilharPorEmail(
        documentoId,
        email,
        nome,
        permissao
      )

      if (resultado.sucesso) {
        setEstado({
          compartilhamentos: servicoCompartilhamento.obterTodos(),
          carregando: false,
          erro: null,
          sucesso: resultado.mensagem,
        })
        return { sucesso: true, compartilhamentoId: resultado.compartilhamentoId }
      } else {
        setEstado(prev => ({
          ...prev,
          carregando: false,
          erro: resultado.mensagem,
        }))
        return { sucesso: false }
      }
    },
    []
  )

  const revogar = useCallback((compartilhamentoId: string) => {
    const resultado = servicoCompartilhamento.revogar(compartilhamentoId)

    if (resultado.sucesso) {
      setEstado(prev => ({
        ...prev,
        compartilhamentos: servicoCompartilhamento.obterTodos(),
        sucesso: resultado.mensagem,
      }))
    } else {
      setEstado(prev => ({
        ...prev,
        erro: resultado.mensagem,
      }))
    }
  }, [])

  const obterPorDocumento = useCallback((documentoId: string): CompartilhamentoDocumento[] => {
    return servicoCompartilhamento.obterPorDocumento(documentoId)
  }, [])

  const registrarVisualizacao = useCallback((compartilhamentoId: string) => {
    servicoCompartilhamento.registrarVisualizacao(compartilhamentoId)
    setEstado(prev => ({
      ...prev,
      compartilhamentos: servicoCompartilhamento.obterTodos(),
    }))
  }, [])

  const obterEstatisticas = useCallback((compartilhamentoId: string) => {
    return servicoCompartilhamento.obterEstatisticas(compartilhamentoId)
  }, [])

  const limparExpirados = useCallback(() => {
    const deletados = servicoCompartilhamento.limparExpirados()
    setEstado(prev => ({
      ...prev,
      compartilhamentos: servicoCompartilhamento.obterTodos(),
    }))
    return deletados
  }, [])

  const limparMensagens = useCallback(() => {
    setEstado(prev => ({
      ...prev,
      erro: null,
      sucesso: null,
    }))
  }, [])

  return {
    compartilhamentos: estado.compartilhamentos,
    carregando: estado.carregando,
    erro: estado.erro,
    sucesso: estado.sucesso,
    compartilharPorLink,
    compartilharPorEmail,
    revogar,
    obterPorDocumento,
    registrarVisualizacao,
    obterEstatisticas,
    limparExpirados,
    limparMensagens,
  }
}
