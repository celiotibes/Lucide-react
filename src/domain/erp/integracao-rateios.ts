/**
 * Integração: Ciclo de Rateios de Despesas
 * Despesas Comuns → Rateio por Fração/m² → Alocação por Contrato → Contabilidade
 */

import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import { registrarTransacaoIntegrada } from "./core";

interface DespesaComum {
  id: number;
  descricao: string;
  valor_total: number;
  categoria: "condominio" | "agua" | "energia" | "internet" | "manutencao";
  data: string;
  afeta_quem: "todos" | "alguns_imoveis";
}

interface RateioResultado {
  imovel_id: number;
  valor_rateado: number;
  percentual: number;
}

/** Registrar despesa comum e gerar rateios automáticos */
export function contabilizarDespesaComum(
  db: Database,
  despesa: DespesaComum,
  entidade_id: number,
  periodo_id: number,
): RateioResultado[] {
  // 1. Registrar despesa total como débito
  const contasDespesa: Record<string, number> = {
    condominio: 20, // Despesa com Condomínio
    agua: 21,
    energia: 22,
    internet: 23,
    manutencao: 24,
  };

  registrarTransacaoIntegrada(db, {
    entidade_id,
    periodo_id,
    conta_id: contasDespesa[despesa.categoria],
    data: despesa.data,
    descricao: despesa.descricao,
    valor: despesa.valor_total,
    tipo: "debit",
    origem_modulo: "transacoes",
    origem_id: despesa.id,
    referencia_documento: `DESP-${despesa.id}`,
    auditada: false,
  });

  // 2. Calcular rateios por fração ideal ou m²
  const rateios = calcularRateios(db, despesa);

  // 3. Para cada imóvel, registrar alocação
  rateios.forEach((rateio) => {
    registrarTransacaoIntegrada(db, {
      entidade_id,
      periodo_id,
      conta_id: 25, // Despesa Rateada Recebível (parametrizável)
      data: despesa.data,
      descricao: `Rateio: ${despesa.descricao} (${rateio.percentual}%)`,
      valor: rateio.valor_rateado,
      tipo: "credit", // Crédito em receita esperada
      origem_modulo: "rateios",
      origem_id: rateio.imovel_id,
      referencia_documento: `DESP-${despesa.id}-IMOVEL-${rateio.imovel_id}`,
      auditada: false,
    });
  });

  return rateios;
}

/** Calcular rateio de despesa por fração ideal ou metragem */
function calcularRateios(db: Database, despesa: DespesaComum): RateioResultado[] {
  let imoveis;

  if (despesa.afeta_quem === "todos") {
    imoveis = consultar<{ id: number; fracao_ideal: number; area_m2: number }>(
      db,
      `SELECT id, fracao_ideal, area_m2 FROM imoveis WHERE uso_pessoal = 0 AND financiado = 0`,
      [],
    );
  } else {
    imoveis = consultar<{ id: number; fracao_ideal: number; area_m2: number }>(
      db,
      `SELECT DISTINCT i.id, i.fracao_ideal, i.area_m2
       FROM imoveis i
       INNER JOIN contratos_locacao c ON i.id = c.imovel_id
       WHERE c.status IN ('ativo', 'pendente')`,
      [],
    );
  }

  // Usar fração ideal se disponível, senão metragem
  const criterio = imoveis.some((i) => i.fracao_ideal) ? "fracao_ideal" : "area_m2";
  const total = imoveis.reduce((sum, i) => sum + (i[criterio] || 0), 0);

  return imoveis.map((imovel) => ({
    imovel_id: imovel.id,
    valor_rateado: (despesa.valor_total * (imovel[criterio] || 0)) / total,
    percentual: ((imovel[criterio] || 0) / total) * 100,
  }));
}

/** Integração: Rateio → Adiciona à conta de aluguel esperado do locatário */
export function adicionarDespesaRateidaAoAluguel(
  db: Database,
  imovel_id: number,
  contrato_id: number,
  entidade_id: number,
  periodo_id: number,
  valor_rateio: number,
  descricao_rateio: string,
): void {
  // Aumentar receita esperada do mês
  registrarTransacaoIntegrada(db, {
    entidade_id,
    periodo_id,
    conta_id: 26, // Despesa Rateada - Componente de Aluguel (parametrizável)
    data: new Date().toISOString().split("T")[0],
    descricao: `Rateio adicional ao aluguel: ${descricao_rateio}`,
    valor: valor_rateio,
    tipo: "credit",
    origem_modulo: "rateios",
    origem_id: imovel_id,
    referencia_documento: `CT-${contrato_id}-RATEIO`,
    auditada: false,
  });
}

/** Ciclo completo: Recebimento de despesa rateada pelo locatário */
export function contabilizarRecebimentoDespesaRateada(
  db: Database,
  transacao_id: number,
  imovel_id: number,
  contrato_id: number,
  entidade_id: number,
  periodo_id: number,
  valor: number,
): void {
  // Débito: Caixa/Conta Corrente
  registrarTransacaoIntegrada(db, {
    entidade_id,
    periodo_id,
    conta_id: 2, // Conta Corrente
    data: new Date().toISOString().split("T")[0],
    descricao: `Recebimento despesa rateada - Contrato ${contrato_id}`,
    valor,
    tipo: "debit",
    origem_modulo: "transacoes",
    origem_id: transacao_id,
    referencia_documento: `TXN-${transacao_id}`,
    auditada: false,
  });

  // Crédito: Despesa Rateada Recebível (realiza o crédito)
  registrarTransacaoIntegrada(db, {
    entidade_id,
    periodo_id,
    conta_id: 25, // Despesa Rateada Recebível
    data: new Date().toISOString().split("T")[0],
    descricao: `Realização recebimento - Contrato ${contrato_id}`,
    valor,
    tipo: "credit",
    origem_modulo: "rateios",
    origem_id: imovel_id,
    referencia_documento: `CT-${contrato_id}-RATEIO`,
    auditada: true,
    auditado_em: new Date().toISOString(),
  });
}

/** Análise: Inadimplência de despesa rateada */
export function provisaoInademplaciaRateio(
  db: Database,
  contrato_id: number,
  imovel_id: number,
  entidade_id: number,
  periodo_id: number,
  valor_em_atraso: number,
): void {
  // Débito: Perda por Inadimplência (Resultado)
  registrarTransacaoIntegrada(db, {
    entidade_id,
    periodo_id,
    conta_id: 27, // Perda por Inadimplência (parametrizável)
    data: new Date().toISOString().split("T")[0],
    descricao: `Provisão inadimplência despesa rateada - Contrato ${contrato_id}`,
    valor: valor_em_atraso,
    tipo: "debit",
    origem_modulo: "rateios",
    origem_id: imovel_id,
    referencia_documento: `CT-${contrato_id}-INADIMPL`,
    auditada: false,
  });

  // Crédito: Reduzir Despesa Rateada Recebível
  registrarTransacaoIntegrada(db, {
    entidade_id,
    periodo_id,
    conta_id: 25, // Despesa Rateada Recebível
    data: new Date().toISOString().split("T")[0],
    descricao: `Provisão para devedora - Contrato ${contrato_id}`,
    valor: valor_em_atraso,
    tipo: "credit",
    origem_modulo: "rateios",
    origem_id: imovel_id,
    referencia_documento: `CT-${contrato_id}-INADIMPL`,
    auditada: false,
  });
}
