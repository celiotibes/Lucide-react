// Testes de integração para registrarHospedagemAirbnb
// Valida: registro de hospedagem → vistorias simplificadas criadas

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { registrarHospedagemAirbnb } from './registrarHospedagemAirbnb';
import { obterPool } from './db';

describe('registrarHospedagemAirbnb', () => {
  let pool: Pool;
  let cidadeId: string;
  let residencialId: string;
  let imovelId: string;
  let comodoDId: string;

  beforeAll(async () => {
    pool = obterPool();

    // Setup: cidade, residencial, imóvel com cômodos
    const { rows: cidades } = await pool.query<{ id: string }>(
      `insert into cidades (nome, uf, distribuidora_energia)
       values ($1, $2, $3) on conflict (nome, uf) do update set nome = excluded.nome
       returning id`,
      ['Teste Airbnb', 'SC', 'CELESC'],
    );
    cidadeId = cidades[0].id;

    const { rows: residenciais } = await pool.query<{ id: string }>(
      `insert into residenciais (nome, cidade_id, endereco)
       values ($1, $2, $3) on conflict do nothing
       returning id`,
      ['Residencial Airbnb', cidadeId, 'Rua Hospedagem, 456'],
    );
    residencialId = residenciais[0]?.id || '';

    const { rows: imoveis } = await pool.query<{ id: string }>(
      `insert into imoveis (residencial_id, cidade_id, identificacao, tipo, permite_temporada)
       values ($1, $2, $3, $4, true) on conflict do nothing
       returning id`,
      [residencialId, cidadeId, 'Apto Airbnb 1', 'apartamento'],
    );
    imovelId = imoveis[0]?.id || '';

    // Criar cômodo
    const { rows: comodos } = await pool.query<{ id: string }>(
      `insert into comodos (imovel_id, identificacao)
       values ($1, 'Quarto 2')
       on conflict do nothing
       returning id`,
      [imovelId],
    );
    comodoDId = comodos[0]?.id || '';
  });

  afterAll(async () => {
    await pool.query(`delete from imoveis where id = $1`, [imovelId]);
    await pool.query(`delete from residenciais where id = $1`, [residencialId]);
    await pool.query(`delete from cidades where id = $1`, [cidadeId]);
    await pool.end();
  });

  it('deve criar hospedagem com vistorias de entrada e saída', async () => {
    const periodoInicio = new Date('2026-08-01');
    const periodoFim = new Date('2026-08-05');

    const resultado = await registrarHospedagemAirbnb({
      imovelId,
      comodoDid: comodoDId,
      periodoInicio,
      periodoFim,
      diasHospedados: 4,
      valorDiaria: 150,
      plataforma: 'airbnb',
      platformaIdExterno: 'airbnb-123456',
    });

    expect(resultado.status).toBe('criada');
    expect(resultado.hospedagemId).toBeTruthy();
    expect(resultado.vistoriaEntradaId).toBeTruthy();
    expect(resultado.vistoriaSaidaId).toBeTruthy();

    // Validar hospedagem no banco
    if (resultado.hospedagemId) {
      const { rows: hospVerif } = await pool.query<{
        imovel_id: string;
        comodo_id: string;
        periodo_inicio: string;
        dias_hospedados: number;
        receita_total: string;
        plataforma: string;
      }>(
        `select imovel_id, comodo_id, periodo_inicio, dias_hospedados, receita_total, plataforma
         from airbnb_hospedagens where id = $1`,
        [resultado.hospedagemId],
      );

      expect(hospVerif[0].imovel_id).toBe(imovelId);
      expect(hospVerif[0].comodo_id).toBe(comodoDId);
      expect(hospVerif[0].dias_hospedados).toBe(4);
      expect(Number(hospVerif[0].receita_total)).toBe(600); // 4 dias × R$ 150
      expect(hospVerif[0].plataforma).toBe('airbnb');
    }

    // Validar vistoria de entrada
    if (resultado.vistoriaEntradaId) {
      const { rows: vistEntradaVerif } = await pool.query<{ tipo: string; status: string; airbnb_hospedagem_id: string }>(
        `select tipo, status, airbnb_hospedagem_id from vistorias where id = $1`,
        [resultado.vistoriaEntradaId],
      );
      expect(vistEntradaVerif[0].tipo).toBe('hospedagem_temporaria');
      expect(vistEntradaVerif[0].status).toBe('concluida');
      expect(vistEntradaVerif[0].airbnb_hospedagem_id).toBe(resultado.hospedagemId);
    }

    // Validar vistoria de saída
    if (resultado.vistoriaSaidaId) {
      const { rows: vistSaidaVerif } = await pool.query<{ tipo: string; status: string; airbnb_hospedagem_id: string }>(
        `select tipo, status, airbnb_hospedagem_id from vistorias where id = $1`,
        [resultado.vistoriaSaidaId],
      );
      expect(vistSaidaVerif[0].tipo).toBe('hospedagem_temporaria');
      expect(vistSaidaVerif[0].status).toBe('em_andamento');
      expect(vistSaidaVerif[0].airbnb_hospedagem_id).toBe(resultado.hospedagemId);
    }
  });

  it('deve rejeitar se imóvel não permite temporada', async () => {
    // Criar imóvel que não permite temporada
    const { rows: imovelNaoTemp } = await pool.query<{ id: string }>(
      `insert into imoveis (residencial_id, cidade_id, identificacao, tipo, permite_temporada)
       values ($1, $2, $3, $4, false) on conflict do nothing
       returning id`,
      [residencialId, cidadeId, 'Apto SemAirbnb', 'apartamento'],
    );
    const imovelNaoTempId = imovelNaoTemp[0].id;

    const resultado = await registrarHospedagemAirbnb({
      imovelId: imovelNaoTempId,
      periodoInicio: new Date('2026-08-10'),
      periodoFim: new Date('2026-08-15'),
      diasHospedados: 5,
      valorDiaria: 150,
      plataforma: 'booking',
    });

    expect(resultado.status).toBe('erro');
    expect(resultado.mensagem).toContain('não permite temporada');

    // Cleanup
    await pool.query(`delete from imoveis where id = $1`, [imovelNaoTempId]);
  });

  it('deve aceitar hospedagem sem comodo (para imóvel inteiro)', async () => {
    const resultado = await registrarHospedagemAirbnb({
      imovelId,
      periodoInicio: new Date('2026-09-01'),
      periodoFim: new Date('2026-09-03'),
      diasHospedados: 2,
      valorDiaria: 300,
      plataforma: 'outro',
    });

    expect(resultado.status).toBe('criada');
    expect(resultado.hospedagemId).toBeTruthy();

    // Validar que comodo_id é NULL
    if (resultado.hospedagemId) {
      const { rows: hospVerif } = await pool.query<{ comodo_id: string | null }>(
        `select comodo_id from airbnb_hospedagens where id = $1`,
        [resultado.hospedagemId],
      );
      expect(hospVerif[0].comodo_id).toBeNull();
    }
  });
});
