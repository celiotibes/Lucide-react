/**
 * Hook de Busca Avançada
 * Gerencia estado de busca e filtros
 */

import { useState, useCallback, useEffect } from 'react'
import { servicoSearch } from '../services/searchService'
import type { DocumentoSalvo } from '../types/document'
import type { CritériosBusca, ResultadoBusca } from '../services/searchService'

interface UseAdvancedSearchState {
  resultado: ResultadoBusca | null
  carregando: boolean
  erro: string | null
  critérios: CritériosBusca
  histórico: CritériosBusca[]
}

export function useAdvancedSearch() {
  const [estado, setEstado] = useState<UseAdvancedSearchState>({
    resultado: null,
    carregando: false,
    erro: null,
    critérios: {},
    histórico: [],
  })

  // Carregar histórico do localStorage
  useEffect(() => {
    try {
      const historicoSalvo = localStorage.getItem('lucide_historico_busca')
      if (historicoSalvo) {
        setEstado(prev => ({
          ...prev,
          histórico: JSON.parse(historicoSalvo),
        }))
      }
    } catch (erro) {
      console.error('Erro ao carregar histórico:', erro)
    }
  }, [])

  const buscar = useCallback((critérios: CritériosBusca) => {
    setEstado(prev => ({
      ...prev,
      carregando: true,
      erro: null,
      critérios,
    }))

    try {
      const resultado = servicoSearch.buscar(critérios)

      // Adicionar ao histórico
      const novoHistórico = [
        critérios,
        ...estado.histórico.filter(c => JSON.stringify(c) !== JSON.stringify(critérios)),
      ].slice(0, 10)

      localStorage.setItem('lucide_historico_busca', JSON.stringify(novoHistórico))

      setEstado(prev => ({
        ...prev,
        resultado,
        carregando: false,
        histórico: novoHistórico,
      }))
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Erro ao buscar'
      setEstado(prev => ({
        ...prev,
        carregando: false,
        erro: mensagem,
      }))
    }
  }, [estado.histórico])

  const limpar = useCallback(() => {
    setEstado(prev => ({
      ...prev,
      resultado: null,
      critérios: {},
      erro: null,
    }))
  }, [])

  const limparHistórico = useCallback(() => {
    localStorage.removeItem('lucide_historico_busca')
    setEstado(prev => ({
      ...prev,
      histórico: [],
    }))
  }, [])

  const restaurarBusca = useCallback((critérios: CritériosBusca) => {
    buscar(critérios)
  }, [buscar])

  return {
    documentos: estado.resultado?.documentos || [],
    total: estado.resultado?.total || 0,
    tempo: estado.resultado?.tempo || 0,
    carregando: estado.carregando,
    erro: estado.erro,
    critérios: estado.critérios,
    histórico: estado.histórico,
    buscar,
    limpar,
    limparHistórico,
    restaurarBusca,
  }
}
