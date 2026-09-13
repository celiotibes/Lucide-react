import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { faturarEnergiaConfirmada } from './faturarEnergia';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('faturarEnergiaConfirmada (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let cidadeId: string;
  let imovelId: string;
  let contratoId: string;

  beforeEach(async () => {
    const cidade = await pool.query(`select id from cidades where nome = 'Florianópolis' limit 1`);
    cidadeId = cidade.rows[0].id;

    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo, franquia_energia_kwh, taxa_administracao_energia_pct)
       values ($1, $2, 'kitnet', 30, 0.25) returning id`,
      [cidadeId, `Teste Energia ${randomUUID()}`],
    );
    imovelId = imovel.rows[0].id;

    const contrato = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', '2026-01-01', 10, 1000) returning id`,
      [imovelId],
    );
    contratoId = contrato.rows[0].id;

    // tarifa vigente para CELESC (distribuidora de Florianópolis, já seedada em cidades)
    await pool.query(
      `insert into tarifas_energia (distribuidora, vigencia_inicio, te_valor, tusd_valor, bandeira)
       values ('CELESC', '2026-01-01', 0.40, 0.35, 'verde')`,
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  async function confirmarLeitura(dataLeitura: string, kwh: number) {
    const { rows } = await pool.query(
      `insert into leituras_energia (imovel_id, contrato_id, data_leitura, leitura_kwh, origem, status)
       values ($1, $2, $3, $4, 'manual', 'confirmada') returning id`,
      [imovelId, contratoId, dataLeitura, kwh],
    );
    return rows[0].id as string;
  }

  it('gera fatura de energia a partir de duas leituras confirmadas, com itens discriminados', async () => {
    await confirmarLeitura('2026-06-30', 1000);
    await confirmarLeitura('2026-07-31', 1100); // 100 kWh consumidos, acima da franquia de 30

    const resultado = await faturarEnergiaConfirmada(pool, new Date(Date.UTC(2026, 6, 1)));

    expect(resultado.puladas).toEqual([]);
    expect(resultado.faturadas).toHaveLength(1);
    expect(resultado.faturadas[0].valorTotal).toBeCloseTo(100 * (0.4 + 0.35) * 1.25, 2); // consumo * tarifa * (1+25%)

    const { rows: itens } = await pool.query(`select descricao, valor from fatura_itens where fatura_id = $1`, [
      resultado.faturadas[0].faturaId,
    ]);
    expect(itens).toHaveLength(2);
    expect(itens.some((i) => i.descricao.includes('consumo'))).toBe(true);
    expect(itens.some((i) => i.descricao.includes('infraestrutura compartilhada'))).toBe(true);

    const { rows: fatura } = await pool.query(`select tipo, competencia from faturas where id = $1`, [
      resultado.faturadas[0].faturaId,
    ]);
    expect(fatura[0].tipo).toBe('energia');
  });

  it('consumo abaixo da franquia: fatura pela franquia mínima (30 kWh), não pelo consumo real', async () => {
    await confirmarLeitura('2026-06-30', 2000);
    await confirmarLeitura('2026-07-31', 2015); // só 15 kWh, abaixo da franquia de 30

    const resultado = await faturarEnergiaConfirmada(pool, new Date(Date.UTC(2026, 6, 1)));
    expect(resultado.faturadas[0].valorTotal).toBeCloseTo(30 * (0.4 + 0.35) * 1.25, 2);
  });

  it('sem leitura anterior confirmada: pula (não gera fatura, não lança erro)', async () => {
    await confirmarLeitura('2026-07-31', 1100); // primeira leitura do imóvel, sem anterior

    const resultado = await faturarEnergiaConfirmada(pool, new Date(Date.UTC(2026, 6, 1)));
    expect(resultado.faturadas).toEqual([]);
    expect(resultado.puladas).toHaveLength(1);
    expect(resultado.puladas[0].motivo).toBe('sem_leitura_anterior');
  });

  it('sem tarifa cadastrada para a distribuidora do imóvel: pula', async () => {
    const cidadeCuritiba = await pool.query(`select id from cidades where nome = 'Curitiba' limit 1`);
    const imovelCuritiba = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo, franquia_energia_kwh)
       values ($1, 'Apto Teste Curitiba', 'apartamento', 30) returning id`,
      [cidadeCuritiba.rows[0].id],
    );
    const contratoCuritiba = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', '2026-01-01', 10, 2000) returning id`,
      [imovelCuritiba.rows[0].id],
    );
    // nenhuma tarifa cadastrada para COPEL (distribuidora de Curitiba) nesta suíte
    await pool.query(
      `insert into leituras_energia (imovel_id, contrato_id, data_leitura, leitura_kwh, origem, status)
       values ($1, $2, '2026-06-30', 500, 'manual', 'confirmada')`,
      [imovelCuritiba.rows[0].id, contratoCuritiba.rows[0].id],
    );
    await pool.query(
      `insert into leituras_energia (imovel_id, contrato_id, data_leitura, leitura_kwh, origem, status)
       values ($1, $2, '2026-07-31', 600, 'manual', 'confirmada')`,
      [imovelCuritiba.rows[0].id, contratoCuritiba.rows[0].id],
    );

    const resultado = await faturarEnergiaConfirmada(pool, new Date(Date.UTC(2026, 6, 1)));
    const puladaCuritiba = resultado.puladas.find((p) => p.motivo === 'sem_tarifa_vigente');
    expect(puladaCuritiba).toBeDefined();
  });

  it('idempotência: rodar duas vezes para o mesmo mês não duplica a fatura', async () => {
    await confirmarLeitura('2026-06-30', 1000);
    await confirmarLeitura('2026-07-31', 1050);

    const primeira = await faturarEnergiaConfirmada(pool, new Date(Date.UTC(2026, 6, 1)));
    expect(primeira.faturadas).toHaveLength(1);

    const segunda = await faturarEnergiaConfirmada(pool, new Date(Date.UTC(2026, 6, 1)));
    expect(segunda.faturadas).toHaveLength(0); // já existe fatura de energia para esse imóvel+competência

    const { rows } = await pool.query(
      `select count(*)::int as total from faturas where imovel_id = $1 and tipo = 'energia'`,
      [imovelId],
    );
    expect(rows[0].total).toBe(1);
  });

  it('leitura sem contrato vinculado: pula sem lançar erro', async () => {
    await pool.query(
      `insert into leituras_energia (imovel_id, contrato_id, data_leitura, leitura_kwh, origem, status)
       values ($1, null, '2026-06-30', 1000, 'manual', 'confirmada')`,
      [imovelId],
    );
    await pool.query(
      `insert into leituras_energia (imovel_id, contrato_id, data_leitura, leitura_kwh, origem, status)
       values ($1, null, '2026-07-31', 1080, 'manual', 'confirmada')`,
      [imovelId],
    );

    const resultado = await faturarEnergiaConfirmada(pool, new Date(Date.UTC(2026, 6, 1)));
    expect(resultado.puladas.some((p) => p.motivo === 'sem_contrato_vinculado')).toBe(true);
  });
});
