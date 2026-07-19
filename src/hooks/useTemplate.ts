/**
 * Hook de Templates
 * Gerencia estado e operações de templates de documentos
 */

import { useState, useCallback } from 'react'
import { servicoTemplate } from '../services/templateService'
import type { TemplateDocumento } from '../types/template'

interface UseTemplateState {
  templates: TemplateDocumento[]
  carregando: boolean
  erro: string | null
  sucesso: string | null
}

export function useTemplate() {
  const [estado, setEstado] = useState<UseTemplateState>({
    templates: servicoTemplate.obterTodos(),
    carregando: false,
    erro: null,
    sucesso: null,
  })

  const carregarTemplates = useCallback(() => {
    setEstado(prev => ({
      ...prev,
      carregando: true,
      erro: null,
    }))

    try {
      const templates = servicoTemplate.obterTodos()
      setEstado({
        templates,
        carregando: false,
        erro: null,
        sucesso: null,
      })
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Erro ao carregar templates'
      setEstado(prev => ({
        ...prev,
        carregando: false,
        erro: mensagem,
      }))
    }
  }, [])

  const criarTemplate = useCallback((documento: any) => {
    setEstado(prev => ({
      ...prev,
      carregando: true,
      erro: null,
    }))

    const resultado = servicoTemplate.criarTemplate(documento)

    if (resultado.sucesso) {
      setEstado({
        templates: servicoTemplate.obterTodos(),
        carregando: false,
        erro: null,
        sucesso: resultado.mensagem,
      })
      return { sucesso: true, templateId: resultado.templateId }
    } else {
      setEstado(prev => ({
        ...prev,
        carregando: false,
        erro: resultado.mensagem,
      }))
      return { sucesso: false }
    }
  }, [])

  const atualizar = useCallback((id: string, atualizacoes: Partial<TemplateDocumento>) => {
    const resultado = servicoTemplate.atualizar(id, atualizacoes)

    if (resultado.sucesso) {
      setEstado(prev => ({
        ...prev,
        templates: servicoTemplate.obterTodos(),
        sucesso: resultado.mensagem,
      }))
    } else {
      setEstado(prev => ({
        ...prev,
        erro: resultado.mensagem,
      }))
    }
  }, [])

  const deletar = useCallback((id: string) => {
    const resultado = servicoTemplate.deletar(id)

    if (resultado.sucesso) {
      setEstado(prev => ({
        ...prev,
        templates: servicoTemplate.obterTodos(),
        sucesso: resultado.mensagem,
      }))
    } else {
      setEstado(prev => ({
        ...prev,
        erro: resultado.mensagem,
      }))
    }
  }, [])

  const pesquisar = useCallback((termo: string): TemplateDocumento[] => {
    return servicoTemplate.pesquisar(termo)
  }, [])

  const obterPorCategoria = useCallback((categoria: string): TemplateDocumento[] => {
    return servicoTemplate.obterPorCategoria(categoria)
  }, [])

  const obterPorArea = useCallback((area: string): TemplateDocumento[] => {
    return servicoTemplate.obterPorArea(area)
  }, [])

  const obterMaisUsados = useCallback((limite: number = 10): TemplateDocumento[] => {
    return servicoTemplate.obterMaisUsados(limite)
  }, [])

  const usar = useCallback((id: string) => {
    const resultado = servicoTemplate.usar(id)

    if (resultado.sucesso) {
      setEstado(prev => ({
        ...prev,
        templates: servicoTemplate.obterTodos(),
      }))
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
    templates: estado.templates,
    carregando: estado.carregando,
    erro: estado.erro,
    sucesso: estado.sucesso,
    carregarTemplates,
    criarTemplate,
    atualizar,
    deletar,
    pesquisar,
    obterPorCategoria,
    obterPorArea,
    obterMaisUsados,
    usar,
    limparMensagens,
  }
}
