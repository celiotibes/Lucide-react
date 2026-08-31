// Teste de integração real contra Postgres — não mockado, mesmo padrão de
// concluirVistoria.integration.test.ts. Só roda quando DATABASE_URL está
// configurada.
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { aprovarReajuste, rejeitarReajuste } from './decidirReajuste';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('decidirReajuste (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let imovelId: string;
  let contratoId: string;

  beforeEach(async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'apartamento') returning id`,
      [cidade.rows[0].id, `Teste Decidir Reajuste ${randomUUID()}`],
    );
    imovelId = imovel.rows[0].id;

    const contrato = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', current_date, 10, 1000) returning id`,
      [imovelId],
    );
    contratoId = contrato.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  async function criarProposta(valorNovo = 1050) {
    const { rows } = await pool.query<{ id: string }>(
      `insert into reajustes_contrato (contrato_id, indice, percentual, valor_anterior, valor_novo, status)
       values ($1, 'IPCA', 0.05, 1000, $2, 'proposto') returning id`,
      [contratoId, valorNovo],
    );
    return rows[0].id;
  }

  it('aprovar: copia valor_novo para o contrato e atualiza data_ultimo_reajuste/data_proximo_reajuste', async () => {
    const reajusteId = await criarProposta(1050);
    const resultado = await aprovarReajuste(pool, reajusteId, contratoId);
    expect(resultado.sucesso).toBe(true);

    const { rows: contrato } = await pool.query(
      `select valor_aluguel, data_ultimo_reajuste, data_proximo_reajuste from contratos where id = $1`,
      [contratoId],
    );
    expect(Number(contrato[0].valor_aluguel)).toBe(1050);
    expect(contrato[0].data_ultimo_reajuste).not.toBeNull();
    expect(contrato[0].data_proximo_reajuste).not.toBeNull();

    const { rows: reajuste } = await pool.query(`select status from reajustes_contrato where id = $1`, [reajusteId]);
    expect(reajuste[0].status).toBe('aprovado');
  });

  it('rejeitar: não altera o contrato', async () => {
    const reajusteId = await criarProposta(1050);
    const resultado = await rejeitarReajuste(pool, reajusteId, contratoId);
    expect(resultado.sucesso).toBe(true);

    const { rows: contrato } = await pool.query(`select valor_aluguel from contratos where id = $1`, [contratoId]);
    expect(Number(contrato[0].valor_aluguel)).toBe(1000);
  });

  it('aprovar um reajuste já revisado devolve falha', async () => {
    const reajusteId = await criarProposta();
    await rejeitarReajuste(pool, reajusteId, contratoId);

    const resultado = await aprovarReajuste(pool, reajusteId, contratoId);
    expect(resultado.sucesso).toBe(false);
  });
});
