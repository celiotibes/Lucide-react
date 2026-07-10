// Teste de integração real contra Postgres — não mockado (mesmo padrão de
// server/integracao/*.integration.test.ts). Chama os handlers GET/POST
// diretamente com um NextRequest construído à mão, sem subir um servidor
// HTTP de verdade — suficiente para validar autenticação, parsing de
// parâmetro e a chamada real a gerarFaturaMensal contra o banco.
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET, POST } from './route';

const DATABASE_URL = process.env.DATABASE_URL;
const SEGREDO = 'segredo-de-teste';

describe.skipIf(!DATABASE_URL)('rota /api/cron/gerar-fatura-mensal (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let imovelId: string;
  let contratoId: string;

  beforeEach(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.CRON_SECRET = SEGREDO;

    const cidade = await pool.query(`select id from cidades limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'apartamento') returning id`,
      [cidade.rows[0].id, `Teste Cron ${randomUUID()}`],
    );
    imovelId = imovel.rows[0].id;

    const contrato = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', '2026-01-01', 10, 1200) returning id`,
      [imovelId],
    );
    contratoId = contrato.rows[0].id;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  afterAll(async () => {
    await pool.end();
  });

  function requisicao(query: string, autorizacao: string | null): NextRequest {
    const headers: Record<string, string> = {};
    if (autorizacao !== null) headers.authorization = autorizacao;
    return new NextRequest(new Request(`http://localhost/api/cron/gerar-fatura-mensal${query}`, { headers }));
  }

  it('sem cabeçalho de autorização: 401', async () => {
    const resposta = await GET(requisicao('', null));
    expect(resposta.status).toBe(401);
  });

  it('com segredo errado: 401', async () => {
    const resposta = await GET(requisicao('', 'Bearer segredo-errado'));
    expect(resposta.status).toBe(401);
  });

  it('com segredo correto e competência explícita: gera a fatura do contrato de teste', async () => {
    const resposta = await GET(requisicao('?competencia=2026-07', `Bearer ${SEGREDO}`));
    expect(resposta.status).toBe(200);

    const corpo = await resposta.json();
    expect(corpo.competencia).toBe('2026-07-01');
    const gerada = corpo.contratos.find((c: { contratoId: string }) => c.contratoId === contratoId);
    expect(gerada).toBeDefined();
    expect(gerada.valorTotal).toBe(1200);

    const { rows } = await pool.query(`select count(*)::int as total from faturas where contrato_id = $1`, [contratoId]);
    expect(rows[0].total).toBe(1);
  });

  it('POST funciona igual a GET (n8n normalmente chama com POST)', async () => {
    const resposta = await POST(requisicao('?competencia=2026-07', `Bearer ${SEGREDO}`));
    expect(resposta.status).toBe(200);
  });

  it('competência em formato inválido: 400', async () => {
    const resposta = await GET(requisicao('?competencia=julho-2026', `Bearer ${SEGREDO}`));
    expect(resposta.status).toBe(400);
  });

  it('sem parâmetro de competência: usa o mês corrente', async () => {
    const agora = new Date();
    const competenciaEsperada = `${agora.getUTCFullYear()}-${String(agora.getUTCMonth() + 1).padStart(2, '0')}-01`;

    const resposta = await GET(requisicao('', `Bearer ${SEGREDO}`));
    const corpo = await resposta.json();
    expect(corpo.competencia).toBe(competenciaEsperada);
  });
});
