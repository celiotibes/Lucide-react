import { describe, it, expect, beforeEach } from "vitest";
import { criarLancamento, obterSaldoConta, obterExtratoConta } from "../ledger";
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

  describe("criarLancamento", () => {
    it("deve criar lançamento de débito", () => {
      const contas = db.exec(`SELECT id FROM contas_plano_contas WHERE codigo = '1.1.01' LIMIT 1`);
      const conta_id = contas[0]?.values[0]?.[0];

      if (conta_id) {
        const resultado = criarLancamento(
          db,
          entidade_id,
          periodo_id,
          conta_id,
          "Teste débito",
          1000,
          0,
          "2026-01-15"
        );

        expect(resultado).toHaveProperty("id");
        expect(resultado.valor_debito).toBe(1000);
        expect(resultado.valor_credito).toBe(0);
      }
    });

    it("deve criar lançamento de crédito", () => {
      const contas = db.exec(`SELECT id FROM contas_plano_contas WHERE codigo = '5.1.01' LIMIT 1`);
      const conta_id = contas[0]?.values[0]?.[0];

      if (conta_id) {
        const resultado = criarLancamento(
          db,
          entidade_id,
          periodo_id,
          conta_id,
          "Teste crédito",
          0,
          5000,
          "2026-01-15"
        );

        expect(resultado).toHaveProperty("id");
        expect(resultado.valor_debito).toBe(0);
        expect(resultado.valor_credito).toBe(5000);
      }
    });

    it("deve permitir lançamento com ambos débito e crédito (para validação futura)", () => {
      const contas = db.exec(`SELECT id FROM contas_plano_contas WHERE codigo = '1.1.01' LIMIT 1`);
      const conta_id = contas[0]?.values[0]?.[0];

      if (conta_id) {
        // Alguns sistemas permitem ambos, embora contabilmente seja raro
        const resultado = criarLancamento(
          db,
          entidade_id,
          periodo_id,
          conta_id,
          "Teste misto",
          100,
          100,
          "2026-01-15"
        );

        expect(resultado).toHaveProperty("id");
      }
    });
  });

  describe("obterSaldoConta", () => {
    it("deve retornar saldo de conta", () => {
      const contas = db.exec(`SELECT id FROM contas_plano_contas WHERE codigo = '1.1.01' LIMIT 1`);
      const conta_id = contas[0]?.values[0]?.[0];

      if (conta_id) {
        const saldo = obterSaldoConta(db, entidade_id, periodo_id, conta_id);

        expect(typeof saldo).toBe("number");
        expect(saldo).toBeGreaterThanOrEqual(0); // Após lançamentos de teste
      }
    });

    it("conta sem lançamentos deve ter saldo zero", () => {
      const contas = db.exec(
        `SELECT id FROM contas_plano_contas
         WHERE codigo = '6.1.06'
         AND id NOT IN (SELECT DISTINCT conta_id FROM ledger_entries)
         LIMIT 1`
      );

      if (contas[0]?.values.length > 0) {
        const conta_id = contas[0].values[0][0];
        const saldo = obterSaldoConta(db, entidade_id, periodo_id, conta_id);

        expect(saldo).toBe(0);
      }
    });
  });

  describe("obterExtratoConta", () => {
    it("deve retornar estrutura de extrato válida", () => {
      const contas = db.exec(`SELECT id FROM contas_plano_contas WHERE codigo = '1.1.01' LIMIT 1`);
      const conta_id = contas[0]?.values[0]?.[0];

      if (conta_id) {
        const extrato = obterExtratoConta(db, entidade_id, periodo_id, conta_id);

        expect(extrato).toHaveProperty("saldo_inicial");
        expect(extrato).toHaveProperty("total_debitos");
        expect(extrato).toHaveProperty("total_creditos");
        expect(extrato).toHaveProperty("saldo_final");
        expect(extrato).toHaveProperty("lancamentos");
      }
    });

    it("lancamentos deve ser array", () => {
      const contas = db.exec(`SELECT id FROM contas_plano_contas WHERE codigo = '1.1.01' LIMIT 1`);
      const conta_id = contas[0]?.values[0]?.[0];

      if (conta_id) {
        const extrato = obterExtratoConta(db, entidade_id, periodo_id, conta_id);

        expect(Array.isArray(extrato.lancamentos)).toBe(true);
      }
    });

    it("saldo_final deve ser saldo_inicial + total_debitos - total_creditos", () => {
      const contas = db.exec(`SELECT id FROM contas_plano_contas WHERE codigo = '1.1.01' LIMIT 1`);
      const conta_id = contas[0]?.values[0]?.[0];

      if (conta_id) {
        const extrato = obterExtratoConta(db, entidade_id, periodo_id, conta_id);

        const saldo_calculado = extrato.saldo_inicial + extrato.total_debitos - extrato.total_creditos;
        expect(extrato.saldo_final).toBe(saldo_calculado);
      }
    });

    it("cada lançamento no extrato deve ter os campos necessários", () => {
      const contas = db.exec(`SELECT id FROM contas_plano_contas WHERE codigo = '1.1.01' LIMIT 1`);
      const conta_id = contas[0]?.values[0]?.[0];

      if (conta_id) {
        const extrato = obterExtratoConta(db, entidade_id, periodo_id, conta_id);

        for (const lancamento of extrato.lancamentos) {
          expect(lancamento).toHaveProperty("id");
          expect(lancamento).toHaveProperty("descricao");
          expect(lancamento).toHaveProperty("valor_debito");
          expect(lancamento).toHaveProperty("valor_credito");
          expect(lancamento).toHaveProperty("data_lancamento");
        }
      }
    });
  });
});
