'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  aprovarFechamento,
  devolverFechamento,
  registrarPagamento,
} from '@/app/actions/prestador/fechamentos';

interface Fechamento {
  id: string;
  contrato_id: string;
  data_inicio: string;
  data_fim: string;
  total_proventos: number;
  total_deducoes: number;
  valor_liquido: number;
  status: string;
  motivo_devolucao?: string;
  prestadores_servico?: {
    nome_completo: string;
    categoria: string;
  };
}

interface FechamentosTableProps {
  fechamentos: Fechamento[];
}

export function FechamentosTable({ fechamentos }: FechamentosTableProps) {
  const [selectedFechamento, setSelectedFechamento] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<{
    type: 'aprovar' | 'devolver' | 'pagar' | null;
    fechamentoId?: string;
  }>({ type: null });
  const [devolverMotivo, setDevolverMotivo] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleAprovar = async (fechamentoId: string) => {
    setIsLoading(true);
    const result = await aprovarFechamento(fechamentoId);

    if ('error' in result) {
      setMessage({ type: 'error', text: result.error || 'Erro ao aprovar fechamento' });
    } else {
      setMessage({ type: 'success', text: 'Fechamento aprovado com sucesso' });
      setActionModal({ type: null });
      setTimeout(() => window.location.reload(), 1500);
    }
    setIsLoading(false);
  };

  const handleDevolver = async (fechamentoId: string) => {
    if (!devolverMotivo.trim()) {
      setMessage({ type: 'error', text: 'Informe o motivo da devolução' });
      return;
    }

    setIsLoading(true);
    const result = await devolverFechamento(fechamentoId, devolverMotivo);

    if ('error' in result) {
      setMessage({ type: 'error', text: result.error || 'Erro ao devolver fechamento' });
    } else {
      setMessage({ type: 'success', text: 'Fechamento devolvido com sucesso' });
      setActionModal({ type: null });
      setDevolverMotivo('');
      setTimeout(() => window.location.reload(), 1500);
    }
    setIsLoading(false);
  };

  const handlePagar = async (fechamentoId: string) => {
    setIsLoading(true);
    const result = await registrarPagamento(fechamentoId, new Date());

    if ('error' in result) {
      setMessage({ type: 'error', text: result.error || 'Erro ao registrar pagamento' });
    } else {
      setMessage({ type: 'success', text: 'Pagamento registrado com sucesso' });
      setActionModal({ type: null });
      setTimeout(() => window.location.reload(), 1500);
    }
    setIsLoading(false);
  };

  return (
    <>
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-6 py-3 font-medium text-sm">Prestador</th>
                <th className="text-left px-6 py-3 font-medium text-sm">Período</th>
                <th className="text-left px-6 py-3 font-medium text-sm">Proventos</th>
                <th className="text-left px-6 py-3 font-medium text-sm">Deduções</th>
                <th className="text-left px-6 py-3 font-medium text-sm">Líquido</th>
                <th className="text-left px-6 py-3 font-medium text-sm">Status</th>
                <th className="text-left px-6 py-3 font-medium text-sm">Ações</th>
              </tr>
            </thead>
            <tbody>
              {fechamentos.map((fech) => (
                <tr key={fech.id} className="border-b hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium">
                        {fech.prestadores_servico?.nome_completo || 'Desconhecido'}
                      </p>
                      <p className="text-sm text-gray-500 capitalize">
                        {fech.prestadores_servico?.categoria.replace(/_/g, ' ') || ''}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {format(new Date(fech.data_inicio), 'dd MMM', { locale: ptBR })} -{' '}
                    {format(new Date(fech.data_fim), 'dd MMM yyyy', { locale: ptBR })}
                  </td>
                  <td className="px-6 py-4 font-medium text-green-700">
                    R$ {fech.total_proventos.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 font-medium text-red-700">
                    R$ {fech.total_deducoes.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 font-bold text-lg">
                    R$ {fech.valor_liquido.toFixed(2)}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                        fech.status === 'enviado_para_gestao'
                          ? 'bg-yellow-100 text-yellow-700'
                          : fech.status === 'devolvido'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {fech.status === 'enviado_para_gestao'
                        ? 'Aguardando Aprovação'
                        : fech.status === 'devolvido'
                        ? 'Devolvido'
                        : fech.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {fech.status === 'enviado_para_gestao' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setActionModal({ type: 'aprovar', fechamentoId: fech.id })}
                          className="text-green-600 hover:text-green-800 font-medium"
                        >
                          Aprovar
                        </button>
                        <button
                          onClick={() => setActionModal({ type: 'devolver', fechamentoId: fech.id })}
                          className="text-red-600 hover:text-red-800 font-medium"
                        >
                          Devolver
                        </button>
                      </div>
                    )}
                    {fech.status === 'devolvido' && (
                      <span className="text-gray-500 text-xs">
                        {fech.motivo_devolucao && `Motivo: ${fech.motivo_devolucao}`}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {actionModal.type && actionModal.fechamentoId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            {actionModal.type === 'aprovar' && (
              <>
                <h3 className="text-lg font-semibold mb-4">Aprovar Fechamento?</h3>
                <p className="text-gray-600 mb-6">
                  Tem certeza que deseja aprovar este fechamento? O prestador poderá receber o pagamento.
                </p>
                {message && (
                  <div
                    className={`mb-4 p-3 rounded text-sm ${
                      message.type === 'success'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {message.text}
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => handleAprovar(actionModal.fechamentoId!)}
                    disabled={isLoading}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded font-medium hover:bg-green-700 disabled:opacity-50"
                  >
                    {isLoading ? 'Processando...' : 'Aprovar'}
                  </button>
                  <button
                    onClick={() => setActionModal({ type: null })}
                    className="flex-1 px-4 py-2 border rounded font-medium hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}

            {actionModal.type === 'devolver' && (
              <>
                <h3 className="text-lg font-semibold mb-4">Devolver para Ajuste</h3>
                <p className="text-gray-600 mb-4">
                  Informe o motivo da devolução para que o prestador possa fazer os ajustes necessários.
                </p>
                {message && (
                  <div
                    className={`mb-4 p-3 rounded text-sm ${
                      message.type === 'success'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {message.text}
                  </div>
                )}
                <textarea
                  value={devolverMotivo}
                  onChange={(e) => setDevolverMotivo(e.target.value)}
                  placeholder="Ex: Faltam apontamentos da segunda-feira..."
                  className="w-full px-3 py-2 border rounded mb-4 text-sm"
                  rows={3}
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => handleDevolver(actionModal.fechamentoId!)}
                    disabled={isLoading || !devolverMotivo.trim()}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded font-medium hover:bg-red-700 disabled:opacity-50"
                  >
                    {isLoading ? 'Processando...' : 'Devolver'}
                  </button>
                  <button
                    onClick={() => {
                      setActionModal({ type: null });
                      setDevolverMotivo('');
                    }}
                    className="flex-1 px-4 py-2 border rounded font-medium hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
