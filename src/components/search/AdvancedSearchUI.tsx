import { useState } from 'react'
import { useAdvancedSearch } from '../../hooks/useAdvancedSearch'
import type { FiltroAvancado } from '../../types/advancedSearch'
import './AdvancedSearchUI.css'

export function AdvancedSearchUI() {
  const {
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
  } = useAdvancedSearch()

  const [abaAtiva, setAbaAtiva] = useState<'buscar' | 'salvas' | 'historico' | 'estatisticas'>('buscar')
  const [query, setQuery] = useState('')
  const [nomeBuscaSalva, setNomeBuscaSalva] = useState('')
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [filtros] = useState<FiltroAvancado[]>([])

  const handleBuscar = async () => {
    if (query.trim()) {
      await executarBusca(query, filtros, paginaAtual)
    }
  }

  const handleSalvarBusca = () => {
    if (nomeBuscaSalva.trim() && query.trim()) {
      salvarBusca({
        nome: nomeBuscaSalva,
        descricao: `Busca por: ${query}`,
        query,
        filtros,
        favorito: false,
      })
      setNomeBuscaSalva('')
    }
  }

  const handlePaginaAnterior = async () => {
    if (paginaAtual > 1) {
      const novaPagina = paginaAtual - 1
      setPaginaAtual(novaPagina)
      await executarBusca(query, filtros, novaPagina)
    }
  }

  const handleProximaPagina = async () => {
    if (resultados && paginaAtual < resultados.paginacao.totalPaginas) {
      const novaPagina = paginaAtual + 1
      setPaginaAtual(novaPagina)
      await executarBusca(query, filtros, novaPagina)
    }
  }

  return (
    <div className="advanced-search-ui">
      <div className="search-header">
        <h2>🔎 Busca Avançada</h2>
        <p className="search-subtitle">Busque jurisprudência, legislação, doutrina e documentos com filtros avançados</p>
      </div>

      <div className="search-tabs">
        <button
          className={`search-tab ${abaAtiva === 'buscar' ? 'ativo' : ''}`}
          onClick={() => setAbaAtiva('buscar')}
        >
          🔍 Buscar
        </button>
        <button
          className={`search-tab ${abaAtiva === 'salvas' ? 'ativo' : ''}`}
          onClick={() => setAbaAtiva('salvas')}
        >
          ⭐ Salvas ({buscasSalvas.length})
        </button>
        <button
          className={`search-tab ${abaAtiva === 'historico' ? 'ativo' : ''}`}
          onClick={() => setAbaAtiva('historico')}
        >
          📜 Histórico ({historicoBuscas.length})
        </button>
        <button
          className={`search-tab ${abaAtiva === 'estatisticas' ? 'ativo' : ''}`}
          onClick={() => setAbaAtiva('estatisticas')}
        >
          📊 Estatísticas
        </button>
      </div>

      {abaAtiva === 'buscar' && (
        <div className="search-tab-content">
          <div className="search-box">
            <input
              type="text"
              placeholder="Digite sua busca..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleBuscar()}
              className="search-input"
            />
            <button className="search-btn-buscar" onClick={handleBuscar} disabled={carregando}>
              {carregando ? '⏳ Buscando...' : '🔍 Buscar'}
            </button>
          </div>

          {resultados && (
            <>
              <div className="search-info">
                <span>{resultados.paginacao.quantidadeTotal} resultados encontrados em {resultados.paginacao.tempoExecucao}ms</span>
                {query && (
                  <input
                    type="text"
                    placeholder="Nome para salvar esta busca"
                    value={nomeBuscaSalva}
                    onChange={(e) => setNomeBuscaSalva(e.target.value)}
                    className="search-salvar-input"
                  />
                )}
                {nomeBuscaSalva && (
                  <button className="search-btn-salvar" onClick={handleSalvarBusca}>
                    💾 Salvar Busca
                  </button>
                )}
              </div>

              {resultados.resultados.length > 0 ? (
                <>
                  <div className="search-results">
                    {resultados.resultados.map((resultado, idx) => (
                      <div key={idx} className="resultado-card">
                        <div className="resultado-header">
                          <span className="resultado-tipo">
                            {resultado.tipo === 'jurisprudencia' && '⚖️'}
                            {resultado.tipo === 'legislacao' && '📋'}
                            {resultado.tipo === 'doutrina' && '📚'}
                            {resultado.tipo === 'artigo' && '📰'}
                            {resultado.tipo === 'parecer' && '📑'}
                            {resultado.tipo === 'peticao' && '✍️'}
                          </span>
                          <h3 className="resultado-titulo">{resultado.titulo}</h3>
                          <span className={`resultado-relevancia relevancia-${resultado.relevancia}`}>
                            {resultado.relevancia.toUpperCase()}
                          </span>
                        </div>
                        <p className="resultado-resumo">{resultado.resumo}</p>
                        <div className="resultado-footer">
                          <span className="resultado-fonte">{resultado.fonte}</span>
                          <span className="resultado-data">
                            {new Date(resultado.data).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="search-pagination">
                    <button
                      className="btn-paginacao"
                      onClick={handlePaginaAnterior}
                      disabled={paginaAtual === 1}
                    >
                      ← Anterior
                    </button>
                    <span className="paginacao-info">
                      Página {paginaAtual} de {resultados.paginacao.totalPaginas}
                    </span>
                    <button
                      className="btn-paginacao"
                      onClick={handleProximaPagina}
                      disabled={paginaAtual >= resultados.paginacao.totalPaginas}
                    >
                      Próxima →
                    </button>
                  </div>
                </>
              ) : (
                <div className="search-empty">
                  <p>Nenhum resultado encontrado.</p>
                  <p>Tente refinar sua busca com outros termos.</p>
                </div>
              )}
            </>
          )}

          {erro && <div className="search-erro">❌ {erro}</div>}
        </div>
      )}

      {abaAtiva === 'salvas' && (
        <div className="search-tab-content">
          {buscasSalvas.length > 0 ? (
            <div className="buscas-grid">
              {buscasSalvas.map((busca) => (
                <div key={busca.id} className="busca-card">
                  <div className="busca-header">
                    <h3 className="busca-nome">{busca.nome}</h3>
                    <button
                      className={`btn-favorito ${busca.favorito ? 'favorito' : ''}`}
                      onClick={() => marcarFavorita(busca.id, !busca.favorito)}
                    >
                      {busca.favorito ? '⭐' : '☆'}
                    </button>
                  </div>
                  <p className="busca-descricao">{busca.descricao}</p>
                  <p className="busca-query">"{busca.query}"</p>
                  <div className="busca-footer">
                    <span className="busca-data">
                      {new Date(busca.dataCriacao).toLocaleDateString('pt-BR')}
                    </span>
                    <button
                      className="btn-deletar"
                      onClick={() => deletarBuscaSalva(busca.id)}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>📭 Nenhuma busca salva.</p>
              <p>Salve suas buscas frequentes para acesso rápido.</p>
            </div>
          )}
        </div>
      )}

      {abaAtiva === 'historico' && (
        <div className="search-tab-content">
          {historicoBuscas.length > 0 ? (
            <>
              <button className="btn-limpar-historico" onClick={limparHistorico}>
                🗑️ Limpar Histórico
              </button>
              <div className="historico-list">
                {historicoBuscas.map((item) => (
                  <div key={item.id} className="historico-item">
                    <div className="historico-query">"{item.query}"</div>
                    <div className="historico-info">
                      <span>{item.quantidadeResultados} resultados</span>
                      <span>•</span>
                      <span>{item.tempoExecucao}ms</span>
                      <span>•</span>
                      <span>{new Date(item.dataHora).toLocaleString('pt-BR')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <p>📭 Nenhuma busca no histórico.</p>
              <p>Seu histórico de buscas aparecerá aqui.</p>
            </div>
          )}
        </div>
      )}

      {abaAtiva === 'estatisticas' && (
        <div className="search-tab-content">
          <div className="estatisticas-grid">
            <div className="stats-card">
              <span className="stats-label">Total de Buscas</span>
              <span className="stats-value">{estatisticas.totalBuscas}</span>
            </div>
            <div className="stats-card">
              <span className="stats-label">Tempo Médio</span>
              <span className="stats-value">{Math.round(estatisticas.tempoBuscaMedio)}ms</span>
            </div>
            <div className="stats-card">
              <span className="stats-label">Taxa de Clique</span>
              <span className="stats-value">{(estatisticas.taxaClique * 100).toFixed(1)}%</span>
            </div>
          </div>

          {estatisticas.termosPopulares.length > 0 && (
            <>
              <h3 className="stats-titulo">🔥 Termos Populares</h3>
              <div className="termos-list">
                {estatisticas.termosPopulares.map((termo, idx) => (
                  <div key={idx} className="termo-item">
                    <span className="termo-name">{termo.termo}</span>
                    <span className="termo-count">{termo.frequencia} buscas</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
