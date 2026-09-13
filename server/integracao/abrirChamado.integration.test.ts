import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { abrirChamado, ChamadoInvalidoError } from './abrirChamado';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('abrirChamado (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let imovelId: string;
  let inquilinoId: string;
  let contratoId: string;

  beforeEach(async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'kitnet') returning id`,
      [cidade.rows[0].id, `Teste Chamado ${randomUUID()}`],
    );
    imovelId = imovel.rows[0].id;

    const inquilino = await pool.query(`insert into pessoas (nome) values ('Inquilino Teste') returning id`);
    inquilinoId = inquilino.rows[0].id;

    const contrato = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', '2026-01-01', 10, 1000) returning id`,
      [imovelId],
    );
    contratoId = contrato.rows[0].id;
    await pool.query(`insert into contrato_partes (contrato_id, pessoa_id, papel) values ($1, $2, 'locatario_principal')`, [
      contratoId,
      inquilinoId,
    ]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('gera protocolo único e vincula ao contrato ativo do inquilino', async () => {
    const resultado = await abrirChamado(pool, {
      pessoaId: inquilinoId,
      imovelId,
      natureza: 'manutencao',
      categoria: 'vazamento',
      descricao: 'Vazamento no banheiro',
    });

    expect(resultado.protocolo).toMatch(/^CH-\d{4}-\d{6}$/);
    expect(resultado.contratoId).toBe(contratoId);

    const { rows } = await pool.query(`select natureza, categoria, status, aberto_por_pessoa_id from ordens_servico where id = $1`, [
      resultado.ordemServicoId,
    ]);
    expect(rows[0].natureza).toBe('manutencao');
    expect(rows[0].categoria).toBe('vazamento');
    expect(rows[0].status).toBe('aberto');
    expect(rows[0].aberto_por_pessoa_id).toBe(inquilinoId);
  });

  it('emergência: SLA de 2 horas corridas, não úteis', async () => {
    const antes = new Date();
    const resultado = await abrirChamado(pool, {
      pessoaId: inquilinoId,
      imovelId,
      natureza: 'emergencia',
      categoria: 'falta de energia',
      urgencia: 'urgente',
    });

    const diferencaHoras = (resultado.slaPrazoEm.getTime() - antes.getTime()) / (60 * 60 * 1000);
    expect(diferencaHoras).toBeGreaterThan(1.9);
    expect(diferencaHoras).toBeLessThan(2.1);
  });

  it('financeiro: SLA de 24 horas úteis (bem mais de 24h corridas se cruzar fim de semana/expediente)', async () => {
    const resultado = await abrirChamado(pool, {
      pessoaId: inquilinoId,
      imovelId,
      natureza: 'financeiro',
      categoria: 'duvida sobre boleto',
    });

    expect(resultado.slaPrazoEm.getTime()).toBeGreaterThan(Date.now());
  });

  it('anexos ficam gravados', async () => {
    const resultado = await abrirChamado(pool, {
      pessoaId: inquilinoId,
      imovelId,
      natureza: 'manutencao',
      categoria: 'infiltracao',
      anexosUrls: ['https://exemplo.com/foto1.jpg', 'https://exemplo.com/video1.mp4'],
    });

    const { rows } = await pool.query(`select anexos_urls from ordens_servico where id = $1`, [resultado.ordemServicoId]);
    expect(rows[0].anexos_urls).toEqual(['https://exemplo.com/foto1.jpg', 'https://exemplo.com/video1.mp4']);
  });

  it('sem contrato ativo do inquilino para o imóvel: abre o chamado mesmo assim, contratoId null', async () => {
    const outroInquilino = await pool.query(`insert into pessoas (nome) values ('Sem contrato') returning id`);

    const resultado = await abrirChamado(pool, {
      pessoaId: outroInquilino.rows[0].id,
      imovelId,
      natureza: 'contratual',
      categoria: 'duvida sobre reajuste',
    });

    expect(resultado.contratoId).toBeNull();
    expect(resultado.ordemServicoId).toBeDefined();
  });

  it('natureza sem política de SLA cadastrada: rejeita antes de gravar qualquer coisa', async () => {
    await expect(
      abrirChamado(pool, {
        pessoaId: inquilinoId,
        imovelId,
        natureza: 'inexistente' as never,
        categoria: 'x',
      }),
    ).rejects.toThrow(ChamadoInvalidoError);
  });

  it('dois chamados seguidos geram protocolos diferentes', async () => {
    const primeiro = await abrirChamado(pool, { pessoaId: inquilinoId, imovelId, natureza: 'manutencao', categoria: 'a' });
    const segundo = await abrirChamado(pool, { pessoaId: inquilinoId, imovelId, natureza: 'manutencao', categoria: 'b' });
    expect(primeiro.protocolo).not.toBe(segundo.protocolo);
  });
});
