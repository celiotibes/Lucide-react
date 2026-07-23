// Página de gestão de garantias (seguro-incêndio, caução, etc) para um contrato

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

interface Garantia {
  id: string;
  tipo: string;
  valor: number;
  dataInicio: string;
  dataVencimento: string | null;
  apoliceNumero: string | null;
  status: string;
}

export default function ContratoGarantias() {
  const params = useParams();
  const contratoId = params.id as string;

  const [garantias, setGarantias] = useState<Garantia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    tipo: 'seguro_incendio',
    apoliceNumero: '',
    dataInicio: new Date().toISOString().split('T')[0],
    dataVencimento: '',
    valorCobertura: 0,
  });
  const [submitting, setSubmitting] = useState(false);

  const supabase = createClientComponentClient();

  useEffect(() => {
    async function carregarGarantias() {
      try {
        const { data, error: err } = await supabase
          .from('garantias')
          .select('*')
          .eq('contrato_id', contratoId);

        if (err) throw err;

        setGarantias(
          (data || []).map((g: any) => ({
            id: g.id,
            tipo: g.tipo,
            valor: g.valor,
            dataInicio: g.data_inicio,
            dataVencimento: g.data_vencimento_apolice,
            apoliceNumero: g.apolice_numero,
            status: g.status,
          }))
        );
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    carregarGarantias();
  }, [supabase, contratoId]);

  async function handleAdicionar(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        throw new Error('Não autenticado');
      }

      const response = await fetch('/api/admin/garantias/adicionar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.data.session.access_token}`,
        },
        body: JSON.stringify({
          contratoId,
          tipo: formData.tipo,
          apoliceNumero: formData.apoliceNumero,
          dataInicio: new Date(formData.dataInicio),
          dataVencimento: new Date(formData.dataVencimento),
          valorCobertura: parseFloat(formData.valorCobertura.toString()),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.erro || 'Erro ao adicionar garantia');
      }

      // Recarregar garantias
      const { data, error: err } = await supabase
        .from('garantias')
        .select('*')
        .eq('contrato_id', contratoId);

      if (err) throw err;

      setGarantias(
        (data || []).map((g: any) => ({
          id: g.id,
          tipo: g.tipo,
          valor: g.valor,
          dataInicio: g.data_inicio,
          dataVencimento: g.data_vencimento_apolice,
          apoliceNumero: g.apolice_numero,
          status: g.status,
        }))
      );

      // Limpar formulário
      setFormData({
        tipo: 'seguro_incendio',
        apoliceNumero: '',
        dataInicio: new Date().toISOString().split('T')[0],
        dataVencimento: '',
        valorCobertura: 0,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="p-8">Carregando...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Garantias do Contrato</h1>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
            Erro: {error}
          </div>
        )}

        {/* Formulário de Adição */}
        <div className="bg-white rounded-lg shadow mb-8 p-6">
          <h2 className="text-xl font-semibold mb-4">Adicionar Nova Garantia</h2>

          <form onSubmit={handleAdicionar} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Garantia
                </label>
                <select
                  value={formData.tipo}
                  onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="seguro_incendio">Seguro-Incêndio</option>
                  <option value="seguro_fianca">Seguro-Fiança</option>
                  <option value="titulo_capitalizacao">Título Capitalização</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Número Apólice
                </label>
                <input
                  type="text"
                  value={formData.apoliceNumero}
                  onChange={(e) => setFormData({ ...formData, apoliceNumero: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Ex: APL-2026-123456"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data Início
                </label>
                <input
                  type="date"
                  value={formData.dataInicio}
                  onChange={(e) => setFormData({ ...formData, dataInicio: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data Vencimento
                </label>
                <input
                  type="date"
                  value={formData.dataVencimento}
                  onChange={(e) => setFormData({ ...formData, dataVencimento: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  required
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Valor Cobertura (R$)
                </label>
                <input
                  type="number"
                  value={formData.valorCobertura}
                  onChange={(e) => setFormData({ ...formData, valorCobertura: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="0.00"
                  step="0.01"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? 'Adicionando...' : 'Adicionar Garantia'}
              </button>
            </div>
          </form>
        </div>

        {/* Lista de Garantias */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold">Garantias Vigentes</h2>
          </div>

          {garantias.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              Nenhuma garantia registrada.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Tipo
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Apólice
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Valor
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Vencimento
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {garantias.map((garantia) => (
                    <tr key={garantia.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {garantia.tipo === 'seguro_incendio'
                          ? 'Seguro-Incêndio'
                          : garantia.tipo === 'seguro_fianca'
                            ? 'Seguro-Fiança'
                            : 'Título Capitalização'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {garantia.apoliceNumero || 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                        R$ {garantia.valor?.toFixed(2) || '0.00'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {garantia.dataVencimento
                          ? new Date(garantia.dataVencimento).toLocaleDateString('pt-BR')
                          : 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                            garantia.status === 'ativa'
                              ? 'bg-green-100 text-green-800'
                              : garantia.status === 'vencida'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {garantia.status === 'ativa'
                            ? 'Vigente'
                            : garantia.status === 'vencida'
                              ? 'Vencida'
                              : 'Baixada'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
