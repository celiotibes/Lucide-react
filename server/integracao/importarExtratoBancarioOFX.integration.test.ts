import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { gerarOFX, type TransacaoOFX } from '../relatorios/ofx';
import { importarExtratoBancarioOFX } from './importarExtratoBancarioOFX';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('importarExtratoBancarioOFX (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let contaId: string;

  beforeEach(async () => {
    const { rows } = await pool.query(
      `insert into contas_bancarias (instituicao, tipo) values ($1, 'corrente') returning id`,
      [`Banco Teste ${randomUUID()}`],
    );
    contaId = rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  function montarOFX(transacoes: TransacaoOFX[]): string {
    return gerarOFX(transacoes, {
      contaId: 'teste',
      dataInicio: new Date(Date.UTC(2026, 6, 1)),
      dataFim: new Date(Date.UTC(2026, 6, 31)),
    });
  }

  it('importa as transações do OFX com status sempre "sugerido", nunca "aprovado"', async () => {
    const ofx = montarOFX([
      { id: `fit_${randomUUID()}`, data: new Date(Date.UTC(2026, 6, 10)), valor: 1500, descricao: 'Recebimento aluguel' },
      { id: `fit_${randomUUID()}`, data: new Date(Date.UTC(2026, 6, 12)), valor: -200, descricao: 'Pagamento zelador' },
    ]);

    const resultado = await importarExtratoBancarioOFX(pool, contaId, ofx);
    expect(resultado.importadas).toBe(2);
    expect(resultado.jaExistentes).toBe(0);

    const { rows } = await pool.query(
      `select status, origem, valor from transacoes_bancarias where conta_id = $1 order by valor desc`,
      [contaId],
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === 'sugerido')).toBe(true);
    expect(rows.every((r) => r.origem === 'ofx')).toBe(true);
    expect(Number(rows[0].valor)).toBe(1500);
    expect(Number(rows[1].valor)).toBe(-200);
  });

  it('idempotência: reimportar o mesmo OFX (mesmo FITID) não duplica', async () => {
    const ofx = montarOFX([{ id: `fit_${randomUUID()}`, data: new Date(Date.UTC(2026, 6, 10)), valor: 500, descricao: 'x' }]);

    const primeira = await importarExtratoBancarioOFX(pool, contaId, ofx);
    expect(primeira.importadas).toBe(1);

    const segunda = await importarExtratoBancarioOFX(pool, contaId, ofx);
    expect(segunda.importadas).toBe(0);
    expect(segunda.jaExistentes).toBe(1);

    const { rows } = await pool.query(`select count(*)::int as total from transacoes_bancarias where conta_id = $1`, [
      contaId,
    ]);
    expect(rows[0].total).toBe(1);
  });

  it('mesmo FITID em contas diferentes não colide (índice único é por conta)', async () => {
    const fitId = `fit_${randomUUID()}`;
    const ofx = montarOFX([{ id: fitId, data: new Date(Date.UTC(2026, 6, 10)), valor: 300, descricao: 'x' }]);

    const outraConta = await pool.query(`insert into contas_bancarias (instituicao, tipo) values ($1, 'corrente') returning id`, [
      `Outro Banco ${randomUUID()}`,
    ]);

    const primeira = await importarExtratoBancarioOFX(pool, contaId, ofx);
    const segunda = await importarExtratoBancarioOFX(pool, outraConta.rows[0].id, ofx);

    expect(primeira.importadas).toBe(1);
    expect(segunda.importadas).toBe(1); // mesma referência externa, conta diferente — não é duplicata
  });

  it('OFX sem transações: não importa nada, não lança erro', async () => {
    const ofx = montarOFX([]);
    const resultado = await importarExtratoBancarioOFX(pool, contaId, ofx);
    expect(resultado.importadas).toBe(0);
    expect(resultado.jaExistentes).toBe(0);
  });

  it('OFX malformado (transação sem FITID): lança erro antes de gravar qualquer coisa', async () => {
    const ofxQuebrado = `<STMTTRN>\n<TRNTYPE>CREDIT\n<DTPOSTED>20260710\n<TRNAMT>10.00\n<MEMO>sem fitid\n</STMTTRN>`;
    await expect(importarExtratoBancarioOFX(pool, contaId, ofxQuebrado)).rejects.toThrow();

    const { rows } = await pool.query(`select count(*)::int as total from transacoes_bancarias where conta_id = $1`, [
      contaId,
    ]);
    expect(rows[0].total).toBe(0);
  });
});
