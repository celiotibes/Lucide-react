/**
 * Busca Avançada de Documentos
 * Interface de busca e filtros para documentos
 */

import { useState } from 'react'
import { useAdvancedSearch } from '../../hooks/useAdvancedSearch'
import type { CritériosBusca } from '../../services/searchService'
import './AdvancedSearchDocuments.css'

interface AdvancedSearchDocumentsProps {
  onSelecionarDocumento?: (docId: string) => void
}

export function AdvancedSearchDocuments({ onSelecionarDocumento }: AdvancedSearchDocumentsProps) {
  const {
    documentos,
    total,
    tempo,
    carregando,
    erro,
    histórico,
    buscar,
    limpar,
    limparHistórico,
    restaurarBusca,
  } = useAdvancedSearch()

  const [texto, setTexto] = useState('')
  const [área, setÁrea] = useState<string | null>(null)
  const [tipo, setTipo] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [ordenarPor, setOrdenarPor] = useState<'relevância' | 'data' | 'tamanho' | 'versões'>(
    'relevância'
  )
  const [mostrarFiltros, setMostrarFiltros] = useState(false)

  const handleBuscar = (e: React.FormEvent) => {
    e.preventDefault()

    const critérios: CritériosBusca = {
      texto: texto || undefined,
      área: área,
      tipo: tipo,
      status: status,
      ordenarPor,
    }

    buscar(critérios)
  }

  const handleLimpar = () => {
    setTexto('')
    setÁrea(null)
    setTipo(null)
    setStatus(null)
    setOrdenarPor('relevância')
    limpar()
  }

  return (
    <div className="advanced-search-container">
      {/* Barra de Busca */}
      <div className="search-header">
        <h2>🔍 Busca Avançada de Documentos</h2>
        <p>Encontre documentos com filtros e busca full-text</p>
      </div>

      {/* Formulário de Busca */}
      <form onSubmit={handleBuscar} className="search-form">
        <div className="search-input-group">
          <input
            type="text"
            placeholder="Buscar por título ou conteúdo..."
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            disabled={carregando}
            className="search-input-principal"
          />
          <button type="submit" disabled={carregando} className="btn-buscar">
            {carregando ? '⏳ Buscando...' : '🔍 Buscar'}
          </button>
          <button
            type="button"
            onClick={handleLimpar}
            className="btn-limpar"
            disabled={carregando}
          >
            ✕ Limpar
          </button>
        </div>

        {/* Toggle Filtros */}
        <button
          type="button"
          onClick={() => setMostrarFiltros(!mostrarFiltros)}
          className="btn-toggle-filtros"
        >
          {mostrarFiltros ? '▼ Ocultar filtros' : '▶ Mostrar filtros'}
        </button>

        {/* Filtros Avançados */}
        {mostrarFiltros && (
          <div className="filtros-avançados">
            <div className="filtro-grupo">
              <label htmlFor="filtro-area">Área Jurídica</label>
              <select
                id="filtro-area"
                value={área || ''}
                onChange={(e) => setÁrea(e.target.value || null)}
              >
                <option value="">Todas</option>
                <option value="civil">Direito Civil</option>
                <option value="trabalhista">Direito Trabalhista</option>
                <option value="tributario">Direito Tributário</option>
                <option value="constitucional">Direito Constitucional</option>
              </select>
            </div>

            <div className="filtro-grupo">
              <label htmlFor="filtro-tipo">Tipo de Documento</label>
              <select
                id="filtro-tipo"
                value={tipo || ''}
                onChange={(e) => setTipo(e.target.value || null)}
              >
                <option value="">Todos</option>
                <option value="editor-novo">Editor Novo</option>
                <option value="editor">Editor Visual</option>
                <option value="analise">Análise</option>
                <option value="transformacao">Transformação</option>
              </select>
            </div>

            <div className="filtro-grupo">
              <label htmlFor="filtro-status">Status</label>
              <select
                id="filtro-status"
                value={status || ''}
                onChange={(e) => setStatus(e.target.value || null)}
              >
                <option value="">Todos</option>
                <option value="ativo">Ativo</option>
                <option value="rascunho">Rascunho</option>
                <option value="arquivado">Arquivado</option>
              </select>
            </div>

            <div className="filtro-grupo">
              <label htmlFor="ordenar-por">Ordenar por</label>
              <select
                id="ordenar-por"
                value={ordenarPor}
                onChange={(e) => setOrdenarPor(e.target.value as any)}
              >
                <option value="relevância">Relevância</option>
                <option value="data">Data (Recente)</option>
                <option value="tamanho">Tamanho (Maior)</option>
                <option value="versões">Versões (Mais)</option>
              </select>
            </div>
          </div>
        )}
      </form>

      {/* Mensagens */}
      {erro && <div className="alert alert-erro">⚠️ {erro}</div>}

      {/* Resultados */}
      {total > 0 && (
        <div className="search-stats">
          <span>🎯 {total} documento(s) encontrado(s)</span>
          <span>⏱️ {tempo}ms</span>
        </div>
      )}

      {/* Lista de Resultados */}
      {documentos.length > 0 && (
        <div className="search-results">
          {documentos.map((doc) => (
            <div
              key={doc.id}
              className="result-item"
              onClick={() => onSelecionarDocumento?.(doc.id)}
            >
              <div className="result-header">
                <h3>{doc.titulo}</h3>
                <span className="result-tipo">{doc.tipo}</span>
              </div>

              <div className="result-info">
                <span className="result-area">📍 {doc.areaJuridica}</span>
                <span className="result-status">
                  {doc.status === 'ativo' ? '✅' : doc.status === 'rascunho' ? '📝' : '📦'}{' '}
                  {doc.status}
                </span>
                <span className="result-data">📅 {new Date(doc.dataModificacao).toLocaleDateString('pt-BR')}</span>
                <span className="result-tamanho">💾 {Math.round(doc.tamanho / 1024)}KB</span>
                <span className="result-versoes">📚 {doc.versoes} versão(s)</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Estado vazio */}
      {total === 0 && !carregando && (
        <div className="search-vazio">
          <p>Nenhum documento encontrado.</p>
          <p style={{ fontSize: '12px', color: '#999' }}>
            Tente ajustar seus filtros ou mudar o termo de busca
          </p>
        </div>
      )}

      {/* Histórico de Buscas */}
      {histórico.length > 0 && (
        <div className="search-historico">
          <div className="historico-header">
            <h4>📋 Histórico de Buscas</h4>
            <button
              onClick={limparHistórico}
              className="btn-limpar-historico"
            >
              Limpar
            </button>
          </div>

          <div className="historico-items">
            {histórico.slice(0, 5).map((crit, idx) => (
              <button
                key={idx}
                onClick={() => restaurarBusca(crit)}
                className="historico-item"
              >
                🕐 {crit.texto || 'Busca sem texto'} {crit.área && `• ${crit.área}`} {crit.status && `• ${crit.status}`}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
