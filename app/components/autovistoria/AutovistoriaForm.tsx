'use client';

import { useState, useEffect, useRef } from 'react';
import { formatarMoeda } from '@/lib/formatacao';

interface Ambiente {
  id: string;
  nome: string;
  ordem: number;
}

interface Item {
  id: string;
  nome: string;
  ambiente_id: string;
  obrigatorio: boolean;
}

interface AmbienteComItens extends Ambiente {
  itens: Item[];
}

interface ProgressoVistoria {
  [ambienteId: string]: {
    [itemId: string]: {
      estado?: string;
      foto?: File;
      fotoUrl?: string;
    };
  };
}

interface Props {
  vistoriaId: string;
  token: string;
}

export default function AutovistoriaForm({ vistoriaId, token }: Props) {
  const [ambientes, setAmbientes] = useState<AmbienteComItens[]>([]);
  const [progresso, setProgresso] = useState<ProgressoVistoria>({});
  const [ambienteAtual, setAmbienteAtual] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    carregarAmbientes();
  }, [vistoriaId]);

  const carregarAmbientes = async () => {
    try {
      // Simular carregamento de ambientes do backend
      // Em produção, fazer fetch do servidor
      const response = await fetch(`/api/vistorias/${vistoriaId}/ambientes?token=${token}`);
      if (response.ok) {
        const dados = await response.json();
        setAmbientes(dados.data || []);
      }
    } catch (erro) {
      console.error('Erro ao carregar ambientes:', erro);
    } finally {
      setCarregando(false);
    }
  };

  const handleFotoCapturada = (ambienteId: string, itemId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setProgresso((prev) => ({
        ...prev,
        [ambienteId]: {
          ...(prev[ambienteId] || {}),
          [itemId]: {
            ...(prev[ambienteId]?.[itemId] || {}),
            foto: file,
            fotoUrl: e.target?.result as string,
          },
        },
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleProximoAmbiente = () => {
    if (ambienteAtual < ambientes.length - 1) {
      setAmbienteAtual(ambienteAtual + 1);
    }
  };

  const handleAnteriorAmbiente = () => {
    if (ambienteAtual > 0) {
      setAmbienteAtual(ambienteAtual - 1);
    }
  };

  const handleSalvarAutovistoria = async () => {
    setSalvando(true);
    try {
      const response = await fetch(`/api/vistorias/${vistoriaId}/autovistoria`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          progresso,
          ambientes: ambientes.map((a) => a.id),
        }),
      });

      if (response.ok) {
        // Redirecionar para página de confirmação
        window.location.href = `/autovistoria/${vistoriaId}/confirmacao?token=${token}`;
      }
    } catch (erro) {
      console.error('Erro ao salvar autovistoria:', erro);
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return <div style={{ textAlign: 'center', padding: '40px' }}>Carregando...</div>;
  }

  if (ambientes.length === 0) {
    return (
      <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '20px' }}>
        <p style={{ color: '#666' }}>Nenhum cômodo disponível para vistoria.</p>
      </div>
    );
  }

  const ambiente = ambientes[ambienteAtual];
  const progressoAmbiente = progresso[ambiente.id] || {};
  const percentualConcluido = Math.round(
    (Object.keys(progressoAmbiente).length / ambiente.itens.length) * 100
  );

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '8px', overflow: 'hidden' }}>
      {/* Indicador de progresso */}
      <div style={{ backgroundColor: '#f5f5f5', padding: '16px' }}>
        <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: '600', color: '#333' }}>
            {ambiente.nome} ({ambienteAtual + 1} de {ambientes.length})
          </span>
          <span style={{ color: '#999', fontSize: '14px' }}>{percentualConcluido}%</span>
        </div>
        <div
          style={{
            width: '100%',
            height: '8px',
            backgroundColor: '#eee',
            borderRadius: '4px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${percentualConcluido}%`,
              height: '100%',
              backgroundColor: '#4CAF50',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>

      {/* Checklist de itens */}
      <div style={{ padding: '20px' }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#333' }}>Itens a verificar</h3>

        {ambiente.itens.map((item) => {
          const itemProgresso = progressoAmbiente[item.id];
          const temFoto = itemProgresso?.fotoUrl;

          return (
            <div
              key={item.id}
              style={{
                padding: '12px',
                marginBottom: '12px',
                border: '1px solid #eee',
                borderRadius: '8px',
                backgroundColor: temFoto ? '#F1F8F4' : '#fff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontWeight: '500', color: '#333' }}>
                  {item.nome}
                  {item.obrigatorio && (
                    <span style={{ color: '#FF5252', marginLeft: '4px' }}>*</span>
                  )}
                </span>
                {temFoto && <span style={{ color: '#4CAF50', fontSize: '14px' }}>✓ Foto capturada</span>}
              </div>

              {temFoto ? (
                <div style={{ marginBottom: '8px' }}>
                  <img
                    src={itemProgresso.fotoUrl}
                    alt="Foto capturada"
                    style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '4px' }}
                  />
                </div>
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '150px',
                    backgroundColor: '#f0f0f0',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#999',
                    marginBottom: '8px',
                  }}
                >
                  Clique para capturar foto
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    flex: 1,
                    padding: '8px',
                    backgroundColor: '#0066cc',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                  onClickCapture={(e) => {
                    // Store item ID for file input handler
                    const input = fileInputRef.current;
                    if (input) {
                      input.dataset.ambienteId = ambiente.id;
                      input.dataset.itemId = item.id;
                    }
                  }}
                >
                  📷 {temFoto ? 'Trocar foto' : 'Capturar foto'}
                </button>
              </div>
            </div>
          );
        })}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (file) {
              const ambienteId = e.currentTarget.dataset.ambienteId!;
              const itemId = e.currentTarget.dataset.itemId!;
              handleFotoCapturada(ambienteId, itemId, file);
            }
          }}
        />
      </div>

      {/* Controles de navegação */}
      <div style={{ padding: '16px', backgroundColor: '#f5f5f5', display: 'flex', gap: '8px' }}>
        <button
          onClick={handleAnteriorAmbiente}
          disabled={ambienteAtual === 0}
          style={{
            flex: 1,
            padding: '10px',
            backgroundColor: ambienteAtual === 0 ? '#ccc' : '#999',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: ambienteAtual === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          ← Anterior
        </button>

        {ambienteAtual === ambientes.length - 1 ? (
          <button
            onClick={handleSalvarAutovistoria}
            disabled={salvando}
            style={{
              flex: 1,
              padding: '10px',
              backgroundColor: salvando ? '#ccc' : '#4CAF50',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: salvando ? 'not-allowed' : 'pointer',
              fontWeight: '600',
            }}
          >
            {salvando ? 'Salvando...' : 'Finalizar vistoria'}
          </button>
        ) : (
          <button
            onClick={handleProximoAmbiente}
            style={{
              flex: 1,
              padding: '10px',
              backgroundColor: '#0066cc',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Próximo →
          </button>
        )}
      </div>
    </div>
  );
}
