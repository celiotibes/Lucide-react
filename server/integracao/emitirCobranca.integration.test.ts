// Teste de integração real contra Postgres — o lado do Asaas é mockado
// (mesmo padrão de server/asaas/client.test.ts: `fetchImpl` injetável),
// porque não há chave de sandbox neste ambiente (docs/09). O que este
// teste prova é a lógica de banco: idempotência, resolução/criação de
// cliente, dado insuficiente pulado — não o comportamento real da API.
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AsaasClient } from '../asaas/client';
import { emitirCobrancasPendentes } from './emitirCobranca';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('emitirCobrancasPendentes (integração real com Postgres, Asaas mockado)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let imovelId: string;
  let contratoId: string;

  beforeEach(async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'kitnet') returning id`,
      [cidade.rows[0].id, `Teste Cobranca ${randomUUID()}`],
    );
    imovelId = imovel.rows[0].id;

    const contrato = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', '2026-01-01', 10, 1500) returning id`,
      [imovelId],
    );
    contratoId = contrato.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  function cpfUnico(): string {
    return randomUUID().replace(/\D/g, '').slice(0, 11).padEnd(11, '0');
  }

  async function criarLocatario(opts: { cpfCnpj?: string | null } = {}) {
    const { rows } = await pool.query(
      `insert into pessoas (nome, cpf_cnpj, email) values ($1, $2, 'inquilino@exemplo.com') returning id`,
      [`Locatário ${randomUUID()}`, opts.cpfCnpj === undefined ? cpfUnico() : opts.cpfCnpj],
    );
    return rows[0].id as string;
  }

  async function vincularLocatario(pessoaId: string) {
    await pool.query(`insert into contrato_partes (contrato_id, pessoa_id, papel) values ($1, $2, 'locatario_principal')`, [
      contratoId,
      pessoaId,
    ]);
  }

  async function criarFaturaAberta(valor = 1500) {
    const { rows } = await pool.query(
      `insert into faturas (contrato_id, imovel_id, competencia, tipo, valor_bruto, valor_liquido, vencimento, status)
       values ($1, $2, '2026-07-01', 'aluguel', $3, $3, '2026-07-10', 'aberta') returning id`,
      [contratoId, imovelId, valor],
    );
    return rows[0].id as string;
  }

  function clienteMockado(rotas: Record<string, { status: number; corpo: unknown }>) {
    // `emitirCobrancasPendentes` varre o portfólio inteiro de propósito —
    // se uma rota POST (criar cliente/cobrança) for chamada mais de uma
    // vez na mesma varredura (outra fatura 'aberta' residual de outro
    // teste com locatário/CPF válido também sendo processada), um `id`
    // fixo no corpo mockado colidiria com a constraint unique real
    // (`cobrancas_asaas.asaas_id`/`pessoas.asaas_customer_id`). Por isso
    // o `id` de qualquer resposta POST ganha um sufixo único a cada
    // chamada — os testes verificam prefixo (`toMatch`), não igualdade
    // exata.
    const fetchFake = vi.fn(async (url: string, opts?: RequestInit) => {
      const chave = `${opts?.method ?? 'GET'} ${url.split('?')[0]}`;
      const resposta = rotas[chave];
      if (!resposta) throw new Error(`rota não mockada: ${chave}`);
      let corpo = resposta.corpo;
      if (chave.startsWith('POST') && corpo && typeof corpo === 'object' && 'id' in corpo) {
        corpo = { ...corpo, id: `${(corpo as { id: string }).id}_${randomUUID()}` };
      }
      return {
        ok: resposta.status >= 200 && resposta.status < 300,
        status: resposta.status,
        json: async () => corpo,
      };
    }) as unknown as typeof fetch;
    return new AsaasClient({ apiKey: 'chave-teste', fetchImpl: fetchFake });
  }

  it('cria cliente novo no Asaas, emite a cobrança e grava tudo — persiste asaas_customer_id na pessoa', async () => {
    const pessoaId = await criarLocatario();
    await vincularLocatario(pessoaId);
    const faturaId = await criarFaturaAberta(1500);

    const client = clienteMockado({
      'GET https://api.asaas.com/v3/customers': { status: 200, corpo: { data: [] } },
      'POST https://api.asaas.com/v3/customers': { status: 200, corpo: { id: 'cus_novo', name: 'x', cpfCnpj: '11122233344' } },
      'POST https://api.asaas.com/v3/payments': {
        status: 200,
        corpo: { id: 'pay_1', status: 'PENDING', value: 1500, invoiceUrl: 'https://asaas.com/i/pay_1' },
      },
    });

    const resultado = await emitirCobrancasPendentes(pool, client);
    const emitida = resultado.emitidas.find((e) => e.faturaId === faturaId);
    expect(emitida).toBeDefined();
    expect(emitida!.cobrancaId).toMatch(/^pay_1_/);

    const { rows: pessoa } = await pool.query(`select asaas_customer_id from pessoas where id = $1`, [pessoaId]);
    expect(pessoa[0].asaas_customer_id).toMatch(/^cus_novo_/);

    const { rows: cobranca } = await pool.query(`select asaas_id, status, valor_cobrado from cobrancas_asaas where fatura_id = $1`, [
      faturaId,
    ]);
    expect(cobranca[0].asaas_id).toMatch(/^pay_1_/);
    expect(cobranca[0].status).toBe('pendente');
    expect(Number(cobranca[0].valor_cobrado)).toBe(1500);
  });

  it('reaproveita cliente já cadastrado no Asaas (encontrado por CPF/CNPJ) sem criar de novo', async () => {
    const pessoaId = await criarLocatario();
    await vincularLocatario(pessoaId);
    await criarFaturaAberta();

    const client = clienteMockado({
      'GET https://api.asaas.com/v3/customers': {
        status: 200,
        corpo: { data: [{ id: 'cus_existente', name: 'x', cpfCnpj: '11122233344' }] },
      },
      'POST https://api.asaas.com/v3/payments': {
        status: 200,
        corpo: { id: 'pay_2', status: 'PENDING', value: 1500, invoiceUrl: 'u' },
      },
    });

    await emitirCobrancasPendentes(pool, client);

    const { rows: pessoa } = await pool.query(`select asaas_customer_id from pessoas where id = $1`, [pessoaId]);
    expect(pessoa[0].asaas_customer_id).toBe('cus_existente');
  });

  it('pessoa já com asaas_customer_id: não busca nem cria cliente de novo', async () => {
    const pessoaId = await criarLocatario();
    await pool.query(`update pessoas set asaas_customer_id = 'cus_ja_tinha' where id = $1`, [pessoaId]);
    await vincularLocatario(pessoaId);
    await criarFaturaAberta();

    const client = clienteMockado({
      'POST https://api.asaas.com/v3/payments': {
        status: 200,
        corpo: { id: 'pay_3', status: 'PENDING', value: 1500, invoiceUrl: 'u' },
      },
    });

    const resultado = await emitirCobrancasPendentes(pool, client);
    expect(resultado.emitidas).toHaveLength(1);
  });

  it('fatura sem locatário vinculado: pula sem chamar o Asaas', async () => {
    const faturaId = await criarFaturaAberta();
    const client = clienteMockado({});

    const resultado = await emitirCobrancasPendentes(pool, client);
    const pulada = resultado.puladas.find((p) => p.faturaId === faturaId);
    expect(pulada?.motivo).toBe('sem_locatario_vinculado');
  });

  it('locatário sem CPF/CNPJ cadastrado: pula sem chamar o Asaas', async () => {
    const pessoaId = await criarLocatario({ cpfCnpj: null });
    await vincularLocatario(pessoaId);
    const faturaId = await criarFaturaAberta();

    const client = clienteMockado({});
    const resultado = await emitirCobrancasPendentes(pool, client);
    const pulada = resultado.puladas.find((p) => p.faturaId === faturaId);
    expect(pulada?.motivo).toBe('locatario_sem_cpf_cnpj');
  });

  it('erro da API do Asaas ao criar a cobrança: pula essa fatura, não derruba o lote', async () => {
    const pessoaId = await criarLocatario();
    await pool.query(`update pessoas set asaas_customer_id = 'cus_x' where id = $1`, [pessoaId]);
    await vincularLocatario(pessoaId);
    const faturaId = await criarFaturaAberta();

    const client = clienteMockado({
      'POST https://api.asaas.com/v3/payments': { status: 400, corpo: { errors: [{ description: 'erro' }] } },
    });

    const resultado = await emitirCobrancasPendentes(pool, client);
    const pulada = resultado.puladas.find((p) => p.faturaId === faturaId);
    expect(pulada?.motivo).toBe('erro_asaas');
  });

  it('idempotência: fatura que já tem cobrança registrada não é reprocessada', async () => {
    const pessoaId = await criarLocatario();
    await vincularLocatario(pessoaId);
    const faturaId = await criarFaturaAberta();
    await pool.query(`insert into cobrancas_asaas (fatura_id, asaas_id, tipo, valor_cobrado) values ($1, 'pay_existente', 'boleto', 1500)`, [
      faturaId,
    ]);

    const client = clienteMockado({});
    const resultado = await emitirCobrancasPendentes(pool, client);
    expect(resultado.emitidas.find((e) => e.faturaId === faturaId)).toBeUndefined();
    expect(resultado.puladas.find((p) => p.faturaId === faturaId)).toBeUndefined();
  });
});
