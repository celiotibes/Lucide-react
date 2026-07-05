/**
 * Painel de Anotações e Comentários
 * Interface para gerenciar anotações em documentos
 */

import { useState } from 'react'
import { useAnnotations } from '../../hooks/useAnnotations'
import type { TipoAnotacao } from '../../types/annotations'
import './AnnotationsPanel.css'

interface AnnotationsPanelProps {
  documentoId: string
  nomeDocumento: string
  autorAtual?: string
}

const tiposAnotacao: { tipo: TipoAnotacao; label: string; emoji: string }[] = [
  { tipo: 'comentario', label: 'Comentário', emoji: '💬' },
  { tipo: 'destaque', label: 'Destaque', emoji: '🌟' },
  { tipo: 'bookmark', label: 'Bookmark', emoji: '🔖' },
  { tipo: 'duvida', label: 'Dúvida', emoji: '❓' },
  { tipo: 'aprovo', label: 'Aprovo', emoji: '✅' },
]

export function AnnotationsPanel({
  documentoId,
  nomeDocumento,
  autorAtual = 'Usuário Atual',
}: AnnotationsPanelProps) {
  const {
    anotacoes,
    erro,
    sucesso,
    criar,
    marcarResolvida,
    deletar,
    adicionarComentario,
    obterComentarios,
    deletarComentario,
    obterEstatisticas,
    limparMensagens,
  } = useAnnotations(documentoId)

  const [novaAnotacao, setNovaAnotacao] = useState({
    tipo: 'comentario' as TipoAnotacao,
    conteudo: '',
    textoselecionado: '',
  })
  const [filtroTipo, setFiltroTipo] = useState<TipoAnotacao | ''>('')
  const [filtroResolvida, setFiltroResolvida] = useState<'todas' | 'pendentes' | 'resolvidas'>('todas')
  const [anotacaoSelecionada, setAnotacaoSelecionada] = useState<string | null>(null)
  const [novoComentario, setNovoComentario] = useState('')

  const stats = obterEstatisticas()

  const anotacoesFiltradas = anotacoes.filter(a => {
    if (filtroTipo && a.tipo !== filtroTipo) return false
    if (filtroResolvida === 'pendentes' && a.resolvida) return false
    if (filtroResolvida === 'resolvidas' && !a.resolvida) return false
    return true
  })

  const handleCriarAnotacao = () => {
    if (!novaAnotacao.conteudo.trim()) {
      alert('Conteúdo da anotação é obrigatório')
      return
    }

    limparMensagens()
    const resultado = criar(
      novaAnotacao.tipo,
      novaAnotacao.conteudo,
      autorAtual,
      novaAnotacao.textoselecionado || undefined
    )

    if (resultado.sucesso) {
      setNovaAnotacao({ tipo: 'comentario', conteudo: '', textoselecionado: '' })
    }
  }

  const handleAdicionarComentario = (anotacaoId: string) => {
    if (!novoComentario.trim()) return

    const resultado = adicionarComentario(anotacaoId, novoComentario, autorAtual)
    if (resultado.sucesso) {
      setNovoComentario('')
    }
  }

  const obterEmoji = (tipo: TipoAnotacao) => {
    const t = tiposAnotacao.find(x => x.tipo === tipo)
    return t?.emoji || '💬'
  }

  const obterLabel = (tipo: TipoAnotacao) => {
    const t = tiposAnotacao.find(x => x.tipo === tipo)
    return t?.label || tipo
  }

  return (
    <div className="annotations-panel">
      <div className="annotations-header">
        <h2>📝 Anotações e Comentários</h2>
        <p>Documento: {nomeDocumento}</p>
      </div>

      {erro && <div className="alert alert-erro">⚠️ {erro}</div>}
      {sucesso && <div className="alert alert-sucesso">✓ {sucesso}</div>}

      {/* Estatísticas */}
      {stats && (
        <div className="stats-box">
          <div className="stat-item">
            <span className="stat-numero">{stats.totalAnotacoes}</span>
            <span className="stat-label">Total de Anotações</span>
          </div>
          <div className="stat-item">
            <span className="stat-numero">{stats.anotacoesPendentes}</span>
            <span className="stat-label">Pendentes</span>
          </div>
          <div className="stat-item">
            <span className="stat-numero">{stats.anotacoesResolvidas}</span>
            <span className="stat-label">Resolvidas</span>
          </div>
          <div className="stat-item">
            <span className="stat-numero">{stats.totalComentarios}</span>
            <span className="stat-label">Comentários</span>
          </div>
        </div>
      )}

      {/* Criar Anotação */}
      <div className="criar-anotacao">
        <h3>➕ Nova Anotação</h3>

        <div className="form-group">
          <label htmlFor="tipo-anotacao">Tipo</label>
          <div className="tipo-buttons">
            {tiposAnotacao.map(t => (
              <button
                key={t.tipo}
                onClick={() => setNovaAnotacao({ ...novaAnotacao, tipo: t.tipo })}
                className={`tipo-btn ${novaAnotacao.tipo === t.tipo ? 'ativo' : ''}`}
                title={t.label}
              >
                {t.emoji}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="conteudo">Conteúdo da Anotação</label>
          <textarea
            id="conteudo"
            value={novaAnotacao.conteudo}
            onChange={(e) => setNovaAnotacao({ ...novaAnotacao, conteudo: e.target.value })}
            placeholder="Digite sua anotação aqui..."
            className="form-textarea"
            rows={3}
          />
        </div>

        <div className="form-group">
          <label htmlFor="texto-selecionado">Texto Selecionado (opcional)</label>
          <input
            id="texto-selecionado"
            type="text"
            value={novaAnotacao.textoselecionado}
            onChange={(e) =>
              setNovaAnotacao({ ...novaAnotacao, textoselecionado: e.target.value })
            }
            placeholder="Cole aqui o texto selecionado do documento"
            className="form-input"
          />
        </div>

        <button onClick={handleCriarAnotacao} className="btn-criar">
          ➕ Adicionar Anotação
        </button>
      </div>

      {/* Filtros */}
      <div className="filtros-anotacoes">
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value as any)}
          className="filtro-select"
        >
          <option value="">Todos os tipos</option>
          {tiposAnotacao.map(t => (
            <option key={t.tipo} value={t.tipo}>
              {t.emoji} {t.label}
            </option>
          ))}
        </select>

        <select
          value={filtroResolvida}
          onChange={(e) => setFiltroResolvida(e.target.value as any)}
          className="filtro-select"
        >
          <option value="todas">Todas</option>
          <option value="pendentes">Pendentes</option>
          <option value="resolvidas">Resolvidas</option>
        </select>
      </div>

      {/* Lista de Anotações */}
      <div className="anotacoes-list">
        {anotacoesFiltradas.length === 0 ? (
          <div className="empty-state">
            <p>Nenhuma anotação encontrada</p>
          </div>
        ) : (
          anotacoesFiltradas.map(anotacao => {
            const comentarios = obterComentarios(anotacao.id)
            const estaAberta = anotacaoSelecionada === anotacao.id

            return (
              <div
                key={anotacao.id}
                className={`anotacao-item ${anotacao.resolvida ? 'resolvida' : ''} ${estaAberta ? 'aberta' : ''}`}
              >
                <div
                  className="anotacao-header"
                  onClick={() => setAnotacaoSelecionada(estaAberta ? null : anotacao.id)}
                >
                  <div className="anotacao-titulo">
                    <span className="emoji">{obterEmoji(anotacao.tipo)}</span>
                    <span className="tipo">{obterLabel(anotacao.tipo)}</span>
                    {anotacao.resolvida && <span className="badge-resolvida">✓ Resolvida</span>}
                  </div>

                  <div className="anotacao-meta">
                    <span className="autor">{anotacao.autor}</span>
                    <span className="data">
                      {anotacao.dataCriacao.toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>

                {estaAberta && (
                  <div className="anotacao-detalhes">
                    <div className="conteudo-anotacao">
                      <p>{anotacao.conteudo}</p>

                      {anotacao.textoselecionado && (
                        <div className="texto-selecionado">
                          <strong>Texto selecionado:</strong>
                          <blockquote>{anotacao.textoselecionado}</blockquote>
                        </div>
                      )}
                    </div>

                    {/* Comentários */}
                    <div className="comentarios-section">
                      <h4>💬 Comentários ({comentarios.length})</h4>

                      {comentarios.length > 0 && (
                        <div className="comentarios-list">
                          {comentarios.map(comentario => (
                            <div key={comentario.id} className="comentario-item">
                              <div className="comentario-header">
                                <span className="comentario-autor">{comentario.autor}</span>
                                <span className="comentario-data">
                                  {comentario.dataCriacao.toLocaleDateString('pt-BR', {
                                    day: '2-digit',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>
                              <p className="comentario-conteudo">{comentario.conteudo}</p>
                              <button
                                onClick={() => deletarComentario(comentario.id)}
                                className="btn-deletar-comentario"
                              >
                                🗑️
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="novo-comentario">
                        <input
                          type="text"
                          value={novoComentario}
                          onChange={(e) => setNovoComentario(e.target.value)}
                          placeholder="Adicione um comentário..."
                          className="comentario-input"
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              handleAdicionarComentario(anotacao.id)
                            }
                          }}
                        />
                        <button
                          onClick={() => handleAdicionarComentario(anotacao.id)}
                          className="btn-comentario"
                          disabled={!novoComentario.trim()}
                        >
                          📤
                        </button>
                      </div>
                    </div>

                    {/* Ações */}
                    <div className="anotacao-actions">
                      <button
                        onClick={() => marcarResolvida(anotacao.id, !anotacao.resolvida)}
                        className={`btn-resolver ${anotacao.resolvida ? 'resolvida' : ''}`}
                      >
                        {anotacao.resolvida ? '↩️ Reabrir' : '✓ Marcar Resolvida'}
                      </button>

                      <button
                        onClick={() => deletar(anotacao.id)}
                        className="btn-deletar"
                      >
                        🗑️ Deletar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
