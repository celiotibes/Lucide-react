/**
 * Componente Dashboard de Fila de Revisão
 *
 * Exibe:
 * - Contagem de itens pendentes por tipo
 * - Lista dos itens mais recentes
 * - Filtros por status/tipo
 * - Links para revisão detalhada
 */

import React, { useState, useEffect } from 'react';
import type { ItemRevisao, EstatisticasRevisao } from '../types/revisao.js';

export interface FilaRevisaoDashboardProps {
  onItemClick?: (item: ItemRevisao) => void;
  compact?: boolean;
}

/**
 * Dashboard compacto mostrando resumo da fila de revisão
 */
export const FilaRevisaoDashboard: React.FC<FilaRevisaoDashboardProps> = ({
  onItemClick,
  compact = false
}) => {
  const [stats, setStats] = useState<EstatisticasRevisao | null>(null);
  const [itens, setItens] = useState<ItemRevisao[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>('pendente');

  useEffect(() => {
    const carregar = async () => {
      try {
        setLoading(true);

        // Carregar estatísticas
        const statsRes = await fetch('/api/revisao-ia/estatisticas');
        const statsData = await statsRes.json();
        if (statsData.sucesso) {
          setStats(statsData.estatisticas);
        }

        // Carregar itens
        const itensRes = await fetch(`/api/revisao-ia/fila?limit=10&status=${filtroStatus}`);
        const itensData = await itensRes.json();
        if (itensData.sucesso) {
          setItens(itensData.itens);
        }
      } catch (erro) {
        console.error('Erro ao carregar fila', erro);
      } finally {
        setLoading(false);
      }
    };

    carregar();
  }, [filtroStatus]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="h-8 bg-gray-200 rounded w-full"></div>
        </div>
      </div>
    );
  }

  const temPendentes = (stats?.totalPendente || 0) > 0;

  if (compact && !temPendentes) {
    return null; // Não mostrar se não há pendências em modo compacto
  }

  return (
    <div className={`bg-white rounded-lg shadow ${compact ? 'p-4' : 'p-6'}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className={`font-semibold ${compact ? 'text-base' : 'text-lg'}`}>
            Fila de Revisão
          </h3>
          {temPendentes && (
            <span className="bg-red-100 text-red-800 text-xs font-bold px-2.5 py-1 rounded-full">
              {stats?.totalPendente || 0}
            </span>
          )}
        </div>
      </div>

      {/* Stats em cards */}
      {!compact && stats && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
            <p className="text-yellow-900 text-sm font-medium">Pendente</p>
            <p className="text-2xl font-bold text-yellow-600">{stats.totalPendente}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <p className="text-blue-900 text-sm font-medium">Revisado</p>
            <p className="text-2xl font-bold text-blue-600">{stats.totalRevisado}</p>
          </div>
          <div className="bg-red-50 rounded-lg p-4 border border-red-200">
            <p className="text-red-900 text-sm font-medium">Rejeitado</p>
            <p className="text-2xl font-bold text-red-600">{stats.totalRejeitado}</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      {!compact && (
        <div className="mb-4 flex gap-2">
          {(['pendente', 'revisado', 'rejeitado'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFiltroStatus(status)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                filtroStatus === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* Lista de itens */}
      {itens.length > 0 ? (
        <div className="space-y-3">
          {itens.map((item) => (
            <div
              key={item.id}
              onClick={() => onItemClick?.(item)}
              className={`border rounded-lg p-4 ${
                onItemClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''
              } ${
                item.status === 'pendente'
                  ? 'border-yellow-200 bg-yellow-50'
                  : item.status === 'autorizado'
                  ? 'border-green-200 bg-green-50'
                  : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold px-2 py-1 rounded-full bg-opacity-50 bg-blue-100 text-blue-800">
                      {item.tipo}
                    </span>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                      item.status === 'pendente'
                        ? 'bg-yellow-100 text-yellow-800'
                        : item.status === 'autorizado'
                        ? 'bg-green-100 text-green-800'
                        : item.status === 'revisado'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {item.status}
                    </span>
                  </div>

                  {item.descricao && (
                    <p className="text-sm text-gray-700">{item.descricao}</p>
                  )}

                  <p className="text-xs text-gray-500 mt-2">
                    Doc: {item.documentoId.substring(0, 20)}...
                  </p>
                </div>

                <div className="text-right ml-4">
                  <p className="text-xs text-gray-500">
                    {new Date(item.dataCriacao).toLocaleDateString('pt-BR')}
                  </p>
                  {item.status === 'pendente' && (
                    <p className="text-xs text-yellow-600 font-medium mt-1">
                      Aguardando...
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          {filtroStatus === 'pendente' ? (
            <div>
              <p className="text-lg font-medium mb-1">Nenhuma revisão pendente</p>
              <p className="text-sm">Todos os relatórios estão atualizados</p>
            </div>
          ) : (
            <p>Nenhum item com status "{filtroStatus}"</p>
          )}
        </div>
      )}

      {/* Link para fila completa */}
      {!compact && itens.length > 0 && (
        <div className="mt-4 pt-4 border-t">
          <a
            href="/revisao-ia/fila"
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Ver fila completa →
          </a>
        </div>
      )}
    </div>
  );
};

export default FilaRevisaoDashboard;
