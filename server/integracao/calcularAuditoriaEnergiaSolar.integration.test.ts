import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { calcularAuditoriaEnergiaSolarDoResidencial } from './calcularAuditoriaEnergiaSolar';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('calcularAuditoriaEnergiaSolarDoResidencial (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });

  afterAll(async () => {
    await pool.end();
  });

  async function criarResidencialComImovel() {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const residencial = await pool.query(`insert into residenciais (nome, cidade_id) values ($1, $2) returning id`, [
      `Residencial Auditoria ${randomUUID()}`,
      cidade.rows[0].id,
    ]);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, residencial_id, identificacao, tipo) values ($1, $2, $3, 'kitnet') returning id`,
      [cidade.rows[0].id, residencial.rows[0].id, `Kitnet Auditoria ${randomUUID()}`],
    );
    return { residencialId: residencial.rows[0].id, imovelId: imovel.rows[0].id };
  }

  it('calcula quando geração e fatura Celesc estão confirmadas e há leitura de inquilino no período', async () => {
    const { residencialId, imovelId } = await criarResidencialComImovel();

    await pool.query(
      `insert into leituras_energia (imovel_id, data_leitura, leitura_kwh, origem, status) values
       ($1, '2026-05-01', 1000, 'manual', 'confirmada'),
       ($1, '2026-06-01', 1300, 'manual', 'confirmada')`,
      [imovelId],
    );
    await pool.query(
      `insert into faturas (imovel_id, competencia, tipo, valor_bruto, valor_liquido, vencimento) values
       ($1, '2026-06-01', 'energia', 300, 300, '2026-06-10')`,
      [imovelId],
    );
    await pool.query(
      `insert into geracao_solar (residencial_id, competencia, energia_gerada_kwh, status) values
       ($1, '2026-06-01', 1000, 'confirmada')`,
      [residencialId],
    );
    await pool.query(
      `insert into faturas_celesc_gd (residencial_id, competencia, valor_total, energia_injetada_kwh, energia_consumida_rede_kwh, status) values
       ($1, '2026-06-01', 200, 400, 100, 'confirmada')`,
      [residencialId],
    );

    const resultado = await calcularAuditoriaEnergiaSolarDoResidencial(pool, residencialId, new Date(Date.UTC(2026, 5, 1)));

    expect(resultado.calculada).toBe(true);
    if (!resultado.calculada) throw new Error('esperava cálculo');

    // consumo próprio = 1000 - 400 = 600; total consumido = 600 + 100 = 700
    // cobrado dos inquilinos = 1300 - 1000 = 300 kWh; área comum = 700 - 300 = 400
    expect(resultado.areaComumKwh).toBe(400);
    expect(resultado.inconsistente).toBe(false);

    const { rows } = await pool.query(`select * from auditorias_energia_solar where id = $1`, [resultado.auditoriaId]);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].area_comum_kwh)).toBe(400);
  });

  it('não calcula quando a geração solar ainda não foi confirmada', async () => {
    const { residencialId } = await criarResidencialComImovel();

    await pool.query(
      `insert into geracao_solar (residencial_id, competencia, energia_gerada_kwh, status) values
       ($1, '2026-06-01', 1000, 'pendente_confirmacao')`,
      [residencialId],
    );

    const resultado = await calcularAuditoriaEnergiaSolarDoResidencial(pool, residencialId, new Date(Date.UTC(2026, 5, 1)));

    expect(resultado.calculada).toBe(false);
    if (resultado.calculada) throw new Error('esperava não calculado');
    expect(resultado.motivo).toBe('sem_geracao_confirmada');
  });

  it('não calcula quando a fatura Celesc GD ainda não foi confirmada', async () => {
    const { residencialId } = await criarResidencialComImovel();

    await pool.query(
      `insert into geracao_solar (residencial_id, competencia, energia_gerada_kwh, status) values
       ($1, '2026-06-01', 1000, 'confirmada')`,
      [residencialId],
    );
    await pool.query(
      `insert into faturas_celesc_gd (residencial_id, competencia, valor_total, energia_injetada_kwh, energia_consumida_rede_kwh, status) values
       ($1, '2026-06-01', 200, 400, 100, 'pendente_confirmacao')`,
      [residencialId],
    );

    const resultado = await calcularAuditoriaEnergiaSolarDoResidencial(pool, residencialId, new Date(Date.UTC(2026, 5, 1)));

    expect(resultado.calculada).toBe(false);
    if (resultado.calculada) throw new Error('esperava não calculado');
    expect(resultado.motivo).toBe('sem_fatura_celesc_confirmada');
  });
});
