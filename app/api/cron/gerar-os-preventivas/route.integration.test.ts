import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { encerrarPool } from '@/server/integracao/db';
import { GET } from './route';

const DATABASE_URL = process.env.DATABASE_URL;
const SEGREDO = 'segredo-de-teste';

describe.skipIf(!DATABASE_URL)('rota /api/cron/gerar-os-preventivas (integração real com Postgres)', () => {
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
    return new NextRequest(new Request('http://localhost/api/cron/gerar-os-preventivas', { headers }));
  }

  it('sem autorização: 401', async () => {
    const resposta = await GET(requisicao(null));
    expect(resposta.status).toBe(401);
  });

  it('com segredo correto: gera a OS de um plano preventivo vencido', async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'kitnet') returning id`,
      [cidade.rows[0].id, `Teste Cron Preventiva ${randomUUID()}`],
    );
    const plano = await pool.query(
      `insert into planos_manutencao_preventiva (imovel_id, categoria, descricao, periodicidade_dias, proxima_execucao)
       values ($1, 'limpeza_caixa_dagua', 'Limpeza semestral', 180, '2026-07-01') returning id`,
      [imovel.rows[0].id],
    );

    const resposta = await GET(requisicao(`Bearer ${SEGREDO}`));
    expect(resposta.status).toBe(200);

    const corpo = await resposta.json();
    expect(corpo.geradas).toBeGreaterThanOrEqual(1);
    expect(corpo.detalhe.some((g: { planoId: string }) => g.planoId === plano.rows[0].id)).toBe(true);

    const { rows } = await pool.query(`select count(*)::int as total from ordens_servico where plano_manutencao_id = $1`, [
      plano.rows[0].id,
    ]);
    expect(rows[0].total).toBe(1);
  });
});
