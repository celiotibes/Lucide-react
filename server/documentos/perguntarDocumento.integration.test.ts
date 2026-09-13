// Teste de integração real contra Postgres — não mockado, mesmo padrão de
// extrairDadosContrato.integration.test.ts. Só roda quando DATABASE_URL
// está configurada. A chamada à IA (responderPergunta) é mockada.
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const responderPerguntaMock = vi.fn();
vi.mock('../ai-gateway/providers/claudeProvider', () => ({
  responderPergunta: responderPerguntaMock,
}));

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('perguntarSobreDocumento (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let imovelId: string;
  let contratoId: string;

  beforeEach(async () => {
    responderPerguntaMock.mockReset();

    const cidade = await pool.query(`select id from cidades limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'apartamento') returning id`,
      [cidade.rows[0].id, `Teste Pergunta IA ${randomUUID()}`],
    );
    imovelId = imovel.rows[0].id;

    const contrato = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', current_date, 10, 1000) returning id`,
      [imovelId],
    );
    contratoId = contrato.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  async function criarDocumento(textoExtraidoMd: string | null) {
    const { rows } = await pool.query<{ id: string }>(
      `insert into documentos_anexados
        (contrato_id, tipo, nome_arquivo, mime_type, tamanho_bytes, hash_sha256, storage_path, texto_extraido_md, status_extracao)
       values ($1, 'contrato_assinado', 'contrato.pdf', 'application/pdf', 100, $2, 'x', $3, $4)
       returning id`,
      [contratoId, randomUUID(), textoExtraidoMd, textoExtraidoMd ? 'concluida' : 'pendente'],
    );
    return rows[0].id;
  }

  it('grava a pergunta e a resposta quando a IA responde com sucesso', async () => {
    responderPerguntaMock.mockResolvedValue({ sucesso: true, resposta: 'Sim, cláusula 8.2 prevê multa de 3 aluguéis.' });

    const { perguntarSobreDocumento } = await import('./perguntarDocumento');
    const documentoId = await criarDocumento('# Contrato\nCláusula 8.2: multa de 3 aluguéis em caso de rescisão.');

    const resultado = await perguntarSobreDocumento(pool, documentoId, 'Existe multa rescisória?');
    expect(resultado.sucesso).toBe(true);
    expect(resultado.resposta).toContain('multa');

    const { rows } = await pool.query(`select * from perguntas_analise_documento where id = $1`, [
      resultado.perguntaId,
    ]);
    expect(rows[0].status).toBe('respondida');
    expect(rows[0].pergunta).toBe('Existe multa rescisória?');
    expect(rows[0].respondido_em).not.toBeNull();
  });

  it('grava status falhou e erro_ia quando a IA falha', async () => {
    responderPerguntaMock.mockResolvedValue({ sucesso: false, erro: 'stop_reason=refusal' });

    const { perguntarSobreDocumento } = await import('./perguntarDocumento');
    const documentoId = await criarDocumento('# Contrato');

    const resultado = await perguntarSobreDocumento(pool, documentoId, 'Pergunta qualquer');
    expect(resultado.sucesso).toBe(false);

    const { rows } = await pool.query(`select status, erro_ia, respondido_em from perguntas_analise_documento where id = $1`, [
      resultado.perguntaId,
    ]);
    expect(rows[0].status).toBe('falhou');
    expect(rows[0].erro_ia).toBe('stop_reason=refusal');
    expect(rows[0].respondido_em).toBeNull();
  });

  it('devolve falha sem chamar a IA quando o documento não tem texto convertido', async () => {
    const { perguntarSobreDocumento } = await import('./perguntarDocumento');
    const documentoId = await criarDocumento(null);

    const resultado = await perguntarSobreDocumento(pool, documentoId, 'Pergunta qualquer');
    expect(resultado.sucesso).toBe(false);
    expect(responderPerguntaMock).not.toHaveBeenCalled();
  });

  it('devolve falha sem chamar a IA quando a pergunta está vazia', async () => {
    const { perguntarSobreDocumento } = await import('./perguntarDocumento');
    const documentoId = await criarDocumento('# Contrato');

    const resultado = await perguntarSobreDocumento(pool, documentoId, '   ');
    expect(resultado.sucesso).toBe(false);
    expect(responderPerguntaMock).not.toHaveBeenCalled();
  });
});
