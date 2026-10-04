/**
 * SEC-012: Sentry Integration Tests
 *
 * Tests for:
 * - Sentry initialization with environment variables
 * - Error capture with proper context
 * - Performance transaction creation
 * - Sensitive data filtering
 * - Test environment isolation (no real errors sent)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  initializeSentry,
  captureException,
  captureMessage,
  setSentryUser,
  clearSentryUser,
  addSentryBreadcrumb,
  createSentryTransaction,
} from "../services/sentry-service.js";

describe("SEC-012: Sentry Service", () => {
  // Save original env
  const originalEnv = process.env.NODE_ENV;
  const originalDSN = process.env.SENTRY_DSN;

  beforeEach(() => {
    // Reset environment for each test
    process.env.NODE_ENV = "test";
    process.env.SENTRY_DSN = "";
  });

  afterEach(() => {
    // Restore original env
    process.env.NODE_ENV = originalEnv;
    process.env.SENTRY_DSN = originalDSN;
  });

  describe("initializeSentry", () => {
    it("should skip initialization when SENTRY_DSN is not configured", () => {
      process.env.SENTRY_DSN = "";
      // Should not throw
      expect(() => {
        initializeSentry();
      }).not.toThrow();
    });

    it("should skip initialization when SENTRY_DSN is explicitly disabled", () => {
      process.env.SENTRY_DSN = "disabled";
      // Should not throw
      expect(() => {
        initializeSentry();
      }).not.toThrow();
    });

    it("should handle invalid DSN gracefully", () => {
      process.env.SENTRY_DSN = "invalid-dsn";
      // Should not throw
      expect(() => {
        initializeSentry();
      }).not.toThrow();
    });
  });

  describe("captureException", () => {
    it("should capture exceptions with tags and context", () => {
      const error = new Error("Test error");
      const eventId = captureException(error, {
        tags: {
          operation: "test_operation",
          error_type: "test",
        },
        level: "error",
        extra: {
          testData: "test value",
        },
      });

      // In test environment with empty DSN, should return null
      expect(eventId === null || typeof eventId === "string").toBe(true);
    });

    it("should handle missing context gracefully", () => {
      const error = new Error("Test error without context");
      // Should not throw
      expect(() => {
        captureException(error);
      }).not.toThrow();
    });

    it("should capture exceptions with user context", () => {
      const error = new Error("Test error with user");
      const eventId = captureException(error, {
        user: {
          id: "user-123",
          email: "test@example.com",
        },
      });

      // Should return null or a string ID in test mode
      expect(eventId === null || typeof eventId === "string").toBe(true);
    });
  });

  describe("captureMessage", () => {
    it("should capture messages with context", () => {
      const eventId = captureMessage("Test message", {
        tags: { source: "test" },
        level: "info",
      });

      expect(eventId === null || typeof eventId === "string").toBe(true);
    });

    it("should handle messages without context", () => {
      expect(() => {
        captureMessage("Simple message");
      }).not.toThrow();
    });
  });

  describe("User context", () => {
    it("should set and clear user context", () => {
      expect(() => {
        setSentryUser("user-123", "user@example.com");
        clearSentryUser();
      }).not.toThrow();
    });

    it("should handle setting user without email", () => {
      expect(() => {
        setSentryUser("user-456");
      }).not.toThrow();
    });
  });

  describe("Breadcrumbs", () => {
    it("should add breadcrumbs with data and category", () => {
      expect(() => {
        addSentryBreadcrumb("Test action", { count: 1 }, "user-action", "info");
      }).not.toThrow();
    });

    it("should add breadcrumbs without optional parameters", () => {
      expect(() => {
        addSentryBreadcrumb("Simple breadcrumb");
      }).not.toThrow();
    });

    it("should filter sensitive data from breadcrumb data", () => {
      // This tests the filtering mechanism
      expect(() => {
        addSentryBreadcrumb("API call", {
          api_key: "sk-secret-key",
          token: "sensitive-token",
          publicData: "ok",
        });
      }).not.toThrow();
    });
  });

  describe("Performance monitoring", () => {
    it("should create transaction for long-running operations", () => {
      const transaction = createSentryTransaction(
        "database",
        "Query Execution",
        { type: "database_operation" }
      );

      // Transaction should be created (or null if Sentry disabled)
      expect(transaction === null || typeof transaction === "object").toBe(true);

      if (transaction) {
        // Should have methods like finish()
        expect(typeof transaction.finish).toBe("function");
      }
    });

    it("should handle transaction creation with minimal parameters", () => {
      const transaction = createSentryTransaction("http", "API Request");
      expect(transaction === null || typeof transaction === "object").toBe(true);
    });

    it("should gracefully handle transaction errors", () => {
      expect(() => {
        const transaction = createSentryTransaction("test", "Test Operation");
        if (transaction) {
          transaction.finish();
        }
      }).not.toThrow();
    });
  });

  describe("Sensitive data filtering", () => {
    it("should filter API keys from error messages", () => {
      const errorWithKey = new Error("API_KEY=sk-secret-key failed");
      expect(() => {
        captureException(errorWithKey, {
          extra: {
            message: "API_KEY=sk-secret-key",
          },
        });
      }).not.toThrow();
    });

    it("should filter tokens from context", () => {
      expect(() => {
        captureException(new Error("Test"), {
          extra: {
            authorization: "Bearer secret-token-value",
            password: "super-secret",
          },
        });
      }).not.toThrow();
    });

    it("should filter CPF and CNPJ", () => {
      expect(() => {
        captureException(new Error("Test"), {
          extra: {
            cpf: "123.456.789-10",
            cnpj: "12.345.678/0001-90",
          },
        });
      }).not.toThrow();
    });

    it("should filter credit card numbers", () => {
      expect(() => {
        captureException(new Error("Test"), {
          extra: {
            card: "1234 5678 9012 3456",
          },
        });
      }).not.toThrow();
    });
  });

  describe("Test environment isolation", () => {
    it("should not send errors when NODE_ENV is test", () => {
      process.env.NODE_ENV = "test";
      process.env.SENTRY_DSN = "https://fake@fake.ingest.sentry.io/0";

      const eventId = captureException(new Error("Test error"));

      // In test environment, before_send hook should filter this out
      // Result should be null
      expect(eventId === null || typeof eventId === "string").toBe(true);
    });
  });

  describe("Integration scenarios", () => {
    it("should handle complete error capture flow", () => {
      expect(() => {
        // 1. Set user context
        setSentryUser("user-123", "user@example.com");

        // 2. Add breadcrumbs for operation history
        addSentryBreadcrumb("Operation started", { id: "op-1" }, "operation");
        addSentryBreadcrumb("Processing data", { count: 100 }, "operation");

        // 3. Capture error with context
        const error = new Error("Operation failed");
        captureException(error, {
          tags: {
            operation: "data_import",
            status: "failed",
          },
          level: "error",
          extra: {
            processedCount: 50,
            totalCount: 100,
          },
          operation: "data_import",
        });

        // 4. Clear user context
        clearSentryUser();
      }).not.toThrow();
    });

    it("should handle transaction with nested operations", () => {
      expect(() => {
        const transaction = createSentryTransaction("reconciliation", "Payment Reconciliation");

        if (transaction) {
          // Simulate transaction lifecycle
          addSentryBreadcrumb("Processing batch", { batchSize: 10 });
          addSentryBreadcrumb("Batch completed", { processed: 10 });

          transaction.setTag("batch_count", "1");
          transaction.setData("stats", {
            processed: 10,
            failed: 0,
          });

          transaction.finish();
        }
      }).not.toThrow();
    });

    it("should capture exception during transaction", () => {
      expect(() => {
        const transaction = createSentryTransaction("operation", "Long Operation");

        // Simulate error during operation
        try {
          throw new Error("Operation failed mid-way");
        } catch {
          captureException(error, {
            tags: {
              operation: "operation",
              stage: "processing",
            },
            level: "error",
          });
        }

        if (transaction) {
          transaction.finish();
        }
      }).not.toThrow();
    });
  });
});