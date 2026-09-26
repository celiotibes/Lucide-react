/**
 * Integração: Apontamento do Prestador → Ledger Central
 * Persistência e rastreamento de urgências, Airbnb, combustível, horas e empréstimos
 *
 * Fluxo:
 * calcularUrgencia()/calcularAirbnb()/etc. (apontamento-calculos)
 *   → registrarApontamento*NoLedger()
 *   → registrarLancamentoContabil() (origem_modulo = 'apontamento-prestador')
 *   → apontamento_ledger_entries (rastreamento bidirecional)
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { registrarLancamentoContabil, LancamentoContabil } from "./ledger";

/**
 * Rastreamento bidirecional: apontamento ↔ ledger
 * Permite auditoria completa e reversão de lançamentos
 */
export interface ApontamentoLedgerEntry {
  id?: number;
  apontamento_id: number;
  tipo_apontamento: "urgencia" | "airbnb" | "combustivel" | "horas" | "emprestimo";
  ledger_entry_id: number;
  ledger_entry_id_contrapartida?: number; // Para lançamentos duplos (débito + crédito)
  prestador_id: number;
  entidade_id: number;
  periodo_id: number;
  valor: number;
  conta_debito_id: number;
  conta_credito_id: number;
  descricao: string;
  data_criacao?: string;
}

/**
 * Contas contábeis mapeadas para apontamentos
 * Segue plano de contas padrão (5.x = Despesas, 3.x = Ativos)
 */
const CONTAS_APONTAMENTO = {
  // Despesas (Débito)
  REMUNERACAO_URGENCIA: 27, // 5.1.01 - Despesa com Remuneração - Urgência
  REMUNERACAO_AIRBNB: 28, // 5.1.02 - Despesa com Remuneração - Airbnb
  REMUNERACAO_HORAS: 29, // 5.1.03 - Despesa com Remuneração - Horas
  COMBUSTIVEL_DESLOCAMENTO: 30, // 5.2.01 - Despesa com Combustível
  JUROS_EMPRESTIMO: 31, // 5.3.01 - Despesa com Juros
  EMPRESTIMO_CONCEDIDO: 32, // 5.3.02 - Despesa com Empréstimos Concedidos

  // Ativos/Contra-Passivos (Crédito)
  ADIANTAMENTO_PRESTADOR: 11, // 3.1.05 - Adiantamentos a Prestadores (ativo circulante)
  PROVISAO_EMPRESTIMO: 12, // 4.1.02 - Provisão para Empréstimos (passivo)
};

/**
 * Registrar urgência no ledger central
 * Cria lançamento duplo: débito Urgência + crédito Adiantamento
 */
