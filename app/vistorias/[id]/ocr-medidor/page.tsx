'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface ResultadoOCR {
  leitura: number;
  confianca: number;
  tipoMedidor: string;
  textoExtraido: string;
}

export default function PaginaOCRMedidor({ params }: { params: Promise<{ id: string }> }) {
  const [vistoriaId, setVistoriaId] = useState('');
  const [tipoMedidor, setTipoMedidor] = useState<'hidrômetro' | 'eletricidade' | 'gás'>('hidrômetro');
  const [leituraAnterior, setLeituraAnterior] = useState('');
  const [imagemSelecionada, setImagemSelecionada] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoOCR | null>(null);
  const [erro, setErro] = useState('');
  const [enviado, setEnviado] = useState(false);

  // Carregar params
  const loadParams = async () => {
    const p = await params;
    setVistoriaId(p.id);
  };

  if (!vistoriaId) {
    loadParams();
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImagemSelecionada(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setPreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
      setErro('');
      setResultado(null);
    }
  };

  const handleProcessarOCR = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imagemSelecionada) {
      setErro('Selecione uma imagem');
      return;
    }

    setCarregando(true);
    setErro('');

    try {
      const formData = new FormData();
      formData.append('imagem', imagemSelecionada);
      formData.append('tipoMedidor', tipoMedidor);
      if (leituraAnterior) {
        formData.append('leituraAnterior', leituraAnterior);
      }

      const response = await fetch('/api/vistorias/processar-ocr', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setErro(data.erro || 'Erro ao processar imagem');
        return;
      }

      setResultado(data);
      setEnviado(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setCarregando(false);
    }
  };

  const handleConfirmarLeitura = async () => {
    if (!resultado) return;

    setCarregando(true);
    try {
      const response = await fetch('/api/vistorias/criar-item-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vistoriaId,
          leitura: resultado.leitura,
          tipoMedidor: resultado.tipoMedidor,
          confiancaOCR: resultado.confianca,
          observacao: `Leitura via OCR: ${resultado.tipoMedidor}`,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        setErro(error.erro || 'Erro ao registrar leitura');
        return;
      }

      setEnviado(true);
      setImagemSelecionada(null);
      setPreview('');
      setResultado(null);
      setLeituraAnterior(resultado.leitura.toString());

      // Sucesso
      setTimeout(() => {
        window.location.href = `/vistorias/${vistoriaId}`;
      }, 2000);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px' }}>
        {/* Cabeçalho */}
        <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: '0 0 8px 0', fontSize: '24px' }}>📸 OCR de Medidor</h1>
              <p style={{ margin: '0', color: '#666', fontSize: '14px' }}>
                Fotografe o medidor e o sistema extrai a leitura automaticamente
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

        {/* Formulário */}
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

          {enviado && (
            <div
              style={{
                padding: '12px',
                backgroundColor: '#e8f5e9',
                borderLeft: '4px solid #4caf50',
                color: '#2e7d32',
                marginBottom: '16px',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            >
              ✓ Leitura registrada com sucesso! Redirecionando...
            </div>
          )}

          <form onSubmit={handleProcessarOCR}>
            {/* Tipo de Medidor */}
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
                Tipo de Medidor *
              </label>
              <select
                value={tipoMedidor}
                onChange={(e) => setTipoMedidor(e.target.value as any)}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              >
                <option value="hidrômetro">Hidrômetro (Água)</option>
                <option value="eletricidade">Eletricidade (kWh)</option>
                <option value="gás">Gás (m³)</option>
              </select>
            </div>

            {/* Leitura Anterior (opcional) */}
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
                Leitura Anterior (opcional - para validação)
              </label>
              <input
                type="number"
                value={leituraAnterior}
                onChange={(e) => setLeituraAnterior(e.target.value)}
                placeholder="Ex: 1234"
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Upload de Imagem */}
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
                Imagem do Medidor *
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                disabled={carregando}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  cursor: carregando ? 'not-allowed' : 'pointer',
                  opacity: carregando ? 0.6 : 1,
                }}
              />
              <p style={{ margin: '8px 0 0 0', color: '#999', fontSize: '12px' }}>
                Tire uma foto clara do mostrador do medidor em boa iluminação
              </p>
            </div>

            {/* Preview */}
            {preview && (
              <div style={{ marginBottom: '16px' }}>
                <p style={{ margin: '0 0 8px 0', fontWeight: '600', fontSize: '14px' }}>Preview:</p>
                <img
                  src={preview}
                  alt="Preview"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '300px',
                    borderRadius: '4px',
                    border: '1px solid #ddd',
                  }}
                />
              </div>
            )}

            {/* Resultado OCR */}
            {resultado && (
              <div
                style={{
                  padding: '16px',
                  backgroundColor: '#f3e5f5',
                  borderRadius: '4px',
                  marginBottom: '16px',
                  borderLeft: '4px solid #9c27b0',
                }}
              >
                <p style={{ margin: '0 0 12px 0', fontWeight: '600', fontSize: '14px' }}>
                  📊 Resultado da OCR:
                </p>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '12px',
                    fontSize: '13px',
                  }}
                >
                  <div>
                    <strong>Leitura:</strong> {resultado.leitura}
                  </div>
                  <div>
                    <strong>Confiança:</strong> {(resultado.confianca * 100).toFixed(1)}%
                  </div>
                  <div>
                    <strong>Tipo:</strong> {resultado.tipoMedidor}
                  </div>
                  <div>
                    <strong>Texto:</strong> {resultado.textoExtraido}
                  </div>
                </div>

                {resultado.confianca < 0.7 && (
                  <div
                    style={{
                      marginTop: '12px',
                      padding: '8px',
                      backgroundColor: '#fff3e0',
                      borderLeft: '3px solid #ff9800',
                      fontSize: '12px',
                      color: '#e65100',
                    }}
                  >
                    ⚠️ Confiança baixa. Verifique se a imagem está clara e o medidor está legível.
                  </div>
                )}
              </div>
            )}

            {/* Botões */}
            <div style={{ display: 'flex', gap: '12px' }}>
              {!resultado ? (
                <>
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
                    disabled={!imagemSelecionada || carregando}
                    style={{
                      flex: 1,
                      padding: '10px',
                      backgroundColor: carregando || !imagemSelecionada ? '#ccc' : '#2196f3',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: carregando || !imagemSelecionada ? 'not-allowed' : 'pointer',
                      fontWeight: '600',
                    }}
                  >
                    {carregando ? 'Processando...' : 'Processar OCR'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setResultado(null);
                      setImagemSelecionada(null);
                      setPreview('');
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
                    Tentar Novamente
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmarLeitura}
                    disabled={carregando}
                    style={{
                      flex: 1,
                      padding: '10px',
                      backgroundColor: carregando ? '#ccc' : '#4caf50',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: carregando ? 'not-allowed' : 'pointer',
                      fontWeight: '600',
                    }}
                  >
                    {carregando ? 'Salvando...' : '✓ Confirmar Leitura'}
                  </button>
                </>
              )}
            </div>
          </form>

          {/* Dica */}
          <div
            style={{
              marginTop: '20px',
              padding: '12px',
              backgroundColor: '#e3f2fd',
              borderLeft: '4px solid #2196f3',
              fontSize: '12px',
              color: '#1565c0',
              borderRadius: '4px',
            }}
          >
            <strong>💡 Dica:</strong> Para melhor resultado:
            <ul style={{ margin: '8px 0 0 20px', paddingLeft: 0 }}>
              <li>Posicione o medidor no centro da foto</li>
              <li>Garanta boa iluminação (evite sombras)</li>
              <li>Photograph apenas o mostrador (não inclua toda a caixa)</li>
              <li>Ângulo perpendicular ao medidor (evite inclinações)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
