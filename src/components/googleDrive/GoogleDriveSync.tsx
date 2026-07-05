import { useState, useEffect } from 'react'
import { useGoogleDrive } from '../../hooks/useGoogleDrive'
import './GoogleDriveSync.css'

export function GoogleDriveSync() {
  const {
    configuracao,
    estado,
    estaAutenticado,
    erro,
    sucesso,
    salvarConfiguracao,
    sincronizar,
    fazerBackup,
    desconectar,
  } = useGoogleDrive()

  const [abaAtiva, setAbaAtiva] = useState<'sync' | 'backup' | 'status'>('sync')
  const [frequencia, setFrequencia] = useState(configuracao.frequenciaMinutos)
  const [pastaDocumentos, setPastaDocumentos] = useState(configuracao.pastaDocumentos)

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
      pastaDocumentos: pastaDocumentos,
    })
  }

  const handleSincronizar = async () => {
    await sincronizar()
  }

  const handleBackup = async () => {
    await fazerBackup()
  }

  return (
    <div className="google-drive-sync">
      <div className="gdrive-header">
        <h2>🔗 Google Drive Sync</h2>
        <p className="gdrive-subtitle">Sincronize e faça backup dos seus documentos na nuvem</p>
      </div>

      {estaAutenticado ? (
        <>
          <div className="gdrive-status-bar">
            <div className="status-indicator">
              <span className="status-dot autenticado"></span>
              <span>Autenticado</span>
            </div>
            <button className="gdrive-btn-desconectar" onClick={desconectar}>
              Desconectar
            </button>
          </div>

          <div className="gdrive-tabs">
            <button
              className={`gdrive-tab ${abaAtiva === 'sync' ? 'ativo' : ''}`}
              onClick={() => setAbaAtiva('sync')}
            >
              ⚙️ Configuração
            </button>
            <button
              className={`gdrive-tab ${abaAtiva === 'backup' ? 'ativo' : ''}`}
              onClick={() => setAbaAtiva('backup')}
            >
              💾 Backup
            </button>
            <button
              className={`gdrive-tab ${abaAtiva === 'status' ? 'ativo' : ''}`}
              onClick={() => setAbaAtiva('status')}
            >
              📊 Status
            </button>
          </div>

          {abaAtiva === 'sync' && (
            <div className="gdrive-tab-content">
              <div className="gdrive-form-group">
                <label htmlFor="ativoSync">
                  <input
                    id="ativoSync"
                    type="checkbox"
                    checked={configuracao.ativoSync}
                    onChange={(e) =>
                      salvarConfiguracao({ ativoSync: e.target.checked })
                    }
                  />
                  Ativar sincronização automática
                </label>
              </div>

              <div className="gdrive-form-group">
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

              <div className="gdrive-form-group">
                <label htmlFor="pasta">Pasta no Google Drive</label>
                <input
                  id="pasta"
                  type="text"
                  value={pastaDocumentos}
                  onChange={(e) => setPastaDocumentos(e.target.value)}
                />
              </div>

              <div className="gdrive-checkboxes">
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
                    checked={configuracao.sincronizarAoSalvar}
                    onChange={(e) =>
                      salvarConfiguracao({ sincronizarAoSalvar: e.target.checked })
                    }
                  />
                  Sincronizar ao salvar documentos
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={configuracao.compressarAntes}
                    onChange={(e) =>
                      salvarConfiguracao({ compressarAntes: e.target.checked })
                    }
                  />
                  Comprimir antes de enviar
                </label>
              </div>

              <div className="gdrive-button-group">
                <button className="gdrive-btn-primario" onClick={handleSalvarConfiguracao}>
                  💾 Salvar Configuração
                </button>
                <button className="gdrive-btn-secundario" onClick={handleSincronizar}>
                  🔄 Sincronizar Agora
                </button>
              </div>
            </div>
          )}

          {abaAtiva === 'backup' && (
            <div className="gdrive-tab-content">
              <div className="gdrive-backup-info">
                <p>📋 Crie backups completos dos seus documentos, anotações e templates.</p>
              </div>
              <div className="gdrive-button-group">
                <button className="gdrive-btn-primario" onClick={handleBackup}>
                  💾 Criar Backup Agora
                </button>
              </div>
            </div>
          )}

          {abaAtiva === 'status' && (
            <div className="gdrive-tab-content">
              <div className="gdrive-status-grid">
                <div className="gdrive-status-card">
                  <span className="status-label">Status Atual</span>
                  <span className="status-value">
                    {estado.status === 'idle' && '✅ Ocioso'}
                    {estado.status === 'sincronizando' && '⏳ Sincronizando'}
                    {estado.status === 'error' && '❌ Erro'}
                  </span>
                </div>
                <div className="gdrive-status-card">
                  <span className="status-label">Progresso</span>
                  <span className="status-value">{estado.progresso}%</span>
                </div>
                <div className="gdrive-status-card">
                  <span className="status-label">Arquivos Processados</span>
                  <span className="status-value">
                    {estado.arquivosProcessados} / {estado.totalArquivos}
                  </span>
                </div>
                <div className="gdrive-status-card">
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
                <div className="gdrive-status-card">
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
              </div>

              {estado.progresso > 0 && estado.progresso < 100 && (
                <div className="gdrive-progress-bar">
                  <div className="gdrive-progress-fill" style={{ width: `${estado.progresso}%` }}></div>
                </div>
              )}
            </div>
          )}

          {erro && <div className="gdrive-mensagem erro">❌ {erro}</div>}
          {sucesso && <div className="gdrive-mensagem sucesso">✅ {sucesso}</div>}
        </>
      ) : (
        <div className="gdrive-not-authenticated">
          <p>🔐 Você não está autenticado no Google Drive.</p>
          <p>Faça login para sincronizar seus documentos.</p>
          <button className="gdrive-btn-primario">🔑 Autenticar com Google Drive</button>
        </div>
      )}
    </div>
  )
}
