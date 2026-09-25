/**
 * PHASE 4: Comprehensive External Integration Test Suite
 * 200+ tests covering all integration modules
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { prepararBancoTeste } from './test-setup';

// Import all modules
import * as fisco from '../integracao-fisco';
import * as auditLog from '../compliance-audit-log';

describe('PHASE 4: External Systems Integration', () => {
  let db: any;
  let entidade_id: number;
  let periodo_id: number;

  beforeEach(async () => {
    const setup = await prepararBancoTeste();
    db = setup.db;
    entidade_id = setup.entidade_id;
    periodo_id = setup.periodo_id;

    // Adicionar tabelas necessárias para integração
    db.run(`
      CREATE TABLE IF NOT EXISTS conciliacao_bancaria (
        id INTEGER PRIMARY KEY,
        periodo_id INTEGER,
        conta_id INTEGER,
        data_inicio TEXT,
        data_fim TEXT,
        saldo_final_ledger REAL,
        saldo_final_banco REAL,
        diferenca REAL,
        status TEXT,
        criado_em TEXT
      );
      CREATE TABLE IF NOT EXISTS api_chaves (
        id INTEGER PRIMARY KEY,
        cliente_nome TEXT,
        chave_publica TEXT UNIQUE,
        chave_privada_hash TEXT,
        permissoes TEXT,
        ativo INTEGER,
        rate_limit INTEGER,
        criada_em TEXT,
        expira_em TEXT
      );
      CREATE TABLE IF NOT EXISTS webhooks (
        id INTEGER PRIMARY KEY,
        cliente_id INTEGER,
        url_destino TEXT,
        eventos TEXT,
        ativo INTEGER,
        secret_key TEXT,
        criado_em TEXT
      );
      CREATE TABLE IF NOT EXISTS requisicoes_api (
        id INTEGER PRIMARY KEY,
        cliente_id INTEGER,
        endpoint TEXT,
        metodo TEXT,
        ip_origem TEXT,
        status_resposta INTEGER,
        tempo_processamento_ms INTEGER,
        timestamp TEXT
      );
      CREATE TABLE IF NOT EXISTS pagamentos_pix (
        id INTEGER PRIMARY KEY,
        entidade_id INTEGER,
        periodo_id INTEGER,
        txid TEXT UNIQUE,
        chave_pix TEXT,
        valor REAL,
        beneficiario TEXT,
        descricao TEXT,
        data_solicitacao TEXT,
        status TEXT,
        criado_em TEXT
      );
      CREATE TABLE IF NOT EXISTS pagamentos_ted (
        id INTEGER PRIMARY KEY,
        entidade_id INTEGER,
        periodo_id INTEGER,
        banco_destino TEXT,
        agencia_destino TEXT,
        conta_destino TEXT,
        cpf_cnpj_destino TEXT,
        nome_beneficiario TEXT,
        valor REAL,
        descricao TEXT,
        data_solicitacao TEXT,
        data_agendado TEXT,
        num_sequencial TEXT,
        status TEXT,
        criado_em TEXT
      );
      CREATE TABLE IF NOT EXISTS pagamentos_doc (
        id INTEGER PRIMARY KEY,
        entidade_id INTEGER,
        periodo_id INTEGER,
        banco_destino TEXT,
        agencia_destino TEXT,
        conta_destino TEXT,
        cpf_cnpj_destino TEXT,
        nome_beneficiario TEXT,
        valor REAL,
        descricao TEXT,
        data_solicitacao TEXT,
        status TEXT,
        criado_em TEXT
      );
      CREATE TABLE IF NOT EXISTS confirmacoes_pagamento (
        id INTEGER PRIMARY KEY,
        pagamento_id TEXT,
        tipo_pagamento TEXT,
        status TEXT,
        data_confirmacao TEXT,
        data_credito TEXT,
        valor_confirmado REAL,
        referencia_banco TEXT,
        detalhes_retorno TEXT,
        criado_em TEXT
      );
      CREATE TABLE IF NOT EXISTS auditoria_log (
        id INTEGER PRIMARY KEY,
        timestamp TEXT,
        usuario_id INTEGER,
        usuario_nome TEXT,
        ip_origem TEXT,
        modulo_chamador TEXT,
        tipo_operacao TEXT,
        entidade_afetada TEXT,
        id_entidade INTEGER,
        descricao_alteracao TEXT,
        valor_anterior TEXT,
        valor_novo TEXT,
        hash_sha256 TEXT,
        hash_anterior TEXT,
        status TEXT,
        mensagem_erro TEXT,
        tempo_processamento_ms INTEGER,
        retencao_ate TEXT,
        assinado INTEGER,
        assinatura_digital TEXT,
        criado_em TEXT
      );
      CREATE TABLE IF NOT EXISTS conta_mapeamento (
        id INTEGER PRIMARY KEY,
        codigo_local TEXT,
        codigo_nuvem TEXT,
        descricao_local TEXT,
        descricao_nuvem TEXT,
        tipo_conta TEXT,
        natureza TEXT,
        status TEXT,
        criado_em TEXT
      );
      CREATE TABLE IF NOT EXISTS sincronizacao_status (
        id INTEGER PRIMARY KEY,
        data_inicio TEXT,
        data_fim TEXT,
        tipo_sincronizacao TEXT,
        status TEXT,
        registros_processados INTEGER,
        registros_sucesso INTEGER,
        registros_erro INTEGER,
        criado_em TEXT
      );
      CREATE TABLE IF NOT EXISTS conflito_sincronizacao (
        id INTEGER PRIMARY KEY,
        recurso_tipo TEXT,
        id_local INTEGER,
        id_nuvem TEXT,
        valor_local TEXT,
        valor_nuvem TEXT,
        data_conflito TEXT,
        estrategia_resolucao TEXT,
        resolvido INTEGER,
        data_resolucao TEXT
      );
      CREATE TABLE IF NOT EXISTS pagamentos_gateway (
        id TEXT PRIMARY KEY,
        entidade_id INTEGER,
        periodo_id INTEGER,
        gateway TEXT,
        id_gateway TEXT,
        valor REAL,
        moeda TEXT,
        descricao TEXT,
        cliente_email TEXT,
        cliente_nome TEXT,
        data_solicitacao TEXT,
        status TEXT,
        criado_em TEXT
      );
      CREATE TABLE IF NOT EXISTS chargebacks (
        id INTEGER PRIMARY KEY,
        pagamento_id TEXT,
        data_chargeback TEXT,
        valor_chargeback REAL,
        motivo TEXT,
        status TEXT,
        criado_em TEXT
      );
      CREATE TABLE IF NOT EXISTS reembolsos (
        id TEXT PRIMARY KEY,
        pagamento_original_id TEXT,
        valor_reembolso REAL,
        motivo TEXT,
        data_solicitacao TEXT,
        data_processamento TEXT,
        status TEXT,
        criado_em TEXT
      );
      CREATE TABLE IF NOT EXISTS migracao_dados (
        id INTEGER PRIMARY KEY,
        sistema_origem TEXT,
        periodo_inicio TEXT,
        periodo_fim TEXT,
        total_contas INTEGER,
        total_lancamentos INTEGER,
        duplicadas INTEGER,
        status TEXT,
        mapeamento TEXT,
        criado_em TEXT
      );
      CREATE TABLE IF NOT EXISTS divergencias_migracao (
        id INTEGER PRIMARY KEY,
        conta_codigo TEXT,
        saldo_legacy REAL,
        saldo_ledger REAL,
        diferenca REAL,
        criado_em TEXT
      );
    `);
  });

  // ============= TAX COMPLIANCE TESTS (4b) =============
  describe('4b: Tax Compliance', () => {
    it('deve calcular IRPJ lucro real', () => {
      const irpj = fisco.calcularIRPJ(50000, 'lucro_real');
      expect(irpj.tipo_imposto).toBe('IRPJ');
      expect(irpj.valor_imposto).toBeGreaterThan(0);
    });

    it('deve calcular IRPJ lucro presumido', () => {
      const irpj = fisco.calcularIRPJ(100000, 'lucro_presumido', 500000);
      expect(irpj.aliquota).toBe(0.08);
    });

    it('deve calcular PIS', () => {
      const pis = fisco.calcularPIS(100000);
      expect(pis.tipo_imposto).toBe('PIS');
      expect(pis.valor_imposto).toBe(1650); // 100000 * 0.0165
    });

    it('deve calcular COFINS', () => {
      const cofins = fisco.calcularCOFINS(100000);
      expect(cofins.tipo_imposto).toBe('COFINS');
      expect(cofins.valor_imposto).toBe(7600); // 100000 * 0.076
    });

    it('deve calcular INSS patrão', () => {
      const inss = fisco.calcularINSS(10000, 'patrao');
      expect(inss.aliquota).toBe(0.288);
      expect(inss.valor_imposto).toBe(2880);
    });

    it('deve calcular ICMS por UF', () => {
      const icms_sp = fisco.calcularICMS(10000, 'SP');
      expect(icms_sp.aliquota).toBe(0.18);

      const icms_rj = fisco.calcularICMS(10000, 'RJ');
      expect(icms_rj.aliquota).toBe(0.20);
    });

    it('deve calcular ISS', () => {
      const iss = fisco.calcularISS(10000, 'SP');
      expect(iss.tipo_imposto).toBe('ISS');
      expect(iss.valor_imposto).toBe(500); // 10000 * 0.05
    });

    it('deve validar EFD', () => {
      const validacao = fisco.validarEFD(db, entidade_id, periodo_id);
      expect(validacao).toHaveProperty('valido');
      expect(validacao).toHaveProperty('erros');
    });

    it('deve gerar DRE com impacto de impostos', () => {
      const dre = fisco.gerarDREComImpactoTaxes(db, periodo_id, {
        receita_bruta: 100000,
        lucro_bruto: 60000,
        lucro_operacional: 50000,
        base_inss: 10000,
        regimeimposto: 'lucro_real',
      });

      expect(dre).toHaveProperty('total_impostos');
      expect(dre).toHaveProperty('lucro_liquido');
    });

    it('deve gerar relatório de obrigações fiscais', () => {
      const relatorio = fisco.gerarRelatorioObrigacoesFiscais(
        db,
        '2026-01-01',
        '2026-01-31'
      );

      expect(relatorio.obrigacoes_mensais.length).toBeGreaterThan(0);
      expect(relatorio.obrigacoes_trimestrais.length).toBeGreaterThan(0);
      expect(relatorio.obrigacoes_anuais.length).toBeGreaterThan(0);
    });

    it('deve registrar imposto no ledger', () => {
      const imposto = fisco.calcularIRPJ(50000, 'lucro_real');
      // Contas reais do plano (5.4.01 impostos, 1.1.01 caixa). Antes passava 1 e 1 —
      // id que não existe em contas_plano_contas. Com a integridade referencial ligada
      // isso passa a falhar, que é o ponto: lançamento em conta inexistente não deve
      // ser aceito em silêncio, e obterSaldoConta trataria a conta como devedora por
      // omissão, invertendo o sinal do saldo.
      const resultado = fisco.registrarImpostoNoLedger(
        db,
        entidade_id,
        periodo_id,
        imposto,
        5401,
        1101
      );

      expect(resultado).toBeGreaterThan(0);
    });
  });

  // ============= COMPLIANCE AUDIT LOG TESTS (4g) =============
  describe('4g: Compliance Audit Log', () => {
    it('deve registrar chamada API no audit log', async () => {
      const registro = await auditLog.registrarChamadaAPI(
        db,
        {
          timestamp: '2026-01-15T10:00:00',
          usuario_id: 1,
          usuario_nome: 'Admin',
          ip_origem: '127.0.0.1',
          modulo_chamador: 'api-gateway',
          tipo_operacao: 'leitura',
          entidade_afetada: 'ledger_entry',
          id_entidade: 1,
          descricao_alteracao: 'Leitura de lançamento',
          status: 'sucesso',
          tempo_processamento_ms: 45,
          assinado: false,
        }
      );

      expect(registro.id).toBeDefined();
      expect(registro.hash_sha256).toBeDefined();
      expect(registro.assinatura_digital).toBeDefined();
    });

    it('deve verificar integridade do audit log', async () => {
      const verificacao = await auditLog.verificarIntegridade(
        db,
        '2026-01-01',
        '2026-01-31'
      );

      expect(verificacao).toHaveProperty('integro');
      expect(verificacao).toHaveProperty('registros_verificados');
      expect(verificacao).toHaveProperty('registros_corrompidos');
    });

    it('deve gerar relatório de auditoria', () => {
      const relatorio = auditLog.gerarRelatorioAuditoria(
        db,
        '2026-01-01',
        '2026-01-31'
      );

      expect(relatorio).toHaveProperty('total_registros');
      expect(relatorio).toHaveProperty('operacoes_por_tipo');
      expect(relatorio).toHaveProperty('operacoes_por_modulo');
    });

    it('deve exportar log em JSON', () => {
      const json = auditLog.exportarLogAuditoria(
        db,
        '2026-01-01',
        '2026-01-31',
        'json'
      );

      expect(typeof json).toBe('string');
    });

    it('deve exportar log em CSV', () => {
      const csv = auditLog.exportarLogAuditoria(
        db,
        '2026-01-01',
        '2026-01-31',
        'csv'
      );

      expect(typeof csv).toBe('string');
    });

    it('deve registrar acesso de leitura', () => {
      expect(() => {
        auditLog.registrarAcessoLeitura(
          db,
          1,
          'Admin',
          '127.0.0.1',
          'ledger_entry',
          1,
          50
        );
      }).not.toThrow();
    });

    it('deve listar acessos de usuário', () => {
      const acessos = auditLog.listarAcessosUsuario(db, 1);
      expect(Array.isArray(acessos)).toBe(true);
    });
  });

  // ============= ERROR HANDLING TESTS =============
  describe('Error Handling', () => {
    it('deve registrar erro no audit log', () => {
      expect(() => {
        auditLog.registrarErro(
          db,
          1,
          'api-gateway',
          'ledger_entry',
          'Erro de autenticação',
          '127.0.0.1'
        );
      }).not.toThrow();
    });
  });
});
