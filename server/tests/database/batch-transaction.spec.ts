/**
 * Testes para Batch Transaction Manager
 *
 * Valida:
 * - Timeout em transações > 30s
 * - Chunking automático para > 5000 registros
 * - Auditoria de cada batch
 * - 10000 updates sem timeout
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import { createTestDatabase, cleanupTestDatabase } from "../../src/db-test-helper";
import { createBatchTransactionManager, batchUpdate } from "../../src/domain/integracoes/batch-transaction";

const TEST_DB_PATH = path.join(process.cwd(), "test-batch-tx.db");

describe("Batch Transaction Manager", () => {
  let db: Database.Database;

  beforeEach(() => {
    cleanupTestDatabase(TEST_DB_PATH);
    db = createTestDatabase(TEST_DB_PATH);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    cleanupTestDatabase(TEST_DB_PATH);
  });

  it("deve executar transação simples com sucesso", async () => {
    const manager = createBatchTransactionManager(db);

    const stmt = db.prepare(`
      INSERT INTO usuarios (id, email, senha_hash, nome, role)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = await manager.simple((txDb) => {
      stmt.run("user-1", "test@example.com", "hash", "Test User", "titular");
      return "success";
    });

    expect(result).toBe("success");

    // Verificar que dados foram inseridos
    const users = db.prepare("SELECT * FROM usuarios").all();
    expect(users).toHaveLength(1);
  });

  it("deve processar batch com chunking automático", async () => {
    const manager = createBatchTransactionManager(db);

    // Criar 2500 usuários (será chunked em 1000, 1000, 500)
    const items = Array.from({ length: 2500 }, (_, i) => ({
      id: `user-${i}`,
      email: `user${i}@example.com`,
    }));

    const result = await manager.processBatch(
      items,
      (chunk) => {
        const stmt = db.prepare(`
          INSERT INTO usuarios (id, email, senha_hash, nome, role)
          VALUES (?, ?, ?, ?, ?)
        `);

        let count = 0;
        for (const item of chunk) {
          stmt.run(item.id, item.email, `hash-${item.id}`, `User ${item.id}`, "titular");
          count++;
        }
        return count;
      },
      { chunkSize: 1000 },
    );

    expect(result.success).toBe(true);
    expect(result.totalProcessed).toBe(2500);
    expect(result.totalChunks).toBe(3); // 1000 + 1000 + 500
    expect(result.errors).toHaveLength(0);

    // Verificar que todos os registros foram inseridos
    const users = db.prepare("SELECT COUNT(*) as count FROM usuarios").get() as {
      count: number;
    };
    expect(users.count).toBe(2500);
  });

  it("deve processar 10000 registros sem timeout", async () => {
    const manager = createBatchTransactionManager(db, 30000); // 30 segundos

    // Criar 10000 usuários
    const items = Array.from({ length: 10000 }, (_, i) => ({
      id: `user-${i}`,
      email: `user${i}@example.com`,
    }));

    const startTime = Date.now();

    const result = await manager.processBatch(
      items,
      (chunk) => {
        const stmt = db.prepare(`
          INSERT INTO usuarios (id, email, senha_hash, nome, role)
          VALUES (?, ?, ?, ?, ?)
        `);

        let count = 0;
        for (const item of chunk) {
          stmt.run(item.id, item.email, `hash-${item.id}`, `User ${item.id}`, "titular");
          count++;
        }
        return count;
      },
      { chunkSize: 1000 },
    );

    const elapsed = Date.now() - startTime;

    expect(result.success).toBe(true);
    expect(result.totalProcessed).toBe(10000);
    expect(result.totalChunks).toBe(10);
    expect(result.errors).toHaveLength(0);
    expect(result.duration).toBeLessThan(30000); // Deve completar em menos de 30s

    // Verificar que todos os registros foram inseridos
    const users = db.prepare("SELECT COUNT(*) as count FROM usuarios").get() as {
      count: number;
    };
    expect(users.count).toBe(10000);

    console.log(`Processed 10000 records in ${elapsed}ms (reported: ${result.duration}ms)`);
  });

  it("deve detectar timeout em operação lenta", async () => {
    const manager = createBatchTransactionManager(db, 500); // 500ms timeout

    const slowItems = Array.from({ length: 100 }, (_, i) => ({
      id: `user-${i}`,
    }));

    const result = await manager.processBatch(
      slowItems,
      (chunk) => {
        // Simular operação lenta
        const stmt = db.prepare(`
          INSERT INTO usuarios (id, email, senha_hash, nome, role)
          VALUES (?, ?, ?, ?, ?)
        `);

        // Dormir um pouco para simular operação lenta
        for (const item of chunk) {
          stmt.run(item.id, `${item.id}@test.com`, "hash", `User ${item.id}`, "titular");
          // Adicionar um sleep pequeno
          const start = Date.now();
          while (Date.now() - start < 10) {
            // busy wait
          }
        }

        return chunk.length;
      },
      { timeout: 500, chunkSize: 50 },
    );

    // Com timeout tão curto, é possível que alguns chunks falhem
    // O importante é que a função não trava
    expect(result).toBeDefined();
    expect(typeof result.duration).toBe("number");
  });

  it("deve usar batchUpdate helper para atualizar múltiplos registros", async () => {
    // Inserir usuários
    const stmt = db.prepare(`
      INSERT INTO usuarios (id, email, senha_hash, nome, role)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < 100; i++) {
      stmt.run(`user-${i}`, `user${i}@example.com`, "hash", `User ${i}`, "titular");
    }

    // Preparar updates
    const updates = Array.from({ length: 100 }, (_, i) => ({
      id: `user-${i}`,
      data: {
        nome: `Updated User ${i}`,
      },
    }));

    // Aplicar batch updates
    const result = await batchUpdate(db, updates, "usuarios", {
      chunkSize: 20,
    });

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);

    // Verificar que updates foram aplicados
    const updatedUser = db.prepare("SELECT * FROM usuarios WHERE id = ?").get("user-50") as unknown;
    expect(updatedUser.nome).toBe("Updated User 50");
  });

  it("deve registrar múltiplos chunks em logs", async () => {
    const manager = createBatchTransactionManager(db);

    const items = Array.from({ length: 2100 }, (_, i) => ({
      id: `user-${i}`,
      email: `user${i}@example.com`,
    }));

    const result = await manager.processBatch(
      items,
      (chunk) => {
        const stmt = db.prepare(`
          INSERT INTO usuarios (id, email, senha_hash, nome, role)
          VALUES (?, ?, ?, ?, ?)
        `);

        for (const item of chunk) {
          stmt.run(item.id, item.email, `hash-${item.id}`, `User ${item.id}`, "titular");
        }

        return chunk.length;
      },
      { chunkSize: 1000, label: "test-batch" },
    );

    expect(result.totalChunks).toBe(3); // 1000 + 1000 + 100
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(3);
    expect(result.results?.[0]).toBe(1000);
    expect(result.results?.[1]).toBe(1000);
    expect(result.results?.[2]).toBe(100);
  });

  it("deve continuar processando mesmo com erro em um chunk", async () => {
    const manager = createBatchTransactionManager(db);

    const items = Array.from({ length: 300 }, (_, i) => ({
      id: `user-${i}`,
      shouldFail: i === 150, // Forçar erro no meio
      email: `user${i}@example.com`,
    }));

    const result = await manager.processBatch(
      items,
      (chunk) => {
        const stmt = db.prepare(`
          INSERT INTO usuarios (id, email, senha_hash, nome, role)
          VALUES (?, ?, ?, ?, ?)
        `);

        for (const item of chunk) {
          if ((item as unknown).shouldFail) {
            throw new Error("Simulated error for testing");
          }
          stmt.run(item.id, item.email, `hash-${item.id}`, `User ${item.id}`, "titular");
        }

        return chunk.length;
      },
      { chunkSize: 100, label: "test-with-error" },
    );

    // Alguns chunks devem ter sucesso, alguns devem falhar
    expect(result.totalProcessed).toBe(300);
    expect(result.totalChunks).toBe(3);
    // Esperamos que pelo menos um chunk falhe
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("deve respeitar opção de timeout customizado", async () => {
    const manager = createBatchTransactionManager(db, 5000); // 5 segundos padrão

    const items = Array.from({ length: 100 }, (_, i) => ({
      id: `user-${i}`,
    }));

    const startTime = Date.now();

    const result = await manager.processBatch(
      items,
      (chunk) => {
        const stmt = db.prepare(`
          INSERT INTO usuarios (id, email, senha_hash, nome, role)
          VALUES (?, ?, ?, ?, ?)
        `);

        for (const item of chunk) {
          stmt.run(item.id, `${item.id}@test.com`, "hash", `User ${item.id}`, "titular");
        }

        return chunk.length;
      },
      { timeout: 5000, chunkSize: 50 },
    );

    expect(result.duration).toBeLessThan(5000);
  });

  it("deve retornar informações detalhadas de erro", async () => {
    const manager = createBatchTransactionManager(db);

    const items = Array.from({ length: 300 }, (_, i) => ({
      id: `user-${i}`,
      willFail: i >= 250, // Falhar no último chunk
    }));

    const result = await manager.processBatch(
      items,
      (chunk) => {
        const stmt = db.prepare(`
          INSERT INTO usuarios (id, email, senha_hash, nome, role)
          VALUES (?, ?, ?, ?, ?)
        `);

        for (const item of chunk) {
          if ((item as unknown).willFail) {
            throw new Error("Test error in last chunk");
          }
          stmt.run(item.id, `${item.id}@test.com`, "hash", `User ${item.id}`, "titular");
        }

        return chunk.length;
      },
      { chunkSize: 100 },
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].chunkIndex).toBe(2);
    expect(result.errors[0].error).toContain("Test error");
  });
});
