/**
 * Painel de Import/Export
 * Interface para exportar e importar documentos
 */

import { useState, useRef } from 'react'
import { useImportExport } from '../../hooks/useImportExport'
import type { FormatoExportacao } from '../../services/importExportService'
import './ImportExportPanel.css'

interface ImportExportPanelProps {
  documentoId?: string
  onImportSucesso?: (documentoId: string) => void
}

export function ImportExportPanel({ documentoId, onImportSucesso }: ImportExportPanelProps) {
  const {
    exportando,
    importando,
    erro,
    sucesso,
    exportarDocumento,
    exportarBackupCompleto,
    importarDocumento,
    importarBackupCompleto,
    limparMensagens,
  } = useImportExport()

  const [abaSelecionada, setAbaSelecionada] = useState<'exportar' | 'importar'>('exportar')
  const [formatoSelecionado, setFormatoSelecionado] = useState<FormatoExportacao>('json')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [conteúdoImportação, setConteúdoImportação] = useState('')

  const handleExportarDocumento = () => {
    if (documentoId) {
      limparMensagens()
      exportarDocumento(documentoId, formatoSelecionado)
    }
  }

  const handleExportarBackup = () => {
    limparMensagens()
    exportarBackupCompleto()
  }

  const handleSelecionarArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        const conteúdo = event.target?.result as string
        setConteúdoImportação(conteúdo)
      }
      reader.readAsText(file)
    }
  }

  const handleImportarDocumento = () => {
    if (conteúdoImportação) {
      limparMensagens()
      const resultado = importarDocumento(conteúdoImportação)
      if (resultado.sucesso && resultado.documentoId && onImportSucesso) {
        setTimeout(() => onImportSucesso(resultado.documentoId!), 500)
      }
      setConteúdoImportação('')
    }
  }

  const handleImportarBackup = () => {
    if (conteúdoImportação) {
      limparMensagens()
      importarBackupCompleto(conteúdoImportação)
      setConteúdoImportação('')
    }
  }

  return (
    <div className="import-export-container">
      <div className="import-export-header">
        <h2>📤📥 Import/Export</h2>
        <p>Faça backup e compartilhe seus documentos</p>
      </div>

      {/* Abas */}
      <div className="import-export-tabs">
        <button
          className={`tab-btn ${abaSelecionada === 'exportar' ? 'ativo' : ''}`}
          onClick={() => {
            setAbaSelecionada('exportar')
            limparMensagens()
          }}
        >
          📤 Exportar
        </button>
        <button
          className={`tab-btn ${abaSelecionada === 'importar' ? 'ativo' : ''}`}
          onClick={() => {
            setAbaSelecionada('importar')
            limparMensagens()
          }}
        >
          📥 Importar
        </button>
      </div>

      {/* Mensagens */}
      {erro && <div className="alert alert-erro">⚠️ {erro}</div>}
      {sucesso && <div className="alert alert-sucesso">✓ {sucesso}</div>}

      {/* Aba Exportar */}
      {abaSelecionada === 'exportar' && (
        <div className="export-section">
          {documentoId ? (
            <>
              <div className="export-box">
                <h3>📄 Exportar Documento Atual</h3>
                <p>Exporte o documento em múltiplos formatos</p>

                <div className="format-selector">
                  <label htmlFor="formato">Formato de Exportação:</label>
                  <select
                    id="formato"
                    value={formatoSelecionado}
                    onChange={(e) => setFormatoSelecionado(e.target.value as FormatoExportacao)}
                    disabled={exportando}
                  >
                    <option value="json">📋 JSON (Com Versões)</option>
                    <option value="markdown">📝 Markdown</option>
                    <option value="texto-plano">📄 Texto Plano</option>
                    <option value="html">🌐 HTML</option>
                    <option value="backup">💾 Backup Comprimido</option>
                  </select>
                </div>

                <button
                  onClick={handleExportarDocumento}
                  disabled={exportando}
                  className="btn-exportar"
                >
                  {exportando ? '⏳ Exportando...' : '📤 Exportar Agora'}
                </button>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <p>Nenhum documento selecionado</p>
            </div>
          )}

          <div className="export-box">
            <h3>💾 Backup Completo</h3>
            <p>Exporte todos os seus documentos em um arquivo de backup</p>

            <button
              onClick={handleExportarBackup}
              disabled={exportando}
              className="btn-backup"
            >
              {exportando ? '⏳ Exportando...' : '💾 Fazer Backup Agora'}
            </button>

            <p className="info-text">
              ℹ️ O backup inclui todos os documentos, versões e metadados. Pode ser usado para
              restaurar sua biblioteca.
            </p>
          </div>
        </div>
      )}

      {/* Aba Importar */}
      {abaSelecionada === 'importar' && (
        <div className="import-section">
          <div className="import-box">
            <h3>📥 Importar Documento</h3>
            <p>Importe um documento de um arquivo JSON ou TXT</p>

            <div className="file-input-wrapper">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleSelecionarArquivo}
                accept=".json,.txt,.md"
                disabled={importando}
                style={{ display: 'none' }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importando}
                className="btn-selecionar-arquivo"
              >
                📂 Selecionar Arquivo
              </button>
            </div>

            {conteúdoImportação && (
              <>
                <textarea
                  value={conteúdoImportação}
                  onChange={(e) => setConteúdoImportação(e.target.value)}
                  placeholder="Ou cole o conteúdo JSON aqui..."
                  className="textarea-importacao"
                />

                <button
                  onClick={handleImportarDocumento}
                  disabled={importando || !conteúdoImportação}
                  className="btn-importar"
                >
                  {importando ? '⏳ Importando...' : '📥 Importar Documento'}
                </button>
              </>
            )}
          </div>

          <div className="import-box">
            <h3>📦 Restaurar Backup</h3>
            <p>Importe um arquivo de backup completo de documentos</p>

            <div className="file-input-wrapper">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleSelecionarArquivo}
                accept=".json,.backup"
                disabled={importando}
                style={{ display: 'none' }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importando}
                className="btn-selecionar-arquivo"
              >
                📂 Selecionar Backup
              </button>
            </div>

            {conteúdoImportação && (
              <>
                <textarea
                  value={conteúdoImportação}
                  onChange={(e) => setConteúdoImportação(e.target.value)}
                  placeholder="Ou cole o conteúdo do backup aqui..."
                  className="textarea-importacao"
                />

                <button
                  onClick={handleImportarBackup}
                  disabled={importando || !conteúdoImportação}
                  className="btn-restaurar"
                >
                  {importando ? '⏳ Restaurando...' : '📦 Restaurar Backup'}
                </button>
              </>
            )}

            <p className="warning-text">
              ⚠️ A restauração pode sobrescrever documentos existentes. Faça backup antes de
              restaurar.
            </p>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="import-export-info">
        <h4>💡 Dicas</h4>
        <ul>
          <li>Use JSON para manter versões e metadados completos</li>
          <li>Use Markdown ou HTML para compartilhar em outros formatos</li>
          <li>Faça backup regularmente de seus documentos</li>
          <li>Todos os dados são processados localmente no seu navegador</li>
        </ul>
      </div>
    </div>
  )
}
