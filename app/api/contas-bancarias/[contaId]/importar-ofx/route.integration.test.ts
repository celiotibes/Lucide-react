import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { encerrarPool } from '@/server/integracao/db';
import { gerarOFX } from '@/server/relatorios/ofx';
import { POST } from './route';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('rota /api/contas-bancarias/[contaId]/importar-ofx (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });

  afterAll(async () => {
    await pool.end();
    await encerrarPool();
  });

  function requisicao(corpo: string): NextRequest {
    return new NextRequest(new Request('http://localhost/api/contas-bancarias/x/importar-ofx', { method: 'POST', body: corpo }));
  }

  it('conta bancária inexistente: 404', async () => {
    const resposta = await POST(requisicao('conteudo'), { params: Promise.resolve({ contaId: randomUUID() }) });
    expect(resposta.status).toBe(404);
  });

  it('corpo vazio: 400', async () => {
    const conta = await pool.query(`insert into contas_bancarias (instituicao, tipo) values ($1, 'corrente') returning id`, [
      `Banco Rota ${randomUUID()}`,
    ]);
    const resposta = await POST(requisicao('   '), { params: Promise.resolve({ contaId: conta.rows[0].id }) });
    expect(resposta.status).toBe(400);
  });

  it('OFX válido: importa e devolve a contagem', async () => {
    const conta = await pool.query(`insert into contas_bancarias (instituicao, tipo) values ($1, 'corrente') returning id`, [
      `Banco Rota ${randomUUID()}`,
    ]);
    const ofx = gerarOFX(
      [{ id: `fit_${randomUUID()}`, data: new Date(Date.UTC(2026, 6, 10)), valor: 1000, descricao: 'Teste' }],
      { contaId: 'x', dataInicio: new Date(Date.UTC(2026, 6, 1)), dataFim: new Date(Date.UTC(2026, 6, 31)) },
    );

    const resposta = await POST(requisicao(ofx), { params: Promise.resolve({ contaId: conta.rows[0].id }) });
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.importadas).toBe(1);
  });

  it('OFX malformado: 400, não 500', async () => {
    const conta = await pool.query(`insert into contas_bancarias (instituicao, tipo) values ($1, 'corrente') returning id`, [
      `Banco Rota ${randomUUID()}`,
    ]);
    const resposta = await POST(
      requisicao(`<STMTTRN>\n<TRNTYPE>CREDIT\n<DTPOSTED>20260710\n<TRNAMT>10.00\n</STMTTRN>`),
      { params: Promise.resolve({ contaId: conta.rows[0].id }) },
    );
    expect(resposta.status).toBe(400);
  });
});
