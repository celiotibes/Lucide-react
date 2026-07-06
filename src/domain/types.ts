// Tipos que espelham contabilidade-reconstituicao/schema.sql.

export type TipoConta = "corrente" | "poupanca" | "investimento";
export type TipoImovel = "apartamento" | "kitnet" | "outro";
export type TipoContrato = "residencial_fixo" | "airbnb_temporada";
export type IndiceReajuste = "igpm" | "ipca" | "nenhum";
export type IndiceCorrecao = "poupanca" | "igpm" | "ipca" | "nenhum";
export type GrupoConta = "receita" | "despesa" | "pessoal" | "transferencia";
export type CategorizadoPor = "regra" | "ia" | "manual";

export interface ContaBancaria {
  id: number;
  banco: string;
  agencia?: string;
  numero: string;
  titular: string;
  tipo: TipoConta;
  ativa_desde?: string;
  observacoes?: string;
}

export interface Imovel {
  id: number;
  apelido: string;
  tipo: TipoImovel;
  endereco?: string;
  fracao_ideal?: number;
  area_m2?: number;
  financiado: 0 | 1;
}

export interface ContratoLocacao {
  id: number;
  imovel_id: number;
  locatario: string;
  tipo: TipoContrato;
  valor_referencia: number;
  dia_vencimento?: number;
  data_inicio: string;
  data_fim?: string;
  indice_reajuste: IndiceReajuste;
  multa_percentual: number;
  juros_mensal_percentual: number;
  observacoes?: string;
}

export interface Caucao {
  id: number;
  contrato_id: number;
  valor_inicial: number;
  data_deposito: string;
  indice_correcao: IndiceCorrecao;
  data_devolucao?: string;
  valor_devolvido?: number;
  deducoes_descricao?: string;
  deducoes_valor: number;
  observacoes?: string;
}

export interface Transacao {
  id: number;
  conta_id: number;
  data: string;
  valor: number;
  descricao_original: string;
  fitid?: string;
  documento_fonte?: string;
  plano_conta_codigo?: string;
  imovel_id?: number;
  contrato_id?: number;
  prestador_id?: number;
  categorizado_por?: CategorizadoPor;
  revisado: 0 | 1;
}

export interface PlanoConta {
  codigo: string;
  descricao: string;
  grupo: GrupoConta;
  natureza: "debito" | "credito";
}

export interface LinhaDre {
  codigo: string;
  descricao: string;
  grupo: GrupoConta;
  total: number;
}

export interface CompetenciaEsperada {
  contrato_id: number;
  imovel_id: number;
  mes_referencia: string; // YYYY-MM-01
  valor_esperado: number;
}

export interface StatusInadimplencia {
  competencia: CompetenciaEsperada;
  diasAtraso: number;
  multa: number;
  juros: number;
  totalDevido: number;
  situacao: "pago" | "em_aberto" | "inadimplente";
}
