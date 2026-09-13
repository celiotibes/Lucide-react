import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { solicitarQuebraContrato, SolicitacaoQuebraContratoInvalidaError } from './solicitarQuebraContrato';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('solicitarQuebraContrato (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });

  afterAll(async () => {
    await pool.end();
  });

  it('Florianópolis: calcula a multa automaticamente e grava a faixa de bonificação', async () => {
    const cidade = await pool.query(`select id from cidades where nome = 'Florianópolis' limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'kitnet') returning id`,
      [cidade.rows[0].id, `Kitnet Quebra ${randomUUID()}`],
    );
    const contrato = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, data_fim, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', '2026-06-30', '2027-06-29', 10, 2490) returning id`,
      [imovel.rows[0].id],
    );
    const inquilino = await pool.query(`insert into pessoas (nome) values ('Inquilino Quebra') returning id`);

    const resultado = await solicitarQuebraContrato(pool, {
      pessoaId: inquilino.rows[0].id,
      contratoId: contrato.rows[0].id,
      dataNotificacao: '2026-11-20',
      dataRescisaoDesejada: '2026-12-20',
    });

    expect(resultado.protocolo).toMatch(/^CH-\d{4}-\d{6}$/);
    expect(resultado.multaCalculada).not.toBeNull();
    expect(resultado.faixaBonificacao).toBe('ate_22_novembro');

    const { rows: os } = await pool.query(`select natureza, categoria from ordens_servico where id = $1`, [
      resultado.ordemServicoId,
    ]);
    expect(os[0].natureza).toBe('contratual');
    expect(os[0].categoria).toBe('quebra_contrato');

    const { rows: solicitacao } = await pool.query(
      `select multa_calculada, faixa_bonificacao, status from solicitacoes_quebra_contrato where ordem_servico_id = $1`,
      [resultado.ordemServicoId],
    );
    expect(Number(solicitacao[0].multa_calculada)).toBe(resultado.multaCalculada);
    expect(solicitacao[0].status).toBe('em_analise');
  });

  it('Curitiba: abre o chamado mas não calcula (sem fórmula codificada)', async () => {
    const cidade = await pool.query(`select id from cidades where nome = 'Curitiba' limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'apartamento') returning id`,
      [cidade.rows[0].id, `Apto Quebra ${randomUUID()}`],
    );
    const contrato = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, data_fim, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', '2026-06-30', '2027-06-29', 10, 1500) returning id`,
      [imovel.rows[0].id],
    );
    const inquilino = await pool.query(`insert into pessoas (nome) values ('Inquilino Quebra Curitiba') returning id`);

    const resultado = await solicitarQuebraContrato(pool, {
      pessoaId: inquilino.rows[0].id,
      contratoId: contrato.rows[0].id,
      dataNotificacao: '2026-08-01',
      dataRescisaoDesejada: '2026-09-01',
    });

    expect(resultado.multaCalculada).toBeNull();
    expect(resultado.faixaBonificacao).toBeNull();

    const { rows: os } = await pool.query(`select descricao from ordens_servico where id = $1`, [resultado.ordemServicoId]);
    expect(os[0].descricao).toContain('sem fórmula de multa codificada');
  });

  it('rejeita contrato sem data_fim definida', async () => {
    const cidade = await pool.query(`select id from cidades where nome = 'Florianópolis' limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'kitnet') returning id`,
      [cidade.rows[0].id, `Kitnet Sem Fim ${randomUUID()}`],
    );
    const contrato = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', '2026-06-30', 10, 2490) returning id`,
      [imovel.rows[0].id],
    );
    const inquilino = await pool.query(`insert into pessoas (nome) values ('Inquilino Sem Fim') returning id`);

    await expect(
      solicitarQuebraContrato(pool, {
        pessoaId: inquilino.rows[0].id,
        contratoId: contrato.rows[0].id,
        dataNotificacao: '2026-11-20',
        dataRescisaoDesejada: '2026-12-20',
      }),
    ).rejects.toThrow(SolicitacaoQuebraContratoInvalidaError);
  });

  it('não permite gravar decisão sem parecer (constraint do banco)', async () => {
    const cidade = await pool.query(`select id from cidades where nome = 'Florianópolis' limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'kitnet') returning id`,
      [cidade.rows[0].id, `Kitnet Parecer ${randomUUID()}`],
    );
    const contrato = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, data_fim, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', '2026-06-30', '2027-06-29', 10, 2490) returning id`,
      [imovel.rows[0].id],
    );
    const inquilino = await pool.query(`insert into pessoas (nome) values ('Inquilino Parecer') returning id`);

    const resultado = await solicitarQuebraContrato(pool, {
      pessoaId: inquilino.rows[0].id,
      contratoId: contrato.rows[0].id,
      dataNotificacao: '2026-08-01',
      dataRescisaoDesejada: '2026-09-01',
    });

    await expect(
      pool.query(`update solicitacoes_quebra_contrato set status = 'aprovada' where ordem_servico_id = $1`, [
        resultado.ordemServicoId,
      ]),
    ).rejects.toThrow();
  });
});
