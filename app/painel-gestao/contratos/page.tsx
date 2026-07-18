'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Upload, Filter, Search, Eye, FileText, ChevronRight } from 'lucide-react';

interface Contrato {
  id: string;
  imovel_id: string;
  numero_contrato: string | null;
  valor_aluguel: number | null;
  status: string;
  data_inicio: string | null;
  data_fim: string | null;
  confianca_extracao: number | null;
  criado_em: string;
}

export default function PaginaContratos() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const carregarContratos = async () => {
      try {
        setCarregando(true);
        const params = new URLSearchParams();
        if (filtroStatus) params.append('status', filtroStatus);
        if (busca) params.append('busca', busca);

        const res = await fetch(`/api/contratos/listar?${params.toString()}`);
        if (!res.ok) {
          throw new Error('Erro ao carregar contratos');
        }
        const data = await res.json();
        setContratos(data.contratos || []);
      } catch (err) {
        setErro(err instanceof Error ? err.message : 'Erro desconhecido');
      } finally {
        setCarregando(false);
      }
    };

    const timer = setTimeout(() => carregarContratos(), 300);
    return () => clearTimeout(timer);
  }, [filtroStatus, busca]);

  const obterCoresStatus = (status: string) => {
    switch (status) {
      case 'ativo':
        return 'bg-green-100 text-green-800';
      case 'rascunho':
        return 'bg-yellow-100 text-yellow-800';
      case 'expirado':
        return 'bg-gray-100 text-gray-800';
      case 'rescindido':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  const obterCorConfianca = (confianca: number | null) => {
    if (!confianca) return 'text-gray-600';
    if (confianca >= 0.85) return 'text-green-600';
    if (confianca >= 0.7) return 'text-yellow-600';
    return 'text-red-600';
  };

  const contratosFiltrados = contratos.filter((contrato) => {
    if (!busca) return true;
    const termo = busca.toLowerCase();
    return (
      contrato.numero_contrato?.toLowerCase().includes(termo) ||
      contrato.id.toLowerCase().includes(termo) ||
      contrato.imovel_id.toLowerCase().includes(termo)
    );
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-6">
        {/* Cabeçalho */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Contratos de Aluguel</h1>
              <p className="text-gray-600 mt-2">
                Gerenciamento de contratos de locação com análise de IA
              </p>
            </div>
            <Link
              href="/painel-gestao/contratos/upload"
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Novo Contrato
            </Link>
          </div>
        </div>

        {/* Filtros e Busca */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Busca */}
            <div className="relative">
              <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por número, ID, imóvel..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Filtro Status */}
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-400" />
              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todos os Status</option>
                <option value="ativo">Ativo</option>
                <option value="rascunho">Rascunho</option>
                <option value="expirado">Expirado</option>
                <option value="rescindido">Rescindido</option>
              </select>
            </div>

            {/* Info */}
            <div className="flex items-center justify-end">
              <p className="text-sm text-gray-600">
                {contratosFiltrados.length} contrato{contratosFiltrados.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>

        {/* Erro */}
        {erro && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-900">{erro}</p>
          </div>
        )}

        {/* Carregando */}
        {carregando && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Carregando contratos...</p>
          </div>
        )}

        {/* Lista de Contratos */}
        {!carregando && contratosFiltrados.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">
              {contratos.length === 0 ? 'Nenhum contrato encontrado' : 'Nenhum resultado para sua busca'}
            </p>
            {contratos.length === 0 && (
              <Link
                href="/painel-gestao/contratos/upload"
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Enviar primeiro contrato →
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {contratosFiltrados.map((contrato) => (
              <Link
                key={contrato.id}
                href={`/painel-gestao/contratos/${contrato.id}/validar`}
              >
                <div className="bg-white rounded-lg shadow hover:shadow-md transition p-4 cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {contrato.numero_contrato || `Contrato #${contrato.id.slice(0, 8)}`}
                        </h3>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${obterCoresStatus(contrato.status)}`}
                        >
                          {contrato.status}
                        </span>
                        {contrato.confianca_extracao && (
                          <span className={`text-sm font-medium ${obterCorConfianca(contrato.confianca_extracao)}`}>
                            {Math.round(contrato.confianca_extracao * 100)}% confiança
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-4 gap-4 text-sm text-gray-600">
                        <div>
                          <p className="text-xs text-gray-500">Imóvel</p>
                          <p className="font-medium">{contrato.imovel_id}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Valor do Aluguel</p>
                          <p className="font-medium">
                            {contrato.valor_aluguel
                              ? `R$ ${contrato.valor_aluguel.toFixed(2)}`
                              : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Vigência</p>
                          <p className="font-medium">
                            {contrato.data_inicio
                              ? new Date(contrato.data_inicio).toLocaleDateString('pt-BR')
                              : '—'}
                            {contrato.data_fim && (
                              <>
                                {' a '}
                                {new Date(contrato.data_fim).toLocaleDateString('pt-BR')}
                              </>
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Criado em</p>
                          <p className="font-medium">
                            {new Date(contrato.criado_em).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="ml-4 flex items-center">
                      <Eye className="w-5 h-5 text-gray-400" />
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
