/**
 * Serviço de Busca Avançada e Filtros
 * Gerencia buscas, filtros, histórico e buscas salvas
 */

import type {
  FiltroAvancado,
  ConfiguracaoBusca,
  HistoricoBusca,
  BuscaSalva,
  ResultadoBuscaAvancada,
  ResultadoBuscaComPaginacao,
  PaginacaoBusca,
  EstatisticasBusca,
  NivelRelevancia,
} from '../types/advancedSearch'

class ServicoAdvancedSearch {
  private chaveConfig = 'lucide_search_config'
  private chaveHistorico = 'lucide_search_historico'
  private chaveSalvas = 'lucide_search_salvas'
  private chaveEstatisticas = 'lucide_search_estatisticas'

  // Obter configuração
  obterConfiguracao(): ConfiguracaoBusca {
    const configJSON = localStorage.getItem(this.chaveConfig)
    if (!configJSON) {
      return {
        ativaAutoCompletar: true,
        ativaSugestoesRelacionadas: true,
        ativaHistoricoBusca: true,
        ativaFavoritosBusca: true,
        tamanhoResultadosPorPagina: 20,
        idiomas: ['pt-BR', 'en', 'es'],
        jurisdicoes: ['BR', 'US', 'EU'],
      }
    }

    return JSON.parse(configJSON)
  }

  // Salvar configuração
  salvarConfiguracao(config: ConfiguracaoBusca): void {
    localStorage.setItem(this.chaveConfig, JSON.stringify(config))
  }

  // Executar busca avançada com paginação
  async executarBusca(
    query: string,
    filtros: FiltroAvancado[],
    paginaAtual: number = 1
  ): Promise<ResultadoBuscaComPaginacao> {
    try {
      const config = this.obterConfiguracao()
      const tempoInicio = Date.now()

      // Simular delay de busca
      await new Promise(resolve => setTimeout(resolve, 800))

      // Gerar resultados simulados
      const resultadosSimulados = this._gerarResultadosSimulados(query, filtros)
      const quantidadeTotal = resultadosSimulados.length

      // Aplicar paginação
      const indiceInicio = (paginaAtual - 1) * config.tamanhoResultadosPorPagina
      const indiceFim = indiceInicio + config.tamanhoResultadosPorPagina
      const resultadosPagina = resultadosSimulados.slice(indiceInicio, indiceFim)

      const paginacao: PaginacaoBusca = {
        paginaAtual,
        totalPaginas: Math.ceil(quantidadeTotal / config.tamanhoResultadosPorPagina),
        quantidadeTotal,
        resultadosPorPagina: config.tamanhoResultadosPorPagina,
        tempoExecucao: Date.now() - tempoInicio,
      }

      // Salvar no histórico
      if (config.ativaHistoricoBusca) {
        this._salvarNoHistorico(query, filtros, quantidadeTotal, paginacao.tempoExecucao)
      }

      // Atualizar estatísticas
      this._atualizarEstatisticas(query)

      return {
        resultados: resultadosPagina,
        paginacao,
        status: 'concluida',
        mensagem: `${quantidadeTotal} resultado(s) encontrado(s)`,
        sugestoes: this._gerarSugestoes(query),
      }
    } catch (erro) {
      return {
        resultados: [],
        paginacao: {
          paginaAtual: 1,
          totalPaginas: 0,
          quantidadeTotal: 0,
          resultadosPorPagina: 0,
          tempoExecucao: 0,
        },
        status: 'erro',
        mensagem: erro instanceof Error ? erro.message : 'Erro ao executar busca',
      }
    }
  }

  // Salvar busca
  salvarBusca(busca: Omit<BuscaSalva, 'id' | 'dataCriacao'>): BuscaSalva {
    const buscasJSON = localStorage.getItem(this.chaveSalvas)
    const buscas: BuscaSalva[] = buscasJSON ? JSON.parse(buscasJSON) : []

    const novaBusca: BuscaSalva = {
      ...busca,
      id: `search_${Date.now()}`,
      dataCriacao: new Date(),
    }

    buscas.push(novaBusca)
    localStorage.setItem(this.chaveSalvas, JSON.stringify(buscas))
    return novaBusca
  }

  // Obter buscas salvas
  obterBuscasSalvas(): BuscaSalva[] {
    const buscasJSON = localStorage.getItem(this.chaveSalvas)
    if (!buscasJSON) return []

    try {
      const buscas = JSON.parse(buscasJSON)
      return buscas.map((b: any) => ({
        ...b,
        dataCriacao: new Date(b.dataCriacao),
        dataUltimaExecucao: b.dataUltimaExecucao ? new Date(b.dataUltimaExecucao) : undefined,
      }))
    } catch {
      return []
    }
  }

