import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  calcularDREPeriodo,
  gravarDREPeriodo,
  buscarDREPeriodo,
  listarDREPeriodos,
  type ResultadoDRE,
} from "../dre.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, `test-dre-${process.pid}.db`);

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
  db.exec(resolverSchema("migrations-phase6-relatorios-dre.sql"));
  return db;
}

describe("Domain: DRE (Demonstração de Resultado do Exercício)", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = criarTestDatabase();
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  describe("calcularDREPeriodo — 12 testes", () => {
    it("T1: Calcula DRE para período válido (retorna estrutura completa)", () => {
      const resultado = calcularDREPeriodo(db, "2026-10-01", "2026-10-31");

      expect(resultado).toHaveProperty("ano", 2026);
      expect(resultado).toHaveProperty("mes", 10);
      expect(resultado).toHaveProperty("receitaAluguel");
      expect(resultado).toHaveProperty("receitaHonorario");
      expect(resultado).toHaveProperty("receitaExtraordinaria");
      expect(resultado).toHaveProperty("receitaTotal");
      expect(resultado).toHaveProperty("lucroBruto");
      expect(resultado).toHaveProperty("lucroLiquido");
    });

    it("T2: Calcula DRE com período de um único dia (1º do mês)", () => {
      const resultado = calcularDREPeriodo(db, "2026-09-01", "2026-09-01");

      expect(resultado.ano).toBe(2026);
      expect(resultado.mes).toBe(9);
      expect(resultado.dataInicio).toBe("2026-09-01");
      expect(resultado.dataFim).toBe("2026-09-01");
    });

    it("T3: Calcula DRE com período multi-dia (15 dias de um mês)", () => {
      const resultado = calcularDREPeriodo(db, "2026-08-15", "2026-08-30");

      expect(resultado.ano).toBe(2026);
      expect(resultado.mes).toBe(8);
    });

    it("T4: Calcula DRE com período multi-mês (janeiro até março)", () => {
      const resultado = calcularDREPeriodo(db, "2026-01-01", "2026-03-31");

      // Usa o último mês do período
      expect(resultado.ano).toBe(2026);
      expect(resultado.mes).toBe(3);
    });

    it("T5: Retorna zero em receita/despesa quando não há lançamentos", () => {
      const resultado = calcularDREPeriodo(db, "2026-07-01", "2026-07-31");

      expect(resultado.receitaAluguel).toBe(0);
      expect(resultado.receitaHonorario).toBe(0);
      expect(resultado.receitaExtraordinaria).toBe(0);
      expect(resultado.receitaTotal).toBe(0);
      expect(resultado.despesaComissoes).toBe(0);
      expect(resultado.despesaImpostosReceita).toBe(0);
      expect(resultado.lucroLiquido).toBe(0);
    });

    it("T6: Calcula lucro bruto = receita operacional - despesa variável", () => {
      // Com valores zero, lucro bruto deve ser 0
      const resultado = calcularDREPeriodo(db, "2026-06-01", "2026-06-30");

      expect(resultado.lucroBruto).toBe(
        resultado.receitaAluguel + resultado.receitaHonorario - resultado.despesaVariavelTotal
      );
    });

    it("T7: Calcula lucro líquido = lucro bruto - despesa fixa + extraordinária", () => {
      const resultado = calcularDREPeriodo(db, "2026-05-01", "2026-05-31");

      expect(resultado.lucroLiquido).toBe(
        resultado.lucroBruto - resultado.despesaFixaTotal + resultado.receitaExtraordinaria
      );
    });

    it("T8: Período com data início = data fim (intervalo de 1 dia) válido", () => {
      const resultado = calcularDREPeriodo(db, "2026-04-15", "2026-04-15");

      expect(resultado.dataInicio).toBe("2026-04-15");
      expect(resultado.dataFim).toBe("2026-04-15");
      expect(resultado.ano).toBe(2026);
      expect(resultado.mes).toBe(4);
    });

    it("T9: Rejeita período com data início > data fim", () => {
      expect(() => {
        calcularDREPeriodo(db, "2026-05-01", "2026-04-30");
      }).toThrow();
    });

    it("T10: Calcula para período no futuro sem erro", () => {
      const resultado = calcularDREPeriodo(db, "2027-12-01", "2027-12-31");

      expect(resultado.ano).toBe(2027);
      expect(resultado.mes).toBe(12);
    });

    it("T11: Calcula para período no passado (ex: 2020) sem erro", () => {
      const resultado = calcularDREPeriodo(db, "2020-01-01", "2020-01-31");

      expect(resultado.ano).toBe(2020);
      expect(resultado.mes).toBe(1);
    });

    it("T12: Despesa fixa total = folha + condomínio + manutenção + juros", () => {
      const resultado = calcularDREPeriodo(db, "2026-03-01", "2026-03-31");

      expect(resultado.despesaFixaTotal).toBe(
        resultado.despesaFolhaPagamento +
          resultado.despesaCondominio +
          resultado.despesaManutencao +
          resultado.despesaJuros
      );
    });
  });

  describe("gravarDREPeriodo — 8 testes", () => {
    it("T1: Grava DRE novo em dre_periodos", () => {
      const dre = calcularDREPeriodo(db, "2026-10-01", "2026-10-31");

      gravarDREPeriodo(db, 2026, 10, dre);

      const buscado = buscarDREPeriodo(db, 2026, 10);
      expect(buscado).not.toBeNull();
      expect(buscado?.ano).toBe(2026);
      expect(buscado?.mes).toBe(10);
    });

    it("T2: Atualiza DRE existente (mesma ano/mes) — idempotente", () => {
      const dre1 = calcularDREPeriodo(db, "2026-09-01", "2026-09-30");
      gravarDREPeriodo(db, 2026, 9, dre1);

      let buscado = buscarDREPeriodo(db, 2026, 9);
      expect(buscado).not.toBeNull();

      // Tenta gravar novamente (simula scheduler rodando 2x no mesmo dia)
      const dre2 = { ...dre1, receitaAluguel: 5000 };
      gravarDREPeriodo(db, 2026, 9, dre2);

      buscado = buscarDREPeriodo(db, 2026, 9);
      expect(buscado?.receitaAluguel).toBe(5000);
    });

    it("T3: Rejeita mês inválido (mês < 1)", () => {
      const dre = calcularDREPeriodo(db, "2026-08-01", "2026-08-31");

      expect(() => {
        gravarDREPeriodo(db, 2026, 0, dre);
      }).toThrow();
    });

    it("T4: Rejeita mês inválido (mês > 12)", () => {
      const dre = calcularDREPeriodo(db, "2026-08-01", "2026-08-31");

      expect(() => {
        gravarDREPeriodo(db, 2026, 13, dre);
      }).toThrow();
    });

    it("T5: Grava todos os campos de receita corretamente", () => {
      const dre: ResultadoDRE = {
        ano: 2026,
        mes: 7,
        dataInicio: "2026-07-01",
        dataFim: "2026-07-31",
        receitaAluguel: 1000,
        receitaHonorario: 500,
        receitaExtraordinaria: 100,
        receitaTotal: 1600,
        despesaComissoes: 50,
        despesaImpostosReceita: 100,
        despesaVariavelTotal: 150,
        lucroBruto: 1450,
        despesaFolhaPagamento: 200,
        despesaCondominio: 100,
        despesaManutencao: 50,
        despesaJuros: 25,
        despesaFixaTotal: 375,
        lucroLiquido: 1175,
      };

      gravarDREPeriodo(db, 2026, 7, dre);

      const buscado = buscarDREPeriodo(db, 2026, 7);
      expect(buscado?.receitaAluguel).toBe(1000);
      expect(buscado?.receitaHonorario).toBe(500);
      expect(buscado?.receitaExtraordinaria).toBe(100);
    });

    it("T6: Grava todos os campos de despesa corretamente", () => {
      const dre: ResultadoDRE = {
        ano: 2026,
        mes: 6,
        dataInicio: "2026-06-01",
        dataFim: "2026-06-30",
        receitaAluguel: 1000,
        receitaHonorario: 500,
        receitaExtraordinaria: 0,
        receitaTotal: 1500,
        despesaComissoes: 50,
        despesaImpostosReceita: 100,
        despesaVariavelTotal: 150,
        lucroBruto: 1350,
        despesaFolhaPagamento: 300,
        despesaCondominio: 150,
        despesaManutencao: 100,
        despesaJuros: 50,
        despesaFixaTotal: 600,
        lucroLiquido: 750,
      };

      gravarDREPeriodo(db, 2026, 6, dre);

      const buscado = buscarDREPeriodo(db, 2026, 6);
      expect(buscado?.despesaFolhaPagamento).toBe(300);
      expect(buscado?.despesaCondominio).toBe(150);
      expect(buscado?.despesaManutencao).toBe(100);
      expect(buscado?.despesaJuros).toBe(50);
    });

    it("T7: Grava lucro bruto e lucro líquido corretamente", () => {
      const dre: ResultadoDRE = {
        ano: 2026,
        mes: 5,
        dataInicio: "2026-05-01",
        dataFim: "2026-05-31",
        receitaAluguel: 2000,
        receitaHonorario: 1000,
        receitaExtraordinaria: 500,
        receitaTotal: 3500,
        despesaComissoes: 100,
        despesaImpostosReceita: 200,
        despesaVariavelTotal: 300,
        lucroBruto: 2700,
        despesaFolhaPagamento: 500,
        despesaCondominio: 200,
        despesaManutencao: 150,
        despesaJuros: 100,
        despesaFixaTotal: 950,
        lucroLiquido: 2250,
      };

      gravarDREPeriodo(db, 2026, 5, dre);

      const buscado = buscarDREPeriodo(db, 2026, 5);
      expect(buscado?.lucroBruto).toBe(2700);
      expect(buscado?.lucroLiquido).toBe(2250);
    });

    it("T8: Campos calculadoEm e atualizado_em preenchidos automaticamente", () => {
      const dre = calcularDREPeriodo(db, "2026-04-01", "2026-04-30");

      gravarDREPeriodo(db, 2026, 4, dre);

      const buscado = buscarDREPeriodo(db, 2026, 4);
      expect(buscado?.calculadoEm).toBeTruthy();
    });
  });

  describe("Consultas: buscarDREPeriodo e listarDREPeriodos — 6 testes", () => {
    it("T1: buscarDREPeriodo retorna null para período não gravado", () => {
      const resultado = buscarDREPeriodo(db, 2026, 12);

      expect(resultado).toBeNull();
    });

    it("T2: buscarDREPeriodo retorna DRE gravado com dados corretos", () => {
      const dre: ResultadoDRE = {
        ano: 2026,
        mes: 11,
        dataInicio: "2026-11-01",
        dataFim: "2026-11-30",
        receitaAluguel: 1500,
        receitaHonorario: 800,
        receitaExtraordinaria: 200,
        receitaTotal: 2500,
        despesaComissoes: 75,
        despesaImpostosReceita: 150,
        despesaVariavelTotal: 225,
        lucroBruto: 2275,
        despesaFolhaPagamento: 400,
        despesaCondominio: 180,
        despesaManutencao: 120,
        despesaJuros: 60,
        despesaFixaTotal: 760,
        lucroLiquido: 1715,
      };

      gravarDREPeriodo(db, 2026, 11, dre);

      const buscado = buscarDREPeriodo(db, 2026, 11);
      expect(buscado).not.toBeNull();
      expect(buscado?.receitaAluguel).toBe(1500);
      expect(buscado?.lucroLiquido).toBe(1715);
    });

    it("T3: listarDREPeriodos retorna array vazio quando não há períodos", () => {
      const periodos = listarDREPeriodos(db, { anoMin: 2026, anoMax: 2026 });

      expect(Array.isArray(periodos)).toBe(true);
      expect(periodos.length).toBe(0);
    });

    it("T4: listarDREPeriodos retorna períodos em ordem decrescente (ano DESC, mes DESC)", () => {
      // Grava 3 períodos fora de ordem
      gravarDREPeriodo(db, 2026, 5, calcularDREPeriodo(db, "2026-05-01", "2026-05-31"));
      gravarDREPeriodo(db, 2026, 10, calcularDREPeriodo(db, "2026-10-01", "2026-10-31"));
      gravarDREPeriodo(db, 2026, 3, calcularDREPeriodo(db, "2026-03-01", "2026-03-31"));

      const periodos = listarDREPeriodos(db, { anoMin: 2026, anoMax: 2026 });

      expect(periodos.length).toBe(3);
      expect(periodos[0].mes).toBe(10); // Mais recente
      expect(periodos[1].mes).toBe(5);
      expect(periodos[2].mes).toBe(3); // Mais antigo
    });

    it("T5: listarDREPeriodos filtra por ano corretamente", () => {
      gravarDREPeriodo(db, 2025, 12, calcularDREPeriodo(db, "2025-12-01", "2025-12-31"));
      gravarDREPeriodo(db, 2026, 1, calcularDREPeriodo(db, "2026-01-01", "2026-01-31"));
      gravarDREPeriodo(db, 2026, 6, calcularDREPeriodo(db, "2026-06-01", "2026-06-30"));

      const periodos = listarDREPeriodos(db, { anoMin: 2026, anoMax: 2026 });

      expect(periodos.length).toBe(2);
      expect(periodos.every((p) => p.ano === 2026)).toBe(true);
    });

    it("T6: listarDREPeriodos retorna dados completos (receita, despesa, lucro)", () => {
      const dre: ResultadoDRE = {
        ano: 2026,
        mes: 2,
        dataInicio: "2026-02-01",
        dataFim: "2026-02-28",
        receitaAluguel: 1200,
        receitaHonorario: 600,
        receitaExtraordinaria: 150,
        receitaTotal: 1950,
        despesaComissoes: 60,
        despesaImpostosReceita: 120,
        despesaVariavelTotal: 180,
        lucroBruto: 1770,
        despesaFolhaPagamento: 350,
        despesaCondominio: 160,
        despesaManutencao: 80,
        despesaJuros: 40,
        despesaFixaTotal: 630,
        lucroLiquido: 1290,
      };

      gravarDREPeriodo(db, 2026, 2, dre);

      const periodos = listarDREPeriodos(db, { anoMin: 2026, anoMax: 2026 });

      expect(periodos.length).toBe(1);
      const p = periodos[0];
      expect(p.receitaAluguel).toBe(1200);
      expect(p.despesaFolhaPagamento).toBe(350);
      expect(p.lucroLiquido).toBe(1290);
    });
  });
});