export function registrarApontamentoUrgenciaNoLedger(
  db: Database,
  resultado_urgencia: any, // ResultadoUrgencia
  apontamento_id: number,
  prestador_id: number,
  entidade_id: number,
  periodo_id: number
): ApontamentoLedgerEntry {
  // Validações
  if (!resultado_urgencia || resultado_urgencia.valor_final <= 0) {
    throw new Error("Urgência: valor_final deve ser positivo");
  }

  if (!apontamento_id || !prestador_id || !entidade_id || !periodo_id) {
    throw new Error("Urgência: parâmetros obrigatórios ausentes");
  }

  const valor = resultado_urgencia.valor_final;
  const descricao = `Urgência - ${resultado_urgencia.memoria_calculo?.data_atendimento || 'N/A'} (${resultado_urgencia.memoria_calculo?.minutos_atendimento || 0} min)`;

  // Lançamento débito: Despesa com Urgência
  const lancamento_debito = registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTAS_APONTAMENTO.REMUNERACAO_URGENCIA,
    data_lancamento: resultado_urgencia.memoria_calculo?.data_atendimento || new Date().toISOString().split("T")[0],
    valor_debito: valor,
    descricao,
    origem_modulo: "apontamento-prestador",
    origem_id: apontamento_id,
    referencia_documento: `APT-URG-${apontamento_id}`,
  });

  if (lancamento_debito <= 0) {
    throw new Error("Falha ao registrar lançamento débito de urgência");
  }

  // Lançamento crédito: Adiantamento a Prestador
  const lancamento_credito = registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTAS_APONTAMENTO.ADIANTAMENTO_PRESTADOR,
    data_lancamento: resultado_urgencia.memoria_calculo?.data_atendimento || new Date().toISOString().split("T")[0],
    valor_credito: valor,
    descricao: `Adiant. Prestador - Urgência ${apontamento_id}`,
    origem_modulo: "apontamento-prestador",
    origem_id: apontamento_id,
    referencia_documento: `APT-URG-${apontamento_id}`,
  });

  if (lancamento_credito <= 0) {
    throw new Error("Falha ao registrar lançamento crédito de urgência");
  }

  // Registrar rastreamento
  const ledger_entry_id = registrarRastreamentoApontamento(db, {
    apontamento_id,
    tipo_apontamento: "urgencia",
    ledger_entry_id: lancamento_debito,
    ledger_entry_id_contrapartida: lancamento_credito,
    prestador_id,
    entidade_id,
    periodo_id,
    valor,
    conta_debito_id: CONTAS_APONTAMENTO.REMUNERACAO_URGENCIA,
    conta_credito_id: CONTAS_APONTAMENTO.ADIANTAMENTO_PRESTADOR,
    descricao,
  });

  return {
    apontamento_id,
    tipo_apontamento: "urgencia",
    ledger_entry_id: lancamento_debito,
    ledger_entry_id_contrapartida: lancamento_credito,
    prestador_id,
    entidade_id,
    periodo_id,
    valor,
    conta_debito_id: CONTAS_APONTAMENTO.REMUNERACAO_URGENCIA,
    conta_credito_id: CONTAS_APONTAMENTO.ADIANTAMENTO_PRESTADOR,
    descricao,
  };
}

/**
 * Registrar Airbnb no ledger central
 * Cria lançamento duplo: débito Airbnb + crédito Adiantamento
 */
export function registrarApontamentoAirbnbNoLedger(
  db: Database,
  resultado_airbnb: any, // ResultadoAirbnb
  apontamento_id: number,
  prestador_id: number,
  entidade_id: number,
  periodo_id: number
): ApontamentoLedgerEntry {
  // Validações
  if (!resultado_airbnb || resultado_airbnb.valor_final <= 0) {
    throw new Error("Airbnb: valor_final deve ser positivo");
  }

  if (!apontamento_id || !prestador_id || !entidade_id || !periodo_id) {
    throw new Error("Airbnb: parâmetros obrigatórios ausentes");
  }

  const valor = resultado_airbnb.valor_final;
  const descricao = `${resultado_airbnb.rubrica} - ${resultado_airbnb.memoria_calculo?.tipo_atividade || 'N/A'}`;

  // Lançamento débito: Despesa com Airbnb
  const lancamento_debito = registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTAS_APONTAMENTO.REMUNERACAO_AIRBNB,
    data_lancamento: resultado_airbnb.memoria_calculo?.data_calculo || new Date().toISOString().split("T")[0],
    valor_debito: valor,
    descricao,
    origem_modulo: "apontamento-prestador",
    origem_id: apontamento_id,
    referencia_documento: `APT-AIRBNB-${apontamento_id}`,
  });

  if (lancamento_debito <= 0) {
    throw new Error("Falha ao registrar lançamento débito de Airbnb");
  }

  // Lançamento crédito: Adiantamento a Prestador
  const lancamento_credito = registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTAS_APONTAMENTO.ADIANTAMENTO_PRESTADOR,
    data_lancamento: resultado_airbnb.memoria_calculo?.data_calculo || new Date().toISOString().split("T")[0],
    valor_credito: valor,
    descricao: `Adiant. Prestador - Airbnb ${apontamento_id}`,
    origem_modulo: "apontamento-prestador",
    origem_id: apontamento_id,
    referencia_documento: `APT-AIRBNB-${apontamento_id}`,
  });

  if (lancamento_credito <= 0) {
    throw new Error("Falha ao registrar lançamento crédito de Airbnb");
  }

  // Registrar rastreamento
  const ledger_entry_id = registrarRastreamentoApontamento(db, {
    apontamento_id,
    tipo_apontamento: "airbnb",
    ledger_entry_id: lancamento_debito,
    ledger_entry_id_contrapartida: lancamento_credito,
    prestador_id,
    entidade_id,
    periodo_id,
    valor,
    conta_debito_id: CONTAS_APONTAMENTO.REMUNERACAO_AIRBNB,
    conta_credito_id: CONTAS_APONTAMENTO.ADIANTAMENTO_PRESTADOR,
    descricao,
  });

  return {
    apontamento_id,
    tipo_apontamento: "airbnb",
    ledger_entry_id: lancamento_debito,
    ledger_entry_id_contrapartida: lancamento_credito,
    prestador_id,
    entidade_id,
    periodo_id,
    valor,
    conta_debito_id: CONTAS_APONTAMENTO.REMUNERACAO_AIRBNB,
    conta_credito_id: CONTAS_APONTAMENTO.ADIANTAMENTO_PRESTADOR,
    descricao,
  };
}

