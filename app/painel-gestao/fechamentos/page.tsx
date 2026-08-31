'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { CheckCircle, AlertCircle, Clock, Eye, Trash2, CheckCheck, Send } from 'lucide-react';

interface FechamentoPrestador {
  id: string;
  data_inicio: string;
  data_fim: string;
  status: string;
  valor_liquido: number;
  contratos_prestador?: {
    prestadores_servico?: {
      nome_completo: string;
    };
  };
  pix_status?: string;
  nfse_status?: string;
}

export default function PaginaFechamentos() {
  const [fechamentos, setFechamentos] = useState<FechamentoPrestador[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>('');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [modalAberta, setModalAberta] = useState(false);
  const [acaoEmLote, setAcaoEmLote] = useState<'aprovar' | 'devolver' | null>(null);
  const [observacoes, setObservacoes] = useState('');
  const [processando, setProcessando] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    carregarFechamentos();
  }, [filtroStatus]);

  async function carregarFechamentos() {
    try {
      setCarregando(true);

      let query = supabase
        .from('fechamentos_prestador')
        .select(
          `
          *,
          contratos_prestador (
            prestadores_servico (nome_completo)
          )
        `
        )
        .order('data_fim', { ascending: false });

      if (filtroStatus) {
        query = query.eq('status', filtroStatus);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Erro ao carregar:', error);
        return;
      }

      setFechamentos(data || []);
    } finally {
      setCarregando(false);
    }
  }

  const toggleSelecionado = (id: string) => {
    const novo = new Set(selecionados);
    if (novo.has(id)) {
      novo.delete(id);
    } else {
      novo.add(id);
    }
    setSelecionados(novo);
  };

  const selecionarTodos = (checked: boolean) => {
    if (checked) {
      setSelecionados(new Set(fechamentos.map(f => f.id)));
    } else {
      setSelecionados(new Set());
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pago':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'aprovado':
        return <Clock className="w-5 h-5 text-yellow-600" />;
      case 'devolvido':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Clock className="w-5 h-5 text-gray-600" />;
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      rascunho: 'Rascunho',
      enviado_para_gestao: 'Enviado para Gestão',
      aprovado: 'Aprovado',
      devolvido: 'Devolvido',
      pago: 'Pago',
      cancelado: 'Cancelado',
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    const cores: Record<string, string> = {
      rascunho: 'bg-gray-100 text-gray-800',
      enviado_para_gestao: 'bg-blue-100 text-blue-800',
      aprovado: 'bg-yellow-100 text-yellow-800',
      devolvido: 'bg-red-100 text-red-800',
      pago: 'bg-green-100 text-green-800',
      cancelado: 'bg-gray-100 text-gray-600',
    };
    return cores[status] || 'bg-gray-100 text-gray-800';
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  async function executarAcaoEmLote() {
    if (!acaoEmLote || selecionados.size === 0) return;

    try {
      setProcessando(true);

      const novoStatus = acaoEmLote === 'aprovar' ? 'aprovado' : 'devolvido';

      const { error } = await supabase
        .from('fechamentos_prestador')
        .update({
          status: novoStatus,
          observacoes_gestor: observacoes || null,
          atualizado_em: new Date().toISOString(),
        })
        .in('id', Array.from(selecionados));

      if (error) {
        alert('Erro ao processar: ' + error.message);
        return;
      }

      // Recarregar
      setSelecionados(new Set());
      setModalAberta(false);
      setObservacoes('');
      setAcaoEmLote(null);
      carregarFechamentos();

      alert(`${selecionados.size} fechamento(s) ${acaoEmLote === 'aprovar' ? 'aprovado(s)' : 'devolvido(s)'}!`);
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Cabeçalho */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Fechamentos de Prestadores</h1>
          <p className="text-gray-600">Gerencia e acompanhamento de todos os fechamentos</p>
        </div>

        {/* Filtros e Ações em Lote */}
        <div className="bg-white rounded-lg shadow mb-6 p-6">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">Filtrar por Status</label>
              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
                className="w-full md:w-64 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todos os Status</option>
                <option value="rascunho">Rascunho</option>
                <option value="enviado_para_gestao">Enviado para Gestão</option>
                <option value="aprovado">Aprovado</option>
                <option value="devolvido">Devolvido</option>
                <option value="pago">Pago</option>
              </select>
            </div>

            {/* Ações em Lote */}
            {selecionados.size > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setAcaoEmLote('aprovar');
                    setModalAberta(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                >
                  <CheckCheck className="w-4 h-4" />
                  Aprovar ({selecionados.size})
                </button>
                <button
                  onClick={() => {
                    setAcaoEmLote('devolver');
                    setModalAberta(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                >
                  <AlertCircle className="w-4 h-4" />
                  Devolver ({selecionados.size})
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tabela */}
        {carregando ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Carregando fechamentos...</p>
          </div>
        ) : fechamentos.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-600 mb-4">Nenhum fechamento encontrado</p>
            <Link href="/painel-gestao" className="text-blue-600 hover:text-blue-800">
              Voltar ao painel
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selecionados.size === fechamentos.length && fechamentos.length > 0}
                        onChange={(e) => selecionarTodos(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Prestador</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Período</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">PIX</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">NFS-e</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Valor Líquido</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {fechamentos.map((fechamento) => (
                    <tr key={fechamento.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selecionados.has(fechamento.id)}
                          onChange={() => toggleSelecionado(fechamento.id)}
                          className="w-4 h-4 rounded border-gray-300"
                        />
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {fechamento.contratos_prestador?.prestadores_servico?.nome_completo || 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {formatDate(fechamento.data_inicio)} a {formatDate(fechamento.data_fim)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(fechamento.status)}
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(fechamento.status)}`}>
                            {getStatusLabel(fechamento.status)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {fechamento.pix_status ? (
                          <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                            {fechamento.pix_status}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {fechamento.nfse_status ? (
                          <span className="inline-block px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                            {fechamento.nfse_status}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900 text-right">
                        {formatCurrency(fechamento.valor_liquido)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Link
                            href={`/painel-gestao/fechamentos/${fechamento.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition text-sm"
                          >
                            <Eye className="w-4 h-4" />
                            Ver
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Resumo */}
            <div className="bg-gray-50 px-6 py-4 border-t flex justify-between items-center text-sm text-gray-700">
              <span>Total: {fechamentos.length} fechamento(s)</span>
              <span>
                Valor total:{' '}
                <span className="font-semibold">
                  {formatCurrency(fechamentos.reduce((sum, f) => sum + f.valor_liquido, 0))}
                </span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Confirmação */}
      {modalAberta && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {acaoEmLote === 'aprovar' ? 'Aprovar Fechamentos?' : 'Devolver Fechamentos?'}
            </h2>

            <p className="text-gray-600 mb-6">
              Você está prestes a {acaoEmLote === 'aprovar' ? 'aprovar' : 'devolver'} {selecionados.size}{' '}
              fechamento(s). Esta ação não pode ser desfeita.
            </p>

            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder={
                acaoEmLote === 'devolver'
                  ? 'Motivo da devolução (obrigatório)...'
                  : 'Observações adicionais (opcional)...'
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-6 h-24 resize-none"
              required={acaoEmLote === 'devolver'}
            />

            <div className="flex gap-4">
              <button
                onClick={() => {
                  setModalAberta(false);
                  setAcaoEmLote(null);
                  setObservacoes('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={executarAcaoEmLote}
                disabled={processando || (acaoEmLote === 'devolver' && !observacoes.trim())}
                className={`flex-1 px-4 py-2 rounded-lg text-white font-medium transition ${
                  acaoEmLote === 'aprovar'
                    ? 'bg-green-600 hover:bg-green-700 disabled:bg-gray-400'
                    : 'bg-red-600 hover:bg-red-700 disabled:bg-gray-400'
                } disabled:cursor-not-allowed`}
              >
                {processando ? 'Processando...' : acaoEmLote === 'aprovar' ? 'Aprovar' : 'Devolver'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
