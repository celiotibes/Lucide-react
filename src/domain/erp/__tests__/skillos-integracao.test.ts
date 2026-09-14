import { describe, it, expect, beforeEach } from "vitest";
import {
  obterMapeamentoSkill,
  validarRecontrucaoContabil,
  registrarRecontrucaoContabil,
  obterStatusSincronizacao,
  procesarAluguelRecebido,
  procesarCaucaoDepositada,
  procesarTaxaCondominio,
  procesarUtilitiesExpense,
  procesarContratoAnalise,
} from "../skillos-integracao";
import { prepararBancoTeste } from "./test-setup";

describe("Integração Skillos", () => {
  let db: any;
  let entidade_id: number;
  let periodo_id: number;

  beforeEach(async () => {
    const setup = await prepararBancoTeste();
    db = setup.db;
    entidade_id = setup.entidade_id;
    periodo_id = setup.periodo_id;
  });

  describe("obterMapeamentoSkill", () => {
    it("deve encontrar mapeamento para aluguel_recebido", () => {
      const mapeamento = obterMapeamentoSkill(
        'accounting-reconstruction',
        'aluguel_recebido'
      );

      expect(mapeamento).toBeDefined();
      expect(mapeamento?.origem_modulo).toBe('contratos');
      expect(mapeamento?.prioridade).toBe('critica');
    });

    it("deve retornar undefined para mapeamento não existente", () => {
      const mapeamento = obterMapeamentoSkill('skill-inexistente', 'evento-inexistente');

      expect(mapeamento).toBeUndefined();
    });
  });

  describe("validarRecontrucaoContabil", () => {
    it("deve validar reconstrução válida", () => {
      const validacao = validarRecontrucaoContabil(db, {
        origem_skillos: 'accounting-reconstruction',
        tipo_evento: 'aluguel_recebido',
        data_evento: '2026-01-15',
        valor: 2000,
        descricao: 'Aluguel janeiro',
        referencia_documento: 'REF001',
        imovel_id: 1,
        inquilino_id: 1,
      });

      expect(validacao.valida).toBe(true);
      expect(validacao.erros.length).toBe(0);
    });

    it("deve rejeitar reconstrução sem valor", () => {
      const validacao = validarRecontrucaoContabil(db, {
        origem_skillos: 'accounting-reconstruction',
        tipo_evento: 'aluguel_recebido',
        data_evento: '2026-01-15',
        valor: 0,
        descricao: 'Aluguel janeiro',
        referencia_documento: 'REF001',
      });

      expect(validacao.valida).toBe(false);
      expect(validacao.erros.length).toBeGreaterThan(0);
    });

    it("deve rejeitar skill/evento não mapeado", () => {
      const validacao = validarRecontrucaoContabil(db, {
        origem_skillos: 'skill-inexistente',
        tipo_evento: 'evento-inexistente',
        data_evento: '2026-01-15',
        valor: 1000,
        descricao: 'Teste',
        referencia_documento: 'REF001',
      });

      expect(validacao.valida).toBe(false);
    });
  });

  describe("registrarRecontrucaoContabil", () => {
    it("deve registrar reconstrução válida", () => {
      const resultado = registrarRecontrucaoContabil(db, entidade_id, periodo_id, {
        origem_skillos: 'accounting-reconstruction',
        tipo_evento: 'aluguel_recebido',
        data_evento: '2026-01-15',
        valor: 2000,
        descricao: 'Aluguel janeiro',
        referencia_documento: 'REF001',
        imovel_id: 1,
        inquilino_id: 1,
      });

      expect(resultado.sucesso).toBe(true);
    });

    it("deve rejeitar reconstrução inválida", () => {
      const resultado = registrarRecontrucaoContabil(db, entidade_id, periodo_id, {
        origem_skillos: 'accounting-reconstruction',
        tipo_evento: 'aluguel_recebido',
        data_evento: '2026-01-15',
        valor: -1000,
        descricao: 'Aluguel janeiro',
        referencia_documento: 'REF001',
      });

      expect(resultado.sucesso).toBe(false);
      expect(resultado.errors).toBeDefined();
    });
  });

  describe("obterStatusSincronizacao", () => {
    it("deve retornar estrutura de status válida", () => {
      const status = obterStatusSincronizacao(db);

      expect(status).toHaveProperty("total_registros");
      expect(status).toHaveProperty("sincronizados");
      expect(status).toHaveProperty("pendentes");
      expect(status).toHaveProperty("erros");
      expect(status).toHaveProperty("percentual_sucesso");
    });

    it("percentual_sucesso deve estar entre 0 e 100", () => {
      const status = obterStatusSincronizacao(db);

      expect(status.percentual_sucesso).toBeGreaterThanOrEqual(0);
      expect(status.percentual_sucesso).toBeLessThanOrEqual(100);
    });
  });

  // ===== TESTES SKILL 1: ALUGUEL RECEBIDO =====
  describe("Skill 1: Aluguel Recebido", () => {
    it("deve processar aluguel válido", () => {
      const resultado = procesarAluguelRecebido(db, entidade_id, periodo_id, {
        data_evento: '2026-02-15',
        valor: 2000,
        imovel_id: 1,
        inquilino_id: 1,
        referencia_documento: 'ALUG_FEV_001',
        descricao: 'Aluguel fevereiro',
      });

      expect(resultado.sucesso).toBe(true);
      expect(resultado.ledger_entry_id).toBeDefined();
    });

    it("deve rejeitar aluguel sem inquilino_id", () => {
      const resultado = procesarAluguelRecebido(db, entidade_id, periodo_id, {
        data_evento: '2026-02-15',
        valor: 2000,
        imovel_id: 1,
        inquilino_id: 0,
        referencia_documento: 'ALUG_FEV_002',
      });

      expect(resultado.sucesso).toBe(false);
      expect(resultado.errors).toBeDefined();
    });

    it("deve rejeitar aluguel com valor negativo", () => {
      const resultado = procesarAluguelRecebido(db, entidade_id, periodo_id, {
        data_evento: '2026-02-15',
        valor: -1000,
        imovel_id: 1,
        inquilino_id: 1,
        referencia_documento: 'ALUG_FEV_003',
      });

      expect(resultado.sucesso).toBe(false);
    });
  });

  // ===== TESTES SKILL 2: CAUÇÃO DEPOSITADA =====
  describe("Skill 2: Caução Depositada", () => {
    it("deve processar caução válida", () => {
      const resultado = procesarCaucaoDepositada(db, entidade_id, periodo_id, {
        data_evento: '2026-01-01',
        valor: 4000,
        imovel_id: 1,
        inquilino_id: 1,
        referencia_documento: 'CAUC_001',
        descricao: 'Caução aluguel',
      });

      expect(resultado.sucesso).toBe(true);
      expect(resultado.ledger_entry_id).toBeDefined();
    });

    it("deve rejeitar caução sem imovel_id", () => {
      const resultado = procesarCaucaoDepositada(db, entidade_id, periodo_id, {
        data_evento: '2026-01-01',
        valor: 4000,
        imovel_id: 0,
        inquilino_id: 1,
        referencia_documento: 'CAUC_002',
      });

      expect(resultado.sucesso).toBe(false);
    });

    it("deve rejeitar caução com valor zero", () => {
      const resultado = procesarCaucaoDepositada(db, entidade_id, periodo_id, {
        data_evento: '2026-01-01',
        valor: 0,
        imovel_id: 1,
        inquilino_id: 1,
        referencia_documento: 'CAUC_003',
      });

      expect(resultado.sucesso).toBe(false);
    });
  });

  // ===== TESTES SKILL 3: TAXA CONDOMÍNIO =====
  describe("Skill 3: Taxa Condomínio", () => {
    it("deve processar taxa condomínio válida", () => {
      const resultado = procesarTaxaCondominio(db, entidade_id, periodo_id, {
        data_evento: '2026-02-10',
        valor: 1500,
        imovel_id: 1,
        referencia_documento: 'COND_FEV_001',
        descricao: 'Taxa condomínio fevereiro',
      });

      expect(resultado.sucesso).toBe(true);
      expect(resultado.ledger_entry_id).toBeDefined();
    });

    it("deve rejeitar taxa sem referencia_documento", () => {
      const resultado = procesarTaxaCondominio(db, entidade_id, periodo_id, {
        data_evento: '2026-02-10',
        valor: 1500,
        imovel_id: 1,
        referencia_documento: '',
      });

      expect(resultado.sucesso).toBe(false);
    });

    it("deve processar múltiplas taxas do mesmo imóvel", () => {
      const res1 = procesarTaxaCondominio(db, entidade_id, periodo_id, {
        data_evento: '2026-01-10',
        valor: 1500,
        imovel_id: 1,
        referencia_documento: 'COND_JAN_001',
      });

      const res2 = procesarTaxaCondominio(db, entidade_id, periodo_id, {
        data_evento: '2026-02-10',
        valor: 1500,
        imovel_id: 1,
        referencia_documento: 'COND_FEV_001',
      });

      expect(res1.sucesso).toBe(true);
      expect(res2.sucesso).toBe(true);
    });
  });

  // ===== TESTES SKILL 4: UTILIDADES (ÁGUA, ENERGIA, INTERNET) =====
  describe("Skill 4: Despesas de Utilidades", () => {
    it("deve processar despesa de água", () => {
      const resultado = procesarUtilitiesExpense(db, entidade_id, periodo_id, {
        data_evento: '2026-02-20',
        valor: 150,
        imovel_id: 1,
        tipo_utilidade: 'agua',
        referencia_documento: 'AGUA_FEV_001',
      });

      expect(resultado.sucesso).toBe(true);
      expect(resultado.ledger_entry_id).toBeDefined();
    });

    it("deve processar despesa de energia", () => {
      const resultado = procesarUtilitiesExpense(db, entidade_id, periodo_id, {
        data_evento: '2026-02-20',
        valor: 200,
        imovel_id: 1,
        tipo_utilidade: 'energia',
        referencia_documento: 'ENER_FEV_001',
      });

      expect(resultado.sucesso).toBe(true);
    });

    it("deve processar despesa de internet", () => {
      const resultado = procesarUtilitiesExpense(db, entidade_id, periodo_id, {
        data_evento: '2026-02-20',
        valor: 100,
        imovel_id: 1,
        tipo_utilidade: 'internet',
        referencia_documento: 'INT_FEV_001',
      });

      expect(resultado.sucesso).toBe(true);
    });

    it("deve rejeitar tipo_utilidade inválido", () => {
      const resultado = procesarUtilitiesExpense(db, entidade_id, periodo_id, {
        data_evento: '2026-02-20',
        valor: 100,
        imovel_id: 1,
        tipo_utilidade: 'gas' as any,
        referencia_documento: 'GAS_FEV_001',
      });

      expect(resultado.sucesso).toBe(false);
    });
  });

  // ===== TESTES SKILL 5: ANÁLISE DE CONTRATO =====
  describe("Skill 5: Análise de Contrato", () => {
    it("deve criar novo contrato", () => {
      const resultado = procesarContratoAnalise(
        db,
        entidade_id,
        'CONTRATO_NOVO_001',
        {
          data_evento: '2026-02-01',
          numero_contrato: 'CONTRATO_NOVO_001',
          imovel_id: 2,
          data_inicio: '2026-02-01',
          valor_aluguel: 2500,
          descricao: 'Novo contrato de aluguel',
        }
      );

      expect(resultado.sucesso).toBe(true);
      expect(resultado.contrato_id).toBeDefined();
    });

    it("deve rejeitar contrato com valor zero", () => {
      const resultado = procesarContratoAnalise(
        db,
        entidade_id,
        'CONTRATO_INVALIDO_001',
        {
          data_evento: '2026-02-01',
          numero_contrato: 'CONTRATO_INVALIDO_001',
          imovel_id: 1,
          data_inicio: '2026-02-01',
          valor_aluguel: 0,
        }
      );

      expect(resultado.sucesso).toBe(false);
    });

    it("deve rejeitar contrato sem data_inicio", () => {
      const resultado = procesarContratoAnalise(
        db,
        entidade_id,
        'CONTRATO_INVALIDO_002',
        {
          data_evento: '2026-02-01',
          numero_contrato: 'CONTRATO_INVALIDO_002',
          imovel_id: 1,
          data_inicio: '',
          valor_aluguel: 2000,
        }
      );

      expect(resultado.sucesso).toBe(false);
    });
  });

  // ===== TESTES INTEGRADOS MULTI-SKILL =====
  describe("Testes Integrados Multi-Skill", () => {
    it("deve processar fluxo completo: contrato + aluguel + taxa", () => {
      // 1. Criar contrato
      const contrRes = procesarContratoAnalise(
        db,
        entidade_id,
        'FLUXO_COMPLETO_001',
        {
          data_evento: '2026-02-01',
          numero_contrato: 'FLUXO_COMPLETO_001',
          imovel_id: 1,
          data_inicio: '2026-02-01',
          valor_aluguel: 2000,
        }
      );
      expect(contrRes.sucesso).toBe(true);

      // 2. Processar aluguel
      const alugRes = procesarAluguelRecebido(db, entidade_id, periodo_id, {
        data_evento: '2026-02-15',
        valor: 2000,
        imovel_id: 1,
        inquilino_id: 1,
        referencia_documento: 'ALUG_FLUXO_001',
      });
      expect(alugRes.sucesso).toBe(true);

      // 3. Processar taxa
      const taxaRes = procesarTaxaCondominio(db, entidade_id, periodo_id, {
        data_evento: '2026-02-10',
        valor: 1500,
        imovel_id: 1,
        referencia_documento: 'TAXA_FLUXO_001',
      });
      expect(taxaRes.sucesso).toBe(true);

      // Fluxo completo processado com sucesso
      expect(contrRes.sucesso).toBe(true);
      expect(alugRes.sucesso).toBe(true);
      expect(taxaRes.sucesso).toBe(true);
    });

    it("deve processar múltiplos imóveis em paralelo", () => {
      const alug1 = procesarAluguelRecebido(db, entidade_id, periodo_id, {
        data_evento: '2026-02-15',
        valor: 2000,
        imovel_id: 1,
        inquilino_id: 1,
        referencia_documento: 'ALUG_IM1_001',
      });

      const alug2 = procesarAluguelRecebido(db, entidade_id, periodo_id, {
        data_evento: '2026-02-15',
        valor: 2500,
        imovel_id: 2,
        inquilino_id: 2,
        referencia_documento: 'ALUG_IM2_001',
      });

      expect(alug1.sucesso).toBe(true);
      expect(alug2.sucesso).toBe(true);

      // Ambos processados com sucesso
      expect(alug1.ledger_entry_id).toBeDefined();
      expect(alug2.ledger_entry_id).toBeDefined();
    });
  });
});
