import { useState, useRef } from 'react'
import type { ContractDocument, ContractAnalysis } from '../../types/contracts'
import { DocumentConverterService } from '../../services/documentConverterService'
import { ContractAnalysisService } from '../../services/contractAnalysisService'
import './ContractAnalyzerPanel.css'

export function ContractAnalyzerPanel() {
  const [analise, setAnalise] = useState<ContractAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [etapa, setEtapa] = useState<'upload' | 'processando' | 'analise' | 'validacao'>('upload')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setErro(null)

    try {
      // Converte arquivo para texto/markdown
      const resultado = await DocumentConverterService.converterArquivo(file)

      // Cria documento
      const novoDocumento: ContractDocument = {
        id: `doc_${Date.now()}`,
        fileName: file.name,
        fileType: file.type as any,
        fileSizeKB: Math.round(file.size / 1024),
        uploadDate: new Date(),
        documentType: 'contrato',
        contractType: 'aluguel',
        rawText: resultado.texto,
        markdownText: resultado.markdown,
        uploadedBy: 'usuario_atual',
        status: 'processando',
      }

      setEtapa('processando')

      // Analisa com IA
      const resultadoAnalise = await ContractAnalysisService.analisarContratoComIA(
        novoDocumento,
        resultado.markdown,
      )

      // Cria análise
      const novaAnalise = ContractAnalysisService.criarAnalise(
        novoDocumento,
        resultadoAnalise.dados,
        resultadoAnalise.confianca,
        resultadoAnalise.erros,
        resultadoAnalise.avisos,
        'usuario_atual',
      )

      setAnalise(novaAnalise)
      setEtapa('analise')
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro desconhecido')
      setEtapa('upload')
    } finally {
      setLoading(false)
    }
  }

  const handleValidar = () => {
    if (analise) {
      const validacao = ContractAnalysisService.validarDados(analise.dadosExtraidos)

      if (validacao.valido) {
        const analiseValidada = {
          ...analise,
          validado: true,
          dataValidacao: new Date(),
          status: 'concluido' as const,
        }
        setAnalise(analiseValidada)
        setEtapa('validacao')
      } else {
        setErro(`Validação falhou: ${validacao.erros.join(', ')}`)
      }
    }
  }

  return (
    <div className="contract-analyzer-panel">
      <h2>📋 Analisador de Contratos Imobiliários</h2>

      {/* Upload Section */}
      {etapa === 'upload' && (
        <div className="upload-section">
          <div className="upload-box">
            <div className="upload-icon">📄</div>
            <h3>Faça upload do Contrato</h3>
            <p>Suporta: PDF, DOCX, imagens, texto</p>

            <label className="upload-button">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.jpg,.png,.txt"
                onChange={handleFileSelect}
                disabled={loading}
                style={{ display: 'none' }}
              />
              {loading ? '⏳ Processando...' : '📤 Selecione um Arquivo'}
            </label>
          </div>
        </div>
      )}

      {/* Processing Section */}
      {etapa === 'processando' && (
        <div className="processing-section">
          <div className="spinner" />
          <p>Convertendo documento e analisando com IA...</p>
          <p className="info-text">Este processo pode levar alguns segundos</p>
        </div>
      )}

      {/* Analysis Section */}
      {etapa === 'analise' && analise && (
        <div className="analysis-section">
          <div className="analysis-header">
            <h3>✅ Análise Concluída</h3>
            <div className="confidence-badge">
              Confiança: <strong>{analise.confiancaExtracao}%</strong>
            </div>
          </div>

          {/* Erros */}
          {analise.errosDetectados.length > 0 && (
            <div className="errors-section">
              <h4>⚠️ Erros Detectados ({analise.errosDetectados.length})</h4>
              <ul>
                {analise.errosDetectados.map((erro, idx) => (
                  <li key={idx}>{erro}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Avisos */}
          {analise.avisos.length > 0 && (
            <div className="warnings-section">
              <h4>⚡ Avisos ({analise.avisos.length})</h4>
              <ul>
                {analise.avisos.map((aviso, idx) => (
                  <li key={idx}>{aviso}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Dados Extraídos */}
          <div className="extracted-data">
            <h4>📊 Dados Extraídos</h4>

            {/* Partes */}
            <div className="data-section">
              <h5>Partes do Contrato</h5>
              <div className="data-grid">
                <div className="data-field">
                  <label>Locador:</label>
                  <input type="text" value={analise.dadosExtraidos.partes?.locador || ''} />
                </div>
                <div className="data-field">
                  <label>Locatário:</label>
                  <input type="text" value={analise.dadosExtraidos.partes?.locatario || ''} />
                </div>
                <div className="data-field">
                  <label>Imobiliária:</label>
                  <input type="text" value={analise.dadosExtraidos.partes?.imobiliaria || ''} />
                </div>
              </div>
            </div>

            {/* Imóvel */}
            <div className="data-section">
              <h5>Dados do Imóvel</h5>
              <div className="data-grid">
                <div className="data-field">
                  <label>Endereço:</label>
                  <input type="text" value={analise.dadosExtraidos.imovel?.endereco || ''} />
                </div>
                <div className="data-field">
                  <label>CEP:</label>
                  <input type="text" value={analise.dadosExtraidos.imovel?.cep || ''} />
                </div>
                <div className="data-field">
                  <label>Cidade:</label>
                  <input type="text" value={analise.dadosExtraidos.imovel?.cidade || ''} />
                </div>
              </div>
            </div>

            {/* Valores */}
            <div className="data-section">
              <h5>💰 Valores Monetários</h5>
              <div className="data-grid">
                <div className="data-field">
                  <label>Aluguel (R$):</label>
                  <input type="number" value={analise.dadosExtraidos.valores?.aluguel || ''} />
                </div>
                <div className="data-field">
                  <label>Caução (R$):</label>
                  <input type="number" value={analise.dadosExtraidos.valores?.caução || ''} />
                </div>
                <div className="data-field">
                  <label>Taxa Admin (R$):</label>
                  <input type="number" value={analise.dadosExtraidos.valores?.taxa_administracao || ''} />
                </div>
                <div className="data-field">
                  <label>Seguro (R$):</label>
                  <input type="number" value={analise.dadosExtraidos.valores?.seguro_incendio || ''} />
                </div>
              </div>
            </div>

            {/* Datas */}
            <div className="data-section">
              <h5>📅 Datas Importantes</h5>
              <div className="data-grid">
                <div className="data-field">
                  <label>Início:</label>
                  <input type="date" value={analise.dadosExtraidos.datas?.data_inicio || ''} />
                </div>
                <div className="data-field">
                  <label>Fim:</label>
                  <input type="date" value={analise.dadosExtraidos.datas?.data_fim || ''} />
                </div>
                <div className="data-field">
                  <label>Vencimento Aluguel (dia):</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={analise.dadosExtraidos.datas?.dia_vencimento_aluguel || ''}
                  />
                </div>
              </div>
            </div>

            {/* Índices */}
            <div className="data-section">
              <h5>📈 Índices de Atualização</h5>
              <div className="data-grid">
                <div className="data-field">
                  <label>Tipo de Índice:</label>
                  <select value={analise.dadosExtraidos.indices?.indice_tipo || ''}>
                    <option value="">Selecione...</option>
                    <option value="IPCA">IPCA</option>
                    <option value="IGP-M">IGP-M</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>
                <div className="data-field">
                  <label>Reajuste Anual (%):</label>
                  <input type="number" value={analise.dadosExtraidos.indices?.indice_anual || ''} />
                </div>
              </div>
            </div>

            {/* Cláusulas */}
            <div className="data-section">
              <h5>⚙️ Cláusulas Importantes</h5>
              <div className="clauses-grid">
                <label className="checkbox-field">
                  <input type="checkbox" checked={analise.dadosExtraidos.clausulas?.permite_animais || false} />
                  Permite animais de estimação
                </label>
                <label className="checkbox-field">
                  <input type="checkbox" checked={analise.dadosExtraidos.clausulas?.permite_reforma || false} />
                  Permite reformas
                </label>
                <label className="checkbox-field">
                  <input type="checkbox" checked={analise.dadosExtraidos.clausulas?.fianca_obrigatoria || false} />
                  Fiança obrigatória
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={analise.dadosExtraidos.clausulas?.avalista_obrigatorio || false}
                  />
                  Avalista obrigatório
                </label>
              </div>
            </div>

            {/* Questões de Validação */}
            {analise.dadosExtraidos.questoes_validacao &&
              analise.dadosExtraidos.questoes_validacao.length > 0 && (
                <div className="data-section">
                  <h5>❓ Questões para Validação Manual</h5>
                  <ul className="questions-list">
                    {analise.dadosExtraidos.questoes_validacao.map((q, idx) => (
                      <li key={idx}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
          </div>

          {/* Action Buttons */}
          <div className="action-buttons">
            <button onClick={() => setEtapa('upload')} className="btn-secondary">
              ← Novo Arquivo
            </button>
            <button onClick={handleValidar} className="btn-primary">
              ✓ Validar e Confirmar
            </button>
          </div>
        </div>
      )}

      {/* Validation Complete Section */}
      {etapa === 'validacao' && analise && (
        <div className="validation-complete">
          <div className="success-icon">✅</div>
          <h3>Contrato Validado com Sucesso!</h3>
          <p>Os dados foram confirmados e salvos.</p>
          <div className="summary">
            <p>
              <strong>Locador:</strong> {analise.dadosExtraidos.partes?.locador || 'Não identificado'}
            </p>
            <p>
              <strong>Aluguel:</strong> R$ {analise.dadosExtraidos.valores?.aluguel || '---'}
            </p>
            <p>
              <strong>Período:</strong> {analise.dadosExtraidos.datas?.data_inicio} até{' '}
              {analise.dadosExtraidos.datas?.data_fim}
            </p>
          </div>
          <button onClick={() => setEtapa('upload')} className="btn-primary">
            📄 Analisar Novo Contrato
          </button>
        </div>
      )}

      {/* Error Display */}
      {erro && (
        <div className="error-box">
          <strong>❌ Erro:</strong> {erro}
          <button onClick={() => setErro(null)} className="error-close">
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
