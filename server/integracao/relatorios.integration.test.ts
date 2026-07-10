import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buscarDespesasParaRelatorio,
  buscarFaturasParaRelatorio,
  exportarExtratoCobrancasOFX,
  exportarRelatorioDespesasCSV,
  exportarRelatorioFaturasCSV,
} from './relatorios';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('relatórios exportáveis (integração real com Postgres)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let imovelId: string;
  let identificacaoImovel: string;
  let contratoId: string;
  let locatarioId: string;

  const periodoJulho2026 = { inicio: new Date(Date.UTC(2026, 6, 1)), fim: new Date(Date.UTC(2026, 6, 31)) };

  beforeEach(async () => {
    const cidade = await pool.query(`select id from cidades limit 1`);
    identificacaoImovel = `Teste Relatorio ${randomUUID()}`;
    const imovel = await pool.query(
      `insert into imoveis (cidade_id, identificacao, tipo) values ($1, $2, 'kitnet') returning id`,
      [cidade.rows[0].id, identificacaoImovel],
    );
    imovelId = imovel.rows[0].id;

    const locatario = await pool.query(`insert into pessoas (nome) values ('Locatário Teste') returning id`);
    locatarioId = locatario.rows[0].id;

    const contrato = await pool.query(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
       values ($1, 'locacao_padrao', '2026-01-01', 10, 1500) returning id`,
      [imovelId],
    );
    contratoId = contrato.rows[0].id;
    await pool.query(`insert into contrato_partes (contrato_id, pessoa_id, papel) values ($1, $2, 'locatario_principal')`, [
      contratoId,
      locatarioId,
    ]);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function criarFatura(competencia: string, valor: number) {
    const { rows } = await pool.query(
      `insert into faturas (contrato_id, imovel_id, competencia, tipo, valor_bruto, valor_liquido, vencimento)
       values ($1, $2, $3, 'aluguel', $4, $4, $3::date + interval '10 days') returning id`,
      [contratoId, imovelId, competencia, valor],
    );
    return rows[0].id as string;
  }

  describe('relatório de faturas (CSV, regime de competência)', () => {
    it('inclui só faturas dentro do período pedido', async () => {
      await criarFatura('2026-07-01', 1500);
      await criarFatura('2026-08-01', 1500); // fora do período de julho

      const linhas = await buscarFaturasParaRelatorio(pool, periodoJulho2026);
      const doContrato = linhas.filter((l) => l.imovel === identificacaoImovel);
      expect(doContrato).toHaveLength(1); // a de agosto não entra no filtro de período
      expect(doContrato[0].competencia).toBe('2026-07-01');
      expect(doContrato[0].contraparte).toBe('Locatário Teste');
    });

    it('exporta CSV com BOM e cabeçalho em português', async () => {
      await criarFatura('2026-07-01', 1500);
      const csv = await exportarRelatorioFaturasCSV(pool, periodoJulho2026);
      expect(csv.charCodeAt(0)).toBe(0xfeff);
      expect(csv).toContain('Competência;Vencimento;Tipo;Imóvel;Locatário;Valor bruto;Valor líquido;Status');
      expect(csv).toContain('1500,00');
    });
  });

  describe('relatório de despesas (CSV, regime de competência)', () => {
    it('junta folha de prestador e custo de OS num único relatório', async () => {
      const prestador = await pool.query(`insert into pessoas (nome) values ('Zelador Teste') returning id`);
      const prestadorId = prestador.rows[0].id;
      await pool.query(
        `insert into lancamentos_prestador (prestador_id, data, tipo, valor_base, adicional_pct, imovel_id)
         values ($1, '2026-07-05', 'diaria', 120, 0.25, $2)`,
        [prestadorId, imovelId],
      );

      const os = await pool.query(
        `insert into ordens_servico (imovel_id, categoria, descricao, status) values ($1, 'eletricista', 'Troca de fiação', 'concluido') returning id`,
        [imovelId],
      );
      await pool.query(`insert into ordem_servico_custos (ordem_servico_id, descricao, valor) values ($1, $2, $3)`, [
        os.rows[0].id,
        'Disjuntor 40A',
        85.9,
      ]);

      const linhas = await buscarDespesasParaRelatorio(pool, periodoJulho2026);
      expect(linhas.some((l) => l.origem === 'folha_prestador' && l.valorBase === 120)).toBe(true);
      expect(linhas.some((l) => l.origem === 'custo_os' && l.valorBase === 85.9 && l.categoria === 'eletricista')).toBe(
        true,
      );

      const csv = await exportarRelatorioDespesasCSV(pool, periodoJulho2026);
      expect(csv).toContain('Disjuntor 40A');
      expect(csv).toContain('85,90');
    });

    it('não inventa uma fórmula combinando valor_base e adicional_pct — exporta os dois campos separados', async () => {
      const prestador = await pool.query(`insert into pessoas (nome) values ('Zelador Teste 2') returning id`);
      await pool.query(
        `insert into lancamentos_prestador (prestador_id, data, tipo, valor_base, adicional_pct)
         values ($1, '2026-07-06', 'diaria', 100, 0.20)`,
        [prestador.rows[0].id],
      );

      const linhas = await buscarDespesasParaRelatorio(pool, periodoJulho2026);
      const linha = linhas.find((l) => l.valorBase === 100 && l.adicionalPct === 0.2)!;
      expect(linha).toBeDefined();
    });
  });

  describe('extrato de cobranças pagas (OFX, regime de caixa)', () => {
    it('só inclui cobranças com status pago e data_pagamento preenchida', async () => {
      const faturaId = await criarFatura('2026-07-01', 1500);
      const paga = await pool.query(
        `insert into cobrancas_asaas (fatura_id, tipo, valor_cobrado, status, data_pagamento)
         values ($1, 'pix', 1500, 'pago', '2026-07-10') returning id`,
        [faturaId],
      );
      const pendente = await pool.query(
        `insert into cobrancas_asaas (fatura_id, tipo, valor_cobrado, status) values ($1, 'boleto', 1500, 'pendente') returning id`,
        [faturaId],
      );

      const ofx = await exportarExtratoCobrancasOFX(pool, periodoJulho2026);
      // Portfólio inteiro no período pode ter outras cobranças de outros
      // testes rodando na mesma suíte — a asserção verifica a cobrança
      // desta pessoa por FITID (id próprio), não uma contagem global.
      expect(ofx).toContain(`<FITID>${paga.rows[0].id}`);
      expect(ofx).toContain('<TRNTYPE>CREDIT');
      expect(ofx).not.toContain(`<FITID>${pendente.rows[0].id}`); // a pendente não entra
    });
  });
});
