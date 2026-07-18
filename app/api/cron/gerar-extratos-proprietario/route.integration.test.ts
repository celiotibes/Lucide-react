import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { encerrarPool } from '@/server/integracao/db';
import { GET } from './route';

const DATABASE_URL = process.env.DATABASE_URL;
const SEGREDO = 'segredo-de-teste';

describe.skipIf(!DATABASE_URL)('rota /api/cron/gerar-extratos-proprietario (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });

  beforeEach(() => {
    process.env.CRON_SECRET = SEGREDO;
  });

  afterAll(async () => {
    await pool.end();
    await encerrarPool();
  });

  function requisicao(query: string, autorizacao: string | null): NextRequest {
    const headers: Record<string, string> = {};
    if (autorizacao !== null) headers.authorization = autorizacao;
    return new NextRequest(new Request(`http://localhost/api/cron/gerar-extratos-proprietario${query}`, { headers }));
  }

  it('sem autorização: 401', async () => {
    const resposta = await GET(requisicao('', null));
    expect(resposta.status).toBe(401);
  });

  it('gera o extrato para a competência informada', async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'kitnet') returning id`,
      [cidade.rows[0].id, `Teste Cron Extrato ${randomUUID()}`],
    );
    const proprietario = await pool.query(`insert into pessoas (nome) values ('Proprietário Cron Extrato') returning id`);
    await pool.query(`insert into imovel_propriedade (imovel_id, proprietario_pessoa_id, percentual) values ($1, $2, 1)`, [
      imovel.rows[0].id,
      proprietario.rows[0].id,
    ]);
    await pool.query(
      `insert into investidor_ledger (pessoa_id, imovel_id, data, tipo, valor, valor_bruto, saldo_apos)
       values ($1, $2, '2026-07-15', 'credito_repasse', 900, 1000, 900)`,
      [proprietario.rows[0].id, imovel.rows[0].id],
    );

    const resposta = await GET(requisicao('?competencia=2026-07', `Bearer ${SEGREDO}`));
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.competencia).toBe('2026-07-01');
    expect(corpo.gerados).toBeGreaterThanOrEqual(2); // por imóvel + consolidado
  });

  it('sem parâmetro de competência: usa o mês anterior ao corrente', async () => {
    const agora = new Date();
    const mesAnteriorEsperado = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - 1, 1));
    const esperado = `${mesAnteriorEsperado.getUTCFullYear()}-${String(mesAnteriorEsperado.getUTCMonth() + 1).padStart(2, '0')}-01`;

    const resposta = await GET(requisicao('', `Bearer ${SEGREDO}`));
    const corpo = await resposta.json();
    expect(corpo.competencia).toBe(esperado);
  });
});
