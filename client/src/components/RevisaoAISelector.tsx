/**
 * Componente RevisaoAISelector
 *
 * Similar a ConfirmDialog, mas para gerenciar revisões obrigatórias.
 * Mostra:
 * - Campos/relatórios que precisam revisão
 * - Motivo da revisão
 * - Opção de marcar como "Revisão Obrigatória"
 * - Status da revisão
 *
 * Uso:
 * <RevisaoAISelector
 *   isOpen={showRevisao}
 *   documento={{id: 'doc-123', tipo: 'relatorio'}}
 *   camposARevisar={['receitaTotal', 'lucroLiquido']}
 *   onClose={() => setShowRevisao(false)}
 *   onAutorizar={(resultado) => handleAutorizar(resultado)}
 * />
 */

import React, { useState, useEffect } from 'react';

export interface ItemRevisao {
  id: string;
  documentoId: string;
  tipo: 'relatorio' | 'campo' | 'lancamento';
  motivo: string;
  status: 'pendente' | 'revisado' | 'rejeitado' | 'autorizado';
  descricao?: string;
  dataCriacao: string;
  dataRevisao?: string;
  motivoRejeicao?: string;
}

export interface PoliticaRevisao {
  versao: string;
  ativa: boolean;
  camposCriticos: string[];
  relatoriosSensveis: string[];
  papeisSemRevisao: string[];
  papaisComRevisao: string[];
  thresholds: unknown[];
  descricao: string;
  ultimaAtualizacao: string;
}

export interface RevisaoAISelectorProps {
  isOpen: boolean;
  documentoId: string;
  tipoDocumento: 'relatorio' | 'campo' | 'lancamento';
  camposARevisar?: string[];
  motivoRevisao?: string;
  descricaoRevisao?: string;
  onClose: () => void;
  onAutorizar?: (resultado: { documentoId: string; autorizado: boolean }) => void;
  onRejeitar?: (resultado: { documentoId: string; motivo: string }) => void;
}

/**
 * Componente modal para gerenciar revisão de relatórios/campos
 */
