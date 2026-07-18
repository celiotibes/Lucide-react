'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { registrarContestacao } from '@/app/actions/vistorias/gerenciarContestacao';

export default function NovaContestacao({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [searchParams, setSearchParams] = useState(new URLSearchParams());
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [vistoriaId, setVistoriaId] = useState('');
  const [itemId, setItemId] = useState('');

  const [formData, setFormData] = useState({
    motivo: '',
    descricaoDesacordo: '',
    fotoEvidencia: '',
    contatoInquilino: '',
  });

  // Carregar params
  const loadParams = async () => {
    const p = await params;
    setVistoriaId(p.id);

    // Simular carregar itemId de query params
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setItemId(params.get('item') || '');
      setFormData((prev) => ({ ...prev }));
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCarregando(true);
    setErro('');

    try {
      const resultado = await registrarContestacao({
        vistoriaSaidaId: vistoriaId,
        itemVistoriaId: itemId,
        motivo: formData.motivo,
        descricaoDesacordo: formData.descricaoDesacordo,
        fotoEvidencia: formData.fotoEvidencia,
        contatoInquilino: formData.contatoInquilino,
      });

      if (resultado.success) {
        router.push(`/vistorias/${vistoriaId}/contestacao`);
      } else {
        setErro(resultado.erro || 'Erro ao registrar contestação');
      }
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
              <h1 style={{ margin: '0 0 8px 0', fontSize: '24px' }}>Nova Contestação</h1>
              <p style={{ margin: '0', color: '#666', fontSize: '14px' }}>
                Descreva seu desacordo com os itens cobráveis da vistoria
              </p>
            </div>
            <Link
              href={`/vistorias/${vistoriaId}/contestacao`}
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

          <form onSubmit={handleSubmit}>
            {/* Motivo */}
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
                Motivo da contestação *
              </label>
              <input
                type="text"
                name="motivo"
                value={formData.motivo}
                onChange={handleInputChange}
                placeholder="Ex: Dano não causado por mim, desgaste natural"
                required
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

            {/* Descrição */}
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
                Descrição detalhada do desacordo *
              </label>
              <textarea
                name="descricaoDesacordo"
                value={formData.descricaoDesacordo}
                onChange={handleInputChange}
                placeholder="Descreva em detalhes por que discorda do laudo..."
                required
                rows={6}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            {/* Contato */}
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
                Seu e-mail de contato *
              </label>
              <input
                type="email"
                name="contatoInquilino"
                value={formData.contatoInquilino}
                onChange={handleInputChange}
                placeholder="seu@email.com"
                required
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

            {/* URL de Foto (opcional) */}
            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontWeight: '600',
                  fontSize: '14px',
                  color: '#333',
                }}
              >
                URL de foto como evidência (opcional)
              </label>
              <input
                type="url"
                name="fotoEvidencia"
                value={formData.fotoEvidencia}
                onChange={handleInputChange}
                placeholder="https://..."
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

            {/* Aviso Legal */}
            <div
              style={{
                padding: '12px',
                backgroundColor: '#f3e5f5',
                borderLeft: '4px solid #9c27b0',
                marginBottom: '20px',
                borderRadius: '4px',
                fontSize: '12px',
                color: '#4a148c',
                lineHeight: '1.5',
              }}
            >
              <strong>Aviso Legal:</strong> Declarações falsas podem constituir crime. Você tem{' '}
              <strong>5 dias úteis</strong> a partir de hoje para contestar. Após este prazo, presume-se
              verdadeiro o laudo da vistoria conforme Lei 8.245/91.
            </div>

            {/* Botões */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                onClick={() => router.back()}
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
                disabled={carregando}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: carregando ? '#ccc' : '#ff9800',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: carregando ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                }}
              >
                {carregando ? 'Registrando...' : 'Registrar Contestação'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