/**
 * Registrar combustível no ledger central
 * Cria lançamento duplo: débito Combustível + crédito Adiantamento
 */
export function registrarApontamentoCombustivelNoLedger(
  db: Database,
  resultado_combustivel: any, // ResultadoCombustivel
  apontamento_id: number,
  prestador_id: number,
  entidade_id: number,
  periodo_id: number
): ApontamentoLedgerEntry {
  // Validações
  if (!resultado_combustivel || resultado_combustivel.valor_reembolso <= 0) {
    throw new Error("Combustível: valor_reembolso deve ser positivo");
  }

  if (!apontamento_id || !prestador_id || !entidade_id || !periodo_id) {
    throw new Error("Combustível: parâmetros obrigatórios ausentes");
  }

  const valor = resultado_combustivel.valor_reembolso;
  const litros = resultado_combustivel.litros;
  const descricao = `Combustível - ${litros.toFixed(2)} litros`;

  // Lançamento débito: Despesa com Combustível
  const lancamento_debito = registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTAS_APONTAMENTO.COMBUSTIVEL_DESLOCAMENTO,
    data_lancamento: resultado_combustivel.memoria_calculo?.data_calculo || new Date().toISOString().split("T")[0],
    valor_debito: valor,
    descricao,
    origem_modulo: "apontamento-prestador",
    origem_id: apontamento_id,
    referencia_documento: `APT-COMB-${apontamento_id}`,
  });

  if (lancamento_debito <= 0) {
    throw new Error("Falha ao registrar lançamento débito de combustível");
  }

  // Lançamento crédito: Adiantamento a Prestador
  const lancamento_credito = registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTAS_APONTAMENTO.ADIANTAMENTO_PRESTADOR,
    data_lancamento: resultado_combustivel.memoria_calculo?.data_calculo || new Date().toISOString().split("T")[0],
    valor_credito: valor,
    descricao: `Adiant. Prestador - Combustível ${apontamento_id}`,
    origem_modulo: "apontamento-prestador",
    origem_id: apontamento_id,
    referencia_documento: `APT-COMB-${apontamento_id}`,
  });

  if (lancamento_credito <= 0) {
    throw new Error("Falha ao registrar lançamento crédito de combustível");
  }

  // Registrar rastreamento
  const ledger_entry_id = registrarRastreamentoApontamento(db, {
    apontamento_id,
    tipo_apontamento: "combustivel",
    ledger_entry_id: lancamento_debito,
    ledger_entry_id_contrapartida: lancamento_credito,
    prestador_id,
    entidade_id,
    periodo_id,
    valor,
    conta_debito_id: CONTAS_APONTAMENTO.COMBUSTIVEL_DESLOCAMENTO,
    conta_credito_id: CONTAS_APONTAMENTO.ADIANTAMENTO_PRESTADOR,
    descricao,
  });

  return {
    apontamento_id,
    tipo_apontamento: "combustivel",
    ledger_entry_id: lancamento_debito,
    ledger_entry_id_contrapartida: lancamento_credito,
    prestador_id,
    entidade_id,
    periodo_id,
    valor,
    conta_debito_id: CONTAS_APONTAMENTO.COMBUSTIVEL_DESLOCAMENTO,
    conta_credito_id: CONTAS_APONTAMENTO.ADIANTAMENTO_PRESTADOR,
    descricao,
  };
}

