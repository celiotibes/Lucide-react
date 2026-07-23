// Página de plano de pagamento - Tenant pode solicitar parcelamento de débitos

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

interface Fatura {
  id: string;
  tipo: string;
  valorBruto: number;
  valorLiquido: number;
  vencimento: string;
  status: string;
  diasAtraso: number;
}

interface PlanoPagamento {
  id: string;
  numParcelas: number;
  valorParcela: number;
  status: string;
  dataInicio: string;
}

export default function PlanoPagamentoPage() {
  const params = useParams();
  const contratoId = params.id as string;

  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [planos, setPlanos] = useState<PlanoPagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFatura, setSelectedFatura] = useState<string | null>(null);
  const [numParcelas, setNumParcelas] = useState(6);
  const [motivo, setMotivo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const supabase = createClientComponentClient();

  useEffect(() => {
    async function carregarDados() {
      try {
        const session = await supabase.auth.getSession();
        if (!session.data.session) {
          setError('Não autenticado');
          return;
        }

        // Buscar faturas atrasadas do contrato
        const { data: faturasData, error: faturasError } = await supabase
          .from('faturas')
          .select('*')
          .eq('contrato_id', contratoId)
          .in('status', ['aberta', 'atrasada'])
          .order('vencimento', { ascending: true });

        if (faturasError) throw faturasError;

        setFaturas(
          (faturasData || []).map((f: any) => ({
            id: f.id,
            tipo: f.tipo,
            valorBruto: f.valor_bruto,
            valorLiquido: f.valor_liquido,
            vencimento: f.vencimento,
            status: f.status,
            diasAtraso: Math.max(0, Math.floor((new Date().getTime() - new Date(f.vencimento).getTime()) / (1000 * 60 * 60 * 24))),
          }))
        );

        // Buscar planos existentes do tenant
        const { data: planosData, error: planosError } = await supabase
          .from('planos_pagamento')
          .select('*')
          .eq('contrato_id', contratoId)
          .order('criado_em', { ascending: false });

        if (planosError) throw planosError;

        setPlanos(
          (planosData || []).map((p: any) => ({
            id: p.id,
            numParcelas: p.num_parcelas,
            valorParcela: p.valor_parcela,
            status: p.status,
            dataInicio: p.data_inicio,
          }))
        );
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    carregarDados();
  }, [supabase, contratoId]);

  async function handleCriarPlano(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFatura) {
      setError('Selecione uma fatura');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        throw new Error('Não autenticado');
      }

      const response = await fetch('/api/portal/planos-pagamento/criar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.data.session.access_token}`,
        },
        body: JSON.stringify({
          faturaId: selectedFatura,
          numParcelas,
          motivo: motivo || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.erro || 'Erro ao criar plano de pagamento');
      }

      const resultado = await response.json();
      setSuccessMessage(resultado.mensagem);

      // Limpar formulário
      setSelectedFatura(null);
      setNumParcelas(6);
      setMotivo('');

      // Recarregar planos
      const { data: planosData } = await supabase
        .from('planos_pagamento')
        .select('*')
        .eq('contrato_id', contratoId)
        .order('criado_em', { ascending: false });

      setPlanos(
        (planosData || []).map((p: any) => ({
          id: p.id,
          numParcelas: p.num_parcelas,
          valorParcela: p.valor_parcela,
          status: p.status,
          dataInicio: p.data_inicio,
        }))
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="p-8">Carregando...</div>;

  const faturaSelecionada = selectedFatura ? faturas.find((f) => f.id === selectedFatura) : null;
  const valorParcela = faturaSelecionada ? faturaSelecionada.valorLiquido / numParcelas : 0;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Plano de Pagamento</h1>
        <p className="text-gray-600 mb-8">
          Solicite parcelamento de faturas em atraso para facilitar o pagamento.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded mb-6">
            {successMessage}
          </div>
        )}

        {/* Formulário de Criação */}
        <div className="bg-white rounded-lg shadow mb-8 p-6">
          <h2 className="text-xl font-semibold mb-4">Solicitar Novo Plano</h2>

          {faturas.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Nenhuma fatura em aberto ou atrasada. Você está em dia! ✓
            </div>
          ) : (
            <form onSubmit={handleCriarPlano} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Selecione a Fatura
                </label>
                <select
                  value={selectedFatura || ''}
                  onChange={(e) => setSelectedFatura(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">-- Escolha uma fatura --</option>
                  {faturas.map((fatura) => (
                    <option key={fatura.id} value={fatura.id}>
                      {fatura.tipo.toUpperCase()} - R$ {fatura.valorLiquido.toFixed(2)} (
                      {fatura.status === 'atrasada'
                        ? `${fatura.diasAtraso} dias atrasada`
                        : 'vence em ' + new Date(fatura.vencimento).toLocaleDateString('pt-BR')}
                      )
                    </option>
                  ))}
                </select>
              </div>

              {faturaSelecionada && (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                    <p className="text-sm text-gray-600">
                      Valor Total: <strong>R$ {faturaSelecionada.valorLiquido.toFixed(2)}</strong>
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      Parcela: <strong>R$ {valorParcela.toFixed(2)}</strong>
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Número de Parcelas: {numParcelas}x
                    </label>
                    <input
                      type="range"
                      min="2"
                      max="24"
                      value={numParcelas}
                      onChange={(e) => setNumParcelas(parseInt(e.target.value))}
                      className="w-full"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Mínimo 2 parcelas, máximo 24 meses
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Motivo da Solicitação (opcional)
                    </label>
                    <textarea
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Ex: Dificuldade financeira temporária, aguardando recebimento..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={3}
                    />
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                    <p className="text-sm text-amber-800">
                      <strong>⚠️ Importante:</strong> A aprovação do proprietário é necessária. Você receberá
                      notificação por email quando o plano for analisado.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium"
                  >
                    {submitting ? 'Enviando...' : 'Solicitar Plano de Pagamento'}
                  </button>
                </>
              )}
            </form>
          )}
        </div>

        {/* Lista de Planos Existentes */}
        {planos.length > 0 && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold">Seus Planos de Pagamento</h2>
            </div>

            <div className="divide-y divide-gray-200">
              {planos.map((plano) => (
                <div key={plano.id} className="px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600">
                      {plano.numParcelas}x R$ {plano.valorParcela.toFixed(2)}
                    </span>
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                        plano.status === 'aprovado'
                          ? 'bg-green-100 text-green-800'
                          : plano.status === 'pendente'
                            ? 'bg-yellow-100 text-yellow-800'
                            : plano.status === 'pago'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {plano.status === 'aprovado'
                        ? 'Aprovado'
                        : plano.status === 'pendente'
                          ? 'Pendente'
                          : plano.status === 'pago'
                            ? 'Completo'
                            : 'Rejeitado'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    Criado em {new Date(plano.dataInicio).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
