/**
 * Construtor de Relatórios
 * Interface para criar e gerenciar relatórios customizáveis
 */

import { useState } from 'react'
import { useReports } from '../../hooks/useReports'
import type { ConfiguracaoRelatorio, FormatoRelatorio, SecaoRelatorio, TipoRelatorio } from '../../types/reports'
import './ReportBuilder.css'

const tiposRelatorio: { tipo: TipoRelatorio; label: string; emoji: string }[] = [
  { tipo: 'peticio', label: 'Petição Judicial', emoji: '⚖️' },
  { tipo: 'analise-estrategica', label: 'Análise Estratégica', emoji: '🛡️' },
  { tipo: 'resultado-predicao', label: 'Resultado de Predição', emoji: '🔮' },
  { tipo: 'anotacoes-documento', label: 'Anotações do Documento', emoji: '📝' },
  { tipo: 'estatisticas-uso', label: 'Estatísticas de Uso', emoji: '📊' },
]

const formatosRelatorio: { formato: FormatoRelatorio; label: string; emoji: string }[] = [
  { formato: 'pdf', label: 'PDF', emoji: '📄' },
  { formato: 'docx', label: 'Word', emoji: '📋' },
  { formato: 'html', label: 'HTML', emoji: '🌐' },
  { formato: 'markdown', label: 'Markdown', emoji: '📑' },
  { formato: 'json', label: 'JSON', emoji: '{ }' },
]

const secoesDisponiveis: { secao: SecaoRelatorio; label: string; emoji: string }[] = [
  { secao: 'resumo', label: 'Resumo Executivo', emoji: '📌' },
  { secao: 'conteudo', label: 'Conteúdo Principal', emoji: '📄' },
  { secao: 'metadados', label: 'Metadados', emoji: 'ℹ️' },
  { secao: 'analise', label: 'Análise', emoji: '🔍' },
  { secao: 'recomendacoes', label: 'Recomendações', emoji: '💡' },
  { secao: 'graficos', label: 'Gráficos', emoji: '📊' },
  { secao: 'anexos', label: 'Anexos', emoji: '📎' },
  { secao: 'assinatura', label: 'Assinatura Digital', emoji: '✍️' },
]

