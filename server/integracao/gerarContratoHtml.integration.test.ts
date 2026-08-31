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

  it('categoria (schema 28): imóvel residencial usa o modelo "residencial" quando ele existe, não o "geral"', async () => {
    await pool.query(
      `insert into modelos_contrato (cidade_id, categoria, nome, corpo_html) values ($1, 'residencial', 'Modelo residencial', $2)`,
      [cidadeId, '<h1>MODELO RESIDENCIAL — {{imovel_identificacao}}</h1>'],
    );

    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'apartamento') returning id`,
      [cidadeId, `Apto Categoria ${randomUUID()}`],
    );
    const contrato = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', '2026-07-08', 10, 1500) returning id`,
      [imovel.rows[0].id],
    );

    const resultado = await gerarContratoHtml(pool, contrato.rows[0].id);
    expect(resultado.html).toContain('MODELO RESIDENCIAL');
  });

  it('categoria (schema 28): sala_comercial resolve para "comercial", cai para "geral" quando não há modelo comercial cadastrado', async () => {
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'sala_comercial') returning id`,
      [cidadeId, `Sala Categoria ${randomUUID()}`],
    );
    const contrato = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', '2026-07-08', 10, 1300) returning id`,
      [imovel.rows[0].id],
    );

    // sem modelo 'comercial' cadastrado ainda: cai para o 'geral' inserido no beforeEach.
    const semComercial = await gerarContratoHtml(pool, contrato.rows[0].id);
    expect(semComercial.html).toContain('Contrato —');

    await pool.query(
      `insert into modelos_contrato (cidade_id, categoria, nome, corpo_html) values ($1, 'comercial', 'Modelo comercial', $2)`,
      [cidadeId, '<h1>MODELO COMERCIAL — {{imovel_identificacao}}</h1>'],
    );

    const comModeloComercial = await gerarContratoHtml(pool, contrato.rows[0].id);
    expect(comModeloComercial.html).toContain('MODELO COMERCIAL');
  });

  it('garantias (docs/32): lista TODAS as garantias do contrato, não só a mais recente — evidência real Life Space/Apto 503', async () => {
    const modeloComGarantias = `<table>{{#each garantias}}<tr><td>{{finalidade_label}}</td><td>{{tipo_label}}</td><td>{{valor}}</td><td>{{forma_pagamento}}</td></tr>{{/each}}</table>`;
    await pool.query(`update modelos_contrato set corpo_html = $1 where cidade_id = $2 and categoria = 'geral'`, [
      modeloComGarantias,
      cidadeId,
    ]);

    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'apartamento') returning id`,
      [cidadeId, `Apto Garantias ${randomUUID()}`],
    );
    const contrato = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', '2026-07-08', 10, 1590) returning id`,
      [imovel.rows[0].id],
    );
    const contratoId = contrato.rows[0].id;

    await pool.query(
      `insert into garantias (contrato_id, tipo, valor, finalidade, forma_pagamento) values ($1, 'caucao', 1590, 'locacao', 'pix')`,
      [contratoId],
    );
    await pool.query(
      `insert into garantias (contrato_id, tipo, valor, finalidade, forma_pagamento) values ($1, 'caucao', 240, 'comodato', 'boleto')`,
      [contratoId],
    );

    const resultado = await gerarContratoHtml(pool, contratoId);

    expect(resultado.html).toMatch(/<td>Locação<\/td><td>Caução<\/td><td>R\$\s*1\.590,00<\/td><td>PIX<\/td>/);
    expect(resultado.html).toMatch(/<td>Comodato de bens móveis<\/td><td>Caução<\/td><td>R\$\s*240,00<\/td><td>boleto<\/td>/);
  });

  it('componentes mensais (Curitiba, docs/11): valor_fixo mostra o valor, percentual mostra "já incluído", repassado_variavel descreve a regra sem valor específico', async () => {
    const modeloComComponentes = `<table>{{#each componentes_mensais}}<tr><td>{{tipo_label}}</td><td>{{valor_exibicao}}</td></tr>{{/each}}</table>`;
    await pool.query(`update modelos_contrato set corpo_html = $1 where cidade_id = $2 and categoria = 'geral'`, [
      modeloComComponentes,
      cidadeId,
    ]);

    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'apartamento') returning id`,
      [cidadeId, `Apto Componentes ${randomUUID()}`],
    );
    const contrato = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', '2026-07-08', 10, 1300) returning id`,
      [imovel.rows[0].id],
    );
    const contratoId = contrato.rows[0].id;

    await pool.query(
      `insert into contrato_componentes_mensais (contrato_id, tipo, natureza, valor_fixo) values ($1, 'comodato_moveis', 'valor_fixo', 350)`,
      [contratoId],
    );
    await pool.query(
      `insert into contrato_componentes_mensais (contrato_id, tipo, natureza, percentual) values ($1, 'vaga_garagem', 'percentual_do_aluguel', 0.10)`,
      [contratoId],
    );
    await pool.query(
      `insert into contrato_componentes_mensais (contrato_id, tipo, natureza) values ($1, 'iptu_repassado', 'repassado_variavel')`,
      [contratoId],
    );

    const resultado = await gerarContratoHtml(pool, contratoId);

    expect(resultado.html).toMatch(/<td>Comodato de bens móveis<\/td><td>R\$\s*350,00<\/td>/);
    expect(resultado.html).toContain('<td>Vaga de garagem</td><td>10% do aluguel (já incluído)</td>');
    expect(resultado.html).toContain('<td>IPTU</td><td>repassado ao valor de face');
  });

  it('coliving: compatibilidade aprovada vira tabela comparativa automaticamente (docs/39)', async () => {
    const modeloComCompatibilidade = `
      <p>Score: {{compatibilidade_score}}%</p>
      <p>Parecer: {{compatibilidade_parecer}}</p>
      <table>{{#each compatibilidade_coliving}}<tr><td>{{parametro}}</td><td>{{valor_a}}</td><td>{{valor_b}}</td></tr>{{/each}}</table>
    `;
    await pool.query(`update modelos_contrato set corpo_html = $1 where cidade_id = $2 and categoria = 'geral'`, [
      modeloComCompatibilidade,
      cidadeId,
    ]);

    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo, permite_coliving) values ($1, $2, 'apartamento', true) returning id`,
      [cidadeId, `Coliving Compatibilidade ${randomUUID()}`],
    );
    const imovelId = imovel.rows[0].id;
    const quarto1 = await pool.query(`insert into comodos (imovel_id, identificacao) values ($1, 'Quarto 1') returning id`, [imovelId]);
    const quarto2 = await pool.query(`insert into comodos (imovel_id, identificacao) values ($1, 'Quarto 2') returning id`, [imovelId]);

    const leadA = await pool.query(
      `insert into leads (nome, status, imovel_interesse_id, comodo_interesse_id) values ('Candidato A', 'novo', $1, $2) returning id`,
      [imovelId, quarto1.rows[0].id],
    );
    const leadB = await pool.query(
      `insert into leads (nome, status, imovel_interesse_id, comodo_interesse_id) values ('Candidato B', 'novo', $1, $2) returning id`,
      [imovelId, quarto2.rows[0].id],
    );
    const perfilA = await pool.query(
      `insert into perfis_convivencia (lead_id, v1_limpeza, v2_ruido, v3_rotina, v4_fumo, v5_pets, v6_dieta, v7_conflito, tem_pet, quadro_alergico)
       values ($1, 2, 2, 2, 1, 2, 1, 3, false, 'respiratoria') returning id`,
      [leadA.rows[0].id],
    );
    const perfilB = await pool.query(
      `insert into perfis_convivencia (lead_id, v1_limpeza, v2_ruido, v3_rotina, v4_fumo, v5_pets, v6_dieta, v7_conflito, tem_pet, quadro_alergico)
       values ($1, 1, 2, 2, 1, 2, 1, 3, false, 'nenhuma') returning id`,
      [leadB.rows[0].id],
    );
    const [perfilAId, perfilBId] = [perfilA.rows[0].id, perfilB.rows[0].id].sort();
    await pool.query(
      `insert into compatibilidades_coliving (imovel_id, perfil_a_id, perfil_b_id, score_geral, pontos_atrito, alertas_criticos, status, parecer, decidido_em)
       values ($1, $2, $3, 86.36, '[]', '[]', 'aprovado', 'Divergência de limpeza, resolvida por acordo interno.', now())`,
      [imovelId, perfilAId, perfilBId],
    );

    const contratoA = await pool.query(
      `insert into contratos (imovel_id, comodo_id, tipo, data_inicio, dia_vencimento, valor_aluguel, status)
       values ($1, $2, 'locacao_padrao', '2026-07-08', 10, 1200, 'ativo') returning id`,
      [imovelId, quarto1.rows[0].id],
    );
    const contratoB = await pool.query(
      `insert into contratos (imovel_id, comodo_id, tipo, data_inicio, dia_vencimento, valor_aluguel, status)
       values ($1, $2, 'locacao_padrao', '2026-07-08', 10, 1200, 'ativo') returning id`,
      [imovelId, quarto2.rows[0].id],
    );

    const resultado = await gerarContratoHtml(pool, contratoA.rows[0].id);

    expect(resultado.html).toContain('Score: 86%');
    expect(resultado.html).toContain('Parecer: Divergência de limpeza, resolvida por acordo interno.');
    expect(resultado.html).toContain('<td>Limpeza e organização</td><td>Nível 2 (Moderado)</td><td>Nível 1 (Básico)</td>');
    expect(resultado.html).toContain(
      '<td>Quadro alérgico/condição de saúde declarada</td><td>Respiratória (ácaro/mofo/poeira)</td><td>Nenhuma</td>',
    );

    // Contrato B (o outro quarto) enxerga a mesma comparação, em qualquer ordem de perfil_a/perfil_b.
    const resultadoB = await gerarContratoHtml(pool, contratoB.rows[0].id);
    expect(resultadoB.html).toContain('Score: 86%');
  });

  it('coliving: sem colega de quarto com contrato ativo ainda, a tabela de compatibilidade fica vazia sem quebrar a geração', async () => {
    const modeloComCompatibilidade = `<p>Score: {{compatibilidade_score}}</p><table>{{#each compatibilidade_coliving}}<tr><td>{{parametro}}</td></tr>{{/each}}</table>`;
    await pool.query(`update modelos_contrato set corpo_html = $1 where cidade_id = $2 and categoria = 'geral'`, [
      modeloComCompatibilidade,
      cidadeId,
    ]);

    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo, permite_coliving) values ($1, $2, 'apartamento', true) returning id`,
      [cidadeId, `Coliving Sem Colega ${randomUUID()}`],
    );
    const quarto1 = await pool.query(`insert into comodos (imovel_id, identificacao) values ($1, 'Quarto 1') returning id`, [
      imovel.rows[0].id,
    ]);
    const contrato = await pool.query(
      `insert into contratos (imovel_id, comodo_id, tipo, data_inicio, dia_vencimento, valor_aluguel, status)
       values ($1, $2, 'locacao_padrao', '2026-07-08', 10, 1200, 'ativo') returning id`,
      [imovel.rows[0].id, quarto1.rows[0].id],
    );

    const resultado = await gerarContratoHtml(pool, contrato.rows[0].id);
    expect(resultado.html).toContain('Score:');
    expect(resultado.html).not.toContain('<td>');
  });
});
