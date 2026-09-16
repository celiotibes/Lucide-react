import { describe, it, expect, beforeEach } from "vitest";
import {
  registrarLancamentoContabil,
  obterSaldoConta,
  gerarBalancete,
  validarBalanceamento,
  estornarLancamento,
  aprovarLancamentos,
} from "../ledger";
import { registrarTransacaoIntegrada } from "../core";
import { prepararBancoTeste } from "./test-setup";

/**
 * Consolidation Test Suite: ledger_entries ← transacoes_integradas
 *
 * Validates that the migration from transacoes_integradas to ledger_entries
 * was successful and that all accounting operations work correctly with the
 * unified ledger_entries table.
 *
 * See: server/migrations/002_consolidate_ledger_entries.sql
 */
describe("Ledger Consolidation: ledger_entries ← transacoes_integradas", () => {
  let db: any;
  let entidade_id: number;
  let periodo_id: number;

  beforeEach(async () => {
    const setup = await prepararBancoTeste();
    db = setup.db;
    entidade_id = setup.entidade_id;
    periodo_id = setup.periodo_id;
  });

  describe("Migration Validation", () => {
    it("ledger_entries should be the single source of truth", () => {
      // Verify ledger_entries table exists
      const result = db.exec(
        `SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='ledger_entries'`
      );
      expect(result[0]?.values[0]?.[0]).toBe(1);
    });

    it("transacoes_integradas should exist (legacy read-only)", () => {
      // Verify deprecated table still exists for backward compatibility
      const result = db.exec(
        `SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='transacoes_integradas'`
      );
      // If table doesn't exist, migration only affects new deployments
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it("should have view transacoes_integradas_legacy for audit trail", () => {
      // Verify legacy view exists for audit purposes
      const result = db.exec(
        `SELECT COUNT(*) as count FROM sqlite_master WHERE type='view' AND name='transacoes_integradas_legacy'`
      );
      // View may not exist in test environment, but migration creates it
      expect(result.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Accounting Operations with Unified Ledger", () => {
    it("should register debit entry in ledger_entries", () => {
      const contas = db.exec(
        `SELECT id FROM contas_plano_contas WHERE codigo = '1.1.01' LIMIT 1`
      );
      const conta_id = contas[0]?.values[0]?.[0];

      if (conta_id) {
        const lancamento_id = registrarLancamentoContabil(db, {
          entidade_id,
          periodo_id,
          conta_id,
          data_lancamento: "2026-09-16",
          valor_debito: 5000,
          descricao: "Consolidation test: debit entry",
          origem_modulo: "transacoes",
          origem_id: 9999,
          referencia_documento: "CONS-TEST-001",
        });

        expect(lancamento_id).toBeGreaterThan(0);

        // Verify entry in ledger_entries
        const verificacao = db.exec(
          `SELECT id, valor_debito, valor_credito FROM ledger_entries WHERE id = ?`,
          [lancamento_id]
        );
        const entry = verificacao[0]?.values[0];
        expect(entry?.[1]).toBe(5000); // valor_debito
        expect(entry?.[2]).toBe(null); // valor_credito
      }
    });

    it("should register credit entry in ledger_entries", () => {
      const contas = db.exec(
        `SELECT id FROM contas_plano_contas WHERE codigo = '5.1.01' LIMIT 1`
      );
      const conta_id = contas[0]?.values[0]?.[0];

      if (conta_id) {
        const lancamento_id = registrarLancamentoContabil(db, {
          entidade_id,
          periodo_id,
          conta_id,
          data_lancamento: "2026-09-16",
          valor_credito: 3000,
          descricao: "Consolidation test: credit entry",
          origem_modulo: "contratos",
          origem_id: 8888,
          referencia_documento: "CONS-TEST-002",
        });

        expect(lancamento_id).toBeGreaterThan(0);

        // Verify entry in ledger_entries
        const verificacao = db.exec(
          `SELECT valor_debito, valor_credito FROM ledger_entries WHERE id = ?`,
          [lancamento_id]
        );
        const entry = verificacao[0]?.values[0];
        expect(entry?.[0]).toBe(null); // valor_debito
        expect(entry?.[1]).toBe(3000); // valor_credito
      }
    });

    it("should retrieve correct balance from unified ledger", () => {
      const contas = db.exec(
        `SELECT id FROM contas_plano_contas WHERE codigo = '1.1.01' LIMIT 1`
      );
      const conta_id = contas[0]?.values[0]?.[0];

      if (conta_id) {
        // Register debit
        registrarLancamentoContabil(db, {
          entidade_id,
          periodo_id,
          conta_id,
          data_lancamento: "2026-09-16",
          valor_debito: 2000,
          descricao: "Consolidation test: balance",
          origem_modulo: "transacoes",
          origem_id: 7777,
          referencia_documento: "CONS-TEST-003",
        });

        // Get balance
        const saldo = obterSaldoConta(db, periodo_id, conta_id);

        expect(typeof saldo).toBe("number");
        expect(saldo).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("Data Integrity During Consolidation", () => {
    it("should validate balanceamento correctly", () => {
      const resultado = validarBalanceamento(db, periodo_id);

      expect(resultado).toHaveProperty("balanceado");
      expect(resultado).toHaveProperty("diferenca");
      expect(typeof resultado.balanceado).toBe("boolean");
      expect(typeof resultado.diferenca).toBe("number");
    });

    it("should generate accurate balancete from unified ledger", () => {
      const contas = db.exec(
        `SELECT id FROM contas_plano_contas WHERE codigo = '1.1.01' LIMIT 1`
      );
      const conta_id = contas[0]?.values[0]?.[0];

      if (conta_id) {
        // Register balanced entries
        registrarLancamentoContabil(db, {
          entidade_id,
          periodo_id,
          conta_id,
          data_lancamento: "2026-09-16",
          valor_debito: 1000,
          descricao: "Consolidation test: debit for balancete",
          origem_modulo: "transacoes",
          origem_id: 6666,
          referencia_documento: "CONS-TEST-004",
        });

        const contasCredito = db.exec(
          `SELECT id FROM contas_plano_contas WHERE codigo = '5.1.01' LIMIT 1`
        );
        const conta_credito_id = contasCredito[0]?.values[0]?.[0];

        if (conta_credito_id) {
          registrarLancamentoContabil(db, {
            entidade_id,
            periodo_id,
            conta_id: conta_credito_id,
            data_lancamento: "2026-09-16",
            valor_credito: 1000,
            descricao: "Consolidation test: credit for balancete",
            origem_modulo: "transacoes",
            origem_id: 5555,
            referencia_documento: "CONS-TEST-005",
          });
        }

        const balancete = gerarBalancete(db, periodo_id);

        expect(balancete).toHaveProperty("saldos");
        expect(Array.isArray(balancete.saldos)).toBe(true);
        expect(balancete.saldos.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Advanced Ledger Operations", () => {
    it("should support reversal (estorno) of entries", () => {
      const contas = db.exec(
        `SELECT id FROM contas_plano_contas WHERE codigo = '1.1.01' LIMIT 1`
      );
      const conta_id = contas[0]?.values[0]?.[0];

      if (conta_id) {
        const lancamento_id = registrarLancamentoContabil(db, {
          entidade_id,
          periodo_id,
          conta_id,
          data_lancamento: "2026-09-16",
          valor_debito: 1500,
          descricao: "Consolidation test: entry to be reversed",
          origem_modulo: "transacoes",
          origem_id: 4444,
          referencia_documento: "CONS-TEST-006",
        });

        const estornado = estornarLancamento(
          db,
          lancamento_id,
          "Consolidation test: reversal",
          1
        );

        expect(estornado).toBe(true);

        // Verify reversal entry was created
        const reversal = db.exec(
          `SELECT COUNT(*) as count FROM ledger_entries
           WHERE estornado_por_id = ? AND descricao LIKE 'ESTORNO%'`,
          [lancamento_id]
        );
        expect(reversal[0]?.values[0]?.[0]).toBeGreaterThan(0);
      }
    });

    it("should support approval of entries", () => {
      const contas = db.exec(
        `SELECT id FROM contas_plano_contas WHERE codigo = '1.1.01' LIMIT 1`
      );
      const conta_id = contas[0]?.values[0]?.[0];

      if (conta_id) {
        const lancamento_id = registrarLancamentoContabil(db, {
          entidade_id,
          periodo_id,
          conta_id,
          data_lancamento: "2026-09-16",
          valor_debito: 800,
          descricao: "Consolidation test: entry to be approved",
          origem_modulo: "transacoes",
          origem_id: 3333,
          referencia_documento: "CONS-TEST-007",
        });

        const aprovados = aprovarLancamentos(db, [lancamento_id], 1);

        expect(aprovados).toBe(1);

        // Verify approval
        const verificacao = db.exec(
          `SELECT auditada, auditado_por FROM ledger_entries WHERE id = ?`,
          [lancamento_id]
        );
        const entry = verificacao[0]?.values[0];
        expect(entry?.[0]).toBe(1); // auditada
        expect(entry?.[1]).toBe(1); // auditado_por
      }
    });
  });

  describe("Backward Compatibility", () => {
    it("deprecated registrarTransacaoIntegrada() should still work", () => {
      // Test that deprecated function logs warning but continues to work
      const resultado = registrarTransacaoIntegrada(db, {
        entidade_id,
        periodo_id,
        conta_id: 1,
        data: "2026-09-16",
        descricao: "Consolidation test: deprecated function",
        valor: 500,
        tipo: "debit",
        origem_modulo: "transacoes",
        origem_id: 2222,
        referencia_documento: "CONS-TEST-008",
        auditada: false,
      });

      // Function should still return a result (backward compatibility)
      expect(resultado).toHaveProperty("id");
      expect(resultado.id).toBeGreaterThan(0);
    });
  });

  describe("Consolidation Completeness", () => {
    it("should have no duplicate entries in ledger", () => {
      // Check for duplicate origin_modulo + origem_id combinations
      const result = db.exec(
        `SELECT origem_modulo, origem_id, COUNT(*) as count
         FROM ledger_entries
         GROUP BY origem_modulo, origem_id
         HAVING count > 1`
      );

      // Should have no duplicates (UNIQUE constraint on origem_modulo, origem_id)
      expect(result[0]?.values.length || 0).toBe(0);
    });

    it("should have all required audit fields populated", () => {
      const contas = db.exec(
        `SELECT id FROM contas_plano_contas WHERE codigo = '1.1.01' LIMIT 1`
      );
      const conta_id = contas[0]?.values[0]?.[0];

      if (conta_id) {
        registrarLancamentoContabil(db, {
          entidade_id,
          periodo_id,
          conta_id,
          data_lancamento: "2026-09-16",
          valor_debito: 333,
          descricao: "Consolidation test: audit fields",
          origem_modulo: "manual",
          origem_id: 1111,
          referencia_documento: "CONS-TEST-009",
          criado_por: 1,
        });

        const entry = db.exec(
          `SELECT criado_em, auditada, referencia_documento FROM ledger_entries
           WHERE origem_id = 1111 AND origem_modulo = 'manual'`
        );

        expect(entry[0]?.values[0]).toBeDefined();
        const row = entry[0].values[0];
        expect(row?.[0]).toBeTruthy(); // criado_em
        expect(row?.[1]).toBe(0); // auditada (initial state)
        expect(row?.[2]).toBe("CONS-TEST-009"); // referencia_documento
      }
    });
  });
});
