/**
 * RevisionHistory Component
 * Displays document revision history with version control
 */

import { useState } from 'react'
import type { DocumentRevision } from '../../types/editor'
import { revisionManager } from '../../services/revisionManager'

interface RevisionHistoryProps {
  documentId: string
}

export function RevisionHistory({ documentId: _documentId }: RevisionHistoryProps) {
  const [revisions] = useState<DocumentRevision[]>([])
  const [selectedRevisions, setSelectedRevisions] = useState<string[]>([])

  // Simulate loading revisions
  // In a real app, this would fetch from the backend
  // const mockRevisions: DocumentRevision[] = []
  // setRevisions(mockRevisions)

  const handleToggleRevisionSelection = (revisionId: string) => {
    setSelectedRevisions((prev) => {
      if (prev.includes(revisionId)) {
        return prev.filter((id) => id !== revisionId)
      } else if (prev.length < 2) {
        return [...prev, revisionId]
      } else {
        return [prev[1], revisionId]
      }
    })
  }

  const handleCompareRevisions = () => {
    if (selectedRevisions.length !== 2) {
      alert('Selecione exatamente 2 revisões para comparar')
      return
    }

    const rev1 = revisions.find((r) => r.id === selectedRevisions[0])
    const rev2 = revisions.find((r) => r.id === selectedRevisions[1])

    if (rev1 && rev2) {
      const comparison = revisionManager.compareRevisions(rev1, rev2)
      console.log('Comparison:', comparison)
      alert('Revisões comparadas - veja console para detalhes')
    }
  }

  const handleRevertRevision = (revisionId: string) => {
    if (confirm('Tem certeza que deseja reverter para esta versão?')) {
      const targetRevision = revisions.find((r) => r.id === revisionId)
      if (targetRevision) {
        const reverted = revisionManager.revertToRevision(_documentId, targetRevision)
        console.log('Reverted to:', reverted)
        alert(`Revertido para versão ${targetRevision.version}`)
      }
    }
  }

  return (
    <div className="revision-history">
      <div className="revision-header">
        <h3>📚 Histórico de Revisões</h3>
        {selectedRevisions.length === 2 && (
          <button onClick={handleCompareRevisions} className="btn-compare">
            🔄 Comparar {selectedRevisions.length} Versões
          </button>
        )}
      </div>

      {revisions.length === 0 ? (
        <div className="empty-state">
          <p>📝 Nenhuma revisão salva ainda</p>
          <p>Cada vez que você salvar um documento, uma nova revisão será criada</p>
        </div>
      ) : (
        <div className="revision-list">
          {revisions.map((revision) => (
            <div
              key={revision.id}
              className={`revision-item ${selectedRevisions.includes(revision.id) ? 'selected' : ''}`}
              onClick={() => handleToggleRevisionSelection(revision.id)}
            >
              <div className="revision-checkbox">
                <input
                  type="checkbox"
                  checked={selectedRevisions.includes(revision.id)}
                  onChange={() => handleToggleRevisionSelection(revision.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              <div className="revision-info">
                <span className="revision-version">v{revision.version}</span>
                <span className="revision-date">
                  {new Date(revision.createdAt).toLocaleDateString('pt-BR')}
                </span>
                <span className="revision-time">
                  {new Date(revision.createdAt).toLocaleTimeString('pt-BR')}
                </span>
              </div>

              <div className="revision-summary">
                <p>{revision.changeSummary}</p>
                <div className="revision-stats">
                  <small>+{revision.changelog[0]?.linesAdded || 0}</small>
                  <small>-{revision.changelog[0]?.linesRemoved || 0}</small>
                </div>
              </div>

              <div className="revision-actions">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRevertRevision(revision.id)
                  }}
                  className="btn-small"
                  title="Reverter para esta versão"
                >
                  ↩️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