/**
 * Registrar horas no ledger central
 * Cria lançamento duplo: débito Horas + crédito Adiantamento
 */
export function registrarApontamentoHorasNoLedger(
  db: Database,
  resultado_horas: any, // ResultadoHoras
  apontamento_id: number,
  valor_hora: number,
  prestador_id: number,
  entidade_id: number,
  periodo_id: number
): ApontamentoLedgerEntry {
  // Validações
  if (!resultado_horas || resultado_horas.horas_efetivas < 0) {
    throw new Error("Horas: horas_efetivas deve ser não-negativo");
  }

  if (valor_hora <= 0) {
    throw new Error("Horas: valor_hora deve ser positivo");
  }

  if (!apontamento_id || !prestador_id || !entidade_id || !periodo_id) {
    throw new Error("Horas: parâmetros obrigatórios ausentes");
  }

  const valor_total = resultado_horas.horas_efetivas * valor_hora;
  const descricao = `Horas - ${resultado_horas.horas_efetivas.toFixed(2)}h @ R$${valor_hora.toFixed(2)}/h`;

  // Lançamento débito: Despesa com Horas
  const lancamento_debito = registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTAS_APONTAMENTO.REMUNERACAO_HORAS,
    data_lancamento: resultado_horas.memoria_calculo?.data_calculo || new Date().toISOString().split("T")[0],
    valor_debito: valor_total,
    descricao,
    origem_modulo: "apontamento-prestador",
    origem_id: apontamento_id,
    referencia_documento: `APT-HORAS-${apontamento_id}`,
  });

  if (lancamento_debito <= 0) {
    throw new Error("Falha ao registrar lançamento débito de horas");
  }

  // Lançamento crédito: Adiantamento a Prestador
  const lancamento_credito = registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTAS_APONTAMENTO.ADIANTAMENTO_PRESTADOR,
    data_lancamento: resultado_horas.memoria_calculo?.data_calculo || new Date().toISOString().split("T")[0],
    valor_credito: valor_total,
    descricao: `Adiant. Prestador - Horas ${apontamento_id}`,
    origem_modulo: "apontamento-prestador",
    origem_id: apontamento_id,
    referencia_documento: `APT-HORAS-${apontamento_id}`,
  });

  if (lancamento_credito <= 0) {
    throw new Error("Falha ao registrar lançamento crédito de horas");
  }

  // Registrar rastreamento
  const ledger_entry_id = registrarRastreamentoApontamento(db, {
    apontamento_id,
    tipo_apontamento: "horas",
    ledger_entry_id: lancamento_debito,
    ledger_entry_id_contrapartida: lancamento_credito,
    prestador_id,
    entidade_id,
    periodo_id,
    valor: valor_total,
    conta_debito_id: CONTAS_APONTAMENTO.REMUNERACAO_HORAS,
    conta_credito_id: CONTAS_APONTAMENTO.ADIANTAMENTO_PRESTADOR,
    descricao,
  });

  return {
    apontamento_id,
    tipo_apontamento: "horas",
    ledger_entry_id: lancamento_debito,
    ledger_entry_id_contrapartida: lancamento_credito,
    prestador_id,
    entidade_id,
    periodo_id,
    valor: valor_total,
    conta_debito_id: CONTAS_APONTAMENTO.REMUNERACAO_HORAS,
    conta_credito_id: CONTAS_APONTAMENTO.ADIANTAMENTO_PRESTADOR,
    descricao,
  };
}

/**
 * Registrar empréstimo no ledger central
 * Cria DOIS lançamentos: principal + juros (se houver)
 * - Principal: débito Empréstimo Concedido + crédito Adiantamento
 * - Juros: débito Despesa Juros + crédito Adiantamento
 */
