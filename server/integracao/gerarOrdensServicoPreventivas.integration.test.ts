import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { gerarOrdensServicoPreventivas } from './gerarOrdensServicoPreventivas';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('gerarOrdensServicoPreventivas (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let cidadeId: string;
  let imovelId: string;
  let residencialId: string;

  beforeEach(async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    cidadeId = cidade.rows[0].id;

    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'apartamento') returning id`,
      [cidadeId, `Teste Preventiva ${randomUUID()}`],
    );
    imovelId = imovel.rows[0].id;

    const residencial = await pool.query(
      `insert into residenciais (nome, cidade_id) values ($1, $2) returning id`,
      [`Residencial Teste ${randomUUID()}`, cidadeId],
    );
    residencialId = residencial.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  async function criarPlano(opts: {
    imovelId?: string | null;
    residencialId?: string | null;
    proximaExecucao: string;
    periodicidadeDias?: number;
    categoria?: string;
  }) {
    const { rows } = await pool.query(
      `insert into planos_manutencao_preventiva (imovel_id, residencial_id, categoria, descricao, periodicidade_dias, proxima_execucao)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [
        opts.imovelId ?? null,
        opts.residencialId ?? null,
        opts.categoria ?? 'manutencao_preventiva',
        'Plano de teste',
        opts.periodicidadeDias ?? 90,
        opts.proximaExecucao,
      ],
    );
    return rows[0].id as string;
  }

  it('plano de unidade vencido: gera OS ligada ao imóvel e avança a próxima execução', async () => {
    const planoId = await criarPlano({ imovelId, proximaExecucao: '2026-07-01', periodicidadeDias: 90 });

    const resultado = await gerarOrdensServicoPreventivas(pool, new Date(Date.UTC(2026, 6, 5)));
    const gerada = resultado.geradas.find((g) => g.planoId === planoId)!;
    expect(gerada).toBeDefined();

    const { rows: os } = await pool.query(
      `select imovel_id, residencial_id, categoria, plano_manutencao_id, data_agendada from ordens_servico where id = $1`,
      [gerada.ordemServicoId],
    );
    expect(os[0].imovel_id).toBe(imovelId);
    expect(os[0].residencial_id).toBeNull();
    expect(os[0].plano_manutencao_id).toBe(planoId);

    const { rows: plano } = await pool.query(`select proxima_execucao from planos_manutencao_preventiva where id = $1`, [
      planoId,
    ]);
    expect(new Date(plano[0].proxima_execucao).toISOString().slice(0, 10)).toBe('2026-09-29'); // 01/07 + 90 dias
  });

  it('plano do prédio inteiro (residencial_id): gera OS sem imóvel específico', async () => {
    const planoId = await criarPlano({
      residencialId,
      proximaExecucao: '2026-07-01',
      categoria: 'limpeza_caixa_dagua',
    });

    const resultado = await gerarOrdensServicoPreventivas(pool, new Date(Date.UTC(2026, 6, 5)));
    const gerada = resultado.geradas.find((g) => g.planoId === planoId)!;

    const { rows: os } = await pool.query(`select imovel_id, residencial_id, categoria from ordens_servico where id = $1`, [
      gerada.ordemServicoId,
    ]);
    expect(os[0].imovel_id).toBeNull();
    expect(os[0].residencial_id).toBe(residencialId);
    expect(os[0].categoria).toBe('limpeza_caixa_dagua');
  });

  it('plano ainda não vencido: não gera OS', async () => {
    const planoId = await criarPlano({ imovelId, proximaExecucao: '2026-12-01' });

    const resultado = await gerarOrdensServicoPreventivas(pool, new Date(Date.UTC(2026, 6, 5)));
    expect(resultado.geradas.find((g) => g.planoId === planoId)).toBeUndefined();
  });

  it('plano inativo: não gera OS mesmo vencido', async () => {
    const planoId = await criarPlano({ imovelId, proximaExecucao: '2026-01-01' });
    await pool.query(`update planos_manutencao_preventiva set ativo = false where id = $1`, [planoId]);

    const resultado = await gerarOrdensServicoPreventivas(pool, new Date(Date.UTC(2026, 6, 5)));
    expect(resultado.geradas.find((g) => g.planoId === planoId)).toBeUndefined();
  });

  it('idempotência: rodar duas vezes no mesmo dia não duplica a OS da mesma ocorrência', async () => {
    const planoId = await criarPlano({ imovelId, proximaExecucao: '2026-07-01' });

    const primeira = await gerarOrdensServicoPreventivas(pool, new Date(Date.UTC(2026, 6, 5)));
    expect(primeira.geradas.find((g) => g.planoId === planoId)).toBeDefined();

    // segunda chamada no mesmo dia: proxima_execucao já foi avançada para
    // depois da referência, então nem seleciona o plano de novo.
    const segunda = await gerarOrdensServicoPreventivas(pool, new Date(Date.UTC(2026, 6, 5)));
    expect(segunda.geradas.find((g) => g.planoId === planoId)).toBeUndefined();

    const { rows } = await pool.query(`select count(*)::int as total from ordens_servico where plano_manutencao_id = $1`, [
      planoId,
    ]);
    expect(rows[0].total).toBe(1);
  });

  it('atraso acumulado: cada execução do job gera só uma ocorrência, avançando gradualmente', async () => {
    // periodicidade de 10 dias, vencido desde 01/01 — bem mais de uma
    // ocorrência atrasada até a referência de 05/07.
    const planoId = await criarPlano({ imovelId, proximaExecucao: '2026-01-01', periodicidadeDias: 10 });

    await gerarOrdensServicoPreventivas(pool, new Date(Date.UTC(2026, 6, 5)));
    const { rows: apos1 } = await pool.query(`select count(*)::int as total from ordens_servico where plano_manutencao_id = $1`, [
      planoId,
    ]);
    expect(apos1[0].total).toBe(1); // não gerou um backlog inteiro de uma vez

    await gerarOrdensServicoPreventivas(pool, new Date(Date.UTC(2026, 6, 5)));
    const { rows: apos2 } = await pool.query(`select count(*)::int as total from ordens_servico where plano_manutencao_id = $1`, [
      planoId,
    ]);
    expect(apos2[0].total).toBe(2); // segunda chamada recupera mais uma ocorrência atrasada
  });
});
