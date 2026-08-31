// Teste de integração real contra Postgres — não mockado, mesmo padrão de
// gerarFaturaMensal.integration.test.ts. Só roda quando DATABASE_URL está
// configurada. Notificador degrada graciosamente sem credenciais de
// email/WhatsApp configuradas (constrói o provedor, falha, loga um warn e
// segue) — não precisa mock para o teste rodar, só não confirma envio real.
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { processarReequilibrioTrienal } from './processarReequilibrioTrienal';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('processarReequilibrioTrienal (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let imovelId: string;

  beforeEach(async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'apartamento') returning id`,
      [cidade.rows[0].id, `Teste Reequilíbrio ${randomUUID()}`],
    );
    imovelId = imovel.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  async function criarContrato(dataInicio: string) {
    const { rows } = await pool.query<{ id: string }>(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel, status)
       values ($1, 'locacao_padrao', $2, 10, 1500, 'ativo') returning id`,
      [imovelId, dataInicio],
    );
    return rows[0].id;
  }

  it('não gera nada quando o contrato está fora da janela de 90 dias', async () => {
    const contratoId = await criarContrato('2026-01-01'); // marco em 2029-01-01, bem longe
    const resultado = await processarReequilibrioTrienal(pool, new Date('2026-01-10T00:00:00Z'));
    expect(resultado).toHaveLength(0);

    const { rows } = await pool.query(`select * from reequilibrios_contratuais where contrato_id = $1`, [
      contratoId,
    ]);
    expect(rows).toHaveLength(0);
  });

  it('cria a linha e marca planejamento enviado dentro da janela de 90 dias', async () => {
    const contratoId = await criarContrato('2023-04-19'); // marco em 2026-04-19, referência 2026-01-19 está a 90 dias
    const resultado = await processarReequilibrioTrienal(pool, new Date('2026-01-19T00:00:00Z'));

    expect(resultado).toHaveLength(1);
    expect(resultado[0].planejamentoEnviado).toBe(true);
    expect(resultado[0].oficialEnviado).toBe(false);

    const { rows } = await pool.query(`select * from reequilibrios_contratuais where contrato_id = $1`, [
      contratoId,
    ]);
    expect(rows[0].notificacao_planejamento_enviada_em).not.toBeNull();
    expect(rows[0].notificacao_oficial_enviada_em).toBeNull();
  });

  it('é idempotente: rodar duas vezes no mesmo dia não reenvia planejamento', async () => {
    await criarContrato('2023-04-19');
    await processarReequilibrioTrienal(pool, new Date('2026-01-19T00:00:00Z'));
    const segunda = await processarReequilibrioTrienal(pool, new Date('2026-01-19T00:00:00Z'));

    expect(segunda[0].planejamentoEnviado).toBe(false);
  });

  it('marca oficial enviado dentro da janela de 30 dias', async () => {
    const contratoId = await criarContrato('2023-04-19'); // marco 2026-04-19
    const resultado = await processarReequilibrioTrienal(pool, new Date('2026-03-20T00:00:00Z'));

    expect(resultado[0].oficialEnviado).toBe(true);

    const { rows } = await pool.query(`select * from reequilibrios_contratuais where contrato_id = $1`, [
      contratoId,
    ]);
    expect(rows[0].notificacao_oficial_enviada_em).not.toBeNull();
  });

  it('reequilíbrio descartado: nunca envia a notificação oficial, mesmo dentro da janela de 30 dias', async () => {
    const contratoId = await criarContrato('2023-04-19'); // marco 2026-04-19

    // Primeiro run: dentro da janela de planejamento (90d), cria a linha.
    await processarReequilibrioTrienal(pool, new Date('2026-01-19T00:00:00Z'));

    // Operador descarta manualmente (mesma ação de app/contratos/[id]/reequilibrio/actions.ts).
    await pool.query(`update reequilibrios_contratuais set status = 'descartado' where contrato_id = $1`, [
      contratoId,
    ]);

    // Segundo run: já dentro da janela de 30 dias — não deve notificar mais nada.
    const resultado = await processarReequilibrioTrienal(pool, new Date('2026-03-20T00:00:00Z'));
    expect(resultado[0].planejamentoEnviado).toBe(false);
    expect(resultado[0].oficialEnviado).toBe(false);

    const { rows } = await pool.query(`select * from reequilibrios_contratuais where contrato_id = $1`, [
      contratoId,
    ]);
    expect(rows[0].notificacao_oficial_enviada_em).toBeNull();
  });
});
