// Criar plano de pagamento para fatura em atraso
// Permite parcelamento de débitos com aprovação do proprietário

import type { Pool } from 'pg';

export interface PlanoPagamento {
  id: string;
  faturaId: string;
  locatarioId: string;
  contratoId: string;
  valorOriginal: number;
  valorTotal: number;
  numParcelas: number;
  valorParcela: number;
  dataInicio: string;
  status: 'pendente' | 'aprovado' | 'rejeitado' | 'pago' | 'cancelado';
}

export interface ParcelaPlano {
  id: string;
  planoId: string;
  numeroParcela: number;
  valor: number;
  vencimento: string;
  status: 'aberta' | 'paga' | 'atrasada' | 'cancelada';
}

export async function criarPlanoPagamento(
  pool: Pool,
  input: {
    faturaId: string;
    locatarioId: string;
    numParcelas: number;
    motivo?: string;
  }
): Promise<PlanoPagamento> {
  // Validar que fatura existe e está em atraso
  const { rows: faturas } = await pool.query<{
    id: string;
    contrato_id: string;
    valor_liquido: number;
    vencimento: string;
    status: string;
  }>(
    `select id, contrato_id, valor_liquido, vencimento, status
     from faturas
     where id = $1 and status in ('atrasada', 'aberta')`,
    [input.faturaId]
  );

  if (faturas.length === 0) {
    throw new Error('Fatura não encontrada ou não está em atraso');
  }

  const fatura = faturas[0];
  if (input.numParcelas < 2 || input.numParcelas > 24) {
    throw new Error('Número de parcelas deve estar entre 2 e 24');
  }

  // Validar que locatário existe e é o responsável
  const { rows: locatarios } = await pool.query<{ id: string }>(
    `select p.id from pessoas p
     join contrato_partes cp on cp.pessoa_id = p.id
     where p.id = $1 and cp.contrato_id = $2 and cp.papel = 'locatario_principal'`,
    [input.locatarioId, fatura.contrato_id]
  );

  if (locatarios.length === 0) {
    throw new Error('Locatário não encontrado ou não é o responsável pelo contrato');
  }

  // Calcular parcelas
  const valorTotal = fatura.valor_liquido;
  const valorParcela = Math.round((valorTotal / input.numParcelas) * 100) / 100;
  const dataInicio = new Date();

  // Criar plano de pagamento
  const { rows: planos } = await pool.query<PlanoPagamento>(
    `insert into planos_pagamento (
       fatura_id, locatario_id, contrato_id, valor_original, valor_total,
       num_parcelas, valor_parcela, data_inicio, data_vencimento_primeira, motivo
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9)
     returning
       id,
       fatura_id as "faturaId",
       locatario_id as "locatarioId",
       contrato_id as "contratoId",
       valor_original as "valorOriginal",
       valor_total as "valorTotal",
       num_parcelas as "numParcelas",
       valor_parcela as "valorParcela",
       data_inicio as "dataInicio",
       status`,
    [
      input.faturaId,
      input.locatarioId,
      fatura.contrato_id,
      fatura.valor_liquido,
      fatura.valor_liquido,
      input.numParcelas,
      valorParcela,
      dataInicio.toISOString().split('T')[0],
      input.motivo || null,
    ]
  );

  if (planos.length === 0) {
    throw new Error('Falha ao criar plano de pagamento');
  }

  const plano = planos[0];

  // Gerar parcelas
  for (let i = 1; i <= input.numParcelas; i++) {
    const dataVencimento = new Date(dataInicio);
    dataVencimento.setMonth(dataVencimento.getMonth() + i);

    // Última parcela absorve arredondamento
    const valor = i === input.numParcelas ? valorTotal - valorParcela * (i - 1) : valorParcela;

    await pool.query(
      `insert into parcelas_plano (plano_id, numero_parcela, valor, vencimento)
       values ($1, $2, $3, $4)`,
      [plano.id, i, valor, dataVencimento.toISOString().split('T')[0]]
    );
  }

  console.log(
    `Plano de pagamento criado: ${plano.id} (${input.numParcelas}x R$ ${valorParcela.toFixed(2)})`
  );

  return plano;
}

export async function aprovarPlanoPagamento(
  pool: Pool,
  input: {
    planoId: string;
    proprietarioId: string;
  }
): Promise<{ id: string; status: string }> {
  // Validar que proprietário existe e é dono do contrato
  const { rows: planos } = await pool.query<{ contrato_id: string }>(
    `select pp.contrato_id from planos_pagamento pp
     join contratos c on c.id = pp.contrato_id
     where pp.id = $1 and c.proprietario_id = $2`,
    [input.planoId, input.proprietarioId]
  );

  if (planos.length === 0) {
    throw new Error('Plano não encontrado ou proprietário não autorizado');
  }

  // Atualizar status do plano
  const { rows } = await pool.query<{ id: string; status: string }>(
    `update planos_pagamento
     set status = 'aprovado', aprovado_em = current_timestamp, atualizado_em = current_timestamp
     where id = $1
     returning id, status`,
    [input.planoId]
  );

  if (rows.length === 0) {
    throw new Error('Falha ao aprovar plano de pagamento');
  }

  console.log(`Plano de pagamento aprovado: ${input.planoId}`);

  return rows[0];
}

