'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import {
  ChevronLeft,
  Plus,
  Trash2,
  Clock,
  DollarSign,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import {
  associarApontamentoAOS,
  desassociarApontamentoDeOS,
  obterCustosApontamentosOS,
  listarApontamentosDisponiveis,
  associarMultiplosApontamentosAOS,
} from '@/app/actions/integracao/associarApontamentoOS';

interface ApontamentoCusto {
  id: string;
  apontamento_id: string;
  ordem_servico_id: string;
  horas_trabalhadas: number;
  valor_hora_prestador: number;
  valor_total: number;
  valor_deslocamento: number;
  criado_em: string;
  apontamentos_prestador?: {
    data: string;
    descricao_atividades: string;
    contratos_prestador?: {
      prestadores_servico?: {
        nome_completo: string;
      };
    };
  };
}

interface ApontamentoDisponivel {
  id: string;
  data: string;
  horas_trabalhadas: number;
  descricao_atividades: string;
  valor_deslocamento: number;
  contratos_prestador?: {
    prestadores_servico?: {
      nome_completo: string;
      valor_hora_padrao: number;
    };
  };
}

interface OrdemServico {
  id: string;
  categoria: string;
  descricao: string;
  status: string;
  urgencia: string;
  criado_em: string;
}

export default function PaginaApontamentosOS({ params }: { params: { id: string } }) {
  const [ordemServico, setOrdemServico] = useState<OrdemServico | null>(null);
  const [apontamentosCustos, setApontamentosCustos] = useState<ApontamentoCusto[]>([]);
  const [apontamentosDisponiveis, setApontamentosDisponiveis] = useState<ApontamentoDisponivel[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [modalAberta, setModalAberta] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(
    null
  );

  const supabase = createClient();

  useEffect(() => {
    carregarDados();
  }, []);

  async function carregarDados() {
    try {
      setCarregando(true);

      // Buscar ordem de serviço
      const { data: os, error: erroOS } = await supabase
        .from('ordens_servico')
        .select('*')
        .eq('id', params.id)
        .single();

      if (erroOS || !os) {
        setMensagem({ tipo: 'erro', texto: 'Ordem de serviço não encontrada' });
        return;
      }

      setOrdemServico(os);

      // Buscar custos de apontamentos já associados
      const resultCustos = await obterCustosApontamentosOS(params.id);
      if (resultCustos.sucesso) {
        setApontamentosCustos(resultCustos.custos || []);
      }

      // Buscar apontamentos disponíveis para associação
      // Usar data de criação da OS como base (últimos 30 dias)
      const dataInicio = new Date(os.criado_em);
      dataInicio.setDate(dataInicio.getDate() - 30);
      const dataFim = new Date();
      dataFim.setDate(dataFim.getDate() + 7); // 7 dias no futuro

      const resultDisponiveis = await listarApontamentosDisponiveis(
        params.id,
        dataInicio,
        dataFim
      );
      if (resultDisponiveis.sucesso) {
        setApontamentosDisponiveis(resultDisponiveis.apontamentos || []);
      }
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

  async function desassociar(apontamentoId: string) {
    if (!confirm('Desassociar este apontamento?')) return;

    try {
      setProcessando(true);
      const resultado = await desassociarApontamentoDeOS(apontamentoId);

      if (resultado.sucesso) {
        setMensagem({ tipo: 'sucesso', texto: resultado.mensagem });
        carregarDados();
      } else {
        setMensagem({ tipo: 'erro', texto: resultado.erro || 'Erro desconhecido' });
      }
    } finally {
      setProcessando(false);
    }
  }

  async function associarSelecionados() {
    if (selecionados.size === 0) return;

    try {
      setProcessando(true);
      const resultado = await associarMultiplosApontamentosAOS(
        Array.from(selecionados),
        params.id
      );

      if (resultado.sucesso) {
        setMensagem({ tipo: 'sucesso', texto: resultado.mensagem });
        setSelecionados(new Set());
        setModalAberta(false);
        carregarDados();
      } else {
        setMensagem({ tipo: 'erro', texto: resultado.erro || 'Erro desconhecido' });
      }
    } finally {
      setProcessando(false);
    }
  }

  if (carregando) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Carregando...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!ordemServico) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600 mb-4">Ordem de serviço não encontrada</p>
            <Link href="/painel-gestao/ordens-servico" className="text-blue-600 hover:text-blue-800">
              Voltar às ordens de serviço
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const totalCustos = apontamentosCustos.reduce((sum, c) => sum + c.valor_total, 0);
  const totalHoras = apontamentosCustos.reduce((sum, c) => sum + c.horas_trabalhadas, 0);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Cabeçalho */}
        <div className="mb-8">
          <Link
            href={`/painel-gestao/ordem-servico/${params.id}`}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-4"
          >
            <ChevronLeft className="w-4 h-4" />
            Voltar
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Apontamentos da Ordem de Serviço
          </h1>
          <p className="text-gray-600">{ordemServico.categoria} - {ordemServico.descricao}</p>
        </div>

        {/* Mensagens */}
        {mensagem && (
          <div
            className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
              mensagem.tipo === 'sucesso'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {mensagem.tipo === 'sucesso' ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
            )}
            {mensagem.texto}
          </div>
        )}

        {/* Resumo de Custos */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg shadow text-white p-6 mb-8">
          <div className="grid grid-cols-3 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4" />
                <span className="text-blue-100">Total de Horas</span>
              </div>
              <p className="text-3xl font-bold">{totalHoras.toFixed(2)}h</p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Plus className="w-4 h-4" />
                <span className="text-blue-100">Apontamentos</span>
              </div>
              <p className="text-3xl font-bold">{apontamentosCustos.length}</p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4" />
                <span className="text-blue-100">Total de Custos</span>
              </div>
              <p className="text-3xl font-bold">{formatCurrency(totalCustos)}</p>
            </div>
          </div>
        </div>

        {/* Seção: Apontamentos Associados */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="border-b px-6 py-4">
            <h2 className="text-xl font-bold text-gray-900">Apontamentos Associados</h2>
          </div>

          {apontamentosCustos.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-600">Nenhum apontamento associado ainda</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Data
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Prestador
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Atividade
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      Horas
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      V. Unitário
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      Custo Total
                    </th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {apontamentosCustos.map((custo) => (
                    <tr key={custo.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {formatDate(custo.apontamentos_prestador?.data || '')}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {custo.apontamentos_prestador?.contratos_prestador?.prestadores_servico
                          ?.nome_completo || 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {custo.apontamentos_prestador?.descricao_atividades || 'Serviço'}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900">
                        {custo.horas_trabalhadas.toFixed(2)}h
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900">
                        {formatCurrency(custo.valor_hora_prestador)}
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-semibold text-gray-900">
                        {formatCurrency(custo.valor_total)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => desassociar(custo.apontamento_id)}
                          disabled={processando}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition text-sm disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Seção: Apontamentos Disponíveis para Associação */}
        {apontamentosDisponiveis.length > 0 && (
          <div className="bg-white rounded-lg shadow">
            <div className="border-b px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900">
                Apontamentos Disponíveis ({apontamentosDisponiveis.length})
              </h2>
              {selecionados.size > 0 && (
                <button
                  onClick={() => setModalAberta(true)}
                  disabled={processando}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  Associar {selecionados.size} Selecionado(s)
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selecionados.size === apontamentosDisponiveis.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelecionados(new Set(apontamentosDisponiveis.map((a) => a.id)));
                          } else {
                            setSelecionados(new Set());
                          }
                        }}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Data
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Prestador
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Descrição
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      Horas
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      V/Hora
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {apontamentosDisponiveis.map((apontamento) => {
                    const valorHora =
                      apontamento.contratos_prestador?.prestadores_servico?.valor_hora_padrao || 0;
                    const valorTotal = apontamento.horas_trabalhadas * valorHora + apontamento.valor_deslocamento;

                    return (
                      <tr key={apontamento.id} className="hover:bg-gray-50 transition">
                        <td className="px-6 py-4">
                          <input
                            type="checkbox"
                            checked={selecionados.has(apontamento.id)}
                            onChange={() => toggleSelecionado(apontamento.id)}
                            className="w-4 h-4 rounded border-gray-300"
                          />
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {formatDate(apontamento.data)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {apontamento.contratos_prestador?.prestadores_servico?.nome_completo ||
                            'N/A'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {apontamento.descricao_atividades || 'Serviço'}
                        </td>
                        <td className="px-6 py-4 text-sm text-right text-gray-900">
                          {apontamento.horas_trabalhadas.toFixed(2)}h
                        </td>
                        <td className="px-6 py-4 text-sm text-right text-gray-900">
                          {formatCurrency(valorHora)}
                        </td>
                        <td className="px-6 py-4 text-sm text-right font-semibold text-gray-900">
                          {formatCurrency(valorTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {apontamentosDisponiveis.length === 0 && apontamentosCustos.length > 0 && (
          <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 text-center">
            <p className="text-blue-800">
              Nenhum apontamento disponível para associação neste período.
            </p>
          </div>
        )}
      </div>

      {/* Modal de Confirmação */}
      {modalAberta && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Confirmar Associação</h2>

            <p className="text-gray-600 mb-6">
              Você está prestes a associar {selecionados.size} apontamento(s) a esta ordem de serviço.
              Isto vai criar registros de custo automaticamente.
            </p>

            <div className="flex gap-4">
              <button
                onClick={() => {
                  setModalAberta(false);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={associarSelecionados}
                disabled={processando}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                {processando ? 'Processando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
