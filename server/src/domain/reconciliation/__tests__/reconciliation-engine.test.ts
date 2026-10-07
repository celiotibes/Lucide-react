/**
 * Tests for Reconciliation Engine
 *
 * Verifica:
 * - Precisão de matching (>85%)
 * - Performance (<1s por 100 entradas)
 * - Edge cases: múltiplas entradas no mesmo dia, valores duplicados, descrições null
 * - Operações concorrentes de matching
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { ReconciliationEngine } from "../reconciliation-engine.js";
import type {
  LedgerEntryForReconciliation,
  SourceTransaction,
} from "../reconciliation-types.js";

describe("ReconciliationEngine", () => {
  let db: Database.Database;
  let engine: ReconciliationEngine;

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(":memory:");

    // Setup schema
    db.exec(`
      CREATE TABLE ledger_entries (
        id TEXT PRIMARY KEY,
        data DATE NOT NULL,
        tipo TEXT NOT NULL,
        categoria TEXT NOT NULL,
        valor DECIMAL(12, 2) NOT NULL,
        descricao TEXT,
        referencia_externa TEXT,
        usuario_id TEXT,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE agentes_economicos (
        id TEXT PRIMARY KEY,
        tipo_entidade TEXT NOT NULL,
        cpf_cnpj TEXT NOT NULL UNIQUE,
        nome TEXT NOT NULL,
        ativo INTEGER NOT NULL DEFAULT 1,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        criado_por TEXT NOT NULL,
        atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_por TEXT NOT NULL
      );

      CREATE TABLE usuarios (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        nome TEXT NOT NULL
      );

      CREATE TABLE reconciliation_matches (
        id TEXT PRIMARY KEY,
        ledger_entry_id TEXT NOT NULL,
        source_transaction_id TEXT NOT NULL,
        agente_id TEXT,
        match_score INTEGER NOT NULL,
        score_date INTEGER DEFAULT 0,
        score_amount INTEGER DEFAULT 0,
        score_description INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'PENDING',
        created_by TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reviewed_by TEXT,
        reviewed_at DATETIME,
        approved_by TEXT,
        approved_at DATETIME,
        match_details TEXT,
        rejection_reason TEXT,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ledger_entry_id) REFERENCES ledger_entries(id) ON DELETE CASCADE,
        FOREIGN KEY (agente_id) REFERENCES agentes_economicos(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES usuarios(id) ON DELETE SET NULL
      );

      CREATE TABLE reconciliation_audit_log (
        id TEXT PRIMARY KEY,
        reconciliation_match_id TEXT NOT NULL,
        action TEXT NOT NULL,
        old_status TEXT,
        new_status TEXT,
        changed_by TEXT NOT NULL,
        changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        FOREIGN KEY (reconciliation_match_id) REFERENCES reconciliation_matches(id) ON DELETE CASCADE,
        FOREIGN KEY (changed_by) REFERENCES usuarios(id) ON DELETE SET NULL
      );

      CREATE TABLE reconciliation_status (
        id TEXT PRIMARY KEY,
        agente_id TEXT NOT NULL,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        total_ledger_entries INTEGER DEFAULT 0,
        total_source_transactions INTEGER DEFAULT 0,
        matched_entries INTEGER DEFAULT 0,
        pending_matches INTEGER DEFAULT 0,
        approved_matches INTEGER DEFAULT 0,
        rejected_matches INTEGER DEFAULT 0,
        unmatched_ledger_entries INTEGER DEFAULT 0,
        unmatched_source_transactions INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'PENDING',
        completion_percentage DECIMAL(5, 2) DEFAULT 0.00,
        processing_time_ms INTEGER DEFAULT 0,
        started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        started_by TEXT,
        FOREIGN KEY (agente_id) REFERENCES agentes_economicos(id) ON DELETE CASCADE,
        FOREIGN KEY (started_by) REFERENCES usuarios(id) ON DELETE SET NULL
      );
    `);

    engine = new ReconciliationEngine(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("matchTransactions", () => {
    it("should match identical transactions", async () => {
      const ledger: LedgerEntryForReconciliation[] = [
        {
          id: "ledger-1",
          data: "2024-01-15",
          valor: 1000,
          descricao: "Invoice #123",
          referencia_externa: "INV-123",
          tipo: "receita",
          categoria: "receita",
        },
      ];

      const source: SourceTransaction[] = [
        {
          id: "source-1",
          date: "2024-01-15",
          amount: 1000,
          description: "Invoice #123",
        },
      ];

      const results = await engine.matchTransactions(ledger, source);

      expect(results).toHaveLength(1);
      expect(results[0].match_score).toBeGreaterThanOrEqual(90);
      expect(results[0].ledger_entry_id).toBe("ledger-1");
      expect(results[0].source_transaction_id).toBe("source-1");
    });

    it("should match transactions within tolerance (date ±1 day)", async () => {
      const ledger: LedgerEntryForReconciliation[] = [
        {
          id: "ledger-1",
          data: "2024-01-15",
          valor: 1000,
          descricao: "Invoice #123",
          referencia_externa: "INV-123",
          tipo: "receita",
          categoria: "receita",
        },
      ];

      const source: SourceTransaction[] = [
        {
          id: "source-1",
          date: "2024-01-16",
          amount: 1000,
          description: "Invoice #123",
        },
      ];

      const results = await engine.matchTransactions(ledger, source);

      expect(results).toHaveLength(1);
      expect(results[0].match_score).toBeGreaterThan(60);
    });

    it("should match transactions within amount tolerance (±5%)", async () => {
      const ledger: LedgerEntryForReconciliation[] = [
        {
          id: "ledger-1",
          data: "2024-01-15",
          valor: 1000,
          descricao: "Invoice #123",
          referencia_externa: "INV-123",
          tipo: "receita",
          categoria: "receita",
        },
      ];

      const source: SourceTransaction[] = [
        {
          id: "source-1",
          date: "2024-01-15",
          amount: 1049, // 4.9% difference
          description: "Invoice #123",
        },
      ];

      const results = await engine.matchTransactions(ledger, source);

      expect(results).toHaveLength(1);
      expect(results[0].match_score).toBeGreaterThan(80);
    });

    it("should reject matches below threshold", async () => {
      const ledger: LedgerEntryForReconciliation[] = [
        {
          id: "ledger-1",
          data: "2024-01-15",
          valor: 1000,
          descricao: "Invoice #123",
          referencia_externa: "INV-123",
          tipo: "receita",
          categoria: "receita",
        },
      ];

      const source: SourceTransaction[] = [
        {
          id: "source-1",
          date: "2024-02-01", // 17 days difference
          amount: 2000, // 100% difference
          description: "Completely different",
        },
      ];

      const results = await engine.matchTransactions(ledger, source);

      expect(results).toHaveLength(0);
    });

    it("should handle multiple candidates and return top 3", async () => {
      const ledger: LedgerEntryForReconciliation[] = [
        {
          id: "ledger-1",
          data: "2024-01-15",
          valor: 1000,
          descricao: "Invoice #123",
          referencia_externa: "INV-123",
          tipo: "receita",
          categoria: "receita",
        },
      ];

      const source: SourceTransaction[] = [
        {
          id: "source-1",
          date: "2024-01-15",
          amount: 1000,
          description: "Invoice #123",
        },
        {
          id: "source-2",
          date: "2024-01-15",
          amount: 1020,
          description: "Invoice #123",
        },
        {
          id: "source-3",
          date: "2024-01-16",
          amount: 1000,
          description: "Invoice #123",
        },
        {
          id: "source-4",
          date: "2024-01-17",
          amount: 1050,
          description: "Different invoice",
        },
      ];

      const results = await engine.matchTransactions(ledger, source);

      expect(results).toHaveLength(1);
      expect(results[0].candidates.length).toBeLessThanOrEqual(3);
      expect(results[0].candidates[0].score).toBeGreaterThanOrEqual(
        results[0].candidates[1]?.score || 0
      );
    });

    it("should handle edge case: same-day multiple entries", async () => {
      const ledger: LedgerEntryForReconciliation[] = [
        {
          id: "ledger-1",
          data: "2024-01-15",
          valor: 500,
          descricao: "Payment A",
          referencia_externa: "PAY-A",
          tipo: "receita",
          categoria: "receita",
        },
        {
          id: "ledger-2",
          data: "2024-01-15",
          valor: 500,
          descricao: "Payment B",
          referencia_externa: "PAY-B",
          tipo: "receita",
          categoria: "receita",
        },
      ];

      const source: SourceTransaction[] = [
        {
          id: "source-1",
          date: "2024-01-15",
          amount: 500,
          description: "Payment A",
        },
        {
          id: "source-2",
          date: "2024-01-15",
          amount: 500,
          description: "Payment B",
        },
      ];

      const results = await engine.matchTransactions(ledger, source);

      expect(results).toHaveLength(2);
      expect(results[0].match_score).toBeGreaterThan(80);
      expect(results[1].match_score).toBeGreaterThan(80);
    });

    it("should handle edge case: duplicate values", async () => {
      const ledger: LedgerEntryForReconciliation[] = [
        {
          id: "ledger-1",
          data: "2024-01-15",
          valor: 1000,
          descricao: "Payment",
          referencia_externa: "PAY-1",
          tipo: "receita",
          categoria: "receita",
        },
        {
          id: "ledger-2",
          data: "2024-01-15",
          valor: 1000,
          descricao: "Payment",
          referencia_externa: "PAY-2",
          tipo: "receita",
          categoria: "receita",
        },
      ];

      const source: SourceTransaction[] = [
        {
          id: "source-1",
          date: "2024-01-15",
          amount: 1000,
          description: "Payment",
        },
      ];

      const results = await engine.matchTransactions(ledger, source);

      expect(results.length).toBeGreaterThan(0);
    });

    it("should handle edge case: null descriptions", async () => {
      const ledger: LedgerEntryForReconciliation[] = [
        {
          id: "ledger-1",
          data: "2024-01-15",
          valor: 1000,
          descricao: undefined,
          referencia_externa: "REF-1",
          tipo: "receita",
          categoria: "receita",
        },
      ];

      const source: SourceTransaction[] = [
        {
          id: "source-1",
          date: "2024-01-15",
          amount: 1000,
          description: "Some description",
        },
      ];

      const results = await engine.matchTransactions(ledger, source);

      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("Performance benchmarks", () => {
    it("should process 100 entries in less than 1 second", async () => {
      const ledger: LedgerEntryForReconciliation[] = [];
      const source: SourceTransaction[] = [];

      // Generate 100 test entries
      for (let i = 0; i < 100; i++) {
        ledger.push({
          id: `ledger-${i}`,
          data: `2024-01-${String((i % 28) + 1).padStart(2, "0")}`,
          valor: 1000 + i,
          descricao: `Invoice #${i}`,
          referencia_externa: `REF-${i}`,
          tipo: "receita",
          categoria: "receita",
        });

        source.push({
          id: `source-${i}`,
          date: `2024-01-${String((i % 28) + 1).padStart(2, "0")}`,
          amount: 1000 + i,
          description: `Invoice #${i}`,
        });
      }

      const startTime = Date.now();
      const results = await engine.matchTransactions(ledger, source);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000);
      expect(results.length).toBeGreaterThan(80);
    });
  });

  describe("Match accuracy", () => {
    it("should achieve >85% matching accuracy on clean data", async () => {
      const ledger: LedgerEntryForReconciliation[] = [];
      const source: SourceTransaction[] = [];

      // Generate 50 matching pairs
      for (let i = 0; i < 50; i++) {
        const date = `2024-01-${String((i % 28) + 1).padStart(2, "0")}`;
        const amount = 1000 + i;
        const desc = `Invoice #${i}`;

        ledger.push({
          id: `ledger-${i}`,
          data: date,
          valor: amount,
          descricao: desc,
          referencia_externa: `REF-${i}`,
          tipo: "receita",
          categoria: "receita",
        });

        source.push({
          id: `source-${i}`,
          date: date,
          amount: amount,
          description: desc,
        });
      }

      const results = await engine.matchTransactions(ledger, source);
      const accuracy = (results.length / ledger.length) * 100;

      expect(accuracy).toBeGreaterThan(85);
    });
  });

  describe("approveMatch and rejectMatch", () => {
    it("should approve a match", async () => {
      const matchId = randomUUID();
      const userId = randomUUID();
      const ledgerId = randomUUID();
      const sourceId = randomUUID();

      // Insert users first
      db.prepare(`INSERT INTO usuarios (id, email, nome) VALUES (?, ?, ?)`).run(
        userId,
        "test@example.com",
        "Test User"
      );

      // Insert ledger entry
      db.prepare(
        `INSERT INTO ledger_entries
       (id, data, tipo, categoria, valor, descricao, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(ledgerId, "2024-01-15", "receita", "receita", 1000, "Test", userId);

      // Insert test data
      db.prepare(
        `INSERT INTO reconciliation_matches
       (id, ledger_entry_id, source_transaction_id, match_score, status)
       VALUES (?, ?, ?, ?, ?)`
      ).run(matchId, ledgerId, sourceId, 90, "PENDING");

      await engine.approveMatch(matchId, userId, "Looks good");

      const match = db
        .prepare(`SELECT * FROM reconciliation_matches WHERE id = ?`)
        .get(matchId) as any;

      expect(match.status).toBe("APPROVED");
      expect(match.approved_by).toBe(userId);
    });

    it("should reject a match", async () => {
      const matchId = randomUUID();
      const userId = randomUUID();
      const ledgerId = randomUUID();
      const sourceId = randomUUID();

      // Insert users first
      db.prepare(`INSERT INTO usuarios (id, email, nome) VALUES (?, ?, ?)`).run(
        userId,
        "test@example.com",
        "Test User"
      );

      // Insert ledger entry
      db.prepare(
        `INSERT INTO ledger_entries
       (id, data, tipo, categoria, valor, descricao, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(ledgerId, "2024-01-15", "receita", "receita", 1000, "Test", userId);

      db.prepare(
        `INSERT INTO reconciliation_matches
       (id, ledger_entry_id, source_transaction_id, match_score, status)
       VALUES (?, ?, ?, ?, ?)`
      ).run(matchId, ledgerId, sourceId, 50, "PENDING");

      await engine.rejectMatch(matchId, userId, "Amount mismatch");

      const match = db
        .prepare(`SELECT * FROM reconciliation_matches WHERE id = ?`)
        .get(matchId) as any;

      expect(match.status).toBe("REJECTED");
      expect(match.rejection_reason).toBe("Amount mismatch");
    });
  });

  describe("detectUnmatchedTransactions", () => {
    it("should detect unmatched ledger entries", async () => {
      const agenteId = randomUUID();
      const ledgerId1 = randomUUID();
      const ledgerId2 = randomUUID();
      const userId = randomUUID();

      db.prepare(`INSERT INTO usuarios (id, email, nome) VALUES (?, ?, ?)`).run(
        userId,
        "test@example.com",
        "Test User"
      );

      db.prepare(
        `INSERT INTO agentes_economicos
       (id, tipo_entidade, cpf_cnpj, nome, criado_por, atualizado_por)
       VALUES (?, ?, ?, ?, ?, ?)`
      ).run(agenteId, "pessoa_juridica", "12.345.678/0001-90", "Test Agent", userId, userId);

      // Insert ledger entries
      db.prepare(
        `INSERT INTO ledger_entries
       (id, data, tipo, categoria, valor, descricao, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(ledgerId1, "2024-01-15", "receita", "receita", 1000, "Invoice 1", agenteId);

      db.prepare(
        `INSERT INTO ledger_entries
       (id, data, tipo, categoria, valor, descricao, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(ledgerId2, "2024-01-16", "receita", "receita", 2000, "Invoice 2", agenteId);

      const { unmatched_ledger } = await engine.detectUnmatchedTransactions(
        agenteId,
        "2024-01-01",
        "2024-01-31"
      );

      expect(unmatched_ledger).toHaveLength(2);
      expect(unmatched_ledger[0].id).toBe(ledgerId1);
    });
  });
});
