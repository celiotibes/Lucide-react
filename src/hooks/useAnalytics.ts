/**
 * Hook para usar analytics
 */

import { useState, useCallback } from 'react'
import { servicoAnalytics } from '../services/analyticsService'
import type { ResultadoEstatisticas } from '../types/analytics'

export function useAnalytics() {
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const obterEstatisticas = useCallback((): ResultadoEstatisticas => {
    setCarregando(true)
    setErro(null)

    try {
      const resultado = servicoAnalytics.obterEstatisticas()
      setCarregando(false)
      return resultado
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : 'Erro ao obter estatísticas'
      setErro(mensagem)
      setCarregando(false)
      return {
        sucesso: false,
        documentos: {
          totalDocumentos: 0,
          documentosAbertos: 0,
          documentosArquivados: 0,
          palavrasTotais: 0,
          caracteresTotais: 0,
          tamanhoMedioKB: 0,
          areaComMaisDocumentos: 'N/A',
          tipoComMaisDocumentos: 'N/A',
        },
        llm: {
          totalRequisicoes: 0,
          totalTokensUsados: 0,
          custoTotal: 0,
          modeloMaisUsado: 'N/A',
          latenciaMedia: 0,
          provedorMaisUsado: 'N/A',
          requisicoesHoje: 0,
          custoHoje: 0,
        },
        analise: {
          totalAnalisesRAG: 0,
          totalPeticionesAnalisadas: 0,
          mediaFraquezasEncontradas: 0,
          mediaContraArgumentosGerados: 0,
          analiseComMaisProblemas: 'N/A',
          taxaDeteccaoMedia: 0,
        },
        uso: {
          ultimaAtividadeEm: new Date(),
          tempoMediaSessao: 0,
          paginavisitadas: 0,
          componentesMaisUsados: [],
          usuariosAtivos: 0,
          taxaRetencaoSemanal: 0,
        },
        periodo: {
          inicio: new Date(),
          fim: new Date(),
        },
      }
    }
  }, [])

  const registrarRequisicaoLLM = useCallback(
    (modelo: string, provedor: string, tokens: number, custo: number, latencia: number) => {
      servicoAnalytics.registrarRequisicaoLLM(modelo, provedor, tokens, custo, latencia)
    },
    []
  )

  const registrarAnalisePeticao = useCallback((titulo: string, achados: number, contraArgumentos: number) => {
    servicoAnalytics.registrarAnalisePeticao(titulo, achados, contraArgumentos)
  }, [])

  const registrarPaginaVisitada = useCallback((nomePagina: string) => {
    servicoAnalytics.registrarPaginaVisitada(nomePagina)
  }, [])

  const limparDados = useCallback(() => {
    servicoAnalytics.limparDados()
    setErro(null)
  }, [])

  return {
    carregando,
    erro,
    obterEstatisticas,
    registrarRequisicaoLLM,
    registrarAnalisePeticao,
    registrarPaginaVisitada,
    limparDados,
  }
}
