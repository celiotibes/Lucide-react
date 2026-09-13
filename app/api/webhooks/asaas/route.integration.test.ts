// Teste de integração real contra Postgres, chamando o handler POST
// diretamente com um NextRequest construído à mão (mesmo padrão de
// app/api/cron/gerar-fatura-mensal/route.integration.test.ts).
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { encerrarPool } from '@/server/integracao/db';
import { POST } from './route';

const DATABASE_URL = process.env.DATABASE_URL;
const TOKEN = 'segredo-webhook-teste';

describe.skipIf(!DATABASE_URL)('rota /api/webhooks/asaas (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let faturaId: string;
  let cobrancaAsaasId: string;

  beforeEach(async () => {
    process.env.ASAAS_WEBHOOK_TOKEN = TOKEN;

    const cidade = await pool.query(`select id from cidades limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'kitnet') returning id`,
      [cidade.rows[0].id, `Teste Webhook ${randomUUID()}`],
    );
    const contrato = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', '2026-01-01', 10, 1000) returning id`,
      [imovel.rows[0].id],
    );
    const fatura = await pool.query(
      `insert into faturas (contrato_id, imovel_id, competencia, tipo, valor_bruto, valor_liquido, vencimento, status)
       values ($1, $2, '2026-07-01', 'aluguel', 1000, 1000, '2026-07-10', 'aberta') returning id`,
      [contrato.rows[0].id, imovel.rows[0].id],
    );
    faturaId = fatura.rows[0].id;

    cobrancaAsaasId = `pay_${randomUUID()}`;
    await pool.query(
      `insert into cobrancas_asaas (fatura_id, asaas_id, tipo, valor_cobrado, status) values ($1, $2, 'boleto', 1000, 'pendente')`,
      [faturaId, cobrancaAsaasId],
    );
  });

  afterAll(async () => {
    await pool.end();
    await encerrarPool();
  });

  function requisicao(corpo: unknown, token: string | null = TOKEN): NextRequest {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token !== null) headers['asaas-access-token'] = token;
    return new NextRequest(
      new Request('http://localhost/api/webhooks/asaas', { method: 'POST', headers, body: JSON.stringify(corpo) }),
    );
  }

  it('sem token: 401, não toca o banco', async () => {
    const resposta = await POST(requisicao({ event: 'PAYMENT_RECEIVED', payment: { id: cobrancaAsaasId, value: 1000 } }, null));
    expect(resposta.status).toBe(401);

    const { rows } = await pool.query(`select status from faturas where id = $1`, [faturaId]);
    expect(rows[0].status).toBe('aberta');
  });

  it('token errado: 401', async () => {
    const resposta = await POST(
      requisicao({ event: 'PAYMENT_RECEIVED', payment: { id: cobrancaAsaasId, value: 1000 } }, 'token-errado'),
    );
    expect(resposta.status).toBe(401);
  });

  it('PAYMENT_RECEIVED: marca a cobrança como paga e a fatura como paga', async () => {
    const resposta = await POST(requisicao({ event: 'PAYMENT_RECEIVED', payment: { id: cobrancaAsaasId, value: 1000 } }));
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.processado).toBe(true);
    expect(corpo.faturaId).toBe(faturaId);

    const { rows: cobranca } = await pool.query(`select status, data_pagamento from cobrancas_asaas where asaas_id = $1`, [
      cobrancaAsaasId,
    ]);
    expect(cobranca[0].status).toBe('pago');
    expect(cobranca[0].data_pagamento).not.toBeNull();

    const { rows: fatura } = await pool.query(`select status from faturas where id = $1`, [faturaId]);
    expect(fatura[0].status).toBe('paga');
  });

  it('PAYMENT_CONFIRMED (evento alternativo de confirmação) tem o mesmo efeito', async () => {
    const resposta = await POST(requisicao({ event: 'PAYMENT_CONFIRMED', payment: { id: cobrancaAsaasId, value: 1000 } }));
    expect(resposta.status).toBe(200);
    const { rows } = await pool.query(`select status from faturas where id = $1`, [faturaId]);
    expect(rows[0].status).toBe('paga');
  });

  it('idempotência: reenviar o mesmo evento não falha nem reprocessa', async () => {
    await POST(requisicao({ event: 'PAYMENT_RECEIVED', payment: { id: cobrancaAsaasId, value: 1000 } }));
    const segunda = await POST(requisicao({ event: 'PAYMENT_RECEIVED', payment: { id: cobrancaAsaasId, value: 1000 } }));

    expect(segunda.status).toBe(200);
    const corpo = await segunda.json();
    expect(corpo.motivo).toBe('ja_processado_anteriormente');
  });

  it('cobrança desconhecida (não emitida por nós): 200, sinaliza sem processar, não lança erro', async () => {
    const resposta = await POST(
      requisicao({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_desconhecido', value: 1000 } }),
    );
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.processado).toBe(false);
    expect(corpo.motivo).toBe('cobranca_nao_encontrada');
  });

  it('PAYMENT_OVERDUE: reconhecido, mas não altera nada (régua de cobrança cuida disso)', async () => {
    const resposta = await POST(requisicao({ event: 'PAYMENT_OVERDUE', payment: { id: cobrancaAsaasId } }));
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.processado).toBe(false);

    const { rows } = await pool.query(`select status from faturas where id = $1`, [faturaId]);
    expect(rows[0].status).toBe('aberta'); // não mudou
  });

  it('PAYMENT_REFUNDED: cancela a cobrança, mas não mexe na fatura (sem status "estornada" no schema)', async () => {
    await POST(requisicao({ event: 'PAYMENT_RECEIVED', payment: { id: cobrancaAsaasId, value: 1000 } }));
    const resposta = await POST(requisicao({ event: 'PAYMENT_REFUNDED', payment: { id: cobrancaAsaasId } }));

    expect(resposta.status).toBe(200);
    const { rows: cobranca } = await pool.query(`select status from cobrancas_asaas where asaas_id = $1`, [cobrancaAsaasId]);
    expect(cobranca[0].status).toBe('cancelado');

    const { rows: fatura } = await pool.query(`select status from faturas where id = $1`, [faturaId]);
    expect(fatura[0].status).toBe('paga'); // deliberadamente não alterado
  });

  it('evento desconhecido/futuro: 200, sinaliza como não tratado, nunca derruba o processamento', async () => {
    const resposta = await POST(requisicao({ event: 'ALGUM_EVENTO_FUTURO_DESCONHECIDO', payment: { id: cobrancaAsaasId } }));
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.processado).toBe(false);
  });

  it('payload malformado: 400, não lança exceção não tratada', async () => {
    const resposta = await POST(requisicao({ evento_sem_campo_esperado: true }));
    expect(resposta.status).toBe(400);
  });
});
