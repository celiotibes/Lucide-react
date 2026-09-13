// Teste de integração real contra Postgres — não mockado, mesmo padrão de
// decidirReajuste.integration.test.ts. Só roda quando DATABASE_URL está
// configurada.
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { decidirCompatibilidadeColiving } from './decidirCompatibilidadeColiving';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('decidirCompatibilidadeColiving (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let compatibilidadeId: string;

  beforeEach(async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo, permite_coliving) values ($1, $2, 'apartamento', true) returning id`,
      [cidade.rows[0].id, `Teste Decidir Compat ${randomUUID()}`],
    );
    const imovelId = imovel.rows[0].id;

    const leadA = await pool.query(`insert into leads (nome, status) values ('Candidato A', 'novo') returning id`);
    const leadB = await pool.query(`insert into leads (nome, status) values ('Candidato B', 'novo') returning id`);

    const perfilA = await pool.query(
      `insert into perfis_convivencia (lead_id, v1_limpeza, v2_ruido, v3_rotina, v4_fumo, v5_pets, v6_dieta, v7_conflito, tem_pet, quadro_alergico)
       values ($1, 2, 2, 2, 2, 2, 1, 2, false, 'nenhuma') returning id`,
      [leadA.rows[0].id],
    );
    const perfilB = await pool.query(
      `insert into perfis_convivencia (lead_id, v1_limpeza, v2_ruido, v3_rotina, v4_fumo, v5_pets, v6_dieta, v7_conflito, tem_pet, quadro_alergico)
       values ($1, 1, 2, 2, 2, 2, 1, 2, false, 'nenhuma') returning id`,
      [leadB.rows[0].id],
    );
    const [perfilAId, perfilBId] = [perfilA.rows[0].id, perfilB.rows[0].id].sort();

    const compat = await pool.query(
      `insert into compatibilidades_coliving (imovel_id, perfil_a_id, perfil_b_id, score_geral, pontos_atrito, alertas_criticos, status)
       values ($1, $2, $3, 90, '[]', '[]', 'calculado') returning id`,
      [imovelId, perfilAId, perfilBId],
    );
    compatibilidadeId = compat.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('aprovar com parecer: grava status, parecer e decidido_em', async () => {
    const resultado = await decidirCompatibilidadeColiving(pool, compatibilidadeId, 'aprovado', 'Perfis alinhados, sem pontos críticos.');
    expect(resultado.sucesso).toBe(true);

    const { rows } = await pool.query(`select status, parecer, decidido_em from compatibilidades_coliving where id = $1`, [compatibilidadeId]);
    expect(rows[0].status).toBe('aprovado');
    expect(rows[0].parecer).toBe('Perfis alinhados, sem pontos críticos.');
    expect(rows[0].decidido_em).not.toBeNull();
  });

  it('rejeita decisão sem parecer', async () => {
    const resultado = await decidirCompatibilidadeColiving(pool, compatibilidadeId, 'reprovado', '   ');
    expect(resultado.sucesso).toBe(false);

    const { rows } = await pool.query(`select status from compatibilidades_coliving where id = $1`, [compatibilidadeId]);
    expect(rows[0].status).toBe('calculado');
  });

  it('decidir uma comparação já revisada devolve falha', async () => {
    await decidirCompatibilidadeColiving(pool, compatibilidadeId, 'entrevista_requerida', 'Agendar conversa por divergência de limpeza.');

    const resultado = await decidirCompatibilidadeColiving(pool, compatibilidadeId, 'aprovado', 'Segunda tentativa.');
    expect(resultado.sucesso).toBe(false);
  });
});
