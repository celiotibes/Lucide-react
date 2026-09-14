/**
 * Apontamento do Prestador (Sprint 2)
 * Gestão de apontamentos diários, remuneração, empréstimos e retificações
 * Integração com Ledger Contábil (origem_modulo: "apontamento-prestador")
 */

// ===== ENUMS =====

export enum StatusApontamento {
  RASCUNHO = "rascunho",
  ENVIADO = "enviado",
  APROVADO = "aprovado",
  RETIFICADO = "retificado",
}

export enum TipoRubrica {
  DIARIA = "diaria",
  AIRBNB = "airbnb",
  URGENCIA = "urgencia",
  DESLOCAMENTO = "deslocamento",
  MATERIAIS = "materiais",
  EXTRA = "extra",
}

export enum TipoMovimentacao {
  VALE = "vale",
  EMPRESTIMO = "emprestimo",
  ADIANTAMENTO = "adiantamento",
}

export enum StatusMovimentacao {
  PENDENTE = "pendente",
  APROVADO = "aprovado",
  DESCONTADO = "descotado",
  REJEITADO = "rejeitado",
}

export enum TipoEvento {
  CHEGADA = "chegada",
  SAIDA_INTERVALO = "saida_intervalo",
  RETORNO = "retorno",
  SAIDA = "saida",
}

export enum StatusFechamento {
  ABERTO = "aberto",
  FECHADO = "fechado",
  APROVADO = "aprovado",
  PAGO = "pago",
}

export enum StatusEmprestimo {
  ATIVO = "ativo",
  PAGO = "pago",
  CANCELADO = "cancelado",
}

// ===== INTERFACES =====

/**
 * Apontamento diário: registro de entrada, intervalo, retorno e saída
 */
export interface Apontamento {
  id: string;
  prestador_id: string;
  data: string; // ISO 8601
  entrada: string; // HH:MM
  saida_intervalo?: string;
  retorno_intervalo?: string;
  saida_final: string; // HH:MM
  status: StatusApontamento;
  observacoes?: string;
  criado_em: string; // ISO 8601 timestamp
  atualizado_em: string; // ISO 8601 timestamp
}

/**
 * Histórico de eventos de horários com rastreamento de alterações
 */
export interface HistoricoHorario {
  id: string;
  apontamento_id: string;
  tipo_evento: TipoEvento;
  horario: string; // HH:MM
  horario_original?: string;
  justificativa_retificacao?: string;
  criado_em: string; // ISO 8601 timestamp
}

/**
 * Item remunerável: componentes de remuneração (diária, Airbnb, urgência, etc.)
 */
export interface ItemRemuneravel {
  id: string;
  apontamento_id: string;
  tipo: TipoRubrica;
  rubrica: string;
  valor_base: number;
  adicional_percentual: number; // Ex: 10 para 10%
  valor_final: number; // valor_base + (valor_base * adicional_percentual / 100)
  observacao?: string;
  criado_em: string; // ISO 8601 timestamp
}

/**
 * Movimentação financeira: vale, empréstimo, adiantamento
 */
export interface MovimentacaoFinanceira {
  id: string;
  apontamento_id: string;
  tipo: TipoMovimentacao;
  valor: number;
  data_solicitacao: string; // ISO 8601
  data_aprovacao?: string;
  data_desconto?: string;
  motivo?: string;
  status: StatusMovimentacao;
  gestor_id?: string;
  criado_em: string; // ISO 8601 timestamp
}

/**
 * Fechamento semanal: consolidação de apontamentos
 */
export interface FechamentoSemanal {
  id: string;
  prestador_id: string;
  data_inicio: string; // ISO 8601
  data_fim: string; // ISO 8601
  valor_bruto: number;
  descontos_total: number;
  valor_liquido: number;
  status: StatusFechamento;
  aprovado_em?: string; // ISO 8601 timestamp
  gestor_id?: string;
  criado_em: string; // ISO 8601 timestamp
}

/**
 * Empréstimo: contrato de empréstimo com juros e parcelas
 */
export interface Emprestimo {
  id: string;
  prestador_id: string;
  valor_original: number;
  taxa_juros: number; // Percentual mensal (ex: 2.5 para 2.5% a.m.)
  parcelas_total: number;
  parcelas_pagas: number;
  valor_total_com_juros: number;
  data_contratacao: string; // ISO 8601
  data_vencimento: string; // ISO 8601
  status: StatusEmprestimo;
  observacao?: string;
  criado_em: string; // ISO 8601 timestamp
}

/**
 * Retificação: alteração de apontamento com auditoria
 */
