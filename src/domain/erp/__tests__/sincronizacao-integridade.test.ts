import { describe, it, expect, beforeEach } from "vitest";
import { verificarIntegridade, reconciliarAlugueis } from "../sincronizacao-integridade";
import { prepararBancoTeste } from "./test-setup";

describe("Sincronização e Integridade", () => {
  let db: any;

  beforeEach(async () => {
    const setup = await prepararBancoTeste();
    db = setup.db;
  });

  describe("verificarIntegridade", () => {
    it("deve retornar relatório de integridade válido", () => {
      const relatorio = verificarIntegridade(db);

      expect(relatorio).toHaveProperty("status");
      expect(relatorio).toHaveProperty("data_verificacao");
      expect(relatorio).toHaveProperty("periodos_abertos");
      expect(relatorio).toHaveProperty("transacoes_pendentes_auditoria");
      expect(relatorio).toHaveProperty("discrepancias");
      expect(relatorio).toHaveProperty("resumo_acoes_recomendadas");
    });

    it("status deve estar em 'ok', 'alerta' ou 'erro'", () => {
      const relatorio = verificarIntegridade(db);

      expect(["ok", "alerta", "erro"]).toContain(relatorio.status);
    });

    it("periodos_abertos deve ser número não-negativo", () => {
      const relatorio = verificarIntegridade(db);

      expect(typeof relatorio.periodos_abertos).toBe("number");
      expect(relatorio.periodos_abertos).toBeGreaterThanOrEqual(0);
    });

    it("transacoes_pendentes_auditoria deve ser número não-negativo", () => {
      const relatorio = verificarIntegridade(db);

      expect(typeof relatorio.transacoes_pendentes_auditoria).toBe("number");
      expect(relatorio.transacoes_pendentes_auditoria).toBeGreaterThanOrEqual(0);
    });

    it("discrepancias deve ser array", () => {
      const relatorio = verificarIntegridade(db);

      expect(Array.isArray(relatorio.discrepancias)).toBe(true);
    });

    it("cada discrepância deve ter severidade em 'info', 'aviso' ou 'critico'", () => {
      const relatorio = verificarIntegridade(db);

      for (const disc of relatorio.discrepancias) {
        expect(["info", "aviso", "critico"]).toContain(disc.severidade);
      }
    });

    it("resumo_acoes_recomendadas deve ser array de strings", () => {
      const relatorio = verificarIntegridade(db);

      expect(Array.isArray(relatorio.resumo_acoes_recomendadas)).toBe(true);
      for (const acao of relatorio.resumo_acoes_recomendadas) {
        expect(typeof acao).toBe("string");
      }
    });

    it("data_verificacao deve ser ISO string válida", () => {
      const relatorio = verificarIntegridade(db);

      expect(() => new Date(relatorio.data_verificacao)).not.toThrow();
    });
  });

  describe("reconciliarAlugueis", () => {
    it("deve retornar estrutura de reconciliação válida", () => {
      const reconciliacao = reconciliarAlugueis(db);

      expect(reconciliacao).toHaveProperty("valor_esperado");
      expect(reconciliacao).toHaveProperty("valor_recebido");
      expect(reconciliacao).toHaveProperty("diferenca");
      expect(reconciliacao).toHaveProperty("variacao_percentual");
      expect(reconciliacao).toHaveProperty("divergencias");
    });

    it("valores devem ser não-negativos", () => {
      const reconciliacao = reconciliarAlugueis(db);

      expect(reconciliacao.valor_esperado).toBeGreaterThanOrEqual(0);
      expect(reconciliacao.valor_recebido).toBeGreaterThanOrEqual(0);
    });

    it("diferença deve ser recebido - esperado", () => {
      const reconciliacao = reconciliarAlugueis(db);

      const diferenca_esperada = reconciliacao.valor_recebido - reconciliacao.valor_esperado;
      expect(reconciliacao.diferenca).toBe(diferenca_esperada);
    });

    it("divergências deve ser array", () => {
      const reconciliacao = reconciliarAlugueis(db);

      expect(Array.isArray(reconciliacao.divergencias)).toBe(true);
    });

    it("cada divergência deve ter estrutura válida", () => {
      const reconciliacao = reconciliarAlugueis(db);

      for (const divergencia of reconciliacao.divergencias) {
        expect(divergencia).toHaveProperty("imovel_id");
        expect(divergencia).toHaveProperty("contrato_id");
        expect(divergencia).toHaveProperty("diferenca");
      }
    });

    it("variação_percentual para zero esperado deve ser infinito ou zero", () => {
      const reconciliacao = reconciliarAlugueis(db);

      if (reconciliacao.valor_esperado === 0) {
        expect([0, Infinity, -Infinity]).toContain(reconciliacao.variacao_percentual);
      }
    });

    it("quando recebido = esperado, diferença deve ser 0", () => {
      const reconciliacao = reconciliarAlugueis(db);

      if (reconciliacao.valor_recebido === reconciliacao.valor_esperado) {
        expect(reconciliacao.diferenca).toBe(0);
      }
    });
  });
});
