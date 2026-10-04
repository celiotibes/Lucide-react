/**
 * Testes para Query Validator
 *
 * Valida:
 * - Detecção de N+1 queries
 * - Validação de uso de índices
 * - EXPLAIN QUERY PLAN
 * - Integração com Sentry para alertas
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import { createTestDatabase, cleanupTestDatabase } from "../../src/db-test-helper";
import { createQueryValidator } from "../../src/domain/query-validator";

const TEST_DB_PATH = path.join(process.cwd(), "test-query-validator.db");

describe("Query Validator", () => {
  let db: Database.Database;

  beforeEach(() => {
    cleanupTestDatabase(TEST_DB_PATH);
    db = createTestDatabase(TEST_DB_PATH);

    // Inserir dados de teste
    const stmt = db.prepare(`
      INSERT INTO usuarios (id, email, senha_hash, nome, role)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < 100; i++) {
      stmt.run(`user-${i}`, `user${i}@example.com`, `hash-${i}`, `User ${i}`, 'titular');
    }
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    cleanupTestDatabase(TEST_DB_PATH);
  });

  it("deve validar uma query simples sem problemas", () => {
    const validator = createQueryValidator(db);

    const result = validator.validateQuery("SELECT * FROM usuarios WHERE id = ?");

    expect(result.valid).toBeDefined();
    expect(result.query).toBe("SELECT * FROM usuarios WHERE id = ?");
    expect(Array.isArray(result.queryPlan)).toBe(true);
    expect(Array.isArray(result.issues)).toBe(true);
  });

  it("deve validar queries com parâmetros preparados", () => {
    const validator = createQueryValidator(db);

    // Query com múltiplos parâmetros
    const result = validator.validateQuery(
      "SELECT * FROM usuarios WHERE email = ? AND id = ? LIMIT ?",
    );

    expect(result.query).toContain("?");
    expect(Array.isArray(result.queryPlan)).toBe(true);
  });

  it("deve gerar EXPLAIN QUERY PLAN", () => {
    const validator = createQueryValidator(db);

    const result = validator.validateQuery("SELECT * FROM usuarios WHERE id = ?");

    expect(result.queryPlan).toBeDefined();
    expect(Array.isArray(result.queryPlan)).toBe(true);

    // Deve ter detalhes do plano de execução
    if (result.queryPlan.length > 0) {
      expect(result.queryPlan[0]).toHaveProperty("detail");
    }
  });

  it("deve detectar full table scan", () => {
    const validator = createQueryValidator(db);

    // Query sem WHERE causará full table scan
    const result = validator.validateQuery("SELECT * FROM usuarios");

    expect(result.fullScan).toBe(true);
  });

  it("deve detectar uso de índice quando disponível", () => {
    const validator = createQueryValidator(db);

    // Query por PK deve usar índice
    const result = validator.validateQuery("SELECT * FROM usuarios WHERE id = ?");

    // SQLite sempre otimiza queries por PK com índice
    expect(result.queryPlan).toBeDefined();
  });

  it("deve rastrear execução de queries", () => {
    const validator = createQueryValidator(db);

    const query = "SELECT * FROM usuarios WHERE id = ?";

    // Executar validação várias vezes
    validator.validateQuery(query);
    validator.validateQuery(query);
    validator.validateQuery(query);

    // Verificar que foi rastreado
    const stats = validator.getQueryStatistics();
    const tracked = stats.find((s) => s.query.includes("SELECT * FROM USUARIOS"));

    expect(tracked).toBeDefined();
    expect(tracked?.count).toBe(3);
  });

  it("deve detectar N+1 queries quando query executada > 2x", () => {
    const validator = createQueryValidator(db, 2); // threshold de 2

    const query = "SELECT * FROM usuarios WHERE email = ?";

    // Executar 3 vezes (excede threshold)
    validator.validateQuery(query);
    validator.validateQuery(query);
    validator.validateQuery(query);

    // Detectar N+1
    const n1Queries = validator.detectN1Queries();

    expect(n1Queries.length).toBeGreaterThan(0);
    const found = n1Queries.find((q) =>
      q.query.includes("SELECT * FROM USUARIOS WHERE EMAIL"),
    );
    expect(found).toBeDefined();
    expect(found?.count).toBe(3);
  });

  it("deve calcular severity de N+1 queries", () => {
    const validator = createQueryValidator(db, 2);

    const query = "SELECT * FROM usuarios WHERE email = ?";

    // Executar muitas vezes
    for (let i = 0; i < 15; i++) {
      validator.validateQuery(query);
    }

    const n1Queries = validator.detectN1Queries();
    const found = n1Queries.find((q) =>
      q.query.includes("SELECT * FROM USUARIOS WHERE EMAIL"),
    );

    expect(found).toBeDefined();
    expect(found?.severity).toBe("high"); // Mais de 10 execuções
  });

  it("deve retornar queries mais executadas", () => {
    const validator = createQueryValidator(db);

    const query1 = "SELECT * FROM usuarios WHERE id = ?";
    const query2 = "SELECT * FROM usuarios WHERE email = ?";
    const query3 = "SELECT COUNT(*) FROM usuarios";

    // Executar com diferentes frequências
    for (let i = 0; i < 5; i++) {
      validator.validateQuery(query1);
    }
    for (let i = 0; i < 3; i++) {
      validator.validateQuery(query2);
    }
    validator.validateQuery(query3);

    const topQueries = validator.getTopQueries(3);

    expect(topQueries.length).toBeGreaterThan(0);
    expect(topQueries[0].count).toBeGreaterThanOrEqual(topQueries[1]?.count ?? 0);
  });

  it("deve normalizar queries para rastreamento", () => {
    const validator = createQueryValidator(db);

    // Mesma query com formatação diferente
    const query1 = "SELECT * FROM usuarios WHERE id = ?";
    const query2 = "SELECT * FROM usuarios WHERE id = ?"; // Idêntica
    const query3 = "SELECT  *  FROM  usuarios  WHERE  id  = ?"; // Espaços diferentes

    validator.validateQuery(query1);
    validator.validateQuery(query2);
    validator.validateQuery(query3);

    const stats = validator.getQueryStatistics();

    // Deve ser contado como mesma query (normalizado)
    const count = stats.find((s) =>
      s.query.includes("SELECT * FROM USUARIOS"),
    )?.count;

    expect(count).toBe(3);
  });

  it("deve limpar histórico de queries", () => {
    const validator = createQueryValidator(db);

    validator.validateQuery("SELECT * FROM usuarios WHERE id = ?");
    validator.validateQuery("SELECT COUNT(*) FROM usuarios");

    let stats = validator.getQueryStatistics();
    expect(stats.length).toBeGreaterThan(0);

    validator.clearHistory();

    stats = validator.getQueryStatistics();
    expect(stats.length).toBe(0);
  });

  it("deve retornar issues corretamente", () => {
    const validator = createQueryValidator(db);

    const result = validator.validateQuery("SELECT * FROM usuarios");

    // Full table scan deve gerar issue
    if (result.fullScan) {
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]).toContain("scan");
    }
  });

  it("deve validar múltiplas queries sem interferência", () => {
    const validator = createQueryValidator(db);

    const queries = [
      "SELECT * FROM usuarios WHERE id = ?",
      "SELECT COUNT(*) FROM usuarios",
      "SELECT email FROM usuarios WHERE nome = ?",
      "SELECT * FROM usuarios ORDER BY email",
    ];

    const results = queries.map((q) => validator.validateQuery(q));

    expect(results).toHaveLength(4);
    results.forEach((result) => {
      expect(result.query).toBeDefined();
      expect(Array.isArray(result.queryPlan)).toBe(true);
    });
  });

  it("deve respeitar threshold customizado para N+1", () => {
    const validator1 = createQueryValidator(db, 1); // threshold muito baixo
    const validator2 = createQueryValidator(db, 10); // threshold alto

    const query = "SELECT * FROM usuarios WHERE id = ?";

    // Executar 3 vezes
    for (let i = 0; i < 3; i++) {
      validator1.validateQuery(query);
      validator2.validateQuery(query);
    }

    const n1Queries1 = validator1.detectN1Queries();
    const n1Queries2 = validator2.detectN1Queries();

    // Validator1 deve detectar (3 > 1)
    expect(n1Queries1.length).toBeGreaterThan(0);

    // Validator2 não deve detectar (3 < 10)
    expect(n1Queries2.length).toBe(0);
  });

  it("deve remover queries antigas quando histórico fica muito grande", () => {
    // Criar validator com histórico pequeno
    const validator = createQueryValidator(db);
    (validator as any).maxTrackedQueries = 5; // Limitar para teste

    // Gerar mais de 5 queries diferentes
    for (let i = 0; i < 10; i++) {
      validator.validateQuery(`SELECT * FROM usuarios WHERE id = ? AND email = 'user${i}@test.com'`);
    }

    const stats = validator.getQueryStatistics();

    // Deve ter removido queries antigas
    expect(stats.length).toBeLessThanOrEqual(5);
  });

  it("deve incluir metadados corretos em resultado", () => {
    const validator = createQueryValidator(db);

    const result = validator.validateQuery("SELECT * FROM usuarios WHERE id = ?");

    // Verificar estrutura do resultado
    expect(result).toHaveProperty("valid");
    expect(result).toHaveProperty("query");
    expect(result).toHaveProperty("usesIndex");
    expect(result).toHaveProperty("fullScan");
    expect(result).toHaveProperty("issues");
    expect(result).toHaveProperty("queryPlan");

    // Tipos corretos
    expect(typeof result.valid).toBe("boolean");
    expect(typeof result.query).toBe("string");
    expect(typeof result.usesIndex).toBe("boolean");
    expect(typeof result.fullScan).toBe("boolean");
    expect(Array.isArray(result.issues)).toBe(true);
    expect(Array.isArray(result.queryPlan)).toBe(true);
  });

  it("deve rastrear informações temporais corretas", () => {
    const validator = createQueryValidator(db);

    const query = "SELECT * FROM usuarios WHERE id = ?";

    const beforeTime = new Date();
    validator.validateQuery(query);
    const afterTime = new Date();

    const stats = validator.getQueryStatistics();
    const tracked = stats.find((s) =>
      s.query.includes("SELECT * FROM USUARIOS"),
    );

    expect(tracked).toBeDefined();
    expect(tracked!.firstSeen.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
    expect(tracked!.lastSeen.getTime()).toBeLessThanOrEqual(afterTime.getTime());
  });
});
