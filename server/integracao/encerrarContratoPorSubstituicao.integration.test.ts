// Testes de integração para encerrarContratoPorSubstituicao
// Valida: criação de contrato coliving → encerramento → vistoria de saída criada

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { encerrarContratoPorSubstituicao } from './encerrarContratoPorSubstituicao';
import { obterPool } from './db';

describe('encerrarContratoPorSubstituicao', () => {
  let pool: Pool;
  let cidadeId: string;
  let residencialId: string;
  let imovelId: string;
  let comodoDId: string;
  let contratoAntigoId: string;
  let novoContratoId: string;
  let pessoaAntigaId: string;
  let pessoaNovaId: string;

  beforeAll(async () => {
    pool = obterPool();

    // Setup: criar cidade, residencial, imóvel com cômodos
    const { rows: cidades } = await pool.query<{ id: string }>(
      `insert into cidades (nome, uf, distribuidora_energia)
       values ($1, $2, $3) on conflict (nome, uf) do update set nome = excluded.nome
       returning id`,
      ['Teste Substituição', 'SC', 'CELESC'],
    );
    cidadeId = cidades[0].id;

    const { rows: residenciais } = await pool.query<{ id: string }>(
      `insert into residenciais (nome, cidade_id, endereco)
       values ($1, $2, $3) on conflict do nothing
       returning id`,
      ['Residencial Teste', cidadeId, 'Rua Teste, 123'],
    );
    residencialId = residenciais[0]?.id || '';

    const { rows: imoveis } = await pool.query<{ id: string }>(
      `insert into imoveis (residencial_id, cidade_id, identificacao, tipo, permite_coliving)
       values ($1, $2, $3, $4, true) on conflict do nothing
       returning id`,
      [residencialId, cidadeId, 'Apto Teste 14', 'apartamento'],
    );
    imovelId = imoveis[0]?.id || '';

    // Criar 2 cômodos
    const { rows: comodos } = await pool.query<{ id: string }>(
      `insert into comodos (imovel_id, identificacao)
       values ($1, 'Quarto 1'), ($1, 'Quarto 2')
       on conflict do nothing
       returning id`,
      [imovelId],
    );
    comodoDId = comodos[0]?.id || '';

    // Criar pessoas
    const { rows: pessoas1 } = await pool.query<{ id: string }>(
      `insert into pessoas (nome, cpf_cnpj)
       values ($1, $2)
       returning id`,
      ['Morador Antigo', '111.111.111-11'],
    );
    pessoaAntigaId = pessoas1[0].id;

    const { rows: pessoas2 } = await pool.query<{ id: string }>(
      `insert into pessoas (nome, cpf_cnpj)
       values ($1, $2)
       returning id`,
      ['Morador Novo', '222.222.222-22'],
    );
    pessoaNovaId = pessoas2[0].id;

    // Criar contrato antigo (ativo, coliving)
    const { rows: contratos1 } = await pool.query<{ id: string }>(
      `insert into contratos (
         imovel_id, comodo_id, tipo, status, data_inicio,
         valor_aluguel, dia_vencimento
       )
       values ($1, $2, 'locacao_padrao', 'ativo', now(),
               1000, 5)
       returning id`,
      [imovelId, comodoDId],
    );
    contratoAntigoId = contratos1[0].id;

    // Criar contrato novo (ativo, mesmo quarto)
    const { rows: contratos2 } = await pool.query<{ id: string }>(
      `insert into contratos (
         imovel_id, comodo_id, tipo, status, data_inicio,
         valor_aluguel, dia_vencimento
       )
       values ($1, $2, 'locacao_padrao', 'ativo', now(),
               1000, 5)
       returning id`,
      [imovelId, comodoDId],
    );
    novoContratoId = contratos2[0].id;
  });

  afterAll(async () => {
    // Cleanup
    await pool.query(`delete from imoveis where id = $1`, [imovelId]);
    await pool.query(`delete from residenciais where id = $1`, [residencialId]);
    await pool.query(`delete from cidades where id = $1`, [cidadeId]);
    await pool.end();
  });

  it('deve encerrar contrato e criar vistoria de saída', async () => {
    const resultado = await encerrarContratoPorSubstituicao({
      contratoAntigoId,
      novoContratoCandidatoId: novoContratoId,
      motivoEncerramento: 'substituicao',
    });

    expect(resultado.status).toBe('encerrado_com_vistoria');
    expect(resultado.contratoEncerradoId).toBe(contratoAntigoId);
    expect(resultado.vistoriaIdCriada).toBeTruthy();
    expect(resultado.novoContratoId).toBe(novoContratoId);

    // Validar que contrato foi marcado como encerrado
    const { rows: contratoVerif } = await pool.query<{ status: string; motivo_encerramento: string }>(
      `select status, motivo_encerramento from contratos where id = $1`,
      [contratoAntigoId],
    );
    expect(contratoVerif[0].status).toBe('encerrado');
    expect(contratoVerif[0].motivo_encerramento).toBe('substituicao');

    // Validar que vistoria foi criada
    if (resultado.vistoriaIdCriada) {
      const { rows: vistoriaVerif } = await pool.query<{ tipo: string; status: string; contrato_id: string }>(
        `select tipo, status, contrato_id from vistorias where id = $1`,
        [resultado.vistoriaIdCriada],
      );
      expect(vistoriaVerif[0].tipo).toBe('saida');
      expect(vistoriaVerif[0].status).toBe('em_andamento');
      expect(vistoriaVerif[0].contrato_id).toBe(contratoAntigoId);
    }
  });

  it('deve rejeitar encerramento de contrato já encerrado', async () => {
    // Primeiro encerramento (já feito no teste anterior)
    // Tentar encerrar novamente
    const resultado = await encerrarContratoPorSubstituicao({
      contratoAntigoId,
      motivoEncerramento: 'substituicao',
    });

    expect(resultado.status).toBe('erro');
    expect(resultado.mensagem).toContain('já está encerrado');
  });

  it('deve rejeitar se novo contrato é de imóvel diferente', async () => {
    // Criar outro imóvel e contrato
    const { rows: imovel2 } = await pool.query<{ id: string }>(
      `insert into imoveis (residencial_id, cidade_id, identificacao, tipo, permite_coliving)
       values ($1, $2, $3, $4, true) on conflict do nothing
       returning id`,
      [residencialId, cidadeId, 'Apto Outro', 'apartamento'],
    );
    const imovel2Id = imovel2[0].id;

    const { rows: comodo2 } = await pool.query<{ id: string }>(
      `insert into comodos (imovel_id, identificacao)
       values ($1, 'Quarto Único')
       on conflict do nothing
       returning id`,
      [imovel2Id],
    );
    const comodo2Id = comodo2[0].id;

    const { rows: contrato3 } = await pool.query<{ id: string }>(
      `insert into contratos (
         imovel_id, comodo_id, tipo, status, data_inicio,
         valor_aluguel, dia_vencimento
       )
       values ($1, $2, 'locacao_padrao', 'ativo', now(),
               1000, 5)
       returning id`,
      [imovel2Id, comodo2Id],
    );
    const contrato3Id = contrato3[0].id;

    // Tentar encerrar contrato antigo ligando a novo contrato em imóvel diferente
    const resultado = await encerrarContratoPorSubstituicao({
      contratoAntigoId,
      novoContratoCandidatoId: contrato3Id,
      motivoEncerramento: 'substituicao',
    });

    expect(resultado.status).toBe('erro');
    expect(resultado.mensagem).toContain('imóvel diferente');

    // Cleanup
    await pool.query(`delete from imoveis where id = $1`, [imovel2Id]);
  });
});
