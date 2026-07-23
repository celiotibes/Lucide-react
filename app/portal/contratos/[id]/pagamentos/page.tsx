'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

interface Pagamento {
  id: string;
  data_vencimento: string;
  valor: number;
  status: string;
  data_pagamento: string | null;
  dias_atraso: number;
}

export default function PaginaHistoricoPagamentos() {
  const params = useParams();
  const contratoId = params.id as string;
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    buscarPagamentos();
  }, [contratoId]);

  async function buscarPagamentos() {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
      );

      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(`/api/portal/contratos/${contratoId}/pagamentos`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`
        }
      });

      if (res.ok) {
        const data = await res.json();
        setPagamentos(data);
      } else if (res.status === 401 || res.status === 403) {
        setErro('Você não tem permissão para acessar este histórico');
      } else {
        setErro('Erro ao carregar histórico de pagamentos');
      }
    } catch (e) {
      setErro('Erro ao conectar ao servidor');
    } finally {
      setLoading(false);
    }
  }

  const statusBadge = (status: string) => {
    const colors: Record<string, { bg: string; text: string }> = {
      pago: { bg: '#dcfce7', text: '#166534' },
      pendente: { bg: '#fef3c7', text: '#92400e' },
      atrasado: { bg: '#fee2e2', text: '#991b1b' },
    };
    const color = colors[status] || colors.pendente;
    return (
      <span style={{ background: color.bg, color: color.text, padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '600' }}>
        {status === 'pago' ? '✓ Pago' : status === 'atrasado' ? '⚠ Atrasado' : '○ Pendente'}
      </span>
    );
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h2 style={{ margin: 0 }}>Histórico de Pagamentos</h2>
        <Link href={`/portal/contratos/${contratoId}`} style={{ color: '#0066cc', textDecoration: 'none' }}>
          ← Voltar
        </Link>
      </div>

      {loading && <p>Carregando histórico...</p>}

      {erro && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '12px', borderRadius: '4px', marginBottom: '20px' }}>
          {erro}
        </div>
      )}

      {!loading && pagamentos.length === 0 && (
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '40px', textAlign: 'center' }}>
          <p style={{ color: '#666' }}>Nenhum pagamento registrado ainda.</p>
        </div>
      )}

      {!loading && pagamentos.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
          <thead>
            <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151', fontSize: '13px' }}>Data de Vencimento</th>
              <th style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: '#374151', fontSize: '13px' }}>Valor</th>
              <th style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: '#374151', fontSize: '13px' }}>Status</th>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151', fontSize: '13px' }}>Data Pagamento</th>
              <th style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: '#374151', fontSize: '13px' }}>Dias de Atraso</th>
            </tr>
          </thead>
          <tbody>
            {pagamentos.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid #e5e7eb', hover: { background: '#f9fafb' } }}>
                <td style={{ padding: '12px', color: '#1f2937', fontSize: '14px' }}>
                  {new Date(p.data_vencimento).toLocaleDateString('pt-BR')}
                </td>
                <td style={{ padding: '12px', textAlign: 'right', color: '#1f2937', fontSize: '14px', fontWeight: '600' }}>
                  R$ {p.valor.toFixed(2).replace('.', ',')}
                </td>
                <td style={{ padding: '12px', textAlign: 'center' }}>{statusBadge(p.status)}</td>
                <td style={{ padding: '12px', color: '#1f2937', fontSize: '14px' }}>
                  {p.data_pagamento ? new Date(p.data_pagamento).toLocaleDateString('pt-BR') : '—'}
                </td>
                <td style={{ padding: '12px', textAlign: 'center', color: p.dias_atraso > 0 ? '#991b1b' : '#166534', fontWeight: '600', fontSize: '14px' }}>
                  {p.dias_atraso > 0 ? `${p.dias_atraso}d` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '15px' }}>
        <p style={{ margin: 0, fontSize: '13px', color: '#1e40af' }}>
          💡 <strong>Dúvidas sobre um pagamento?</strong> <Link href={`/portal/contratos/${contratoId}/suporte`} style={{ color: '#0066cc' }}>Entre em contato conosco</Link>
        </p>
      </div>
    </div>
  );
}