export function registrarApontamentoEmprestimoNoLedger(
  db: Database,
  resultado_emprestimo: any, // ResultadoEmprestimo
  apontamento_id: number,
  prestador_id: number,
  entidade_id: number,
  periodo_id: number
): ApontamentoLedgerEntry[] {
  // Validações
  if (!resultado_emprestimo || resultado_emprestimo.valor_original <= 0) {
    throw new Error("Empréstimo: valor_original deve ser positivo");
  }

  if (!apontamento_id || !prestador_id || !entidade_id || !periodo_id) {
    throw new Error("Empréstimo: parâmetros obrigatórios ausentes");
  }

  const lançamentos: ApontamentoLedgerEntry[] = [];
  const valor_principal = resultado_emprestimo.valor_original;
  const total_juros = resultado_emprestimo.valor_total_com_juros - resultado_emprestimo.valor_original;

  // === LANÇAMENTO 1: Principal ===
  const descricao_principal = `Empréstimo Principal - ${resultado_emprestimo.memoria_calculo?.metodo || 'N/A'}`;

  const lancamento_principal_debito = registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTAS_APONTAMENTO.EMPRESTIMO_CONCEDIDO,
    data_lancamento: resultado_emprestimo.memoria_calculo?.data_calculo || new Date().toISOString().split("T")[0],
    valor_debito: valor_principal,
    descricao: descricao_principal,
    origem_modulo: "apontamento-prestador",
    origem_id: apontamento_id,
    referencia_documento: `APT-EMP-PRINC-${apontamento_id}`,
  });

  if (lancamento_principal_debito <= 0) {
    throw new Error("Falha ao registrar lançamento débito (principal) de empréstimo");
  }

  const lancamento_principal_credito = registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTAS_APONTAMENTO.ADIANTAMENTO_PRESTADOR,
    data_lancamento: resultado_emprestimo.memoria_calculo?.data_calculo || new Date().toISOString().split("T")[0],
    valor_credito: valor_principal,
    descricao: `Adiant. Prestador - Empréstimo Principal ${apontamento_id}`,
    origem_modulo: "apontamento-prestador",
    origem_id: apontamento_id,
    referencia_documento: `APT-EMP-PRINC-${apontamento_id}`,
  });

  if (lancamento_principal_credito <= 0) {
    throw new Error("Falha ao registrar lançamento crédito (principal) de empréstimo");
  }

  const rastreamento_principal = registrarRastreamentoApontamento(db, {
    apontamento_id,
    tipo_apontamento: "emprestimo",
    ledger_entry_id: lancamento_principal_debito,
    ledger_entry_id_contrapartida: lancamento_principal_credito,
    prestador_id,
    entidade_id,
    periodo_id,
    valor: valor_principal,
    conta_debito_id: CONTAS_APONTAMENTO.EMPRESTIMO_CONCEDIDO,
    conta_credito_id: CONTAS_APONTAMENTO.ADIANTAMENTO_PRESTADOR,
    descricao: descricao_principal,
  });

  lançamentos.push({
    apontamento_id,
    tipo_apontamento: "emprestimo",
    ledger_entry_id: lancamento_principal_debito,
    ledger_entry_id_contrapartida: lancamento_principal_credito,
    prestador_id,
    entidade_id,
    periodo_id,
    valor: valor_principal,
    conta_debito_id: CONTAS_APONTAMENTO.EMPRESTIMO_CONCEDIDO,
    conta_credito_id: CONTAS_APONTAMENTO.ADIANTAMENTO_PRESTADOR,
    descricao: descricao_principal,
  });

  // === LANÇAMENTO 2: Juros (se houver) ===
  if (total_juros > 0) {
    const descricao_juros = `Empréstimo Juros - Taxa ${resultado_emprestimo.taxa_juros_mensal}% ao mês`;

    const lancamento_juros_debito = registrarLancamentoContabil(db, {
      entidade_id,
      periodo_id,
      conta_id: CONTAS_APONTAMENTO.JUROS_EMPRESTIMO,
      data_lancamento: resultado_emprestimo.memoria_calculo?.data_calculo || new Date().toISOString().split("T")[0],
      valor_debito: total_juros,
      descricao: descricao_juros,
      origem_modulo: "apontamento-prestador",
      origem_id: apontamento_id,
      referencia_documento: `APT-EMP-JUROS-${apontamento_id}`,
    });

    if (lancamento_juros_debito <= 0) {
      throw new Error("Falha ao registrar lançamento débito (juros) de empréstimo");
    }

    const lancamento_juros_credito = registrarLancamentoContabil(db, {
      entidade_id,
      periodo_id,
      conta_id: CONTAS_APONTAMENTO.ADIANTAMENTO_PRESTADOR,
      data_lancamento: resultado_emprestimo.memoria_calculo?.data_calculo || new Date().toISOString().split("T")[0],
      valor_credito: total_juros,
      descricao: `Adiant. Prestador - Empréstimo Juros ${apontamento_id}`,
      origem_modulo: "apontamento-prestador",
      origem_id: apontamento_id,
      referencia_documento: `APT-EMP-JUROS-${apontamento_id}`,
    });

    if (lancamento_juros_credito <= 0) {
      throw new Error("Falha ao registrar lançamento crédito (juros) de empréstimo");
    }

    const rastreamento_juros = registrarRastreamentoApontamento(db, {
      apontamento_id,
      tipo_apontamento: "emprestimo",
      ledger_entry_id: lancamento_juros_debito,
      ledger_entry_id_contrapartida: lancamento_juros_credito,
      prestador_id,
      entidade_id,
      periodo_id,
      valor: total_juros,
      conta_debito_id: CONTAS_APONTAMENTO.JUROS_EMPRESTIMO,
      conta_credito_id: CONTAS_APONTAMENTO.ADIANTAMENTO_PRESTADOR,
      descricao: descricao_juros,
    });

    lançamentos.push({
      apontamento_id,
      tipo_apontamento: "emprestimo",
      ledger_entry_id: lancamento_juros_debito,
      ledger_entry_id_contrapartida: lancamento_juros_credito,
      prestador_id,
      entidade_id,
      periodo_id,
      valor: total_juros,
      conta_debito_id: CONTAS_APONTAMENTO.JUROS_EMPRESTIMO,
      conta_credito_id: CONTAS_APONTAMENTO.ADIANTAMENTO_PRESTADOR,
      descricao: descricao_juros,
    });
  }

  return lançamentos;
}

