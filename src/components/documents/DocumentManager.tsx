/**
 * Gerenciador de Documentos
 * Interface para criar, abrir, deletar e organizar documentos
 */

import { useState, useEffect } from 'react'
import { servicoDocumento } from '../../services/documentService'
import type { DocumentoSalvo } from '../../types/document'
import './DocumentManager.css'

interface DocumentManagerProps {
  onAbrirDocumento: (docId: string) => void
  onCriarNovo: (tipo: 'editor' | 'editor-novo' | 'analise' | 'transformacao') => void
}

export function DocumentManager({ onAbrirDocumento, onCriarNovo }: DocumentManagerProps) {
  const [documentos, setDocumentos] = useState<DocumentoSalvo[]>([])
  const [filtroArea, setFiltroArea] = useState<string | null>(null)
  const [filtroTipo, setFiltroTipo] = useState<string | null>(null)
  const [filtroStatus, setFiltroStatus] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())

  useEffect(() => {
    carregarDocumentos()
  }, [filtroArea, filtroTipo, filtroStatus])

  const carregarDocumentos = () => {
    let docs = servicoDocumento.listarDocumentosSalvos()

    if (filtroArea) {
      docs = docs.filter((d) => d.areaJuridica === filtroArea)
    }
    if (filtroTipo) {
      docs = docs.filter((d) => d.tipo === filtroTipo)
    }
    if (filtroStatus) {
      docs = docs.filter((d) => d.status === filtroStatus)
    }
    if (busca) {
      docs = docs.filter((d) =>
        d.titulo.toLowerCase().includes(busca.toLowerCase())
      )
    }

    setDocumentos(docs)
  }

  const handleBusca = (termo: string) => {
    setBusca(termo)
    carregarDocumentos()
  }

  const handleSelecionarTodos = () => {
    if (selecionados.size === documentos.length) {
      setSelecionados(new Set())
    } else {
      setSelecionados(new Set(documentos.map((d) => d.id)))
    }
  }

  const handleSelecionarDocumento = (id: string) => {
    const novo = new Set(selecionados)
    if (novo.has(id)) {
      novo.delete(id)
    } else {
      novo.add(id)
    }
    setSelecionados(novo)
  }

  const handleDeletar = (id: string) => {
    if (confirm('Tem certeza que deseja deletar este documento?')) {
      servicoDocumento.deletarDocumento(id)
      carregarDocumentos()
    }
  }

  const handleDuplicar = (id: string) => {
    const novoTitulo = prompt('Nome do novo documento:')
    if (novoTitulo) {
      servicoDocumento.duplicarDocumento(id, novoTitulo)
      carregarDocumentos()
    }
  }

  const handleDeletarSelecionados = () => {
    if (selecionados.size === 0) return

    if (
      confirm(
        `Deletar ${selecionados.size} documento(s)? Esta ação não pode ser desfeita.`
      )
    ) {
      selecionados.forEach((id) => {
        servicoDocumento.deletarDocumento(id)
      })
      setSelecionados(new Set())
      carregarDocumentos()
    }
  }

  const areasCounts = documentos.reduce(
    (acc, doc) => {
      acc[doc.areaJuridica] = (acc[doc.areaJuridica] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  return (
    <div className="document-manager">
      <div className="doc-header">
        <h2>📄 Gerenciador de Documentos</h2>
        <p>Crie, abra e organize seus documentos jurídicos</p>
      </div>

      {/* Criar Novo */}
      <div className="doc-criar">
        <h3>✨ Criar Novo</h3>
        <div className="criar-grid">
          <button
            onClick={() => onCriarNovo('editor-novo')}
            className="criar-btn"
          >
            <span className="btn-icone">📝</span>
            <span className="btn-texto">Novo Editor</span>
          </button>
          <button
            onClick={() => onCriarNovo('editor')}
            className="criar-btn"
          >
            <span className="btn-icone">✏️</span>
            <span className="btn-texto">Editor Visual</span>
          </button>
          <button
            onClick={() => onCriarNovo('analise')}
            className="criar-btn"
          >
            <span className="btn-icone">🛡️</span>
            <span className="btn-texto">Análise</span>
          </button>
          <button
            onClick={() => onCriarNovo('transformacao')}
            className="criar-btn"
          >
            <span className="btn-icone">🚀</span>
            <span className="btn-texto">Transformação</span>
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="doc-filtros">
        <div className="filtro-busca">
          <input
            type="text"
            placeholder="🔍 Buscar documentos..."
            value={busca}
            onChange={(e) => handleBusca(e.target.value)}
            className="input-busca"
          />
        </div>

        <div className="filtros-select">
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

          <select
            value={filtroTipo || ''}
            onChange={(e) => setFiltroTipo(e.target.value || null)}
          >
            <option value="">Todos os tipos</option>
            <option value="editor-novo">Editor Novo</option>
            <option value="editor">Editor Visual</option>
            <option value="analise">Análise</option>
            <option value="transformacao">Transformação</option>
          </select>

          <select
            value={filtroStatus || ''}
            onChange={(e) => setFiltroStatus(e.target.value || null)}
          >
            <option value="">Todos os status</option>
            <option value="ativo">Ativo</option>
            <option value="rascunho">Rascunho</option>
            <option value="arquivado">Arquivado</option>
          </select>
        </div>
      </div>

      {/* Ações em Lote */}
      {selecionados.size > 0 && (
        <div className="doc-acoes">
          <span>{selecionados.size} selecionado(s)</span>
          <button onClick={handleDeletarSelecionados} className="btn-deletar">
            🗑️ Deletar Selecionados
          </button>
        </div>
      )}

      {/* Lista de Documentos */}
      <div className="doc-lista">
        {documentos.length > 0 ? (
          <>
            <div className="doc-header-linha">
              <input
                type="checkbox"
                checked={selecionados.size === documentos.length && documentos.length > 0}
                onChange={handleSelecionarTodos}
              />
              <span className="col-titulo">Título</span>
              <span className="col-tipo">Tipo</span>
              <span className="col-area">Área</span>
              <span className="col-data">Modificado</span>
              <span className="col-acoes">Ações</span>
            </div>

            {documentos.map((doc) => (
              <div key={doc.id} className="doc-item">
                <input
                  type="checkbox"
                  checked={selecionados.has(doc.id)}
                  onChange={() => handleSelecionarDocumento(doc.id)}
                />
                <span
                  className="col-titulo clicavel"
                  onClick={() => onAbrirDocumento(doc.id)}
                >
                  {doc.titulo}
                </span>
                <span className="col-tipo">
                  <span className="tipo-badge">{doc.tipo}</span>
                </span>
                <span className="col-area">{doc.areaJuridica}</span>
                <span className="col-data">
                  {new Date(doc.dataModificacao).toLocaleDateString('pt-BR')}
                </span>
                <span className="col-acoes">
                  <button
                    onClick={() => onAbrirDocumento(doc.id)}
                    className="btn-acao abrir"
                    title="Abrir"
                  >
                    ▶️
                  </button>
                  <button
                    onClick={() => handleDuplicar(doc.id)}
                    className="btn-acao duplicar"
                    title="Duplicar"
                  >
                    📋
                  </button>
                  <button
                    onClick={() => handleDeletar(doc.id)}
                    className="btn-acao deletar"
                    title="Deletar"
                  >
                    🗑️
                  </button>
                </span>
              </div>
            ))}
          </>
        ) : (
          <div className="doc-vazio">
            <p>Nenhum documento encontrado.</p>
            <button onClick={() => onCriarNovo('editor-novo')} className="btn-criar-primeiro">
              Criar primeiro documento
            </button>
          </div>
        )}
      </div>

      {/* Estatísticas */}
      {documentos.length > 0 && (
        <div className="doc-stats">
          <div className="stat">
            <span className="stat-numero">{documentos.length}</span>
            <span className="stat-label">Documentos</span>
          </div>
          {Object.entries(areasCounts).map(([area, count]) => (
            <div key={area} className="stat">
              <span className="stat-numero">{count}</span>
              <span className="stat-label">{area}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
