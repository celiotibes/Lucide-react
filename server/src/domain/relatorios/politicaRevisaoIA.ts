/**
 * Política de Revisão Obrigatória por IA
 *
 * Define regras para quando um relatório, campo ou lançamento precisa de revisão humana:
 * - Regras de campo (quais campos precisam revisão)
 * - Regras de relatório (quais relatórios precisam revisão)
 * - Regras por papel (quem pode revisar vs quem não pode)
 * - Thresholds numéricos (mudanças > X% disparam revisão)
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

/**
 * Campos críticos que sempre precisam revisão
 */
export const CAMPOS_CRITICOS_REVISAO = [
  'lucroLiquido',
  'receitaTotal',
  'despesaTotal',
  'saldoAtual',
  'margemPropriedade',
  'inadimplencia',
  'taxaOcupacao',
  'diasDeCaixaDisponivel'
] as const;

/**
 * Relatórios que sempre precisam revisão antes de publicação
 */
export const RELATORIOS_SENSVEIS = [
  'relatorios/executivo',
  'relatorios/dre',
  'relatorios/fluxo-caixa',
  'relatorios/margens'
] as const;

/**
 * Papéis que NÃO podem revisar (apenas administradores/auditores)
 */
export const PAPEIS_SEM_PODER_REVISAO = [
  'usuario_operacional',
  'prestador'
] as const;

/**
 * Papéis que PODEM revisar
 */
export const PAPEIS_COM_PODER_REVISAO = [
  'administrador',
  'auditor',
  'supervisor'
] as const;

/**
 * Thresholds para disparar revisão automática
 */
export interface ThresholdRevisao {
  percentualMudanca: number; // Revisão se mudança > X%
  valorAbsoluto?: number;     // Revisão se valor absoluto > X
  aplicaA: string[];          // Campos aos quais se aplica
  motivo: MotivoRevisao;
}

export const THRESHOLDS_REVISAO: ThresholdRevisao[] = [
  {
    percentualMudanca: 10,
    aplicaA: ['receitaTotal', 'despesaTotal', 'lucroLiquido'],
    motivo: 'mudanca_drástica'
  },
  {
    percentualMudanca: 15,
    aplicaA: ['margemPropriedade', 'inadimplencia'],
    motivo: 'mudanca_drástica'
  },
  {
    percentualMudanca: 20,
    aplicaA: ['saldoAtual'],
    motivo: 'mudanca_drástica'
  },
  {
    valorAbsoluto: 50000, // 50k em centavos
    aplicaA: ['lancamento_valor'],
    motivo: 'lancamento_alto_valor'
  }
];

/**
 * Interface para uma regra de revisão
 */
export interface RegraRevisao {
  id: string;
  nome: string;
  descricao: string;
  tipo: TipoRevisao;
  ativa: boolean;
  campos?: string[];
  relatorios?: string[];
  papelOrigin?: string;
  papelRevisor?: string[];
  threshold?: ThresholdRevisao;
  criadoEm: string;
}

/**
 * Definição da Política de Revisão IA (exportável para UI)
 */
export interface PoliticaRevisaoIA {
  versao: string;
  ativa: boolean;
  camposCriticos: typeof CAMPOS_CRITICOS_REVISAO;
  relatoriosSensveis: typeof RELATORIOS_SENSVEIS;
  papeisSemRevisao: typeof PAPEIS_SEM_PODER_REVISAO;
  papaisComRevisao: typeof PAPEIS_COM_PODER_REVISAO;
  thresholds: ThresholdRevisao[];
  descricao: string;
  ultimaAtualizacao: string;
}

/**
 * Exporta a política atual como um objeto shareável para UI
 */
export function obterPoliticaAtual(): PoliticaRevisaoIA {
  return {
    versao: '1.0.0',
    ativa: true,
    camposCriticos: CAMPOS_CRITICOS_REVISAO,
    relatoriosSensveis: RELATORIOS_SENSVEIS,
    papeisSemRevisao: PAPEIS_SEM_PODER_REVISAO,
    papaisComRevisao: PAPEIS_COM_PODER_REVISAO,
    thresholds: THRESHOLDS_REVISAO,
    descricao: 'Política de revisão obrigatória por IA para garantir qualidade de relatórios críticos',
    ultimaAtualizacao: new Date().toISOString()
  };
}

/**
 * Verifica se um campo precisa de revisão
 */
export function campoNecessitaRevisao(nomeCampo: string): boolean {
  return (CAMPOS_CRITICOS_REVISAO as readonly string[]).includes(nomeCampo);
}

/**
 * Verifica se um relatório precisa de revisão
 */
export function relatarioNecessitaRevisao(tipoRelatorio: string): boolean {
  return (RELATORIOS_SENSVEIS as readonly string[]).includes(tipoRelatorio);
}

/**
 * Verifica se um papel pode revisar
 */
export function papelPodeRevisar(papel: string): boolean {
  return (PAPEIS_COM_PODER_REVISAO as readonly string[]).includes(papel);
}

/**
 * Verifica se um papel está bloqueado para revisão
 */
export function papelBloqueadoRevisao(papel: string): boolean {
  return (PAPEIS_SEM_PODER_REVISAO as readonly string[]).includes(papel);
}

/**
 * Calcula se há mudança drástica em um campo
 */
export function verificarMudancaThreshold(
  valorAnterior: number,
  valorNovo: number,
  nomeCampo: string
): { disparaRevisao: boolean; motivo?: MotivoRevisao } {
  if (valorAnterior === 0 && valorNovo === 0) {
    return { disparaRevisao: false };
  }

  const percentualMudanca =
    valorAnterior === 0
      ? 100 // Se era 0, qualquer valor é mudança de 100%
      : Math.abs((valorNovo - valorAnterior) / valorAnterior) * 100;

  const threshold = THRESHOLDS_REVISAO.find(
    (t) => t.aplicaA.includes(nomeCampo) && percentualMudanca >= t.percentualMudanca
  );

  if (threshold) {
    return {
      disparaRevisao: true,
      motivo: threshold.motivo
    };
  }

  return { disparaRevisao: false };
}

/**
 * Dados para criar uma fila de revisão
 */
export interface DadosFilaRevisao {
  documentoId: string;
  tipo: TipoRevisao;
  motivo: MotivoRevisao;
  solicitanteId: string;
  revisorId?: string;
  status: StatusRevisao;
  descricao?: string;
  dadosAdicionais?: Record<string, unknown>;
}

/**
 * Registro de uma fila de revisão
 */
export interface RegistroFilaRevisao extends DadosFilaRevisao {
  id: string;
  dataCriacao: string;
  dataRevisao?: string;
  motivoRejeicao?: string;
}
