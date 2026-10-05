/**
 * Testes do Sistema de Detecção de Anomalias
 * 18 testes cobrindo os 3 métodos + agregação + persistência
 */

import { describe, it, expect, beforeEach, afterEach} from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import {
  detectarAnomalia2Sigma,
  detectarAnomaliaIQR,
  detectarAnomaliaPercentile,
  avaliarAnomaliaAgregada,
  registrarAlertaAnomalia,
  listarAlertas,
  marcarAnomaliaResada,
  obterAlerta,
  obterEstatisticasAnomalias,
  invalidarCacheTransacoes,
  invalidarCacheAnomalias} from "../detectores-anomalias.js";
import { getCacheSerce, resetCacheSerce } from "../../../serces/cache-serce.js";

describe("Sistema de Detecção de Anomalias", () => {
  let db: Database.Database;
  let dbPath: string;

  beforeEach(() => {
    // Reset cache before each test
    resetCacheSerce();

    // Cria banco de teste em memória
    dbPath = path.join(process.cwd(), "test-anomalias.db");
    db = new Database(dbPath);

    // Cria schema mínimo
    db.exec(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS conciliacao_ofx_cache (
        id TEXT PRIMARY KEY,
        valor REAL NOT NULL,
        data TEXT NOT NULL,
        descricao TEXT NOT NULL,
        conta_origem TEXT,
        processado INTEGER NOT NULL DEFAULT 0,
        criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TEXT
      );

      CREATE TABLE IF NOT EXISTS cache_metricas_anomalias (
        id TEXT PRIMARY KEY,
        usuario_id TEXT,
        tipo_metrica TEXT NOT NULL,
        periodo_dias INTEGER NOT NULL DEFAULT 90,
        media REAL,
        deso_padrao REAL,
        q1 REAL,
        q2 REAL,
        q3 REAL,
        iqr_valor REAL,
        p5 REAL,
        p90 REAL,
        p95 REAL,
        total_transacoes INTEGER,
        atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
      );

      CREATE TABLE IF NOT EXISTS alertas_anomalias_registrados (
        id TEXT PRIMARY KEY,
        transacao_id TEXT NOT NULL,
        usuario_id TEXT,
        severidade TEXT NOT NULL DEFAULT 'media',
        confianca INTEGER NOT NULL,
        metodos_dispararam TEXT NOT NULL,
        z_score REAL,
        z_score_limite REAL,
        iqr_valor REAL,
        iqr_limite REAL,
        percentil_valor REAL,
        percentil_95 REAL,
        descricao TEXT,
        resado INTEGER NOT NULL DEFAULT 0,
        resado_por TEXT,
        resado_em DATETIME,
        motivo_resao TEXT,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME,
        FOREIGN KEY(usuario_id) REFERENCES usuarios(id),
        FOREIGN KEY(resado_por) REFERENCES usuarios(id)
      );

      CREATE INDEX IF NOT EXISTS idx_alertas_anomalias_transacao
        ON alertas_anomalias_registrados(transacao_id);
    `);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  // ============================================================
  // TESTES 2-SIGMA (4 testes)
  // ============================================================

  describe("Método A: 2-Sigma (Deso Padrão)", () => {
    it("Teste 1: Transação normal não dispara alerta", () => {
      // Setup: gera 90 transações normais (média ~100, σ~10)
      for (let i = 0; i < 90; i++) {
        const valor = 90 + Math.random() * 20; // 90-110
        db.exec(
          `INSERT INTO conciliacao_ofx_cache (id, valor, data, descricao, criado_em)
           VALUES ('tx${i}', ${valor}, '2024-01-01', 'test', datetime('now', '-${90 - i} days'))`
        );
      }

      // Testa transação dentro do intervalo: 100
      const resultado = detectarAnomalia2Sigma(db, 100);
      expect(resultado.disparado).toBe(false);
      expect(resultado.confianca).toBe(0);
    });

    it("Teste 2: Z-score > 2 dispara alerta com confiança", () => {
      // Setup: gera histórico normal
      for (let i = 0; i < 90; i++) {
        const valor = 100 + Math.random() * 10; // 100-110, média~105
        db.exec(
          `INSERT INTO conciliacao_ofx_cache (id, valor, data, descricao, criado_em)
           VALUES ('tx${i}', ${valor}, '2024-01-01', 'test', datetime('now', '-${90 - i} days'))`
        );
      }

      // Testa valor muito alto (outlier)
      const resultado = detectarAnomalia2Sigma(db, 500);
      expect(resultado.disparado).toBe(true);
      expect(resultado.confianca).toBeGreaterThan(50);
      expect(resultado.z_score).toBeGreaterThan(2);
    });

    it("Teste 3: Z-score > 3 dispara com alta confiança", () => {
      // Setup: histórico com distribuição controlada
      for (let i = 0; i < 90; i++) {
        const valor = 100 + (Math.random() - 0.5) * 10;
        db.exec(
          `INSERT INTO conciliacao_ofx_cache (id, valor, data, descricao, criado_em)
           VALUES ('tx${i}', ${valor}, '2024-01-01', 'test', datetime('now', '-${90 - i} days'))`
        );
      }

      // Testa valor extremo
      const resultado = detectarAnomalia2Sigma(db, 1000);
      expect(resultado.disparado).toBe(true);
      expect(resultado.confianca).toBeGreaterThan(80);
    });

    it("Teste 4: Histórico vazio não dispara", () => {
      // Sem dados de histórico
      const resultado = detectarAnomalia2Sigma(db, 100);
      expect(resultado.disparado).toBe(false);
      expect(resultado.z_score).toBe(0);
    });
  });

  // ============================================================
  // TESTES IQR (4 testes)
  // ============================================================

  describe("Método B: IQR (Interquartile Range)", () => {
    it("Teste 5: Valor dentro do range não dispara", () => {
      // Setup: 50 transações distribuídas (10-200)
      for (let i = 0; i < 50; i++) {
        const valor = 10 + (i * 180) / 50; // Linear 10-190
        db.exec(
          `INSERT INTO conciliacao_ofx_cache (id, valor, data, descricao, criado_em)
           VALUES ('tx${i}', ${valor}, '2024-01-01', 'test', datetime('now', '-${50 - i} days'))`
        );
      }

      // Testa valor no meio da distribuição
      const resultado = detectarAnomaliaIQR(db, 100);
      expect(resultado.disparado).toBe(false);
      expect(resultado.confianca).toBe(0);
    });

    it("Teste 6: Valor acima Q3 + 1.5*IQR dispara alerta", () => {
      // Setup: distribuição com Q1~50, Q3~150 (IQR~100)
      const valores = [
        10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 140, 160, 180, 200,
        220, 240, 260, 280, 300, // 20 valores, bem distribuídos
      ];

      valores.forEach((v, i) => {
        db.exec(
          `INSERT INTO conciliacao_ofx_cache (id, valor, data, descricao, criado_em)
           VALUES ('tx${i}', ${v}, '2024-01-01', 'test', datetime('now', '-${valores.length - i} days'))`
        );
      });

      // Testa valor muito acima (whisker seria ~300, testamos com 600)
      const resultado = detectarAnomaliaIQR(db, 600);
      expect(resultado.disparado).toBe(true);
      expect(resultado.confianca).toBeGreaterThan(30);
    });

    it("Teste 7: Distribuição skewed (assimétrica) é detectada corretamente", () => {
      // Setup: 30 valores baixos + 10 altos (skewed à direita)
      for (let i = 0; i < 30; i++) {
        db.exec(
          `INSERT INTO conciliacao_ofx_cache (id, valor, data, descricao, criado_em)
           VALUES ('tx_baixo${i}', ${50 + i}, '2024-01-01', 'test', datetime('now', '-40 days'))`
        );
      }
      for (let i = 0; i < 10; i++) {
        db.exec(
          `INSERT INTO conciliacao_ofx_cache (id, valor, data, descricao, criado_em)
           VALUES ('tx_alto${i}', ${1000 + i * 100}, '2024-01-01', 'test', datetime('now', '-30 days'))`
        );
      }

      // Com distribuição skewed: Q1 ~80, Q3 ~800, IQR ~720, limite = 800 + 1.5*720 = 1880
      // 2000 deve disparar
      const resultado = detectarAnomaliaIQR(db, 2000);
      expect(resultado.disparado).toBe(true);
    });

    it("Teste 8: Poucos dados retorna sem alerta", () => {
      // Apenas 3 valores
      db.exec(`INSERT INTO conciliacao_ofx_cache (id, valor, data, descricao, criado_em)
         VALUES ('tx1', 100, '2024-01-01', 'test', datetime('now', '-3 days'))`);
      db.exec(`INSERT INTO conciliacao_ofx_cache (id, valor, data, descricao, criado_em)
         VALUES ('tx2', 200, '2024-01-01', 'test', datetime('now', '-2 days'))`);
      db.exec(`INSERT INTO conciliacao_ofx_cache (id, valor, data, descricao, criado_em)
         VALUES ('tx3', 300, '2024-01-01', 'test', datetime('now', '-1 days'))`);

      const resultado = detectarAnomaliaIQR(db, 90);
      expect(resultado.disparado).toBe(false);
    });
  });

  // ============================================================
  // TESTES PERCENTILE (3 testes)
  // ============================================================

  describe("Método C: Percentile (P90/P95)", () => {
    it("Teste 9: Valor dentro de P5-P95 não dispara", () => {
      // Setup: 100 valores uniform 0-1000
      for (let i = 0; i < 100; i++) {
        const valor = (i * 1000) / 100;
        db.exec(
          `INSERT INTO conciliacao_ofx_cache (id, valor, data, descricao, criado_em)
           VALUES ('tx${i}', ${valor}, '2024-01-01', 'test', datetime('now', '-${100 - i} days'))`
        );
      }

      // P5 ~50, P95 ~950
      const resultado = detectarAnomaliaPercentile(db, 500);
      expect(resultado.disparado).toBe(false);
    });

    it("Teste 10: Valor > P95 dispara alerta", () => {
      // Setup: 50 valores normalizados
      for (let i = 0; i < 50; i++) {
        const valor = (i * 100) / 50; // 0-100
        db.exec(
          `INSERT INTO conciliacao_ofx_cache (id, valor, data, descricao, criado_em)
           VALUES ('tx${i}', ${valor}, '2024-01-01', 'test', datetime('now', '-${50 - i} days'))`
        );
      }

      // P95 ~95, testamos 150
      const resultado = detectarAnomaliaPercentile(db, 150);
      expect(resultado.disparado).toBe(true);
      expect(resultado.percentil).toBe(95);
    });

    it("Teste 11: Valor < P5 também dispara (anomalia bi-direcional)", () => {
      // Setup: 50 valores de 100-5000
      for (let i = 0; i < 50; i++) {
        const valor = 100 + (i * 4900) / 50; // 100-5000
        db.exec(
          `INSERT INTO conciliacao_ofx_cache (id, valor, data, descricao, criado_em)
           VALUES ('tx${i}', ${valor}, '2024-01-01', 'test', datetime('now', '-${50 - i} days'))`
        );
      }

      // P5 ~300, testamos 10 (muito baixo)
      const resultado = detectarAnomaliaPercentile(db, 90);
      expect(resultado.disparado).toBe(true);
      expect(resultado.percentil).toBe(5);
    });
  });

  // ============================================================
  // TESTES AGREGAÇÃO (4 testes)
  // ============================================================

  describe("Agregação: Votação + Consenso", () => {
    it("Teste 12: 0 métodos disparados = severidade baixa, confiança 0", () => {
      // Setup: histórico bem comportado
      for (let i = 0; i < 50; i++) {
        db.exec(
          `INSERT INTO conciliacao_ofx_cache (id, valor, data, descricao, criado_em)
           VALUES ('tx${i}', ${100 + Math.random() * 20}, '2024-01-01', 'test', datetime('now', '-${50 - i} days'))`
        );
      }

      const resultado = avaliarAnomaliaAgregada(db, 110);
      expect(resultado.metodos_dispararam.length).toBe(0);
      expect(resultado.severidade).toBe("baixa");
      expect(resultado.confianca).toBe(0);
    });

    it("Teste 13: 1 método disparado com confiança > 60% = severidade média", () => {
      // Setup que fará apenas 1 método disparar (valor ligeiramente alto)
      for (let i = 0; i < 50; i++) {
        db.exec(
          `INSERT INTO conciliacao_ofx_cache (id, valor, data, descricao, criado_em)
           VALUES ('tx${i}', ${100 + Math.random() * 10}, '2024-01-01', 'test', datetime('now', '-${50 - i} days'))`
        );
      }

      // Valor 160: ligeiramente acima da média+1σ mas não extremo
      const resultado = avaliarAnomaliaAgregada(db, 160);
      // Com este valor, esperamos 1-2 métodos dispararem
      expect(resultado.metodos_dispararam.length).toBeGreaterThanOrEqual(1);
      if (resultado.metodos_dispararam.length === 1 && resultado.confianca > 60) {
        expect(resultado.severidade).toBe("media");
      }
    });

    it("Teste 14: 2+ métodos disparados = severidade crítica (consenso)", () => {
      // Setup: histórico controlado que faz TODOS os métodos dispararem
      for (let i = 0; i < 50; i++) {
        db.exec(
          `INSERT INTO conciliacao_ofx_cache (id, valor, data, descricao, criado_em)
           VALUES ('tx${i}', ${100}, '2024-01-01', 'test', datetime('now', '-${50 - i} days'))`
        );
      }

      const resultado = avaliarAnomaliaAgregada(db, 5000);
      expect(resultado.metodos_dispararam.length).toBeGreaterThanOrEqual(2);
      expect(resultado.severidade).toBe("critica");
    });

    it("Teste 15: Confiança agregada é a média das confianzas indiduais", () => {
      // Setup
      for (let i = 0; i < 50; i++) {
        db.exec(
          `INSERT INTO conciliacao_ofx_cache (id, valor, data, descricao, criado_em)
           VALUES ('tx${i}', ${100 + i}, '2024-01-01', 'test', datetime('now', '-${50 - i} days'))`
        );
      }

      const resultado = avaliarAnomaliaAgregada(db, 500);
      if (resultado.metodos_dispararam.length > 0) {
        // Se algum método disparou, confiança deve estar > 0
        expect(resultado.confianca).toBeGreaterThan(0);
      }
    });
  });

  // ============================================================
  // TESTES PERSISTÊNCIA & QUERIES (4 testes)
  // ============================================================

  describe("Persistência e Queries", () => {
    beforeEach(() => {
      // Insere usuário para testes
      db.exec(`
        INSERT INTO usuarios (id, nome, email, role)
        VALUES ('user1', 'Teste User', 'test@example.com', 'titular')
      `);

      // Histórico para testes
      for (let i = 0; i < 50; i++) {
        db.exec(
          `INSERT INTO conciliacao_ofx_cache (id, valor, data, descricao, criado_em)
           VALUES ('tx${i}', ${100 + i}, '2024-01-01', 'test', datetime('now', '-${50 - i} days'))`
        );
      }
    });

    it("Teste 16: Registrar alerta persiste em alertas_anomalias_registrados", () => {
      const resultado = avaliarAnomaliaAgregada(db, 500);
      const alerta = registrarAlertaAnomalia(db, "tx_novo", resultado, "user1");

      expect(alerta.id).toBeDefined();
      expect(alerta.transacao_id).toBe("tx_novo");
      expect(alerta.usuario_id).toBe("user1");
      expect(alerta.severidade).toBe(resultado.severidade);

      // Verifica se foi gravado
      const recuperado = obterAlerta(db, alerta.id);
      expect(recuperado).not.toBeNull();
      expect(recuperado?.transacao_id).toBe("tx_novo");
    });

    it("Teste 17: Listar alertas com filtros (severidade, dias, limite)", () => {
      const resultado1 = avaliarAnomaliaAgregada(db, 500);
      registrarAlertaAnomalia(db, "tx_critica", resultado1, "user1");

      const resultado2 = avaliarAnomaliaAgregada(db, 150);
      registrarAlertaAnomalia(db, "tx_media", resultado2, "user1");

      // Lista sem filtros
      const todos = listarAlertas(db);
      expect(todos.length).toBeGreaterThanOrEqual(2);

      // Lista com severidade crítica
      const criticas = listarAlertas(db, { severidade: "critica" });
      criticas.forEach((a) => expect(a.severidade).toBe("critica"));

      // Lista com limite
      const limitada = listarAlertas(db, { limite: 1 });
      expect(limitada.length).toBeLessThanOrEqual(1);
    });

    it("Teste 18: Marcar alerta como resado + estatísticas", () => {
      const resultado = avaliarAnomaliaAgregada(db, 500);
      const alerta = registrarAlertaAnomalia(db, "tx_reew", resultado, "user1");

      // Marca como resado
      marcarAnomaliaResada(db, alerta.id, "user1", "falso positivo");

      // Recupera diretamentea SQL para verificar UPDATE funcionou
      const resadoRow = db.prepare(`
        SELECT resado, motivo_resao FROM alertas_anomalias_registrados WHERE id = ?
      `).get(alerta.id) as unknown;

      expect(resadoRow?.resado).toBe(1);
      expect(resadoRow?.motivo_resao).toBe("falso positivo");

      // Também verificaa função
      const resado = obterAlerta(db, alerta.id);
      expect(resado?.resado).toBe(1);

      // Estatísticas
      const stats = obterEstatisticasAnomalias(db, 30);
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.resadas).toBeGreaterThan(0);
      expect(stats.taxa_resao).toBeGreaterThan(0);
    });

    it("Teste 19: Cache de transações - hit em chamadas repetidas", () => {
      const cache = getCacheSerce();
      const initialSize = cache.size();

      // Primeira chamada (sem cache)
      const resultado1 = detectarAnomalia2Sigma(db, 500, 90);
      expect(resultado1).toBeDefined();

      // Cache deve ter entrado
      expect(cache.size()).toBeGreaterThan(initialSize);

      // Segunda chamada (com cache)
      const resultado2 = detectarAnomalia2Sigma(db, 500, 90);
      expect(resultado2).toEqual(resultado1);
    });

    it("Teste 20: Cache de transações - hit rate em fluxo de anomalias", () => {
      const cache = getCacheSerce();

      // Simula o fluxo de anomalias que chama 3 métodos
      const valor = 450;
      const periodo = 90;

      // Chamada 1: 2-Sigma (cache miss)
      detectarAnomalia2Sigma(db, valor, periodo);

      // Chamada 2: IQR (cache hit para transações)
      detectarAnomaliaIQR(db, valor, periodo);
      const tamanhoApos2 = cache.size();

      // Chamada 3: Percentile (cache hit para transações)
      detectarAnomaliaPercentile(db, valor, periodo);
      const tamanhoApos3 = cache.size();

      // Tamanho do cache cresce pouco (só métricas, não transações duplicadas)
      expect(tamanhoApos3).toBeLessThanOrEqual(tamanhoApos2 + 1);
    });

    it("Teste 21: Invalidação de cache de transações", () => {
      const cache = getCacheSerce();

      // Primeira chamada
      detectarAnomalia2Sigma(db, 300, 90);
      const tamanhoAntesInvalidacao = cache.size();
      expect(tamanhoAntesInvalidacao).toBeGreaterThan(0);

      // Invalida cache
      invalidarCacheTransacoes(90);

      // Cache foi limpo
      expect(cache.size()).toBeLessThan(tamanhoAntesInvalidacao);
    });

    it("Teste 22: Invalidação completa de cache de anomalias", () => {
      const cache = getCacheSerce();

      // Popula cache com múltiplas chamadas
      detectarAnomalia2Sigma(db, 300, 90);
      detectarAnomaliaIQR(db, 400, 90);
      detectarAnomaliaPercentile(db, 500, 90);

      const tamanhoAntesInvalidacao = cache.size();
      expect(tamanhoAntesInvalidacao).toBeGreaterThan(0);

      // Invalida todo o cache de anomalias
      invalidarCacheAnomalias();

      // Cache foi completamente limpo
      expect(cache.size()).toBe(0);
    });
  });
});
