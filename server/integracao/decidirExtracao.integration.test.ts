// Teste de integração real contra Postgres — não mockado, mesmo padrão de
// decidirReajuste.integration.test.ts. Só roda quando DATABASE_URL está
// configurada.
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { DadosContratoExtraidos } from '@/server/documentos/extrairDadosContrato';
import { aprovarExtracao, rejeitarExtracao } from './decidirExtracao';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('decidirExtracao (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let imovelId: string;
  let contratoId: string;
  let documentoId: string;

  beforeEach(async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'apartamento') returning id`,
      [cidade.rows[0].id, `Teste Decidir Extração ${randomUUID()}`],
    );
    imovelId = imovel.rows[0].id;

    const contrato = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', current_date, 10, 1000) returning id`,
      [imovelId],
    );
    contratoId = contrato.rows[0].id;

    const documento = await pool.query(
      `insert into documentos_anexados (contrato_id, tipo, nome_arquivo, mime_type, tamanho_bytes, hash_sha256, storage_path)
       values ($1, 'contrato_assinado', 'contrato.pdf', 'application/pdf', 100, $2, '/tmp/contrato.pdf')
       returning id`,
      [contratoId, randomUUID()],
    );
    documentoId = documento.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  async function criarExtracao(dados: Partial<DadosContratoExtraidos> = {}, status = 'pendente_revisao') {
    const dadosCompletos: DadosContratoExtraidos = {
      valorAluguel: 1200,
      valorCaucao: null,
      indiceReajuste: null,
      dataInicio: null,
      dataFim: null,
      diaVencimento: null,
      custosObrigatorios: [],
      observacoes: null,
      ...dados,
    };
    const { rows } = await pool.query<{ id: string }>(
      `insert into extracoes_documento_ia (documento_id, contrato_id, modelo_ia, dados_extraidos, status)
       values ($1, $2, 'claude-sonnet-5', $3, $4) returning id`,
      [documentoId, contratoId, JSON.stringify(dadosCompletos), status],
    );
    return rows[0].id;
  }

  it('aprovar: só copia os campos marcados no formulário', async () => {
    const extracaoId = await criarExtracao({ valorAluguel: 1500, indiceReajuste: 'IPCA' });
    const formData = new FormData();
    formData.set('aplicar_valorAluguel', 'on');
    // indiceReajuste deliberadamente não marcado

    const resultado = await aprovarExtracao(pool, extracaoId, contratoId, formData);
    expect(resultado.sucesso).toBe(true);

    const { rows: contrato } = await pool.query(`select valor_aluguel, indice_reajuste from contratos where id = $1`, [
      contratoId,
    ]);
    expect(Number(contrato[0].valor_aluguel)).toBe(1500);
    expect(contrato[0].indice_reajuste).toBeNull();

    const { rows: extracao } = await pool.query(`select status, campos_aplicados from extracoes_documento_ia where id = $1`, [
      extracaoId,
    ]);
    expect(extracao[0].status).toBe('aprovada');
    expect(extracao[0].campos_aplicados.valorAluguel).toBe(1500);
    expect(extracao[0].campos_aplicados.indiceReajuste).toBeUndefined();
  });

  it('custo obrigatório com natureza incompatível: não aplica e registra o motivo em campos_aplicados', async () => {
    await pool.query(
      `insert into contrato_componentes_mensais (contrato_id, tipo, natureza, percentual)
       values ($1, 'condominio_repassado', 'percentual_do_aluguel', 0.1)`,
      [contratoId],
    );
    const extracaoId = await criarExtracao({
      custosObrigatorios: [{ tipo: 'condominio_repassado', descricao: 'Condomínio', valor: 350 }],
    });
    const formData = new FormData();
    formData.set('aplicar_custo_condominio_repassado', 'on');

    const resultado = await aprovarExtracao(pool, extracaoId, contratoId, formData);
    expect(resultado.sucesso).toBe(true);

    const { rows: componente } = await pool.query(
      `select natureza, valor_fixo from contrato_componentes_mensais where contrato_id = $1 and tipo = 'condominio_repassado'`,
      [contratoId],
    );
    expect(componente[0].natureza).toBe('percentual_do_aluguel');
    expect(componente[0].valor_fixo).toBeNull();

    const { rows: extracao } = await pool.query(`select campos_aplicados from extracoes_documento_ia where id = $1`, [
      extracaoId,
    ]);
    expect(extracao[0].campos_aplicados.custosObrigatorios).toBeUndefined();
    expect(extracao[0].campos_aplicados.custosNaoAplicados).toHaveLength(1);
    expect(extracao[0].campos_aplicados.custosNaoAplicados[0].tipo).toBe('condominio_repassado');
    expect(extracao[0].campos_aplicados.custosNaoAplicados[0].motivo).toBeTruthy();
  });

  it('custo obrigatório sem componente existente: cria como valor_fixo', async () => {
    const extracaoId = await criarExtracao({
      custosObrigatorios: [{ tipo: 'vaga_garagem', descricao: 'Vaga', valor: 200 }],
    });
    const formData = new FormData();
    formData.set('aplicar_custo_vaga_garagem', 'on');

    const resultado = await aprovarExtracao(pool, extracaoId, contratoId, formData);
    expect(resultado.sucesso).toBe(true);

    const { rows: componente } = await pool.query(
      `select natureza, valor_fixo from contrato_componentes_mensais where contrato_id = $1 and tipo = 'vaga_garagem'`,
      [contratoId],
    );
    expect(componente[0].natureza).toBe('valor_fixo');
    expect(Number(componente[0].valor_fixo)).toBe(200);
  });

  it('rejeitar: não altera o contrato', async () => {
    const extracaoId = await criarExtracao({ valorAluguel: 1500 });
    const resultado = await rejeitarExtracao(pool, extracaoId);
    expect(resultado.sucesso).toBe(true);

    const { rows: contrato } = await pool.query(`select valor_aluguel from contratos where id = $1`, [contratoId]);
    expect(Number(contrato[0].valor_aluguel)).toBe(1000);

    const { rows: extracao } = await pool.query(`select status from extracoes_documento_ia where id = $1`, [extracaoId]);
    expect(extracao[0].status).toBe('rejeitada');
  });

  it('aprovar uma extração já revisada devolve falha', async () => {
    const extracaoId = await criarExtracao();
    await rejeitarExtracao(pool, extracaoId);

    const resultado = await aprovarExtracao(pool, extracaoId, contratoId, new FormData());
    expect(resultado.sucesso).toBe(false);
  });

  it('rejeitar uma extração já revisada devolve falha', async () => {
    const extracaoId = await criarExtracao();
    await rejeitarExtracao(pool, extracaoId);

    const resultado = await rejeitarExtracao(pool, extracaoId);
    expect(resultado.sucesso).toBe(false);
  });
});