export interface Retificacao {
  id: string;
  apontamento_id: string;
  campo_alterado: string;
  valor_anterior?: string;
  valor_novo?: string;
  motivo?: string;
  autor_id: string;
  data_retificacao: string; // ISO 8601
  aprovada_em?: string; // ISO 8601 timestamp
  observacao?: string;
  criado_em: string; // ISO 8601 timestamp
}

/**
 * Parâmetro operacional: valores de referência para cálculos
 */
export interface ParametroOperacional {
  id: string;
  parametro: string; // Ex: "combustivel_litro", "combustivel_km_litro", "reajuste_ipca_proxima"
  valor?: number;
  valor_descricao?: string;
  vigencia_inicio: string; // ISO 8601
  vigencia_fim?: string; // ISO 8601, NULL = vigente
  atualizado_em: string; // ISO 8601 timestamp
}

// ===== TIPOS PARA CÁLCULOS =====

/**
 * Cálculo de urgência: baseado em tabela de valores mínimos por dia/horário
 */
export type CalculoUrgencia = {
  dia_semana: "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom";
  tipo_dia: "util" | "sabado" | "domingo_feriado";
  valor_minimo: number;
  adicional_noturno?: number; // Se aplicável
};

/**
 * Cálculo de Airbnb: tabelas por trimestre com variação de proximidade ao imóvel
 */
export type CalculoAirbnb = {
  trimestre: "1Q" | "2Q" | "3Q" | "4Q";
  dentro_propriedade: number;
  fora_propriedade_uteis: number;
  sabado_domingo_feriado: number;
};

/**
 * Cálculo de combustível: valor por litro e rendimento
 */
export type CalculoCombustivel = {
  valor_litro: number;
  km_por_litro: number;
  distancia_km: number;
  valor_reembolso?: number; // valor_litro * (distancia_km / km_por_litro)
};

// ===== CONSTANTES =====

/**
 * Tabela Airbnb 1º Trimestre (padrão base)
 */
export const TABELA_AIRBNB_1Q: Record<string, number> = {
  dentro: 31.5,
  fora_uteis: 42.0,
  sabado_domingo_feriado: 63.0,
};

/**
 * Tabela Airbnb 2º Trimestre (acréscimo de 20% sobre 1Q)
 */
export const TABELA_AIRBNB_2Q: Record<string, number> = {
  dentro: TABELA_AIRBNB_1Q.dentro * 1.2, // 37.80
  fora_uteis: TABELA_AIRBNB_1Q.fora_uteis * 1.2, // 50.40
  sabado_domingo_feriado: TABELA_AIRBNB_1Q.sabado_domingo_feriado * 1.2, // 75.60
};

/**
 * Tabela Airbnb 3º Trimestre (acréscimo de 30% sobre 1Q)
 */
export const TABELA_AIRBNB_3Q: Record<string, number> = {
  dentro: TABELA_AIRBNB_1Q.dentro * 1.3, // 40.95
  fora_uteis: TABELA_AIRBNB_1Q.fora_uteis * 1.3, // 54.60
  sabado_domingo_feriado: TABELA_AIRBNB_1Q.sabado_domingo_feriado * 1.3, // 81.90
};

/**
 * Tabela Airbnb 4º Trimestre (acréscimo de 50% sobre 1Q)
 */
export const TABELA_AIRBNB_4Q: Record<string, number> = {
  dentro: TABELA_AIRBNB_1Q.dentro * 1.5, // 47.25
  fora_uteis: TABELA_AIRBNB_1Q.fora_uteis * 1.5, // 63.00
  sabado_domingo_feriado: TABELA_AIRBNB_1Q.sabado_domingo_feriado * 1.5, // 94.50
};

/**
 * Mapa de trimestres para suas respectivas tabelas
 */
export const TABELAS_AIRBNB: Record<"1Q" | "2Q" | "3Q" | "4Q", Record<string, number>> = {
  "1Q": TABELA_AIRBNB_1Q,
  "2Q": TABELA_AIRBNB_2Q,
  "3Q": TABELA_AIRBNB_3Q,
  "4Q": TABELA_AIRBNB_4Q,
};

/**
 * Urgência: valores mínimos por tipo de dia
 */
export const URGENCIA_MINIMA_UTEIS = 50.0; // Seg-Sex
export const URGENCIA_MINIMA_SABADO = 58.0; // Sábado
export const URGENCIA_MINIMA_DOMINGO_FERIADO = 62.5; // Domingo/Feriado

/**
 * Deslocamentos: valores fixos por destino/serviço
 */
