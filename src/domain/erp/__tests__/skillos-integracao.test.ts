import { describe, it, expect, beforeEach } from "vitest";
import {
  obterMapeamentoSkill,
  validarRecontrucaoContabil,
  registrarRecontrucaoContabil,
  obterStatusSincronizacao,
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
});
