/**
 * Hook de Integração com Legal Data Hunter
 * Gerencia buscas jurídicas, análises comparativas e pesquisa avançada
 */

import { useState, useCallback } from 'react'
import type {
  
  JurisprudenciaResultado,
  LegislacaoResultado,
  BuscaAvancadaParams,
  ResultadoBuscaAvancada,
  AnalisisComparativa,
  LegalDataHunterQuery,
} from '../types/legalDataHunter'
import { obterLDH } from '../services/legalDataHunterService'

interface UseLegalDataHunterState {
  jurisprudencia: JurisprudenciaResultado[]
  legislacao: LegislacaoResultado[]
  buscaAvancada: ResultadoBuscaAvancada | null
  analisisComparativa: AnalisisComparativa | null
  carregando: boolean
  erro: string | null
}

export function useLegalDataHunter() {
  const [estado, setEstado] = useState<UseLegalDataHunterState>({
    jurisprudencia: [],
    legislacao: [],
    buscaAvancada: null,
    analisisComparativa: null,
    carregando: false,
    erro: null,
  })

  const servico = obterLDH()

  const buscarJurisprudencia = useCallback(async (query: LegalDataHunterQuery) => {
    setEstado((prev) => ({ ...prev, carregando: true, erro: null }))

    try {
      const resultados = await servico.buscarJurisprudencia(query)
      setEstado((prev) => ({
        ...prev,
        jurisprudencia: resultados,
        carregando: false,
      }))
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Erro desconhecido'
      setEstado((prev) => ({
        ...prev,
        erro: mensagem,
        carregando: false,
      }))
    }
  }, [servico])

  const buscarLegislacao = useCallback(async (query: LegalDataHunterQuery) => {
    setEstado((prev) => ({ ...prev, carregando: true, erro: null }))

    try {
      const resultados = await servico.buscarLegislacao(query)
      setEstado((prev) => ({
        ...prev,
        legislacao: resultados,
        carregando: false,
      }))
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Erro desconhecido'
      setEstado((prev) => ({
        ...prev,
        erro: mensagem,
        carregando: false,
      }))
    }
  }, [servico])

  const buscarAvancada = useCallback(async (params: BuscaAvancadaParams) => {
    setEstado((prev) => ({ ...prev, carregando: true, erro: null }))

    try {
      const resultados = await servico.buscaAvancada(params)
      setEstado((prev) => ({
        ...prev,
        buscaAvancada: resultados,
        carregando: false,
      }))
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Erro desconhecido'
      setEstado((prev) => ({
        ...prev,
        erro: mensagem,
        carregando: false,
      }))
    }
  }, [servico])

  const analisarComparativa = useCallback(
    async (tema: string, jurisdicoes: string[]) => {
      setEstado((prev) => ({ ...prev, carregando: true, erro: null }))

      try {
        const resultado = await servico.analisarComparativa(tema, jurisdicoes)
        setEstado((prev) => ({
          ...prev,
          analisisComparativa: resultado,
          carregando: false,
        }))
      } catch (erro) {
        const mensagem = erro instanceof Error ? erro.message : 'Erro desconhecido'
        setEstado((prev) => ({
          ...prev,
          erro: mensagem,
          carregando: false,
        }))
      }
    },
    [servico]
  )

  const limpar = useCallback(() => {
    setEstado({
      jurisprudencia: [],
      legislacao: [],
      buscaAvancada: null,
      analisisComparativa: null,
      carregando: false,
      erro: null,
    })
    servico.limparCache()
  }, [servico])

  return {
    jurisprudencia: estado.jurisprudencia,
    legislacao: estado.legislacao,
    buscaAvancada: estado.buscaAvancada,
    analisisComparativa: estado.analisisComparativa,
    carregando: estado.carregando,
    erro: estado.erro,
    buscarJurisprudencia,
    buscarLegislacao,
    buscarAvancada,
    analisarComparativa,
    limpar,
  }
}
