/**
 * Componente de Preview de Dados Importados
 *
 * Funcionalidades:
 * - Exibe informações do arquivo
 * - Tabela com primeiras linhas
 * - Tipo de arquivo detectado
 * - Ações: Aprovar, Editar Mapeamento, Rejeitar
 * - Navegação por teclado
 * - Tratamento de erros
 * - Loading states
 */

import React, { useState, useEffect } from 'react';
import type { ImportPreviewProps } from './types.js';
import type { PreviewDados } from './types.js';
import { obterPreview, ApiError } from './api.js';
import { LinhaStatus } from './types.js';

/**
 * Obter ícone para status
 */
function obterIconeStatus(status: string) {
  const iconesStatus: Record<string, string> = {
    [LinhaStatus.PENDENTE]: '⏳',
    [LinhaStatus.DUPLICATA_SUSPEITA]: '⚠️',
    [LinhaStatus.VALIDADA]: '✓',
    [LinhaStatus.PROCESSADA]: '✓✓',
    [LinhaStatus.REJEITADA]: '✗',
    [LinhaStatus.ERRO]: '❌',
    [LinhaStatus.IGNORADA]: '◌',
  };
  return iconesStatus[status] || '•';
}

/**
 * Cor para status
 */
function obterCorStatus(status: string) {
  const coresStatus: Record<string, string> = {
    [LinhaStatus.PENDENTE]: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    [LinhaStatus.DUPLICATA_SUSPEITA]: 'bg-orange-50 text-orange-700 border-orange-200',
    [LinhaStatus.VALIDADA]: 'bg-green-50 text-green-700 border-green-200',
    [LinhaStatus.PROCESSADA]: 'bg-green-50 text-green-700 border-green-200',
    [LinhaStatus.REJEITADA]: 'bg-red-50 text-red-700 border-red-200',
    [LinhaStatus.ERRO]: 'bg-red-50 text-red-700 border-red-200',
    [LinhaStatus.IGNORADA]: 'bg-gray-50 text-gray-700 border-gray-200',
  };
  return coresStatus[status] || 'bg-gray-50 text-gray-700 border-gray-200';
}

/**
 * Componente de Preview
 */
export const ImportPreview: React.FC<ImportPreviewProps> = ({
  loteId,
  onApprove,
  onEditMapping,
  onReject,
  onClose,
}) => {
  const [preview, setPreview] = useState<PreviewDados | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  /**
   * Carregar preview ao montar componente
   */
  useEffect(() => {
    const carregar = async () => {
      try {
        setLoading(true);
        const dados = await obterPreview(loteId);
        setPreview(dados);
        setError(null);
      } catch (erro) {
        const mensagem =
          erro instanceof ApiError
            ? erro.message
            : erro instanceof Error
              ? erro.message
              : 'Erro ao carregar preview';
        setError(mensagem);
      } finally {
        setLoading(false);
      }
    };

    carregar();
  }, [loteId]);

  /**
   * Lidar com rejeição
   */
  const handleRejeitar = () => {
    if (rejectReason.trim()) {
      onReject?.(loteId, rejectReason);
      setShowRejectDialog(false);
      setRejectReason('');
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="font-semibold text-red-900 mb-1">Erro ao carregar preview</h3>
          <p className="text-sm text-red-700 mb-4">{error}</p>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-md hover:bg-red-50"
            aria-label="Fechar preview"
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }

  const statusContagem = preview.linhas_preview.reduce(
    (acc, linha) => ({
      ...acc,
      [linha.status]: (acc[linha.status as keyof typeof acc] || 0) + 1,
    }),
    {} as Record<string, number>
  );

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              Preview dos Dados
            </h2>
            <p className="text-sm text-gray-600">
              Total de linhas: <span className="font-semibold">{preview.total_linhas}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            aria-label="Fechar preview"
          >
            ✕
          </button>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
            <p className="text-xs font-medium text-blue-900 uppercase">Tipo de Arquivo</p>
            <p className="text-lg font-semibold text-blue-600 mt-1">{preview.tipo}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <p className="text-xs font-medium text-gray-900 uppercase">Lote ID</p>
            <p className="text-sm font-mono text-gray-700 mt-1 truncate">
              {preview.lote_id}
            </p>
          </div>
        </div>
      </div>

      {/* Tabela de Preview */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left font-semibold text-gray-900">#</th>
              <th className="px-6 py-3 text-left font-semibold text-gray-900">Dados</th>
              <th className="px-6 py-3 text-left font-semibold text-gray-900">Status</th>
            </tr>
          </thead>
          <tbody>
            {preview.linhas_preview.map((linha) => (
              <tr
                key={`${linha.numero_linha}`}
                className="border-b border-gray-200 hover:bg-gray-50"
              >
                <td className="px-6 py-4 text-gray-700 font-medium">
                  {linha.numero_linha}
                </td>
                <td className="px-6 py-4">
                  <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono text-gray-800 break-all">
                    {linha.dados.substring(0, 100)}
                    {linha.dados.length > 100 ? '...' : ''}
                  </code>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded border ${obterCorStatus(
                      linha.status
                    )}`}
                  >
                    <span>{obterIconeStatus(linha.status)}</span>
                    <span className="text-xs font-medium">{linha.status}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Resumo de Status */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
        <p className="text-xs font-medium text-gray-600 uppercase mb-2">
          Resumo de Status
        </p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(statusContagem).map(([status, count]) => (
            <span
              key={status}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border ${obterCorStatus(
                status
              )}`}
            >
              <span>{obterIconeStatus(status)}</span>
              <span>{status}</span>
              <span className="font-semibold">({count})</span>
            </span>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="px-6 py-4 bg-white border-t border-gray-200 flex gap-3 flex-wrap">
        <button
          onClick={() => onApprove?.(loteId)}
          className="px-4 py-2 font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          aria-label="Aprovar importação"
        >
          Aprovar
        </button>
        <button
          onClick={() => onEditMapping?.(loteId)}
          className="px-4 py-2 font-medium text-gray-900 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          aria-label="Editar mapeamento de dados"
        >
          Editar Mapeamento
        </button>
        <button
          onClick={() => setShowRejectDialog(true)}
          className="px-4 py-2 font-medium text-gray-900 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          aria-label="Rejeitar importação"
        >
          Rejeitar
        </button>
      </div>

      {/* Reject Dialog */}
      {showRejectDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Rejeitar Importação
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
                    setShowRejectDialog(false);
                    setRejectReason('');
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  aria-label="Cancelar rejeição"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleRejeitar}
                  disabled={!rejectReason.trim()}
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
    </div>
  );
};

export default ImportPreview;
