import { describe, it, expect, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { prepararBancoTeste } from "./test-setup";
import { registrarLancamentoContabil, obterSaldoConta, estornarLancamento } from "../ledger";

/**
 * Testes de imutabilidade do razão: validam que lançamentos contábeis
 * não podem ser alterados ou excluídos, e que períodos fechados
 * bloqueiam novos lançamentos.
 */
describe("Imutabilidade do Razão (Ledger)", () => {
  let db: any;
  let entidade_id: number;
  let periodo_id: number;
  let conta_id: number;

  beforeEach(async () => {
    const setup = await prepararBancoTeste();
    db = setup.db;
    entidade_id = setup.entidade_id;
    periodo_id = setup.periodo_id;

    const contas = db.exec(
      "SELECT id FROM contas_plano_contas WHERE codigo = '1.1.01' LIMIT 1"
    );
    conta_id = contas[0]?.values[0]?.[0];
  });

  describe("ledger_entries: bloqueio de UPDATE de dados contábeis", () => {
    it("deve bloquear UPDATE de valor_debito", () => {
      const lancamento_id = registrarLancamentoContabil(db, {
        entidade_id,
        periodo_id,
        conta_id,
        data_lancamento: "2026-01-15",
        valor_debito: 1000,
        descricao: "Teste valor",
        origem_modulo: "manual",
        origem_id: 1,
        referencia_documento: "TEST-IMUT-002",
      });

      expect(() => {
        db.run(
          `UPDATE ledger_entries SET valor_debito = 2000 WHERE id = ?`,
          [lancamento_id]
        );
      }).toThrow(/imutáveis|não podem ser alterados/i);
    });

    it("deve bloquear UPDATE de conta_id", () => {
      const contas2 = db.exec(
        "SELECT id FROM contas_plano_contas WHERE codigo = '5.1.01' LIMIT 1"
      );
      const conta_id_2 = contas2[0]?.values[0]?.[0];

      const lancamento_id = registrarLancamentoContabil(db, {
        entidade_id,
        periodo_id,
        conta_id,
        data_lancamento: "2026-01-15",
        valor_debito: 1000,
        descricao: "Teste conta",
        origem_modulo: "manual",
        origem_id: 1,
        referencia_documento: "TEST-IMUT-003",
      });

      if (conta_id_2) {
        expect(() => {
          db.run(
            `UPDATE ledger_entries SET conta_id = ? WHERE id = ?`,
            [conta_id_2, lancamento_id]
          );
        }).toThrow(/imutáveis|não podem ser alterados/i);
      }
    });

    it("deve bloquear UPDATE de descricao", () => {
      const lancamento_id = registrarLancamentoContabil(db, {
        entidade_id,
        periodo_id,
        conta_id,
        data_lancamento: "2026-01-15",
        valor_debito: 1000,
        descricao: "Teste imutabilidade",
        origem_modulo: "manual",
        origem_id: 1,
        referencia_documento: "TEST-IMUT-001",
      });

      expect(() => {
        db.run(
          `UPDATE ledger_entries SET descricao = 'Alterado' WHERE id = ?`,
          [lancamento_id]
        );
      }).toThrow(/imutáveis|não podem ser alterados/i);
    });
  });

  describe("ledger_entries: bloqueio de DELETE", () => {
    it("deve bloquear DELETE de lançamento contábil", () => {
      const lancamento_id = registrarLancamentoContabil(db, {
        entidade_id,
        periodo_id,
        conta_id,
        data_lancamento: "2026-01-15",
        valor_debito: 1000,
        descricao: "Teste delete",
        origem_modulo: "manual",
        origem_id: 1,
        referencia_documento: "TEST-IMUT-004",
      });

      expect(() => {
        db.run(`DELETE FROM ledger_entries WHERE id = ?`, [lancamento_id]);
      }).toThrow(/não podem ser excluídos|trilha de auditoria/i);
    });

    it("deve continuar permitindo consulta após tentar deletar", () => {
      const lancamento_id = registrarLancamentoContabil(db, {
        entidade_id,
        periodo_id,
        conta_id,
        data_lancamento: "2026-01-15",
        valor_debito: 1000,
        descricao: "Teste delete permanente",
        origem_modulo: "manual",
        origem_id: 1,
        referencia_documento: "TEST-IMUT-005",
      });

      try {
        db.run(`DELETE FROM ledger_entries WHERE id = ?`, [lancamento_id]);
      } catch (e) {
        // Esperado falhar
      }

      const resultado = db.exec(
        `SELECT id FROM ledger_entries WHERE id = ?`,
        [lancamento_id]
      );
      expect(resultado[0]?.values?.length).toBeGreaterThan(0);
    });
  });

  describe("ledger_entries: bloqueio de INSERT em período fechado", () => {
    it("deve bloquear INSERT quando período está fechado", () => {
      db.run(
        `UPDATE periodos_contabeis SET status = 'fechado' WHERE id = ?`,
        [periodo_id]
      );

      expect(() => {
        registrarLancamentoContabil(db, {
          entidade_id,
          periodo_id,
          conta_id,
          data_lancamento: "2026-01-15",
          valor_debito: 1000,
          descricao: "Teste período fechado",
          origem_modulo: "manual",
          origem_id: 1,
          referencia_documento: "TEST-IMUT-006",
        });
      }).toThrow(/Período contábil fechado|não aceita novos|está fechado/i);
    });

    it("deve permitir INSERT em período aberto", () => {
      db.run(
        `UPDATE periodos_contabeis SET status = 'aberto' WHERE id = ?`,
        [periodo_id]
      );

      const lancamento_id = registrarLancamentoContabil(db, {
        entidade_id,
        periodo_id,
        conta_id,
        data_lancamento: "2026-01-15",
        valor_debito: 1000,
        descricao: "Teste período aberto",
        origem_modulo: "manual",
        origem_id: 1,
        referencia_documento: "TEST-IMUT-007",
      });

      expect(lancamento_id).toBeGreaterThan(0);
    });
  });

  describe("ledger_entries: estorno como forma válida de reversão", () => {
    it("deve permitir criar estorno de lançamento existente", () => {
      const lancamento_id = registrarLancamentoContabil(db, {
        entidade_id,
        periodo_id,
        conta_id,
        data_lancamento: "2026-01-15",
        valor_debito: 1000,
        descricao: "Lançamento a estornar",
        origem_modulo: "manual",
        origem_id: 1,
        referencia_documento: "TEST-IMUT-010",
      });

      const estorno_id = registrarLancamentoContabil(db, {
        entidade_id,
        periodo_id,
        conta_id,
        data_lancamento: "2026-01-16",
        valor_credito: 1000,
        descricao: "Estorno de TEST-IMUT-010",
        origem_modulo: "manual",
        origem_id: 1,
        referencia_documento: "EST-IMUT-010",
      });

      expect(estorno_id).toBeGreaterThan(0);
      expect(estorno_id).not.toBe(lancamento_id);

      const contas = db.exec(
        `SELECT COUNT(*) as total FROM ledger_entries WHERE id IN (?, ?)`,
        [lancamento_id, estorno_id]
      );
      expect(contas[0]?.values[0]?.[0]).toBe(2);
    });

    it("contra-lançamento é um novo INSERT; o original não sofre UPDATE de dados", () => {
      const lancamento_id = registrarLancamentoContabil(db, {
        entidade_id,
        periodo_id,
        conta_id,
        data_lancamento: "2026-01-15",
        valor_debito: 1500,
        descricao: "Lançamento débito",
        origem_modulo: "manual",
        origem_id: 1,
        referencia_documento: "TEST-IMUT-011",
      });

      const estorno_id = registrarLancamentoContabil(db, {
        entidade_id,
        periodo_id,
        conta_id,
        data_lancamento: "2026-01-16",
        valor_credito: 1500,
        descricao: "Estorno",
        origem_modulo: "manual",
        origem_id: 1,
        referencia_documento: "EST-IMUT-011",
      });

      const lançamentos = db.exec(
        `SELECT id, descricao FROM ledger_entries WHERE id IN (?, ?) ORDER BY id`,
        [lancamento_id, estorno_id]
      );
      expect(lançamentos[0]?.values?.length).toBe(2);
      expect(lançamentos[0]?.values[0][1]).toMatch(/débito/i);
      expect(lançamentos[0]?.values[1][1]).toMatch(/Estorno/i);
    });
  });

  describe("ledger_entries: auditoria (update permitido para campos de meta)", () => {
    it("deve permitir UPDATE de auditada e campos de auditoria", () => {
      const lancamento_id = registrarLancamentoContabil(db, {
        entidade_id,
        periodo_id,
        conta_id,
        data_lancamento: "2026-01-15",
        valor_debito: 1000,
        descricao: "Teste auditoria",
        origem_modulo: "manual",
        origem_id: 1,
        referencia_documento: "TEST-AUD-001",
      });

      expect(() => {
        db.run(
          `UPDATE ledger_entries SET auditada = 1, auditado_por = ? WHERE id = ?`,
          [999, lancamento_id]
        );
      }).not.toThrow();

      const resultado = db.exec(
        `SELECT auditada FROM ledger_entries WHERE id = ?`,
        [lancamento_id]
      );
      expect(resultado[0]?.values[0]?.[0]).toBe(1);
    });

    it("deve permitir UPDATE de estornado_por_id", () => {
      const lancamento_id = registrarLancamentoContabil(db, {
        entidade_id,
        periodo_id,
        conta_id,
        data_lancamento: "2026-01-15",
        valor_debito: 1000,
        descricao: "Teste estornado",
        origem_modulo: "manual",
        origem_id: 1,
        referencia_documento: "TEST-EST-001",
      });

      expect(() => {
        db.run(
          `UPDATE ledger_entries SET estornado_por_id = ?, motivo_estorno = ? WHERE id = ?`,
          [99, "Teste", lancamento_id]
        );
      }).not.toThrow();

      const resultado = db.exec(
        `SELECT estornado_por_id FROM ledger_entries WHERE id = ?`,
        [lancamento_id]
      );
      expect(resultado[0]?.values[0]?.[0]).toBe(99);
    });
  });

  describe("ledger_entries: período fechado bloqueia novos lançamentos", () => {
    it("período fechado bloqueia novos lançamentos, incluindo estornos", () => {
      const lancamento_id = registrarLancamentoContabil(db, {
        entidade_id,
        periodo_id,
        conta_id,
        data_lancamento: "2026-01-15",
        valor_debito: 1000,
        descricao: "Lançamento antes de fechar",
        origem_modulo: "manual",
        origem_id: 1,
        referencia_documento: "TEST-IMUT-012",
      });

      db.run(
        `UPDATE periodos_contabeis SET status = 'fechado' WHERE id = ?`,
        [periodo_id]
      );

      expect(() => {
        registrarLancamentoContabil(db, {
          entidade_id,
          periodo_id,
          conta_id,
          data_lancamento: "2026-01-16",
          valor_credito: 1000,
          descricao: "Tentativa de estorno",
          origem_modulo: "manual",
          origem_id: 1,
          referencia_documento: "EST-IMUT-012",
          });
      }).toThrow(/Período|está fechado|não aceita novos/i);

      const check = db.exec(
        `SELECT id FROM ledger_entries WHERE id = ?`,
        [lancamento_id]
      );
      expect(check[0]?.values?.length).toBeGreaterThan(0);
    });
  });
  describe("estornarLancamento (vínculo real)", () => {
    it("o contra-lançamento aponta para o original (estorno_de_id) e o original aponta para ele (estornado_por_id)", () => {
      const original = registrarLancamentoContabil(db, {
        entidade_id, periodo_id, conta_id, data_lancamento: "2026-01-15", valor_debito: 700,
        descricao: "A estornar", origem_modulo: "manual", origem_id: 77, referencia_documento: "TEST-IMUT-VINC",
      });
      const reverso = estornarLancamento(db, original, "erro de digitação", 1);

      const [[estorno_de_id]] = db.exec("SELECT estorno_de_id FROM ledger_entries WHERE id = ?", [reverso])[0].values;
      const [[estornado_por_id]] = db.exec("SELECT estornado_por_id FROM ledger_entries WHERE id = ?", [original])[0].values;
      expect(estorno_de_id).toBe(original);
      expect(estornado_por_id).toBe(reverso);
    });
  });
});
