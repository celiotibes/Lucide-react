import { useState, useCallback } from 'react'
import { servicoAdvancedSearch } from '../services/advancedSearchService'
import type {
  FiltroAvancado,
  BuscaSalva,
  ResultadoBuscaComPaginacao,
  HistoricoBusca,
  EstatisticasBusca,
} from '../types/advancedSearch'

interface UseAdvancedSearchReturn {
  resultados: ResultadoBuscaComPaginacao | null
  buscasSalvas: BuscaSalva[]
  historicoBuscas: HistoricoBusca[]
  estatisticas: EstatisticasBusca
  carregando: boolean
  erro: string | null
  executarBusca: (query: string, filtros: FiltroAvancado[], pagina?: number) => Promise<void>
  salvarBusca: (dados: Omit<BuscaSalva, 'id' | 'dataCriacao'>) => void
  deletarBuscaSalva: (buscaId: string) => void
  marcarFavorita: (buscaId: string, favorito: boolean) => void
  limparHistorico: () => void
}

export function useAdvancedSearch(): UseAdvancedSearchReturn {
  const [resultados, setResultados] = useState<ResultadoBuscaComPaginacao | null>(null)
  const [buscasSalvas, setBuscasSalvas] = useState<BuscaSalva[]>(
    servicoAdvancedSearch.obterBuscasSalvas()
  )
  const [historicoBuscas, setHistoricoBuscas] = useState<HistoricoBusca[]>(
    servicoAdvancedSearch.obterHistoricoBuscas()
  )
  const [estatisticas, setEstatisticas] = useState<EstatisticasBusca>(
    servicoAdvancedSearch.obterEstatisticas()
  )
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const executarBusca = useCallback(
    async (query: string, filtros: FiltroAvancado[], pagina: number = 1) => {
      try {
        setCarregando(true)
        setErro(null)
        const resultado = await servicoAdvancedSearch.executarBusca(query, filtros, pagina)
        setResultados(resultado)
        if (resultado.status === 'erro') {
          setErro(resultado.mensagem || 'Erro ao executar busca')
        }
        setHistoricoBuscas(servicoAdvancedSearch.obterHistoricoBuscas())
        setEstatisticas(servicoAdvancedSearch.obterEstatisticas())
      } catch (e) {
        const mensagem = e instanceof Error ? e.message : 'Erro ao executar busca'
        setErro(mensagem)
      } finally {
        setCarregando(false)
      }
    },
    []
  )

  const salvarBusca = useCallback((dados: Omit<BuscaSalva, 'id' | 'dataCriacao'>) => {
    servicoAdvancedSearch.salvarBusca(dados)
    setBuscasSalvas(servicoAdvancedSearch.obterBuscasSalvas())
  }, [])

  const deletarBuscaSalva = useCallback((buscaId: string) => {
    servicoAdvancedSearch.deletarBuscaSalva(buscaId)
    setBuscasSalvas(servicoAdvancedSearch.obterBuscasSalvas())
  }, [])

  const marcarFavorita = useCallback((buscaId: string, favorito: boolean) => {
    servicoAdvancedSearch.marcarBuscaFavorita(buscaId, favorito)
    setBuscasSalvas(servicoAdvancedSearch.obterBuscasSalvas())
  }, [])

  const limparHistorico = useCallback(() => {
    servicoAdvancedSearch.limparHistorico()
    setHistoricoBuscas([])
  }, [])

  return {
    resultados,
    buscasSalvas,
    historicoBuscas,
    estatisticas,
    carregando,
    erro,
    executarBusca,
    salvarBusca,
    deletarBuscaSalva,
    marcarFavorita,
    limparHistorico,
  }
}
