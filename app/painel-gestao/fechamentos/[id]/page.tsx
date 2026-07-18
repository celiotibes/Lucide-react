'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { ArrowLeft, Edit, Download, Send, X } from 'lucide-react';

interface FechamentoPrestador {
  id: string;
  contrato_id: string;
  data_inicio: string;
  data_fim: string;
  frequencia: string;
  status: 'rascunho' | 'enviado_para_gestao' | 'aprovado' | 'devolvido' | 'pago' | 'cancelado';
  total_proventos: number;
  total_deducoes: number;
  valor_liquido: number;
  valor_diarias: number;
  valor_horas_adicionais: number;
  valor_deslocamentos: number;
  valor_kits: number;
  valor_combustivel: number;
  valor_emergencias: number;
  valor_adicionais_outros: number;
  valor_adiantamentos_descontados: number;
  valor_parcelas_descontadas: number;
  pix_status?: string;
  pix_confirmado_em?: string;
  nfse_status?: string;
  nfse_protocolo?: string;
  observacoes_gestor?: string;
  criado_em: string;
  atualizado_em: string;
  contratos_prestador?: {
    prestadores_servico?: {
      nome_completo: string;
      categoria: string;
    };
  };
}

interface ItemFechamento {
  id: string;
  data: string;
  tipo_item: string;
  descricao: string;
  quantidade?: number;
  valor_unitario?: number;
  valor_total: number;
  residencial_id?: string;
  observacoes?: string;
}

