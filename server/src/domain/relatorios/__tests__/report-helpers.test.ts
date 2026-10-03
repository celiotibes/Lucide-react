import { describe, it, expect } from "vitest";
import {
  obterPeriodoMes,
  obterMesAnterior,
  obterUltimosNMeses,
  formatarMoeda,
  formatarPercentual,
  calcularVariacaoPercentual,
  agruparESomar,
  calcularEstatisticas,
  obterTopN,
  paginarArray,
  formatarData,
  formatarDataHora,
  validarData,
} from "../report-helpers.js";

describe("Report Helpers", () => {
  describe("obterPeriodoMes", () => {
    it("deve retornar período correto para janeiro", () => {
      const { inicio, fim } = obterPeriodoMes(1, 2024);

      expect(inicio).toBe("2024-01-01");
      expect(fim).toBe("2024-01-31");
    });

    it("deve retornar período correto para fevereiro (não bissexto)", () => {
      const { inicio, fim } = obterPeriodoMes(2, 2023);

      expect(inicio).toBe("2023-02-01");
      expect(fim).toBe("2023-02-28");
    });

    it("deve retornar período correto para fevereiro (bissexto)", () => {
      const { inicio, fim } = obterPeriodoMes(2, 2024);

      expect(inicio).toBe("2024-02-01");
      expect(fim).toBe("2024-02-29");
    });

    it("deve retornar período correto para dezembro", () => {
      const { inicio, fim } = obterPeriodoMes(12, 2024);

      expect(inicio).toBe("2024-12-01");
      expect(fim).toBe("2024-12-31");
    });
  });

  describe("obterMesAnterior", () => {
    it("deve retornar dezembro do ano anterior para janeiro", () => {
      const { mes, ano } = obterMesAnterior(1, 2024);

      expect(mes).toBe(12);
      expect(ano).toBe(2023);
    });

    it("deve retornar mês anterior do mesmo ano", () => {
      const { mes, ano } = obterMesAnterior(6, 2024);

      expect(mes).toBe(5);
      expect(ano).toBe(2024);
    });
  });

  describe("obterUltimosNMeses", () => {
    it("deve retornar 6 meses por padrão", () => {
      const meses = obterUltimosNMeses(3, 2024);

      expect(meses).toHaveLength(6);
      expect(meses[meses.length - 1]).toEqual({ mes: 3, ano: 2024 });
    });

    it("deve retornar quantidade customizada de meses", () => {
      const meses = obterUltimosNMeses(1, 2024, 3);

      expect(meses).toHaveLength(3);
      expect(meses[2]).toEqual({ mes: 1, ano: 2024 });
    });

    it("deve retroceder corretamente entre anos", () => {
      const meses = obterUltimosNMeses(2, 2024, 4);

      expect(meses[0]).toEqual({ mes: 11, ano: 2023 });
      expect(meses[3]).toEqual({ mes: 2, ano: 2024 });
    });
  });

  describe("formatarMoeda", () => {
    it("deve formatar valor positivo", () => {
      const resultado = formatarMoeda(1234.56);
      expect(resultado).toContain("R$");
      expect(resultado).toMatch(/[0-9.,]+56/);
    });

    it("deve formatar zero", () => {
      const resultado = formatarMoeda(0);
      expect(resultado).toContain("R$");
      expect(resultado).toMatch(/0[.,]?0?0?/);
    });

    it("deve formatar com casas decimais customizadas", () => {
      const resultado1 = formatarMoeda(1234.5, 1);
      expect(resultado1).toContain("R$");
      expect(resultado1).toMatch(/[0-9.,]+5/);

      const resultado2 = formatarMoeda(1234, 0);
      expect(resultado2).toContain("R$");
      expect(resultado2).toMatch(/[0-9.,]+/);
    });
  });

  describe("formatarPercentual", () => {
    it("deve formatar percentual de 0 a 100", () => {
      expect(formatarPercentual(50)).toMatch(/50[.,]?00?%/);
      expect(formatarPercentual(12.345)).toMatch(/12[.,]3[45]%/);
    });

    it("deve converter decimal (0-1) para percentual", () => {
      expect(formatarPercentual(0.5)).toMatch(/50[.,]?00?%/);
      expect(formatarPercentual(0.123)).toMatch(/12[.,]3?0?%/);
    });

    it("deve respeitar casas decimais customizadas", () => {
      const resultado1 = formatarPercentual(12.345, 1);
      expect(resultado1).toMatch(/12[.,]3%/);

      const resultado2 = formatarPercentual(12, 0);
      expect(resultado2).toBe("12%");
    });
  });

  describe("calcularVariacaoPercentual", () => {
    it("deve calcular aumento percentual", () => {
      expect(calcularVariacaoPercentual(100, 50)).toBe(100);
      expect(calcularVariacaoPercentual(60, 50)).toBe(20);
    });

    it("deve calcular redução percentual", () => {
      expect(calcularVariacaoPercentual(25, 50)).toBe(-50);
      expect(calcularVariacaoPercentual(40, 50)).toBe(-20);
    });

    it("deve lidar com zero anterior", () => {
      expect(calcularVariacaoPercentual(100, 0)).toBe(100);
      expect(calcularVariacaoPercentual(0, 0)).toBe(0);
    });
  });

  describe("agruparESomar", () => {
    it("deve agrupar e somar por chave", () => {
      const items = [
        { categoria: "A", valor: 100 },
        { categoria: "B", valor: 200 },
        { categoria: "A", valor: 50 },
      ];

      const resultado = agruparESomar(items, "categoria", "valor");

      expect(resultado.A).toBe(150);
      expect(resultado.B).toBe(200);
    });

    it("deve lidar com valores faltando", () => {
      const items = [
        { categoria: "A", valor: 100 },
        { categoria: "B", valor: undefined },
      ];

      const resultado = agruparESomar(items, "categoria", "valor");

      expect(resultado.A).toBe(100);
      expect(resultado.B).toBe(0);
    });
  });

  describe("calcularEstatisticas", () => {
    it("deve calcular estatísticas corretas", () => {
      const valores = [10, 20, 30, 40, 50];
      const stats = calcularEstatisticas(valores);

      expect(stats.minimo).toBe(10);
      expect(stats.maximo).toBe(50);
      expect(stats.media).toBe(30);
      expect(stats.soma).toBe(150);
      expect(stats.quantidade).toBe(5);
    });

    it("deve lidar com array vazio", () => {
      const stats = calcularEstatisticas([]);

      expect(stats.minimo).toBe(0);
      expect(stats.maximo).toBe(0);
      expect(stats.media).toBe(0);
      expect(stats.soma).toBe(0);
      expect(stats.quantidade).toBe(0);
    });

    it("deve lidar com um único valor", () => {
      const stats = calcularEstatisticas([42]);

      expect(stats.minimo).toBe(42);
      expect(stats.maximo).toBe(42);
      expect(stats.media).toBe(42);
      expect(stats.soma).toBe(42);
    });
  });

  describe("obterTopN", () => {
    it("deve retornar top N itens por ordem descendente", () => {
      const items = [
        { nome: "A", valor: 100 },
        { nome: "B", valor: 50 },
        { nome: "C", valor: 200 },
        { nome: "D", valor: 75 },
      ];

      const top2 = obterTopN(items, "valor", 2);

      expect(top2).toHaveLength(2);
      expect(top2[0].valor).toBe(200);
      expect(top2[1].valor).toBe(100);
    });

    it("deve retornar top N em ordem ascendente", () => {
      const items = [
        { nome: "A", valor: 100 },
        { nome: "B", valor: 50 },
        { nome: "C", valor: 200 },
      ];

      const bottom2 = obterTopN(items, "valor", 2, false);

      expect(bottom2).toHaveLength(2);
      expect(bottom2[0].valor).toBe(50);
      expect(bottom2[1].valor).toBe(100);
    });
  });

  describe("paginarArray", () => {
    it("deve paginar corretamente", () => {
      const items = Array.from({ length: 100 }, (_, i) => ({ id: i }));
      const resultado = paginarArray(items, 20, 0);

      expect(resultado.items).toHaveLength(20);
      expect(resultado.total).toBe(100);
      expect(resultado.limit).toBe(20);
      expect(resultado.offset).toBe(0);
      expect(resultado.hasMore).toBe(true);
    });

    it("deve indicar última página corretamente", () => {
      const items = Array.from({ length: 100 }, (_, i) => ({ id: i }));
      const resultado = paginarArray(items, 20, 80);

      expect(resultado.items).toHaveLength(20);
      expect(resultado.hasMore).toBe(false);
    });
  });

  describe("formatarData", () => {
    it("deve formatar data em string ISO", () => {
      const data = formatarData("2024-12-25");
      expect(data).toBe("25/12/2024");
    });

    it("deve formatar objeto Date", () => {
      const date = new Date("2024-12-25T00:00:00Z");
      const data = formatarData(date);
      expect(data).toContain("25");
      expect(data).toContain("12");
      expect(data).toContain("2024");
    });
  });

  describe("formatarDataHora", () => {
    it("deve formatar data e hora", () => {
      const dataHora = formatarDataHora("2024-12-25T14:30:00Z");
      expect(dataHora).toContain("25/12/2024");
      expect(dataHora).toContain("14:30");
    });
  });

  describe("validarData", () => {
    it("deve validar data no formato correto", () => {
      expect(validarData("2024-12-25")).toBe(true);
      expect(validarData("2024-01-01")).toBe(true);
    });

    it("deve rejeitar formato incorreto", () => {
      expect(validarData("25/12/2024")).toBe(false);
      expect(validarData("2024-13-01")).toBe(false);
      expect(validarData("invalid")).toBe(false);
    });
  });
});
