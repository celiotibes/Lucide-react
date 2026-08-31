import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { solicitarImagensCameras, SolicitacaoImagensCamerasInvalidaError } from './solicitarImagensCameras';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('solicitarImagensCameras (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let imovelId: string;
  let inquilinoId: string;

  beforeEach(async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'kitnet') returning id`,
      [cidade.rows[0].id, `Teste Câmeras ${randomUUID()}`],
    );
    imovelId = imovel.rows[0].id;

    const inquilino = await pool.query(`insert into pessoas (nome) values ('Inquilino Câmeras') returning id`);
    inquilinoId = inquilino.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('abre chamado de natureza jurídico, nunca libera automaticamente', async () => {
    const resultado = await solicitarImagensCameras(pool, {
      pessoaId: inquilinoId,
      imovelId,
      dataSolicitada: '2026-07-01',
      horarioSolicitado: '14:00-15:00',
      justificativa: 'Furto de bicicleta na área comum',
    });

    expect(resultado.protocolo).toMatch(/^CH-\d{4}-\d{6}$/);
    expect(resultado.status).toBe('em_analise_juridica');

    const { rows: os } = await pool.query(`select natureza, categoria from ordens_servico where id = $1`, [
      resultado.ordemServicoId,
    ]);
    expect(os[0].natureza).toBe('juridico');
    expect(os[0].categoria).toBe('imagens_cameras_seguranca');

    const { rows: solicitacao } = await pool.query(
      `select status, justificativa, parecer_juridico from solicitacoes_imagens_cameras where id = $1`,
      [resultado.solicitacaoId],
    );
    expect(solicitacao[0].status).toBe('em_analise_juridica');
    expect(solicitacao[0].parecer_juridico).toBeNull();
  });

  it('exige justificativa não vazia', async () => {
    await expect(
      solicitarImagensCameras(pool, {
        pessoaId: inquilinoId,
        imovelId,
        dataSolicitada: '2026-07-01',
        horarioSolicitado: '14:00-15:00',
        justificativa: '   ',
      }),
    ).rejects.toThrow(SolicitacaoImagensCamerasInvalidaError);
  });

  it('não permite gravar parecer sem justificar a decisão (constraint do banco)', async () => {
    const resultado = await solicitarImagensCameras(pool, {
      pessoaId: inquilinoId,
      imovelId,
      dataSolicitada: '2026-07-01',
      horarioSolicitado: '09:00',
      justificativa: 'Investigação de dano ao imóvel',
    });

    await expect(
      pool.query(`update solicitacoes_imagens_cameras set status = 'indeferida_regra_padrao' where id = $1`, [
        resultado.solicitacaoId,
      ]),
    ).rejects.toThrow();
  });
});
