'use client';

import { useState } from 'react';
import Link from 'next/link';

interface DanoExtraido {
  remetente: string;
  dataRelato: string;
  danoDescrito: string;
  tiposDano: string[];
  responsabilidade: string;
  confianca: number;
  severidade: string;
}

interface ResultadoImportacao {
  totalMensagens: number;
  danosEncontrados: number;
  danosConfiáveis: number;
  danos: DanoExtraido[];
  resumo: {
    agrupamentoPorResponsabilidade: Record<string, number>;
    agrupamentoPorTipo: Record<string, number>;
  };
}

export default function PaginaImportarWhatsApp({ params }: { params: Promise<{ id: string }> }) {
  const [vistoriaId, setVistoriaId] = useState('');
  const [formato, setFormato] = useState<'texto' | 'json'>('texto');
  const [conteudo, setConteudo] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const [erro, setErro] = useState('');
  const [selectedDanos, setSelectedDanos] = useState<Set<number>>(new Set());
  const [importando, setImportando] = useState(false);

  const loadParams = async () => {
    const p = await params;
    setVistoriaId(p.id);
  };

  if (!vistoriaId) {
    loadParams();
  }

  const handleProcessarWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!conteudo.trim()) {
      setErro('Cole o conteúdo do chat WhatsApp');
      return;
    }

    setCarregando(true);
    setErro('');

    try {
      const response = await fetch('/api/vistorias/importar-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conteudo,
          formato,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErro(data.erro || 'Erro ao processar WhatsApp');
        return;
      }

      setResultado(data);
      // Selecionar apenas danos confiáveis por padrão
      const danosConfiáveis = new Set<number>();
      data.danos.forEach((d: DanoExtraido, idx: number) => {
        if (d.confianca >= 0.7) {
          danosConfiáveis.add(idx);
        }
      });
      setSelectedDanos(danosConfiáveis);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setCarregando(false);
    }
  };

  const handleImportarDanos = async () => {
    if (!resultado) return;

    const danosParaImportar = resultado.danos.filter((_, idx) => selectedDanos.has(idx));

    if (danosParaImportar.length === 0) {
      setErro('Selecione pelo menos um dano para importar');
      return;
    }

    setImportando(true);
    setErro('');

    try {
      const response = await fetch('/api/vistorias/importar-danos-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vistoriaId,
          danos: danosParaImportar,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        setErro(error.erro || 'Erro ao importar danos');
        return;
      }

      // Sucesso
      setTimeout(() => {
        window.location.href = `/vistorias/${vistoriaId}`;
      }, 2000);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setImportando(false);
    }
  };

  const toggleDano = (idx: number) => {
    const newSelected = new Set(selectedDanos);
    if (newSelected.has(idx)) {
      newSelected.delete(idx);
    } else {
      newSelected.add(idx);
    }
    setSelectedDanos(newSelected);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px' }}>
        {/* Cabeçalho */}
        <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: '0 0 8px 0', fontSize: '24px' }}>💬 Importar Chat WhatsApp</h1>
              <p style={{ margin: '0', color: '#666', fontSize: '14px' }}>
                Extraia danos automaticamente de conversas no WhatsApp via IA
              </p>
            </div>
            <Link
              href={`/vistorias/${vistoriaId}`}
              style={{
                padding: '8px 16px',
                backgroundColor: '#f0f0f0',
                color: '#666',
                textDecoration: 'none',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            >
              ← Voltar
            </Link>
          </div>
        </div>

        {/* Abas ou Seção */}
        {!resultado ? (
          <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
            {erro && (
              <div
                style={{
                  padding: '12px',
                  backgroundColor: '#ffebee',
                  borderLeft: '4px solid #f44336',
                  color: '#c62828',
                  marginBottom: '16px',
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
              >
                {erro}
              </div>
            )}

            <form onSubmit={handleProcessarWhatsApp}>
              {/* Seleção de Formato */}
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontWeight: '600',
                    fontSize: '14px',
                    color: '#333',
                  }}
                >
                  Formato do Arquivo *
                </label>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      value="texto"
                      checked={formato === 'texto'}
                      onChange={(e) => setFormato(e.target.value as any)}
                      style={{ marginRight: '8px' }}
                    />
                    Texto (.txt)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      value="json"
                      checked={formato === 'json'}
                      onChange={(e) => setFormato(e.target.value as any)}
                      style={{ marginRight: '8px' }}
                    />
                    JSON (.json)
                  </label>
                </div>
              </div>

              {/* Área de Texto */}
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontWeight: '600',
                    fontSize: '14px',
                    color: '#333',
                  }}
                >
                  Cole o conteúdo do chat *
                </label>
                <textarea
                  value={conteudo}
                  onChange={(e) => setConteudo(e.target.value)}
                  placeholder="Cole aqui o conteúdo exportado do WhatsApp..."
                  disabled={carregando}
                  rows={10}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '4px',
                    border: '1px solid #ddd',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    fontFamily: 'monospace',
                    opacity: carregando ? 0.6 : 1,
                    cursor: carregando ? 'not-allowed' : 'text',
                  }}
                />
              </div>

              {/* Informações */}
              <div
                style={{
                  padding: '12px',
                  backgroundColor: '#e3f2fd',
                  borderLeft: '4px solid #2196f3',
                  fontSize: '12px',
                  color: '#1565c0',
                  marginBottom: '16px',
                  borderRadius: '4px',
                }}
              >
                <strong>Como exportar do WhatsApp:</strong>
                <ul style={{ margin: '8px 0 0 20px', paddingLeft: 0 }}>
                  <li>Abra o chat</li>
                  <li>Toque em ⋮ (menu) → Mais → Exportar chat</li>
                  <li>Escolha "Sem mídia" para apenas texto</li>
                  <li>Cole o conteúdo aqui</li>
                </ul>
              </div>

              {/* Botões */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => window.history.back()}
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: '#f0f0f0',
                    color: '#666',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: '600',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!conteudo.trim() || carregando}
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: carregando || !conteudo.trim() ? '#ccc' : '#2196f3',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: carregando || !conteudo.trim() ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                  }}
                >
                  {carregando ? 'Processando...' : 'Analisar com IA'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <>
            {/* Resultado */}
            <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
              <h2 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>📊 Resultado da Análise</h2>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: '12px',
                  marginBottom: '20px',
                }}
              >
                <div
                  style={{
                    padding: '12px',
                    backgroundColor: '#f3e5f5',
                    borderRadius: '4px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '24px', fontWeight: '600', color: '#7b1fa2' }}>
                    {resultado.totalMensagens}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>Mensagens</div>
                </div>

                <div
                  style={{
                    padding: '12px',
                    backgroundColor: '#fff3e0',
                    borderRadius: '4px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '24px', fontWeight: '600', color: '#e65100' }}>
                    {resultado.danosEncontrados}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>Danos Detectados</div>
                </div>

                <div
                  style={{
                    padding: '12px',
                    backgroundColor: '#e8f5e9',
                    borderRadius: '4px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '24px', fontWeight: '600', color: '#2e7d32' }}>
                    {resultado.danosConfiáveis}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>Confiáveis (≥70%)</div>
                </div>
              </div>

              {/* Resumo por tipo e responsabilidade */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '16px',
                  marginBottom: '20px',
                }}
              >
                <div
                  style={{
                    padding: '12px',
                    backgroundColor: '#f5f5f5',
                    borderRadius: '4px',
                  }}
                >
                  <p style={{ margin: '0 0 8px 0', fontWeight: '600', fontSize: '12px' }}>
                    Por Responsabilidade:
                  </p>
                  {Object.entries(resultado.resumo.agrupamentoPorResponsabilidade).map(([resp, count]) => (
                    <p key={resp} style={{ margin: '4px 0', fontSize: '13px', color: '#666' }}>
                      {resp}: <strong>{count}</strong>
                    </p>
                  ))}
                </div>

                <div
                  style={{
                    padding: '12px',
                    backgroundColor: '#f5f5f5',
                    borderRadius: '4px',
                  }}
                >
                  <p style={{ margin: '0 0 8px 0', fontWeight: '600', fontSize: '12px' }}>
                    Por Tipo:
                  </p>
                  {Object.entries(resultado.resumo.agrupamentoPorTipo).map(([tipo, count]) => (
                    <p key={tipo} style={{ margin: '4px 0', fontSize: '13px', color: '#666' }}>
                      {tipo}: <strong>{count}</strong>
                    </p>
                  ))}
                </div>
              </div>
            </div>

            {/* Lista de Danos */}
            <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
              <h2 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>🔍 Danos Detectados</h2>

              {erro && (
                <div
                  style={{
                    padding: '12px',
                    backgroundColor: '#ffebee',
                    borderLeft: '4px solid #f44336',
                    color: '#c62828',
                    marginBottom: '16px',
                    borderRadius: '4px',
                    fontSize: '14px',
                  }}
                >
                  {erro}
                </div>
              )}

              <div style={{ display: 'grid', gap: '12px' }}>
                {resultado.danos.map((dano, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '12px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      backgroundColor: selectedDanos.has(idx) ? '#f3e5f5' : '#fafafa',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s',
                    }}
                    onClick={() => toggleDano(idx)}
                  >
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                      <input
                        type="checkbox"
                        checked={selectedDanos.has(idx)}
                        onChange={() => toggleDano(idx)}
                        style={{ marginTop: '4px' }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: '0 0 4px 0', fontWeight: '600', fontSize: '14px' }}>
                          {dano.danoDescrito}
                        </p>
                        <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#666' }}>
                          <span>{dano.remetente}</span>
                          <span>{dano.dataRelato}</span>
                        </div>
                        <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {dano.tiposDano.map((tipo) => (
                            <span
                              key={tipo}
                              style={{
                                padding: '2px 8px',
                                backgroundColor: '#e3f2fd',
                                borderRadius: '3px',
                                fontSize: '11px',
                                color: '#1565c0',
                              }}
                            >
                              {tipo}
                            </span>
                          ))}
                        </div>
                        <div style={{ marginTop: '8px', display: 'flex', gap: '16px', fontSize: '12px' }}>
                          <span>
                            Confiança: <strong>{(dano.confianca * 100).toFixed(0)}%</strong>
                          </span>
                          <span>
                            Severidade: <strong>{dano.severidade}</strong>
                          </span>
                          <span>
                            Responsabilidade: <strong>{dano.responsabilidade}</strong>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Botões de Ação */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setResultado(null);
                    setConteudo('');
                  }}
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: '#f0f0f0',
                    color: '#666',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: '600',
                  }}
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleImportarDanos}
                  disabled={selectedDanos.size === 0 || importando}
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: selectedDanos.size === 0 || importando ? '#ccc' : '#4caf50',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: selectedDanos.size === 0 || importando ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                  }}
                >
                  {importando
                    ? 'Importando...'
                    : `✓ Importar ${selectedDanos.size} Dano(s) Selecionado(s)`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