export function ReportBuilder() {
  const { relatorios, erro, sucesso, gerarRelatorio, limparMensagens } = useReports()
  const [abaSelecionada, setAbaSelecionada] = useState<'criar' | 'historico'>('criar')
  const [novaConfig, setNovaConfig] = useState<ConfiguracaoRelatorio>({
    titulo: '',
    descricao: '',
    tipo: 'peticio',
    formato: 'pdf',
    secoes: ['resumo', 'conteudo', 'recomendacoes'],
    incluirCapaRelatorio: true,
    incluirIndiceConteudo: true,
    incluirRodape: true,
    incluirNumeroPagina: true,
    dataGeracao: true,
    confidencial: false,
  })
  const [conteudo, setConteudo] = useState('')

  const handleCriarRelatorio = () => {
    if (!novaConfig.titulo.trim()) {
      alert('Título do relatório é obrigatório')
      return
    }

    if (!conteudo.trim()) {
      alert('Conteúdo do relatório é obrigatório')
      return
    }

    limparMensagens()
    const resultado = gerarRelatorio(novaConfig, conteudo)

    if (resultado.sucesso) {
      setNovaConfig({
        titulo: '',
        descricao: '',
        tipo: 'peticio',
        formato: 'pdf',
        secoes: ['resumo', 'conteudo', 'recomendacoes'],
        incluirCapaRelatorio: true,
        incluirIndiceConteudo: true,
        incluirRodape: true,
        incluirNumeroPagina: true,
        dataGeracao: true,
        confidencial: false,
      })
      setConteudo('')
      setAbaSelecionada('historico')
    }
  }

  const handleToggleSecao = (secao: SecaoRelatorio) => {
    const secoes = novaConfig.secoes
    if (secoes.includes(secao)) {
      setNovaConfig({
        ...novaConfig,
        secoes: secoes.filter(s => s !== secao),
      })
    } else {
      setNovaConfig({
        ...novaConfig,
        secoes: [...secoes, secao],
      })
    }
  }

  return (
    <div className="report-builder">
      {/* Alertas */}
      {erro && <div className="alert alert-erro">⚠️ {erro}</div>}
      {sucesso && <div className="alert alert-sucesso">✓ {sucesso}</div>}

      {/* Tabs */}
      <div className="report-tabs">
        <button
          className={`report-tab ${abaSelecionada === 'criar' ? 'ativo' : ''}`}
          onClick={() => setAbaSelecionada('criar')}
        >
          ➕ Criar Relatório
        </button>
        <button
          className={`report-tab ${abaSelecionada === 'historico' ? 'ativo' : ''}`}
          onClick={() => setAbaSelecionada('historico')}
        >
          📋 Histórico ({relatorios.length})
        </button>
      </div>

      {/* Aba Criar */}
      {abaSelecionada === 'criar' && (
        <div className="report-form">
          <div className="form-section">
            <h3>📋 Informações Básicas</h3>

            <div className="form-group">
              <label htmlFor="titulo">Título do Relatório</label>
              <input
                id="titulo"
                type="text"
                value={novaConfig.titulo}
                onChange={e => setNovaConfig({ ...novaConfig, titulo: e.target.value })}
                placeholder="Ex: Análise de Petição - Caso #123"
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="descricao">Descrição (opcional)</label>
              <textarea
                id="descricao"
                value={novaConfig.descricao || ''}
                onChange={e => setNovaConfig({ ...novaConfig, descricao: e.target.value })}
                placeholder="Descrição breve do relatório"
                className="form-textarea"
                rows={2}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="tipo">Tipo de Relatório</label>
                <select
                  id="tipo"
                  value={novaConfig.tipo}
                  onChange={e => setNovaConfig({ ...novaConfig, tipo: e.target.value as TipoRelatorio })}
                  className="form-select"
                >
                  {tiposRelatorio.map(t => (
                    <option key={t.tipo} value={t.tipo}>
                      {t.emoji} {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="formato">Formato de Saída</label>
                <select
                  id="formato"
                  value={novaConfig.formato}
                  onChange={e => setNovaConfig({ ...novaConfig, formato: e.target.value as FormatoRelatorio })}
                  className="form-select"
                >
                  {formatosRelatorio.map(f => (
                    <option key={f.formato} value={f.formato}>
                      {f.emoji} {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3>📑 Seções do Relatório</h3>
            <div className="secoes-grid">
              {secoesDisponiveis.map(s => (
                <button
                  key={s.secao}
                  onClick={() => handleToggleSecao(s.secao)}
                  className={`secao-btn ${novaConfig.secoes.includes(s.secao) ? 'ativo' : ''}`}
                  title={s.label}
                >
                  {s.emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="form-section">
            <h3>⚙️ Opções</h3>
            <div className="opcoes-grid">
              <label className="opcao-checkbox">
                <input
                  type="checkbox"
                  checked={novaConfig.incluirCapaRelatorio}
                  onChange={e => setNovaConfig({ ...novaConfig, incluirCapaRelatorio: e.target.checked })}
                />
                <span>Incluir Capa</span>
              </label>

              <label className="opcao-checkbox">
                <input
                  type="checkbox"
                  checked={novaConfig.incluirIndiceConteudo}
                  onChange={e => setNovaConfig({ ...novaConfig, incluirIndiceConteudo: e.target.checked })}
                />
                <span>Índice de Conteúdo</span>
              </label>

              <label className="opcao-checkbox">
                <input
                  type="checkbox"
                  checked={novaConfig.incluirRodape}
                  onChange={e => setNovaConfig({ ...novaConfig, incluirRodape: e.target.checked })}
                />
                <span>Incluir Rodapé</span>
              </label>

              <label className="opcao-checkbox">
                <input
                  type="checkbox"
                  checked={novaConfig.incluirNumeroPagina}
                  onChange={e => setNovaConfig({ ...novaConfig, incluirNumeroPagina: e.target.checked })}
                />
                <span>Numeração de Páginas</span>
              </label>

              <label className="opcao-checkbox">
                <input
                  type="checkbox"
                  checked={novaConfig.dataGeracao}
                  onChange={e => setNovaConfig({ ...novaConfig, dataGeracao: e.target.checked })}
                />
                <span>Data de Geração</span>
              </label>

              <label className="opcao-checkbox">
                <input
                  type="checkbox"
                  checked={novaConfig.confidencial}
                  onChange={e => setNovaConfig({ ...novaConfig, confidencial: e.target.checked })}
                />
                <span>Marcar como Confidencial</span>
              </label>
            </div>
          </div>

          <div className="form-section">
            <h3>📝 Conteúdo do Relatório</h3>
            <textarea
              value={conteudo}
              onChange={e => setConteudo(e.target.value)}
              placeholder="Cole o conteúdo completo do relatório aqui..."
              className="form-textarea-large"
              rows={10}
            />
          </div>

          <button onClick={handleCriarRelatorio} className="btn-gerar-relatorio">
            ✓ Gerar Relatório
          </button>
        </div>
      )}

      {/* Aba Histórico */}
      {abaSelecionada === 'historico' && (
        <div className="report-historico">
          {relatorios.length === 0 ? (
            <div className="empty-state">
              <p>Nenhum relatório gerado ainda</p>
            </div>
          ) : (
            <div className="relatorios-grid">
              {relatorios.map(rel => (
                <div key={rel.id} className="relatorio-card">
                  <div className="relatorio-header">
                    <div className="relatorio-titulo">{rel.titulo}</div>
                    {rel.favorito && <span className="badge-favorito">⭐</span>}
                  </div>
                  <div className="relatorio-meta">
                    <span className="relatorio-tipo">{rel.tipo}</span>
                    <span className="relatorio-tamanho">{Math.round(rel.tamanho / 1024)}KB</span>
                  </div>
                  <div className="relatorio-data">
                    {rel.dataCriacao.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className="relatorio-acoes">
                    <button className="btn-acoes">📥 Baixar</button>
                    <button className="btn-acoes">🗑️ Deletar</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
