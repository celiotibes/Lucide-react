import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { encerrarPool } from '@/server/integracao/db';
import { GET } from './route';

const DATABASE_URL = process.env.DATABASE_URL;
const SEGREDO = 'segredo-de-teste';

describe.skipIf(!DATABASE_URL)('rota /api/cron/distribuir-recebimentos (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });

  beforeEach(() => {
    process.env.CRON_SECRET = SEGREDO;
  });

  afterAll(async () => {
    await pool.end();
    await encerrarPool();
  });

  function requisicao(autorizacao: string | null): NextRequest {
    const headers: Record<string, string> = {};
    if (autorizacao !== null) headers.authorization = autorizacao;
    return new NextRequest(new Request('http://localhost/api/cron/distribuir-recebimentos', { headers }));
  }

  it('sem autorização: 401', async () => {
    const resposta = await GET(requisicao(null));
    expect(resposta.status).toBe(401);
  });

  it('com segredo correto: distribui faturas pagas pendentes de repasse', async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'kitnet') returning id`,
      [cidade.rows[0].id, `Teste Cron Distrib ${randomUUID()}`],
    );
    const proprietario = await pool.query(`insert into pessoas (nome) values ('Proprietário Cron') returning id`);
    await pool.query(`insert into imovel_propriedade (imovel_id, proprietario_pessoa_id, percentual) values ($1, $2, 1)`, [
      imovel.rows[0].id,
      proprietario.rows[0].id,
    ]);
    const contrato = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', '2026-01-01', 10, 1000) returning id`,
      [imovel.rows[0].id],
    );
    await pool.query(
      `insert into faturas (contrato_id, imovel_id, competencia, tipo, valor_bruto, valor_liquido, vencimento, status)
       values ($1, $2, '2026-07-01', 'aluguel', 1000, 1000, '2026-07-10', 'paga')`,
      [contrato.rows[0].id, imovel.rows[0].id],
    );

    const resposta = await GET(requisicao(`Bearer ${SEGREDO}`));
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.distribuidas).toBeGreaterThanOrEqual(1);

    const { rows } = await pool.query(`select valor from investidor_ledger where pessoa_id = $1`, [
      proprietario.rows[0].id,
    ]);
    expect(Number(rows[0].valor)).toBe(1000);
  });
});
