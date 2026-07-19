/**
 * Painel de Busca Avançada
 * Pesquisa jurídica multi-critério com Legal Data Hunter
 */

import { useState, useCallback, useMemo } from 'react'
import { useLegalDataHunter } from '../../hooks/useLegalDataHunter'
import type { FiltrosBuscaAvancada, ResultadoBuscaUI } from '../../types/advancedSearch'
import type { BuscaAvancadaParams } from '../../types/legalDataHunter'
import './AdvancedSearchPanel.css'

const JURISDICOES = [
  { valor: 'BR', label: 'Brasil' },
  { valor: 'US', label: 'Estados Unidos' },
  { valor: 'EU', label: 'União Europeia' },
  { valor: 'GB', label: 'Reino Unido' },
  { valor: 'CA', label: 'Canadá' },
  { valor: 'AU', label: 'Austrália' },
]

const AREAS = [
  { valor: 'civil', label: 'Direito Civil' },
  { valor: 'trabalhista', label: 'Direito Trabalhista' },
  { valor: 'tributario', label: 'Direito Tributário' },
  { valor: 'administrativo', label: 'Direito Administrativo' },
  { valor: 'constitucional', label: 'Direito Constitucional' },
  { valor: 'processual', label: 'Direito Processual' },
]

const TIPOS = [
  { valor: 'jurisprudencia', label: 'Jurisprudência' },
  { valor: 'legislacao', label: 'Legislação' },
  { valor: 'doutrina', label: 'Doutrina' },
]

