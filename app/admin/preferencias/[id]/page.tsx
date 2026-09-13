// Página para acompanhar resposta de direito de preferência

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@supabase/ssr';

interface PreferenciaDetalhes {
  id: string;
  contratoId: string;
  valorOferta: number;
  notificadoEm: string;
  prazoRespostaDias: number;
  resposta: string | null;
  dataRespostaEnviada: string | null;
  dataExpiracao: string | null;
  imovelIdentificacao: string;
  pessoaNome: string;
  pessoaEmail: string;
}

export default function PreferenciaDetalhes() {
  const params = useParams();
  const notificacaoId = params.id as string;

  const [preferencia, setPreferencia] = useState<PreferenciaDetalhes | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resposta, setResposta] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    async function carregarPreferencia() {
      try {
        const { data, error: err } = await supabase
          .from('notificacoes_preferencia_venda')
          .select(
            `
            id,
            contrato_id,
            valor_oferta,
            notificado_em,
            prazo_resposta_dias,
            resposta,
            data_notificacao_enviada,
            data_expiracao,
            contratos (
              imovel_id,
              contrato_partes (
                pessoas (
                  nome,
                  email
                )
              ),
              imoveis (
                identificacao
              )
            )
          `
          )
          .eq('id', notificacaoId)
          .single();

        if (err) throw err;

        setPreferencia({
          id: data.id,
          contratoId: data.contrato_id,
          valorOferta: data.valor_oferta,
          notificadoEm: data.notificado_em,
          prazoRespostaDias: data.prazo_resposta_dias,
          resposta: data.resposta,
          dataRespostaEnviada: data.data_notificacao_enviada,
          dataExpiracao: data.data_expiracao,
          imovelIdentificacao: data.contratos?.imoveis?.identificacao || 'N/A',
          pessoaNome: data.contratos?.contrato_partes?.[0]?.pessoas?.nome || 'N/A',
          pessoaEmail: data.contratos?.contrato_partes?.[0]?.pessoas?.email || 'N/A',
        });

        setResposta(data.resposta);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    carregarPreferencia();
  }, [supabase, notificacaoId]);

  async function handleRegistrarResposta() {
    if (!resposta) {
      setError('Selecione uma resposta');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        throw new Error('Não autenticado');
      }

      const response = await fetch('/api/admin/preferencias/responder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.data.session.access_token}`,
        },
        body: JSON.stringify({
          notificacaoId,
          resposta,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.erro || 'Erro ao registrar resposta');
      }

      // Recarregar preferência
      const { data, error: err } = await supabase
        .from('notificacoes_preferencia_venda')
        .select('resposta, data_resposta')
        .eq('id', notificacaoId)
        .single();

      if (err) throw err;

      if (preferencia) {
        setPreferencia({
          ...preferencia,
          resposta: data.resposta,
        });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="p-8">Carregando...</div>;
  if (!preferencia) return <div className="p-8">Preferência não encontrada</div>;

  const diasRestantes = Math.ceil(
    (new Date(preferencia.dataExpiracao || '').getTime() - new Date().getTime()) /
      (1000 * 60 * 60 * 24)
  );

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Acompanhamento de Direito de Preferência</h1>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
            Erro: {error}
          </div>
        )}

        {/* Informações Gerais */}
        <div className="bg-white rounded-lg shadow mb-8 p-6">
          <h2 className="text-xl font-semibold mb-4">Informações da Notificação</h2>

          <dl className="grid grid-cols-1 gap-4">
            <div>
              <dt className="text-sm font-medium text-gray-500">Imóvel</dt>
              <dd className="text-lg text-gray-900">{preferencia.imovelIdentificacao}</dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-gray-500">Locatário</dt>
              <dd className="text-lg text-gray-900">{preferencia.pessoaNome}</dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-gray-500">Email</dt>
              <dd className="text-lg text-gray-900">{preferencia.pessoaEmail}</dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-gray-500">Valor da Oferta</dt>
              <dd className="text-lg font-semibold text-gray-900">
                R$ {preferencia.valorOferta.toFixed(2)}
              </dd>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">Notificado em</dt>
                <dd className="text-lg text-gray-900">
                  {new Date(preferencia.notificadoEm).toLocaleDateString('pt-BR')}
                </dd>
              </div>

              <div>
                <dt className="text-sm font-medium text-gray-500">Prazo</dt>
                <dd className="text-lg text-gray-900">{preferencia.prazoRespostaDias} dias</dd>
              </div>
            </div>

            {preferencia.dataExpiracao && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Expira em</dt>
                <dd className="flex items-center gap-2">
                  <span className="text-lg text-gray-900">
                    {new Date(preferencia.dataExpiracao).toLocaleDateString('pt-BR')}
                  </span>
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                      diasRestantes <= 7
                        ? 'bg-red-100 text-red-800'
                        : diasRestantes <= 15
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-green-100 text-green-800'
                    }`}
                  >
                    {diasRestantes > 0 ? `${diasRestantes} dias` : 'Expirado'}
                  </span>
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Status de Resposta */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Status da Resposta</h2>

          {preferencia.resposta ? (
            <div className="mb-6">
              <p className="text-sm text-gray-500 mb-2">Resposta Registrada</p>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block px-4 py-2 rounded-full text-sm font-semibold ${
                    preferencia.resposta === 'exerceu_preferencia'
                      ? 'bg-green-100 text-green-800'
                      : preferencia.resposta === 'recusou'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                  }`}
                >
                  {preferencia.resposta === 'exerceu_preferencia'
                    ? '✓ Exerceu Preferência'
                    : preferencia.resposta === 'recusou'
                      ? '✗ Recusou'
                      : 'Sem Resposta'}
                </span>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-500 mb-4">Nenhuma resposta registrada ainda</p>

              <div className="space-y-2">
                <label className="flex items-center gap-3 p-3 border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer">
                  <input
                    type="radio"
                    value="exerceu_preferencia"
                    checked={resposta === 'exerceu_preferencia'}
                    onChange={(e) => setResposta(e.target.value)}
                    className="w-4 h-4"
                  />
                  <span className="text-gray-900">
                    <strong>Exerceu Preferência</strong> — O locatário deseja adquirir o imóvel
                  </span>
                </label>

                <label className="flex items-center gap-3 p-3 border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer">
                  <input
                    type="radio"
                    value="recusou"
                    checked={resposta === 'recusou'}
                    onChange={(e) => setResposta(e.target.value)}
                    className="w-4 h-4"
                  />
                  <span className="text-gray-900">
                    <strong>Recusou</strong> — O locatário não deseja adquirir
                  </span>
                </label>

                <label className="flex items-center gap-3 p-3 border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer">
                  <input
                    type="radio"
                    value="sem_resposta"
                    checked={resposta === 'sem_resposta'}
                    onChange={(e) => setResposta(e.target.value)}
                    className="w-4 h-4"
                  />
                  <span className="text-gray-900">
                    <strong>Sem Resposta</strong> — Prazo expirou sem resposta
                  </span>
                </label>
              </div>

              <div className="mt-6 flex gap-2">
                <button
                  onClick={handleRegistrarResposta}
                  disabled={submitting || !resposta}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Registrando...' : 'Registrar Resposta'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
