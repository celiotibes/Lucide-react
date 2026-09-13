'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

interface Boleto {
  id: string;
  data_vencimento: string;
  valor: number;
  numero_boleto: string;
  status: string;
}

export default function PaginaSegundaVia() {
  const params = useParams();
  const contratoId = params.id as string;
  const [boletos, setBoletos] = useState<Boleto[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    buscarBoletos();
  }, [contratoId]);

  async function buscarBoletos() {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
      );

      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(`/api/portal/contratos/${contratoId}/boletos`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`
        }
      });

      if (res.ok) {
        const data = await res.json();
        setBoletos(data);
      } else if (res.status === 401 || res.status === 403) {
        setErro('Você não tem permissão para acessar este contrato');
      } else {
        setErro('Erro ao carregar boletos');
      }
    } catch (e) {
      setErro('Erro ao conectar ao servidor');
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadBoleto(boletoId: string) {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
      );

      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(`/api/portal/boletos/${boletoId}/download`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`
        }
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `boleto-${boletoId}.pdf`;
        a.click();
      } else {
        alert('Erro ao fazer download do boleto');
      }
    } catch (e) {
      alert('Erro ao conectar ao servidor');
    }
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h2 style={{ margin: 0 }}>2ª Via de Boletos</h2>
        <Link href={`/portal/contratos/${contratoId}`} style={{ color: '#0066cc', textDecoration: 'none' }}>
          ← Voltar
        </Link>
      </div>

      {loading && <p>Carregando boletos...</p>}

      {erro && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '12px', borderRadius: '4px', marginBottom: '20px' }}>
          {erro}
        </div>
      )}

      {!loading && boletos.length === 0 && (
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '40px', textAlign: 'center' }}>
          <p style={{ color: '#666' }}>Nenhum boleto disponível.</p>
        </div>
      )}

      {!loading && boletos.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
          <thead>
            <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151', fontSize: '13px' }}>
                Data de Vencimento
              </th>
              <th style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: '#374151', fontSize: '13px' }}>
                Valor
              </th>
              <th style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: '#374151', fontSize: '13px' }}>
                Status
              </th>
              <th style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: '#374151', fontSize: '13px' }}>
                Ação
              </th>
            </tr>
          </thead>
          <tbody>
            {boletos.map((b) => (
              <tr key={b.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '12px', color: '#1f2937', fontSize: '14px' }}>
                  {new Date(b.data_vencimento).toLocaleDateString('pt-BR')}
                </td>
                <td style={{ padding: '12px', textAlign: 'right', color: '#1f2937', fontSize: '14px', fontWeight: '600' }}>
                  R$ {b.valor.toFixed(2).replace('.', ',')}
                </td>
                <td style={{ padding: '12px', textAlign: 'center', fontSize: '13px' }}>
                  {b.status === 'pago' ? '✓ Pago' : '○ Pendente'}
                </td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <button
                    onClick={() => handleDownloadBoleto(b.id)}
                    style={{
                      background: '#0066cc',
                      color: 'white',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '600'
                    }}
                  >
                    📥 Baixar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
