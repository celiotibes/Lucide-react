// A rota constrói o AsaasClient com o fetch global (não há injeção de
// fetchImpl na assinatura pública da rota) — este teste substitui
// `globalThis.fetch` para não bater na rede de verdade, mesmo padrão de
// mock já usado em server/asaas/client.test.ts, só que via stub global em
// vez de fetchImpl injetado.
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encerrarPool } from '@/server/integracao/db';
import { GET } from './route';

const DATABASE_URL = process.env.DATABASE_URL;
const SEGREDO = 'segredo-de-teste';

describe.skipIf(!DATABASE_URL)('rota /api/cron/emitir-cobrancas (integração real com Postgres, Asaas mockado)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });

  beforeEach(() => {
    process.env.CRON_SECRET = SEGREDO;
    process.env.ASAAS_API_KEY = 'chave-teste';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await pool.end();
    await encerrarPool();
  });

  function requisicao(autorizacao: string | null): NextRequest {
    const headers: Record<string, string> = {};
    if (autorizacao !== null) headers.authorization = autorizacao;
    return new NextRequest(new Request('http://localhost/api/cron/emitir-cobrancas', { headers }));
  }

  it('sem autorização: 401, não chama o Asaas', async () => {
    const fetchFake = vi.fn();
    vi.stubGlobal('fetch', fetchFake);

    const resposta = await GET(requisicao(null));
    expect(resposta.status).toBe(401);
    expect(fetchFake).not.toHaveBeenCalled();
  });

  it('sem ASAAS_API_KEY configurada: 500', async () => {
    delete process.env.ASAAS_API_KEY;
    const resposta = await GET(requisicao(`Bearer ${SEGREDO}`));
    expect(resposta.status).toBe(500);
  });

  it('com segredo e chave configurados: emite cobrança para fatura aberta com locatário válido', async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'kitnet') returning id`,
      [cidade.rows[0].id, `Teste Cron Emissao ${randomUUID()}`],
    );
    const cpf = randomUUID().replace(/\D/g, '').slice(0, 11).padEnd(11, '0');
    const locatario = await pool.query(`insert into pessoas (nome, cpf_cnpj) values ('Locatário Cron', $1) returning id`, [
      cpf,
    ]);
    const contrato = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', '2026-01-01', 10, 1000) returning id`,
      [imovel.rows[0].id],
    );
    await pool.query(`insert into contrato_partes (contrato_id, pessoa_id, papel) values ($1, $2, 'locatario_principal')`, [
      contrato.rows[0].id,
      locatario.rows[0].id,
    ]);
    const fatura = await pool.query(
      `insert into faturas (contrato_id, imovel_id, competencia, tipo, valor_bruto, valor_liquido, vencimento, status)
       values ($1, $2, '2026-07-01', 'aluguel', 1000, 1000, '2026-07-10', 'aberta') returning id`,
      [contrato.rows[0].id, imovel.rows[0].id],
    );

    // `emitirCobrancasPendentes` varre o portfólio inteiro de propósito
    // (mesmo comportamento de produção) — outras faturas 'aberta' com
    // locatário e CPF válidos deixadas por outros arquivos de teste na
    // mesma suíte podem ser varridas na mesma chamada. IDs únicos por
    // requisição (não uma string fixa) evitam colidir com a constraint
    // unique de `cobrancas_asaas.asaas_id`/`pessoas.asaas_customer_id`
    // quando isso acontece.
    const fetchFake = vi.fn(async (url: string, opts?: RequestInit) => {
      const chave = `${opts?.method ?? 'GET'} ${url.split('?')[0]}`;
      if (chave === 'GET https://api.asaas.com/v3/customers') {
        return { ok: true, status: 200, json: async () => ({ data: [] }) };
      }
      if (chave === 'POST https://api.asaas.com/v3/customers') {
        return { ok: true, status: 200, json: async () => ({ id: `cus_${randomUUID()}`, name: 'x', cpfCnpj: cpf }) };
      }
      if (chave === 'POST https://api.asaas.com/v3/payments') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: `pay_${randomUUID()}`, status: 'PENDING', value: 1000, invoiceUrl: 'u' }),
        };
      }
      throw new Error(`rota não mockada: ${chave}`);
    });
    vi.stubGlobal('fetch', fetchFake);

    const resposta = await GET(requisicao(`Bearer ${SEGREDO}`));
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.emitidas).toBeGreaterThanOrEqual(1);

    const { rows } = await pool.query(`select asaas_id from cobrancas_asaas where fatura_id = $1`, [fatura.rows[0].id]);
    expect(rows[0].asaas_id).toMatch(/^pay_/);
  });
});
