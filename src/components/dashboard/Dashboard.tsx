/**
 * Dashboard Principal
 * Página inicial da aplicação com documentos e atalhos
 */

import { useState, useCallback } from 'react'
import { useDashboard } from '../../hooks/useDashboard'
import './Dashboard.css'

interface DashboardProps {
  onNavegar: (pagina: string) => void
  onAbrirDocumento?: (docId: string) => void
}

const ATALHOS_RAPIDOS = [
  {
    id: 'novo-editor',
    titulo: 'Novo Editor',
    descricao: 'Criar nova petição visual',
    icone: '✏️',
    pagina: 'editor',
  },
  {
    id: 'nova-analise',
    titulo: 'Análise Estratégica',
    descricao: 'Analisar fraquezas jurídicas',
    icone: '🛡️',
    pagina: 'strategic-analysis',
  },
  {
    id: 'busca-avancada',
    titulo: 'Busca Jurídica',
    descricao: 'Pesquisar jurisprudência',
    icone: '🔎',
    pagina: 'advanced-search',
  },
  {
    id: 'modelos',
    titulo: 'Modelos',
    descricao: 'Encontrar modelos similares',
    icone: '📚',
    pagina: 'template-matching',
  },
  {
    id: 'timeline',
    titulo: 'Evolução',
    descricao: 'Ver evolução jurisprudencial',
    icone: '📈',
    pagina: 'timeline',
  },
  {
    id: 'predicao',
    titulo: 'Predição',
    descricao: 'Calcular probabilidade sucesso',
    icone: '🔮',
    pagina: 'outcome-prediction',
  },
]

export function Dashboard({ onNavegar, onAbrirDocumento }: DashboardProps) {
  const { documentosRecentes, atividades, estatisticas, carregando } = useDashboard()
  const [filtroArea, setFiltroArea] = useState<string | null>(null)

  const handleNovoDocumento = useCallback(() => {
    onNavegar('editor-novo')
  }, [onNavegar])

  const handleAbrir = useCallback(
    (docId: string) => {
      onAbrirDocumento?.(docId)
    },
    [onAbrirDocumento]
  )

  const documentosFiltrados = filtroArea
    ? documentosRecentes.filter((d) => d.areaJuridica === filtroArea)
    : documentosRecentes

  if (carregando) {
    return (
      <div className="dashboard">
        <div className="carregando-dashboard">
          <div className="spinner" />
          <p>Carregando dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard">
      {/* Cabeçalho */}
      <div className="dashboard-header">
        <div className="header-titulo">
          <h1>⚖️ Bem-vindo ao Lucide-react</h1>
          <p>Plataforma integrada de pesquisa jurídica, análise e edição de petições</p>
        </div>
      </div>

      {/* Estatísticas */}
      <div className="dashboard-stats">
        <div className="stat-card">
          <span className="stat-icone">📄</span>
          <div className="stat-conteudo">
            <div className="stat-valor">{estatisticas.totalDocumentos}</div>
            <div className="stat-label">Documentos</div>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icone">⏰</span>
          <div className="stat-conteudo">
            <div className="stat-valor">{estatisticas.documentosHoje}</div>
            <div className="stat-label">Hoje</div>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icone">📍</span>
          <div className="stat-conteudo">
            <div className="stat-valor">{estatisticas.areaMaisUsada || '-'}</div>
            <div className="stat-label">Área Mais Usada</div>
          </div>
        </div>
        <div className="stat-card destaque">
          <span className="stat-icone">✨</span>
          <div className="stat-conteudo">
            <button onClick={handleNovoDocumento} className="btn-novo">
              Novo Documento
            </button>
          </div>
        </div>
      </div>

      {/* Atalhos Rápidos */}
      <div className="dashboard-atalhos">
        <h2>🚀 Atalhos Rápidos</h2>
        <div className="atalhos-grid">
          {ATALHOS_RAPIDOS.map((atalho) => (
            <button
              key={atalho.id}
              onClick={() => onNavegar(atalho.pagina)}
              className="atalho-card"
            >
              <span className="atalho-icone">{atalho.icone}</span>
              <div className="atalho-texto">
                <div className="atalho-titulo">{atalho.titulo}</div>
                <div className="atalho-desc">{atalho.descricao}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Documentos Recentes */}
      <div className="dashboard-documentos">
        <div className="documentos-header">
          <h2>📋 Documentos Recentes</h2>
          {estatisticas.totalDocumentos > 0 && (
            <div className="documentos-filtro">
              <select
                value={filtroArea || ''}
                onChange={(e) => setFiltroArea(e.target.value || null)}
              >
                <option value="">Todas as áreas</option>
                <option value="civil">Direito Civil</option>
                <option value="trabalhista">Direito Trabalhista</option>
                <option value="tributario">Direito Tributário</option>
                <option value="constitucional">Direito Constitucional</option>
              </select>
            </div>
          )}
        </div>

        {documentosFiltrados.length > 0 ? (
          <div className="documentos-lista">
            {documentosFiltrados.slice(0, 10).map((doc) => (
              <div key={doc.id} className="documento-item">
                <div className="documento-info">
                  <div className="documento-titulo">{doc.titulo}</div>
                  <div className="documento-meta">
                    <span className="tipo-badge">{doc.tipo}</span>
                    {doc.areaJuridica && <span className="area-badge">{doc.areaJuridica}</span>}
                    <span className="data-badge">
                      {new Date(doc.dataModificacao).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleAbrir(doc.id)}
                  className="btn-abrir"
                  title="Abrir documento"
                >
                  ▶️
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="sem-documentos">
            <p>Nenhum documento criado ainda.</p>
            <button onClick={handleNovoDocumento} className="btn-criar-primeiro">
              Criar primeiro documento
            </button>
          </div>
        )}
      </div>

      {/* Atividades Recentes */}
      {atividades.length > 0 && (
        <div className="dashboard-atividades">
          <h2>📊 Atividades Recentes</h2>
          <div className="atividades-lista">
            {atividades.slice(0, 8).map((atividade) => (
              <div key={atividade.id} className="atividade-item">
                <span className="atividade-icone">
                  {atividade.tipo === 'criacao' && '✨'}
                  {atividade.tipo === 'edicao' && '✏️'}
                  {atividade.tipo === 'exportacao' && '📤'}
                  {atividade.tipo === 'analise' && '🔍'}
                  {atividade.tipo === 'busca' && '🔎'}
                </span>
                <div className="atividade-conteudo">
                  <div className="atividade-desc">{atividade.descricao}</div>
                  <div className="atividade-data">
                    {new Date(atividade.data).toLocaleDateString('pt-BR')}{' '}
                    {new Date(atividade.data).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
