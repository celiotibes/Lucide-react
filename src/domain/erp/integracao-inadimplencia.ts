/**
 * Integração: Ciclo de Inadimplência com Juros e Multa Contábil
 * Contrato com atraso → Juros/Multa calculados → Provisão Contábil
 * Resultado: Despesa de Juros (Conta 17) + Multa (Conta 18)
 */

import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import { registrarLancamentoContabil } from "./ledger";

export interface InadimplenciaCalculada {
  contrato_id: number;
  imovel_id: number;
  locatario: string;
  dias_atraso: number;
  valor_aluguel_vencido: number;
  multa_valor: number;
  juros_valor: number;
  juros_acumulado: number;
  valor_total_devido: number;
  status: "normal" | "com_atraso" | "em_cobranca" | "litigioso";
}

/** Calcular dias de atraso para um contrato */
function calcularDiasAtraso(data_vencimento: string): number {
  const vencimento = new Date(data_vencimento);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  vencimento.setHours(0, 0, 0, 0);

  const diferenca = hoje.getTime() - vencimento.getTime();
  return Math.max(0, Math.floor(diferenca / (1000 * 60 * 60 * 24)));
}

/** Calcular multa por inadimplência (estrutura em duas faixas) */
function calcularMulta(
  dias_atraso: number,
  valor_aluguel: number,
  multa_percentual: number,
  multa_ate_dias: number,
  multa_percentual_substitutiva: number,
): number {
  if (dias_atraso === 0) return 0;

  if (dias_atraso <= multa_ate_dias) {
    // Primeira faixa: multa_percentual até multa_ate_dias
    return (valor_aluguel * multa_percentual) / 100;
  } else {
    // Segunda faixa: multa_percentual_substitutiva substitui a anterior
    return (valor_aluguel * multa_percentual_substitutiva) / 100;
  }
}

/** Calcular juros de mora (pro-rata) */
function calcularJurosMora(
  dias_atraso: number,
  valor_aluguel: number,
  juros_mensal_percentual: number,
): number {
  if (dias_atraso === 0) return 0;

  // Juros pro-rata: (dias_atraso / 30) * (valor * taxa_mensal)
  const taxa_diaria = juros_mensal_percentual / 30 / 100;
  return valor_aluguel * taxa_diaria * dias_atraso;
}

/** Apurar inadimplência de um contrato com cálculos completos */
export function apurarInadimplenciaContrato(
  db: Database,
  contrato_id: number,
  data_referencia?: string,
): InadimplenciaCalculada | null {
  const [contrato] = consultar<{
    imovel_id: number;
    locatario: string;
    dia_vencimento: number;
    valor_referencia: number;
    multa_percentual: number;
    multa_ate_dias: number;
    multa_percentual_substitutiva: number;
    juros_mensal_percentual: number;
    status: string;
  }>(
    db,
    `SELECT
      imovel_id, locatario, dia_vencimento, valor_referencia,
      multa_percentual, multa_ate_dias, multa_percentual_substitutiva,
      juros_mensal_percentual, status
     FROM contratos_locacao WHERE id = ?`,
    [contrato_id],
  );

  if (!contrato) return null;

  // Construir data de vencimento do mês
  const hoje = new Date(data_referencia || new Date().toISOString().split("T")[0]);
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;
  const data_vencimento = new Date(
    `${ano}-${String(mes).padStart(2, "0")}-${String(contrato.dia_vencimento).padStart(2, "0")}`,
  ).toISOString();

  const dias_atraso = calcularDiasAtraso(data_vencimento);

  // Calcular componentes
  const multa = calcularMulta(
    dias_atraso,
    contrato.valor_referencia,
    contrato.multa_percentual,
    contrato.multa_ate_dias,
    contrato.multa_percentual_substitutiva,
  );

  const juros = calcularJurosMora(
    dias_atraso,
    contrato.valor_referencia,
    contrato.juros_mensal_percentual,
  );

  // Determinar status
  let status: InadimplenciaCalculada["status"] = "normal";
  if (dias_atraso > 0 && dias_atraso <= 30) status = "com_atraso";
  else if (dias_atraso > 30 && dias_atraso <= 90) status = "em_cobranca";
  else if (dias_atraso > 90) status = "litigioso";

  return {
    contrato_id,
    imovel_id: contrato.imovel_id,
    locatario: contrato.locatario,
    dias_atraso,
    valor_aluguel_vencido: contrato.valor_referencia,
    multa_valor: multa,
    juros_valor: juros,
    juros_acumulado: juros, // Simplificado; em produção seria acumulativo mensal
    valor_total_devido: contrato.valor_referencia + multa + juros,
    status,
  };
}

