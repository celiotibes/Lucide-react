/**
 * Hook customizado para gerenciar Revisão IA
 *
 * Funções:
 * - Carregar itens pendentes
 * - Carregar política
 * - Criar novo item para revisão
 * - Autorizar/rejeitar itens
 * - Obter estatísticas
 */

import { useState, useCallback } from 'react';
import type {
  ItemRevisao,
  PoliticaRevisao,
  EstatisticasRevisao,
  RespostaFilaRevisao,
  RespostaDocumentoRevisao,
  RespostaEstatisticas
} from '../types/revisao.js';

export interface UseRevisaoIAState {
  itens: ItemRevisao[];
  politica: PoliticaRevisao | null;
  estatisticas: EstatisticasRevisao | null;
  loading: boolean;
  erro: string | null;
}

export interface UseRevisaoIAMethods {
  // Carregar dados
  carregarPendentes: (limit?: number, offset?: number) => Promise<void>;
  carregarPolitica: () => Promise<void>;
  carregarEstatisticas: () => Promise<void>;
  carregarPorDocumento: (documentoId: string) => Promise<ItemRevisao[]>;

  // Ações
  criarItemRevisao: (dados: Record<string, unknown>) => Promise<ItemRevisao>;
  autorizarItem: (itemId: string) => Promise<ItemRevisao>;
  rejeitarItem: (itemId: string, motivo: string) => Promise<ItemRevisao>;

  // Helpers
  temPendencias: (documentoId: string) => boolean;
  verificarRevisaoNecessaria: (campo: string, tipo: string) => boolean;
}

/**
 * Hook customizado para gerenciar revisões
 */
export function useRevisaoIA(): UseRevisaoIAState & UseRevisaoIAMethods {
  const [state, setState] = useState<UseRevisaoIAState>({
    itens: [],
    politica: null,
    estatisticas: null,
    loading: false,
    erro: null
  });

  const setErro = useCallback((erro: string | null) => {
    setState(prev => ({ ...prev, erro }));
  }, []);

  const carregarPendentes = useCallback(async (limit = 50, offset = 0) => {
    try {
      setState(prev => ({ ...prev, loading: true, erro: null }));

      const response = await fetch(
        `/api/revisao-ia/fila?limit=${limit}&offset=${offset}`
      );
      const data: RespostaFilaRevisao = await response.json();

      if (data.sucesso) {
        setState(prev => ({
          ...prev,
          itens: data.itens,
          loading: false
        }));
      } else {
        throw new Error('Erro ao carregar pendentes');
      }
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Erro desconhecido';
      setErro(mensagem);
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [setErro]);

  const carregarPolitica = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, erro: null }));

      const response = await fetch('/api/revisao-ia/politica');
      const data = await response.json();

      if (data.sucesso) {
        setState(prev => ({
          ...prev,
          politica: data.politica,
          loading: false
        }));
      } else {
        throw new Error('Erro ao carregar política');
      }
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Erro desconhecido';
      setErro(mensagem);
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [setErro]);

  const carregarEstatisticas = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, erro: null }));

      const response = await fetch('/api/revisao-ia/estatisticas');
      const data: RespostaEstatisticas = await response.json();

      if (data.sucesso) {
        setState(prev => ({
          ...prev,
          estatisticas: data.estatisticas,
          loading: false
        }));
      } else {
        throw new Error('Erro ao carregar estatísticas');
      }
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Erro desconhecido';
      setErro(mensagem);
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [setErro]);

  const carregarPorDocumento = useCallback(async (documentoId: string): Promise<ItemRevisao[]> => {
    try {
      setState(prev => ({ ...prev, loading: true, erro: null }));

      const response = await fetch(`/api/revisao-ia/documento/${documentoId}`);
      const data: RespostaDocumentoRevisao = await response.json();

      if (data.sucesso) {
        setState(prev => ({
          ...prev,
          itens: data.itens,
          loading: false
        }));
        return data.itens;
      } else {
        throw new Error('Erro ao carregar itens do documento');
      }
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Erro desconhecido';
      setErro(mensagem);
      setState(prev => ({ ...prev, loading: false }));
      return [];
    }
  }, [setErro]);

  const criarItemRevisao = useCallback(async (dados: Record<string, unknown>): Promise<ItemRevisao> => {
    try {
      setState(prev => ({ ...prev, loading: true, erro: null }));

      const response = await fetch('/api/revisao-ia/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
      });

      const data = await response.json();

      if (data.sucesso) {
        setState(prev => ({
          ...prev,
          itens: [...prev.itens, data.item],
          loading: false
        }));
        return data.item;
      } else {
        throw new Error('Erro ao criar item');
      }
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Erro desconhecido';
      setErro(mensagem);
      setState(prev => ({ ...prev, loading: false }));
      throw erro;
    }
  }, [setErro]);

  const autorizarItem = useCallback(async (itemId: string): Promise<ItemRevisao> => {
    try {
      setState(prev => ({ ...prev, loading: true, erro: null }));

      const response = await fetch(`/api/revisao-ia/${itemId}/revisar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'autorizado' })
      });

      const data = await response.json();

      if (data.sucesso) {
        setState(prev => ({
          ...prev,
          itens: prev.itens.map(i => i.id === itemId ? data.item : i),
          loading: false
        }));
        return data.item;
      } else {
        throw new Error('Erro ao autorizar item');
      }
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Erro desconhecido';
      setErro(mensagem);
      setState(prev => ({ ...prev, loading: false }));
      throw erro;
    }
  }, [setErro]);

  const rejeitarItem = useCallback(async (itemId: string, motivo: string): Promise<ItemRevisao> => {
    try {
      setState(prev => ({ ...prev, loading: true, erro: null }));

      const response = await fetch(`/api/revisao-ia/${itemId}/rejeitar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo })
      });

      const data = await response.json();

      if (data.sucesso) {
        setState(prev => ({
          ...prev,
          itens: prev.itens.map(i => i.id === itemId ? data.item : i),
          loading: false
        }));
        return data.item;
      } else {
        throw new Error('Erro ao rejeitar item');
      }
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Erro desconhecido';
      setErro(mensagem);
      setState(prev => ({ ...prev, loading: false }));
      throw erro;
    }
  }, [setErro]);

  const temPendencias = useCallback((documentoId: string): boolean => {
    return state.itens.some(
      i => i.documentoId === documentoId && i.status === 'pendente'
    );
  }, [state.itens]);

  const verificarRevisaoNecessaria = useCallback((campo: string, tipo: string): boolean => {
    if (!state.politica) return false;

    const isCampioCritico = state.politica.camposCriticos.includes(campo);
    const isRelatorioSensivel = state.politica.relatoriosSensveis.includes(tipo);

    return isCampioCritico || isRelatorioSensivel;
  }, [state.politica]);

  return {
    ...state,
    carregarPendentes,
    carregarPolitica,
    carregarEstatisticas,
    carregarPorDocumento,
    criarItemRevisao,
    autorizarItem,
    rejeitarItem,
    temPendencias,
    verificarRevisaoNecessaria
  };
}