/**
 * Registrar rastreamento bidirecional no banco
 * Permite auditoria e reversão de lançamentos
 */
function registrarRastreamentoApontamento(
  db: Database,
  entrada: ApontamentoLedgerEntry
): number {
  executar(
    db,
    `INSERT INTO apontamento_ledger_entries (
      apontamento_id, tipo_apontamento, ledger_entry_id,
      ledger_entry_id_contrapartida, prestador_id, entidade_id,
      periodo_id, valor, conta_debito_id, conta_credito_id,
      descricao, data_criacao
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      entrada.apontamento_id,
      entrada.tipo_apontamento,
      entrada.ledger_entry_id,
      entrada.ledger_entry_id_contrapartida || null,
      entrada.prestador_id,
      entrada.entidade_id,
      entrada.periodo_id,
      entrada.valor,
      entrada.conta_debito_id,
      entrada.conta_credito_id,
      entrada.descricao,
    ]
  );

  const [result] = consultar<{ id: number }>(
    db,
    "SELECT last_insert_rowid() as id",
    []
  );

  return result?.id || 0;
}

/**
 * Obter rastreamento completo de um apontamento
 */
export function obterRastreamentoApontamento(
  db: Database,
  apontamento_id: number
): ApontamentoLedgerEntry[] {
  return consultar<ApontamentoLedgerEntry>(
    db,
    `SELECT * FROM apontamento_ledger_entries WHERE apontamento_id = ? ORDER BY data_criacao DESC`,
    [apontamento_id]
  );
}

/**
 * Reverter lançamentos de um apontamento (estorno duplo)
 * Útil para correções após lançamento
 */
export function reverterApontamentoNoLedger(
  db: Database,
  apontamento_id: number,
  motivo_reversao: string
): { sucesso: boolean; mensagem: string; lançamentos_revertidos: number } {
  const rastreamentos = obterRastreamentoApontamento(db, apontamento_id);

  if (rastreamentos.length === 0) {
    return {
      sucesso: false,
      mensagem: "Nenhum rastreamento encontrado para este apontamento",
      lançamentos_revertidos: 0,
    };
  }

  let lançamentos_revertidos = 0;

  rastreamentos.forEach((rastreamento) => {
    try {
      // Estornar lançamento de débito
      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento,
          valor_debito, valor_credito, descricao, origem_modulo,
          origem_id, referencia_documento, criado_por, criado_em
        ) SELECT
          entidade_id, periodo_id, conta_id, datetime('now'),
          valor_credito, valor_debito,
          'ESTORNO: ' || descricao,
          origem_modulo,
          origem_id,
          referencia_documento || '-EST',
          NULL, datetime('now')
        FROM ledger_entries WHERE id = ?`,
        [rastreamento.ledger_entry_id]
      );

      // Estornar lançamento de crédito se existir
      if (rastreamento.ledger_entry_id_contrapartida) {
        executar(
          db,
          `INSERT INTO ledger_entries (
            entidade_id, periodo_id, conta_id, data_lancamento,
            valor_debito, valor_credito, descricao, origem_modulo,
            origem_id, referencia_documento, criado_por, criado_em
          ) SELECT
            entidade_id, periodo_id, conta_id, datetime('now'),
            valor_credito, valor_debito,
            'ESTORNO: ' || descricao,
            origem_modulo,
            origem_id,
            referencia_documento || '-EST',
            NULL, datetime('now')
          FROM ledger_entries WHERE id = ?`,
          [rastreamento.ledger_entry_id_contrapartida]
        );

        lançamentos_revertidos += 2;
      } else {
        lançamentos_revertidos += 1;
      }

      // Marcar rastreamento como revertido
      executar(
        db,
        `UPDATE apontamento_ledger_entries SET descricao = ? WHERE id = ?`,
        [`${rastreamento.descricao} [REVERTIDO: ${motivo_reversao}]`, rastreamento.id]
      );
    } catch (erro) {
      console.error(`Erro ao reverter rastreamento ${rastreamento.id}:`, erro);
    }
  });

  return {
    sucesso: lançamentos_revertidos > 0,
    mensagem: `${lançamentos_revertidos} lançamentos revertidos com sucesso`,
    lançamentos_revertidos,
  };
}

