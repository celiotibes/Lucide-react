// Teste de integração real contra Postgres — não mockado (ver README deste
// diretório e server/integracao/faturarEnergia.integration.test.ts para o
// mesmo padrão). Só roda quando DATABASE_URL está configurada.
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { gerarFaturaMensal } from './gerarFaturaMensal';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('gerarFaturaMensal (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let imovelId: string;

  beforeEach(async () => {
    // Cada teste sobe seu próprio imóvel/contrato para não interferir com
    // dados de outro teste rodando na mesma base (mesmo cuidado documentado
    // em reguaCobranca.integration.test.ts e no README deste diretório).
    const cidade = await pool.query(`select id from cidades limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'apartamento') returning id`,
      [cidade.rows[0].id, `Teste Fatura Mensal ${randomUUID()}`],
    );
    imovelId = imovel.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  async function criarContrato(opts: {
    dataInicio: string;
    diaVencimento?: number;
    valorAluguel?: number;
    dataFim?: string | null;
  }) {
    const { rows } = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, data_fim, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', $2, $3, $4, $5) returning id`,
      [imovelId, opts.dataInicio, opts.dataFim ?? null, opts.diaVencimento ?? 10, opts.valorAluguel ?? 1000],
    );
    return rows[0].id as string;
  }

  async function adicionarComponente(
    contratoId: string,
    opts: { tipo: string; natureza: 'valor_fixo' | 'percentual_do_aluguel' | 'repassado_variavel'; valorFixo?: number; percentual?: number },
  ) {
    const { rows } = await pool.query(
      `insert into contrato_componentes_mensais (contrato_id, tipo, natureza, valor_fixo, percentual)
       values ($1, $2, $3, $4, $5) returning id`,
      [contratoId, opts.tipo, opts.natureza, opts.valorFixo ?? null, opts.percentual ?? null],
    );
    return rows[0].id as string;
  }

  it('contrato sem componentes, fora do mês de início: fatura pelo valor cheio do aluguel', async () => {
    const contratoId = await criarContrato({ dataInicio: '2026-01-01', valorAluguel: 1500, diaVencimento: 10 });

    const resultado = await gerarFaturaMensal(pool, new Date(Date.UTC(2026, 6, 1))); // julho/2026, contrato já ativo há meses
    const gerada = resultado.geradas.find((g) => g.contratoId === contratoId)!;

    expect(gerada).toBeDefined();
    expect(gerada.eraPrimeiraFatura).toBe(false);
    expect(gerada.valorTotal).toBe(1500);

    const { rows: fatura } = await pool.query(`select tipo, competencia, vencimento, valor_bruto from faturas where id = $1`, [
      gerada.faturaId,
    ]);
    expect(fatura[0].tipo).toBe('aluguel');
    expect(new Date(fatura[0].vencimento).toISOString().slice(0, 10)).toBe('2026-08-10'); // vencimento no mês seguinte à competência

    const { rows: itens } = await pool.query(`select descricao, valor from fatura_itens where fatura_id = $1`, [gerada.faturaId]);
    expect(itens).toEqual([{ descricao: 'Aluguel', valor: '1500.00' }]);
  });

  it('mês de início do contrato: aplica pró-rata (reproduz o contrato real da Kitnet 16, João Pottker)', async () => {
    // início 08/07/2026, R$2.490,00/mês, vencimento dia 10 -> 24 dias
    // cobertos, R$1.992,00 (docs/10-auditoria-contrato-real.md).
    const contratoId = await criarContrato({ dataInicio: '2026-07-08', valorAluguel: 2490, diaVencimento: 10 });

    const resultado = await gerarFaturaMensal(pool, new Date(Date.UTC(2026, 6, 1)));
    const gerada = resultado.geradas.find((g) => g.contratoId === contratoId)!;

    expect(gerada.eraPrimeiraFatura).toBe(true);
    expect(gerada.valorTotal).toBe(1992);

    const { rows: fatura } = await pool.query(`select vencimento from faturas where id = $1`, [gerada.faturaId]);
    expect(new Date(fatura[0].vencimento).toISOString().slice(0, 10)).toBe('2026-08-10');

    const { rows: itens } = await pool.query(`select descricao, valor from fatura_itens where fatura_id = $1`, [gerada.faturaId]);
    expect(itens).toHaveLength(1);
    expect(itens[0].descricao).toContain('pró-rata');
    expect(Number(itens[0].valor)).toBe(1992);
  });

  it('componente valor_fixo soma ao aluguel (reproduz Apto 503: aluguel R$1.300 + comodato R$350 fixo = R$1.650)', async () => {
    const contratoId = await criarContrato({ dataInicio: '2026-01-01', valorAluguel: 1300, diaVencimento: 5 });
    await adicionarComponente(contratoId, { tipo: 'comodato_moveis', natureza: 'valor_fixo', valorFixo: 350 });

    const resultado = await gerarFaturaMensal(pool, new Date(Date.UTC(2026, 6, 1)));
    const gerada = resultado.geradas.find((g) => g.contratoId === contratoId)!;

    expect(gerada.valorTotal).toBe(1650);
    const { rows: itens } = await pool.query(`select descricao, valor from fatura_itens where fatura_id = $1 order by descricao`, [
      gerada.faturaId,
    ]);
    expect(itens.map((i) => Number(i.valor)).sort((a, b) => a - b)).toEqual([350, 1300]);
  });

  it('componente percentual_do_aluguel NÃO soma ao total (reproduz Life Space: comodato 15% já incluído no aluguel)', async () => {
    const contratoId = await criarContrato({ dataInicio: '2026-01-01', valorAluguel: 1000, diaVencimento: 5 });
    await adicionarComponente(contratoId, { tipo: 'comodato_moveis', natureza: 'percentual_do_aluguel', percentual: 0.15 });

    const resultado = await gerarFaturaMensal(pool, new Date(Date.UTC(2026, 6, 1)));
    const gerada = resultado.geradas.find((g) => g.contratoId === contratoId)!;

    expect(gerada.valorTotal).toBe(1000); // total inalterado, o percentual só decompõe o aluguel-base
    const { rows: itens } = await pool.query(`select descricao, valor from fatura_itens where fatura_id = $1`, [gerada.faturaId]);
    expect(itens.map((i) => Number(i.valor)).sort((a, b) => a - b)).toEqual([150, 850]);
  });

  it('componente repassado_variavel soma ao total quando o valor do mês está lançado', async () => {
    const contratoId = await criarContrato({ dataInicio: '2026-01-01', valorAluguel: 1000, diaVencimento: 5 });
    const componenteId = await adicionarComponente(contratoId, { tipo: 'iptu_repassado', natureza: 'repassado_variavel' });
    await pool.query(
      `insert into contrato_componente_valores_mensais (componente_id, competencia, valor) values ($1, '2026-07-01', 83.33)`,
      [componenteId],
    );

    const resultado = await gerarFaturaMensal(pool, new Date(Date.UTC(2026, 6, 1)));
    const gerada = resultado.geradas.find((g) => g.contratoId === contratoId)!;

    expect(gerada.valorTotal).toBe(1083.33);
  });

  it('componente repassado_variavel SEM valor do mês lançado: pula o contrato inteiro, não fatura sem o dado', async () => {
    const contratoId = await criarContrato({ dataInicio: '2026-01-01', valorAluguel: 1000, diaVencimento: 5 });
    await adicionarComponente(contratoId, { tipo: 'condominio_repassado', natureza: 'repassado_variavel' });

    const resultado = await gerarFaturaMensal(pool, new Date(Date.UTC(2026, 6, 1)));

    expect(resultado.geradas.find((g) => g.contratoId === contratoId)).toBeUndefined();
    const pulada = resultado.puladas.find((p) => p.contratoId === contratoId);
    expect(pulada).toBeDefined();
    expect(pulada!.motivo).toBe('componente_repassado_sem_valor_do_mes');
    expect(pulada!.componentesFaltantes).toEqual(['condominio_repassado']);
  });

  it('idempotência: rodar duas vezes para o mesmo mês não duplica a fatura', async () => {
    const contratoId = await criarContrato({ dataInicio: '2026-01-01', valorAluguel: 1000 });

    const primeira = await gerarFaturaMensal(pool, new Date(Date.UTC(2026, 6, 1)));
    expect(primeira.geradas.find((g) => g.contratoId === contratoId)).toBeDefined();

    const segunda = await gerarFaturaMensal(pool, new Date(Date.UTC(2026, 6, 1)));
    expect(segunda.geradas.find((g) => g.contratoId === contratoId)).toBeUndefined();

    const { rows } = await pool.query(`select count(*)::int as total from faturas where contrato_id = $1 and tipo = 'aluguel'`, [
      contratoId,
    ]);
    expect(rows[0].total).toBe(1);
  });

  it('contrato ainda não iniciado no mês de competência: não gera fatura', async () => {
    const contratoId = await criarContrato({ dataInicio: '2026-08-15' });

    const resultado = await gerarFaturaMensal(pool, new Date(Date.UTC(2026, 6, 1))); // julho, contrato só começa em agosto
    expect(resultado.geradas.find((g) => g.contratoId === contratoId)).toBeUndefined();
    expect(resultado.puladas.find((p) => p.contratoId === contratoId)).toBeUndefined();
  });

  it('contrato já encerrado antes do mês de competência: não gera fatura', async () => {
    const contratoId = await criarContrato({ dataInicio: '2025-01-01', dataFim: '2026-05-31' });

    const resultado = await gerarFaturaMensal(pool, new Date(Date.UTC(2026, 6, 1))); // julho, contrato encerrou em maio
    expect(resultado.geradas.find((g) => g.contratoId === contratoId)).toBeUndefined();
  });
});