export const DESLOCAMENTO_CARVOEIRA_CORREGO = 21.0; // Reembolso fixo
export const DESLOCAMENTO_BUSCA_MATERIAIS = 30.0; // Reembolso fixo

/**
 * Combustível: parâmetros de reembolso
 */
export const COMBUSTIVEL = {
  valor_litro: 6.5,
  km_por_litro: 10,
};

/**
 * Sequência válida de eventos de um apontamento (valida ordem cronológica)
 */
export const SEQUENCIA_VALIDA_EVENTOS: TipoEvento[] = [
  TipoEvento.CHEGADA,
  TipoEvento.SAIDA_INTERVALO,
  TipoEvento.RETORNO,
  TipoEvento.SAIDA,
];

// ===== FUNÇÕES DE VALIDAÇÃO =====

/**
 * Valida sequência cronológica de eventos
 * Garante que entrada → intervalo → retorno → saída estejam em ordem
 */
export function validarSequenciaEventos(
  eventos: Array<{ tipo_evento: TipoEvento; horario: string }>
): { valido: boolean; erros: string[] } {
  const erros: string[] = [];

  if (eventos.length === 0) {
    erros.push("Nenhum evento registrado");
    return { valido: false, erros };
  }

  // Extrair ordem dos eventos presentes
  const eventosPresentesOrdenados = eventos
    .map((e, idx) => ({ ...e, indice_original: idx }))
    .sort((a, b) => {
      const indiceA = SEQUENCIA_VALIDA_EVENTOS.indexOf(a.tipo_evento);
      const indiceB = SEQUENCIA_VALIDA_EVENTOS.indexOf(b.tipo_evento);
      return indiceA - indiceB;
    });

  // Verificar se os índices mantêm a ordem original (implica que estão em ordem cronológica)
  for (let i = 0; i < eventosPresentesOrdenados.length - 1; i++) {
    const eventoAtual = eventosPresentesOrdenados[i];
    const proximoEvento = eventosPresentesOrdenados[i + 1];

    // Comparar tempos para garantir ordem cronológica
    if (eventoAtual.horario >= proximoEvento.horario) {
      erros.push(
        `Eventos fora de ordem: ${eventoAtual.tipo_evento} (${eventoAtual.horario}) >= ${proximoEvento.tipo_evento} (${proximoEvento.horario})`
      );
    }
  }

  // Validar que primeiro evento é chegada
  if (eventosPresentesOrdenados[0]?.tipo_evento !== TipoEvento.CHEGADA) {
    erros.push("Primeiro evento deve ser chegada (entrada)");
  }

  // Validar que último evento é saída
  const ultimoEvento = eventosPresentesOrdenados[eventosPresentesOrdenados.length - 1];
  if (ultimoEvento?.tipo_evento !== TipoEvento.SAIDA) {
    erros.push("Último evento deve ser saída final");
  }

  return { valido: erros.length === 0, erros };
}

/**
 * Valida integridade de um apontamento
 */
export function validarApontamento(apontamento: Partial<Apontamento>): {
  valido: boolean;
  erros: string[];
} {
  const erros: string[] = [];

  if (!apontamento.prestador_id) {
    erros.push("ID do prestador é obrigatório");
  }

  if (!apontamento.data) {
    erros.push("Data do apontamento é obrigatória");
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(apontamento.data)) {
    erros.push("Data deve estar em formato ISO 8601 (YYYY-MM-DD)");
  }

  if (!apontamento.entrada) {
    erros.push("Hora de entrada é obrigatória");
  } else if (!/^\d{2}:\d{2}$/.test(apontamento.entrada)) {
    erros.push("Hora de entrada deve estar em formato HH:MM");
  }

  if (!apontamento.saida_final) {
    erros.push("Hora de saída final é obrigatória");
  } else if (!/^\d{2}:\d{2}$/.test(apontamento.saida_final)) {
    erros.push("Hora de saída final deve estar em formato HH:MM");
  }

  // Se entrada e saída estão presentes, validar ordem
  if (apontamento.entrada && apontamento.saida_final) {
    if (apontamento.entrada >= apontamento.saida_final) {
      erros.push("Hora de saída deve ser posterior à hora de entrada");
    }
  }

  // Validar intervalo se presente
  if (apontamento.saida_intervalo || apontamento.retorno_intervalo) {
    if (!apontamento.saida_intervalo) {
      erros.push("Se há retorno de intervalo, saída de intervalo é obrigatória");
    }
    if (!apontamento.retorno_intervalo) {
      erros.push("Se há saída de intervalo, retorno de intervalo é obrigatório");
    }

    if (apontamento.saida_intervalo && apontamento.retorno_intervalo) {
      if (apontamento.saida_intervalo >= apontamento.retorno_intervalo) {
        erros.push("Retorno de intervalo deve ser posterior à saída de intervalo");
      }

      // Verificar ordem com entrada/saída
      if (apontamento.entrada && apontamento.saida_intervalo) {
        if (apontamento.entrada >= apontamento.saida_intervalo) {
          erros.push("Saída de intervalo deve ser posterior à entrada");
        }
      }

      if (apontamento.retorno_intervalo && apontamento.saida_final) {
        if (apontamento.retorno_intervalo >= apontamento.saida_final) {
          erros.push("Saída final deve ser posterior ao retorno de intervalo");
        }
      }
    }
  }

  return { valido: erros.length === 0, erros };
}

