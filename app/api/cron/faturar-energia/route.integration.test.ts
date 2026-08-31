import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { encerrarPool } from '@/server/integracao/db';
import { GET, POST } from './route';

const DATABASE_URL = process.env.DATABASE_URL;
const SEGREDO = 'segredo-de-teste';

describe.skipIf(!DATABASE_URL)('rota /api/cron/faturar-energia (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let contratoId: string;

  beforeEach(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.CRON_SECRET = SEGREDO;

    const cidade = await pool.query(`select id from cidades where nome = 'Florianópolis' limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo, franquia_energia_kwh, taxa_administracao_energia_pct)
       values ($1, $2, 'kitnet', 30, 0.25) returning id`,
      [cidade.rows[0].id, `Teste Cron Energia ${randomUUID()}`],
    );
    const contrato = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', '2026-01-01', 10, 1000) returning id`,
      [imovel.rows[0].id],
    );
    contratoId = contrato.rows[0].id;

    await pool.query(
      `insert into tarifas_energia (distribuidora, vigencia_inicio, te_valor, tusd_valor, bandeira)
       values ('CELESC', '2026-01-01', 0.40, 0.35, 'verde')`,
    );
    // Competência 2026-09 (não 2026-07): faturarEnergiaConfirmada varre TODAS as
    // leituras confirmadas da competência, sem filtrar por contrato — usar o
    // mesmo mês de server/integracao/faturarEnergia.integration.test.ts faria
    // essas leituras de teste vazarem para as asserções daquele arquivo (e
    // vice-versa), já que os dois arquivos rodam contra o mesmo Postgres na
    // mesma execução (`fileParallelism: false`, sem reset de banco entre
    // arquivos).
    await pool.query(
      `insert into leituras_energia (imovel_id, contrato_id, data_leitura, leitura_kwh, origem, status)
       values ($1, $2, '2026-08-30', 1000, 'manual', 'confirmada'), ($1, $2, '2026-09-30', 1100, 'manual', 'confirmada')`,
      [imovel.rows[0].id, contratoId],
    );
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
    return new NextRequest(new Request(`http://localhost/api/cron/faturar-energia${query}`, { headers }));
  }

  it('sem autorização: 401', async () => {
    const resposta = await GET(requisicao('', null));
    expect(resposta.status).toBe(401);
  });

  it('com segredo correto e competência explícita: fatura a leitura confirmada do contrato de teste', async () => {
    const resposta = await GET(requisicao('?competencia=2026-09', `Bearer ${SEGREDO}`));
    expect(resposta.status).toBe(200);

    const corpo = await resposta.json();
    expect(corpo.competencia).toBe('2026-09-01');
    expect(corpo.faturadas).toBeGreaterThanOrEqual(1);

    const { rows } = await pool.query(`select count(*)::int as total from faturas where contrato_id = $1 and tipo = 'energia'`, [
      contratoId,
    ]);
    expect(rows[0].total).toBe(1);
  });

  it('POST funciona igual a GET', async () => {
    const resposta = await POST(requisicao('?competencia=2026-09', `Bearer ${SEGREDO}`));
    expect(resposta.status).toBe(200);
  });

  it('competência em formato inválido: 400', async () => {
    const resposta = await GET(requisicao('?competencia=julho-2026', `Bearer ${SEGREDO}`));
    expect(resposta.status).toBe(400);
  });
});
