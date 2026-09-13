// Teste de integração real contra Postgres — não mockado, mesmo padrão de
// processarReequilibrioTrienal.integration.test.ts. Só roda quando
// DATABASE_URL está configurada.
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { processarRenovacaoContratual } from './processarRenovacaoContratual';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('processarRenovacaoContratual (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let imovelId: string;

  beforeEach(async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'apartamento') returning id`,
      [cidade.rows[0].id, `Teste Renovação ${randomUUID()}`],
    );
    imovelId = imovel.rows[0].id;

    await pool.query(`delete from indices_economicos where indice = 'IPCA' and competencia = '2026-06-01'`);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function criarContrato(opts: { dataFim: string; indiceReajuste?: string | null }) {
    const { rows } = await pool.query<{ id: string }>(
      `insert into contratos (imovel_id, tipo, data_inicio, data_fim, dia_vencimento, valor_aluguel, indice_reajuste, status)
       values ($1, 'locacao_padrao', '2024-01-01', $2, 10, 1500, $3, 'ativo') returning id`,
      [imovelId, opts.dataFim, opts.indiceReajuste ?? null],
    );
    return rows[0].id;
  }

  it('não gera nada quando o contrato está fora da janela de 60 dias', async () => {
    await criarContrato({ dataFim: '2027-01-01' });
    const resultado = await processarRenovacaoContratual(pool, new Date('2026-01-01T00:00:00Z'));
    expect(resultado).toHaveLength(0);
  });

  it('envia planejamento dentro de 60 dias sem gerar reajuste ainda', async () => {
    const contratoId = await criarContrato({ dataFim: '2026-09-01' });
    const resultado = await processarRenovacaoContratual(pool, new Date('2026-07-15T00:00:00Z'));

    expect(resultado[0].planejamentoEnviado).toBe(true);
    expect(resultado[0].ajusteEnviado).toBe(false);
    expect(resultado[0].reajustePropostoId).toBeUndefined();

    const { rows } = await pool.query(`select * from reajustes_contrato where contrato_id = $1`, [contratoId]);
    expect(rows).toHaveLength(0);
  });

  it('gera proposta de reajuste em reajustes_contrato quando há índice cadastrado dentro de 30 dias', async () => {
    await pool.query(
      `insert into indices_economicos (indice, competencia, percentual_acumulado_12m) values ('IPCA', '2026-06-01', 0.045)`,
    );
    const contratoId = await criarContrato({ dataFim: '2026-08-10', indiceReajuste: 'IPCA' });

    const resultado = await processarRenovacaoContratual(pool, new Date('2026-07-15T00:00:00Z'));

    expect(resultado[0].ajusteEnviado).toBe(true);
    expect(resultado[0].reajustePropostoId).toBeDefined();

    const { rows } = await pool.query(`select * from reajustes_contrato where contrato_id = $1`, [contratoId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('proposto');
    expect(Number(rows[0].valor_novo)).toBeCloseTo(1567.5, 2);
  });

  it('não gera reajuste quando não há índice cadastrado, mas ainda notifica', async () => {
    const contratoId = await criarContrato({ dataFim: '2026-08-10', indiceReajuste: 'IGPM' });

    const resultado = await processarRenovacaoContratual(pool, new Date('2026-07-15T00:00:00Z'));

    expect(resultado[0].ajusteEnviado).toBe(true);
    expect(resultado[0].reajustePropostoId).toBeUndefined();

    const { rows } = await pool.query(`select * from reajustes_contrato where contrato_id = $1`, [contratoId]);
    expect(rows).toHaveLength(0);
  });

  it('é idempotente: rodar duas vezes não duplica a proposta de reajuste', async () => {
    await pool.query(
      `insert into indices_economicos (indice, competencia, percentual_acumulado_12m) values ('IPCA', '2026-06-01', 0.045)
       on conflict (indice, competencia) do nothing`,
    );
    const contratoId = await criarContrato({ dataFim: '2026-08-10', indiceReajuste: 'IPCA' });

    await processarRenovacaoContratual(pool, new Date('2026-07-15T00:00:00Z'));
    await processarRenovacaoContratual(pool, new Date('2026-07-16T00:00:00Z'));

    const { rows } = await pool.query(`select * from reajustes_contrato where contrato_id = $1`, [contratoId]);
    expect(rows).toHaveLength(1);
  });

  it('re-tenta gerar proposta depois de rejeição, quando um índice mais recente é cadastrado', async () => {
    await pool.query(
      `insert into indices_economicos (indice, competencia, percentual_acumulado_12m) values ('IPCA', '2026-06-01', 0.045)
       on conflict (indice, competencia) do nothing`,
    );
    const contratoId = await criarContrato({ dataFim: '2026-08-10', indiceReajuste: 'IPCA' });

    const primeiro = await processarRenovacaoContratual(pool, new Date('2026-07-15T00:00:00Z'));
    const primeiraPropostaId = primeiro[0].reajustePropostoId;
    expect(primeiraPropostaId).toBeDefined();

    // Operador rejeita a proposta gerada.
    await pool.query(`update reajustes_contrato set status = 'rejeitado' where id = $1`, [primeiraPropostaId]);

    // Sem índice mais novo: roda de novo e não deve gerar outra proposta.
    const segundo = await processarRenovacaoContratual(pool, new Date('2026-07-16T00:00:00Z'));
    expect(segundo[0].reajustePropostoId).toBeUndefined();

    let { rows } = await pool.query(`select * from reajustes_contrato where contrato_id = $1`, [contratoId]);
    expect(rows).toHaveLength(1);

    // Cadastra um índice mais recente (competência posterior à da proposta rejeitada).
    await pool.query(
      `insert into indices_economicos (indice, competencia, percentual_acumulado_12m) values ('IPCA', '2026-07-01', 0.05)`,
    );

    const terceiro = await processarRenovacaoContratual(pool, new Date('2026-07-17T00:00:00Z'));
    expect(terceiro[0].reajustePropostoId).toBeDefined();
    expect(terceiro[0].reajustePropostoId).not.toBe(primeiraPropostaId);

    ({ rows } = await pool.query(`select * from reajustes_contrato where contrato_id = $1 order by data_proposta`, [
      contratoId,
    ]));
    expect(rows).toHaveLength(2);
    expect(rows[0].status).toBe('rejeitado');
    expect(rows[1].status).toBe('proposto');
  });
});
