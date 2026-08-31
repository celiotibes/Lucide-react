import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { encerrarPool } from '@/server/integracao/db';
import { GET } from './route';

const DATABASE_URL = process.env.DATABASE_URL;
const SEGREDO = 'segredo-de-teste';

describe.skipIf(!DATABASE_URL)('rota /api/cron/regua-cobranca (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });

  beforeEach(() => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.CRON_SECRET = SEGREDO;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  afterAll(async () => {
    await pool.end();
    await encerrarPool();
  });

  function requisicao(autorizacao: string | null): NextRequest {
    const headers: Record<string, string> = {};
    if (autorizacao !== null) headers.authorization = autorizacao;
    return new NextRequest(new Request('http://localhost/api/cron/regua-cobranca', { headers }));
  }

  it('sem autorização: 401', async () => {
    const resposta = await GET(requisicao(null));
    expect(resposta.status).toBe(401);
  });

  it('com segredo correto: registra o marco D5 de uma fatura vencida há 6 dias', async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'kitnet') returning id`,
      [cidade.rows[0].id, `Teste Cron Regua ${randomUUID()}`],
    );
    const contrato = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', '2026-01-01', 10, 1000) returning id`,
      [imovel.rows[0].id],
    );
    const seisDiasAtras = new Date();
    seisDiasAtras.setUTCDate(seisDiasAtras.getUTCDate() - 6);
    const vencimento = seisDiasAtras.toISOString().slice(0, 10);
    const fatura = await pool.query(
      `insert into faturas (contrato_id, imovel_id, competencia, tipo, valor_bruto, valor_liquido, vencimento, status)
       values ($1, $2, '2026-06-01', 'aluguel', 1000, 1000, $3, 'aberta') returning id`,
      [contrato.rows[0].id, imovel.rows[0].id, vencimento],
    );

    const resposta = await GET(requisicao(`Bearer ${SEGREDO}`));
    expect(resposta.status).toBe(200);

    const corpo = await resposta.json();
    const processada = corpo.detalhe.find((d: { faturaId: string }) => d.faturaId === fatura.rows[0].id);
    expect(processada).toBeDefined();
    expect(processada.eventosRegistrados).toContain('D5');
  });
});
