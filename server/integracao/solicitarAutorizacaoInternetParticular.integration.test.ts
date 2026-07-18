import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { solicitarAutorizacaoInternetParticular } from './solicitarAutorizacaoInternetParticular';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('solicitarAutorizacaoInternetParticular (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let inquilinoId: string;

  beforeEach(async () => {
    const inquilino = await pool.query(`insert into pessoas (nome) values ('Inquilino Internet') returning id`);
    inquilinoId = inquilino.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('avisa quando o imóvel ainda não tem orientação de instalação cadastrada', async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'kitnet') returning id`,
      [cidade.rows[0].id, `Teste Internet ${randomUUID()}`],
    );

    const resultado = await solicitarAutorizacaoInternetParticular(pool, {
      pessoaId: inquilinoId,
      imovelId: imovel.rows[0].id,
      provedorPretendido: 'Vero',
    });

    expect(resultado.protocolo).toMatch(/^CH-\d{4}-\d{6}$/);
    expect(resultado.orientacoesInstalacao).toBeNull();

    const { rows } = await pool.query(`select natureza, categoria, descricao from ordens_servico where id = $1`, [
      resultado.ordemServicoId,
    ]);
    expect(rows[0].natureza).toBe('contratual');
    expect(rows[0].categoria).toBe('autorizacao_internet_particular');
    expect(rows[0].descricao).toContain('Vero');
  });

  it('devolve a orientação cadastrada quando o imóvel já tem uma', async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo, orientacoes_instalacao_internet)
       values ($1, $2, 'kitnet', 'Rack no corredor do 2º andar; entrada de cabo pela canaleta externa, não furar parede-mestra.')
       returning id`,
      [cidade.rows[0].id, `Teste Internet Orientada ${randomUUID()}`],
    );

    const resultado = await solicitarAutorizacaoInternetParticular(pool, {
      pessoaId: inquilinoId,
      imovelId: imovel.rows[0].id,
    });

    expect(resultado.orientacoesInstalacao).toContain('canaleta externa');
  });
});