  // Deletar busca salva
  deletarBuscaSalva(buscaId: string): void {
    const buscas = this.obterBuscasSalvas()
    const buscasFiltradas = buscas.filter(b => b.id !== buscaId)
    localStorage.setItem(this.chaveSalvas, JSON.stringify(buscasFiltradas))
  }

  // Marcar busca como favorita
  marcarBuscaFavorita(buscaId: string, favorito: boolean): void {
    const buscas = this.obterBuscasSalvas()
    const buscaAtualizada = buscas.find(b => b.id === buscaId)
    if (buscaAtualizada) {
      buscaAtualizada.favorito = favorito
      localStorage.setItem(this.chaveSalvas, JSON.stringify(buscas))
    }
  }

  // Obter histórico de buscas
  obterHistoricoBuscas(): HistoricoBusca[] {
    const historicoJSON = localStorage.getItem(this.chaveHistorico)
    if (!historicoJSON) return []

    try {
      const historico = JSON.parse(historicoJSON)
      return historico.map((h: any) => ({
        ...h,
        dataHora: new Date(h.dataHora),
      }))
    } catch {
      return []
    }
  }

  // Limpar histórico
  limparHistorico(): void {
    localStorage.removeItem(this.chaveHistorico)
  }

  // Obter estatísticas de busca
  obterEstatisticas(): EstatisticasBusca {
    const estatisticasJSON = localStorage.getItem(this.chaveEstatisticas)
    if (!estatisticasJSON) {
      return {
        totalBuscas: 0,
        buscasAtualizadas: 0,
        termosPopulares: [],
        tiposDocumentoMaisBuscados: [],
        tempoBuscaMedio: 0,
        taxaClique: 0,
      }
    }

    return JSON.parse(estatisticasJSON)
  }

  // Métodos privados

  private _gerarResultadosSimulados(query: string, filtros: FiltroAvancado[]): ResultadoBuscaAvancada[] {
    const resultados: ResultadoBuscaAvancada[] = []

    for (let i = 0; i < 45; i++) {
      const tipos: ('jurisprudencia' | 'legislacao' | 'doutrina' | 'artigo' | 'parecer' | 'peticao')[] = [
        'jurisprudencia',
        'legislacao',
        'doutrina',
        'artigo',
        'parecer',
        'peticao',
      ]
      const relevancias: ('baixa' | 'media' | 'alta' | 'critica')[] = ['baixa', 'media', 'alta', 'critica']

      resultados.push({
        id: `result_${i}`,
        titulo: `${query} - Resultado ${i + 1}`,
        tipo: tipos[i % tipos.length],
        relevancia: relevancias[Math.floor(Math.random() * relevancias.length)],
        resumo: `Este é um resultado simulado para a busca "${query}". Contém informações relevantes sobre o tema pesquisado...`,
        autor: `Autor ${i + 1}`,
        data: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
        fonte: `Fonte ${i % 5 + 1}`,
        tags: ['jurídico', 'pesquisa', query.toLowerCase()],
      })
    }

    return resultados
  }

  private _gerarSugestoes(query: string) {
    return {
      buscarPor: [`${query} jurisprudência`, `${query} legislação`, `${query} análise`],
      documentosRelacionados: [],
      termosRelacionados: ['termo relacionado 1', 'termo relacionado 2', 'termo relacionado 3'],
    }
  }

  private _salvarNoHistorico(
    query: string,
    filtros: FiltroAvancado[],
    quantidadeResultados: number,
    tempoExecucao: number
  ): void {
    const historico = this.obterHistoricoBuscas()
    const novaEntrada: HistoricoBusca = {
      id: `hist_${Date.now()}`,
      query,
      filtros,
      dataHora: new Date(),
      quantidadeResultados,
      tempoExecucao,
    }

    historico.push(novaEntrada)

    // Manter apenas os últimos 100 itens
    if (historico.length > 100) {
      historico.splice(0, historico.length - 100)
    }

    localStorage.setItem(this.chaveHistorico, JSON.stringify(historico))
  }

  private _atualizarEstatisticas(query: string): void {
    const estadisticas = this.obterEstatisticas()
    estadisticas.totalBuscas += 1

    // Atualizar termos populares
    const termIndex = estadisticas.termosPopulares.findIndex(t => t.termo === query)
    if (termIndex >= 0) {
      estadisticas.termosPopulares[termIndex].frequencia += 1
    } else {
      estadisticas.termosPopulares.push({ termo: query, frequencia: 1 })
    }

    // Ordenar por frequência (top 10)
    estadisticas.termosPopulares.sort((a, b) => b.frequencia - a.frequencia)
    if (estadisticas.termosPopulares.length > 10) {
      estadisticas.termosPopulares = estadisticas.termosPopulares.slice(0, 10)
    }

    localStorage.setItem(this.chaveEstatisticas, JSON.stringify(estadisticas))
  }
}

export const servicoAdvancedSearch = new ServicoAdvancedSearch()