export default function PaginaDetalhesFechamento({ params }: any) {
  const router = useRouter();
  const [fechamento, setFechamento] = useState<FechamentoPrestador | null>(null);
  const [itens, setItens] = useState<ItemFechamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState(false);
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);

  const supabase = createClient();
  const id = params?.id;

  useEffect(() => {
    if (id) {
      carregarDados();
    }
  }, [id]);

  async function carregarDados() {
    try {
      setCarregando(true);

      // Buscar fechamento
      const { data: fechamentoData, error: erroFechamento } = await supabase
        .from('fechamentos_prestador')
        .select(
          `
          *,
          contratos_prestador (
            prestadores_servico (nome_completo, categoria)
          )
        `
        )
        .eq('id', params.id)
        .single();

      if (erroFechamento) {
        setErroCarregamento('Fechamento não encontrado');
        return;
      }

      setFechamento(fechamentoData);

      // Buscar itens do fechamento
      const { data: itensData, error: erroItens } = await supabase
        .from('fechamento_itens_prestador')
        .select('*')
        .eq('fechamento_id', params.id)
        .order('data', { ascending: true });

      if (!erroItens) {
        setItens(itensData || []);
      }
    } catch (erro) {
      console.error('Erro ao carregar dados:', erro);
      setErroCarregamento('Erro ao carregar fechamento');
    } finally {
      setCarregando(false);
    }
  }

  const getStatusBadge = (status: string) => {
    const config: Record<string, { bg: string; text: string; label: string }> = {
      rascunho: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Rascunho' },
      enviado_para_gestao: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Enviado para Gestão' },
      aprovado: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Aprovado' },
      devolvido: { bg: 'bg-red-100', text: 'text-red-800', label: 'Devolvido' },
      pago: { bg: 'bg-green-100', text: 'text-green-800', label: 'Pago' },
      cancelado: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Cancelado' },
    };

    const cor = config[status] || config.rascunho;
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${cor.bg} ${cor.text}`}>
        {cor.label}
      </span>
    );
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (!value) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR');
  };

  if (carregando) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando fechamento...</p>
        </div>
      </div>
    );
  }

  if (erroCarregamento || !fechamento) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <Link href="/painel-gestao/fechamentos" className="flex items-center text-blue-600 hover:text-blue-800 mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar para Fechamentos
          </Link>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-800">{erroCarregamento}</p>
          </div>
        </div>
      </div>
    );
  }

  const prestador = fechamento.contratos_prestador?.prestadores_servico;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-5xl mx-auto px-4">
        {/* Cabeçalho */}
        <Link href="/painel-gestao/fechamentos" className="flex items-center text-blue-600 hover:text-blue-800 mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar para Fechamentos
        </Link>

        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Fechamento de {prestador?.nome_completo}
              </h1>
              <p className="text-gray-600">
                {formatDate(fechamento.data_inicio)} a {formatDate(fechamento.data_fim)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {getStatusBadge(fechamento.status)}
              {fechamento.status === 'rascunho' && (
                <button
                  onClick={() => setEditando(!editando)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Edit className="w-4 h-4" />
                  Editar
                </button>
              )}
            </div>
          </div>

          {/* Informações Básicas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 pb-6 border-b">
            <div>
              <p className="text-sm text-gray-600 mb-1">Frequência</p>
              <p className="font-semibold capitalize">{fechamento.frequencia}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Categoria</p>
              <p className="font-semibold capitalize">{prestador?.categoria}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Criado em</p>
              <p className="font-semibold text-sm">{formatDate(fechamento.criado_em)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Última atualização</p>
              <p className="font-semibold text-sm">{formatDate(fechamento.atualizado_em)}</p>
            </div>
          </div>

          {/* Status de Pagamento e Fiscal */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-6 border-b">
            <div>
              <p className="text-sm text-gray-600 mb-1">Status PIX</p>
              <p className="font-semibold text-sm">
                {fechamento.pix_status ? (
                  <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                    {fechamento.pix_status}
                  </span>
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Status NFS-e</p>
              <p className="font-semibold text-sm">
                {fechamento.nfse_status ? (
                  <span className="inline-block px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                    {fechamento.nfse_status}
                  </span>
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </p>
            </div>
            {fechamento.pix_confirmado_em && (
              <div>
                <p className="text-sm text-gray-600 mb-1">PIX Confirmado em</p>
                <p className="font-semibold text-sm">{formatDate(fechamento.pix_confirmado_em)}</p>
              </div>
            )}
            {fechamento.nfse_protocolo && (
              <div>
                <p className="text-sm text-gray-600 mb-1">Protocolo NFS-e</p>
                <p className="font-semibold text-sm font-mono text-xs">{fechamento.nfse_protocolo}</p>
              </div>
            )}
          </div>
        </div>

        {/* Detalhamento Linha-por-Linha */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-6">
          <div className="px-8 py-6 border-b bg-gray-50">
            <h2 className="text-2xl font-bold text-gray-900">Itens do Fechamento</h2>
            <p className="text-gray-600 text-sm mt-1">{itens.length} item(ns)</p>
          </div>

          {itens.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Data</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Tipo</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Descrição</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Quantidade</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Valor Unit.</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {itens.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 text-sm text-gray-900">{formatDate(item.data)}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium capitalize">
                          {item.tipo_item}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">{item.descricao || '-'}</td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900">
                        {item.quantidade || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900">
                        {item.valor_unitario ? formatCurrency(item.valor_unitario) : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-semibold text-gray-900">
                        {formatCurrency(item.valor_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-8 py-12 text-center text-gray-500">
              <p>Nenhum item registrado neste fechamento</p>
            </div>
          )}
        </div>

        {/* Resumo Financeiro */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Proventos */}
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Proventos</h3>

            <div className="space-y-4 pb-6 border-b">
              {fechamento.valor_diarias > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Diárias</span>
                  <span className="font-semibold">{formatCurrency(fechamento.valor_diarias)}</span>
                </div>
              )}
              {fechamento.valor_horas_adicionais > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Horas Adicionais</span>
                  <span className="font-semibold">{formatCurrency(fechamento.valor_horas_adicionais)}</span>
                </div>
              )}
              {fechamento.valor_deslocamentos > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Deslocamentos</span>
                  <span className="font-semibold">{formatCurrency(fechamento.valor_deslocamentos)}</span>
                </div>
              )}
              {fechamento.valor_kits > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Kits Airbnb</span>
                  <span className="font-semibold">{formatCurrency(fechamento.valor_kits)}</span>
                </div>
              )}
              {fechamento.valor_combustivel > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Combustível</span>
                  <span className="font-semibold">{formatCurrency(fechamento.valor_combustivel)}</span>
                </div>
              )}
              {fechamento.valor_emergencias > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Emergências</span>
                  <span className="font-semibold">{formatCurrency(fechamento.valor_emergencias)}</span>
                </div>
              )}
              {fechamento.valor_adicionais_outros > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Outros Adicionais</span>
                  <span className="font-semibold">{formatCurrency(fechamento.valor_adicionais_outros)}</span>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center text-lg font-bold text-gray-900 pt-6">
              <span>Total Proventos</span>
              <span className="text-green-600">{formatCurrency(fechamento.total_proventos)}</span>
            </div>
          </div>

          {/* Deduções */}
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Deduções</h3>

            <div className="space-y-4 pb-6 border-b">
              {fechamento.valor_adiantamentos_descontados > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Adiantamentos Descontados</span>
                  <span className="font-semibold">-{formatCurrency(fechamento.valor_adiantamentos_descontados)}</span>
                </div>
              )}
              {fechamento.valor_parcelas_descontadas > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Parcelas Descontadas</span>
                  <span className="font-semibold">-{formatCurrency(fechamento.valor_parcelas_descontadas)}</span>
                </div>
              )}
              {fechamento.total_deducoes === 0 && (
                <div className="flex justify-between items-center text-gray-500">
                  <span>Sem deduções</span>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center text-lg font-bold text-gray-900 pt-6">
              <span>Total Deduções</span>
              <span className="text-red-600">-{formatCurrency(fechamento.total_deducoes)}</span>
            </div>
          </div>
        </div>

        {/* Resumo Final */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-lg shadow-lg p-8 text-white mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <p className="text-blue-100 text-sm mb-2">Total de Proventos</p>
              <p className="text-3xl font-bold">{formatCurrency(fechamento.total_proventos)}</p>
            </div>
            <div>
              <p className="text-blue-100 text-sm mb-2">Total de Deduções</p>
              <p className="text-3xl font-bold">-{formatCurrency(fechamento.total_deducoes)}</p>
            </div>
            <div>
              <p className="text-blue-100 text-sm mb-2">Valor Líquido</p>
              <p className="text-4xl font-bold">{formatCurrency(fechamento.valor_liquido)}</p>
            </div>
          </div>
        </div>

        {/* Observações do Gestor */}
        {fechamento.observacoes_gestor && (
          <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Observações do Gestor</h3>
            <p className="text-gray-700 whitespace-pre-wrap">{fechamento.observacoes_gestor}</p>
          </div>
        )}

        {/* Ações */}
        <div className="flex gap-4 justify-center">
          <button className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
            <Download className="w-5 h-5" />
            Baixar PDF
          </button>

          {(fechamento.status === 'aprovado' || fechamento.status === 'enviado_para_gestao') && (
            <button className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
              <Send className="w-5 h-5" />
              Enviar Pagamento
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
