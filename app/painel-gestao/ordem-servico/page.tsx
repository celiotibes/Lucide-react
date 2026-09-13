'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { AlertCircle, Clock, MapPin, Eye, Eye as EyeIcon } from 'lucide-react';

interface OrdemServico {
  id: string;
  categoria: string;
  descricao: string;
  status: string;
  urgencia: string;
  criado_em: string;
  imoveis?: {
    identificacao: string;
  };
  residenciais?: {
    nome: string;
  };
  prestadores_servico?: {
    nome_completo: string;
  };
}

const CORES_URGENCIA: Record<string, string> = {
  baixa: 'bg-blue-100 text-blue-800',
  media: 'bg-yellow-100 text-yellow-800',
  alta: 'bg-orange-100 text-orange-800',
  urgente: 'bg-red-100 text-red-800',
};

const CORES_STATUS: Record<string, string> = {
  aberto: 'bg-gray-100 text-gray-800',
  alocado: 'bg-blue-100 text-blue-800',
  em_execucao: 'bg-yellow-100 text-yellow-800',
  concluido: 'bg-green-100 text-green-800',
  cancelado: 'bg-red-100 text-red-800',
};

export default function PaginaOrdensServico() {
  const [ordensServico, setOrdensServico] = useState<OrdemServico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>('');
  const [filtroUrgencia, setFiltroUrgencia] = useState<string>('');

  const supabase = createClient();

  useEffect(() => {
    carregarOrdensServico();
  }, [filtroStatus, filtroUrgencia]);

  async function carregarOrdensServico() {
    try {
      setCarregando(true);

      let query = supabase
        .from('ordens_servico')
        .select(
          `
          *,
          imoveis (identificacao),
          residenciais (nome),
          prestadores_servico:prestador_id (nome_completo)
        `
        )
        .order('criado_em', { ascending: false });

      if (filtroStatus) {
        query = query.eq('status', filtroStatus);
      }

      if (filtroUrgencia) {
        query = query.eq('urgencia', filtroUrgencia);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Erro ao carregar ordens:', error);
        return;
      }

      setOrdensServico(data || []);
    } finally {
      setCarregando(false);
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Cabeçalho */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Ordens de Serviço</h1>
          <p className="text-gray-600">Gerenciamento de ordens de serviço e associação de custos</p>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-lg shadow mb-6 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Filtrar por Status</label>
              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todos os Status</option>
                <option value="aberto">Aberto</option>
                <option value="alocado">Alocado</option>
                <option value="em_execucao">Em Execução</option>
                <option value="concluido">Concluído</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Filtrar por Urgência</label>
              <select
                value={filtroUrgencia}
                onChange={(e) => setFiltroUrgencia(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todas as Urgências</option>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tabela */}
        {carregando ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Carregando ordens de serviço...</p>
          </div>
        ) : ordensServico.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-600 mb-4">Nenhuma ordem de serviço encontrada</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Categoria
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Local
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Prestador
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Urgência
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Criado em
                    </th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {ordensServico.map((os) => (
                    <tr key={os.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {os.categoria}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-4 h-4 text-gray-400" />
                          {os.imoveis?.identificacao || os.residenciais?.nome || 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {os.prestadores_servico?.nome_completo || 'Não atribuído'}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${CORES_STATUS[os.status]}`}
                        >
                          {os.status.charAt(0).toUpperCase() + os.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${CORES_URGENCIA[os.urgencia]}`}
                        >
                          {os.urgencia.charAt(0).toUpperCase() + os.urgencia.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4 text-gray-400" />
                          {formatDate(os.criado_em)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Link
                            href={`/painel-gestao/ordem-servico/${os.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition text-sm"
                          >
                            <EyeIcon className="w-4 h-4" />
                            Detalhes
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
              <span>Total: {ordensServico.length} ordem(ns) de serviço</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
