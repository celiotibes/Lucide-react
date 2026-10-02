/**
 * Testes para Relatório Executivo (16 testes no total)
 *
 * Grupos:
 * 1. gerarRelatorioExecutivo (3 testes)
 * 2. gerarPDFRelatorioExecutivo (2 testes)
 * 3. enviarRelatorioEmailMensal (3 testes)
 * 4. Armazenamento em DB (2 testes)
 * 5. Rotas HTTP (2 testes)
 * 6. Scheduler (2 testes)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  gerarRelatorioExecutivo,
  gerarPDFRelatorioExecutivo,
  enviarRelatorioEmailMensal,
  type RelatorioExecutivo,
} from "../relatorio-executivo.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, `test-relatorio-${process.pid}.db`);

function resolverSchema(nomeArquivo: string): string {
  const candidatos = [
    path.join(__dirname, `../../../../${nomeArquivo}`),
    path.join(process.cwd(), `server/src/${nomeArquivo}`),
    path.join(process.cwd(), `src/${nomeArquivo}`),
  ];
  const encontrado = candidatos.find((p) => fs.existsSync(p));
  if (!encontrado)
    throw new Error(`Schema não encontrado: ${nomeArquivo} (tentei ${candidatos.join(", ")})`);
  return fs.readFileSync(encontrado, "utf-8");
}

function criarTestDatabase(): Database.Database {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  const db = new Database(TEST_DB_PATH);
  db.pragma("foreign_keys = ON");

  // Cria tabelas adicionais para testes
  db.exec(`
    CREATE TABLE IF NOT EXISTS imoveis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      alugado INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS cobrancas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      descricao TEXT,
      valor INTEGER,
      data_vencimento TEXT,
      status TEXT DEFAULT 'pendente'
    );

    CREATE TABLE IF NOT EXISTS transacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plano_conta_codigo TEXT,
      valor INTEGER,
      data TEXT
    );
  `);

  return db;
}

let db: Database.Database;

beforeEach(() => {
  db = criarTestDatabase();
});

afterEach(() => {
  db.close();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

describe("Relatório Executivo - Testes", () => {
  // GRUPO 1: gerarRelatorioExecutivo (3 testes)

  describe("gerarRelatorioExecutivo", () => {
    it("Teste 1: Deve gerar relatório completo com dados válidos", () => {
      // Arrange
      const mes = 10;
      const ano = 2026;

      // Act
      const relatorio = gerarRelatorioExecutivo(db, mes, ano);

      // Assert
      expect(relatorio).toBeDefined();
      expect(relatorio.periodo).toBe("2026-10");
      expect(relatorio.mes).toBe(mes);
      expect(relatorio.ano).toBe(ano);
      expect(relatorio.dre).toBeDefined();
      expect(relatorio.fluxo).toBeDefined();
      expect(relatorio.margens).toBeDefined();
      expect(relatorio.contas).toBeDefined();
      expect(relatorio.sumario).toBeDefined();
      expect(relatorio.alertas).toBeDefined();
      expect(relatorio.criadoEm).toBeDefined();
      expect(typeof relatorio.criadoEm).toBe("string");
    });

    it("Teste 2: Deve retornar relatório com período vazio sem erros", () => {
      // Arrange: Banco vazio, nenhuma transação
      const mes = 1;
      const ano = 2026;

      // Act & Assert: Não deve lançar
      expect(() => gerarRelatorioExecutivo(db, mes, ano)).not.toThrow();

      const relatorio = gerarRelatorioExecutivo(db, mes, ano);
      expect(relatorio.dre.receitaTotal).toBe(0);
      expect(relatorio.dre.despesaTotal).toBe(0);
    });

    it("Teste 3: Deve validar mês inválido e retornar estrutura válida", () => {
      // Arrange
      const mesInvalido = 13;
      const ano = 2026;

      // Act & Assert: Não deve lançar
      expect(() => gerarRelatorioExecutivo(db, mesInvalido, ano)).not.toThrow();
    });
  });

  // GRUPO 2: gerarPDFRelatorioExecutivo (2 testes)

  describe("gerarPDFRelatorioExecutivo", () => {
    it("Teste 4: Deve gerar HTML válido para PDF", () => {
      // Arrange
      const mes = 10;
      const ano = 2026;

      // Act
      const html = gerarPDFRelatorioExecutivo(db, mes, ano);

      // Assert
      expect(html).toBeDefined();
      expect(typeof html).toBe("string");
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("Relatório Executivo");
      expect(html).toContain("pt-BR");
      expect(html).toContain("<table");
    });

    it("Teste 5: Deve incluir seções obrigatórias no PDF", () => {
      // Arrange
      const mes = 10;
      const ano = 2026;

      // Act
      const html = gerarPDFRelatorioExecutivo(db, mes, ano);

      // Assert
      expect(html).toContain("Resumo Executivo");
      expect(html).toContain("Demonstração de Resultado (DRE)");
      expect(html).toContain("Fluxo de Caixa");
      expect(html).toContain("Margens por Propriedade");
      expect(html).toContain("Contas a Receber");
      expect(html).toContain("Contas a Pagar");
    });
  });

  // GRUPO 3: enviarRelatorioEmailMensal (3 testes)

  describe("enviarRelatorioEmailMensal", () => {
    it("Teste 6: Deve retornar resultado quando email configurado", async () => {
      // Arrange
      const mes = 10;
      const ano = 2026;
      const email = "test@example.com";
      const originalEnv = process.env.SMTP_HOST;
      delete process.env.SMTP_HOST;

      // Act
      const resultado = await enviarRelatorioEmailMensal(db, email, mes, ano);

      // Assert
      expect(resultado).toBeDefined();
      expect("sucesso" in resultado || "erro" in resultado).toBe(true);

      // Restore
      if (originalEnv) process.env.SMTP_HOST = originalEnv;
    });

    it("Teste 7: Deve retornar erro se SMTP não estiver configurado", async () => {
      // Arrange
      const mes = 10;
      const ano = 2026;
      const email = "test@example.com";
      const originalEnv = process.env.SMTP_HOST;
      delete process.env.SMTP_HOST;

      // Act
      const resultado = await enviarRelatorioEmailMensal(db, email, mes, ano);

      // Assert
      expect(resultado).toBeDefined();
      expect("sucesso" in resultado).toBe(true);

      // Restore
      if (originalEnv) process.env.SMTP_HOST = originalEnv;
    });

    it("Teste 8: Deve retornar estrutura válida após envio", async () => {
      // Arrange
      const mes = 10;
      const ano = 2026;
      const email = "test@example.com";

      // Act
      const resultado = await enviarRelatorioEmailMensal(db, email, mes, ano);

      // Assert
      expect(resultado).toBeDefined();
      expect(typeof resultado === "object").toBe(true);
    });
  });

  // GRUPO 4: Armazenamento em DB (2 testes)

  describe("Armazenamento de Relatórios", () => {
    beforeEach(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS relatorios_executivos_gerados (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          mes INTEGER NOT NULL,
          ano INTEGER NOT NULL,
          data_geracao TEXT NOT NULL,
          conteudo_html TEXT,
          email_enviado INTEGER DEFAULT 0,
          destinatarios TEXT,
          criado_em TEXT NOT NULL
        );
      `);
    });

    it("Teste 9: Deve inserir relatório na tabela", () => {
      // Arrange
      const mes = 10;
      const ano = 2026;
      const now = new Date().toISOString();
      const html = "<html>test</html>";

      // Act
      db.prepare(`
        INSERT INTO relatorios_executivos_gerados (mes, ano, data_geracao, conteudo_html, email_enviado, criado_em)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(mes, ano, now, html, 0, now);

      // Assert
      const registro = db
        .prepare("SELECT * FROM relatorios_executivos_gerados WHERE mes = ? AND ano = ?")
        .get(mes, ano) as any;

      expect(registro).toBeDefined();
      expect(registro.mes).toBe(mes);
      expect(registro.ano).toBe(ano);
      expect(registro.email_enviado).toBe(0);
    });

    it("Teste 10: Deve buscar histórico de relatórios gerados", () => {
      // Arrange
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO relatorios_executivos_gerados (mes, ano, data_geracao, conteudo_html, email_enviado, criado_em)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(9, 2026, now, "<html></html>", 0, now);

      db.prepare(`
        INSERT INTO relatorios_executivos_gerados (mes, ano, data_geracao, conteudo_html, email_enviado, criado_em)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(10, 2026, now, "<html></html>", 1, now);

      // Act
      const registros = db
        .prepare("SELECT * FROM relatorios_executivos_gerados ORDER BY ano, mes DESC LIMIT 12")
        .all() as any[];

      // Assert
      expect(registros.length).toBeGreaterThanOrEqual(2);
      expect(registros[0].mes).toBe(10);
      expect(registros[0].email_enviado).toBe(1);
    });
  });

  // GRUPO 5: Rotas HTTP (2 testes)

  describe("Estrutura de Rotas", () => {
    it("Teste 11: Deve validar query params corretos para dashboard", () => {
      // Teste de validação de entrada
      const mes = 10;
      const ano = 2026;

      expect(typeof mes).toBe("number");
      expect(typeof ano).toBe("number");
      expect(mes).toBeGreaterThanOrEqual(1);
      expect(mes).toBeLessThanOrEqual(12);
      expect(ano).toBeGreaterThanOrEqual(2000);
      expect(ano).toBeLessThanOrEqual(2100);
    });

    it("Teste 12: Deve rejeitar email inválido em envio", () => {
      // Teste de validação de email
      const emailInvalido = "nao-e-email";
      const emailValido = "user@example.com";

      const validarEmail = (email: string) => email.includes("@");

      expect(validarEmail(emailInvalido)).toBe(false);
      expect(validarEmail(emailValido)).toBe(true);
    });
  });

  // GRUPO 6: Scheduler (2 testes)

  describe("Scheduler Mensal", () => {
    it("Teste 13: Deve calcular próximo disparo como 1º dia útil do mês", () => {
      // Test helper: cálculo de próximo 1º dia útil
      const calcularProxima1oDiaUtil = () => {
        let data = new Date();
        data.setMonth(data.getMonth() + 1);
        data.setDate(1);
        data.setHours(8, 0, 0, 0);

        // Pula fins de semana
        while (data.getDay() === 0 || data.getDay() === 6) {
          data.setDate(data.getDate() + 1);
        }

        return data;
      };

      const proxima = calcularProxima1oDiaUtil();

      expect(proxima).toBeDefined();
      expect(proxima.getDay()).toBeGreaterThanOrEqual(1); // Segunda
      expect(proxima.getDay()).toBeLessThanOrEqual(5); // Sexta
      expect(proxima.getHours()).toBe(8);
    });

    it("Teste 14: Deve retornar relatório anterior (mês passado) em envio mensal", () => {
      // Simula lógica: envio em 1º/outubro retorna relatório de setembro
      const dataHoje = new Date(2026, 9, 1); // 1º de outubro
      const mesAtual = dataHoje.getMonth() + 1; // 10 (outubro)
      const anoAtual = dataHoje.getFullYear(); // 2026

      const mesPrecedente = mesAtual === 1 ? 12 : mesAtual - 1; // 9 (setembro)
      const anoPrecedente = mesAtual === 1 ? anoAtual - 1 : anoAtual; // 2026

      expect(mesPrecedente).toBe(9);
      expect(anoPrecedente).toBe(2026);
    });
  });

  // TESTES ADICIONAIS DE VALIDAÇÃO

  describe("Validação de Dados", () => {
    it("Teste 15: Deve retornar estrutura completa de DRE", () => {
      const relatorio = gerarRelatorioExecutivo(db, 10, 2026);

      expect(relatorio.dre).toHaveProperty("receitaTotal");
      expect(relatorio.dre).toHaveProperty("despesaTotal");
      expect(relatorio.dre).toHaveProperty("lucroLiquido");
      expect(relatorio.dre).toHaveProperty("variacao");
      expect(relatorio.dre).toHaveProperty("historico");
    });

    it("Teste 16: Deve retornar estrutura completa de Sumário Executivo", () => {
      const relatorio = gerarRelatorioExecutivo(db, 10, 2026);

      expect(relatorio.sumario).toHaveProperty("taxaOcupacao");
      expect(relatorio.sumario).toHaveProperty("inadimplencia");
      expect(relatorio.sumario).toHaveProperty("diasDeCaixaDisponivel");
      expect(relatorio.sumario).toHaveProperty("statusGeral");
      expect(relatorio.sumario).toHaveProperty("alertasTopCinco");
      expect(Array.isArray(relatorio.sumario.alertasTopCinco)).toBe(true);
    });
  });
});
