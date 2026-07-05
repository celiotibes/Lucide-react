/**
 * Gerenciador de Compartilhamento de Documentos
 * Permite selecionar e compartilhar documentos
 */

import { useState } from 'react'
import { servicoDocumento } from '../../services/documentService'
import { SharingPanel } from './SharingPanel'
import './DocumentSharingManager.css'

export function DocumentSharingManager() {
  const [documentoSelecionado, setDocumentoSelecionado] = useState<string | null>(null)
  const [filtroArea, setFiltroArea] = useState<string>('')
  const [filtroTipo, setFiltroTipo] = useState<string>('')

  const documentos = servicoDocumento.listarDocumentosSalvos()

  const documentosFiltrados = documentos.filter(doc => {
    let passa = true

    if (filtroArea && doc.areaJuridica !== filtroArea) {
      passa = false
    }

    if (filtroTipo && doc.tipo !== filtroTipo) {
      passa = false
    }

    return passa
  })

  const docSelecionado = documentoSelecionado
    ? documentos.find(d => d.id === documentoSelecionado)
    : null

  const areas = [...new Set(documentos.map(d => d.areaJuridica))]
  const tipos = [...new Set(documentos.map(d => d.tipo))]

  return (
    <div className="document-sharing-manager">
      <div className="sharing-container">
        {/* Painel de Seleção */}
        <div className="selection-panel">
          <div className="selection-header">
            <h3>📄 Selecione um Documento</h3>
          </div>

          {/* Filtros */}
          <div className="filtros-compartilhamento">
            <select
              value={filtroArea}
              onChange={(e) => setFiltroArea(e.target.value)}
              className="filtro-select"
            >
              <option value="">Todas as áreas</option>
              {areas.map(area => (
                <option key={area} value={area}>
                  {area.charAt(0).toUpperCase() + area.slice(1)}
                </option>
              ))}
            </select>

            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="filtro-select"
            >
              <option value="">Todos os tipos</option>
              {tipos.map(tipo => (
                <option key={tipo} value={tipo}>
                  {tipo.charAt(0).toUpperCase() + tipo.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Lista de Documentos */}
          <div className="documentos-list">
            {documentosFiltrados.length === 0 ? (
              <div className="empty-state">
                <p>Nenhum documento encontrado</p>
              </div>
            ) : (
              documentosFiltrados.map(doc => (
                <button
                  key={doc.id}
                  onClick={() => setDocumentoSelecionado(doc.id)}
                  className={`documento-item ${documentoSelecionado === doc.id ? 'ativo' : ''}`}
                >
                  <div className="doc-titulo">{doc.titulo}</div>
                  <div className="doc-meta">
                    <span className="meta-badge">{doc.tipo}</span>
                    <span className="meta-badge">{doc.areaJuridica}</span>
                    <span className="meta-data">
                      {new Date(doc.dataCriacao).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Painel de Compartilhamento */}
        <div className="sharing-detail-panel">
          {!docSelecionado ? (
            <div className="no-selection">
              <p>👈 Selecione um documento para começar</p>
            </div>
          ) : (
            <SharingPanel
              documentoId={docSelecionado.id}
              nomeDocumento={docSelecionado.titulo}
            />
          )}
        </div>
      </div>
    </div>
  )
}
