/**
 * Componente de Revisão de Importação
 *
 * Funcionalidades:
 * - Tabela com todas as linhas
 * - Filtros por status
 * - Ações por linha (aprovar, rejeitar, ver duplicata)
 * - Ações em bulk (aprovar tudo, rejeitar tudo)
 * - Score de duplicata
 * - Paginação
 * - Navegação por teclado
 * - Loading states
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { ImportReviewProps, FiltrosRevisao, Paginacao } from './types.js';
import type { LinhaImportacao } from './types.js';
import {
  obterLinhas,
  aprovarLinha,
  rejeitarLinha,
  obterDetalheDuplicata,
  aprovarTodos,
  rejeitarTodos,
  ApiError,
} from './api.js';
import { LinhaStatus } from './types.js';

/**
 * Interface for duplicata details
 */
interface DuplicataDetails {
  score: number;
  linha_original: {
    dados_brutos: string;
  };
  linha_duplicada: {
    dados_brutos: string;
  };
}

/**
 * Status options para filtro
 */
const STATUS_OPTIONS = Object.values(LinhaStatus);

/**
 * Obter cor para status
 */
function obterCorStatus(status: LinhaStatus) {
  const coresStatus: Record<LinhaStatus, string> = {
    [LinhaStatus.PENDENTE]: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    [LinhaStatus.DUPLICATA_SUSPEITA]: 'bg-orange-50 text-orange-700 border-orange-200',
    [LinhaStatus.VALIDADA]: 'bg-green-50 text-green-700 border-green-200',
    [LinhaStatus.PROCESSADA]: 'bg-green-50 text-green-700 border-green-200',
    [LinhaStatus.REJEITADA]: 'bg-red-50 text-red-700 border-red-200',
    [LinhaStatus.ERRO]: 'bg-red-50 text-red-700 border-red-200',
    [LinhaStatus.IGNORADA]: 'bg-gray-50 text-gray-700 border-gray-200',
  };
  return coresStatus[status];
}

/**
 * Componente de Revisão
 */
