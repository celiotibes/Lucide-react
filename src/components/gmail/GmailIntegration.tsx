import { useState, useEffect } from 'react'
import { useGmail } from '../../hooks/useGmail'
import './GmailIntegration.css'

export function GmailIntegration() {
  const {
    configuracao,
    estado,
    referencias,
    estaAutenticado,
    erro,
    sucesso,
    salvarConfiguracao,
    buscarMensagens,
    sincronizar,
    limparReferencias,
    desconectar,
  } = useGmail()

  const [abaAtiva, setAbaAtiva] = useState<'config' | 'referencias' | 'status'>('config')
  const [frequencia, setFrequencia] = useState(configuracao.frequenciaMinutos)
  const [filtros, setFiltros] = useState(configuracao.filtroLabels.join(', '))
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (sucesso) {
      const timer = setTimeout(() => {}, 4000)
      return () => clearTimeout(timer)
    }
  }, [sucesso])

  useEffect(() => {
    if (erro) {
      const timer = setTimeout(() => {}, 5000)
      return () => clearTimeout(timer)
    }
  }, [erro])

  const handleSalvarConfiguracao = () => {
    salvarConfiguracao({
      frequenciaMinutos: frequencia,
      filtroLabels: filtros.split(',').map(f => f.trim()),
    })
  }

  const handleBuscar = async () => {
    await buscarMensagens(searchQuery)
  }

  const handleSincronizar = async () => {
    await sincronizar()
  }

  return (
    <div className="gmail-integration">
      <div className="gmail-header">
        <h2>📧 Gmail Integration</h2>
        <p className="gmail-subtitle">Integre suas mensagens de email e extraia referências jurídicas</p>
      </div>

      {estaAutenticado ? (
        <>
          <div className="gmail-status-bar">
            <div className="status-indicator">
              <span className="status-dot autenticado"></span>
              <span>Autenticado</span>
            </div>
            <button className="gmail-btn-desconectar" onClick={desconectar}>
              Desconectar
            </button>
          </div>

          <div className="gmail-tabs">
            <button
              className={`gmail-tab ${abaAtiva === 'config' ? 'ativo' : ''}`}
              onClick={() => setAbaAtiva('config')}
            >
              ⚙️ Configuração
            </button>
            <button
              className={`gmail-tab ${abaAtiva === 'referencias' ? 'ativo' : ''}`}
              onClick={() => setAbaAtiva('referencias')}
            >
              📚 Referências
            </button>
            <button
              className={`gmail-tab ${abaAtiva === 'status' ? 'ativo' : ''}`}
              onClick={() => setAbaAtiva('status')}
            >
              📊 Status
            </button>
          </div>

          {abaAtiva === 'config' && (
            <div className="gmail-tab-content">
              <div className="gmail-form-group">
                <label htmlFor="ativaSync">
                  <input
                    id="ativaSync"
                    type="checkbox"
                    checked={configuracao.ativaSincronizacao}
                    onChange={(e) =>
                      salvarConfiguracao({ ativaSincronizacao: e.target.checked })
                    }
                  />
                  Ativar sincronização automática
                </label>
              </div>

              <div className="gmail-form-group">
                <label htmlFor="frequencia">Frequência de sincronização (minutos)</label>
                <input
                  id="frequencia"
                  type="number"
                  min="5"
                  max="1440"
                  value={frequencia}
                  onChange={(e) => setFrequencia(Number(e.target.value))}
                />
              </div>

              <div className="gmail-form-group">
                <label htmlFor="filtros">Rótulos do Gmail (separados por vírgula)</label>
                <input
                  id="filtros"
                  type="text"
                  value={filtros}
                  onChange={(e) => setFiltros(e.target.value)}
                  placeholder="INBOX, JURISPRUDENCIA, LEGISLACAO"
                />
              </div>

              <div className="gmail-checkboxes">
                <label>
                  <input
                    type="checkbox"
                    checked={configuracao.sincronizarAoAbrir}
                    onChange={(e) =>
                      salvarConfiguracao({ sincronizarAoAbrir: e.target.checked })
                    }
                  />
                  Sincronizar ao abrir a aplicação
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={configuracao.baixarAnexos}
                    onChange={(e) =>
                      salvarConfiguracao({ baixarAnexos: e.target.checked })
                    }
                  />
                  Baixar anexos automaticamente
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={configuracao.marcarComoLida}
                    onChange={(e) =>
                      salvarConfiguracao({ marcarComoLida: e.target.checked })
                    }
                  />
                  Marcar como lida após sincronizar
                </label>
              </div>

              <div className="gmail-button-group">
                <button className="gmail-btn-primario" onClick={handleSalvarConfiguracao}>
                  💾 Salvar Configuração
                </button>
                <button className="gmail-btn-secundario" onClick={handleSincronizar}>
                  🔄 Sincronizar Agora
                </button>
              </div>
            </div>
          )}

          {abaAtiva === 'referencias' && (
            <div className="gmail-tab-content">
              <div className="gmail-search-box">
                <input
                  type="text"
                  placeholder="Buscar em mensagens..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="gmail-search-input"
                />
                <button className="gmail-btn-buscar" onClick={handleBuscar}>
                  🔍 Buscar
                </button>
              </div>

              {referencias.length > 0 ? (
                <div className="gmail-referencias-list">
                  <div className="referencias-header">
                    <span className="ref-count">
                      {referencias.length} referência{referencias.length !== 1 ? 's' : ''} extraída{referencias.length !== 1 ? 's' : ''}
                    </span>
                    <button className="gmail-btn-limpar" onClick={limparReferencias}>
                      🗑️ Limpar Todas
                    </button>
                  </div>
                  <div className="referencias-grid">
                    {referencias.map((ref, idx) => (
                      <div key={idx} className="reference-card">
                        <div className="ref-tipo">
                          {ref.tipo === 'jurisprudencia' && '⚖️ Jurisprudência'}
                          {ref.tipo === 'legislacao' && '📋 Legislação'}
                          {ref.tipo === 'doutrina' && '📚 Doutrina'}
                          {ref.tipo === 'caso' && '📑 Caso'}
                          {ref.tipo === 'artigo' && '📰 Artigo'}
                        </div>
                        <h3 className="ref-titulo">{ref.titulo}</h3>
                        <p className="ref-fonte">{ref.fonte}</p>
                        {ref.resumo && <p className="ref-resumo">{ref.resumo}</p>}
                        {ref.dataPublicacao && (
                          <span className="ref-data">
                            {new Date(ref.dataPublicacao).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="gmail-empty-state">
                  <p>📭 Nenhuma referência extraída ainda.</p>
                  <p>Sincronize suas mensagens para extrair referências jurídicas.</p>
                </div>
              )}
            </div>
          )}

          {abaAtiva === 'status' && (
            <div className="gmail-tab-content">
              <div className="gmail-status-grid">
                <div className="gmail-status-card">
                  <span className="status-label">Status Atual</span>
                  <span className="status-value">
                    {estado.status === 'idle' && '✅ Ocioso'}
                    {estado.status === 'sincronizando' && '⏳ Sincronizando'}
                    {estado.status === 'error' && '❌ Erro'}
                  </span>
                </div>
                <div className="gmail-status-card">
                  <span className="status-label">Progresso</span>
                  <span className="status-value">{estado.progresso}%</span>
                </div>
                <div className="gmail-status-card">
                  <span className="status-label">Mensagens Processadas</span>
                  <span className="status-value">
                    {estado.mensagensProcessadas} / {estado.totalMensagens}
                  </span>
                </div>
                <div className="gmail-status-card">
                  <span className="status-label">Última Sincronização</span>
                  <span className="status-value">
                    {estado.ultimaSincronizacao
                      ? new Date(estado.ultimaSincronizacao).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Nunca'}
                  </span>
                </div>
                <div className="gmail-status-card">
                  <span className="status-label">Próxima Sincronização</span>
                  <span className="status-value">
                    {estado.proximaSincronizacao
                      ? new Date(estado.proximaSincronizacao).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Em breve'}
                  </span>
                </div>
                <div className="gmail-status-card">
                  <span className="status-label">Referências Extraídas</span>
                  <span className="status-value">{referencias.length}</span>
                </div>
              </div>

              {estado.progresso > 0 && estado.progresso < 100 && (
                <div className="gmail-progress-bar">
                  <div className="gmail-progress-fill" style={{ width: `${estado.progresso}%` }}></div>
                </div>
              )}
            </div>
          )}

          {erro && <div className="gmail-mensagem erro">❌ {erro}</div>}
          {sucesso && <div className="gmail-mensagem sucesso">✅ {sucesso}</div>}
        </>
      ) : (
        <div className="gmail-not-authenticated">
          <p>🔐 Você não está autenticado no Gmail.</p>
          <p>Faça login para sincronizar suas mensagens.</p>
          <button className="gmail-btn-primario">🔑 Autenticar com Gmail</button>
        </div>
      )}
    </div>
  )
}
