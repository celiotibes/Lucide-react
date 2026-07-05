/**
 * Hook de Correspondência de Modelos
 * Gerencia busca e correspondência de modelos jurídicos
 */

import { useState, useCallback } from 'react'
import type { ResultadoCorrespondencia, BibliotecaModelos } from '../types/templateMatching'
import { servicoCorrespondenciaModelos } from '../services/templateMatchingService'

interface UseTemplateMatchingState {
  resultados: ResultadoCorrespondencia[]
  carregando: boolean
  erro: string | null
  estatisticas: BibliotecaModelos | null
}

export function useTemplateMatching() {
  const [estado, setEstado] = useState<UseTemplateMatchingState>({
    resultados: [],
    carregando: false,
    erro: null,
    estatisticas: null,
  })

  const buscar = useCallback(async (conteudo: string, areaJuridica: string, tribunal?: string) => {
    if (!conteudo.trim()) {
      setEstado((prev) => ({ ...prev, erro: 'Conteúdo é obrigatório' }))
      return
    }

    setEstado((prev) => ({ ...prev, carregando: true, erro: null }))

    try {
      const resultados = await servicoCorrespondenciaModelos.buscarModelos(conteudo, {
        areaJuridica,
        tribunal,
      })

      const estatisticas = await servicoCorrespondenciaModelos.obterEstatisticas()

      setEstado((prev) => ({
        ...prev,
        resultados,
        estatisticas,
        carregando: false,
      }))
    } catch (erro) {
      const mensagemErro = erro instanceof Error ? erro.message : 'Erro desconhecido'
      setEstado((prev) => ({ ...prev, erro: mensagemErro, carregando: false }))
    }
  }, [])

  const limpar = useCallback(() => {
    setEstado({
      resultados: [],
      carregando: false,
      erro: null,
      estatisticas: null,
    })
  }, [])

  return {
    resultados: estado.resultados,
    carregando: estado.carregando,
    erro: estado.erro,
    estatisticas: estado.estatisticas,
    buscar,
    limpar,
  }
}
