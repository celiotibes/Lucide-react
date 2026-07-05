/**
 * Painel de PDF Export Avançado
 * Interface para exportar documentos como PDF com opções customizadas
 */

import { useState } from 'react'
import { usePDFExport } from '../../hooks/usePDFExport'
import { servicoDocumento } from '../../services/documentService'
import type { OpcoesPDFExport, CapaDocumento } from '../../types/pdfExport'
import './PDFExportPanel.css'

export function PDFExportPanel() {
  const {
    exportando,
    erro,
    sucesso,
    exportarPDF,
    exportarPDFComCapa,
    exportarMultiplosPDF,
    obterOpcoesPadrao,
    obterTamanhosPagina,
    obterQualidadesImagem,
    limparMensagens,
  } = usePDFExport()

  const [abaSelecionada, setAbaSelecionada] = useState<'simples' | 'capa' | 'multiplo'>('simples')
  const [documentoSelecionado, setDocumentoSelecionado] = useState<string>('')
  const [documentosSelecionados, setDocumentosSelecionados] = useState<string[]>([])

  const [opcoes, setOpcoes] = useState<OpcoesPDFExport>(obterOpcoesPadrao())
  const [capa, setCapa] = useState<CapaDocumento>({
    titulo: '',
    subtitulo: '',
    autor: '',
    data: new Date(),
    areaJuridica: 'civil',
    tipo: 'editor',
  })

  const documentos = servicoDocumento.listarDocumentosSalvos()
  const tamanhosPagina = obterTamanhosPagina()
  const qualidadesImagem = obterQualidadesImagem()

  const handleExportarSimples = () => {
    if (!documentoSelecionado) {
      alert('Selecione um documento')
      return
    }

    limparMensagens()
    exportarPDF(documentoSelecionado, opcoes)
  }

  const handleExportarComCapa = () => {
    if (!documentoSelecionado) {
      alert('Selecione um documento')
      return
    }

    if (!capa.titulo.trim()) {
      alert('Título da capa é obrigatório')
      return
    }

    limparMensagens()
    exportarPDFComCapa(documentoSelecionado, capa, opcoes)
  }

  const handleExportarMultiplo = () => {
    if (documentosSelecionados.length === 0) {
      alert('Selecione pelo menos um documento')
      return
    }

    limparMensagens()
    exportarMultiplosPDF(documentosSelecionados, opcoes)
  }

  const handleSelecionarDocumentoMultiplo = (docId: string) => {
    if (documentosSelecionados.includes(docId)) {
      setDocumentosSelecionados(documentosSelecionados.filter(d => d !== docId))
    } else {
      setDocumentosSelecionados([...documentosSelecionados, docId])
    }
  }

  const preencherCapaDoDocumento = () => {
    if (!documentoSelecionado) return

    const doc = documentos.find(d => d.id === documentoSelecionado)
    if (doc) {
      setCapa({
        titulo: doc.titulo,
        subtitulo: `Documento de ${doc.areaJuridica}`,
        autor: doc.autor,
        data: new Date(doc.dataCriacao),
        areaJuridica: doc.areaJuridica,
        tipo: doc.tipo,
      })
    }
  }

  return (
    <div className="pdf-export-panel">
      <div className="export-header">
        <h2>📄 PDF Export Avançado</h2>
        <p>Exporte seus documentos como PDF com múltiplas opções de customização</p>
      </div>

      {erro && <div className="alert alert-erro">⚠️ {erro}</div>}
      {sucesso && <div className="alert alert-sucesso">✓ {sucesso}</div>}

      {/* Abas */}
      <div className="export-tabs">
        <button
          className={`tab-btn ${abaSelecionada === 'simples' ? 'ativo' : ''}`}
          onClick={() => {
            setAbaSelecionada('simples')
            limparMensagens()
          }}
        >
          📄 PDF Simples
        </button>
        <button
          className={`tab-btn ${abaSelecionada === 'capa' ? 'ativo' : ''}`}
          onClick={() => {
            setAbaSelecionada('capa')
            limparMensagens()
          }}
        >
          📘 Com Capa
        </button>
        <button
          className={`tab-btn ${abaSelecionada === 'multiplo' ? 'ativo' : ''}`}
          onClick={() => {
            setAbaSelecionada('multiplo')
            limparMensagens()
          }}
        >
          📚 Múltiplos
        </button>
      </div>

      {/* Aba PDF Simples */}
      {abaSelecionada === 'simples' && (
        <div className="export-section">
          <div className="export-box">
            <h3>📄 Exportar Documento como PDF</h3>

            <div className="form-group">
              <label htmlFor="doc-simples">Selecione o Documento</label>
              <select
                id="doc-simples"
                value={documentoSelecionado}
                onChange={(e) => setDocumentoSelecionado(e.target.value)}
                className="form-select"
              >
                <option value="">-- Escolha um documento --</option>
                {documentos.map(doc => (
                  <option key={doc.id} value={doc.id}>
                    {doc.titulo} ({doc.areaJuridica})
                  </option>
                ))}
              </select>
            </div>

            <div className="opcoes-grid">
              <div className="form-group">
                <label htmlFor="tamanho">Tamanho da Página</label>
                <select
                  id="tamanho"
                  value={opcoes.tamanho}
                  onChange={(e) =>
                    setOpcoes({ ...opcoes, tamanho: e.target.value as any })
                  }
                  className="form-select"
                >
                  {Object.entries(tamanhosPagina).map(([key, value]) => (
                    <option key={key} value={key}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="orientacao">Orientação</label>
                <select
                  id="orientacao"
                  value={opcoes.orientacao}
                  onChange={(e) =>
                    setOpcoes({ ...opcoes, orientacao: e.target.value as any })
                  }
                  className="form-select"
                >
                  <option value="portrait">Retrato</option>
                  <option value="landscape">Paisagem</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="qualidade">Qualidade de Imagem</label>
                <select
                  id="qualidade"
                  value={opcoes.qualidadeImagem}
                  onChange={(e) =>
                    setOpcoes({ ...opcoes, qualidadeImagem: e.target.value as any })
                  }
                  className="form-select"
                >
                  {Object.entries(qualidadesImagem).map(([key, value]) => (
                    <option key={key} value={key}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="opcoes-checkboxes">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={opcoes.incluirRodape}
                  onChange={(e) => setOpcoes({ ...opcoes, incluirRodape: e.target.checked })}
                />
                Incluir Rodapé
              </label>

              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={opcoes.incluirNumeroPagina}
                  onChange={(e) =>
                    setOpcoes({ ...opcoes, incluirNumeroPagina: e.target.checked })
                  }
                />
                Incluir Número de Página
              </label>

              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={opcoes.incluirAssinatura}
                  onChange={(e) =>
                    setOpcoes({ ...opcoes, incluirAssinatura: e.target.checked })
                  }
                />
                Incluir Assinatura
              </label>

              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={opcoes.comprimido}
                  onChange={(e) => setOpcoes({ ...opcoes, comprimido: e.target.checked })}
                />
                Comprimir
              </label>
            </div>

            {opcoes.incluirAssinatura && (
              <div className="form-group">
                <label htmlFor="assinatura">Texto da Assinatura</label>
                <input
                  id="assinatura"
                  type="text"
                  value={opcoes.assinatura || ''}
                  onChange={(e) => setOpcoes({ ...opcoes, assinatura: e.target.value })}
                  placeholder="Ex: João da Silva"
                  className="form-input"
                />
              </div>
            )}

            <button
              onClick={handleExportarSimples}
              disabled={exportando || !documentoSelecionado}
              className="btn-exportar"
            >
              {exportando ? '⏳ Exportando...' : '📥 Exportar como PDF'}
            </button>
          </div>
        </div>
      )}

      {/* Aba Com Capa */}
      {abaSelecionada === 'capa' && (
        <div className="export-section">
          <div className="export-box">
            <h3>📘 Exportar com Capa Personalizada</h3>

            <div className="form-group">
              <label htmlFor="doc-capa">Selecione o Documento</label>
              <select
                id="doc-capa"
                value={documentoSelecionado}
                onChange={(e) => setDocumentoSelecionado(e.target.value)}
                className="form-select"
              >
                <option value="">-- Escolha um documento --</option>
                {documentos.map(doc => (
                  <option key={doc.id} value={doc.id}>
                    {doc.titulo}
                  </option>
                ))}
              </select>

              {documentoSelecionado && (
                <button onClick={preencherCapaDoDocumento} className="btn-preencher">
                  🔄 Preencher da Documento
                </button>
              )}
            </div>

            <div className="capa-preview">
              <h4>👁️ Pré-visualização da Capa</h4>
              <div className="capa-box">
                <div className="capa-content">
                  <p className="capa-logo">⚖️</p>
                  <p className="capa-titulo">{capa.titulo || 'Título da Capa'}</p>
                  <p className="capa-subtitulo">{capa.subtitulo || 'Subtítulo'}</p>
                  <p className="capa-separador">_______________</p>
                  <p className="capa-autor">{capa.autor || 'Autor'}</p>
                  <p className="capa-area">{capa.areaJuridica}</p>
                  <p className="capa-data">{capa.data.toLocaleDateString('pt-BR')}</p>
                </div>
              </div>
            </div>

            <div className="capa-form">
              <div className="form-group">
                <label htmlFor="capa-titulo">Título</label>
                <input
                  id="capa-titulo"
                  type="text"
                  value={capa.titulo}
                  onChange={(e) => setCapa({ ...capa, titulo: e.target.value })}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="capa-subtitulo">Subtítulo</label>
                <input
                  id="capa-subtitulo"
                  type="text"
                  value={capa.subtitulo}
                  onChange={(e) => setCapa({ ...capa, subtitulo: e.target.value })}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="capa-autor">Autor</label>
                <input
                  id="capa-autor"
                  type="text"
                  value={capa.autor}
                  onChange={(e) => setCapa({ ...capa, autor: e.target.value })}
                  className="form-input"
                />
              </div>
            </div>

            <button
              onClick={handleExportarComCapa}
              disabled={exportando || !documentoSelecionado}
              className="btn-exportar"
            >
              {exportando ? '⏳ Exportando...' : '📥 Exportar com Capa'}
            </button>
          </div>
        </div>
      )}

      {/* Aba Múltiplos Documentos */}
      {abaSelecionada === 'multiplo' && (
        <div className="export-section">
          <div className="export-box">
            <h3>📚 Exportar Múltiplos Documentos</h3>

            <div className="docs-grid">
              {documentos.map(doc => (
                <label key={doc.id} className="doc-checkbox">
                  <input
                    type="checkbox"
                    checked={documentosSelecionados.includes(doc.id)}
                    onChange={() => handleSelecionarDocumentoMultiplo(doc.id)}
                  />
                  <span className="doc-info">
                    <strong>{doc.titulo}</strong>
                    <small>{doc.areaJuridica}</small>
                  </span>
                </label>
              ))}
            </div>

            {documentosSelecionados.length > 0 && (
              <div className="selecionados-info">
                <p>✓ {documentosSelecionados.length} documento(s) selecionado(s)</p>
              </div>
            )}

            <button
              onClick={handleExportarMultiplo}
              disabled={exportando || documentosSelecionados.length === 0}
              className="btn-exportar"
            >
              {exportando ? '⏳ Exportando...' : '📥 Exportar Múltiplos PDFs'}
            </button>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="export-info">
        <h4>💡 Informações</h4>
        <ul>
          <li>Os PDFs são gerados usando a função de impressão do navegador</li>
          <li>Você pode salvar como PDF ou imprimir na impressora</li>
          <li>As margens padrão são de 20mm em todos os lados</li>
          <li>Assinaturas são adicionadas como texto no final do documento</li>
          <li>Múltiplos documentos são separados por page-break</li>
        </ul>
      </div>
    </div>
  )
}
