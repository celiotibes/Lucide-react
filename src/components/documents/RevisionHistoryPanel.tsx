/**
 * Painel de Histórico de Revisões
 * Visualiza, compara e restaura versões de documentos
 */

import { useState } from 'react'
import { servicoDocumento } from '../../services/documentService'
import type { VersaoDocumento } from '../../types/document'
import './RevisionHistoryPanel.css'

interface RevisionHistoryPanelProps {
  documentId: string
  onRestoreVersion?: (versaoNumero: number) => void
}

export function RevisionHistoryPanel({ documentId, onRestoreVersion }: RevisionHistoryPanelProps) {
  const [versoes, setVersoes] = useState<VersaoDocumento[]>([])
  const [versaoSelecionada, setVersaoSelecionada] = useState<number | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [comparandoComAtual, setComparandoComAtual] = useState(false)

  // Carregar versões ao montar
  React.useEffect(() => {
    const doc = servicoDocumento.carregarDocumento(documentId, { incluirVersoes: true })
    if (doc && doc.versoes) {
      setVersoes(doc.versoes)
    }
    setCarregando(false)
  }, [documentId])

  const handleRestaurar = (numeroVersao: number) => {
    if (confirm(`Tem certeza que deseja restaurar a versão ${numeroVersao}? Esta ação não pode ser desfeita.`)) {
      const sucesso = servicoDocumento.restaurarVersao(documentId, numeroVersao)
      if (sucesso) {
        alert('Versão restaurada com sucesso!')
        if (onRestoreVersion) {
          onRestoreVersion(numeroVersao)
        }
        // Recarregar versões
        const doc = servicoDocumento.carregarDocumento(documentId, { incluirVersoes: true })
        if (doc && doc.versoes) {
          setVersoes(doc.versoes)
        }
      } else {
        alert('Erro ao restaurar versão')
      }
    }
  }

  const handleDeletarVersao = (numeroVersao: number) => {
    // Nota: servicoDocumento não tem método para deletar versões específicas
    // Este é um placeholder para futura implementação
    alert('Funcionalidade de deletar versão será implementada em breve')
  }

  const formatarTamanho = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const tamanhos = ['B', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + tamanhos[i]
  }

  const formatarData = (data: Date): string => {
    return new Date(data).toLocaleString('pt-BR')
  }

  if (carregando) {
    return <div className="revision-loading">Carregando versões...</div>
  }

  if (versoes.length === 0) {
    return <div className="revision-empty">Nenhuma versão disponível</div>
  }

  const versaoAtual = versoes[versoes.length - 1]
  const versaoSelecionadaData = versaoSelecionada ? versoes.find(v => v.numero === versaoSelecionada) : null

  return (
    <div className="revision-history-panel">
      <div className="revision-container">
        {/* Lista de versões */}
        <div className="revision-list-section">
          <div className="revision-list-header">
            <h3>📚 Histórico de Versões ({versoes.length})</h3>
            <p className="revision-list-subtitle">Total de {versoes.length} versões salvas</p>
          </div>

          <div className="revision-list">
            {versoes
              .slice()
              .reverse()
              .map((versao) => (
                <div
                  key={versao.id}
                  className={`revision-item ${versaoSelecionada === versao.numero ? 'selecionado' : ''} ${versao.numero === versaoAtual.numero ? 'atual' : ''}`}
                  onClick={() => setVersaoSelecionada(versao.numero)}
                >
                  <div className="revision-item-header">
                    <span className="revision-numero">v{versao.numero}</span>
                    {versao.numero === versaoAtual.numero && <span className="revision-badge-atual">Atual</span>}
                  </div>

                  <div className="revision-item-info">
                    <span className="revision-data">{formatarData(versao.dataCriacao)}</span>
                    <span className="revision-tamanho">{formatarTamanho(versao.tamanho)}</span>
                  </div>

                  <p className="revision-descricao">{versao.descricao}</p>

                  {versao.numero !== versaoAtual.numero && (
                    <button
                      className="revision-restore-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRestaurar(versao.numero)
                      }}
                      title="Restaurar esta versão"
                    >
                      ↩️ Restaurar
                    </button>
                  )}
                </div>
              ))}
          </div>
        </div>

        {/* Visualização de versão selecionada */}
        {versaoSelecionadaData && (
          <div className="revision-detail-section">
            <div className="revision-detail-header">
              <h3>📄 Versão {versaoSelecionadaData.numero}</h3>
              <button
                className="revision-close-btn"
                onClick={() => setVersaoSelecionada(null)}
              >
                ✕
              </button>
            </div>

            <div className="revision-detail-info">
              <div className="info-row">
                <span className="info-label">Data de criação:</span>
                <span className="info-valor">{formatarData(versaoSelecionadaData.dataCriacao)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Tamanho:</span>
                <span className="info-valor">{formatarTamanho(versaoSelecionadaData.tamanho)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Autor:</span>
                <span className="info-valor">{versaoSelecionadaData.autor}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Descrição:</span>
                <span className="info-valor">{versaoSelecionadaData.descricao}</span>
              </div>
            </div>

            {versaoSelecionadaData.numero !== versaoAtual.numero && (
              <div className="revision-actions">
                <button
                  className="btn-restaurar"
                  onClick={() => handleRestaurar(versaoSelecionadaData.numero)}
                >
                  ↩️ Restaurar Esta Versão
                </button>
                <button
                  className="btn-deletar"
                  onClick={() => handleDeletarVersao(versaoSelecionadaData.numero)}
                >
                  🗑️ Deletar Versão
                </button>
              </div>
            )}

            {versaoSelecionadaData.numero === versaoAtual.numero && (
              <div className="revision-current-badge">
                ✓ Esta é a versão atual do documento
              </div>
            )}

            {/* Preview do conteúdo */}
            <div className="revision-content-preview">
              <h4>Pré-visualização do conteúdo:</h4>
              <div className="content-text">
                {versaoSelecionadaData.conteudo.substring(0, 500)}
                {versaoSelecionadaData.conteudo.length > 500 && '...'}
              </div>
            </div>

            {/* Estatísticas */}
            <div className="revision-stats">
              <div className="stat">
                <span className="stat-label">Palavras:</span>
                <span className="stat-valor">
                  {versaoSelecionadaData.conteudo.split(/\s+/).length}
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">Caracteres:</span>
                <span className="stat-valor">{versaoSelecionadaData.conteudo.length}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Parágrafos:</span>
                <span className="stat-valor">
                  {versaoSelecionadaData.conteudo.split(/\n\n+/).length}
                </span>
              </div>
            </div>
          </div>
        )}

        {!versaoSelecionadaData && (
          <div className="revision-placeholder">
            <p>Selecione uma versão para visualizar detalhes</p>
          </div>
        )}
      </div>
    </div>
  )
}
