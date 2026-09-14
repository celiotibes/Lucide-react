/**
 * Integração: Ciclo de Patrimônio
 * Patrimônio → Financiamentos → Depreciação → Resultado → Contabilidade
 */

import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import { registrarTransacaoIntegrada } from "./core";

/** Registro de ativo imóvel no patrimônio → contabilizar aquisição */
export function contabilizarAquisicaoImovel(
  db: Database,
  imovel_id: number,
  entidade_id: number,
  periodo_id: number,
  valor_aquisicao: number,
): void {
  if (valor_aquisicao <= 0) return;

  const [imovel] = consultar<{ apelido: string }>(
    db,
    "SELECT apelido FROM imoveis WHERE id = ?",
    [imovel_id],
  );

  if (!imovel) return;

  // Débito: Imóvel (Ativo Imobilizado)
  registrarTransacaoIntegrada(db, {
    entidade_id,
    periodo_id,
    conta_id: 10, // Imóveis (parametrizável)
    data: new Date().toISOString().split("T")[0],
    descricao: `Aquisição imóvel - ${imovel.apelido}`,
    valor: valor_aquisicao,
    tipo: "debit",
    origem_modulo: "patrimonio",
    origem_id: imovel_id,
    referencia_documento: `IMOVEL-${imovel_id}`,
    auditada: false,
  });

  // Crédito: Passivo ou Patrimônio (financiado ou próprio)
  // Lógica: se financiado, vai para Passivo; se próprio, aumenta PL
  const [financiamento] = consultar<{ valor_contratado: number }>(
    db,
    "SELECT valor_contratado FROM financiamentos WHERE imovel_id = ? LIMIT 1",
    [imovel_id],
  );

  const parte_financiada = financiamento?.valor_contratado ?? 0;
  const parte_propria = valor_aquisicao - parte_financiada;

  if (parte_financiada > 0) {
    registrarTransacaoIntegrada(db, {
      entidade_id,
      periodo_id,
      conta_id: 11, // Financiamentos a Pagar (parametrizável)
      data: new Date().toISOString().split("T")[0],
      descricao: `Financiamento - ${imovel.apelido}`,
      valor: parte_financiada,
      tipo: "credit",
      origem_modulo: "financiamento",
      origem_id: financiamento ? 1 : imovel_id,
      referencia_documento: `FIN-${imovel_id}`,
      auditada: false,
    });
  }

  if (parte_propria > 0) {
    registrarTransacaoIntegrada(db, {
      entidade_id,
      periodo_id,
      conta_id: 12, // Patrimônio Líquido (parametrizável)
      data: new Date().toISOString().split("T")[0],
      descricao: `Contribuição capital - ${imovel.apelido}`,
      valor: parte_propria,
      tipo: "credit",
      origem_modulo: "patrimonio",
      origem_id: imovel_id,
      referencia_documento: `IMOVEL-${imovel_id}`,
      auditada: false,
    });
  }
}

/** Depreciação mensal de imóvel (método linear) */
export function contabilizarDepreciacaoImovel(
  db: Database,
  imovel_id: number,
  entidade_id: number,
  periodo_id: number,
): void {
  const [imovel] = consultar<{ valor_aquisicao: number; apelido: string }>(
    db,
    "SELECT valor_aquisicao, apelido FROM imoveis WHERE id = ?",
    [imovel_id],
  );

  if (!imovel || !imovel.valor_aquisicao) return;

  // Depreciação linear: 5% ao ano = 0,4167% ao mês
  const taxa_mensal = imovel.valor_aquisicao * 0.004167;

  // Débito: Despesa de Depreciação (Resultado)
  registrarTransacaoIntegrada(db, {
    entidade_id,
    periodo_id,
    conta_id: 13, // Despesa de Depreciação (parametrizável)
    data: new Date().toISOString().split("T")[0],
    descricao: `Depreciação - ${imovel.apelido}`,
    valor: taxa_mensal,
    tipo: "debit",
    origem_modulo: "patrimonio",
    origem_id: imovel_id,
    referencia_documento: `DEPR-${imovel_id}`,
    auditada: false,
  });

  // Crédito: Acumulado de Depreciação (reduz ativo)
  registrarTransacaoIntegrada(db, {
    entidade_id,
    periodo_id,
    conta_id: 14, // Depreciação Acumulada (parametrizável)
    data: new Date().toISOString().split("T")[0],
    descricao: `Depreciação acumulada - ${imovel.apelido}`,
    valor: taxa_mensal,
    tipo: "credit",
    origem_modulo: "patrimonio",
    origem_id: imovel_id,
    referencia_documento: `DEPR-${imovel_id}`,
    auditada: false,
  });
}

