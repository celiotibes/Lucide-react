/**
 * Tipos e interfaces para Apontamentos (Payroll)
 * Gestão de diárias, Airbnb, urgência, descontos e movimentações financeiras
 */

export type TipoApontamento = "diaria" | "airbnb" | "urgencia" | "deslocamento" | "busca_materiais" | "ajudante";
export type StatusApontamento = "rascunho" | "enviado" | "aprovado" | "retificado" | "rejeitado";
export type TipoMovimentacao = "vale" | "emprestimo" | "adiantamento";
export type StatusMovimentacao = "solicitado" | "aprovado" | "descontado" | "pago" | "rejeitado";
export type StatusFechamento = "rascunho" | "enviado" | "aprovado" | "pago";

export interface Apontamento {
  id: string;
  prestador_id: string;
  prestador_nome: string;
  data: string; // YYYY-MM-DD
  entrada: string; // HH:MM
  saida: string; // HH:MM
  intervalo?: number; // minutos
  horas?: number; // horas calculadas
  tipos: TipoApontamento[];
  valor_diaria?: number;
  valor_airbnb?: number;
  valor_urgencia?: number;
  valor_deslocamento?: number;
  valor_busca_materiais?: number;
  valor_ajudante?: number;
  valor_total?: number;
  status: StatusApontamento;
  requer_analise: boolean; // flag para Airbnb/urgência/etc
  motivo_analise?: string;
  data_criacao: string; // ISO 8601
  data_atualizacao: string; // ISO 8601
  memoria_calculo?: string; // JSON serializado com detalhes do cálculo
  observacoes?: string;
}

export interface FechamentoSemanal {
  id: string;
  prestador_id: string;
  prestador_nome: string;
  semana_inicio: string; // YYYY-MM-DD
  semana_fim: string; // YYYY-MM-DD
  apontamentos_ids: string[];
  valor_bruto: number;
  descontos_vale: number;
  descontos_emprestimo: number;
  descontos_adiantamento: number;
  descontos_total: number;
  valor_liquido: number;
  status: StatusFechamento;
  data_criacao: string;
  data_atualizacao: string;
  observacoes?: string;
}

export interface Movimentacao {
  id: string;
  prestador_id: string;
  prestador_nome: string;
  tipo: TipoMovimentacao;
  valor: number;
  data_solicitacao: string;
  status: StatusMovimentacao;
  semana_desconto?: string; // YYYY-MM-DD
  parcelas?: number; // para empréstimos
  juros_percentual?: number; // para empréstimos
  valor_parcela?: number;
  motivo_rejeicao?: string;
  data_criacao: string;
  data_atualizacao: string;
  observacoes?: string;
}

export interface ReajusteIPCA {
  id: string;
  data_notificacao?: string; // quando IPCA foi divulgado
  data_vigencia_esperada: string; // janeiro ou julho
  ipca_acumulado: number; // percentual
  status: "pendente" | "proposta_gerada" | "aprovado" | "rejeitado";
  proxima_revisao: string; // próxima data esperada (janeiro ou julho seguinte)
  rubricas_reajustadas?: RubricaReajuste[];
  data_criacao: string;
  data_atualizacao: string;
  observacoes?: string;
}

export interface RubricaReajuste {
  rubrica: "urgencia_50" | "urgencia_62_50" | "airbnb_1q" | "airbnb_2q" | "deslocamento" | "busca_materiais" | "diaria_ajudante";
  valor_atual: number;
  percentual_ipca: number; // IPCA acumulado
  novo_valor: number;
  valor_ajustado_manual?: number; // se editar manualmente
  memoria_calculo?: string; // JSON com detalhes
}

export interface MemoriaCalculo {
  tipo: "diaria" | "airbnb" | "urgencia" | "deslocamento" | "busca_materiais" | "ajudante" | "desconto";
  componentes: {
    descricao: string;
    quantidade?: number;
    valor_unitario?: number;
    subtotal: number;
  }[];
  total: number;
  observacoes?: string;
}

export interface AuditoriaAcao {
  id: string;
  entidade_tipo: "apontamento" | "fechamento" | "movimentacao" | "reajuste";
  entidade_id: string;
  acao: "criacao" | "aprovacao" | "retificacao" | "rejeicao" | "edicao";
  usuario: string;
  dados_anteriores?: Record<string, unknown>;
  dados_novos?: Record<string, unknown>;
  motivo?: string;
  data: string; // ISO 8601
}

export interface LancamentoLedger {
  id: string;
  entidade_tipo: "apontamento" | "fechamento";
  entidade_id: string;
  descricao: string;
  valor: number;
  conta_debito: string; // código do plano de contas
  conta_credito: string;
  data_lancamento: string; // YYYY-MM-DD
  data_criacao: string;
  status: "criado" | "processando" | "finalizado" | "erro";
  mensagem_erro?: string;
}

export interface FiltrosApontamentos {
  prestador_id?: string;
  status?: StatusApontamento;
  data_inicio?: string;
  data_fim?: string;
  requer_analise?: boolean;
}

export interface FiltrosFechamentos {
  prestador_id?: string;
  status?: StatusFechamento;
  semana_inicio?: string;
  semana_fim?: string;
}

export interface FiltrosMovimentacoes {
  prestador_id?: string;
  tipo?: TipoMovimentacao;
  status?: StatusMovimentacao;
  data_inicio?: string;
  data_fim?: string;
}
