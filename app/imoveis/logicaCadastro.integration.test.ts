import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { inserirImovel } from './logicaCadastro';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('inserirImovel (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });

  afterAll(async () => {
    await pool.end();
  });

  it('cria um imóvel válido e retorna o id', async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const resultado = await inserirImovel(pool, {
      identificacao: 'Kitnet Teste Integração',
      tipo: 'kitnet',
      cidadeId: cidade.rows[0].id,
    });

    expect(resultado.sucesso).toBe(true);
    if (!resultado.sucesso) throw new Error('esperava sucesso');

    const { rows } = await pool.query(`select identificacao, status from imoveis where id = $1`, [resultado.id]);
    expect(rows[0].identificacao).toBe('Kitnet Teste Integração');
    expect(rows[0].status).toBe('disponivel'); // default do schema
  });

  it('grava endereço, permite_coliving e valor_avaliacao quando informados', async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const resultado = await inserirImovel(pool, {
      identificacao: 'Kitnet Co-living Teste',
      tipo: 'kitnet',
      cidadeId: cidade.rows[0].id,
      endereco: 'Rua Teste, 100',
      permiteColiving: true,
      valorAvaliacao: 350000,
    });

    expect(resultado.sucesso).toBe(true);
    if (!resultado.sucesso) throw new Error('esperava sucesso');

    const { rows } = await pool.query(
      `select endereco, permite_coliving, valor_avaliacao from imoveis where id = $1`,
      [resultado.id],
    );
    expect(rows[0].endereco).toBe('Rua Teste, 100');
    expect(rows[0].permite_coliving).toBe(true);
    expect(Number(rows[0].valor_avaliacao)).toBe(350000);
  });

  it('rejeita valor de avaliação negativo', async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const resultado = await inserirImovel(pool, {
      identificacao: 'Teste Avaliação Negativa',
      tipo: 'kitnet',
      cidadeId: cidade.rows[0].id,
      valorAvaliacao: -100,
    });
    expect(resultado.sucesso).toBe(false);
  });

  it('rejeita identificação vazia sem tocar o banco', async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const antes = await pool.query(`select count(*)::int as total from imoveis`);

    const resultado = await inserirImovel(pool, { identificacao: '   ', tipo: 'kitnet', cidadeId: cidade.rows[0].id });

    expect(resultado.sucesso).toBe(false);
    const depois = await pool.query(`select count(*)::int as total from imoveis`);
    expect(depois.rows[0].total).toBe(antes.rows[0].total);
  });

  it('rejeita tipo inválido', async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const resultado = await inserirImovel(pool, {
      identificacao: 'Teste',
      tipo: 'castelo',
      cidadeId: cidade.rows[0].id,
    });
    expect(resultado.sucesso).toBe(false);
  });

  it('rejeita cidade vazia', async () => {
    const resultado = await inserirImovel(pool, { identificacao: 'Teste', tipo: 'kitnet', cidadeId: '' });
    expect(resultado.sucesso).toBe(false);
  });

  it('propaga erro do banco sem lançar exceção (ex.: cidade_id inexistente)', async () => {
    const resultado = await inserirImovel(pool, {
      identificacao: 'Teste FK',
      tipo: 'kitnet',
      cidadeId: '00000000-0000-0000-0000-000000000000',
    });
    expect(resultado.sucesso).toBe(false);
    if (resultado.sucesso) throw new Error('esperava falha');
    expect(resultado.erro).toMatch(/Não foi possível salvar/);
  });
});
