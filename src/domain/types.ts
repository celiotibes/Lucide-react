// Tipos que espelham contabilidade-reconstituicao/schema.sql.

export type TipoConta = "corrente" | "poupanca" | "investimento";
export type TipoImovel = "apartamento" | "kitnet" | "sala_comercial" | "vaga_garagem" | "outro";
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

export type RegimePatrimonial = "proprio" | "gestao_terceiros";

export interface Imovel {
  id: number;
  apelido: string;
  tipo: TipoImovel;
  cidade?: string;
  endereco?: string;
  fracao_ideal?: number;
  area_m2?: number;
  financiado: 0 | 1;
  uso_pessoal: 0 | 1;
  matricula?: string;
  matricula_mae?: string;
  valor_aquisicao?: number;
  valor_venal_atual?: number;
  data_avaliacao_venal?: string;
  regime_patrimonial: RegimePatrimonial;
  proprietario_nome?: string;
  /** Copropriedade real de um imóvel 'proprio' (distinto de 'gestao_terceiros', que é 100% de
   * terceiro) cujo percentual de participação de cada titular ainda não foi confirmado. Não é
   * numérico de propósito — ver comentário em schema.sql. */
  co_titular_nome?: string;
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
  indice_reajuste?: IndiceReajuste;
  percentual_aluguel_efetivo: number;
  multa_percentual: number;
  multa_ate_dias: number;
  multa_percentual_substitutiva: number;
  juros_mensal_percentual: number;
  indice_correcao_mora?: IndiceReajuste;
  honorarios_percentual: number;
  dias_gatilho_judicial: number;
  percentual_reajuste_primeira_renovacao?: number;
  duracao_minima_meses: number;
  multa_rescisoria_teto_meses: number;
  observacoes?: string;
}

export type CriterioReajuste = "fixo" | "igpm" | "ipca";

export interface ContratoReajuste {
  id: number;
  contrato_id: number;
  data_vigencia: string;
  valor_anterior: number;
  valor_novo: number;
  percentual_aplicado: number;
  criterio: CriterioReajuste;
  eh_reajuste_anual: number; // 0/1 (SQLite boolean) — 1 = reajuste anual de fato, 0 = recomposição por outro motivo (ex: mudança de lotação)
  observacoes?: string;
}

export type PapelLocatario = "locatario" | "responsavel_solidario";

export interface ContratoLocatario {
  id: number;
  contrato_id: number;
  nome: string;
  cpf?: string;
  papel: PapelLocatario;
  telefone?: string;
  email?: string;
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
  deducoes_valor?: number;
  observacoes?: string;
}

/** Composição CONTRATADA da Cota de Custeio (o que o instrumento assinado itemiza), não o gasto
 * real por sub-rubrica — ver comentário em schema.sql. Exibida como referência no DSS. */
export interface RubricaCusteio {
  id: number;
  contrato_id: number;
  referencia?: string;
  descricao: string;
  percentual?: number;
  valor_base?: number;
}

/** Item do inventário de bens (mobiliário/equipamentos) de um imóvel — referência documental
 * para o Relatório de Apuração de Débitos (RAD) na saída do locatário. */
export interface ItemInventarioBem {
  id: number;
  imovel_id: number;
  descricao: string;
  valor_reposicao?: number;
  data_vistoria?: string;
}

/** Franquia hídrica CONTRATADA por faixa de ocupação — referência documental (ver comentário
 * em schema.sql), não medição real de consumo. */
export interface FranquiaHidrica {
  id: number;
  contrato_id: number;
  ocupacao_pessoas: number;
  franquia_total_m3?: number;
  custo_estimado_reais?: number;
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
  correcaoMonetaria: number;
  honorarios: number;
  totalDevido: number;
  situacao: "pago" | "em_aberto" | "inadimplente";
}

export type TipoDocumento = "contrato" | "recibo" | "fatura" | "nota_fiscal" | "pedido_comercial" | "boleto" | "outro";

export interface Documento {
  id: number;
  tipo: TipoDocumento;
  arquivo_nome: string;
  valor?: number;
  data_documento?: string;
  cnpj_cpf_contraparte?: string;
  nome_contraparte?: string;
  descricao_produto_servico?: string;
  plano_conta_codigo?: string;
  texto_extraido?: string;
  criado_em: string;
  observacoes?: string;
}

export interface DocumentoImovel {
  id: number;
  documento_id: number;
  imovel_id: number;
  percentual: number; // 0-100
}

export type StatusDocumentoTransacao = "sugerido" | "confirmado" | "rejeitado";

export interface DocumentoTransacao {
  id: number;
  documento_id: number;
  transacao_id: number;
  score: number;
  status: StatusDocumentoTransacao;
}

export type TipoDividaConsumo = "consignado" | "emprestimo_pessoal" | "cartao_parcelado" | "outro";

export interface DividaConsumo {
  id: number;
  tipo: TipoDividaConsumo;
  instituicao: string;
  valor_contratado?: number;
  saldo_devedor_atual: number;
  parcela_mensal: number;
  data_referencia_saldo: string;
  observacoes?: string;
}

export type TipoDeclaracaoFiscal = "dirpf_anual" | "carne_leao_mensal";

export interface DeclaracaoFiscal {
  id: number;
  ano_calendario: number;
  tipo: TipoDeclaracaoFiscal;
  mes_referencia?: string; // obrigatório quando tipo = 'carne_leao_mensal'
  rendimento_tributavel_declarado: number;
  imposto_pago?: number;
  fonte_documento?: string;
  observacoes?: string;
}

export type TipoDocumentoGerado = "laudo_pericial" | "rad";

export interface DocumentoGerado {
  id: number;
  tipo: TipoDocumentoGerado;
  nome_arquivo: string;
  data_emissao: string;
  gerado_em: string; // timestamp ISO 8601 completo
  hash_sha256: string;
  tamanho_bytes: number;
  contrato_id?: number;
  imovel_id?: number;
}

export type OperacaoLog = "criacao" | "edicao" | "exclusao";

export interface LogAlteracao {
  id: number;
  tabela: string;
  registro_id: number;
  operacao: OperacaoLog;
  quando: string; // timestamp ISO 8601 completo
  resumo: string;
  dados_anteriores?: string; // JSON
  dados_novos?: string; // JSON
}
