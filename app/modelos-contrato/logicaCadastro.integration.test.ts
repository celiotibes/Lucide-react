import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { inserirModeloContrato } from './logicaCadastro';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('inserirModeloContrato (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });

  afterAll(async () => {
    await pool.end();
  });

  it('cria o primeiro modelo de uma cidade como v1 ativo', async () => {
    const cidade = await pool.query(`insert into cidades (nome, uf) values ($1, 'XX') returning id`, [
      `Cidade Teste ${randomUUID()}`,
    ]);
    const cidadeId = cidade.rows[0].id;

    const resultado = await inserirModeloContrato(pool, {
      cidadeId,
      nome: 'Modelo padrão',
      corpoHtml: '<p>{{valor_aluguel}}</p>',
    });

    expect(resultado.sucesso).toBe(true);
    if (!resultado.sucesso) throw new Error('esperava sucesso');

    const { rows } = await pool.query(`select versao, ativo from modelos_contrato where id = $1`, [resultado.id]);
    expect(rows[0].versao).toBe(1);
    expect(rows[0].ativo).toBe(true);
  });

  it('cadastrar um segundo modelo para a mesma cidade desativa o anterior e incrementa a versão', async () => {
    const cidade = await pool.query(`insert into cidades (nome, uf) values ($1, 'XX') returning id`, [
      `Cidade Teste ${randomUUID()}`,
    ]);
    const cidadeId = cidade.rows[0].id;

    const primeiro = await inserirModeloContrato(pool, { cidadeId, nome: 'v1', corpoHtml: '<p>v1</p>' });
    if (!primeiro.sucesso) throw new Error('esperava sucesso');

    const segundo = await inserirModeloContrato(pool, { cidadeId, nome: 'v2', corpoHtml: '<p>v2</p>' });
    expect(segundo.sucesso).toBe(true);
    if (!segundo.sucesso) throw new Error('esperava sucesso');

    const { rows } = await pool.query(
      `select id, versao, ativo from modelos_contrato where cidade_id = $1 order by versao`,
      [cidadeId],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].versao).toBe(1);
    expect(rows[0].ativo).toBe(false);
    expect(rows[1].versao).toBe(2);
    expect(rows[1].ativo).toBe(true);
  });

  it('rejeita corpo HTML vazio sem tocar o banco', async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const antes = await pool.query(`select count(*)::int as total from modelos_contrato`);

    const resultado = await inserirModeloContrato(pool, { cidadeId: cidade.rows[0].id, nome: 'Teste', corpoHtml: '   ' });

    expect(resultado.sucesso).toBe(false);
    const depois = await pool.query(`select count(*)::int as total from modelos_contrato`);
    expect(depois.rows[0].total).toBe(antes.rows[0].total);
  });

  it('rejeita cidade vazia', async () => {
    const resultado = await inserirModeloContrato(pool, { cidadeId: '', nome: 'Teste', corpoHtml: '<p>x</p>' });
    expect(resultado.sucesso).toBe(false);
  });
});
