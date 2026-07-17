import { useState, useEffect } from 'react'
import {
  AccountingDataProvider,
  type AccountingDataSource,
  type FetchOptions,
  type DataFetchResult,
} from '../../services/bi/accountingDataProvider'
import './DataSourceSelector.css'

interface DataSourceSelectorProps {
  onDataFetched?: (data: DataFetchResult) => void
  onError?: (error: string) => void
}

export function DataSourceSelector({ onDataFetched, onError }: DataSourceSelectorProps) {
  const [sources, setSources] = useState<AccountingDataSource[]>([])
  const [selectedSource, setSelectedSource] = useState<AccountingDataSource | null>(null)
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  })
  const [apiKey, setApiKey] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    const available = AccountingDataProvider.getAvailableSources()
    setSources(available)
    if (available.length > 0) {
      setSelectedSource(available[0])
    }
  }, [])

  const handleFetch = async () => {
    if (!selectedSource) {
      onError?.('No data source selected')
      return
    }

    setLoading(true)
    setStatus('Fetching data...')

    const source: AccountingDataSource = {
      ...selectedSource,
      apiKey: apiKey || undefined,
      endpoint: endpoint || selectedSource.endpoint,
    }

    const options: FetchOptions = {
      source,
      dateRange,
    }

    const result = await AccountingDataProvider.fetchData(options)

    setLoading(false)

    if (result.success) {
      setStatus(`✅ Loaded ${result.recordsCount} records`)
      onDataFetched?.(result)
    } else {
      setStatus(`❌ Error: ${result.error}`)
      onError?.(result.error || 'Unknown error')
    }
  }

  return (
    <div className="data-source-selector">
      <h3>📊 Data Source Selection</h3>

      <div className="selector-section">
        <label>Select Data Source</label>
        <select
          value={selectedSource?.name || ''}
          onChange={(e) => {
            const source = sources.find((s) => s.name === e.target.value)
            setSelectedSource(source || null)
          }}
          disabled={loading}
          className="source-select"
        >
          <option value="">-- Choose a source --</option>
          {sources.map((source) => (
            <option key={source.name} value={source.name}>
              {source.name}
            </option>
          ))}
        </select>
      </div>

      {selectedSource && (
        <>
          {selectedSource.type === 'api' && (
            <>
              <div className="selector-section">
                <label>API Endpoint</label>
                <input
                  type="text"
                  value={endpoint || selectedSource.endpoint || ''}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder="https://api.example.com/accounting/ledger"
                  disabled={loading}
                  className="input-field"
                />
              </div>

              <div className="selector-section">
                <label>API Key (Optional)</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Your API key"
                  disabled={loading}
                  className="input-field"
                />
              </div>
            </>
          )}

          <div className="selector-section">
            <label>Date Range</label>
            <div className="date-range">
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                disabled={loading}
                className="input-field"
              />
              <span className="range-separator">to</span>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                disabled={loading}
                className="input-field"
              />
            </div>
          </div>

          <div className="selector-section info-box">
            <p>
              <strong>Source Type:</strong> {selectedSource.type}
            </p>
            {selectedSource.endpoint && (
              <p>
                <strong>Endpoint:</strong> <code>{selectedSource.endpoint}</code>
              </p>
            )}
          </div>
        </>
      )}

      {status && (
        <div className={`status-message ${status.startsWith('✅') ? 'success' : 'error'}`}>
          {status}
        </div>
      )}

      <button
        onClick={handleFetch}
        disabled={!selectedSource || loading}
        className={`fetch-button ${loading ? 'loading' : ''}`}
      >
        {loading ? '⏳ Loading...' : '📥 Fetch Data'}
      </button>
    </div>
  )
}
