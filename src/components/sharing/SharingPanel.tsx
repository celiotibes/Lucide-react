/**
 * Painel de Compartilhamento de Documentos
 * Interface para compartilhar documentos por link ou email
 */

import { useState } from 'react'
import { useSharing } from '../../hooks/useSharing'
import type { PermissaoCompartilhamento } from '../../types/sharing'
import './SharingPanel.css'

interface SharingPanelProps {
  documentoId: string
  nomeDocumento: string
}

export function SharingPanel({ documentoId, nomeDocumento }: SharingPanelProps) {
  const {
    compartilhamentos,
    carregando,
    erro,
    sucesso,
    compartilharPorLink,
    compartilharPorEmail,
    revogar,
    obterPorDocumento,
    obterEstatisticas,
    limparMensagens,
  } = useSharing()

  const [abaSelecionada, setAbaSelecionada] = useState<'link' | 'email' | 'gerenciar'>('link')
  const [permissaoSelecionada, setPermissaoSelecionada] = useState<PermissaoCompartilhamento>('visualizar')
  const [dataExpiracao, setDataExpiracao] = useState('')
  const [email, setEmail] = useState('')
  const [nomeContato, setNomeContato] = useState('')
  const [linkCopiadoId, setLinkCopiadoId] = useState<string | null>(null)

  const compartilhamentosDocumento = obterPorDocumento(documentoId)

  const handleCompartilharLink = () => {
    limparMensagens()
    const dataExp = dataExpiracao ? new Date(dataExpiracao) : undefined
    const resultado = compartilharPorLink(documentoId, permissaoSelecionada, dataExp)

    if (resultado.sucesso && resultado.link) {
      // Copiar para clipboard automaticamente
      navigator.clipboard.writeText(resultado.link).catch(() => {})
      setDataExpiracao('')
    }
  }

  const handleCompartilharEmail = () => {
    if (!email.trim()) {
      alert('Email é obrigatório')
      return
    }

    if (!nomeContato.trim()) {
      alert('Nome é obrigatório')
      return
    }

    limparMensagens()
    compartilharPorEmail(documentoId, email, nomeContato, permissaoSelecionada)
    setEmail('')
    setNomeContato('')
  }

  const handleCopiarLink = (compartilhamentoId: string) => {
    const comp = compartilhamentosDocumento.find(c => c.id === compartilhamentoId)
    if (comp) {
      const link = `${window.location.origin}?share=${comp.chaveAcesso}`
      navigator.clipboard.writeText(link).then(() => {
        setLinkCopiadoId(compartilhamentoId)
        setTimeout(() => setLinkCopiadoId(null), 2000)
      })
    }
  }

  const handleRevogar = (compartilhamentoId: string) => {
    if (confirm('Tem certeza que deseja revogar este acesso?')) {
      limparMensagens()
      revogar(compartilhamentoId)
    }
  }

  const obterLabelPermissao = (permissao: PermissaoCompartilhamento) => {
    switch (permissao) {
      case 'visualizar':
        return '👁️ Visualizar'
      case 'comentar':
        return '💬 Comentar'
      case 'editar':
        return '✏️ Editar'
      default:
        return permissao
    }
  }

  return (
    <div className="sharing-panel">
      <div className="sharing-header">
        <h2>🔗 Compartilhamento</h2>
        <p>Compartilhe "{nomeDocumento}" com outros usuários</p>
      </div>

      {erro && <div className="alert alert-erro">⚠️ {erro}</div>}
      {sucesso && <div className="alert alert-sucesso">✓ {sucesso}</div>}

      {/* Abas */}
      <div className="sharing-tabs">
        <button
          className={`tab-btn ${abaSelecionada === 'link' ? 'ativo' : ''}`}
          onClick={() => {
            setAbaSelecionada('link')
            limparMensagens()
          }}
        >
          🔗 Compartilhar Link
        </button>
        <button
          className={`tab-btn ${abaSelecionada === 'email' ? 'ativo' : ''}`}
          onClick={() => {
            setAbaSelecionada('email')
            limparMensagens()
          }}
        >
          📧 Compartilhar Email
        </button>
        <button
          className={`tab-btn ${abaSelecionada === 'gerenciar' ? 'ativo' : ''}`}
          onClick={() => {
            setAbaSelecionada('gerenciar')
            limparMensagens()
          }}
        >
          ⚙️ Gerenciar Acessos ({compartilhamentosDocumento.length})
        </button>
      </div>

      {/* Aba Compartilhar Link */}
      {abaSelecionada === 'link' && (
        <div className="sharing-section">
          <div className="sharing-box">
            <h3>🔗 Gerar Link de Compartilhamento</h3>

            <div className="form-group">
              <label htmlFor="permissao">Nível de Permissão</label>
              <select
                id="permissao"
                value={permissaoSelecionada}
                onChange={(e) => setPermissaoSelecionada(e.target.value as PermissaoCompartilhamento)}
                className="form-select"
              >
                <option value="visualizar">👁️ Visualizar - Apenas leitura</option>
                <option value="comentar">💬 Comentar - Adicionar comentários</option>
                <option value="editar">✏️ Editar - Edição completa</option>
              </select>
              <small>Pessoas com este link poderão {permissaoSelecionada === 'visualizar' ? 'apenas ver' : permissaoSelecionada === 'comentar' ? 'ver e comentar' : 'editar'} o documento</small>
            </div>

            <div className="form-group">
              <label htmlFor="expiracao">Data de Expiração (opcional)</label>
              <input
                id="expiracao"
                type="datetime-local"
                value={dataExpiracao}
                onChange={(e) => setDataExpiracao(e.target.value)}
                className="form-input"
              />
              <small>O link deixará de funcionar depois desta data</small>
            </div>

            <button
              onClick={handleCompartilharLink}
              disabled={carregando}
              className="btn-compartilhar"
            >
              {carregando ? '⏳ Gerando...' : '✓ Gerar Link'}
            </button>

            <div className="info-box">
              <p>💡 <strong>Dica:</strong> O link será copiado para sua área de transferência. Compartilhe-o com qualquer pessoa!</p>
            </div>
          </div>
        </div>
      )}

      {/* Aba Compartilhar Email */}
      {abaSelecionada === 'email' && (
        <div className="sharing-section">
          <div className="sharing-box">
            <h3>📧 Compartilhar por Email</h3>

            <div className="form-group">
              <label htmlFor="email">Email do Destinatário</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@exemplo.com"
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="nome-contato">Nome da Pessoa</label>
              <input
                id="nome-contato"
                type="text"
                value={nomeContato}
                onChange={(e) => setNomeContato(e.target.value)}
                placeholder="João Silva"
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="permissao-email">Nível de Permissão</label>
              <select
                id="permissao-email"
                value={permissaoSelecionada}
                onChange={(e) => setPermissaoSelecionada(e.target.value as PermissaoCompartilhamento)}
                className="form-select"
              >
                <option value="visualizar">👁️ Visualizar</option>
                <option value="comentar">💬 Comentar</option>
                <option value="editar">✏️ Editar</option>
              </select>
            </div>

            <button
              onClick={handleCompartilharEmail}
              disabled={carregando}
              className="btn-compartilhar"
            >
              {carregando ? '⏳ Compartilhando...' : '📧 Enviar Convite'}
            </button>

            <div className="info-box">
              <p>ℹ️ Um registro do compartilhamento será salvo. O email não é enviado automaticamente, apenas o registro é mantido.</p>
            </div>
          </div>
        </div>
      )}

      {/* Aba Gerenciar Acessos */}
      {abaSelecionada === 'gerenciar' && (
        <div className="sharing-section">
          {compartilhamentosDocumento.length === 0 ? (
            <div className="empty-state">
              <p>Nenhum compartilhamento ativo. Crie um para começar!</p>
            </div>
          ) : (
            <div className="acessos-list">
              {compartilhamentosDocumento.map(comp => {
                const stats = obterEstatisticas(comp.id)
                return (
                  <div key={comp.id} className="acesso-item">
                    <div className="acesso-header">
                      <div className="acesso-info">
                        <h4>
                          {comp.tipo === 'link' ? '🔗' : '📧'} {comp.tipo === 'link' ? 'Link Público' : comp.email || 'Email'}
                        </h4>
                        <span className="acesso-permissao">{obterLabelPermissao(comp.permissao)}</span>
                      </div>
                      <button
                        onClick={() => handleRevogar(comp.id)}
                        className="btn-revogar"
                        title="Revogar acesso"
                      >
                        🚫 Revogar
                      </button>
                    </div>

                    <div className="acesso-stats">
                      <span className="stat">
                        📅 Criado em {comp.dataCriacao.toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })}
                      </span>
                      {comp.dataExpiracao && (
                        <span className="stat">
                          ⏰ Expira em {comp.dataExpiracao.toLocaleDateString('pt-BR')}
                        </span>
                      )}
                      <span className="stat">
                        👁️ {stats?.totalVisualizacoes || 0} visualização(ões)
                      </span>
                    </div>

                    {comp.tipo === 'link' && (
                      <div className="acesso-actions">
                        <button
                          onClick={() => handleCopiarLink(comp.id)}
                          className="btn-copiar"
                        >
                          {linkCopiadoId === comp.id ? '✓ Copiado!' : '📋 Copiar Link'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="info-box">
            <p>💡 Você tem {compartilhamentosDocumento.length} compartilhamento(s) ativo(s) para este documento</p>
          </div>
        </div>
      )}
    </div>
  )
}
