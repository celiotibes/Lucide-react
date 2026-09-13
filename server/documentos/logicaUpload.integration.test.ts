// Teste de integração real contra Postgres — não mockado, mesmo padrão de
// gerarFaturaMensal.integration.test.ts. Só roda quando DATABASE_URL está
// configurada. Cobre especificamente a correção do bug de deduplicação por
// hash global: dois contratos diferentes podem ter um documento
// byte-idêntico (mesmo hash) sem colidir.
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { registrarDocumentoAnexado } from './logicaUpload';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('registrarDocumentoAnexado (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let imovelId: string;

  beforeEach(async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'apartamento') returning id`,
      [cidade.rows[0].id, `Teste Upload Doc ${randomUUID()}`],
    );
    imovelId = imovel.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  async function criarContrato() {
    const { rows } = await pool.query<{ id: string }>(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', current_date, 10, 1000) returning id`,
      [imovelId],
    );
    return rows[0].id;
  }

  it('o mesmo hash em DOIS contratos diferentes cria duas linhas, uma para cada contrato', async () => {
    const contratoA = await criarContrato();
    const contratoB = await criarContrato();
    const hashComum = randomUUID();

    const resultadoA = await registrarDocumentoAnexado(pool, {
      contratoId: contratoA,
      tipo: 'aditivo',
      nomeArquivo: 'modelo-aditivo.pdf',
      mimeType: 'application/pdf',
      tamanhoBytes: 100,
      hashSha256: hashComum,
      storagePath: `x/${contratoA}`,
      enviadoPorPessoaId: null,
    });
    const resultadoB = await registrarDocumentoAnexado(pool, {
      contratoId: contratoB,
      tipo: 'aditivo',
      nomeArquivo: 'modelo-aditivo.pdf',
      mimeType: 'application/pdf',
      tamanhoBytes: 100,
      hashSha256: hashComum,
      storagePath: `x/${contratoB}`,
      enviadoPorPessoaId: null,
    });

    expect(resultadoA.sucesso).toBe(true);
    expect(resultadoB.sucesso).toBe(true);
    expect(resultadoB.jaExistia).toBeFalsy();
    expect(resultadoA.documentoId).not.toBe(resultadoB.documentoId);

    const { rows: docsA } = await pool.query(`select id from documentos_anexados where contrato_id = $1`, [
      contratoA,
    ]);
    const { rows: docsB } = await pool.query(`select id from documentos_anexados where contrato_id = $1`, [
      contratoB,
    ]);
    expect(docsA).toHaveLength(1);
    expect(docsB).toHaveLength(1);
  });

  it('o mesmo hash duas vezes NO MESMO contrato é idempotente (devolve o documento já existente)', async () => {
    const contratoId = await criarContrato();
    const hash = randomUUID();

    const primeiro = await registrarDocumentoAnexado(pool, {
      contratoId,
      tipo: 'contrato_assinado',
      nomeArquivo: 'contrato.pdf',
      mimeType: 'application/pdf',
      tamanhoBytes: 100,
      hashSha256: hash,
      storagePath: `x/${contratoId}`,
      enviadoPorPessoaId: null,
    });
    const segundo = await registrarDocumentoAnexado(pool, {
      contratoId,
      tipo: 'contrato_assinado',
      nomeArquivo: 'contrato.pdf',
      mimeType: 'application/pdf',
      tamanhoBytes: 100,
      hashSha256: hash,
      storagePath: `x/${contratoId}`,
      enviadoPorPessoaId: null,
    });

    expect(segundo.jaExistia).toBe(true);
    expect(segundo.documentoId).toBe(primeiro.documentoId);

    const { rows } = await pool.query(`select id from documentos_anexados where contrato_id = $1`, [contratoId]);
    expect(rows).toHaveLength(1);
  });
});
