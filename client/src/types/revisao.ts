/**
 * Tipos TypeScript para Revisão IA
 */

export type TipoRevisao = 'relatorio' | 'campo' | 'lancamento';
export type StatusRevisao = 'pendente' | 'revisado' | 'rejeitado' | 'autorizado';
export type MotivoRevisao =
  | 'threshold_exceeded'
  | 'campo_critico'
  | 'relatorio_sensivel'
  | 'flagged_by_user'
  | 'lancamento_alto_valor'
  | 'mudanca_drástica';

export interface ItemRevisao {
  id: string;
  documentoId: string;
  tipo: TipoRevisao;
  motivo: MotivoRevisao;
  solicitanteId: string;
  revisorId?: string;
  status: StatusRevisao;
  descricao?: string;
  dadosAdicionais?: Record<string, unknown>;
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
  thresholds: ThresholdRevisao[];
  descricao: string;
  ultimaAtualizacao: string;
}

export interface ThresholdRevisao {
  percentualMudanca: number;
  valorAbsoluto?: number;
  aplicaA: string[];
  motivo: MotivoRevisao;
}

export interface EstatisticasRevisao {
  totalPendente: number;
  totalRevisado: number;
  totalRejeitado: number;
  porTipo: Record<TipoRevisao, number>;
  porMotivo: Record<MotivoRevisao, number>;
}

export interface RespostaFilaRevisao {
  sucesso: boolean;
  itens: ItemRevisao[];
  paginacao?: {
    limit: number;
    offset: number;
    total: number;
  };
}

export interface RespostaDocumentoRevisao {
  sucesso: boolean;
  itens: ItemRevisao[];
  temPendencias: boolean;
}

export interface RespostaEstatisticas {
  sucesso: boolean;
  estatisticas: EstatisticasRevisao;
}
