import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { registrarAndamentoOS } from './andamentosOS';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('registrarAndamentoOS (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let ordemServicoId: string;
  let prestadorId: string;
  let inquilinoId: string;

  beforeEach(async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'kitnet') returning id`,
      [cidade.rows[0].id, `Teste OS ${randomUUID()}`],
    );
    const prestador = await pool.query(`insert into pessoas (nome) values ('Eletricista Teste') returning id`);
    prestadorId = prestador.rows[0].id;
    await pool.query(`insert into pessoa_papeis (pessoa_id, papel) values ($1, 'prestador_eventual')`, [prestadorId]);

    const inquilino = await pool.query(`insert into pessoas (nome) values ('Inquilino Teste') returning id`);
    inquilinoId = inquilino.rows[0].id;

    const os = await pool.query(
      `insert into ordens_servico (imovel_id, categoria, descricao, prestador_id, aberto_por_pessoa_id, status)
       values ($1, 'eletricista', 'Troca de disjuntor', $2, $3, 'alocado') returning id`,
      [imovel.rows[0].id, prestadorId, inquilinoId],
    );
    ordemServicoId = os.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('registra um andamento sem mudar o status quando o tipo não implica transição', async () => {
    const resultado = await registrarAndamentoOS(pool, {
      ordemServicoId,
      tipo: 'comentario',
      descricao: 'Aguardando o síndico liberar o quadro de força',
    });

    expect(resultado.statusAtualizado).toBeNull();

    const { rows } = await pool.query(`select status from ordens_servico where id = $1`, [ordemServicoId]);
    expect(rows[0].status).toBe('alocado');
  });

  it('"iniciada" muda o status para em_execucao e grava checkin_at', async () => {
    const resultado = await registrarAndamentoOS(pool, { ordemServicoId, tipo: 'iniciada' });
    expect(resultado.statusAtualizado).toBe('em_execucao');

    const { rows } = await pool.query(`select status, checkin_at from ordens_servico where id = $1`, [ordemServicoId]);
    expect(rows[0].status).toBe('em_execucao');
    expect(rows[0].checkin_at).not.toBeNull();
  });

  it('"concluida" muda o status para concluido e grava checkout_at', async () => {
    await registrarAndamentoOS(pool, { ordemServicoId, tipo: 'iniciada' });
    const resultado = await registrarAndamentoOS(pool, {
      ordemServicoId,
      tipo: 'concluida',
      descricao: 'Disjuntor trocado, testado com carga',
      fotosUrls: ['https://exemplo.com/foto1.jpg'],
    });

    expect(resultado.statusAtualizado).toBe('concluido');
    const { rows } = await pool.query(`select status, checkout_at from ordens_servico where id = $1`, [ordemServicoId]);
    expect(rows[0].status).toBe('concluido');
    expect(rows[0].checkout_at).not.toBeNull();
  });

  it('mantém o histórico completo das etapas (relatório passo a passo)', async () => {
    await registrarAndamentoOS(pool, { ordemServicoId, tipo: 'a_caminho' });
    await registrarAndamentoOS(pool, { ordemServicoId, tipo: 'iniciada' });
    await registrarAndamentoOS(pool, { ordemServicoId, tipo: 'material_pendente', descricao: 'Falta disjuntor 40A' });
    await registrarAndamentoOS(pool, { ordemServicoId, tipo: 'retomada' });
    await registrarAndamentoOS(pool, { ordemServicoId, tipo: 'concluida' });

    const { rows } = await pool.query(
      `select tipo from ordem_servico_andamentos where ordem_servico_id = $1 order by criado_em`,
      [ordemServicoId],
    );
    expect(rows.map((r) => r.tipo)).toEqual(['a_caminho', 'iniciada', 'material_pendente', 'retomada', 'concluida']);
  });

  it('rejeita novo andamento em OS já concluída (estado final)', async () => {
    await registrarAndamentoOS(pool, { ordemServicoId, tipo: 'iniciada' });
    await registrarAndamentoOS(pool, { ordemServicoId, tipo: 'concluida' });

    await expect(registrarAndamentoOS(pool, { ordemServicoId, tipo: 'comentario' })).rejects.toThrow(/estado final/);
  });

  it('rejeita novo andamento em OS cancelada', async () => {
    await registrarAndamentoOS(pool, { ordemServicoId, tipo: 'cancelada', descricao: 'Cliente desistiu do serviço' });

    await expect(registrarAndamentoOS(pool, { ordemServicoId, tipo: 'iniciada' })).rejects.toThrow(/estado final/);
  });

  it('ordem de serviço inexistente: lança erro claro', async () => {
    await expect(registrarAndamentoOS(pool, { ordemServicoId: randomUUID(), tipo: 'iniciada' })).rejects.toThrow(
      /não encontrada/,
    );
  });

  it('mudança de status registra notificação pendente para quem abriu o chamado', async () => {
    const resultado = await registrarAndamentoOS(pool, { ordemServicoId, tipo: 'iniciada' });
    expect(resultado.notificacaoRegistrada).toBe(true);

    const { rows } = await pool.query(
      `select pessoa_id, canal, template, status from notificacoes_log where ordem_servico_id = $1`,
      [ordemServicoId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].pessoa_id).toBe(inquilinoId);
    expect(rows[0].canal).toBe('email');
    expect(rows[0].template).toBe('status_os_em_execucao');
    expect(rows[0].status).toBe('pendente_envio'); // sem provedor real conectado ainda — não afirma entrega
  });

  it('andamento que não muda o status não registra notificação', async () => {
    const resultado = await registrarAndamentoOS(pool, { ordemServicoId, tipo: 'comentario', descricao: 'nota interna' });
    expect(resultado.notificacaoRegistrada).toBe(false);

    const { rows } = await pool.query(`select count(*)::int as total from notificacoes_log where ordem_servico_id = $1`, [
      ordemServicoId,
    ]);
    expect(rows[0].total).toBe(0);
  });

  it('concluir dispara a notificação de status e a pesquisa de satisfação, marcando pesquisa_enviada_em', async () => {
    await registrarAndamentoOS(pool, { ordemServicoId, tipo: 'iniciada' });
    const resultado = await registrarAndamentoOS(pool, { ordemServicoId, tipo: 'concluida' });

    expect(resultado.pesquisaSatisfacaoDisparada).toBe(true);

    const { rows: os } = await pool.query(`select pesquisa_enviada_em from ordens_servico where id = $1`, [ordemServicoId]);
    expect(os[0].pesquisa_enviada_em).not.toBeNull();

    const { rows: notificacoes } = await pool.query(
      `select template from notificacoes_log where ordem_servico_id = $1 order by enviado_em`,
      [ordemServicoId],
    );
    expect(notificacoes.map((n) => n.template)).toEqual(['status_os_em_execucao', 'status_os_concluido', 'pesquisa_satisfacao']);
  });

  it('OS sem aberto_por_pessoa_id (aberta internamente, não por um inquilino): não tenta notificar ninguém', async () => {
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo)
       select cidade_id, 'Teste OS Interna ' || gen_random_uuid()::text, 'kitnet' from imoveis limit 1
       returning id`,
    );
    const osInterna = await pool.query(
      `insert into ordens_servico (imovel_id, categoria, status) values ($1, 'limpeza', 'alocado') returning id`,
      [imovel.rows[0].id],
    );

    const resultado = await registrarAndamentoOS(pool, { ordemServicoId: osInterna.rows[0].id, tipo: 'iniciada' });
    expect(resultado.notificacaoRegistrada).toBe(false);
  });
});
