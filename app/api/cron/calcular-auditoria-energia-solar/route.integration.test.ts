import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { encerrarPool } from '@/server/integracao/db';
import { GET } from './route';

const DATABASE_URL = process.env.DATABASE_URL;
const SEGREDO = 'segredo-de-teste';

describe.skipIf(!DATABASE_URL)('rota /api/cron/calcular-auditoria-energia-solar (integração real com Postgres)', () => {
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

  function requisicao(query: string, autorizacao: string | null): NextRequest {
    const headers: Record<string, string> = {};
    if (autorizacao !== null) headers.authorization = autorizacao;
    return new NextRequest(new Request(`http://localhost/api/cron/calcular-auditoria-energia-solar${query}`, { headers }));
  }

  it('sem autorização: 401', async () => {
    const resposta = await GET(requisicao('', null));
    expect(resposta.status).toBe(401);
  });

  it('com segredo correto: calcula a auditoria do residencial com as duas fontes confirmadas', async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const residencial = await pool.query(`insert into residenciais (nome, cidade_id) values ($1, $2) returning id`, [
      `Residencial Cron Auditoria ${randomUUID()}`,
      cidade.rows[0].id,
    ]);
    const residencialId = residencial.rows[0].id;
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, residencial_id, identificacao, tipo) values ($1, $2, $3, 'kitnet') returning id`,
      [cidade.rows[0].id, residencialId, `Kitnet Cron Auditoria ${randomUUID()}`],
    );

    await pool.query(
      `insert into leituras_energia (imovel_id, data_leitura, leitura_kwh, origem, status) values
       ($1, '2026-05-01', 1000, 'manual', 'confirmada'),
       ($1, '2026-06-01', 1300, 'manual', 'confirmada')`,
      [imovel.rows[0].id],
    );
    await pool.query(
      `insert into geracao_solar (residencial_id, competencia, energia_gerada_kwh, status) values
       ($1, '2026-06-01', 1000, 'confirmada')`,
      [residencialId],
    );
    await pool.query(
      `insert into faturas_celesc_gd (residencial_id, competencia, valor_total, energia_injetada_kwh, energia_consumida_rede_kwh, status) values
       ($1, '2026-06-01', 200, 400, 100, 'confirmada')`,
      [residencialId],
    );

    const resposta = await GET(requisicao('?competencia=2026-06', `Bearer ${SEGREDO}`));
    expect(resposta.status).toBe(200);

    const corpo = await resposta.json();
    expect(corpo.competencia).toBe('2026-06-01');
    const calculada = corpo.calculadas.find((c: { residencialId: string }) => c.residencialId === residencialId);
    expect(calculada).toBeDefined();
    expect(calculada.areaComumKwh).toBe(400);
  });

  it('sem parâmetro de competência: usa o mês anterior ao corrente', async () => {
    const agora = new Date();
    const mesAnterior = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - 1, 1));
    const competenciaEsperada = `${mesAnterior.getUTCFullYear()}-${String(mesAnterior.getUTCMonth() + 1).padStart(2, '0')}-01`;

    const resposta = await GET(requisicao('', `Bearer ${SEGREDO}`));
    const corpo = await resposta.json();
    expect(corpo.competencia).toBe(competenciaEsperada);
  });
});