export const RevisaoAISelector: React.FC<RevisaoAISelectorProps> = ({
  isOpen,
  documentoId,
  tipoDocumento,
  camposARevisar = [],
  motivoRevisao = 'threshold_exceeded',
  descricaoRevisao,
  onClose,
  onAutorizar,
  onRejeitar
}) => {
  const [itensRevisao, setItensRevisao] = useState<ItemRevisao[]>([]);
  const [loading, setLoading] = useState(false);
  const [rejeitandoId, setRejeitandoId] = useState<string | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');

  // Carregar itens de revisão do documento
  useEffect(() => {
    if (!isOpen) return;

    const carregarItens = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/revisao-ia/documento/${documentoId}`);
        const data = await response.json();

        if (data.sucesso) {
          setItensRevisao(data.itens);
        }
      } catch (erro) {
        console.error('Erro ao carregar itens de revisão', erro);
      } finally {
        setLoading(false);
      }
    };

    carregarItens();
  }, [isOpen, documentoId]);

  // Política de revisão é carregada para efeitos futuros de cache
  useEffect(() => {
    const carregarPolitica = async () => {
      try {
        await fetch('/api/revisao-ia/politica');
      } catch (erro) {
        console.error('Erro ao carregar política', erro);
      }
    };

    carregarPolitica();
  }, []);

  const handleAutorizar = async (itemId: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/revisao-ia/${itemId}/revisar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'autorizado' })
      });

      const data = await response.json();

      if (data.sucesso) {
        setItensRevisao(itensRevisao.map(i => i.id === itemId ? data.item : i));
        onAutorizar?.({ documentoId, autorizado: true });
      }
    } catch (erro) {
      console.error('Erro ao autorizar', erro);
    } finally {
      setLoading(false);
    }
  };

  const handleRejeitar = async (itemId: string) => {
    if (!motivoRejeicao) {
      alert('Por favor, informe o motivo da rejeição');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`/api/revisao-ia/${itemId}/rejeitar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: motivoRejeicao })
      });

      const data = await response.json();

      if (data.sucesso) {
        setItensRevisao(itensRevisao.map(i => i.id === itemId ? data.item : i));
        setRejeitandoId(null);
        setMotivoRejeicao('');
        onRejeitar?.({ documentoId, motivo: motivoRejeicao });
      }
    } catch (erro) {
      console.error('Erro ao rejeitar', erro);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const temPendentes = itensRevisao.some(i => i.status === 'pendente');
  const todosRevisados = itensRevisao.length > 0 && itensRevisao.every(i => i.status === 'autorizado' || i.status === 'revisado');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 border-b">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">Revisão Obrigatória</h2>
              <p className="text-blue-100 text-sm mt-1">
                {tipoDocumento === 'relatorio' ? 'Relatório' : tipoDocumento === 'campo' ? 'Campo' : 'Lançamento'} requer revisão
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={loading}
              className="text-blue-100 hover:text-white text-2xl leading-none disabled:opacity-50"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Motivo da revisão */}
          {motivoRevisao && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="font-semibold text-amber-900 mb-2">Motivo da Revisão:</p>
              <p className="text-amber-800">
                {motivoRevisao === 'threshold_exceeded' && 'Mudança acima do threshold'}
                {motivoRevisao === 'campo_critico' && 'Campo crítico foi modificado'}
                {motivoRevisao === 'relatorio_sensivel' && 'Relatório sensível requer autorização'}
                {motivoRevisao === 'flagged_by_user' && 'Marcado para revisão pelo usuário'}
                {motivoRevisao === 'lancamento_alto_valor' && 'Lançamento de alto valor'}
                {motivoRevisao === 'mudanca_drástica' && 'Mudança drástica detectada'}
              </p>
              {descricaoRevisao && (
                <p className="text-amber-700 text-sm mt-2">{descricaoRevisao}</p>
              )}
            </div>
          )}

          {/* Campos a revisar */}
          {camposARevisar.length > 0 && (
            <div>
              <p className="font-semibold text-gray-900 mb-3">Campos para Revisão:</p>
              <div className="grid grid-cols-2 gap-2">
                {camposARevisar.map((campo, idx) => (
                  <div
                    key={idx}
                    className="bg-blue-50 border border-blue-200 rounded px-3 py-2 text-sm text-blue-900"
                  >
                    {campo}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Itens de revisão pendentes */}
          {itensRevisao.length > 0 && (
            <div>
              <p className="font-semibold text-gray-900 mb-3">Status de Revisão:</p>
              <div className="space-y-3">
                {itensRevisao.map((item) => (
                  <div
                    key={item.id}
                    className="border rounded-lg p-4"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-sm font-semibold px-2 py-1 rounded-full ${
                            item.status === 'pendente' ? 'bg-yellow-100 text-yellow-800' :
                            item.status === 'autorizado' ? 'bg-green-100 text-green-800' :
                            item.status === 'revisado' ? 'bg-blue-100 text-blue-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {item.status}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(item.dataCriacao).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        {item.descricao && (
                          <p className="text-sm text-gray-700">{item.descricao}</p>
                        )}
                      </div>
                    </div>

                    {/* Ações para itens pendentes */}
                    {item.status === 'pendente' && (
                      <div className="mt-3 space-y-2">
                        {rejeitandoId === item.id ? (
                          <div className="space-y-2">
                            <textarea
                              value={motivoRejeicao}
                              onChange={(e) => setMotivoRejeicao(e.target.value)}
                              placeholder="Motivo da rejeição..."
                              className="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none"
                              rows={2}
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleRejeitar(item.id)}
                                disabled={loading || !motivoRejeicao}
                                className="flex-1 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded text-sm font-medium disabled:opacity-50"
                              >
                                Confirmar Rejeição
                              </button>
                              <button
                                onClick={() => {
                                  setRejeitandoId(null);
                                  setMotivoRejeicao('');
                                }}
                                disabled={loading}
                                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-900 px-3 py-2 rounded text-sm font-medium disabled:opacity-50"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleAutorizar(item.id)}
                              disabled={loading}
                              className="flex-1 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded text-sm font-medium disabled:opacity-50"
                            >
                              Autorizar
                            </button>
                            <button
                              onClick={() => setRejeitandoId(item.id)}
                              disabled={loading}
                              className="flex-1 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded text-sm font-medium disabled:opacity-50"
                            >
                              Rejeitar
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Mostra motivo de rejeição se rejeitado */}
                    {item.status === 'rejeitado' && item.motivoRejeicao && (
                      <div className="mt-3 bg-red-50 border border-red-200 rounded px-3 py-2 text-sm text-red-900">
                        <strong>Motivo da rejeição:</strong> {item.motivoRejeicao}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Carregando... */}
          {loading && (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Processando...</span>
            </div>
          )}

          {/* Sem itens */}
          {!loading && itensRevisao.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-600">Nenhum item para revisão</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t p-6 flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={loading || temPendentes}
            className={`px-4 py-2 rounded font-medium transition-colors ${
              loading || temPendentes
                ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                : 'bg-gray-300 hover:bg-gray-400 text-gray-900'
            }`}
          >
            {temPendentes ? 'Aguardando Revisão...' : 'Fechar'}
          </button>

          {todosRevisados && (
            <div className="text-green-600 font-medium flex items-center gap-2">
              <span>✓</span> Todos os itens foram revisados
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RevisaoAISelector;
