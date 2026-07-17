import { useState, useRef } from 'react'
import { StarSchemaManager } from '../../services/bi/starSchemaManager'
import type { CSVRow, ImportResult } from '../../types/starSchema'
import './CSVImporter.css'

interface ColumnMapping {
  csvColumn: string
  targetField: string
}

export function CSVImporter() {
  const [file, setFile] = useState<File | null>(null)
  const [csvData, setCsvData] = useState<CSVRow[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mappings, setMappings] = useState<Map<string, string>>(new Map())
  const [result, setResult] = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const requiredFields = ['accountCode', 'accountName', 'debit', 'credit', 'date']

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)
    parseCSV(selectedFile)
  }

  const parseCSV = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const lines = text.split('\n').filter((l) => l.trim())

      if (lines.length === 0) return

      // Parse header
      const header = lines[0].split(',').map((h) => h.trim())
      setHeaders(header)

      // Parse data
      const data: CSVRow[] = []
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map((v) => v.trim())
        const row: CSVRow = {}

        header.forEach((col, idx) => {
          const val = values[idx]
          row[col] = isNaN(Number(val)) ? val : Number(val)
        })

        data.push(row)
      }

      setCsvData(data)
      setMappings(new Map()) // Reset mappings
    }
    reader.readAsText(file)
  }

  const handleMappingChange = (csvCol: string, targetField: string) => {
    const newMappings = new Map(mappings)
    if (targetField) {
      newMappings.set(targetField, csvCol)
    } else {
      newMappings.delete(csvCol)
    }
    setMappings(newMappings)
  }

  const handleImport = async () => {
    if (csvData.length === 0) {
      alert('Nenhum dado para importar')
      return
    }

    setLoading(true)
    try {
      const importResult = StarSchemaManager.importCSV(csvData, mappings)
      setResult(importResult)

      if (importResult.success) {
        setTimeout(() => {
          setFile(null)
          setCsvData([])
          setHeaders([])
          setMappings(new Map())
          if (fileInputRef.current) {
            fileInputRef.current.value = ''
          }
        }, 2000)
      }
    } finally {
      setLoading(false)
    }
  }

  const allMapped = requiredFields.every((field) => mappings.has(field))

  return (
    <div className="csv-importer">
      <div className="importer-card">
        <h3>📤 Importar Arquivo CSV</h3>

        {!csvData.length ? (
          <div className="upload-section">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="file-input"
            />
            <label className="upload-label">
              <span className="upload-icon">📁</span>
              <span className="upload-text">
                {file ? file.name : 'Clique para selecionar arquivo CSV'}
              </span>
            </label>
            <p className="upload-hint">Formato esperado: CSV com colunas separadas por vírgula</p>
          </div>
        ) : (
          <div className="mapping-section">
            <div className="preview-header">
              <h4>Mapeamento de Colunas</h4>
              <p className="preview-hint">
                {csvData.length} linhas encontradas • {headers.length} colunas
              </p>
            </div>

            <div className="mapping-table">
              <div className="mapping-row header-row">
                <div className="col col-csv">Coluna CSV</div>
                <div className="col col-target">Campo de Destino</div>
                <div className="col col-status">Status</div>
              </div>

              {requiredFields.map((field) => (
                <div key={field} className="mapping-row">
                  <div className="col col-csv">
                    <select
                      value={mappings.get(field) || ''}
                      onChange={(e) => handleMappingChange(e.target.value, field)}
                      className="mapping-select"
                    >
                      <option value="">-- Selecionar --</option>
                      {headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col col-target">
                    <span className="field-label">{field}</span>
                  </div>
                  <div className="col col-status">
                    {mappings.has(field) ? (
                      <span className="status-mapped">✅ Mapeado</span>
                    ) : (
                      <span className="status-missing">⚠️ Obrigatório</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="data-preview">
              <h4>Prévia dos Dados (primeiras 5 linhas)</h4>
              <div className="preview-table">
                <table>
                  <thead>
                    <tr>
                      {headers.map((header) => (
                        <th key={header}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvData.slice(0, 5).map((row, idx) => (
                      <tr key={idx}>
                        {headers.map((header) => (
                          <td key={`${idx}_${header}`}>{row[header] || '-'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="action-buttons">
              <button
                onClick={() => {
                  setFile(null)
                  setCsvData([])
                  setHeaders([])
                  setMappings(new Map())
                  setResult(null)
                }}
                className="btn-cancel"
              >
                ← Voltar
              </button>
              <button
                onClick={handleImport}
                disabled={!allMapped || loading}
                className="btn-import"
              >
                {loading ? '⏳ Importando...' : '✅ Importar Dados'}
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className={`result-box ${result.success ? 'success' : 'error'}`}>
            <div className="result-icon">{result.success ? '✅' : '❌'}</div>
            <div className="result-content">
              <h4>{result.success ? 'Importação Concluída!' : 'Falha na Importação'}</h4>
              <p>
                Importadas {result.importedRows} de {result.totalRows} linhas
              </p>
              {result.errors.length > 0 && (
                <div className="result-errors">
                  <strong>Erros ({result.errors.length}):</strong>
                  <ul>
                    {result.errors.slice(0, 3).map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                    {result.errors.length > 3 && <li>... e mais {result.errors.length - 3}</li>}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