export const ImportReview: React.FC<ImportReviewProps> = ({
  loteId,
  onComplete,
  onCancel,
}) => {
  const [linhas, setLinhas] = useState<LinhaImportacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paginacao, setPaginacao] = useState<Paginacao>({
    pagina: 1,
    limite: 10,
    total: 0,
  });

  const [filtros, setFiltros] = useState<FiltrosRevisao>({
    status: [],
    comDuplicata: false,
  });

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedLinhas, setSelectedLinhas] = useState<Set<string>>(new Set());
  const [showDuplicataDetails, setShowDuplicataDetails] = useState<string | null>(null);
  const [duplicataDetails, setDuplicataDetails] = useState<DuplicataDetails | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  /**
   * Carregar linhas
   */
  const carregarLinhas = useCallback(async () => {
    try {
      setLoading(true);
      const resultado = await obterLinhas(loteId, {
        pagina: paginacao.pagina,
        limite: paginacao.limite,
        status: filtros.status?.length > 0 ? filtros.status : undefined,
        comDuplicata: filtros.comDuplicata,
      });

      setLinhas(resultado.linhas);
      setPaginacao(resultado.paginacao);
      setError(null);
      setSelectedLinhas(new Set());
    } catch (erro) {
      const mensagem =
        erro instanceof ApiError
          ? erro.message
          : erro instanceof Error
            ? erro.message
            : 'Erro ao carregar linhas';
      setError(mensagem);
    } finally {
      setLoading(false);
    }
  }, [loteId, paginacao.pagina, paginacao.limite, filtros]);

  /**
   * Carregar linhas ao montar ou mudar filtros/paginação
   */
  useEffect(() => {
    carregarLinhas();
  }, [carregarLinhas]);

  /**
   * Togglear seleção de linha
   */
  const toggleSelecionar = (linhaId: string) => {
    const novaSelecao = new Set(selectedLinhas);
    if (novaSelecao.has(linhaId)) {
      novaSelecao.delete(linhaId);
    } else {
      novaSelecao.add(linhaId);
    }
    setSelectedLinhas(novaSelecao);
  };

  /**
   * Selecionar todas as linhas da página
   */
  const selecionarTodas = () => {
    if (selectedLinhas.size === linhas.length) {
      setSelectedLinhas(new Set());
    } else {
      setSelectedLinhas(new Set(linhas.map((l) => l.id)));
    }
  };

  /**
   * Aprovar uma linha
   */
  const handleAprovarLinha = async (linhaId: string) => {
    try {
      setActionLoading(linhaId);
      await aprovarLinha(loteId, linhaId);
      await carregarLinhas();
    } catch (erro) {
      const mensagem =
        erro instanceof ApiError ? erro.message : 'Erro ao aprovar linha';
      setError(mensagem);
    } finally {
      setActionLoading(null);
    }
  };

  /**
   * Rejeitar uma linha
   */
  const handleRejeitarLinha = async (linhaId: string) => {
    if (!rejectReason.trim()) return;

    try {
      setActionLoading(linhaId);
      await rejeitarLinha(loteId, linhaId, rejectReason);
      await carregarLinhas();
      setShowRejectDialog(null);
      setRejectReason('');
    } catch (erro) {
      const mensagem =
        erro instanceof ApiError ? erro.message : 'Erro ao rejeitar linha';
      setError(mensagem);
    } finally {
      setActionLoading(null);
    }
  };

  /**
   * Aprovar todas as linhas
   */
  const handleAprovarTodos = async () => {
    if (!window.confirm('Você tem certeza que deseja aprovar todas as linhas?')) {
      return;
    }

    try {
      setActionLoading('aprovar-todos');
      await aprovarTodos(loteId);
      await carregarLinhas();
      onComplete?.(loteId);
    } catch (erro) {
      const mensagem =
        erro instanceof ApiError ? erro.message : 'Erro ao aprovar todas as linhas';
      setError(mensagem);
    } finally {
      setActionLoading(null);
    }
  };

  /**
   * Rejeitar todas as linhas
   */
  const handleRejeitarTodos = async () => {
    const motivo = window.prompt('Descreva o motivo da rejeição em massa:');
    if (!motivo) return;

    try {
      setActionLoading('rejeitar-todos');
      await rejeitarTodos(loteId, motivo);
      await carregarLinhas();
    } catch (erro) {
      const mensagem =
        erro instanceof ApiError ? erro.message : 'Erro ao rejeitar todas as linhas';
      setError(mensagem);
    } finally {
      setActionLoading(null);
    }
  };

  /**
   * Visualizar detalhes da duplicata
   */
  const handleVerDuplicata = async (linhaId: string) => {
    try {
      setActionLoading(`duplicata-${linhaId}`);
      const detalhes = await obterDetalheDuplicata(loteId, linhaId);
      setDuplicataDetails(detalhes);
      setShowDuplicataDetails(linhaId);
    } catch (erro) {
      const mensagem =
        erro instanceof ApiError ? erro.message : 'Erro ao carregar detalhes da duplicata';
      setError(mensagem);
    } finally {
      setActionLoading(null);
    }
  };

  /**
   * Toggle status no filtro
   */
  const toggleFiltroStatus = (status: LinhaStatus) => {
    const novosFiltros = { ...filtros };
    if (!novosFiltros.status) novosFiltros.status = [];

    const idx = novosFiltros.status.indexOf(status);
    if (idx > -1) {
      novosFiltros.status.splice(idx, 1);
    } else {
      novosFiltros.status.push(status);
    }

    setFiltros(novosFiltros);
    setPaginacao({ ...paginacao, pagina: 1 });
  };

  if (error && !loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="font-semibold text-red-900 mb-1">Erro</h3>
          <p className="text-sm text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Revisão de Importação
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Total de linhas: <span className="font-semibold">{paginacao.total}</span>
            </p>
          </div>
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            aria-label="Cancelar revisão"
          >
            Cancelar
          </button>
        </div>

        {/* Filtros */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-900">Filtrar por Status:</p>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((status) => (
              <button
                key={status}
                onClick={() => toggleFiltroStatus(status as LinhaStatus)}
                className={`px-3 py-1 text-xs font-medium rounded border transition-colors ${
                  filtros.status?.includes(status as LinhaStatus)
                    ? `${obterCorStatus(status as LinhaStatus)} border-current`
                    : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                }`}
                aria-label={`Filtrar por status ${status}`}
              >
                {status}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filtros.comDuplicata || false}
              onChange={(e) => {
                setFiltros({ ...filtros, comDuplicata: e.target.checked });
                setPaginacao({ ...paginacao, pagina: 1 });
              }}
              className="rounded border-gray-300"
              aria-label="Mostrar apenas duplicatas"
            />
            <span className="font-medium text-gray-700">Mostrar apenas duplicatas suspeitas</span>
          </label>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-6 animate-pulse space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded"></div>
            ))}
          </div>
        ) : (
          <>
            {/* Toolbar */}
            {selectedLinhas.size > 0 && (
              <div className="px-6 py-4 bg-blue-50 border-b border-blue-200 flex items-center justify-between">
                <p className="text-sm text-blue-900">
                  {selectedLinhas.size} linha(s) selecionada(s)
                </p>
                <div className="flex gap-2">
                  {/* Batch actions could go here */}
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedLinhas.size === linhas.length && linhas.length > 0}
                        onChange={selecionarTodas}
                        aria-label="Selecionar todas as linhas"
                      />
                    </th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-900">#</th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-900">Dados</th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-900">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-900">
                      Score
                    </th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-900">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                        Nenhuma linha encontrada
                      </td>
                    </tr>
                  ) : (
                    linhas.map((linha) => (
                      <tr
                        key={linha.id}
                        className="border-b border-gray-200 hover:bg-gray-50"
                      >
                        <td className="px-6 py-4">
                          <input
                            type="checkbox"
                            checked={selectedLinhas.has(linha.id)}
                            onChange={() => toggleSelecionar(linha.id)}
                            aria-label={`Selecionar linha ${linha.numero_linha}`}
                          />
                        </td>
                        <td className="px-6 py-4 text-gray-700 font-medium">
                          {linha.numero_linha}
                        </td>
                        <td className="px-6 py-4">
                          <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono text-gray-800">
                            {linha.dados_brutos.substring(0, 60)}
                            {linha.dados_brutos.length > 60 ? '...' : ''}
                          </code>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded border text-xs font-medium ${obterCorStatus(
                              linha.status as LinhaStatus
                            )}`}
                          >
                            {linha.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {linha.duplicata_score !== undefined && (
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded border text-xs font-medium ${
                                linha.duplicata_score > 0.8
                                  ? 'bg-red-50 text-red-700 border-red-200'
                                  : 'bg-orange-50 text-orange-700 border-orange-200'
                              }`}
                            >
                              {(linha.duplicata_score * 100).toFixed(0)}%
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-1">
                            {linha.status === LinhaStatus.PENDENTE && (
                              <>
                                <button
                                  onClick={() => handleAprovarLinha(linha.id)}
                                  disabled={actionLoading === linha.id}
                                  className="px-2 py-1 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:bg-gray-400"
                                  aria-label={`Aprovar linha ${linha.numero_linha}`}
                                >
                                  ✓
                                </button>
                                <button
                                  onClick={() => setShowRejectDialog(linha.id)}
                                  disabled={actionLoading === linha.id}
                                  className="px-2 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 disabled:bg-gray-400"
                                  aria-label={`Rejeitar linha ${linha.numero_linha}`}
                                >
                                  ✗
                                </button>
                              </>
                            )}
                            {linha.status === LinhaStatus.DUPLICATA_SUSPEITA && (
                              <button
                                onClick={() => handleVerDuplicata(linha.id)}
                                disabled={actionLoading?.startsWith('duplicata')}
                                className="px-2 py-1 text-xs font-medium text-white bg-orange-600 rounded hover:bg-orange-700 disabled:bg-gray-400"
                                aria-label={`Ver detalhes de duplicata para linha ${linha.numero_linha}`}
                              >
                                Ver
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            {paginacao.total > paginacao.limite && (
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                <p className="text-sm text-gray-700">
                  Página {paginacao.pagina} de{' '}
                  {Math.ceil(paginacao.total / paginacao.limite)}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      setPaginacao({
                        ...paginacao,
                        pagina: Math.max(1, paginacao.pagina - 1),
                      })
                    }
                    disabled={paginacao.pagina === 1}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-500"
                    aria-label="Página anterior"
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() =>
                      setPaginacao({
                        ...paginacao,
                        pagina: Math.min(
                          Math.ceil(paginacao.total / paginacao.limite),
                          paginacao.pagina + 1
                        ),
                      })
                    }
                    disabled={
                      paginacao.pagina >=
                      Math.ceil(paginacao.total / paginacao.limite)
                    }
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-500"
                    aria-label="Próxima página"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}

            {/* Bottom Actions */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex gap-3">
              <button
                onClick={handleAprovarTodos}
                disabled={actionLoading === 'aprovar-todos'}
                className="px-4 py-2 font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-400"
                aria-label="Aprovar todas as linhas"
              >
                Aprovar Tudo
              </button>
              <button
                onClick={handleRejeitarTodos}
                disabled={actionLoading === 'rejeitar-todos'}
                className="px-4 py-2 font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-gray-400"
                aria-label="Rejeitar todas as linhas"
              >
                Rejeitar Tudo
              </button>
            </div>
          </>
        )}
      </div>

      {/* Reject Dialog */}
      {showRejectDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Rejeitar Linha
              </h3>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Descreva o motivo da rejeição..."
                className="w-full p-3 border border-gray-300 rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-500"
                rows={4}
                aria-label="Motivo da rejeição"
              />
              <div className="mt-6 flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowRejectDialog(null);
                    setRejectReason('');
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  aria-label="Cancelar rejeição"
                >
                  Cancelar
                </button>
                <button
                  onClick={() =>
                    showRejectDialog && handleRejeitarLinha(showRejectDialog)
                  }
                  disabled={!rejectReason.trim() || actionLoading === showRejectDialog}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  aria-label="Confirmar rejeição"
                >
                  Rejeitar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Duplicata Details Modal */}
      {showDuplicataDetails && duplicataDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-96 overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  Detalhes de Duplicata
                </h3>
                <button
                  onClick={() => {
                    setShowDuplicataDetails(null);
                    setDuplicataDetails(null);
                  }}
                  className="text-gray-500 hover:text-gray-700"
                  aria-label="Fechar detalhes"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <p className="text-xs font-medium text-blue-900 uppercase mb-2">
                    Score de Similaridade
                  </p>
                  <p className="text-2xl font-bold text-blue-600">
                    {(duplicataDetails.score * 100).toFixed(2)}%
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="border rounded-lg p-4">
                    <p className="text-xs font-medium text-gray-600 uppercase mb-2">
                      Linha Original
                    </p>
                    <p className="text-sm font-mono text-gray-900 break-all">
                      {duplicataDetails.linha_original.dados_brutos}
                    </p>
                  </div>
                  <div className="border rounded-lg p-4">
                    <p className="text-xs font-medium text-gray-600 uppercase mb-2">
                      Linha Duplicada
                    </p>
                    <p className="text-sm font-mono text-gray-900 break-all">
                      {duplicataDetails.linha_duplicada.dados_brutos}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowDuplicataDetails(null);
                    setDuplicataDetails(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  aria-label="Fechar detalhes"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportReview;
