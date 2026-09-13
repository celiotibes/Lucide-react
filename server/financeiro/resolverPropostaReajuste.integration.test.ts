// Teste de integração real contra Postgres — não mockado, mesmo padrão dos
// demais. Só roda quando DATABASE_URL está configurada.
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resolverPropostaReajuste } from './resolverPropostaReajuste';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('resolverPropostaReajuste (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let imovelId: string;
  let contratoId: string;

  beforeEach(async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'apartamento') returning id`,
      [cidade.rows[0].id, `Teste Resolver Reajuste ${randomUUID()}`],
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

  it('sem vínculo anterior e sem índice: não gera proposta', async () => {
    const resultado = await resolverPropostaReajuste(pool, {
      contratoId,
      valorAtual: 1000,
      indiceContrato: 'IGPM',
      indicePadraoSistema: 'IPCA',
      reajusteVinculadoId: null,
    });
    expect(resultado.criouNovaProposta).toBe(false);
    expect(resultado.reajusteId).toBeNull();
    expect(resultado.motivoIndisponivel).toBeTruthy();
  });

  it('sem vínculo anterior e com índice: gera a primeira proposta', async () => {
    await pool.query(
      `insert into indices_economicos (indice, competencia, percentual_acumulado_12m) values ('IGPM', '2026-05-01', 0.03)`,
    );
    const resultado = await resolverPropostaReajuste(pool, {
      contratoId,
      valorAtual: 1000,
      indiceContrato: 'IGPM',
      indicePadraoSistema: 'IPCA',
      reajusteVinculadoId: null,
    });
    expect(resultado.criouNovaProposta).toBe(true);
    expect(resultado.reajusteId).toBeDefined();
  });

  it('vínculo já proposto: não gera outra, devolve o mesmo id', async () => {
    const { rows } = await pool.query<{ id: string }>(
      `insert into reajustes_contrato (contrato_id, indice, percentual, valor_anterior, valor_novo, status)
       values ($1, 'IGPM', 0.03, 1000, 1030, 'proposto') returning id`,
      [contratoId],
    );
    const resultado = await resolverPropostaReajuste(pool, {
      contratoId,
      valorAtual: 1000,
      indiceContrato: 'IGPM',
      indicePadraoSistema: 'IPCA',
      reajusteVinculadoId: rows[0].id,
    });
    expect(resultado.criouNovaProposta).toBe(false);
    expect(resultado.reajusteId).toBe(rows[0].id);
  });

  it('vínculo rejeitado sem índice mais novo: não re-gera', async () => {
    await pool.query(
      `insert into indices_economicos (indice, competencia, percentual_acumulado_12m) values ('IGPM', '2026-05-01', 0.03)`,
    );
    const { rows } = await pool.query<{ id: string }>(
      `insert into reajustes_contrato (contrato_id, indice, percentual, valor_anterior, valor_novo, status, data_proposta)
       values ($1, 'IGPM', 0.03, 1000, 1030, 'rejeitado', '2026-06-01') returning id`,
      [contratoId],
    );
    const resultado = await resolverPropostaReajuste(pool, {
      contratoId,
      valorAtual: 1000,
      indiceContrato: 'IGPM',
      indicePadraoSistema: 'IPCA',
      reajusteVinculadoId: rows[0].id,
    });
    expect(resultado.criouNovaProposta).toBe(false);
    expect(resultado.reajusteId).toBe(rows[0].id);
    expect(resultado.motivoIndisponivel).toBeTruthy();
  });

  it('vínculo rejeitado com índice mais novo cadastrado depois: gera uma nova proposta', async () => {
    const { rows: antiga } = await pool.query<{ id: string }>(
      `insert into reajustes_contrato (contrato_id, indice, percentual, valor_anterior, valor_novo, status, data_proposta)
       values ($1, 'IGPM', 0.03, 1000, 1030, 'rejeitado', '2026-06-01') returning id`,
      [contratoId],
    );
    await pool.query(
      `insert into indices_economicos (indice, competencia, percentual_acumulado_12m) values ('IGPM', '2026-07-01', 0.04)`,
    );

    const resultado = await resolverPropostaReajuste(pool, {
      contratoId,
      valorAtual: 1000,
      indiceContrato: 'IGPM',
      indicePadraoSistema: 'IPCA',
      reajusteVinculadoId: antiga[0].id,
    });
    expect(resultado.criouNovaProposta).toBe(true);
    expect(resultado.reajusteId).not.toBe(antiga[0].id);
  });
});
