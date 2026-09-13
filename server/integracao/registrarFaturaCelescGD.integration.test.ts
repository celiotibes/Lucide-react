import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { parsearFaturaCelescGD } from '../relatorios/celescGD';
import { confirmarFaturaCelescGD, registrarFaturaCelescGD } from './registrarFaturaCelescGD';

const DATABASE_URL = process.env.DATABASE_URL;

// Mesmo excerto real usado em server/relatorios/celescGD.test.ts (Unidade
// Consumidora 313.198.011-71, Prof João Carlos Pottker 25, Florianópolis —
// a "geradora" do Residencial João Pottker, docs/10), competência 07/2026.
const TEXTO_FATURA_REAL = `
RESIDENCIAL - RESIDENCIAL - B1 Residencial - TRIFÁSICO
313.198.011-71
Cliente: 40848967
07/2026 17/08/2026 R$ 328,87
NOME: CELIO RIBAS MATZENBACHER TIBES
CPF/CNPJ: ***.402.781-**
PROF JOAO CARLOS POTTKER 25 -
SACO DOS LIMOES-FNS
ENDERECO:
CEP: 88000-000 CIDADE: FLORIANOPOLIS SC Grupo/Subgrupo Tensão:B/B1
03/06/2026 06/07/2026 33 05/08/2026
NOTA FISCAL Nº 097363620 SERIE:001 DATA EMISSAO: 06/07/2026
5496999 Energia Único 48.505 50.377 1,00000 0,00 1.872
5496999 Energia injetada Único 95.470 96.648 1,00000 0,00 1.178
TOTAL 328,87
`;

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

  it('registra a partir do texto real da fatura Celesc, extraído via parsearFaturaCelescGD', async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const residencial = await pool.query(`insert into residenciais (nome, cidade_id) values ($1, $2) returning id`, [
      `Residencial Solar Real ${randomUUID()}`,
      cidade.rows[0].id,
    ]);

    const extraida = parsearFaturaCelescGD(TEXTO_FATURA_REAL);
    const resultado = await registrarFaturaCelescGD(pool, {
      residencialId: residencial.rows[0].id,
      competencia: extraida.competencia,
      valorTotal: extraida.valorTotal,
      energiaInjetadaKwh: extraida.energiaInjetadaKwh,
      energiaConsumidaRedeKwh: extraida.energiaConsumidaRedeKwh,
    });

    expect(resultado.sucesso).toBe(true);
    if (!resultado.sucesso) throw new Error('esperava sucesso');

    const { rows } = await pool.query(
      `select competencia, valor_total, energia_injetada_kwh, energia_consumida_rede_kwh from faturas_celesc_gd where id = $1`,
      [resultado.id],
    );
    expect(rows[0].competencia.toISOString().slice(0, 10)).toBe('2026-07-01');
    expect(Number(rows[0].valor_total)).toBe(328.87);
    expect(Number(rows[0].energia_injetada_kwh)).toBe(1178);
    expect(Number(rows[0].energia_consumida_rede_kwh)).toBe(1872);
  });
});
