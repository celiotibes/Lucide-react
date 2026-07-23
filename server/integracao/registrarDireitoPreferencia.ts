// Direito de Preferência do Locatário (Art. 27-34, Lei 8.245/91):
// Quando propriedade fica disponível para venda/transferência, o locatário tem
// o direito de fazer uma proposta equivalente e adquirir a propriedade antes
// de terceiros. O prazo padrão para resposta é de 30 dias (configurável).
//
// Usa tabela schema `notificacoes_preferencia_venda` que registra cada notificação
// e rastreia a resposta (exerceu_preferencia / recusou / sem_resposta).

import type { Pool } from 'pg';

export type RespostaDireitoPreferencia = 'exerceu_preferencia' | 'recusou' | 'sem_resposta';

export interface ResultadoNotificacao {
  id: string;
  contratoId: string;
  locatarioEmail: string | null;
  valorOferta: number;
  prazoResposta: number;
}

export interface NotificacaoExpirada {
  notificacaoId: string;
  contratoId: string;
  contratoIdentificacao: string;
  diasAtraso: number;
}

interface LinhaContrato {
  id: string;
  pessoa_id: string | null;
  pessoa_email: string | null;
  imovel_identificacao: string;
}

export async function notificarDireitoPreferencia(
  pool: Pool,
  input: {
    contratoId: string;
    valorOferta: number;
    prazoResposta?: number; // dias (default 30)
  }
): Promise<ResultadoNotificacao> {
  const prazoResposta = input.prazoResposta || 30;

  // Buscar locatário principal
  const { rows: contratos } = await pool.query<LinhaContrato>(
    `select c.id, cp.pessoa_id, p.email as pessoa_email, i.identificacao as imovel_identificacao
     from contratos c
     left join contrato_partes cp on cp.contrato_id = c.id and cp.papel = 'locatario_principal'
     left join pessoas p on p.id = cp.pessoa_id
     join imoveis i on i.id = c.imovel_id
     where c.id = $1`,
    [input.contratoId]
  );

  if (contratos.length === 0) {
    throw new Error(`Contrato ${input.contratoId} não encontrado`);
  }

  if (!contratos[0].pessoa_id) {
    throw new Error(`Contrato sem locatário vinculado`);
  }

  const { rows: inserted } = await pool.query<{ id: string }>(
    `insert into notificacoes_preferencia_venda (contrato_id, valor_oferta, notificado_em, prazo_resposta_dias, resposta)
     values ($1, $2, current_date, $3, null)
     returning id`,
    [input.contratoId, input.valorOferta, prazoResposta]
  );

  if (inserted.length === 0) {
    throw new Error('Falha ao notificar direito de preferência');
  }

  // TODO: Enviar email para locatário notificando do direito e prazo
  // via Resend ou outro provider

  console.log(
    `Direito de Preferência notificado para contrato ${input.contratoId} - Valor: R$ ${input.valorOferta.toFixed(2)} - Prazo: ${prazoResposta} dias`
  );

  return {
    id: inserted[0].id,
    contratoId: input.contratoId,
    locatarioEmail: contratos[0].pessoa_email,
    valorOferta: input.valorOferta,
    prazoResposta: prazoResposta,
  };
}

export async function registrarRespostaDireitoPreferencia(
  pool: Pool,
  input: {
    notificacaoId: string;
    resposta: RespostaDireitoPreferencia;
  }
): Promise<{ id: string }> {
  const { rows } = await pool.query<{ id: string }>(
    `update notificacoes_preferencia_venda
     set resposta = $1
     where id = $2
     returning id`,
    [input.resposta, input.notificacaoId]
  );

  if (rows.length === 0) {
    throw new Error(`Notificação de preferência ${input.notificacaoId} não encontrada`);
  }

  return { id: rows[0].id };
}

export async function detectarPrazosExpirados(pool: Pool): Promise<NotificacaoExpirada[]> {
  const { rows } = await pool.query<{ id: string; contrato_id: string; imovel_identificacao: string; dias_atraso: number }>(
    `select
       npv.id, npv.contrato_id, i.identificacao as imovel_identificacao,
       floor(extract(day from (now() - (npv.notificado_em + (npv.prazo_resposta_dias || ' days')::interval)))) as dias_atraso
     from notificacoes_preferencia_venda npv
     join contratos c on c.id = npv.contrato_id
     join imoveis i on i.id = c.imovel_id
     where npv.resposta is null
       and (npv.notificado_em + (npv.prazo_resposta_dias || ' days')::interval) < now()`,
  );

  // Atualizar status para 'sem_resposta' (expirou prazo)
  for (const row of rows) {
    await pool.query(
      `update notificacoes_preferencia_venda set resposta = 'sem_resposta' where id = $1`,
      [row.id]
    );
  }

  return rows.map((r) => ({
    notificacaoId: r.id,
    contratoId: r.contrato_id,
    contratoIdentificacao: r.imovel_identificacao,
    diasAtraso: r.dias_atraso,
  }));
}
