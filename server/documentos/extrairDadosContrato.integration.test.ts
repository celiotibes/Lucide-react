// Teste de integração real contra Postgres — não mockado, mesmo padrão de
// server/integracao/gerarFaturaMensal.integration.test.ts. Só roda quando
// DATABASE_URL está configurada. A chamada à IA (extrairDadosEstruturados)
// é mockada — não faz sentido gastar uma chamada real de API num teste de
// integração de banco; a Fase 3 já cobre o adapter da IA isoladamente em
// server/ai-gateway/providers/claudeProvider.test.ts.
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const extrairDadosEstruturadosMock = vi.fn();
vi.mock('../ai-gateway/providers/claudeProvider', () => ({
  extrairDadosEstruturados: extrairDadosEstruturadosMock,
}));

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('solicitarExtracaoContrato (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let imovelId: string;
  let contratoId: string;

  beforeEach(async () => {
    extrairDadosEstruturadosMock.mockReset();

    const cidade = await pool.query(`select id from cidades limit 1`);
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'apartamento') returning id`,
      [cidade.rows[0].id, `Teste Extração IA ${randomUUID()}`],
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

  async function criarDocumento(opts: { textoExtraidoMd: string | null }) {
    const { rows } = await pool.query<{ id: string }>(
      `insert into documentos_anexados
        (contrato_id, tipo, nome_arquivo, mime_type, tamanho_bytes, hash_sha256, storage_path, texto_extraido_md, status_extracao)
       values ($1, 'contrato_assinado', 'contrato.pdf', 'application/pdf', 100, $2, 'x', $3, $4)
       returning id`,
      [contratoId, randomUUID(), opts.textoExtraidoMd, opts.textoExtraidoMd ? 'concluida' : 'pendente'],
    );
    return rows[0].id;
  }

  it('grava uma extração pendente_revisao quando a IA responde com sucesso', async () => {
    extrairDadosEstruturadosMock.mockResolvedValue({
      sucesso: true,
      dados: {
        valorAluguel: 1500,
        valorCaucao: 1500,
        indiceReajuste: 'IGPM',
        dataInicio: '2026-01-01',
        dataFim: '2027-01-01',
        diaVencimento: 5,
        custosObrigatorios: [],
        observacoes: null,
      },
    });

    const { solicitarExtracaoContrato } = await import('./extrairDadosContrato');
    const documentoId = await criarDocumento({ textoExtraidoMd: '# Contrato de Locação\nAluguel: R$ 1.500,00' });

    const resultado = await solicitarExtracaoContrato(pool, documentoId);
    expect(resultado.sucesso).toBe(true);

    const { rows } = await pool.query(
      `select status, dados_extraidos from extracoes_documento_ia where id = $1`,
      [resultado.extracaoId],
    );
    expect(rows[0].status).toBe('pendente_revisao');
    expect(rows[0].dados_extraidos.valorAluguel).toBe(1500);
  });

  it('grava status falhou e preserva erro_ia quando a IA falha', async () => {
    extrairDadosEstruturadosMock.mockResolvedValue({ sucesso: false, erro: 'stop_reason=refusal' });

    const { solicitarExtracaoContrato } = await import('./extrairDadosContrato');
    const documentoId = await criarDocumento({ textoExtraidoMd: '# Contrato' });

    const resultado = await solicitarExtracaoContrato(pool, documentoId);
    expect(resultado.sucesso).toBe(false);

    const { rows } = await pool.query(`select status, erro_ia from extracoes_documento_ia where id = $1`, [
      resultado.extracaoId,
    ]);
    expect(rows[0].status).toBe('falhou');
    expect(rows[0].erro_ia).toBe('stop_reason=refusal');
  });

  it('devolve falha sem chamar a IA quando o documento ainda não tem texto convertido', async () => {
    const { solicitarExtracaoContrato } = await import('./extrairDadosContrato');
    const documentoId = await criarDocumento({ textoExtraidoMd: null });

    const resultado = await solicitarExtracaoContrato(pool, documentoId);
    expect(resultado.sucesso).toBe(false);
    expect(extrairDadosEstruturadosMock).not.toHaveBeenCalled();
  });
});
