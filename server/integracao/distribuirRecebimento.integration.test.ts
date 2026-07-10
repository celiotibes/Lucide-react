import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { distribuirRecebimentosPendentes } from './distribuirRecebimento';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('distribuirRecebimentosPendentes (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let cidadeId: string;

  beforeEach(async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    cidadeId = cidade.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  async function criarImovel() {
    const { rows } = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'kitnet') returning id`,
      [cidadeId, `Teste Distrib ${randomUUID()}`],
    );
    return rows[0].id as string;
  }

  async function criarFaturaPaga(imovelId: string, valorLiquido: number, tipo = 'aluguel') {
    const contrato = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', '2026-01-01', 10, $2) returning id`,
      [imovelId, valorLiquido],
    );
    const { rows } = await pool.query(
      `insert into faturas (contrato_id, imovel_id, competencia, tipo, valor_bruto, valor_liquido, vencimento, status)
       values ($1, $2, '2026-07-01', $3, $4, $4, '2026-07-10', 'paga') returning id`,
      [contrato.rows[0].id, imovelId, tipo, valorLiquido],
    );
    return rows[0].id as string;
  }

  async function criarProprietario(imovelId: string, opts: { percentual: number; taxaAdministracaoPct?: number }) {
    const pessoa = await pool.query(`insert into pessoas (nome) values ($1) returning id`, [`Proprietário ${randomUUID()}`]);
    await pool.query(
      `insert into imovel_propriedade (imovel_id, proprietario_pessoa_id, percentual, taxa_administracao_pct)
       values ($1, $2, $3, $4)`,
      [imovelId, pessoa.rows[0].id, opts.percentual, opts.taxaAdministracaoPct ?? 0],
    );
    return pessoa.rows[0].id as string;
  }

  it('proprietário único, 100%, sem taxa de administração: recebe o valor líquido inteiro', async () => {
    const imovelId = await criarImovel();
    const proprietarioId = await criarProprietario(imovelId, { percentual: 1 });
    const faturaId = await criarFaturaPaga(imovelId, 1500);

    const resultado = await distribuirRecebimentosPendentes(pool);
    const distribuicao = resultado.distribuidas.find((d) => d.faturaId === faturaId);
    expect(distribuicao).toBeDefined();
    expect(distribuicao!.distribuicoes).toEqual([{ pessoaId: proprietarioId, valor: 1500 }]);

    const { rows } = await pool.query(`select valor, saldo_apos, tipo, referencia_fatura_id from investidor_ledger where pessoa_id = $1`, [
      proprietarioId,
    ]);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].valor)).toBe(1500);
    expect(Number(rows[0].saldo_apos)).toBe(1500);
    expect(rows[0].tipo).toBe('credito_repasse');
    expect(rows[0].referencia_fatura_id).toBe(faturaId);
  });

  it('deduz a taxa de administração por proprietário (12% para um, 0% para outro)', async () => {
    const imovelId = await criarImovel();
    const proprietarioA = await criarProprietario(imovelId, { percentual: 0.6, taxaAdministracaoPct: 0.12 });
    const proprietarioB = await criarProprietario(imovelId, { percentual: 0.4, taxaAdministracaoPct: 0 });
    const faturaId = await criarFaturaPaga(imovelId, 1000);

    const resultado = await distribuirRecebimentosPendentes(pool);
    const distribuicao = resultado.distribuidas.find((d) => d.faturaId === faturaId)!;

    const valorA = distribuicao.distribuicoes.find((d) => d.pessoaId === proprietarioA)!.valor;
    const valorB = distribuicao.distribuicoes.find((d) => d.pessoaId === proprietarioB)!.valor;

    // bruto A = 600 (60% de 1000), líquido = 600 * (1 - 0.12) = 528
    expect(valorA).toBe(528);
    // bruto B = 400 (40% de 1000), sem taxa, líquido = 400
    expect(valorB).toBe(400);
  });

  it('imóvel sem nenhuma linha de imovel_propriedade: 100% CRMT implícito, nada a distribuir', async () => {
    const imovelId = await criarImovel();
    const faturaId = await criarFaturaPaga(imovelId, 1000);

    const resultado = await distribuirRecebimentosPendentes(pool);
    expect(resultado.distribuidas.find((d) => d.faturaId === faturaId)).toBeUndefined();
    const pulada = resultado.semDistribuicao.find((p) => p.faturaId === faturaId);
    expect(pulada?.motivo).toBe('sem_proprietario_externo');
  });

  it('imóvel com proprietario_pessoa_id explicitamente null (CRMT 100%, registrado): nada a distribuir', async () => {
    const imovelId = await criarImovel();
    await pool.query(
      `insert into imovel_propriedade (imovel_id, proprietario_pessoa_id, percentual) values ($1, null, 1)`,
      [imovelId],
    );
    const faturaId = await criarFaturaPaga(imovelId, 1000);

    const resultado = await distribuirRecebimentosPendentes(pool);
    expect(resultado.semDistribuicao.find((p) => p.faturaId === faturaId)?.motivo).toBe('sem_proprietario_externo');
  });

  it('proprietário com só parte da propriedade (60%): o resto fica implícito com o CRMT, não vira ledger', async () => {
    const imovelId = await criarImovel();
    const proprietarioId = await criarProprietario(imovelId, { percentual: 0.6 });
    const faturaId = await criarFaturaPaga(imovelId, 1000);

    const resultado = await distribuirRecebimentosPendentes(pool);
    const distribuicao = resultado.distribuidas.find((d) => d.faturaId === faturaId)!;
    expect(distribuicao.distribuicoes).toEqual([{ pessoaId: proprietarioId, valor: 600 }]);
  });

  it('saldo corrido: uma segunda fatura paga do mesmo proprietário acumula o saldo_apos', async () => {
    const imovelId = await criarImovel();
    const proprietarioId = await criarProprietario(imovelId, { percentual: 1 });
    await criarFaturaPaga(imovelId, 1000);
    await distribuirRecebimentosPendentes(pool);

    const imovel2 = await criarImovel();
    await pool.query(`insert into imovel_propriedade (imovel_id, proprietario_pessoa_id, percentual) values ($1, $2, 1)`, [
      imovel2,
      proprietarioId,
    ]);
    await criarFaturaPaga(imovel2, 500);
    await distribuirRecebimentosPendentes(pool);

    const { rows } = await pool.query(
      `select saldo_apos from investidor_ledger where pessoa_id = $1 order by criado_em desc limit 1`,
      [proprietarioId],
    );
    expect(Number(rows[0].saldo_apos)).toBe(1500);
  });

  it('fatura de energia paga: não é distribuída (escopo só aluguel)', async () => {
    const imovelId = await criarImovel();
    await criarProprietario(imovelId, { percentual: 1 });
    const faturaId = await criarFaturaPaga(imovelId, 200, 'energia');

    const resultado = await distribuirRecebimentosPendentes(pool);
    expect(resultado.distribuidas.find((d) => d.faturaId === faturaId)).toBeUndefined();
    expect(resultado.semDistribuicao.find((p) => p.faturaId === faturaId)).toBeUndefined();
  });

  it('fatura ainda não paga: não é distribuída', async () => {
    const imovelId = await criarImovel();
    await criarProprietario(imovelId, { percentual: 1 });
    const contrato = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', '2026-01-01', 10, 1000) returning id`,
      [imovelId],
    );
    const fatura = await pool.query(
      `insert into faturas (contrato_id, imovel_id, competencia, tipo, valor_bruto, valor_liquido, vencimento, status)
       values ($1, $2, '2026-07-01', 'aluguel', 1000, 1000, '2026-07-10', 'aberta') returning id`,
      [contrato.rows[0].id, imovelId],
    );

    const resultado = await distribuirRecebimentosPendentes(pool);
    expect(resultado.distribuidas.find((d) => d.faturaId === fatura.rows[0].id)).toBeUndefined();
  });

  it('idempotência: rodar duas vezes não duplica o crédito', async () => {
    const imovelId = await criarImovel();
    const proprietarioId = await criarProprietario(imovelId, { percentual: 1 });
    await criarFaturaPaga(imovelId, 1000);

    await distribuirRecebimentosPendentes(pool);
    const segunda = await distribuirRecebimentosPendentes(pool);
    expect(segunda.distribuidas).toEqual([]);

    const { rows } = await pool.query(`select count(*)::int as total from investidor_ledger where pessoa_id = $1`, [
      proprietarioId,
    ]);
    expect(rows[0].total).toBe(1);
  });
});
