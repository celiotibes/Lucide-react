/**
 * Painel de Exportação
 * Interface para exportar documentos em múltiplos formatos
 */

import { useState, useMemo } from 'react'
import { useExport } from '../../hooks/useExport'
import type { LegalDocument } from '../../types/editor'
import './ExportPanel.css'

interface ExportPanelProps {
  documento: LegalDocument
  conteudo: string
}

export function ExportPanel({ documento, conteudo }: ExportPanelProps) {
  const { exportando, erro, sucesso, nomeArquivo, exportarPDF, exportarDOCX, exportarMarkdown } =
    useExport()

  const [formatoSelecionado, setFormatoSelecionado] = useState<'pdf' | 'docx' | 'markdown'>('pdf')
  const [incluirMetadados, setIncluirMetadados] = useState(true)
  const [incluirCapa, setIncluirCapa] = useState(true)

  const informacoes = useMemo(
    () => ({
      totalPalavras: conteudo.split(/\s+/).length,
      totalCaracteres: conteudo.length,
      totalLinhas: conteudo.split('\n').length,
      tamanhoEstimado: (conteudo.length / 1024).toFixed(2),
    }),
    [conteudo]
  )

  const handleExportar = async () => {
    switch (formatoSelecionado) {
      case 'pdf':
        await exportarPDF(documento, conteudo)
        break
      case 'docx':
        await exportarDOCX(documento, conteudo)
        break
      case 'markdown':
        await exportarMarkdown(documento, conteudo)
        break
    }
  }

  return (
    <div className="export-panel">
      <div className="export-header">
        <h2>📤 Exportar Documento</h2>
        <p>Escolha o formato e configure as opções de exportação</p>
      </div>

      <div className="export-container">
        {/* Informações do Documento */}
        <div className="info-section">
          <h3>📋 Informações do Documento</h3>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Título</span>
              <span className="info-valor">{documento.title}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Tipo</span>
              <span className="info-valor">{documento.templateType}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Palavras</span>
              <span className="info-valor">{informacoes.totalPalavras}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Caracteres</span>
              <span className="info-valor">{informacoes.totalCaracteres}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Linhas</span>
              <span className="info-valor">{informacoes.totalLinhas}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Tamanho Est.</span>
              <span className="info-valor">{informacoes.tamanhoEstimado} KB</span>
            </div>
          </div>
        </div>

        {/* Seleção de Formato */}
        <div className="formato-section">
          <h3>📁 Formato de Saída</h3>
          <div className="formato-opcoes">
            <label className={`formato-opcao ${formatoSelecionado === 'pdf' ? 'selecionado' : ''}`}>
              <input
                type="radio"
                name="formato"
                value="pdf"
                checked={formatoSelecionado === 'pdf'}
                onChange={(e) => setFormatoSelecionado(e.target.value as 'pdf' | 'docx' | 'markdown')}
              />
              <span className="formato-nome">📄 PDF</span>
              <span className="formato-desc">Melhor para impressão e compatibilidade</span>
            </label>

            <label className={`formato-opcao ${formatoSelecionado === 'docx' ? 'selecionado' : ''}`}>
              <input
                type="radio"
                name="formato"
                value="docx"
                checked={formatoSelecionado === 'docx'}
                onChange={(e) => setFormatoSelecionado(e.target.value as 'pdf' | 'docx' | 'markdown')}
              />
              <span className="formato-nome">📝 DOCX</span>
              <span className="formato-desc">Microsoft Word - Editável</span>
            </label>

            <label className={`formato-opcao ${formatoSelecionado === 'markdown' ? 'selecionado' : ''}`}>
              <input
                type="radio"
                name="formato"
                value="markdown"
                checked={formatoSelecionado === 'markdown'}
                onChange={(e) => setFormatoSelecionado(e.target.value as 'pdf' | 'docx' | 'markdown')}
              />
              <span className="formato-nome">📑 Markdown</span>
              <span className="formato-desc">Texto simples - Versão controle</span>
            </label>
          </div>
        </div>

        {/* Opções de Exportação */}
        <div className="opcoes-section">
          <h3>⚙️ Opções de Exportação</h3>
          <div className="opcoes-checkbox">
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={incluirCapa}
                onChange={(e) => setIncluirCapa(e.target.checked)}
              />
              <span>Incluir capa do documento</span>
            </label>
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={incluirMetadados}
                onChange={(e) => setIncluirMetadados(e.target.checked)}
              />
              <span>Incluir metadados (autor, data, status)</span>
            </label>
          </div>

          <div className="opcoes-info">
            <p>
              ℹ️ As opções selecionadas serão aplicadas ao formato escolhido durante a
              exportação.
            </p>
          </div>
        </div>

        {/* Mensagens */}
        {erro && <div className="mensagem erro">{erro}</div>}
        {sucesso && <div className="mensagem sucesso">✓ Exportado com sucesso: {nomeArquivo}</div>}

        {/* Botão Exportar */}
        <div className="botoes-export">
          <button
            onClick={handleExportar}
            disabled={exportando || !conteudo.trim()}
            className="btn-exportar"
          >
            {exportando ? '⏳ Exportando...' : `📤 Exportar como ${formatoSelecionado.toUpperCase()}`}
          </button>
        </div>

        {/* Informações Adicionais */}
        <div className="info-adicional">
          <h4>💡 Dicas de Exportação</h4>
          <ul>
            <li>
              <strong>PDF:</strong> Ideal para enviar a tribunais ou para impressão. Formato final,
              não editável.
            </li>
            <li>
              <strong>DOCX:</strong> Perfeito para fazer ajustes antes da apresentação. Compatível
              com Microsoft Word e Google Docs.
            </li>
            <li>
              <strong>Markdown:</strong> Ótimo para controle de versão com Git. Mantém
              histórico de alterações.
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
