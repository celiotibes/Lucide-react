import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ContratoSemModeloError, gerarContratoHtml } from './gerarContratoHtml';

const DATABASE_URL = process.env.DATABASE_URL;
const MODELO_EXEMPLO = `
<h1>Contrato — {{objeto_locacao}}</h1>
<p>Modalidade: {{modalidade_label}}</p>
<p>Valor: {{valor_aluguel}} — vencimento dia {{dia_vencimento}}</p>
<table><tbody>{{#each locatarios}}<tr><td>{{papel_label}}</td><td>{{nome}}</td><td>{{cpf}}</td><td>{{estado_civil}}</td></tr>{{/each}}</tbody></table>
<ul>{{#each mobilia}}<li>{{descricao}}</li>{{/each}}</ul>
<div id="clausulas-adicionais">{{{clausulas_adicionais_html}}}</div>
`;

describe.skipIf(!DATABASE_URL)('gerarContratoHtml (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let cidadeId: string;

  beforeEach(async () => {
    const cidade = await pool.query(`select id from cidades where nome = 'Florianópolis' limit 1`);
    cidadeId = cidade.rows[0].id;
    await pool.query(`delete from modelos_contrato where cidade_id = $1`, [cidadeId]);
    await pool.query(`insert into modelos_contrato (cidade_id, nome, corpo_html) values ($1, 'Modelo de teste', $2)`, [
      cidadeId,
      MODELO_EXEMPLO,
    ]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('funde modelo regional + partes + mobília + cláusulas para uma kitnet integral', async () => {
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'kitnet') returning id`,
      [cidadeId, `Kitnet Teste ${randomUUID()}`],
    );
    const imovelId = imovel.rows[0].id;

    await pool.query(
      `insert into ativos_comodato (imovel_id, descricao, valor_aquisicao, data_aquisicao, vida_util_meses) values
       ($1, 'Geladeira Frost Free Brastemp', 2690, '2026-01-01', 120)`,
      [imovelId],
    );

    const locatario = await pool.query(
      `insert into pessoas (nome, cpf_cnpj, rg, estado_civil) values ('Murilo Ribeiro Geraldi', '48461124898', '09325447406', 'solteiro') returning id`,
    );

    const contrato = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', '2026-07-08', 10, 2490) returning id`,
      [imovelId],
    );
    const contratoId = contrato.rows[0].id;
    await pool.query(`insert into contrato_partes (contrato_id, pessoa_id, papel) values ($1, $2, 'locatario_principal')`, [
      contratoId,
      locatario.rows[0].id,
    ]);
    await pool.query(`update contratos set clausulas_adicionais = $1 where id = $2`, [
      'Autorizada a manutenção de um gato de pequeno porte, mediante termo aditivo.',
      contratoId,
    ]);

    const resultado = await gerarContratoHtml(pool, contratoId);

    expect(resultado.modalidade).toBe('kitnet_integral');
    expect(resultado.html).toContain('Modalidade: Kitnet Integral');
    expect(resultado.html).toContain('R$ 2.490,00');
    expect(resultado.html).toContain('<td>Locatário</td><td>Murilo Ribeiro Geraldi</td><td>48461124898</td><td>solteiro(a)</td>');
    expect(resultado.html).toContain('<li>Geladeira Frost Free Brastemp</li>');
    expect(resultado.html).toContain('<p>Autorizada a manutenção de um gato de pequeno porte, mediante termo aditivo.</p>');
  });

  it('co-living: mobília do contrato é só a do cômodo + áreas comuns, não a de outros quartos', async () => {
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo, permite_coliving) values ($1, $2, 'kitnet', true) returning id`,
      [cidadeId, `Coliving Teste ${randomUUID()}`],
    );
    const imovelId = imovel.rows[0].id;

    const quarto1 = await pool.query(`insert into comodos (imovel_id, identificacao) values ($1, 'Quarto 1') returning id`, [
      imovelId,
    ]);
    const quarto2 = await pool.query(`insert into comodos (imovel_id, identificacao) values ($1, 'Quarto 2') returning id`, [
      imovelId,
    ]);

    await pool.query(
      `insert into ativos_comodato (imovel_id, comodo_id, descricao, valor_aquisicao, data_aquisicao, vida_util_meses) values
       ($1, $2, 'Cama Box Solteiro Quarto 1', 790, '2026-01-01', 120),
       ($1, $3, 'Cama Box Solteiro Quarto 2', 790, '2026-01-01', 120)`,
      [imovelId, quarto1.rows[0].id, quarto2.rows[0].id],
    );
    await pool.query(
      `insert into ativos_comodato (imovel_id, area_comum, descricao, valor_aquisicao, data_aquisicao, vida_util_meses) values
       ($1, true, 'Geladeira da cozinha compartilhada', 2690, '2026-01-01', 120)`,
      [imovelId],
    );

    const contrato = await pool.query(
      `insert into contratos (imovel_id, comodo_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
       values ($1, $2, 'locacao_padrao', '2026-07-08', 10, 900) returning id`,
      [imovelId, quarto1.rows[0].id],
    );

    const resultado = await gerarContratoHtml(pool, contrato.rows[0].id);

    expect(resultado.modalidade).toBe('coliving_quarto');
    expect(resultado.html).toContain('Quarto 1');
    expect(resultado.html).toContain('Cama Box Solteiro Quarto 1');
    expect(resultado.html).toContain('Geladeira da cozinha compartilhada');
    expect(resultado.html).not.toContain('Cama Box Solteiro Quarto 2');
  });

  it('lança ContratoSemModeloError quando a cidade não tem modelo ativo', async () => {
    const outraCidade = await pool.query(
      `insert into cidades (nome, uf) values ($1, 'XX') returning id`,
      [`Cidade Sem Modelo ${randomUUID()}`],
    );
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'kitnet') returning id`,
      [outraCidade.rows[0].id, `Imóvel Sem Modelo ${randomUUID()}`],
    );
    const contrato = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', '2026-07-08', 10, 1000) returning id`,
      [imovel.rows[0].id],
    );

    await expect(gerarContratoHtml(pool, contrato.rows[0].id)).rejects.toThrow(ContratoSemModeloError);
  });

  it('rejeita gravar comodo_id num contrato de imóvel que não permite co-living (trigger do banco)', async () => {
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'kitnet') returning id`,
      [cidadeId, `Sem Coliving ${randomUUID()}`],
    );
    const quarto = await pool.query(`insert into comodos (imovel_id, identificacao) values ($1, 'Quarto 1') returning id`, [
      imovel.rows[0].id,
    ]);

    await expect(
      pool.query(
        `insert into contratos (imovel_id, comodo_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
         values ($1, $2, 'locacao_padrao', '2026-07-08', 10, 900)`,
        [imovel.rows[0].id, quarto.rows[0].id],
      ),
    ).rejects.toThrow();
  });
});
