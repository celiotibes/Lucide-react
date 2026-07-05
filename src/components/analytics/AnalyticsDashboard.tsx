/**
 * Dashboard de Analytics
 * Visualização de estatísticas e métricas da plataforma
 */

import { useEffect } from 'react'
import { useAnalytics } from '../../hooks/useAnalytics'
import './AnalyticsDashboard.css'

export function AnalyticsDashboard() {
  const { carregando, erro, obterEstatisticas } = useAnalytics()
  const stats = obterEstatisticas()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  if (carregando) {
    return <div className="analytics-loading">⏳ Carregando estatísticas...</div>
  }

  if (erro) {
    return <div className="analytics-erro">⚠️ Erro ao carregar: {erro}</div>
  }

  return (
    <div className="analytics-dashboard">
      {/* Header */}
      <div className="analytics-header">
        <h2>📊 Analytics Dashboard</h2>
        <p>Período: {stats.periodo.inicio.toLocaleDateString('pt-BR')} - {stats.periodo.fim.toLocaleDateString('pt-BR')}</p>
      </div>

      {/* Grid de Cards - Documentos */}
      <div className="analytics-section">
        <h3>📄 Documentos</h3>
        <div className="analytics-grid">
          <div className="stat-card">
            <div className="stat-value">{stats.documentos.totalDocumentos}</div>
            <div className="stat-label">Total de Documentos</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.documentos.documentosAbertos}</div>
            <div className="stat-label">Documentos Abertos</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.documentos.documentosArquivados}</div>
            <div className="stat-label">Documentos Arquivados</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{Math.round(stats.documentos.palavrasTotais.toLocaleString('pt-BR'))}</div>
            <div className="stat-label">Palavras Totais</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{Math.round(stats.documentos.caracteresTotais / 1000)}K</div>
            <div className="stat-label">Caracteres Totais</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{Math.round(stats.documentos.tamanhoMedioKB)}KB</div>
            <div className="stat-label">Tamanho Médio</div>
          </div>
        </div>
        <div className="analytics-info">
          <span>🏆 Área com mais documentos: <strong>{stats.documentos.areaComMaisDocumentos}</strong></span>
          <span>📋 Tipo mais usado: <strong>{stats.documentos.tipoComMaisDocumentos}</strong></span>
        </div>
      </div>

      {/* Grid de Cards - LLM */}
      <div className="analytics-section">
        <h3>🤖 Uso de IA (LLM Router)</h3>
        <div className="analytics-grid">
          <div className="stat-card">
            <div className="stat-value">{stats.llm.totalRequisicoes}</div>
            <div className="stat-label">Total de Requisições</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{Math.round(stats.llm.totalTokensUsados / 1000)}K</div>
            <div className="stat-label">Tokens Usados</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">${stats.llm.custoTotal.toFixed(2)}</div>
            <div className="stat-label">Custo Total</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{Math.round(stats.llm.latenciaMedia)}ms</div>
            <div className="stat-label">Latência Média</div>
          </div>
          <div className="stat-card highlight-success">
            <div className="stat-value">{stats.llm.requisicoesHoje}</div>
            <div className="stat-label">Requisições Hoje</div>
          </div>
          <div className="stat-card highlight-info">
            <div className="stat-value">${stats.llm.custoHoje.toFixed(2)}</div>
            <div className="stat-label">Custo Hoje</div>
          </div>
        </div>
        <div className="analytics-info">
          <span>⭐ Modelo mais usado: <strong>{stats.llm.modeloMaisUsado}</strong></span>
          <span>🔌 Provedor favorito: <strong>{stats.llm.provedorMaisUsado}</strong></span>
        </div>
      </div>

      {/* Grid de Cards - Análise */}
      <div className="analytics-section">
        <h3>🔍 Análise de Petições (RAG)</h3>
        <div className="analytics-grid">
          <div className="stat-card">
            <div className="stat-value">{stats.analise.totalAnalisesRAG}</div>
            <div className="stat-label">Total de Análises</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{Math.round(stats.analise.mediaFraquezasEncontradas * 10) / 10}</div>
            <div className="stat-label">Fraquezas/Análise (média)</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{Math.round(stats.analise.mediaContraArgumentosGerados * 10) / 10}</div>
            <div className="stat-label">Contra-argumentos/Análise</div>
          </div>
          <div className="stat-card highlight-warning">
            <div className="stat-value">{Math.round(stats.analise.taxaDeteccaoMedia)}%</div>
            <div className="stat-label">Taxa Detecção Média</div>
          </div>
        </div>
        <div className="analytics-info">
          <span>📊 Análise crítica: <strong>{stats.analise.analiseComMaisProblemas}</strong></span>
        </div>
      </div>

      {/* Grid de Cards - Uso */}
      <div className="analytics-section">
        <h3>👥 Uso & Engajamento</h3>
        <div className="analytics-grid">
          <div className="stat-card">
            <div className="stat-value">{Math.round(stats.uso.tempoMediaSessao / 60)}min</div>
            <div className="stat-label">Tempo Médio de Sessão</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.uso.paginavisitadas}</div>
            <div className="stat-label">Páginas Visitadas</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.uso.usuariosAtivos}</div>
            <div className="stat-label">Usuários Ativos</div>
          </div>
          <div className="stat-card highlight-success">
            <div className="stat-value">{stats.uso.taxaRetencaoSemanal.toFixed(1)}%</div>
            <div className="stat-label">Taxa Retenção Semanal</div>
          </div>
        </div>
        <div className="analytics-info">
          <span>🕐 Última atividade: <strong>{stats.uso.ultimaAtividadeEm.toLocaleString('pt-BR')}</strong></span>
          <span>📌 Componentes mais usados: <strong>{stats.uso.componentesMaisUsados.join(', ')}</strong></span>
        </div>
      </div>

      {/* Cards de Insights */}
      <div className="analytics-section">
        <h3>💡 Insights & Recomendações</h3>
        <div className="insights-grid">
          <div className="insight-card insight-success">
            <div className="insight-icon">✓</div>
            <div className="insight-conteudo">
              <div className="insight-titulo">Produtividade</div>
              <div className="insight-texto">Você criou {stats.documentos.totalDocumentos} documentos este mês com {stats.documentos.palavrasTotais} palavras</div>
            </div>
          </div>

          <div className="insight-card insight-info">
            <div className="insight-icon">ℹ</div>
            <div className="insight-conteudo">
              <div className="insight-titulo">Análises RAG</div>
              <div className="insight-texto">Executou {stats.analise.totalAnalisesRAG} análises com taxa de detecção de {Math.round(stats.analise.taxaDeteccaoMedia)}%</div>
            </div>
          </div>

          <div className="insight-card insight-warning">
            <div className="insight-icon">⚠</div>
            <div className="insight-conteudo">
              <div className="insight-titulo">Custo de IA</div>
              <div className="insight-texto">Gastou ${stats.llm.custoTotal.toFixed(2)} em {stats.llm.totalRequisicoes} requisições LLM</div>
            </div>
          </div>

          <div className="insight-card insight-info">
            <div className="insight-icon">ℹ</div>
            <div className="insight-conteudo">
              <div className="insight-titulo">Performance</div>
              <div className="insight-texto">Latência média de {Math.round(stats.llm.latenciaMedia)}ms com modelo {stats.llm.modeloMaisUsado}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Período Info */}
      <div className="analytics-footer">
        <p>Dados coletados de {stats.periodo.inicio.toLocaleDateString('pt-BR')} a {stats.periodo.fim.toLocaleDateString('pt-BR')}</p>
      </div>
    </div>
  )
}