export async function rejeitarPlanoPagamento(
  pool: Pool,
  input: {
    planoId: string;
    proprietarioId: string;
    motivo: string;
  }
): Promise<{ id: string; status: string }> {
  // Validar que proprietário existe e é dono do contrato
  const { rows: planos } = await pool.query<{ contrato_id: string }>(
    `select pp.contrato_id from planos_pagamento pp
     join contratos c on c.id = pp.contrato_id
     where pp.id = $1 and c.proprietario_id = $2`,
    [input.planoId, input.proprietarioId]
  );

  if (planos.length === 0) {
    throw new Error('Plano não encontrado ou proprietário não autorizado');
  }

  // Atualizar status do plano
  const { rows } = await pool.query<{ id: string; status: string }>(
    `update planos_pagamento
     set status = 'rejeitado', rejeitado_em = current_timestamp, motivo_rejeicao = $2, atualizado_em = current_timestamp
     where id = $1
     returning id, status`,
    [input.planoId, input.motivo]
  );

  if (rows.length === 0) {
    throw new Error('Falha ao rejeitar plano de pagamento');
  }

  console.log(`Plano de pagamento rejeitado: ${input.planoId}`);

  return rows[0];
}

export async function obterPlanoPagamento(
  pool: Pool,
  planoId: string
): Promise<{
  plano: PlanoPagamento;
  parcelas: ParcelaPlano[];
}> {
  const { rows: planos } = await pool.query<PlanoPagamento>(
    `select
       id,
       fatura_id as "faturaId",
       locatario_id as "locatarioId",
       contrato_id as "contratoId",
       valor_original as "valorOriginal",
       valor_total as "valorTotal",
       num_parcelas as "numParcelas",
       valor_parcela as "valorParcela",
       data_inicio as "dataInicio",
       status
     from planos_pagamento
     where id = $1`,
    [planoId]
  );

  if (planos.length === 0) {
    throw new Error('Plano não encontrado');
  }

  const { rows: parcelas } = await pool.query<ParcelaPlano>(
    `select
       id,
       plano_id as "planoId",
       numero_parcela as "numeroParcela",
       valor,
       vencimento,
       status
     from parcelas_plano
     where plano_id = $1
     order by numero_parcela`,
    [planoId]
  );

  return {
    plano: planos[0],
    parcelas,
  };
}

export async function obterPlanosLocatario(
  pool: Pool,
  locatarioId: string
): Promise<PlanoPagamento[]> {
  const { rows } = await pool.query<PlanoPagamento>(
    `select
       id,
       fatura_id as "faturaId",
       locatario_id as "locatarioId",
       contrato_id as "contratoId",
       valor_original as "valorOriginal",
       valor_total as "valorTotal",
       num_parcelas as "numParcelas",
       valor_parcela as "valorParcela",
       data_inicio as "dataInicio",
       status
     from planos_pagamento
     where locatario_id = $1
     order by criado_em desc`,
    [locatarioId]
  );

  return rows;
}

export async function registrarPagamentoParcela(
  pool: Pool,
  input: {
    parcelaId: string;
    dataPagamento: string;
    valor: number;
  }
): Promise<{ id: string; status: string }> {
  // Atualizar parcela como paga
  const { rows: parcelas } = await pool.query<{ id: string; plano_id: string }>(
    `update parcelas_plano
     set status = 'paga', data_pagamento = $2
     where id = $1
     returning id, plano_id`,
    [input.parcelaId, new Date(input.dataPagamento).toISOString().split('T')[0]]
  );

  if (parcelas.length === 0) {
    throw new Error('Parcela não encontrada');
  }

  const parcela = parcelas[0];

  // Verificar se todas as parcelas foram pagas
  const { rows: pendentes } = await pool.query<{ count: number }>(
    `select count(*)::int as count from parcelas_plano
     where plano_id = $1 and status != 'paga'`,
    [parcela.plano_id]
  );

  if (pendentes[0].count === 0) {
    // Marcar plano como pago
    await pool.query(
      `update planos_pagamento
       set status = 'pago', atualizado_em = current_timestamp
       where id = $1`,
      [parcela.plano_id]
    );

    console.log(`Plano de pagamento completo: ${parcela.plano_id}`);
  }

  return { id: parcela.id, status: 'paga' };
}