/**
 * Valida item remunerável
 */
export function validarItemRemuneravel(item: Partial<ItemRemuneravel>): {
  valido: boolean;
  erros: string[];
} {
  const erros: string[] = [];

  if (!item.apontamento_id) {
    erros.push("ID do apontamento é obrigatório");
  }

  if (!item.tipo || !Object.values(TipoRubrica).includes(item.tipo as TipoRubrica)) {
    erros.push("Tipo de rubrica inválido");
  }

  if (!item.rubrica || item.rubrica.trim().length === 0) {
    erros.push("Rubrica é obrigatória");
  }

  if (item.valor_base === undefined || item.valor_base < 0) {
    erros.push("Valor base deve ser um número não-negativo");
  }

  if (item.adicional_percentual === undefined || item.adicional_percentual < 0) {
    erros.push("Adicional percentual deve ser um número não-negativo");
  }

  if (item.valor_final === undefined || item.valor_final < 0) {
    erros.push("Valor final deve ser um número não-negativo");
  }

  return { valido: erros.length === 0, erros };
}

/**
 * Valida movimentação financeira
 */
export function validarMovimentacaoFinanceira(
  movimentacao: Partial<MovimentacaoFinanceira>
): {
  valido: boolean;
  erros: string[];
} {
  const erros: string[] = [];

  if (!movimentacao.apontamento_id) {
    erros.push("ID do apontamento é obrigatório");
  }

  if (!movimentacao.tipo || !Object.values(TipoMovimentacao).includes(movimentacao.tipo as TipoMovimentacao)) {
    erros.push("Tipo de movimentação inválido");
  }

  if (movimentacao.valor === undefined || movimentacao.valor <= 0) {
    erros.push("Valor deve ser positivo");
  }

  if (!movimentacao.data_solicitacao) {
    erros.push("Data de solicitação é obrigatória");
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(movimentacao.data_solicitacao)) {
    erros.push("Data de solicitação deve estar em formato ISO 8601");
  }

  return { valido: erros.length === 0, erros };
}

/**
 * Valida empréstimo
 */
export function validarEmprestimo(emprestimo: Partial<Emprestimo>): {
  valido: boolean;
  erros: string[];
} {
  const erros: string[] = [];

  if (!emprestimo.prestador_id) {
    erros.push("ID do prestador é obrigatório");
  }

  if (emprestimo.valor_original === undefined || emprestimo.valor_original <= 0) {
    erros.push("Valor original deve ser positivo");
  }

  if (emprestimo.taxa_juros === undefined || emprestimo.taxa_juros < 0) {
    erros.push("Taxa de juros deve ser não-negativa");
  }

  if (emprestimo.parcelas_total === undefined || emprestimo.parcelas_total <= 0) {
    erros.push("Parcelas totais deve ser positivo");
  }

  if (emprestimo.parcelas_pagas === undefined || emprestimo.parcelas_pagas < 0) {
    erros.push("Parcelas pagas deve ser não-negativo");
  }

  if (emprestimo.parcelas_pagas !== undefined && emprestimo.parcelas_total !== undefined) {
    if (emprestimo.parcelas_pagas > emprestimo.parcelas_total) {
      erros.push("Parcelas pagas não pode ser maior que parcelas totais");
    }
  }

  if (!emprestimo.data_contratacao) {
    erros.push("Data de contratação é obrigatória");
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(emprestimo.data_contratacao)) {
    erros.push("Data de contratação deve estar em formato ISO 8601");
  }

  if (!emprestimo.data_vencimento) {
    erros.push("Data de vencimento é obrigatória");
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(emprestimo.data_vencimento)) {
    erros.push("Data de vencimento deve estar em formato ISO 8601");
  }

  if (emprestimo.data_contratacao && emprestimo.data_vencimento) {
    if (emprestimo.data_contratacao >= emprestimo.data_vencimento) {
      erros.push("Data de vencimento deve ser posterior à data de contratação");
    }
  }

  return { valido: erros.length === 0, erros };
}