/**
 * Gerar relatório de apontamentos por período
 */
export function gerarRelatoriApontamentosPeriodo(
  db: Database,
  entidade_id: number,
  periodo_id: number
): {
  total_apontamentos: number;
  valor_total: number;
  por_tipo: Array<{
    tipo: string;
    quantidade: number;
    valor: number;
  }>;
} {
  const total = consultar<{ total_valor: number; total_count: number }>(
    db,
    `SELECT
      SUM(ale.valor) as total_valor,
      COUNT(DISTINCT ale.apontamento_id) as total_count
    FROM apontamento_ledger_entries ale
    WHERE ale.entidade_id = ? AND ale.periodo_id = ?`,
    [entidade_id, periodo_id]
  );

  const por_tipo = consultar<{ tipo: string; valor: number; count: number }>(
    db,
    `SELECT
      ale.tipo_apontamento as tipo,
      SUM(ale.valor) as valor,
      COUNT(DISTINCT ale.apontamento_id) as count
    FROM apontamento_ledger_entries ale
    WHERE ale.entidade_id = ? AND ale.periodo_id = ?
    GROUP BY ale.tipo_apontamento
    ORDER BY ale.tipo_apontamento`,
    [entidade_id, periodo_id]
  );

  return {
    total_apontamentos: total[0]?.total_count || 0,
    valor_total: total[0]?.total_valor || 0,
    por_tipo: por_tipo.map((t) => ({
      tipo: t.tipo || "desconhecido",
      quantidade: t.count || 0,
      valor: t.valor || 0,
    })),
  };
}