/** Reavaliação patrimonial (atualização de valor de mercado) */
export function contabilizarReavaliacaoImovel(
  db: Database,
  imovel_id: number,
  entidade_id: number,
  periodo_id: number,
  valor_venal_novo: number,
  valor_venal_anterior: number,
): void {
  if (valor_venal_novo === valor_venal_anterior) return;

  const [imovel] = consultar<{ apelido: string }>(
    db,
    "SELECT apelido FROM imoveis WHERE id = ?",
    [imovel_id],
  );

  if (!imovel) return;

  const diferenca = valor_venal_novo - valor_venal_anterior;

  // Se aumentou valor: crédito em Resultado não-Realizado
  // Se diminuiu: débito em Perda Patrimonial
  registrarTransacaoIntegrada(db, {
    entidade_id,
    periodo_id,
    conta_id: diferenca > 0 ? 15 : 16, // Ganho ou Perda Patrimonial
    data: new Date().toISOString().split("T")[0],
    descricao: `Reavaliação - ${imovel.apelido} (Novo: ${valor_venal_novo}, Anterior: ${valor_venal_anterior})`,
    valor: Math.abs(diferenca),
    tipo: diferenca > 0 ? "credit" : "debit",
    origem_modulo: "patrimonio",
    origem_id: imovel_id,
    referencia_documento: `REAVAL-${imovel_id}`,
    auditada: false,
  });
}

/** Financiamento de imóvel → parcelamento contabilizado */
export function contabilizarParcelasFinanciamento(
  db: Database,
  financiamento_id: number,
  imovel_id: number,
  entidade_id: number,
  periodo_id: number,
  valor_parcela: number,
  parte_juros: number,
): void {
  const parte_principal = valor_parcela - parte_juros;

  // Débito: Reduzir passivo (Financiamentos a Pagar)
  registrarTransacaoIntegrada(db, {
    entidade_id,
    periodo_id,
    conta_id: 11, // Financiamentos a Pagar
    data: new Date().toISOString().split("T")[0],
    descricao: `Amortização financiamento - Imóvel ${imovel_id}`,
    valor: parte_principal,
    tipo: "debit",
    origem_modulo: "financiamento",
    origem_id: financiamento_id,
    referencia_documento: `FIN-${financiamento_id}`,
    auditada: false,
  });

  // Débito: Despesa de Juros
  registrarTransacaoIntegrada(db, {
    entidade_id,
    periodo_id,
    conta_id: 17, // Despesa de Juros (parametrizável)
    data: new Date().toISOString().split("T")[0],
    descricao: `Juros financiamento - Imóvel ${imovel_id}`,
    valor: parte_juros,
    tipo: "debit",
    origem_modulo: "financiamento",
    origem_id: financiamento_id,
    referencia_documento: `FIN-${financiamento_id}`,
    auditada: false,
  });

  // Crédito: Caixa (ambas parcelas saem do caixa)
  registrarTransacaoIntegrada(db, {
    entidade_id,
    periodo_id,
    conta_id: 2, // Conta Corrente
    data: new Date().toISOString().split("T")[0],
    descricao: `Pagamento parcela financiamento - Imóvel ${imovel_id}`,
    valor: valor_parcela,
    tipo: "credit",
    origem_modulo: "financiamento",
    origem_id: financiamento_id,
    referencia_documento: `FIN-${financiamento_id}`,
    auditada: false,
  });
}
