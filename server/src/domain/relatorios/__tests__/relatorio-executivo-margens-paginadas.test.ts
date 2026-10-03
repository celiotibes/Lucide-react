/**
 * Testes para Margens Paginadas
 * Testa a função obterMargensRankingPaginado de margensPorPropriedade
 */

import { describe, it, expect } from "vitest";
import { obterMargensRankingPaginado } from "../margensPorPropriedade.js";
import Database from "better-sqlite3";

describe("Margens Paginadas - Ranking", () => {
  function criarTestDb(numImoveis: number = 5) {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");

    db.exec(`
      CREATE TABLE imoveis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL UNIQUE
      );

      CREATE TABLE margens_propriedades_periodo (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        imovel_id INTEGER NOT NULL,
        periodo TEXT NOT NULL,
        receita INTEGER NOT NULL,
        despesa INTEGER NOT NULL,
        margem REAL NOT NULL,
        status TEXT NOT NULL,
        calculado_em TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(imovel_id, periodo),
        FOREIGN KEY(imovel_id) REFERENCES imoveis(id)
      );
    `);

    // Inserir imóveis
    for (let i = 1; i <= numImoveis; i++) {
      db.prepare("INSERT INTO imoveis (nome) VALUES (?)").run(`Imóvel ${i}`);
    }

    return db;
  }

  it("deve retornar margens paginadas com limit padrão (50)", () => {
    const db = criarTestDb(3);

    // Inserir dados para 10/2026
    db.prepare(`
      INSERT INTO margens_propriedades_periodo
      (imovel_id, periodo, receita, despesa, margem, status)
      VALUES (1, '2026-10', 10000, 2000, 70, 'OK')
    `).run();

    db.prepare(`
      INSERT INTO margens_propriedades_periodo
      (imovel_id, periodo, receita, despesa, margem, status)
      VALUES (2, '2026-10', 20000, 4000, 65, 'OK')
    `).run();

    db.prepare(`
      INSERT INTO margens_propriedades_periodo
      (imovel_id, periodo, receita, despesa, margem, status)
      VALUES (3, '2026-10', 30000, 6000, 60, 'OK')
    `).run();

    const resultado = obterMargensRankingPaginado(db, 2026, 10);

    expect(resultado.items).toHaveLength(3);
    expect(resultado.total).toBe(3);
    expect(resultado.limit).toBe(50);
    expect(resultado.offset).toBe(0);
    expect(resultado.hasMore).toBe(false);
  });

  it("deve respeitar o parâmetro limit", () => {
    const db = criarTestDb(10);

    // Inserir margens para cada um
    for (let i = 1; i <= 10; i++) {
      db.prepare(`
        INSERT INTO margens_propriedades_periodo
        (imovel_id, periodo, receita, despesa, margem, status)
        VALUES (?, '2026-10', ?, ?, ?, 'OK')
      `).run(i, 10000 * i, 2000 * i, 50 + i);
    }

    const resultado = obterMargensRankingPaginado(db, 2026, 10, 3, 0);

    expect(resultado.items).toHaveLength(3);
    expect(resultado.limit).toBe(3);
    expect(resultado.hasMore).toBe(true);
  });

  it("deve respeitar o parâmetro offset", () => {
    const db = criarTestDb(10);

    // Inserir margens para cada um
    for (let i = 1; i <= 10; i++) {
      db.prepare(`
        INSERT INTO margens_propriedades_periodo
        (imovel_id, periodo, receita, despesa, margem, status)
        VALUES (?, '2026-10', ?, ?, ?, 'OK')
      `).run(i, 10000 * i, 2000 * i, 50 + i);
    }

    const resultado = obterMargensRankingPaginado(db, 2026, 10, 5, 5);

    expect(resultado.items).toHaveLength(5);
    expect(resultado.offset).toBe(5);
    expect(resultado.hasMore).toBe(false);
  });

  it("deve indicar hasMore=true quando há mais dados", () => {
    const db = criarTestDb(20);

    // Inserir margens para cada um
    for (let i = 1; i <= 20; i++) {
      db.prepare(`
        INSERT INTO margens_propriedades_periodo
        (imovel_id, periodo, receita, despesa, margem, status)
        VALUES (?, '2026-10', ?, ?, ?, 'OK')
      `).run(i, 10000 * i, 2000 * i, 30 + i);
    }

    const resultado = obterMargensRankingPaginado(db, 2026, 10, 10, 0);

    expect(resultado.items).toHaveLength(10);
    expect(resultado.total).toBe(20);
    expect(resultado.hasMore).toBe(true);
  });

  it("deve ordenar margens em ordem descendente", () => {
    const db = criarTestDb(3);

    // Inserir 3 registros com margens diferentes
    db.prepare(`
      INSERT INTO margens_propriedades_periodo
      (imovel_id, periodo, receita, despesa, margem, status)
      VALUES (1, '2026-10', 10000, 2000, 80, 'OK')
    `).run();

    db.prepare(`
      INSERT INTO margens_propriedades_periodo
      (imovel_id, periodo, receita, despesa, margem, status)
      VALUES (2, '2026-10', 10000, 5000, 50, 'OK')
    `).run();

    db.prepare(`
      INSERT INTO margens_propriedades_periodo
      (imovel_id, periodo, receita, despesa, margem, status)
      VALUES (3, '2026-10', 10000, 1000, 90, 'OK')
    `).run();

    const resultado = obterMargensRankingPaginado(db, 2026, 10);

    expect(resultado.items[0].margem).toBe(90); // Maior margem primeiro
    expect(resultado.items[1].margem).toBe(80);
    expect(resultado.items[2].margem).toBe(50); // Menor margem por último
  });

  it("deve retornar empty array para período sem dados", () => {
    const db = criarTestDb(3);

    const resultado = obterMargensRankingPaginado(db, 2026, 10);

    expect(resultado.items).toHaveLength(0);
    expect(resultado.total).toBe(0);
    expect(resultado.hasMore).toBe(false);
  });

  it("deve retornar mediaGeral corretamente", () => {
    const db = criarTestDb(3);

    // Inserir 3 registros com margens conhecidas
    db.prepare(`
      INSERT INTO margens_propriedades_periodo
      (imovel_id, periodo, receita, despesa, margem, status)
      VALUES (1, '2026-10', 10000, 2000, 60, 'OK')
    `).run();

    db.prepare(`
      INSERT INTO margens_propriedades_periodo
      (imovel_id, periodo, receita, despesa, margem, status)
      VALUES (2, '2026-10', 10000, 2000, 70, 'OK')
    `).run();

    db.prepare(`
      INSERT INTO margens_propriedades_periodo
      (imovel_id, periodo, receita, despesa, margem, status)
      VALUES (3, '2026-10', 10000, 2000, 80, 'OK')
    `).run();

    const resultado = obterMargensRankingPaginado(db, 2026, 10);

    expect(resultado.mediaGeral).toBe(70); // (60 + 70 + 80) / 3 = 70
  });

  it("deve retornar status dos itens corretamente", () => {
    const db = criarTestDb(3);

    db.prepare(`
      INSERT INTO margens_propriedades_periodo
      (imovel_id, periodo, receita, despesa, margem, status)
      VALUES (1, '2026-10', 10000, 2000, 80, 'OK')
    `).run();

    db.prepare(`
      INSERT INTO margens_propriedades_periodo
      (imovel_id, periodo, receita, despesa, margem, status)
      VALUES (2, '2026-10', 10000, 2000, 60, 'ATENÇÃO')
    `).run();

    db.prepare(`
      INSERT INTO margens_propriedades_periodo
      (imovel_id, periodo, receita, despesa, margem, status)
      VALUES (3, '2026-10', 10000, 2000, 30, 'CRÍTICO')
    `).run();

    const resultado = obterMargensRankingPaginado(db, 2026, 10, 10, 0);

    expect(resultado.items[0].status).toBe("OK");
    expect(resultado.items[1].status).toBe("ATENÇÃO");
    expect(resultado.items[2].status).toBe("CRÍTICO");
  });
});
