/**
 * Painel de Correspondência de Modelos
 * Encontra modelos jurídicos similares
 */

import { useState } from 'react'
import { useTemplateMatching } from '../../hooks/useTemplateMatching'
import './TemplateMatchingPanel.css'

export function TemplateMatchingPanel() {
  const templates = useTemplateMatching()
  const [conteudo, setConteudo] = useState('')
  const [area, setArea] = useState('civil')
  const [tribunal, setTribunal] = useState('')

  const handleBuscar = async () => {
    await templates.buscar(conteudo, area, tribunal)
  }

  return (
    <div className="template-matching-panel">
      <div className="template-header">
        <h2>📚 Correspondência de Modelos</h2>
        <p>Encontre modelos jurídicos bem-sucedidos similares à sua petição</p>
      </div>

      {/* Input */}
      <div className="template-inputs">
        <textarea
          className="template-textarea"
          value={conteudo}
          onChange={(e) => setConteudo(e.target.value)}
          placeholder="Cole sua petição aqui para encontrar modelos correspondentes..."
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px' }}>
          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
          >
            <option value="civil">Direito Civil</option>
            <option value="trabalhista">Direito Trabalhista</option>
            <option value="penal">Direito Penal</option>
            <option value="tributario">Direito Tributário</option>
          </select>

          <input
            type="text"
            value={tribunal}
            onChange={(e) => setTribunal(e.target.value)}
            placeholder="Tribunal (opcional)"
            style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
          />
        </div>

        <button
          onClick={handleBuscar}
          disabled={!conteudo.trim() || templates.carregando}
          style={{
            width: '100%',
            padding: '12px',
            background: '#1b3a57',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontWeight: '600',
            cursor: 'pointer',
          }}
        >
          {templates.carregando ? '⏳ Buscando...' : '🔍 Buscar Modelos'}
        </button>
      </div>

      {/* Erro */}
      {templates.erro && (
        <div style={{ padding: '15px', background: '#ffebee', borderRadius: '6px', color: '#c62828', marginBottom: '20px' }}>
          <strong>❌ Erro:</strong> {templates.erro}
        </div>
      )}

      {/* Resultados */}
      {templates.resultados.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <h3 style={{ color: '#1b3a57', marginBottom: '15px' }}>
            📊 {templates.resultados.length} Modelo(s) Encontrado(s)
          </h3>

          {templates.resultados.map((resultado) => (
            <div
              key={resultado.modeloId}
              style={{
                background: 'white',
                padding: '20px',
                borderRadius: '8px',
                borderLeft: '4px solid #d4af37',
                marginBottom: '15px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '10px' }}>
                <h4 style={{ margin: '0 0 5px 0', color: '#1b3a57', fontSize: '15px' }}>
                  {resultado.titulo}
                </h4>
                <span
                  style={{
                    background: resultado.pontuacao >= 70 ? '#4caf50' : resultado.pontuacao >= 50 ? '#ff9800' : '#f44336',
                    color: 'white',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    fontWeight: '600',
                    fontSize: '14px',
                  }}
                >
                  {resultado.pontuacao}%
                </span>
              </div>

              <p style={{ margin: '0 0 12px 0', color: '#666', fontSize: '13px' }}>
                Semelhança: {resultado.similares} casos similares encontrados
              </p>

              <div style={{ background: '#f5f7fa', padding: '12px', borderRadius: '4px', marginBottom: '12px' }}>
                <strong style={{ color: '#1b3a57', fontSize: '12px' }}>Argumentos Aplicáveis:</strong>
                <ul style={{ margin: '8px 0 0 20px', paddingLeft: 0, color: '#666', fontSize: '12px' }}>
                  {resultado.argumentosAplicaveis.map((arg, idx) => (
                    <li key={idx}>{arg}</li>
                  ))}
                </ul>
              </div>

              <div>
                <strong style={{ color: '#1b3a57', fontSize: '12px' }}>Recomendações:</strong>
                <ul style={{ margin: '8px 0 0 20px', paddingLeft: 0, color: '#666', fontSize: '12px' }}>
                  {resultado.recomendacoes.map((rec, idx) => (
                    <li key={idx}>{rec}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Estatísticas */}
      {templates.estatisticas && (
        <div
          style={{
            background: '#f5f7fa',
            padding: '20px',
            borderRadius: '8px',
            marginTop: '20px',
            borderLeft: '4px solid #2196f3',
          }}
        >
          <h4 style={{ margin: '0 0 15px 0', color: '#1b3a57' }}>
            📈 Estatísticas da Biblioteca
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#999', fontWeight: '600' }}>Total de Modelos</div>
              <div style={{ fontSize: '20px', color: '#1b3a57', fontWeight: '700' }}>
                {templates.estatisticas.totalModelos}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#999', fontWeight: '600' }}>Taxa de Sucesso Média</div>
              <div style={{ fontSize: '20px', color: '#4caf50', fontWeight: '700' }}>
                {templates.estatisticas.taxaSucessoMedia}%
              </div>
            </div>
          </div>
        </div>
      )}

      {!templates.resultados.length && !templates.carregando && conteudo && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
          Clique em "Buscar Modelos" para encontrar correspondências
        </div>
      )}
    </div>
  )
}
