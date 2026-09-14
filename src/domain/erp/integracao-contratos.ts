/**
 * Integração: Ciclo de Contratos de Locação
 * Contratos → Patrimônio → Caucão → Receitas/Despesas → Contabilidade
 */

import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import { registrarTransacaoIntegrada } from "./core";

interface EventoContrato {
  id: number;
  contrato_id: number;
  tipo: "criacao" | "ativacao" | "reajuste" | "aditivo" | "rescisao";
  data: string;
  valor_anterior?: number;
  valor_novo?: number;
  motivo?: string;
}

/** Após criar contrato de locação: registrar receita esperada no período */
export function contabilizarCriacaoContrato(
  db: Database,
  contrato_id: number,
  entidade_id: number,
  periodo_id: number,
): void {
  const [contrato] = consultar<{
    locatario: string;
    imovel_id: number;
    valor_mensal: number;
    data_inicio: string;
  }>(db, `SELECT locatario, imovel_id, valor_mensal, data_inicio FROM contratos_locacao WHERE id = ?`, [
    contrato_id,
  ]);

  if (!contrato) {
    throw new Error(`Contrato ${contrato_id} não encontrado`);
  }

  // Registrar receita de aluguel esperada
  registrarTransacaoIntegrada(db, {
    entidade_id,
    periodo_id,
    conta_id: 1, // Receitas de Aluguel (deve ser parametrizável)
    data: contrato.data_inicio,
    descricao: `Aluguel esperado - ${contrato.locatario} (Imóvel ${contrato.imovel_id})`,
    valor: contrato.valor_mensal,
    tipo: "credit",
    origem_modulo: "contratos",
    origem_id: contrato_id,
    referencia_documento: `CT-${contrato_id}`,
    auditada: false,
  });
}

/** Ao receber pagamento de aluguel: confirmar receita e reconciliar com transação bancária */
export function contabilizarRecebimentoAluguel(
  db: Database,
  transacao_id: number,
  contrato_id: number,
  entidade_id: number,
  periodo_id: number,
  valor: number,
): void {
  // Débito em conta corrente (ativo circulante)
  registrarTransacaoIntegrada(db, {
    entidade_id,
    periodo_id,
    conta_id: 2, // Conta Corrente (parametrizável)
    data: new Date().toISOString().split("T")[0],
    descricao: `Recebimento aluguel - Transação ${transacao_id}`,
    valor,
    tipo: "debit",
    origem_modulo: "transacoes",
    origem_id: transacao_id,
    referencia_documento: `TXN-${transacao_id}`,
    auditada: false,
  });

  // Crédito em receita de aluguel
  registrarTransacaoIntegrada(db, {
    entidade_id,
    periodo_id,
    conta_id: 1, // Receitas de Aluguel
    data: new Date().toISOString().split("T")[0],
    descricao: `Recebimento aluguel - Contrato ${contrato_id}`,
    valor,
    tipo: "credit",
    origem_modulo: "contratos",
    origem_id: contrato_id,
    referencia_documento: `CT-${contrato_id}`,
    auditada: true, // Reconciliada com transação bancária
    auditado_em: new Date().toISOString(),
  });
}

/** Integração: Reajuste de contrato (IPCA, taxa, aditivo) → efeito na receita */
export function contabilizarReajusteContrato(
  db: Database,
  evento: EventoContrato,
  entidade_id: number,
  periodo_id: number,
): void {
  const [contrato] = consultar<{ locatario: string }>(
    db,
    "SELECT locatario FROM contratos_locacao WHERE id = ?",
    [evento.contrato_id],
  );

  if (!contrato) return;

  const diferenca = (evento.valor_novo ?? 0) - (evento.valor_anterior ?? 0);

  registrarTransacaoIntegrada(db, {
    entidade_id,
    periodo_id,
    conta_id: 3, // Receita de Reajuste (parametrizável)
    data: evento.data,
    descricao: `Reajuste ${evento.tipo} - ${contrato.locatario} (Diferença: +${diferenca})`,
    valor: Math.abs(diferenca),
    tipo: diferenca >= 0 ? "credit" : "debit",
    origem_modulo: "contratos",
    origem_id: evento.contrato_id,
    referencia_documento: `CT-${evento.contrato_id}-${evento.tipo.toUpperCase()}`,
    auditada: false,
  });
}

/** Integração: Devolução de caução (patrimônio) → redução de passivo circulante */
export function contabilizarDevolucaoCaucao(
  db: Database,
  caucao_id: number,
  contrato_id: number,
  entidade_id: number,
  periodo_id: number,
  valor: number,
  imovel_id: number,
): void {
  // Débito: Reduzir caução a pagar (passivo)
  registrarTransacaoIntegrada(db, {
    entidade_id,
    periodo_id,
    conta_id: 4, // Caução a Devolver (parametrizável)
    data: new Date().toISOString().split("T")[0],
    descricao: `Devolução caução - Imóvel ${imovel_id}, Contrato ${contrato_id}`,
    valor,
    tipo: "debit",
    origem_modulo: "caucao",
    origem_id: caucao_id,
    referencia_documento: `CAU-${caucao_id}`,
    auditada: false,
  });

  // Crédito: Reduzir caixa
  registrarTransacaoIntegrada(db, {
    entidade_id,
    periodo_id,
    conta_id: 2, // Conta Corrente
    data: new Date().toISOString().split("T")[0],
    descricao: `Saída caixa - Devolução caução ${caucao_id}`,
    valor,
    tipo: "credit",
    origem_modulo: "caucao",
    origem_id: caucao_id,
    referencia_documento: `CAU-${caucao_id}`,
    auditada: false,
  });
}

/** Integração: Vistorias (danos/reparos) → provisão de despesa */
export function contabilizarAjustesCaucaoVistoria(
  db: Database,
  vistoria_id: number,
  contrato_id: number,
  entidade_id: number,
  periodo_id: number,
  valor_danos: number,
): void {
  if (valor_danos <= 0) return;

  // Débito: Provisão de despesa (reparos/limpeza)
  registrarTransacaoIntegrada(db, {
    entidade_id,
    periodo_id,
    conta_id: 5, // Despesa com Reparos (parametrizável)
    data: new Date().toISOString().split("T")[0],
    descricao: `Provisão danos constatados - Vistoria ${vistoria_id}, Contrato ${contrato_id}`,
    valor: valor_danos,
    tipo: "debit",
    origem_modulo: "vistorias",
    origem_id: vistoria_id,
    referencia_documento: `VISTORIA-${vistoria_id}`,
    auditada: false,
  });

  // Crédito: Reduzir caução a devolver
  registrarTransacaoIntegrada(db, {
    entidade_id,
    periodo_id,
    conta_id: 4, // Caução a Devolver
    data: new Date().toISOString().split("T")[0],
    descricao: `Compensação caução - Danos vistoria ${vistoria_id}`,
    valor: valor_danos,
    tipo: "credit",
    origem_modulo: "vistorias",
    origem_id: vistoria_id,
    referencia_documento: `VISTORIA-${vistoria_id}`,
    auditada: false,
  });
}
