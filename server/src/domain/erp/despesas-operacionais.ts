/**
 * Despesas Operacionais com Automação (4A.1)
 * Agendamento e processamento automático de despesas recorrentes
 */

export interface DespesaOperacional {
  id: string;
  imovel_id: string;
  descricao: string;
  valor: number;
  tipo: "CONDOMINIO" | "AGUA" | "LUZ" | "GAS" | "INTERNET" | "MANUTENCAO" | "OUTRA";
  categoria_contabil: string; // ex: "3.1.10" (Despesa Operacional)
  recorrencia: "mensal" | "trimestral" | "semestral" | "anual";
  dia_vencimento: number; // 1-31
  ativa: boolean;
  data_criacao: string;
  observacao?: string;
}

export interface ProcessamentoDespesa {
  id: string;
  despesa_id: string;
  mes: string; // YYYY-MM
  data_processamento: string;
  valor_processado: number;
  status: "agendado" | "processado" | "pago" | "erro";
  data_pagamento?: string;
  comprovante_id?: string;
  mensagem_erro?: string;
}

export interface AgendadorDespesas {
  id: string;
  imovel_id: string;
  proxima_execucao: string; // ISO 8601
  despesas_pendentes: string[]; // IDs de despesas
  status: "ativo" | "pausado" | "erro";
}

/**
 * Calcula próxima data de vencimento baseado na recorrência
 */
export function calcularProximoVencimento(
  despesa: DespesaOperacional,
  dataReferencia: Date = new Date()
): Date {
  const proximoVencimento = new Date(dataReferencia);
  proximoVencimento.setDate(despesa.dia_vencimento);

  // Se já passou esse dia neste mês, calcula próximo período
  if (proximoVencimento < dataReferencia) {
    if (despesa.recorrencia === "mensal") {
      proximoVencimento.setMonth(proximoVencimento.getMonth() + 1);
    } else if (despesa.recorrencia === "trimestral") {
      proximoVencimento.setMonth(proximoVencimento.getMonth() + 3);
    } else if (despesa.recorrencia === "semestral") {
      proximoVencimento.setMonth(proximoVencimento.getMonth() + 6);
    } else if (despesa.recorrencia === "anual") {
      proximoVencimento.setFullYear(proximoVencimento.getFullYear() + 1);
    }
  }

  return proximoVencimento;
}

/**
 * Cria nova despesa operacional
 */
export function criarDespesaOperacional(
  dados: Omit<DespesaOperacional, "id" | "data_criacao">
): DespesaOperacional {
  return {
    id: `DSP-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    data_criacao: new Date().toISOString(),
    ...dados,
  };
}

/**
 * Agenda processamento de despesa para um mês específico
 */
export function agendarDespesaOperacional(
  despesa: DespesaOperacional,
  mes: string // YYYY-MM
): ProcessamentoDespesa {
  return {
    id: `PRP-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    despesa_id: despesa.id,
    mes,
    data_processamento: new Date().toISOString(),
    valor_processado: despesa.valor,
    status: "agendado",
  };
}

/**
 * Processa despesas agendadas para um mês
 * Gera lançamentos contábeis automáticos
 */
export function processarDespesasAgendadas(
  despesas: DespesaOperacional[],
  mes: string // YYYY-MM
): ProcessamentoDespesa[] {
  const processados: ProcessamentoDespesa[] = [];

  for (const despesa of despesas) {
    if (!despesa.ativa) continue;

    const processamento = agendarDespesaOperacional(despesa, mes);
    processamento.status = "processado";
    processamento.data_processamento = new Date().toISOString();

    processados.push(processamento);
  }

  return processados;
}

/**
 * Valida integridade de uma despesa operacional
 */
export function validarDespesaOperacional(
  despesa: DespesaOperacional
): { valido: boolean; erros: string[] } {
  const erros: string[] = [];

  if (!despesa.id) erros.push("ID da despesa é obrigatório");
  if (!despesa.imovel_id) erros.push("ID do imóvel é obrigatório");
  if (despesa.valor <= 0) erros.push("Valor deve ser positivo");
  if (despesa.dia_vencimento < 1 || despesa.dia_vencimento > 31) {
    erros.push("Dia de vencimento deve estar entre 1 e 31");
  }
  if (!["mensal", "trimestral", "semestral", "anual"].includes(despesa.recorrencia)) {
    erros.push("Recorrência inválida");
  }

  return { valido: erros.length === 0, erros };
}

/**
 * Cria agendador para um imóvel
 */
export function criarAgendadorDespesas(imovel_id: string): AgendadorDespesas {
  return {
    id: `AGD-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    imovel_id,
    proxima_execucao: new Date().toISOString(),
    despesas_pendentes: [],
    status: "ativo",
  };
}

/**
 * Atualiza despesas pendentes no agendador
 */
export function atualizarDespesasPendentes(
  agendador: AgendadorDespesas,
  despesas: DespesaOperacional[]
): AgendadorDespesas {
  const despesasAtivas = despesas
    .filter((d) => d.ativa && d.imovel_id === agendador.imovel_id)
    .map((d) => d.id);

  return {
    ...agendador,
    despesas_pendentes: despesasAtivas,
  };
}

/**
 * Processa ciclo de despesas agendadas para um mês
 * Simula execução de cron job
 */
export function executarCicloDespesas(
  despesas: DespesaOperacional[],
  mes: string // YYYY-MM
): { processados: ProcessamentoDespesa[]; lancamentos: Array<{
  descricao: string;
  conta_debito: string;
  conta_credito: string;
  valor: number;
}> } {
  const processados = processarDespesasAgendadas(despesas, mes);

  const lancamentos = processados.map((p) => {
    const despesa = despesas.find((d) => d.id === p.despesa_id)!;
    return {
      descricao: `${despesa.descricao} - ${mes}`,
      conta_debito: despesa.categoria_contabil, // Despesa
      conta_credito: "1.0.01", // Caixa (padrão)
      valor: p.valor_processado,
    };
  });

  return { processados, lancamentos };
}

/**
 * Marca despesa como paga
 */
export function marcarComoPago(
  processamento: ProcessamentoDespesa,
  data_pagamento: string = new Date().toISOString().slice(0, 10),
  comprovante_id?: string
): ProcessamentoDespesa {
  return {
    ...processamento,
    status: "pago",
    data_pagamento,
    comprovante_id,
  };
}

/**
 * Gera relatório de despesas por tipo e período
 */
export function gerarRelatorioDespesas(
  despesas: DespesaOperacional[],
  processados: ProcessamentoDespesa[]
): Record<string, { quantidade: number; valor_total: number }> {
  const relatorio: Record<string, { quantidade: number; valor_total: number }> = {};

  for (const p of processados) {
    const despesa = despesas.find((d) => d.id === p.despesa_id);
    if (!despesa) continue;

    if (!relatorio[despesa.tipo]) {
      relatorio[despesa.tipo] = { quantidade: 0, valor_total: 0 };
    }

    relatorio[despesa.tipo].quantidade += 1;
    relatorio[despesa.tipo].valor_total += p.valor_processado;
  }

  return relatorio;
}
