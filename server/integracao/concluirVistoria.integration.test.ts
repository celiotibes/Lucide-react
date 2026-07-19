// Teste de integração real contra Postgres — não mockado, mesmo padrão de
// gerarFaturaMensal.integration.test.ts. Só roda quando DATABASE_URL está
// configurada.
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { concluirVistoria } from './concluirVistoria';
import { checklistVazio, type ChecklistVistoria, type ItemChecklistVistoria } from '../vistorias/checklist';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('concluirVistoria (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let imovelId: string;
  let contratoId: string;

  beforeEach(async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'apartamento') returning id`,
      [cidade.rows[0].id, `Teste Vistoria ${randomUUID()}`],
    );
    imovelId = imovel.rows[0].id;

    const contrato = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel, status)
       values ($1, 'locacao_padrao', current_date, 10, 1500, 'ativo') returning id`,
      [imovelId],
    );
    contratoId = contrato.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  async function criarVistoria(tipo: string, checklist: ChecklistVistoria) {
    const { rows } = await pool.query<{ id: string }>(
      `insert into vistorias (contrato_id, imovel_id, tipo, checklist_json, status)
       values ($1, $2, $3, $4, 'em_andamento') returning id`,
      [contratoId, imovelId, tipo, JSON.stringify(checklist)],
    );
    return rows[0].id;
  }

  function checklistComDano(item: string, custo: number): ChecklistVistoria {
    const checklist = checklistVazio();
    checklist.itens = checklist.itens.map((i): ItemChecklistVistoria =>
      i.item === item ? { ...i, situacao: 'dano', custoReparo: custo } : i,
    );
    return checklist;
  }

  it('vistoria de entrada: conclui sem calcular retenção de caução', async () => {
    const vistoriaId = await criarVistoria('entrada', checklistVazio());
    const resultado = await concluirVistoria(pool, vistoriaId, contratoId);

    expect(resultado.sucesso).toBe(true);
    expect(resultado.confissaoDividaId).toBeUndefined();

    const { rows } = await pool.query(`select status, checklist_json from vistorias where id = $1`, [vistoriaId]);
    expect(rows[0].status).toBe('concluida');
    expect(rows[0].checklist_json.retencaoCaucao).toBeUndefined();
  });

  it('vistoria de saída sem danos: devolve o caução inteiro, sem confissão de dívida', async () => {
    await pool.query(
      `insert into garantias (contrato_id, tipo, valor, status) values ($1, 'caucao', 1500, 'ativa')`,
      [contratoId],
    );
    const vistoriaId = await criarVistoria('saida', checklistVazio());

    const resultado = await concluirVistoria(pool, vistoriaId, contratoId);
    expect(resultado.sucesso).toBe(true);
    expect(resultado.confissaoDividaId).toBeUndefined();

    const { rows } = await pool.query(`select checklist_json from vistorias where id = $1`, [vistoriaId]);
    expect(rows[0].checklist_json.retencaoCaucao.valorDevolvido).toBe(1500);
  });

  it('vistoria de saída com danos maiores que o caução: abre confissão de dívida com o saldo devedor', async () => {
    await pool.query(
      `insert into garantias (contrato_id, tipo, valor, status) values ($1, 'caucao', 500, 'ativa')`,
      [contratoId],
    );
    const vistoriaId = await criarVistoria('saida', checklistComDano('pintura', 900));

    const resultado = await concluirVistoria(pool, vistoriaId, contratoId);
    expect(resultado.sucesso).toBe(true);
    expect(resultado.confissaoDividaId).toBeDefined();

    const { rows } = await pool.query(`select * from confissoes_divida where id = $1`, [resultado.confissaoDividaId]);
    expect(Number(rows[0].valor_principal)).toBe(400);
    expect(rows[0].status).toBe('pendente');
  });

  it('devolve falha ao tentar concluir uma vistoria já concluída', async () => {
    const vistoriaId = await criarVistoria('entrada', checklistVazio());
    await concluirVistoria(pool, vistoriaId, contratoId);

    const segunda = await concluirVistoria(pool, vistoriaId, contratoId);
    expect(segunda.sucesso).toBe(false);
  });
});