/** Contabilizar juros de mora quando já houve atraso e recebimento posterior */
export function contabilizarJurosMora(
  db: Database,
  contrato_id: number,
  entidade_id: number,
  periodo_id: number,
  valor_juros: number,
): boolean {
  if (valor_juros <= 0) return false;

  // Débito: Caixa (Conta 2)
  registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: 2, // Caixa
    data_lancamento: new Date().toISOString().split("T")[0],
    valor_debito: valor_juros,
    descricao: `Recebimento juros de mora - Contrato ${contrato_id}`,
    origem_modulo: "contratos",
    origem_id: contrato_id,
    referencia_documento: `CT-${contrato_id}-JUR`,
  });

  // Crédito: Receita de Juros (Conta 29)
  registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: 29, // Receita de Juros
    data_lancamento: new Date().toISOString().split("T")[0],
    valor_credito: valor_juros,
    descricao: `Receita de juros de mora - Contrato ${contrato_id}`,
    origem_modulo: "contratos",
    origem_id: contrato_id,
    referencia_documento: `CT-${contrato_id}-JUR-REC`,
  });

  return true;
}

/** Contabilizar multa por atraso */
export function contabilizarMultaPorAtraso(
  db: Database,
  contrato_id: number,
  entidade_id: number,
  periodo_id: number,
  valor_multa: number,
): boolean {
  if (valor_multa <= 0) return false;

  // Débito: Caixa (Conta 2)
  registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: 2, // Caixa
    data_lancamento: new Date().toISOString().split("T")[0],
    valor_debito: valor_multa,
    descricao: `Recebimento multa contratual - Contrato ${contrato_id}`,
    origem_modulo: "contratos",
    origem_id: contrato_id,
    referencia_documento: `CT-${contrato_id}-MULT`,
  });

  // Crédito: Receita Diversa / Receita de Multa (Conta 30 - criar se necessário)
  registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: 30, // Receita de Multa
    data_lancamento: new Date().toISOString().split("T")[0],
    valor_credito: valor_multa,
    descricao: `Receita de multa contratual - Contrato ${contrato_id}`,
    origem_modulo: "contratos",
    origem_id: contrato_id,
    referencia_documento: `CT-${contrato_id}-MULT-REC`,
  });

  return true;
}

/** Provisionar despesa de juros para inadimplência em aberto */
export function provisarJurosInadimplencia(
  db: Database,
  contrato_id: number,
  entidade_id: number,
  periodo_id: number,
): boolean {
  const inadimplencia = apurarInadimplenciaContrato(db, contrato_id);

  if (!inadimplencia || inadimplencia.juros_valor <= 0) {
    return false;
  }

  // Débito: Despesa de Juros (Conta 17)
  registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: 17, // Despesa de Juros
    data_lancamento: new Date().toISOString().split("T")[0],
    valor_debito: inadimplencia.juros_valor,
    descricao: `Provisão juros sobre aluguel em atraso - Contrato ${contrato_id} (${inadimplencia.dias_atraso} dias)`,
    origem_modulo: "contratos",
    origem_id: contrato_id,
    referencia_documento: `CT-${contrato_id}-JUR-PROV`,
  });

  // Crédito: Aluguel a Receber / Crédito sobre Aluguel (Conta 31 - novo)
  registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: 31, // Crédito sobre Aluguel em Atraso (reduz receita)
    data_lancamento: new Date().toISOString().split("T")[0],
    valor_credito: inadimplencia.juros_valor,
    descricao: `Redução receita por provisão juros - Contrato ${contrato_id}`,
    origem_modulo: "contratos",
    origem_id: contrato_id,
    referencia_documento: `CT-${contrato_id}-JUR-RED`,
  });

  return true;
}

/** Relatório: Contratos em inadimplência com cálculos de juros/multa */
export function relatorioInadimplenciaDetalhado(
  db: Database,
): InadimplenciaCalculada[] {
  const contratos = consultar<{ id: number }>(
    db,
    `SELECT id FROM contratos_locacao
     -- contrato vigente: não há coluna status; data_fim nulo = em vigor
     WHERE data_fim IS NULL OR data_fim >= DATE('now')`,
    [],
  );

  return contratos
    .map((c) => apurarInadimplenciaContrato(db, c.id))
    .filter((c) => c !== null && c.dias_atraso > 0) as InadimplenciaCalculada[];
}

/** Resumo executivo: Inadimplência total em risco */
export function resumoInadimplenciaTotal(
  db: Database,
): {
  contratos_inadimplentes: number;
  valor_aluguel_em_atraso: number;
  multa_acumulada: number;
  juros_acumulado: number;
  valor_total_em_risco: number;
} {
  const relatorio = relatorioInadimplenciaDetalhado(db);

  return {
    contratos_inadimplentes: relatorio.length,
    valor_aluguel_em_atraso: relatorio.reduce((sum, r) => sum + r.valor_aluguel_vencido, 0),
    multa_acumulada: relatorio.reduce((sum, r) => sum + r.multa_valor, 0),
    juros_acumulado: relatorio.reduce((sum, r) => sum + r.juros_acumulado, 0),
    valor_total_em_risco: relatorio.reduce((sum, r) => sum + r.valor_total_devido, 0),
  };
}
