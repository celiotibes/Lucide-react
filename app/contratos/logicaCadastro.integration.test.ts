import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { inserirContrato } from './logicaCadastro';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('inserirContrato (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });

  afterAll(async () => {
    await pool.end();
  });

  async function criarImovelDeTeste(): Promise<string> {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const { rows } = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'kitnet') returning id`,
      [cidade.rows[0].id, `Imovel Teste ${randomUUID()}`],
    );
    return rows[0].id;
  }

  it('cria pessoa nova, contrato e o vínculo locatario_principal numa única transação', async () => {
    const imovelId = await criarImovelDeTeste();
    const cpf = `cpf-${randomUUID()}`;

    const resultado = await inserirContrato(pool, {
      imovelId,
      tipo: 'locacao_padrao',
      nomeLocatario: 'Inquilino de Teste',
      cpfLocatario: cpf,
      dataInicio: '2026-01-01',
      diaVencimento: 10,
      valorAluguel: 1200,
    });

    expect(resultado.sucesso).toBe(true);
    if (!resultado.sucesso) throw new Error('esperava sucesso');

    const { rows } = await pool.query(
      `select p.nome, cp.papel from contrato_partes cp
       join pessoas p on p.id = cp.pessoa_id
       where cp.contrato_id = $1`,
      [resultado.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ nome: 'Inquilino de Teste', papel: 'locatario_principal' });
  });

  it('reaproveita pessoa existente pelo CPF em vez de duplicar', async () => {
    const cpf = `cpf-reuso-${randomUUID()}`;
    const imovelId1 = await criarImovelDeTeste();
    const imovelId2 = await criarImovelDeTeste();

    await inserirContrato(pool, {
      imovelId: imovelId1,
      tipo: 'locacao_padrao',
      nomeLocatario: 'Pessoa Reaproveitada',
      cpfLocatario: cpf,
      dataInicio: '2026-01-01',
      diaVencimento: 10,
      valorAluguel: 1000,
    });
    await inserirContrato(pool, {
      imovelId: imovelId2,
      tipo: 'locacao_padrao',
      nomeLocatario: 'Pessoa Reaproveitada',
      cpfLocatario: cpf,
      dataInicio: '2026-02-01',
      diaVencimento: 10,
      valorAluguel: 1500,
    });

    const { rows } = await pool.query(`select count(*)::int as total from pessoas where cpf_cnpj = $1`, [cpf]);
    expect(rows[0].total).toBe(1);
  });

  it('rejeita valor de aluguel negativo antes mesmo de chegar ao banco', async () => {
    const imovelId = await criarImovelDeTeste();
    const resultado = await inserirContrato(pool, {
      imovelId,
      tipo: 'locacao_padrao',
      nomeLocatario: 'Teste',
      dataInicio: '2026-01-01',
      diaVencimento: 10,
      valorAluguel: -100,
    });
    expect(resultado.sucesso).toBe(false);
  });

  it('rejeita dia de vencimento fora do intervalo 1-31', async () => {
    const imovelId = await criarImovelDeTeste();
    const resultado = await inserirContrato(pool, {
      imovelId,
      tipo: 'locacao_padrao',
      nomeLocatario: 'Teste',
      dataInicio: '2026-01-01',
      diaVencimento: 45,
      valorAluguel: 1000,
    });
    expect(resultado.sucesso).toBe(false);
  });

  it('grava RG, profissão e estado civil do locatário quando informados', async () => {
    const imovelId = await criarImovelDeTeste();

    const resultado = await inserirContrato(pool, {
      imovelId,
      tipo: 'locacao_padrao',
      nomeLocatario: 'Locatário Qualificado',
      cpfLocatario: `cpf-qualificado-${randomUUID()}`,
      rgLocatario: '12.345.678-9',
      profissaoLocatario: 'Analista de Dados',
      estadoCivilLocatario: 'solteiro',
      dataInicio: '2026-01-01',
      diaVencimento: 10,
      valorAluguel: 1300,
    });

    expect(resultado.sucesso).toBe(true);
    if (!resultado.sucesso) throw new Error('esperava sucesso');

    const { rows } = await pool.query(
      `select p.rg, p.profissao, p.estado_civil from contrato_partes cp
       join pessoas p on p.id = cp.pessoa_id
       where cp.contrato_id = $1 and cp.papel = 'locatario_principal'`,
      [resultado.id],
    );
    expect(rows[0]).toEqual({ rg: '12.345.678-9', profissao: 'Analista de Dados', estado_civil: 'solteiro' });
  });

  it('rejeita estado civil inválido', async () => {
    const imovelId = await criarImovelDeTeste();
    const resultado = await inserirContrato(pool, {
      imovelId,
      tipo: 'locacao_padrao',
      nomeLocatario: 'Teste',
      estadoCivilLocatario: 'namorando',
      dataInicio: '2026-01-01',
      diaVencimento: 10,
      valorAluguel: 1000,
    });
    expect(resultado.sucesso).toBe(false);
  });

  it('cria o responsável financeiro solidário como parte distinta do locatário (evidência: Apto 503/Central Station)', async () => {
    const imovelId = await criarImovelDeTeste();

    const resultado = await inserirContrato(pool, {
      imovelId,
      tipo: 'locacao_padrao',
      nomeLocatario: 'Estudante Locatário',
      dataInicio: '2026-01-01',
      diaVencimento: 10,
      valorAluguel: 1300,
      responsavelSolidario: {
        nome: 'Responsável Financeiro',
        cpf: `cpf-responsavel-${randomUUID()}`,
        rg: '98.765.432-1',
        profissao: 'Diretora',
      },
    });

    expect(resultado.sucesso).toBe(true);
    if (!resultado.sucesso) throw new Error('esperava sucesso');

    const { rows } = await pool.query(
      `select p.nome, cp.papel from contrato_partes cp
       join pessoas p on p.id = cp.pessoa_id
       where cp.contrato_id = $1
       order by cp.papel`,
      [resultado.id],
    );
    expect(rows).toEqual([
      { nome: 'Estudante Locatário', papel: 'locatario_principal' },
      { nome: 'Responsável Financeiro', papel: 'responsavel_solidario' },
    ]);
  });

  it('grava duas garantias (locação + comodato) somadas ao mesmo contrato (evidência: Life Space e Apto 503)', async () => {
    const imovelId = await criarImovelDeTeste();

    const resultado = await inserirContrato(pool, {
      imovelId,
      tipo: 'locacao_padrao',
      nomeLocatario: 'Locatário Duas Garantias',
      dataInicio: '2026-01-01',
      diaVencimento: 10,
      valorAluguel: 1590,
      garantias: [
        { tipo: 'caucao', valor: 1590, finalidade: 'locacao', formaPagamento: 'pix' },
        { tipo: 'caucao', valor: 240, finalidade: 'comodato', formaPagamento: 'boleto', parcelas: 1 },
      ],
    });

    expect(resultado.sucesso).toBe(true);
    if (!resultado.sucesso) throw new Error('esperava sucesso');

    const { rows } = await pool.query(
      `select tipo, valor, finalidade, forma_pagamento, parcelas from garantias where contrato_id = $1 order by finalidade`,
      [resultado.id],
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.finalidade === 'locacao')).toMatchObject({ tipo: 'caucao', forma_pagamento: 'pix' });
    expect(Number(rows.find((r) => r.finalidade === 'locacao')!.valor)).toBe(1590);
    expect(rows.find((r) => r.finalidade === 'comodato')).toMatchObject({ tipo: 'caucao', forma_pagamento: 'boleto', parcelas: 1 });
    expect(Number(rows.find((r) => r.finalidade === 'comodato')!.valor)).toBe(240);
  });

  it('rejeita garantia com valor zero ou negativo', async () => {
    const imovelId = await criarImovelDeTeste();
    const resultado = await inserirContrato(pool, {
      imovelId,
      tipo: 'locacao_padrao',
      nomeLocatario: 'Teste',
      dataInicio: '2026-01-01',
      diaVencimento: 10,
      valorAluguel: 1000,
      garantias: [{ tipo: 'caucao', valor: 0 }],
    });
    expect(resultado.sucesso).toBe(false);
  });

  it('faz rollback completo (nenhuma pessoa órfã) quando o imóvel não existe', async () => {
    const antesPessoas = await pool.query(`select count(*)::int as total from pessoas`);

    const resultado = await inserirContrato(pool, {
      imovelId: '00000000-0000-0000-0000-000000000000',
      tipo: 'locacao_padrao',
      nomeLocatario: 'Pessoa Que Não Deveria Sobrar',
      dataInicio: '2026-01-01',
      diaVencimento: 10,
      valorAluguel: 1000,
    });

    expect(resultado.sucesso).toBe(false);
    const depoisPessoas = await pool.query(`select count(*)::int as total from pessoas`);
    expect(depoisPessoas.rows[0].total).toBe(antesPessoas.rows[0].total);
  });
});
