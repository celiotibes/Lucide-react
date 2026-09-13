// Teste de integração real contra Postgres — não mockado, mesmo padrão de
// concluirVistoria.integration.test.ts. Só roda quando DATABASE_URL está
// configurada.
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { DadosPerfilConvivencia } from './registrarInteresseColiving';
import { registrarInteresseColiving } from './registrarInteresseColiving';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('registrarInteresseColiving (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let imovelId: string;
  let comodoAId: string;
  let comodoBId: string;

  function perfilPadrao(sobrescritas: Partial<DadosPerfilConvivencia> = {}): DadosPerfilConvivencia {
    return {
      v1Limpeza: 2,
      v2Ruido: 2,
      v3Rotina: 2,
      v4Fumo: 2,
      v5Pets: 2,
      v6Dieta: 1,
      v7Conflito: 2,
      temPet: false,
      quadroAlergico: 'nenhuma',
      ...sobrescritas,
    };
  }

  beforeEach(async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo, permite_coliving) values ($1, $2, 'apartamento', true) returning id`,
      [cidade.rows[0].id, `Teste Coliving ${randomUUID()}`],
    );
    imovelId = imovel.rows[0].id;

    const comodoA = await pool.query(`insert into comodos (imovel_id, identificacao) values ($1, 'Quarto 1') returning id`, [imovelId]);
    comodoAId = comodoA.rows[0].id;
    const comodoB = await pool.query(`insert into comodos (imovel_id, identificacao) values ($1, 'Quarto 2') returning id`, [imovelId]);
    comodoBId = comodoB.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('primeiro interessado num imóvel totalmente vago: só grava o perfil, sem comparação', async () => {
    const resultado = await registrarInteresseColiving(pool, {
      nome: 'Candidato A',
      imovelInteresseId: imovelId,
      comodoInteresseId: comodoAId,
      perfil: perfilPadrao(),
    });

    expect(resultado.sucesso).toBe(true);
    expect(resultado.comparacoesGeradas).toHaveLength(0);
  });

  it('segundo interessado no quarto irmão: gera a comparação automaticamente', async () => {
    await registrarInteresseColiving(pool, {
      nome: 'Candidato A',
      imovelInteresseId: imovelId,
      comodoInteresseId: comodoAId,
      perfil: perfilPadrao({ v1Limpeza: 3 }),
    });

    const resultado = await registrarInteresseColiving(pool, {
      nome: 'Candidato B',
      imovelInteresseId: imovelId,
      comodoInteresseId: comodoBId,
      perfil: perfilPadrao({ v1Limpeza: 1 }),
    });

    expect(resultado.sucesso).toBe(true);
    expect(resultado.comparacoesGeradas).toHaveLength(1);

    const { rows } = await pool.query(`select * from compatibilidades_coliving where id = $1`, [resultado.comparacoesGeradas![0]]);
    expect(rows).toHaveLength(1);
    expect(rows[0].imovel_id).toBe(imovelId);
    expect(Number(rows[0].score_geral)).toBeLessThan(100);
    expect(rows[0].status).toBe('calculado');
  });

  it('candidato interessado no mesmo quarto que já tem candidato pendente não é comparado (não são futuros colegas)', async () => {
    await registrarInteresseColiving(pool, {
      nome: 'Candidato A',
      imovelInteresseId: imovelId,
      comodoInteresseId: comodoAId,
      perfil: perfilPadrao(),
    });

    const resultado = await registrarInteresseColiving(pool, {
      nome: 'Candidato A2 (mesmo quarto)',
      imovelInteresseId: imovelId,
      comodoInteresseId: comodoAId,
      perfil: perfilPadrao(),
    });

    expect(resultado.comparacoesGeradas).toHaveLength(0);
  });

  it('compara contra o morador atual do quarto irmão (contrato ativo), não só outros candidatos', async () => {
    const pessoa = await pool.query(`insert into pessoas (nome) values ('Morador Atual') returning id`);
    const pessoaId = pessoa.rows[0].id;
    await pool.query(
      `insert into perfis_convivencia (pessoa_id, v1_limpeza, v2_ruido, v3_rotina, v4_fumo, v5_pets, v6_dieta, v7_conflito, tem_pet, quadro_alergico)
       values ($1, 2, 2, 2, 2, 2, 1, 2, false, 'nenhuma')`,
      [pessoaId],
    );
    const contrato = await pool.query(
      `insert into contratos (imovel_id, comodo_id, tipo, data_inicio, dia_vencimento, valor_aluguel, status)
       values ($1, $2, 'locacao_padrao', current_date, 10, 1200, 'ativo') returning id`,
      [imovelId, comodoBId],
    );
    await pool.query(`insert into contrato_partes (contrato_id, pessoa_id, papel) values ($1, $2, 'locatario_principal')`, [
      contrato.rows[0].id,
      pessoaId,
    ]);

    const resultado = await registrarInteresseColiving(pool, {
      nome: 'Candidato A',
      imovelInteresseId: imovelId,
      comodoInteresseId: comodoAId,
      perfil: perfilPadrao(),
    });

    expect(resultado.comparacoesGeradas).toHaveLength(1);
  });

  it('não gera comparação contra lead já reprovado', async () => {
    const primeiro = await registrarInteresseColiving(pool, {
      nome: 'Candidato Reprovado',
      imovelInteresseId: imovelId,
      comodoInteresseId: comodoBId,
      perfil: perfilPadrao(),
    });
    await pool.query(`update leads set status = 'reprovado' where id = $1`, [primeiro.leadId]);

    const resultado = await registrarInteresseColiving(pool, {
      nome: 'Candidato Novo',
      imovelInteresseId: imovelId,
      comodoInteresseId: comodoAId,
      perfil: perfilPadrao(),
    });

    expect(resultado.comparacoesGeradas).toHaveLength(0);
  });

  it('erro quando o imóvel não permite coliving', async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const outroImovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo, permite_coliving) values ($1, $2, 'apartamento', false) returning id`,
      [cidade.rows[0].id, `Teste Não Coliving ${randomUUID()}`],
    );

    const resultado = await registrarInteresseColiving(pool, {
      nome: 'Candidato A',
      imovelInteresseId: outroImovel.rows[0].id,
      comodoInteresseId: comodoAId,
      perfil: perfilPadrao(),
    });

    expect(resultado.sucesso).toBe(false);
  });

  it('erro quando o quarto não pertence ao imóvel informado', async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const outroImovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo, permite_coliving) values ($1, $2, 'apartamento', true) returning id`,
      [cidade.rows[0].id, `Teste Outro Imóvel ${randomUUID()}`],
    );

    const resultado = await registrarInteresseColiving(pool, {
      nome: 'Candidato A',
      imovelInteresseId: outroImovel.rows[0].id,
      comodoInteresseId: comodoAId,
      perfil: perfilPadrao(),
    });

    expect(resultado.sucesso).toBe(false);
  });
});
