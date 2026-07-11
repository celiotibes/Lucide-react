import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { confirmarFaturaCelescGD, registrarFaturaCelescGD } from './registrarFaturaCelescGD';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('registrarFaturaCelescGD (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });

  afterAll(async () => {
    await pool.end();
  });

  it('registra uma fatura pendente de confirmação e confirma depois', async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const residencial = await pool.query(`insert into residenciais (nome, cidade_id) values ($1, $2) returning id`, [
      `Residencial Solar ${randomUUID()}`,
      cidade.rows[0].id,
    ]);
    const admin = await pool.query(`insert into pessoas (nome) values ('Admin Teste') returning id`);

    const resultado = await registrarFaturaCelescGD(pool, {
      residencialId: residencial.rows[0].id,
      competencia: '2026-06-01',
      valorTotal: 850.32,
      energiaInjetadaKwh: 620,
      energiaConsumidaRedeKwh: 180,
    });

    expect(resultado.sucesso).toBe(true);
    if (!resultado.sucesso) throw new Error('esperava sucesso');

    const { rows: antes } = await pool.query(`select status from faturas_celesc_gd where id = $1`, [resultado.id]);
    expect(antes[0].status).toBe('pendente_confirmacao');

    await confirmarFaturaCelescGD(pool, resultado.id, admin.rows[0].id);

    const { rows: depois } = await pool.query(`select status, confirmado_por from faturas_celesc_gd where id = $1`, [
      resultado.id,
    ]);
    expect(depois[0].status).toBe('confirmada');
    expect(depois[0].confirmado_por).toBe(admin.rows[0].id);
  });

  it('rejeita valor total negativo', async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const residencial = await pool.query(`insert into residenciais (nome, cidade_id) values ($1, $2) returning id`, [
      `Residencial Solar Neg ${randomUUID()}`,
      cidade.rows[0].id,
    ]);

    const resultado = await registrarFaturaCelescGD(pool, {
      residencialId: residencial.rows[0].id,
      competencia: '2026-06-01',
      valorTotal: -10,
      energiaInjetadaKwh: 100,
      energiaConsumidaRedeKwh: 50,
    });

    expect(resultado.sucesso).toBe(false);
  });

  it('rejeita residencial vazio', async () => {
    const resultado = await registrarFaturaCelescGD(pool, {
      residencialId: '',
      competencia: '2026-06-01',
      valorTotal: 100,
      energiaInjetadaKwh: 10,
      energiaConsumidaRedeKwh: 5,
    });

    expect(resultado.sucesso).toBe(false);
  });
});
