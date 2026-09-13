// Teste de integração real contra Postgres — não mockado, mesmo padrão de
// processarRenovacaoContratual.integration.test.ts. Só roda quando
// DATABASE_URL está configurada.
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { processarReajusteAnual } from './processarReajusteAnual';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('processarReajusteAnual (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let imovelId: string;

  beforeEach(async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'apartamento') returning id`,
      [cidade.rows[0].id, `Teste Reajuste Anual ${randomUUID()}`],
    );
    imovelId = imovel.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  async function criarContrato(opts: {
    dataInicio: string;
    dataUltimoReajuste?: string | null;
    dataFim?: string | null;
    indiceReajuste?: string | null;
  }) {
    const { rows } = await pool.query<{ id: string }>(
      `insert into contratos (imovel_id, tipo, data_inicio, data_ultimo_reajuste, data_fim, dia_vencimento, valor_aluguel, indice_reajuste, status)
       values ($1, 'locacao_padrao', $2, $3, $4, 10, 1000, $5, 'ativo') returning id`,
      [imovelId, opts.dataInicio, opts.dataUltimoReajuste ?? null, opts.dataFim ?? null, opts.indiceReajuste ?? null],
    );
    return rows[0].id;
  }

  it('não gera nada fora da janela de 30 dias do próximo aniversário', async () => {
    await criarContrato({ dataInicio: '2025-01-01' }); // próximo reajuste 2026-01-01
    const resultado = await processarReajusteAnual(pool, new Date('2025-06-01T00:00:00Z'));
    expect(resultado).toHaveLength(0);
  });

  it('gera proposta dentro de 30 dias do aniversário quando há índice', async () => {
    await pool.query(
      `insert into indices_economicos (indice, competencia, percentual_acumulado_12m) values ('IPCA', '2026-05-01', 0.04)
       on conflict (indice, competencia) do nothing`,
    );
    const contratoId = await criarContrato({ dataInicio: '2025-07-10', indiceReajuste: 'IPCA' });

    const resultado = await processarReajusteAnual(pool, new Date('2026-06-15T00:00:00Z'));
    expect(resultado[0].notificacaoEnviada).toBe(true);
    expect(resultado[0].reajustePropostoId).toBeDefined();

    const { rows } = await pool.query(`select * from reajustes_contrato where contrato_id = $1`, [contratoId]);
    expect(rows).toHaveLength(1);
  });

  it('não processa quando data_fim está a menos de 60 dias (deixa para a renovação cuidar)', async () => {
    await criarContrato({ dataInicio: '2025-07-10', dataFim: '2026-07-01' });
    // aniversário anual seria 2026-07-10, mas data_fim (2026-07-01) está bem mais perto
    const resultado = await processarReajusteAnual(pool, new Date('2026-06-20T00:00:00Z'));
    expect(resultado).toHaveLength(0);
  });

  it('é idempotente: rodar duas vezes não duplica proposta', async () => {
    await pool.query(
      `insert into indices_economicos (indice, competencia, percentual_acumulado_12m) values ('IPCA', '2026-05-01', 0.04)
       on conflict (indice, competencia) do nothing`,
    );
    const contratoId = await criarContrato({ dataInicio: '2025-07-10', indiceReajuste: 'IPCA' });

    await processarReajusteAnual(pool, new Date('2026-06-15T00:00:00Z'));
    await processarReajusteAnual(pool, new Date('2026-06-16T00:00:00Z'));

    const { rows } = await pool.query(`select * from reajustes_contrato where contrato_id = $1`, [contratoId]);
    expect(rows).toHaveLength(1);
  });
});
