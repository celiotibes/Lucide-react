'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { ChevronLeft, Clock, MapPin, AlertCircle, DollarSign, ClipboardList } from 'lucide-react';

interface OrdemServico {
  id: string;
  categoria: string;
  descricao: string;
  status: string;
  urgencia: string;
  prestador_id?: string;
  imovel_id?: string;
  residencial_id?: string;
  data_agendada?: string;
  sla_prazo_em?: string;
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

export default function PaginaOrdemServico({ params }: any) {
  const [ordemServico, setOrdemServico] = useState<OrdemServico | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    carregarOrdemServico();
  }, []);

  async function carregarOrdemServico() {
    try {
      setCarregando(true);

      const { data, error } = await supabase
        .from('ordens_servico')
        .select(
          `
          *,
          imoveis (identificacao),
          residenciais (nome),
          prestadores_servico:prestador_id (nome_completo)
        `
        )
        .eq('id', params.id)
        .single();

      if (error) {
        setErro('Ordem de serviço não encontrada');
        return;
      }

      setOrdemServico(data);
    } catch (err) {
      setErro('Erro ao carregar ordem de serviço');
      console.error(err);
    } finally {
      setCarregando(false);
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (carregando) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Carregando...</p>
          </div>
        </div>
      </div>
    );
  }

  if (erro || !ordemServico) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <Link href="/painel-gestao" className="flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-4">
            <ChevronLeft className="w-4 h-4" />
            Voltar
          </Link>
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600 mb-4">{erro || 'Ordem de serviço não encontrada'}</p>
            <Link href="/painel-gestao" className="text-blue-600 hover:text-blue-800">
              Voltar ao painel
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Cabeçalho */}
        <Link href="/painel-gestao" className="flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-4">
          <ChevronLeft className="w-4 h-4" />
          Voltar
        </Link>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{ordemServico.categoria}</h1>
              <p className="text-gray-600 mb-4">{ordemServico.descricao}</p>
            </div>
            <div className="flex flex-col gap-2">
              <span
                className={`px-4 py-2 rounded-full text-sm font-semibold ${CORES_STATUS[ordemServico.status] || CORES_STATUS.aberto}`}
              >
                {ordemServico.status.toUpperCase()}
              </span>
              <span
                className={`px-4 py-2 rounded-full text-sm font-semibold ${CORES_URGENCIA[ordemServico.urgencia] || CORES_URGENCIA.media}`}
              >
                {ordemServico.urgencia.charAt(0).toUpperCase() + ordemServico.urgencia.slice(1)}
              </span>
            </div>
          </div>

          {/* Detalhes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-6">
            {/* Local */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <MapPin className="w-4 h-4 text-gray-600" />
                <span className="text-sm text-gray-600">Local</span>
              </div>
              <p className="text-lg font-semibold text-gray-900">
                {ordemServico.imoveis?.identificacao ||
                  ordemServico.residenciais?.nome ||
                  'Não especificado'}
              </p>
            </div>

            {/* Prestador */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="w-4 h-4 text-gray-600" />
                <span className="text-sm text-gray-600">Prestador</span>
              </div>
              <p className="text-lg font-semibold text-gray-900">
                {ordemServico.prestadores_servico?.nome_completo || 'Não atribuído'}
              </p>
            </div>

            {/* Data Agendada */}
            {ordemServico.data_agendada && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-gray-600" />
                  <span className="text-sm text-gray-600">Data Agendada</span>
                </div>
                <p className="text-lg font-semibold text-gray-900">
                  {formatDate(ordemServico.data_agendada)}
                </p>
              </div>
            )}

            {/* Criado em */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-gray-600" />
                <span className="text-sm text-gray-600">Criado em</span>
              </div>
              <p className="text-lg font-semibold text-gray-900">
                {formatDate(ordemServico.criado_em)}
              </p>
            </div>
          </div>
        </div>

        {/* Seção de Ações */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card: Gerenciar Apontamentos */}
          <Link href={`/painel-gestao/ordem-servico/${params.id}/apontamentos`}>
            <div className="bg-white rounded-lg shadow hover:shadow-lg transition p-6 cursor-pointer border-l-4 border-blue-600">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <DollarSign className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">Apontamentos e Custos</h3>
                  <p className="text-sm text-gray-600">
                    Associar apontamentos de prestadores e gerenciar custos
                  </p>
                </div>
              </div>
            </div>
          </Link>

          {/* Card: Detalhes Técnicos */}
          <Link href={`/ordens-servico/${params.id}`}>
            <div className="bg-white rounded-lg shadow hover:shadow-lg transition p-6 cursor-pointer border-l-4 border-green-600">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-lg">
                  <ClipboardList className="w-6 h-6 text-green-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">Andamentos</h3>
                  <p className="text-sm text-gray-600">
                    Ver timeline de progresso e comentários
                  </p>
                </div>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
