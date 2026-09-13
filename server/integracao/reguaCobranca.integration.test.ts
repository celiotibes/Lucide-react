// Teste de integração real contra Postgres — não mockado. Só roda quando
// DATABASE_URL está configurada (ver README deste diretório); em CI ou
// numa máquina sem Postgres disponível, a suíte inteira é pulada, não
// falha. `npm test` (unitário, sempre roda) não inclui este arquivo —
// ver o script `test:integration` no package.json.
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { processarReguaCobranca } from './reguaCobranca';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('processarReguaCobranca (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let imovelId: string;
  let contratoId: string;

  beforeEach(async () => {
    // Cada teste sobe seu próprio imóvel/contrato para não interferir com
    // dados de outro teste rodando na mesma base.
    const cidade = await pool.query(`select id from cidades limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'kitnet') returning id`,
      [cidade.rows[0].id, `Teste ${randomUUID()}`],
    );
    imovelId = imovel.rows[0].id;

    const contrato = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', '2025-01-01', 10, 1000) returning id`,
      [imovelId],
    );
    contratoId = contrato.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  async function criarFaturaVencidaHaDias(dias: number, opts: { permiteAcordo?: boolean } = {}) {
    const vencimento = new Date();
    vencimento.setUTCDate(vencimento.getUTCDate() - dias);
    const { rows } = await pool.query(
      `insert into faturas (contrato_id, imovel_id, competencia, tipo, valor_bruto, valor_liquido, vencimento, permite_acordo)
       values ($1, $2, '2026-01-01', 'aluguel', 1000, 1000, $3, $4)
       returning id`,
      [contratoId, imovelId, vencimento.toISOString().slice(0, 10), opts.permiteAcordo ?? false],
    );
    return rows[0].id as string;
  }

  it('fatura vencida há 3 dias: fica atrasada, mas nenhum marco da régua é registrado ainda', async () => {
    const faturaId = await criarFaturaVencidaHaDias(3);
    const resultados = await processarReguaCobranca(pool);
    const resultado = resultados.find((r) => r.faturaId === faturaId)!;

    expect(resultado.diasAtraso).toBe(3);
    expect(resultado.eventosRegistrados).toEqual([]);

    const { rows } = await pool.query(`select status from faturas where id = $1`, [faturaId]);
    expect(rows[0].status).toBe('atrasada');
  });

  it('fatura vencida há 31 dias: registra D5, D15 e D30 numa única passada', async () => {
    const faturaId = await criarFaturaVencidaHaDias(31);
    const resultados = await processarReguaCobranca(pool);
    const resultado = resultados.find((r) => r.faturaId === faturaId)!;

    expect(resultado.eventosRegistrados.sort()).toEqual(['D15', 'D30', 'D5']);
    expect(resultado.valorAtualizado).toBeGreaterThan(1000); // multa + juros + honorários aplicados

    const { rows } = await pool.query(`select evento from regua_cobranca_eventos where fatura_id = $1`, [faturaId]);
    expect(rows.map((r) => r.evento).sort()).toEqual(['D15', 'D30', 'D5']);
  });

  it('idempotência: rodar duas vezes no mesmo dia não duplica eventos nem falha', async () => {
    const faturaId = await criarFaturaVencidaHaDias(10);

    await processarReguaCobranca(pool);
    await processarReguaCobranca(pool); // segunda passada — simula reinício de cron

    const { rows } = await pool.query(`select evento from regua_cobranca_eventos where fatura_id = $1`, [faturaId]);
    expect(rows).toHaveLength(1); // só D5, e só uma vez
    expect(rows[0].evento).toBe('D5');
  });

  it('fatura com permite_acordo=true: fica atrasada mas sem multa/juros e sem eventos de régua', async () => {
    const faturaId = await criarFaturaVencidaHaDias(40, { permiteAcordo: true });
    const resultados = await processarReguaCobranca(pool);
    const resultado = resultados.find((r) => r.faturaId === faturaId)!;

    expect(resultado.valorAtualizado).toBe(1000); // sem acréscimo
    expect(resultado.eventosRegistrados).toEqual([]);

    const { rows } = await pool.query(`select count(*)::int as total from regua_cobranca_eventos where fatura_id = $1`, [
      faturaId,
    ]);
    expect(rows[0].total).toBe(0);
  });

  it('sem política própria cadastrada, usa a política genérica de fallback (sinalizado no resultado)', async () => {
    const faturaId = await criarFaturaVencidaHaDias(3);
    const resultados = await processarReguaCobranca(pool);
    const resultado = resultados.find((r) => r.faturaId === faturaId)!;
    expect(resultado.politicaGenericaUsada).toBe(true);
  });

  it('reproduz a régua de cobrança do contrato real (Kitnet 16, João Pottker): multa em degraus, juros de 1% a.m.', async () => {
    // Cadastra a política de cobrança real deste contrato específico —
    // diferente da genérica (multa 2%/10% em degraus, juros 1% a.m., não
    // 2%; honorários só se necessitar ação judicial).
    await pool.query(
      `insert into contrato_politica_cobranca
         (contrato_id, multa_ate_5_dias_pct, dias_limite_multa_reduzida, multa_apos_5_dias_pct, juros_pct_am, honorarios_somente_se_judicial)
       values ($1, 0.02, 5, 0.10, 0.01, true)`,
      [contratoId],
    );

    const faturaId = await criarFaturaVencidaHaDias(3); // dentro do degrau de 5 dias -> multa 2%
    const resultados = await processarReguaCobranca(pool);
    const resultado = resultados.find((r) => r.faturaId === faturaId)!;

    expect(resultado.politicaGenericaUsada).toBe(false);
    // valor bruto da fatura é 1000 nesta suíte; 3 dias de atraso, multa 2%
    // (ainda no degrau inicial) + juros de 1% a.m. pro rata die (3/30) —
    // sem honorários, porque não é gatilho automático nesta política.
    const jurosEsperado = 1000 * 0.01 * (3 / 30);
    const multaEsperada = 1000 * 0.02;
    expect(resultado.valorAtualizado).toBeCloseTo(1000 + jurosEsperado + multaEsperada, 2);
  });

  it('fatura ainda não vencida: não é tocada pelo job', async () => {
    const vencimentoFuturo = new Date();
    vencimentoFuturo.setUTCDate(vencimentoFuturo.getUTCDate() + 5);
    const { rows: faturaRows } = await pool.query(
      `insert into faturas (contrato_id, imovel_id, competencia, tipo, valor_bruto, valor_liquido, vencimento)
       values ($1, $2, '2026-01-01', 'aluguel', 1000, 1000, $3) returning id`,
      [contratoId, imovelId, vencimentoFuturo.toISOString().slice(0, 10)],
    );
    const faturaId = faturaRows[0].id;

    const resultados = await processarReguaCobranca(pool);
    expect(resultados.find((r) => r.faturaId === faturaId)).toBeUndefined();

    const { rows } = await pool.query(`select status from faturas where id = $1`, [faturaId]);
    expect(rows[0].status).toBe('aberta');
  });
});
