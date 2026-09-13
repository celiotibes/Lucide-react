import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { distribuirRecebimentosPendentes } from './distribuirRecebimento';
import { gerarExtratosMensaisProprietario } from './gerarExtratoProprietario';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('gerarExtratosMensaisProprietario (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let cidadeId: string;

  const competenciaJulho2026 = new Date(Date.UTC(2026, 6, 1));

  beforeEach(async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    cidadeId = cidade.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  async function criarImovel(identificacao?: string) {
    const { rows } = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'kitnet') returning id`,
      [cidadeId, identificacao ?? `Teste Extrato ${randomUUID()}`],
    );
    return rows[0].id as string;
  }

  async function pagarAluguelDistribuido(imovelId: string, valor: number, proprietarioId: string) {
    const contrato = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', '2026-01-01', 10, $2) returning id`,
      [imovelId, valor],
    );
    await pool.query(
      `insert into faturas (contrato_id, imovel_id, competencia, tipo, valor_bruto, valor_liquido, vencimento, status)
       values ($1, $2, '2026-07-01', 'aluguel', $3, $3, '2026-07-10', 'paga')`,
      [contrato.rows[0].id, imovelId, valor],
    );
    await pool.query(`insert into imovel_propriedade (imovel_id, proprietario_pessoa_id, percentual) values ($1, $2, 1)`, [
      imovelId,
      proprietarioId,
    ]);
    await distribuirRecebimentosPendentes(pool);
  }

  it('gera o extrato por imóvel com receita bruta, dedução e valor repassado', async () => {
    const proprietario = await pool.query(`insert into pessoas (nome) values ('Proprietário Extrato') returning id`);
    const proprietarioId = proprietario.rows[0].id;
    const imovelId = await criarImovel('Kitnet Extrato Teste');

    // taxa de 10%: bruto 1000, líquido 900
    const contrato = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', '2026-01-01', 10, 1000) returning id`,
      [imovelId],
    );
    await pool.query(
      `insert into faturas (contrato_id, imovel_id, competencia, tipo, valor_bruto, valor_liquido, vencimento, status)
       values ($1, $2, '2026-07-01', 'aluguel', 1000, 1000, '2026-07-10', 'paga')`,
      [contrato.rows[0].id, imovelId],
    );
    await pool.query(
      `insert into imovel_propriedade (imovel_id, proprietario_pessoa_id, percentual, taxa_administracao_pct) values ($1, $2, 1, 0.10)`,
      [imovelId, proprietarioId],
    );
    await distribuirRecebimentosPendentes(pool);

    const resultado = await gerarExtratosMensaisProprietario(pool, competenciaJulho2026);
    const extratoImovel = resultado.gerados.find((g) => g.imovelId === imovelId)!;
    expect(extratoImovel).toBeDefined();
    expect(extratoImovel.receitaBruta).toBe(1000);
    expect(extratoImovel.totalDeducoes).toBe(100);
    expect(extratoImovel.valorRepassado).toBe(900);

    const { rows: itens } = await pool.query(
      `select descricao, tipo, valor from extrato_mensal_itens where extrato_id = $1 order by tipo`,
      [extratoImovel.extratoId],
    );
    expect(itens).toEqual([
      { descricao: 'Taxa de administração', tipo: 'despesa', valor: '100.00' },
      { descricao: 'Receita de aluguel', tipo: 'receita', valor: '1000.00' },
    ]);
  });

  it('gera também o extrato consolidado da carteira (imovel_id null) somando dois imóveis do mesmo proprietário', async () => {
    const proprietario = await pool.query(`insert into pessoas (nome) values ('Proprietário Carteira') returning id`);
    const proprietarioId = proprietario.rows[0].id;

    const imovel1 = await criarImovel('Imóvel Carteira 1');
    const imovel2 = await criarImovel('Imóvel Carteira 2');
    await pagarAluguelDistribuido(imovel1, 1000, proprietarioId);
    await pagarAluguelDistribuido(imovel2, 500, proprietarioId);

    const resultado = await gerarExtratosMensaisProprietario(pool, competenciaJulho2026);
    const consolidado = resultado.gerados.find((g) => g.pessoaId === proprietarioId && g.imovelId === null)!;
    expect(consolidado).toBeDefined();
    expect(consolidado.receitaBruta).toBe(1500);
    expect(consolidado.valorRepassado).toBe(1500); // sem taxa nesses dois

    const { rows: itens } = await pool.query(
      `select descricao, valor from extrato_mensal_itens where extrato_id = $1 order by descricao`,
      [consolidado.extratoId],
    );
    expect(itens).toEqual([
      { descricao: 'Imóvel Carteira 1', valor: '1000.00' },
      { descricao: 'Imóvel Carteira 2', valor: '500.00' },
    ]);
  });

  it('sem nenhum crédito de repasse no mês: não gera nada', async () => {
    const resultado = await gerarExtratosMensaisProprietario(pool, new Date(Date.UTC(2099, 0, 1)));
    expect(resultado.gerados).toEqual([]);
  });

  it('idempotência: rodar duas vezes não duplica os extratos', async () => {
    const proprietario = await pool.query(`insert into pessoas (nome) values ('Proprietário Idempotente') returning id`);
    const imovelId = await criarImovel();
    await pagarAluguelDistribuido(imovelId, 1000, proprietario.rows[0].id);

    const primeira = await gerarExtratosMensaisProprietario(pool, competenciaJulho2026);
    expect(primeira.gerados.filter((g) => g.pessoaId === proprietario.rows[0].id)).toHaveLength(2); // por imóvel + consolidado

    const segunda = await gerarExtratosMensaisProprietario(pool, competenciaJulho2026);
    expect(segunda.gerados.filter((g) => g.pessoaId === proprietario.rows[0].id)).toHaveLength(0);

    const { rows } = await pool.query(`select count(*)::int as total from extratos_mensais_proprietario where pessoa_id = $1`, [
      proprietario.rows[0].id,
    ]);
    expect(rows[0].total).toBe(2);
  });

  it('lançamento antigo sem valor_bruto preenchido: usa o valor líquido como bruto, sem quebrar', async () => {
    const proprietario = await pool.query(`insert into pessoas (nome) values ('Proprietário Legado') returning id`);
    const imovelId = await criarImovel();
    await pool.query(
      `insert into investidor_ledger (pessoa_id, imovel_id, data, tipo, valor, saldo_apos)
       values ($1, $2, '2026-07-15', 'credito_repasse', 700, 700)`,
      [proprietario.rows[0].id, imovelId],
    );

    const resultado = await gerarExtratosMensaisProprietario(pool, competenciaJulho2026);
    const extrato = resultado.gerados.find((g) => g.pessoaId === proprietario.rows[0].id && g.imovelId === imovelId)!;
    expect(extrato.receitaBruta).toBe(700);
    expect(extrato.totalDeducoes).toBe(0);
  });
});
