import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import {
  calcularPatrimonioLiquidoDoImovel,
  calcularPatrimonioLiquidoDoPortfolio,
  marcarFinanciamentoQuitado,
  registrarFinanciamentoImovel,
} from './patrimonioImoveis';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('patrimonioImoveis (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });

  afterAll(async () => {
    await pool.end();
  });

  async function criarImovel(valorAvaliacao: number | null): Promise<string> {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const { rows } = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo, valor_avaliacao) values ($1, $2, 'apartamento', $3) returning id`,
      [cidade.rows[0].id, `Imóvel Patrimônio ${randomUUID()}`, valorAvaliacao],
    );
    return rows[0].id;
  }

  it('registra um financiamento (consórcio+hipoteca) e calcula o patrimônio líquido do imóvel', async () => {
    const imovelId = await criarImovel(500000);

    const resultado = await registrarFinanciamentoImovel(pool, {
      imovelId,
      tipo: 'consorcio_hipoteca',
      instituicao: 'Consórcio X',
      valorFinanciado: 300000,
      valorParcela: 2100,
      saldoDevedor: 120000,
      dataInicio: '2022-01-01',
    });

    expect(resultado.sucesso).toBe(true);

    const patrimonio = await calcularPatrimonioLiquidoDoImovel(pool, imovelId);
    expect(patrimonio.patrimonioLiquido).toBe(380000);
    expect(patrimonio.despesaFixaMensal).toBe(2100);
  });

  it('rejeita valor de parcela negativo', async () => {
    const imovelId = await criarImovel(500000);
    const resultado = await registrarFinanciamentoImovel(pool, {
      imovelId,
      tipo: 'financiamento_bancario',
      valorParcela: -100,
    });
    expect(resultado.sucesso).toBe(false);
  });

  it('imóvel sem valor de avaliação: patrimônio líquido null, mas despesa fixa é calculada normalmente', async () => {
    const imovelId = await criarImovel(null);
    await registrarFinanciamentoImovel(pool, { imovelId, tipo: 'financiamento_bancario', valorParcela: 1800 });

    const patrimonio = await calcularPatrimonioLiquidoDoImovel(pool, imovelId);
    expect(patrimonio.patrimonioLiquido).toBeNull();
    expect(patrimonio.despesaFixaMensal).toBe(1800);
  });

  it('financiamento quitado não entra mais no cálculo', async () => {
    const imovelId = await criarImovel(400000);
    const registrado = await registrarFinanciamentoImovel(pool, {
      imovelId,
      tipo: 'financiamento_bancario',
      valorParcela: 1500,
      saldoDevedor: 50000,
    });
    expect(registrado.sucesso).toBe(true);
    if (!registrado.sucesso) throw new Error('esperava sucesso');

    const antes = await calcularPatrimonioLiquidoDoImovel(pool, imovelId);
    expect(antes.patrimonioLiquido).toBe(350000);

    await marcarFinanciamentoQuitado(pool, registrado.id);

    const depois = await calcularPatrimonioLiquidoDoImovel(pool, imovelId);
    expect(depois.patrimonioLiquido).toBe(400000);
    expect(depois.despesaFixaMensal).toBe(0);
  });

  it('consolidado do portfólio soma só imóveis com avaliação e conta quantos não têm', async () => {
    const imovelComAvaliacao = await criarImovel(500000);
    await registrarFinanciamentoImovel(pool, { imovelId: imovelComAvaliacao, tipo: 'financiamento_bancario', valorParcela: 1800, saldoDevedor: 100000 });
    const imovelSemAvaliacao = await criarImovel(null);
    await registrarFinanciamentoImovel(pool, { imovelId: imovelSemAvaliacao, tipo: 'consorcio_hipoteca', valorParcela: 2100 });

    const resultado = await calcularPatrimonioLiquidoDoPortfolio(pool);

    const linhaComAvaliacao = resultado.imoveis.find((r) => r.imovelId === imovelComAvaliacao);
    const linhaSemAvaliacao = resultado.imoveis.find((r) => r.imovelId === imovelSemAvaliacao);
    expect(linhaComAvaliacao?.patrimonioLiquido).toBe(400000);
    expect(linhaSemAvaliacao?.patrimonioLiquido).toBeNull();
    expect(resultado.imoveisSemAvaliacao).toBeGreaterThanOrEqual(1);
  });
});
