/**
 * Ledger Types and Interfaces
 *
 * Define todas as estruturas para o sistema de lançamentos contábeis (double-entry bookkeeping)
 * Categorias: receita, aluguel, honorario, extraordinaria, comissao, imposto, folha_pagamento, condominio, manutencao, juros
 */

/**
 * Tipo de lançamento: receita ou despesa
 */
export type TipoLancamento = 'receita' | 'despesa';

/**
 * Categorias válidas de lançamento
 * Receitas: receita, aluguel, honorario, extraordinaria
 * Despesas: comissao, imposto, folha_pagamento, condominio, manutencao, juros
 */
export type CategoriaLancamento =
  | 'receita'
  | 'aluguel'
  | 'honorario'
  | 'extraordinaria'
  | 'comissao'
  | 'imposto'
  | 'folha_pagamento'
  | 'condominio'
  | 'manutencao'
  | 'juros';

/**
 * Interface para entrada no razão contábil (ledger_entries)
 * Representa um lançamento contábil de débito e crédito
 */
export interface LedgerEntry {
  id: string;
  data: string; // YYYY-MM-DD
  tipo: TipoLancamento;
  categoria: CategoriaLancamento;
  valor: number; // em reais (pode ter decimais)
  descricao?: string;
  referencia_externa?: string; // ID externo para rastreamento (ex: cobranca_id, pagamento_id)
  usuario_id?: string; // Quem lançou a entrada
  criado_em?: string; // timestamp
  atualizado_em?: string; // timestamp
}

/**
 * Interface para lançamento de double-entry
 * Contém débito e crédito que devem somar zero
 */
export interface DoubleEntryLancamento {
  id: string;
  data: string;
  descricao: string;
  conta_debito: string; // conta que recebe débito
  conta_credito: string; // conta que recebe crédito
  valor: number;
  tipo: TipoLancamento;
  categoria: CategoriaLancamento;
  referencia_externa?: string;
  usuario_id?: string;
}

/**
 * Resultado de uma operação de lançamento
 */
export interface ResultadoRegistroLancamento {
  sucesso: boolean;
  lancamento_id?: string;
  erro?: string;
  mensagem?: string;
}

/**
 * Validação de conta no plano de contas
 */
export interface ContaContabil {
  codigo: string;
  nome: string;
  tipo: 'ativo' | 'passivo' | 'patrimonio' | 'receita' | 'despesa';
  ativo: boolean;
}

/**
 * Auditoria de lançamento
 */
export interface AuditoriaLancamento {
  lancamento_id: string;
  usuario_id: string;
  acao: 'criar' | 'atualizar' | 'deletar';
  data: string;
  detalhes?: string;
}