export function AdvancedSearchPanel() {
  const { buscaAvancada, carregando, erro, buscarAvancada } = useLegalDataHunter()

  const [filtros, setFiltros] = useState<FiltrosBuscaAvancada>({
    consulta: '',
    jurisdicoes: ['BR'],
    areas: ['civil'],
    tipos: ['jurisprudencia'],
    ordenarPor: 'relevancia',
    pagina: 1,
    limite: 20,
  })

  const [abaDados, setAbaDados] = useState<'filtros' | 'resultados'>('filtros')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())

  const handleConsultaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFiltros((prev) => ({ ...prev, consulta: e.target.value, pagina: 1 }))
  }, [])

  const handleJurisdicaoChange = useCallback((jurisdicao: string) => {
    setFiltros((prev) => ({
      ...prev,
      jurisdicoes: prev.jurisdicoes.includes(jurisdicao)
        ? prev.jurisdicoes.filter((j) => j !== jurisdicao)
        : [...prev.jurisdicoes, jurisdicao],
      pagina: 1,
    }))
  }, [])

  const handleAreaChange = useCallback((area: string) => {
    setFiltros((prev) => ({
      ...prev,
      areas: prev.areas.includes(area)
        ? prev.areas.filter((a) => a !== area)
        : [...prev.areas, area],
      pagina: 1,
    }))
  }, [])

  const handleTipoChange = useCallback((tipo: string) => {
    setFiltros((prev) => ({
      ...prev,
      tipos: prev.tipos.includes(tipo)
        ? prev.tipos.filter((t) => t !== tipo)
        : [...prev.tipos, tipo],
      pagina: 1,
    }))
  }, [])

  const handleOrdenacao = useCallback((ordem: 'relevancia' | 'data' | 'citacoes') => {
    setFiltros((prev) => ({ ...prev, ordenarPor: ordem }))
  }, [])

  const handleBuscar = useCallback(async () => {
    if (!filtros.consulta.trim()) {
      return
    }

    const params: BuscaAvancadaParams = {
      consulta: filtros.consulta,
      jurisdicoes: filtros.jurisdicoes,
      areas: filtros.areas,
      tipos: filtros.tipos,
      ordenarPor: filtros.ordenarPor,
      pagina: filtros.pagina,
      limite: filtros.limite,
    }

    await buscarAvancada(params)
    setAbaDados('resultados')
  }, [filtros, buscarAvancada])

  const handleLimpar = useCallback(() => {
    setFiltros({
      consulta: '',
      jurisdicoes: ['BR'],
      areas: ['civil'],
      tipos: ['jurisprudencia'],
      ordenarPor: 'relevancia',
      pagina: 1,
      limite: 20,
    })
    setSelecionados(new Set())
  }, [])

  const handleProximaPagina = useCallback(() => {
    setFiltros((prev) => ({ ...prev, pagina: prev.pagina + 1 }))
    handleBuscar()
  }, [handleBuscar])

  const handlePaginaAnterior = useCallback(() => {
    setFiltros((prev) => ({ ...prev, pagina: Math.max(1, prev.pagina - 1) }))
    handleBuscar()
  }, [handleBuscar])

  const resultadosUI = useMemo(() => {
    if (!buscaAvancada) return []

    return buscaAvancada.resultados.map((doc) => ({
      id: doc.id,
      titulo: doc.titulo,
      tipo: doc.tipo,
      descricao: doc.conteudo,
      dataPublicacao: doc.dataPublicacao,
      jurisdicao: doc.jurisdicao,
      relevancia: doc.relevancia,
      citacoes: doc.citacoes,
      tags: doc.areaJuridica,
      preview: doc.conteudo.substring(0, 300) + '...',
      url: doc.url || '#',
      selecionado: selecionados.has(doc.id),
    } as ResultadoBuscaUI))
  }, [buscaAvancada, selecionados])

  const handleSelecionarResultado = useCallback((id: string) => {
    setSelecionados((prev) => {
      const novo = new Set(prev)
      if (novo.has(id)) {
        novo.delete(id)
      } else {
        novo.add(id)
      }
      return novo
    })
  }, [])

  return (
    <div className="advanced-search-panel">
      <div className="search-header">
        <h2>🔍 Busca Avançada Jurídica</h2>
        <p>Pesquise jurisprudência, legislação e doutrina em múltiplas jurisdições</p>
      </div>

      <div className="search-tabs">
        <button
          className={`tab ${abaDados === 'filtros' ? 'ativo' : ''}`}
          onClick={() => setAbaDados('filtros')}
        >
          ⚙️ Filtros
        </button>
        <button
          className={`tab ${abaDados === 'resultados' ? 'ativo' : ''}`}
          onClick={() => setAbaDados('resultados')}
        >
          📊 Resultados ({buscaAvancada?.total || 0})
        </button>
      </div>

      {abaDados === 'filtros' && (
        <div className="filtros-container">
          <div className="filtro-grupo">
            <label>Consulta</label>
            <textarea
              value={filtros.consulta}
              onChange={handleConsultaChange}
              placeholder="Digite sua busca jurídica..."
              className="consulta-textarea"
            />
          </div>

          <div className="filtros-grid">
            <div className="filtro-grupo">
              <label>Jurisdições</label>
              <div className="opcoes-checkbox">
                {JURISDICOES.map((j) => (
                  <label key={j.valor} className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={filtros.jurisdicoes.includes(j.valor)}
                      onChange={() => handleJurisdicaoChange(j.valor)}
                    />
                    {j.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="filtro-grupo">
              <label>Áreas Jurídicas</label>
              <div className="opcoes-checkbox">
                {AREAS.map((a) => (
                  <label key={a.valor} className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={filtros.areas.includes(a.valor)}
                      onChange={() => handleAreaChange(a.valor)}
                    />
                    {a.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="filtro-grupo">
              <label>Tipo de Documento</label>
              <div className="opcoes-checkbox">
                {TIPOS.map((t) => (
                  <label key={t.valor} className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={filtros.tipos.includes(t.valor)}
                      onChange={() => handleTipoChange(t.valor)}
                    />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="filtro-grupo">
              <label>Ordenar por</label>
              <div className="ordenacao-buttons">
                <button
                  className={`btn-ordenacao ${filtros.ordenarPor === 'relevancia' ? 'ativo' : ''}`}
                  onClick={() => handleOrdenacao('relevancia')}
                >
                  Relevância
                </button>
                <button
                  className={`btn-ordenacao ${filtros.ordenarPor === 'data' ? 'ativo' : ''}`}
                  onClick={() => handleOrdenacao('data')}
                >
                  Data
                </button>
                <button
                  className={`btn-ordenacao ${filtros.ordenarPor === 'citacoes' ? 'ativo' : ''}`}
                  onClick={() => handleOrdenacao('citacoes')}
                >
                  Citações
                </button>
              </div>
            </div>
          </div>

          {erro && <div className="erro-mensagem">{erro}</div>}

          <div className="botoes-busca">
            <button
              onClick={handleBuscar}
              disabled={!filtros.consulta.trim() || carregando}
              className="btn-buscar"
            >
              {carregando ? '🔄 Buscando...' : '🔍 Buscar'}
            </button>
            <button onClick={handleLimpar} className="btn-limpar">
              ✨ Limpar Filtros
            </button>
          </div>
        </div>
      )}

      {abaDados === 'resultados' && (
        <div className="resultados-container">
          {buscaAvancada && (
            <>
              <div className="resultados-info">
                <span>
                  {buscaAvancada.total} resultado
                  {buscaAvancada.total !== 1 ? 's' : ''} encontrado
                  {buscaAvancada.tempoResposta > 0
                    ? ` em ${(buscaAvancada.tempoResposta / 1000).toFixed(2)}s`
                    : ''}
                </span>
                <span className="selecionados">{selecionados.size} selecionado(s)</span>
              </div>

              {resultadosUI.length > 0 ? (
                <>
                  <div className="resultados-lista">
                    {resultadosUI.map((resultado) => (
                      <div
                        key={resultado.id}
                        className={`resultado-item ${resultado.selecionado ? 'selecionado' : ''}`}
                        onClick={() => handleSelecionarResultado(resultado.id)}
                      >
                        <input
                          type="checkbox"
                          checked={resultado.selecionado}
                          onChange={() => handleSelecionarResultado(resultado.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="resultado-conteudo">
                          <div className="resultado-titulo-tipo">
                            <h4>{resultado.titulo}</h4>
                            <span className={`badge tipo-${resultado.tipo}`}>{resultado.tipo}</span>
                          </div>
                          <p className="resultado-preview">{resultado.preview}</p>
                          <div className="resultado-meta">
                            <span className="jurisdicao">{resultado.jurisdicao}</span>
                            <span className="data">{resultado.dataPublicacao.toLocaleDateString('pt-BR')}</span>
                            <span className="citacoes">📚 {resultado.citacoes} citações</span>
                            <div className="barra-relevancia">
                              <div
                                className="relevancia-fill"
                                style={{ width: `${resultado.relevancia}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {buscaAvancada.total > filtros.limite && (
                    <div className="paginacao">
                      <button
                        onClick={handlePaginaAnterior}
                        disabled={filtros.pagina === 1}
                        className="btn-paginacao"
                      >
                        ← Anterior
                      </button>
                      <span>Página {filtros.pagina}</span>
                      <button
                        onClick={handleProximaPagina}
                        disabled={
                          resultadosUI.length < filtros.limite ||
                          filtros.pagina * filtros.limite >= buscaAvancada.total
                        }
                        className="btn-paginacao"
                      >
                        Próxima →
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="sem-resultados">
                  <p>Nenhum resultado encontrado com os filtros aplicados.</p>
                  <button onClick={() => setAbaDados('filtros')} className="btn-voltar">
                    Voltar aos Filtros
                  </button>
                </div>
              )}
            </>
          )}

          {!buscaAvancada && !carregando && (
            <div className="sem-resultados">
              <p>Execute uma busca para ver resultados aqui.</p>
              <button onClick={() => setAbaDados('filtros')} className="btn-voltar">
                Ir para Filtros
              </button>
            </div>
          )}

          {carregando && (
            <div className="carregando">
              <div className="spinner" />
              <p>Buscando documentos...</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
