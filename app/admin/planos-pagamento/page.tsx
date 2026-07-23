// Admin dashboard para gerenciar planos de pagamento - Approve/reject tenant requests

'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import Link from 'next/link';

interface PlanoPagamentoDetalhes {
  id: string;
  contratoId: string;
  locatarioNome: string;
  imovelIdentificacao: string;
  valorTotal: number;
  numParcelas: number;
  valorParcela: number;
  motivo: string | null;
  status: string;
  criadoEm: string;
}

export default function PlanosPagementoDashboard() {
  const [planos, setPlanos] = useState<PlanoPagamentoDetalhes[]>([]);
  const [filtroStatus, setFiltroStatus] = useState('pendente');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState<{ [key: string]: string }>({});
  const [processingId, setProcessingId] = useState<string | null>(null);

  const supabase = createClientComponentClient();

  useEffect(() => {
    async function carregarPlanos() {
      try {
        let query = supabase
          .from('planos_pagamento')
          .select(
            `
            id,
            contrato_id,
            valor_total,
            num_parcelas,
            valor_parcela,
            motivo,
            status,
            criado_em,
            pessoas:locatario_id (
              nome
            ),
            contratos:contrato_id (
              imoveis:imovel_id (
                identificacao
              )
            )
          `
          )
          .order('criado_em', { ascending: false });

        if (filtroStatus !== 'todos') {
          query = query.eq('status', filtroStatus);
        }

        const { data, error: err } = await query;

        if (err) throw err;

        setPlanos(
          (data || []).map((p: any) => ({
            id: p.id,
            contratoId: p.contrato_id,
            locatarioNome: p.pessoas?.nome || 'N/A',
            imovelIdentificacao: p.contratos?.imoveis?.identificacao || 'N/A',
            valorTotal: p.valor_total,
            numParcelas: p.num_parcelas,
            valorParcela: p.valor_parcela,
            motivo: p.motivo,
            status: p.status,
            criadoEm: p.criado_em,
          }))
        );
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    carregarPlanos();
  }, [supabase, filtroStatus]);

  async function handleAprovar(planoId: string) {
    setProcessingId(planoId);
    setError(null);

    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        throw new Error('Não autenticado');
      }

      const response = await fetch('/api/admin/planos-pagamento/aprovar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.data.session.access_token}`,
        },
        body: JSON.stringify({ planoId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.erro || 'Erro ao aprovar');
      }

      // Atualizar lista
      setPlanos(planos.map((p) => (p.id === planoId ? { ...p, status: 'aprovado' } : p)));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProcessingId(null);
    }
  }

  async function handleRejeitar(planoId: string) {
    const motivo = motivoRejeicao[planoId];
    if (!motivo.trim()) {
      setError('Informar motivo da rejeição');
      return;
    }

    setProcessingId(planoId);
    setError(null);

    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        throw new Error('Não autenticado');
      }

      const response = await fetch('/api/admin/planos-pagamento/rejeitar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.data.session.access_token}`,
        },
        body: JSON.stringify({ planoId, motivo }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.erro || 'Erro ao rejeitar');
      }

      // Atualizar lista
      setPlanos(planos.map((p) => (p.id === planoId ? { ...p, status: 'rejeitado' } : p)));
      setMotivoRejeicao({ ...motivoRejeicao, [planoId]: '' });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProcessingId(null);
    }
  }

  if (loading) return <div className="p-8">Carregando...</div>;

  const totalPendentes = planos.filter((p) => p.status === 'pendente').length;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Planos de Pagamento</h1>
          <p className="text-gray-600 mt-2">Gerenciar solicitações de parcelamento de inquilinos</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Filtros */}
        <div className="mb-6 flex gap-2">
          {['pendente', 'aprovado', 'rejeitado', 'pago', 'todos'].map((status) => (
            <button
              key={status}
              onClick={() => setFiltroStatus(status)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                filtroStatus === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {status === 'todos'
                ? 'Todos'
                : status === 'pendente'
                  ? `Pendente (${totalPendentes})`
                  : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        {/* Tabela */}
        {planos.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            Nenhum plano encontrado com esse filtro.
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Imóvel
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Inquilino
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Valor Total
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Parcelas
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Motivo
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Ação
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {planos.map((plano) => (
                    <tr key={plano.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        <Link
                          href={`/admin/contratos/${plano.contratoId}`}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          {plano.imovelIdentificacao}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">{plano.locatarioNome}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                        R$ {plano.valorTotal.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {plano.numParcelas}x R$ {plano.valorParcela.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                        {plano.motivo || '—'}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                            plano.status === 'pendente'
                              ? 'bg-yellow-100 text-yellow-800'
                              : plano.status === 'aprovado'
                                ? 'bg-green-100 text-green-800'
                                : plano.status === 'rejeitado'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {plano.status.charAt(0).toUpperCase() + plano.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {plano.status === 'pendente' ? (
                          <div className="space-y-2">
                            <button
                              onClick={() => handleAprovar(plano.id)}
                              disabled={processingId === plano.id}
                              className="block w-full px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                            >
                              {processingId === plano.id ? 'Processando...' : 'Aprovar'}
                            </button>
                            <details className="text-xs">
                              <summary className="cursor-pointer text-red-600 hover:text-red-700">
                                Rejeitar
                              </summary>
                              <div className="mt-1 space-y-1">
                                <textarea
                                  value={motivoRejeicao[plano.id] || ''}
                                  onChange={(e) =>
                                    setMotivoRejeicao({
                                      ...motivoRejeicao,
                                      [plano.id]: e.target.value,
                                    })
                                  }
                                  placeholder="Motivo..."
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                                  rows={2}
                                />
                                <button
                                  onClick={() => handleRejeitar(plano.id)}
                                  disabled={processingId === plano.id}
                                  className="block w-full px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                                >
                                  {processingId === plano.id ? 'Processando...' : 'Confirmar'}
                                </button>
                              </div>
                            </details>
                          </div>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
