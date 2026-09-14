import { describe, it, expect, beforeEach } from "vitest";
import {
  registrarLancamentoContabil,
  obterSaldoConta,
  gerarBalancete,
  validarBalanceamento,
} from "../ledger";
import { prepararBancoTeste } from "./test-setup";

describe("Ledger (Razão Contábil)", () => {
  let db: any;
  let entidade_id: number;
  let periodo_id: number;

  beforeEach(async () => {
    const setup = await prepararBancoTeste();
    db = setup.db;
    entidade_id = setup.entidade_id;
    periodo_id = setup.periodo_id;
  });

  describe("registrarLancamentoContabil", () => {
    it("deve registrar lançamento de débito", () => {
      const contas = db.exec(`SELECT id FROM contas_plano_contas WHERE codigo = '1.1.01' LIMIT 1`);
      const conta_id = contas[0]?.values[0]?.[0];

      if (conta_id) {
        const resultado = registrarLancamentoContabil(db, {
          entidade_id,
          periodo_id,
          conta_id,
          data_lancamento: "2026-01-15",
          valor_debito: 1000,
          descricao: "Teste débito",
          origem_modulo: "manual",
          origem_id: 1,
          referencia_documento: "TEST001",
        });

        expect(resultado).toBeGreaterThan(0);
      }
    });

    it("deve registrar lançamento de crédito", () => {
      const contas = db.exec(`SELECT id FROM contas_plano_contas WHERE codigo = '5.1.01' LIMIT 1`);
      const conta_id = contas[0]?.values[0]?.[0];

      if (conta_id) {
        const resultado = registrarLancamentoContabil(db, {
          entidade_id,
          periodo_id,
          conta_id,
          data_lancamento: "2026-01-15",
          valor_credito: 5000,
          descricao: "Teste crédito",
          origem_modulo: "manual",
          origem_id: 1,
          referencia_documento: "TEST002",
        });

        expect(resultado).toBeGreaterThan(0);
      }
    });

    it("deve rejeitar lançamento sem débito ou crédito", () => {
      const contas = db.exec(`SELECT id FROM contas_plano_contas WHERE codigo = '1.1.01' LIMIT 1`);
      const conta_id = contas[0]?.values[0]?.[0];

      if (conta_id) {
        expect(() =>
          registrarLancamentoContabil(db, {
            entidade_id,
            periodo_id,
            conta_id,
            data_lancamento: "2026-01-15",
            descricao: "Teste inválido",
            origem_modulo: "manual",
            origem_id: 1,
            referencia_documento: "TEST003",
          })
        ).toThrow();
      }
    });
  });

  describe("obterSaldoConta", () => {
    it("deve retornar saldo de conta", () => {
      const contas = db.exec(`SELECT id FROM contas_plano_contas WHERE codigo = '1.1.01' LIMIT 1`);
      const conta_id = contas[0]?.values[0]?.[0];

      if (conta_id) {
        const saldo = obterSaldoConta(db, periodo_id, conta_id);

        expect(typeof saldo).toBe("number");
        expect(saldo).toBeGreaterThanOrEqual(0);
      }
    });

    it("conta sem lançamentos deve ter saldo zero", () => {
      const contas = db.exec(
        `SELECT id FROM contas_plano_contas
         WHERE codigo = '6.1.06'
         LIMIT 1`
      );

      if (contas[0]?.values.length > 0) {
        const conta_id = contas[0].values[0][0];
        const saldo = obterSaldoConta(db, periodo_id, conta_id);

        expect(saldo).toBe(0);
      }
    });
  });

  describe("gerarBalancete", () => {
    it("deve gerar balancete válido", () => {
      const balancete = gerarBalancete(db, periodo_id);

      expect(balancete).toHaveProperty("periodo");
      expect(balancete).toHaveProperty("saldos");
      expect(balancete).toHaveProperty("total_debito_periodo");
      expect(balancete).toHaveProperty("total_credito_periodo");
      expect(Array.isArray(balancete.saldos)).toBe(true);
    });

    it("saldos deve ser array", () => {
      const balancete = gerarBalancete(db, periodo_id);

      expect(Array.isArray(balancete.saldos)).toBe(true);
    });

    it("cada saldo deve ter estrutura válida", () => {
      const balancete = gerarBalancete(db, periodo_id);

      for (const saldo of balancete.saldos) {
        expect(saldo).toHaveProperty("conta_codigo");
        expect(saldo).toHaveProperty("conta_descricao");
        expect(saldo).toHaveProperty("total_debito");
        expect(saldo).toHaveProperty("total_credito");
        expect(saldo).toHaveProperty("saldo_final");
      }
    });
  });

  describe("validarBalanceamento", () => {
    it("deve validar balanceamento", () => {
      const resultado = validarBalanceamento(db, periodo_id);

      expect(resultado).toHaveProperty("balanceado");
      expect(resultado).toHaveProperty("diferenca");
      expect(typeof resultado.balanceado).toBe("boolean");
      expect(typeof resultado.diferenca).toBe("number");
    });

    it("diferença deve ser não-negativa", () => {
      const resultado = validarBalanceamento(db, periodo_id);

      expect(resultado.diferenca).toBeGreaterThanOrEqual(0);
    });
  });
});