// ===== FUNÇÕES DE CÁLCULO =====

/**
 * Calcula valor total de um item remunerável considerando adicional percentual
 */
export function calcularValorRemuneravel(valor_base: number, adicional_percentual: number): number {
  return Math.round((valor_base + (valor_base * adicional_percentual) / 100) * 100) / 100;
}

/**
 * Calcula valor total de um empréstimo com juros compostos
 */
export function calcularValorEmprestimoComJuros(
  valor_original: number,
  taxa_juros: number,
  parcelas_total: number
): number {
  // Juros compostos: V = P * (1 + i)^n
  const taxa_decimal = taxa_juros / 100;
  const valor_total = valor_original * Math.pow(1 + taxa_decimal, parcelas_total);
  return Math.round(valor_total * 100) / 100;
}

/**
 * Calcula reembolso de combustível baseado em km percorridos
 */
export function calcularReembolsoCombustivel(distancia_km: number): number {
  const litros_necessarios = distancia_km / COMBUSTIVEL.km_por_litro;
  const reembolso = litros_necessarios * COMBUSTIVEL.valor_litro;
  return Math.round(reembolso * 100) / 100;
}

/**
 * Obtém tabela de Airbnb para um trimestre específico
 */
export function obterTabelaAirbnb(trimestre: "1Q" | "2Q" | "3Q" | "4Q"): Record<string, number> {
  return TABELAS_AIRBNB[trimestre];
}

/**
 * Gera lançamentos contábeis da remuneração para integração com ledger
 * Contas: 5.1 (Remuneração de Prestadores), 3.1.05 (Remuneração a Pagar)
 */
export function gerarLancamentosRemuneracao(
  apontamento: Apontamento,
  itens: ItemRemuneravel[],
  fechamento: FechamentoSemanal
): Array<{
  descricao: string;
  conta_debito: string;
  conta_credito: string;
  valor: number;
  origem_modulo: string;
  origem_id: string;
}> {
  const lancamentos: Array<{
    descricao: string;
    conta_debito: string;
    conta_credito: string;
    valor: number;
    origem_modulo: string;
    origem_id: string;
  }> = [];

  // Lançamento principal: remuneração bruta
  lancamentos.push({
    descricao: `Remuneração Prestador - Semana ${fechamento.data_inicio} a ${fechamento.data_fim}`,
    conta_debito: "5.1.01", // Despesa com Remuneração de Prestadores
    conta_credito: "3.1.05", // Remuneração de Prestador a Pagar
    valor: fechamento.valor_bruto,
    origem_modulo: "apontamento-prestador",
    origem_id: fechamento.id,
  });

  // Lançamento de descontos (se houver)
  if (fechamento.descontos_total > 0) {
    lancamentos.push({
      descricao: `Descontos - Semana ${fechamento.data_inicio} a ${fechamento.data_fim}`,
      conta_debito: "3.1.05", // Remuneração de Prestador a Pagar
      conta_credito: "1.1.01", // Caixa (redução da obrigação)
      valor: fechamento.descontos_total,
      origem_modulo: "apontamento-prestador",
      origem_id: fechamento.id,
    });
  }

  return lancamentos;
}

/**
 * Gera lançamentos contábeis de empréstimo para integração com ledger
 * Contas: 2.1 (Empréstimos a Pagar), 1.1 (Caixa)
 */
export function gerarLancamentosEmprestimo(emprestimo: Emprestimo): Array<{
  descricao: string;
  conta_debito: string;
  conta_credito: string;
  valor: number;
  origem_modulo: string;
  origem_id: string;
}> {
  return [
    {
      descricao: `Empréstimo Concedido ao Prestador - ${emprestimo.prestador_id}`,
      conta_debito: "2.1.02", // Empréstimos a Pagar (Passivo)
      conta_credito: "1.1.01", // Caixa (Ativo)
      valor: emprestimo.valor_original,
      origem_modulo: "apontamento-prestador",
      origem_id: emprestimo.id,
    },
    {
      descricao: `Juros de Empréstimo - ${emprestimo.prestador_id}`,
      conta_debito: "5.3.01", // Despesa com Juros
      conta_credito: "2.1.02", // Empréstimos a Pagar
      valor: emprestimo.valor_total_com_juros - emprestimo.valor_original,
      origem_modulo: "apontamento-prestador",
      origem_id: emprestimo.id,
    },
  ];
}
