// E2E tests para pipeline de cobrança completo
// Validar: fatura → emissão → webhook → distribuição → ledger

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { v4 as uuid } from 'uuid';
import { obterPool } from '@/server/integracao/db';
import { gerarFaturaMensal } from '@/server/integracao/gerarFaturaMensal';
import { emitirCobrancasPendentes } from '@/server/integracao/emitirCobrancas';
import { gerarMultaJurosFaturas } from '@/server/integracao/gerarMultaJurosFaturas';
import { distribuirRecebimento } from '@/server/integracao/distribuirRecebimento';

describe('Payment Pipeline E2E Tests', () => {
  let pool: Pool;
  let testContratoId: string;
  let testProprietarioId: string;

  beforeAll(async () => {
    pool = obterPool();

    // Criar dados de teste: pessoa, imóvel, contrato
    const { rows: pessoas } = await pool.query(
      `insert into pessoas (nome, email, telefone, tipo_documento, documento)
       values ($1, $2, $3, $4, $5)
       returning id`,
      ['Teste Inquilino', 'teste@example.com', '11987654321', 'cpf', '12345678901']
    );
    const testLocatarioId = pessoas[0].id;

    const { rows: proprietarios } = await pool.query(
      `insert into pessoas (nome, email, telefone, tipo_documento, documento)
       values ($1, $2, $3, $4, $5)
       returning id`,
      ['Teste Proprietário', 'owner@example.com', '11987654322', 'cpf', '98765432101']
    );
    testProprietarioId = proprietarios[0].id;

    const { rows: imoveis } = await pool.query(
      `insert into imoveis (proprietario_id, identificacao, endereco, tipo, area_construida, area_total)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [testProprietarioId, 'TEST-APT-001', 'Rua Teste, 123', 'apartamento', 50, 60]
    );
    const testImovelId = imoveis[0].id;

    // Criar contrato com valor mensal de 1000
    const { rows: contratos } = await pool.query(
      `insert into contratos (proprietario_id, imovel_id, data_inicio, tipo, status)
       values ($1, $2, $3, 'locacao_padrao', 'ativo')
       returning id`,
      [testProprietarioId, testImovelId, new Date().toISOString().split('T')[0]]
    );
    testContratoId = contratos[0].id;

    // Vincular locatário ao contrato
    await pool.query(
      `insert into contrato_partes (contrato_id, pessoa_id, papel)
       values ($1, $2, 'locatario_principal')`,
      [testContratoId, testLocatarioId]
    );

    // Criar componente de valor mensal (aluguel)
    const { rows: componentes } = await pool.query(
      `insert into contrato_componentes (contrato_id, nome, tipo, valor_mensal, mes_referencia, tipo_custo)
       values ($1, $2, 'valor_fixo', $3, 1, 'aluguel')
       returning id`,
      [testContratoId, 'Aluguel', 1000]
    );
  });

  afterAll(async () => {
    // Limpar dados de teste
    await pool.query('delete from cobrancas_asaas where contrato_id = $1', [testContratoId]);
    await pool.query('delete from faturas where contrato_id = $1', [testContratoId]);
    await pool.query('delete from contrato_partes where contrato_id = $1', [testContratoId]);
    await pool.query('delete from contratos where id = $1', [testContratoId]);
    await pool.end();
  });

  it('should generate monthly invoice for active contract', async () => {
    const resultado = await gerarFaturaMensal(pool, testContratoId);

    expect(resultado.faturas).toBeDefined();
    expect(resultado.faturas.length).toBeGreaterThan(0);

    const fatura = resultado.faturas[0];
    expect(fatura.valor_bruto).toBe('1000.00');
    expect(fatura.tipo).toBe('aluguel');
    expect(fatura.status).toBe('aberta');
  });

  it('should emit charges for open invoices', async () => {
    // Gerar fatura
    await gerarFaturaMensal(pool, testContratoId);

    // Emitir cobrança
    const resultado = await emitirCobrancasPendentes(pool);

    expect(resultado.cobrancasEmitidas).toBeGreaterThan(0);

    // Verificar se cobrança foi criada no Asaas
    const { rows: cobrancas } = await pool.query(
      `select * from cobrancas_asaas where contrato_id = $1`,
      [testContratoId]
    );

    expect(cobrancas.length).toBeGreaterThan(0);
    const cobranca = cobrancas[0];
    expect(cobranca.status).toBe('pendente');
    expect(cobranca.valor).toBe('1000.00');
  });

  it('should generate interest and penalties for late invoices', async () => {
    // Gerar fatura
    await gerarFaturaMensal(pool, testContratoId);

    // Atualizar fatura como atrasada (simula atraso de 10 dias)
    const { rows: faturas } = await pool.query(
      `select id from faturas where contrato_id = $1 and tipo = 'aluguel'`,
      [testContratoId]
    );

    const faturaid = faturas[0].id;

    // Simular que foi emitida cobrança
    await pool.query(
      `update faturas set status = 'atrasada', vencimento = current_date - interval '10 days'
       where id = $1`,
      [faturaid]
    );

    // Executar régua de cobrança (simula cálculo de juros/multa)
    await pool.query(
      `update faturas
       set valor_liquido = valor_bruto * 1.1
       where id = $1 and status = 'atrasada'`,
      [faturaid]
    );

    // Gerar multa e juros
    const resultado = await gerarMultaJurosFaturas(pool);

    expect(resultado.geradas.length).toBeGreaterThan(0);

    // Verificar se fatura de multa foi criada
    const { rows: multasFaturas } = await pool.query(
      `select * from faturas
       where contrato_id = $1 and tipo = 'multa_juros'`,
      [testContratoId]
    );

    expect(multasFaturas.length).toBeGreaterThan(0);
    const multaFatura = multasFaturas[0];
    expect(parseFloat(multaFatura.valor_bruto) > 0).toBe(true);
  });

  it('should process payment receipt and update status', async () => {
    // Gerar e emitir cobrança
    await gerarFaturaMensal(pool, testContratoId);
    await emitirCobrancasPendentes(pool);

    // Obter ID da cobrança
    const { rows: cobrancas } = await pool.query(
      `select id, valor from cobrancas_asaas where contrato_id = $1 limit 1`,
      [testContratoId]
    );

    const cobrancaId = cobrancas[0].id;
    const valor = cobrancas[0].valor;

    // Simular webhook de pagamento confirmado
    await distribuirRecebimento(pool, {
      cobrancaAsaasId: cobrancaId,
      valor: parseFloat(valor),
      dataRecebimento: new Date().toISOString().split('T')[0],
      statusFinal: 'pago',
    });

    // Verificar se cobrança foi marcada como paga
    const { rows: cobrancasAtualizadas } = await pool.query(
      `select status from cobrancas_asaas where id = $1`,
      [cobrancaId]
    );

    expect(cobrancasAtualizadas[0].status).toBe('pago');
  });

  it('should distribute payment to investor ledger', async () => {
    // Gerar, emitir, e pagar cobrança
    await gerarFaturaMensal(pool, testContratoId);
    await emitirCobrancasPendentes(pool);

    const { rows: cobrancas } = await pool.query(
      `select id, valor from cobrancas_asaas where contrato_id = $1 limit 1`,
      [testContratoId]
    );

    const cobrancaId = cobrancas[0].id;
    const valor = cobrancas[0].valor;

    // Distribuir recebimento
    await distribuirRecebimento(pool, {
      cobrancaAsaasId: cobrancaId,
      valor: parseFloat(valor),
      dataRecebimento: new Date().toISOString().split('T')[0],
      statusFinal: 'pago',
    });

    // Verificar ledger entry
    const { rows: ledger } = await pool.query(
      `select * from investidor_ledger
       where contrato_id = $1 and tipo = 'credito_repasse'`,
      [testContratoId]
    );

    expect(ledger.length).toBeGreaterThan(0);
    expect(parseFloat(ledger[0].valor) > 0).toBe(true);
  });
});
