// Página de dashboard de conformidade: alertas de seguro-incêndio e direito de preferência

'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/ssr';
import Link from 'next/link';

interface GarantiaAlerta {
  contratoId: string;
  imovelIdentificacao: string;
  pessoaNome: string;
  dataVencimento: string;
  diasAteVencimento: number;
  tipo: 'seguro_incendio';
}

interface PreferenciaAlerta {
  notificacaoId: string;
  contratoId: string;
  imovelIdentificacao: string;
  pessoaNome: string;
  valorOferta: number;
  prazoResposta: number;
  diasRestantes: number;
  resposta: string | null;
}

export default function ComplianceDashboard() {
  const [seguros, setSeguros] = useState<GarantiaAlerta[]>([]);
  const [preferencias, setPreferencias] = useState<PreferenciaAlerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    async function carregarAlerts() {
      try {
        const session = await supabase.auth.getSession();
        if (!session.data.session) {
          setError('Não autenticado');
          return;
        }

        // Buscar alertas de seguro-incêndio vencendo em 60 dias
        const { data: segurosData, error: segurosError } = await supabase
          .from('garantias')
          .select(
            `
            id,
            contrato_id,
            data_vencimento_apolice,
            contratos:contrato_id (
              imovel_id,
              contrato_partes (
                pessoas (
                  nome
                )
              ),
              imoveis (
                identificacao
              )
            )
          `
          )
          .eq('tipo', 'seguro_incendio')
          .eq('status', 'ativa')
          .not('data_vencimento_apolice', 'is', null)
          .gte('data_vencimento_apolice', new Date().toISOString().split('T')[0])
          .lte('data_vencimento_apolice', new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

        if (segurosError) throw segurosError;

        // Buscar preferências pendentes
        const { data: preferencialData, error: preferenceError } = await supabase
          .from('notificacoes_preferencia_venda')
          .select(
            `
            id,
            contrato_id,
            valor_oferta,
            prazo_resposta_dias,
            notificado_em,
            resposta,
            contratos (
              imovel_id,
              contrato_partes (
                pessoas (
                  nome
                )
              ),
              imoveis (
                identificacao
              )
            )
          `
          )
          .is('resposta', null);

        if (preferenceError) throw preferenceError;

        // Processar dados de seguros
        const segurosProcessados: GarantiaAlerta[] = (segurosData || []).map((g: any) => {
          const dataVencimento = new Date(g.data_vencimento_apolice);
          const diasAteVencimento = Math.ceil(
            (dataVencimento.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
          );
          return {
            contratoId: g.contrato_id,
            imovelIdentificacao: g.contratos?.imoveis?.identificacao || 'N/A',
            pessoaNome: g.contratos?.contrato_partes?.[0]?.pessoas?.nome || 'N/A',
            dataVencimento: g.data_vencimento_apolice,
            diasAteVencimento,
            tipo: 'seguro_incendio',
          };
        });

        // Processar dados de preferências
        const preferenciaProcessadas: PreferenciaAlerta[] = (preferencialData || []).map((p: any) => {
          const dataExpiracao = new Date(p.notificado_em);
          dataExpiracao.setDate(dataExpiracao.getDate() + p.prazo_resposta_dias);
          const diasRestantes = Math.ceil(
            (dataExpiracao.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
          );

          return {
            notificacaoId: p.id,
            contratoId: p.contrato_id,
            imovelIdentificacao: p.contratos?.imoveis?.identificacao || 'N/A',
            pessoaNome: p.contratos?.contrato_partes?.[0]?.pessoas?.nome || 'N/A',
            valorOferta: p.valor_oferta,
            prazoResposta: p.prazo_resposta_dias,
            diasRestantes,
            resposta: p.resposta,
          };
        });

        setSeguros(segurosProcessados);
        setPreferencias(preferenciaProcessadas);
      } catch (err) {
        setError((err as Error).message);
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    carregarAlerts();
  }, [supabase]);

  if (loading) return <div className="p-8">Carregando...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Dashboard de Conformidade</h1>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
            Erro: {error}
          </div>
        )}

        {/* Alertas de Seguro-Incêndio */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <span className="text-2xl">🔥</span> Alertas de Seguro-Incêndio
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {seguros.length} apólices vencendo nos próximos 60 dias
            </p>
          </div>

          {seguros.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              Nenhuma apólice próxima de vencer.
            </div>
          ) : (
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
                      Data Vencimento
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Dias Restantes
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Ação
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {seguros.map((seguro) => (
                    <tr key={seguro.contratoId} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {seguro.imovelIdentificacao}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">{seguro.pessoaNome}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {new Date(seguro.dataVencimento).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                            seguro.diasAteVencimento <= 30
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {seguro.diasAteVencimento} dias
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <Link
                          href={`/admin/contratos/${seguro.contratoId}/garantias`}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Renovar →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Alertas de Direito de Preferência */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <span className="text-2xl">🏠</span> Direito de Preferência
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {preferencias.length} notificações aguardando resposta
            </p>
          </div>

          {preferencias.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              Nenhuma notificação pendente.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Imóvel
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Locatário
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Valor Oferta
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Prazo
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Ação
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {preferencias.map((pref) => (
                    <tr key={pref.notificacaoId} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {pref.imovelIdentificacao}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">{pref.pessoaNome}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                        R$ {pref.valorOferta.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                            pref.diasRestantes <= 7
                              ? 'bg-red-100 text-red-800'
                              : pref.diasRestantes <= 15
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {pref.diasRestantes} dias
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <Link
                          href={`/admin/preferencias/${pref.notificacaoId}`}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Acompanhar →
                        </Link>
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
