import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { solicitarChaveReserva } from './solicitarChaveReserva';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('solicitarChaveReserva (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let imovelId: string;
  let inquilinoId: string;
  let contratoId: string;

  beforeEach(async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'kitnet') returning id`,
      [cidade.rows[0].id, `Teste Chave ${randomUUID()}`],
    );
    imovelId = imovel.rows[0].id;

    const inquilino = await pool.query(`insert into pessoas (nome) values ('Inquilino Chave') returning id`);
    inquilinoId = inquilino.rows[0].id;

    const contrato = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', '2026-01-01', 10, 1000) returning id`,
      [imovelId],
    );
    contratoId = contrato.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('devolve o valor previsto quando o contrato tem a tarifa cadastrada', async () => {
    await pool.query(
      `insert into contrato_tarifario_servicos (contrato_id, servico, valor) values ($1, 'chaveiro_abertura_perda', 140.00)`,
      [contratoId],
    );

    const resultado = await solicitarChaveReserva(pool, {
      pessoaId: inquilinoId,
      imovelId,
      contratoId,
      motivo: 'Perdi a chave',
    });

    expect(resultado.protocolo).toMatch(/^CH-\d{4}-\d{6}$/);
    expect(resultado.valorPrevisto).toBe(140);

    const { rows } = await pool.query(`select natureza, categoria from ordens_servico where id = $1`, [
      resultado.ordemServicoId,
    ]);
    expect(rows[0].natureza).toBe('manutencao');
    expect(rows[0].categoria).toBe('chave_reserva_copia');
  });

  it('abre o chamado mesmo sem tarifa cadastrada, mas valorPrevisto vem null', async () => {
    const resultado = await solicitarChaveReserva(pool, {
      pessoaId: inquilinoId,
      imovelId,
      contratoId,
    });

    expect(resultado.valorPrevisto).toBeNull();
  });
});
