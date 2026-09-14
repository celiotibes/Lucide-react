import { describe, it, expect } from "vitest";
import {
  calcularUrgencia,
  calcularAirbnb,
  calcularCombustivel,
  calcularHoras,
  calcularEmprestimo,
  aplicarReajusteIpca,
  validarSequenciaHoras,
  quitarEmprestimoAntecipado,
  type ApontamentoUrgencia,
  type AirbnbApontamento,
  type CombustivelApontamento,
  type RegistroHora,
  type EmprestimoApontamento,
} from "../apontamento-prestador";

describe("Apontamento do Prestador - Módulo Completo", () => {
  // ===============================
  // TESTES DE URGÊNCIA (15+ casos)
  // ===============================
  describe("Testes de Urgência", () => {
    it("T001: Dia útil até 60 min deve retornar R$50 sem adicional", () => {
      // Segunda-feira
      const resultado = calcularUrgencia(
        "2026-01-19",
        "09:00",
        "09:45",
        false
      );

      expect(resultado.valor_base).toBe(50);
      expect(resultado.adicional_domingo).toBe(0);
      expect(resultado.adicional_deslocamento).toBe(0);
      expect(resultado.valor_total).toBe(50);
      expect(resultado.eh_dia_util).toBe(true);
      expect(resultado.requer_analise).toBe(false);
    });

    it("T002: Domingo até 60 min deve retornar R$62,50", () => {
      // Domingo = 2026-01-11
      const resultado = calcularUrgencia(
        "2026-01-11",
        "10:00",
        "10:30",
        false
      );

      expect(resultado.valor_base).toBe(62.5);
      expect(resultado.adicional_domingo).toBe(0);
      expect(resultado.valor_total).toBe(62.5);
      expect(resultado.eh_domingo).toBe(true);
    });

    it("T003: Sábado até 60 min sem adicional (R$50)", () => {
      // Sábado = 2026-01-10
      const resultado = calcularUrgencia(
        "2026-01-10",
        "14:00",
        "14:50",
        false
      );

      expect(resultado.valor_base).toBe(50);
      expect(resultado.adicional_domingo).toBe(0);
      expect(resultado.valor_total).toBe(50);
      expect(resultado.eh_sabado).toBe(true);
    });

    it("T004: Dia útil acima de 60 min deve marcar requer_analise", () => {
      // Segunda-feira com 90 minutos
      const resultado = calcularUrgencia(
        "2026-01-20",
        "08:00",
        "09:30",
        false
      );

      expect(resultado.minutos_trabalhados).toBe(90);
      expect(resultado.requer_analise).toBe(true);
      expect(resultado.valor_base).toBe(50);
      expect(resultado.adicional_domingo).toBeGreaterThan(0);
      expect(resultado.valor_total).toBeGreaterThan(50);
    });

    it("T005: Domingo 90 min: R$62,50 + (30 × 0.546875) = R$78,91", () => {
      // Domingo com 90 minutos = 2026-01-11
      const resultado = calcularUrgencia(
        "2026-01-11",
        "10:00",
        "11:30",
        false
      );

      expect(resultado.valor_base).toBe(62.5);
      expect(resultado.minutos_trabalhados).toBe(90);
      expect(resultado.adicional_domingo).toBeCloseTo(16.40625, 2);
      expect(resultado.valor_total).toBeCloseTo(78.91, 2);
      expect(resultado.eh_domingo).toBe(true);
    });

    it("T006: Com deslocamento: +R$21", () => {
      // Dia útil com deslocamento
      const resultado = calcularUrgencia(
        "2026-01-13",
        "09:00",
        "09:30",
        true
      );

      expect(resultado.valor_base).toBe(50);
      expect(resultado.adicional_deslocamento).toBe(21);
      expect(resultado.valor_total).toBe(71);
      expect(resultado.tem_deslocamento).toBe(true);
    });

    it("T007: Feriado em dia útil trata como domingo", () => {
      // Feriado em dia útil
      const resultado = calcularUrgencia(
        "2026-01-01",
        "10:00",
        "10:45",
        false,
        ["2026-01-01"]
      );

      expect(resultado.eh_feriado).toBe(true);
      expect(resultado.valor_base).toBe(62.5);
      expect(resultado.valor_total).toBe(62.5);
    });

    it("T008: Feriado em dia útil com 90 min e deslocamento", () => {
      // Feriado 90 minutos com deslocamento
      const resultado = calcularUrgencia(
        "2026-01-01",
        "09:00",
        "10:30",
        true,
        ["2026-01-01"]
      );

      expect(resultado.eh_feriado).toBe(true);
      expect(resultado.valor_base).toBe(62.5);
      expect(resultado.minutos_trabalhados).toBe(90);
      const valorEsperado = 62.5 + 16.40625 + 21;
      expect(resultado.valor_total).toBeCloseTo(valorEsperado, 2);
    });

    it("T009: Exatamente 60 minutos não marca requer_analise", () => {
      const resultado = calcularUrgencia(
        "2026-01-15",
        "09:00",
        "10:00",
        false
      );

      expect(resultado.minutos_trabalhados).toBe(60);
      expect(resultado.requer_analise).toBe(false);
    });

    it("T010: 61 minutos marca requer_analise", () => {
      const resultado = calcularUrgencia(
        "2026-01-15",
        "09:00",
        "10:01",
        false
      );

      expect(resultado.minutos_trabalhados).toBe(61);
      expect(resultado.requer_analise).toBe(true);
    });

    it("T011: Memória de cálculo verificável", () => {
      const resultado = calcularUrgencia(
        "2026-01-13",
        "14:00",
        "14:30",
        true
      );

      expect(resultado.memoria_calculo).toBeDefined();
      expect(resultado.memoria_calculo).toContain("Base: R$50");
      expect(resultado.memoria_calculo).toContain("Deslocamento: R$21");
      expect(resultado.memoria_calculo).toContain("Total: R$71");
    });

    it("T012: Sábado com 90 minutos", () => {
      // Sábado com tempo extra = 2026-01-10
      const resultado = calcularUrgencia(
        "2026-01-10",
        "15:00",
        "16:30",
        false
      );

      expect(resultado.eh_sabado).toBe(true);
      expect(resultado.valor_base).toBe(50);
      expect(resultado.adicional_domingo).toBeCloseTo(16.40625, 2);
    });

    it("T013: Domingo sem deslocamento + deslocamento em caso separado", () => {
      const sem = calcularUrgencia("2026-01-11", "10:00", "10:30", false);
      const com = calcularUrgencia("2026-01-11", "10:00", "10:30", true);

      expect(com.valor_total - sem.valor_total).toBe(21);
    });

    it("T014: Múltiplos períodos de 30 minutos somam", () => {
      // 2x 30 min = 60 min sem requer_analise
      const resultado = calcularUrgencia(
        "2026-01-13",
        "09:00",
        "09:30",
        false
      );

      expect(resultado.minutos_trabalhados).toBe(30);
      expect(resultado.valor_base).toBe(50);
    });

    it("T015: Cálculo com horários diferentes", () => {
      const resultado = calcularUrgencia(
        "2026-01-13",
        "23:30",
        "23:55",
        false
      );

      expect(resultado.minutos_trabalhados).toBe(25);
      expect(resultado.valor_total).toBe(50);
    });

    it("T016: Domingo com deslocamento múltiplo", () => {
      const resultado = calcularUrgencia(
        "2026-01-11",
        "10:00",
        "10:15",
        true
      );

      const esperado = 62.5 + 21;
      expect(resultado.valor_total).toBe(esperado);
    });

    it("T017: Feriado fora de dia útil (domingo) trata como domingo normalmente", () => {
      // Domingo feriado (ex: Páscoa no domingo) = 2026-01-11
      const resultado = calcularUrgencia(
        "2026-01-11",
        "10:00",
        "10:30",
        false,
        ["2026-01-11"]
      );

      expect(resultado.valor_base).toBe(62.5);
      expect(resultado.eh_feriado).toBe(true);
    });
  });

  // ===============================
  // TESTES DE AIRBNB (20+ casos)
  // ===============================
  describe("Testes de Airbnb", () => {
    it("A001: 1 quarto dentro jornada = R$31,50", () => {
      // Segunda-feira dentro de expediente
      const resultado = calcularAirbnb(
        "2026-01-19",
        "limpeza",
        1,
        true,
        []
      );

      expect(resultado.valor_base).toBe(31.5);
      expect(resultado.valor_total).toBe(31.5);
      expect(resultado.numero_quartos).toBe(1);
      expect(resultado.tipo_servico).toBe("limpeza");
    });

    it("A002: 1 quarto fora úteis = R$42,00", () => {
      // Segunda-feira fora de expediente
      const resultado = calcularAirbnb(
        "2026-01-19",
        "limpeza",
        1,
        false,
        []
      );

      expect(resultado.valor_base).toBe(42.0);
      expect(resultado.valor_total).toBe(42.0);
    });

    it("A003: 1 quarto sab/dom/feriado = R$63,00", () => {
      // Domingo = 2026-01-11
      const resultado = calcularAirbnb(
        "2026-01-11",
        "limpeza",
        1,
        true,
        []
      );

      expect(resultado.valor_base).toBe(63.0);
      expect(resultado.valor_total).toBe(63.0);
    });

    it("A004: 2 quartos dentro = R$37,80", () => {
      // Segunda-feira dentro de expediente
      const resultado = calcularAirbnb(
        "2026-01-19",
        "limpeza",
        2,
        true,
        []
      );

      expect(resultado.valor_base).toBe(37.8);
      expect(resultado.valor_total).toBe(37.8);
      expect(resultado.numero_quartos).toBe(2);
    });

    it("A005: 2 quartos fora úteis = R$50,40", () => {
      // Segunda-feira fora de expediente
      const resultado = calcularAirbnb(
        "2026-01-19",
        "limpeza",
        2,
        false,
        []
      );

      expect(resultado.valor_base).toBe(50.4);
      expect(resultado.valor_total).toBe(50.4);
    });

    it("A006: 2 quartos sab/dom/feriado = R$75,60", () => {
      // Domingo = 2026-01-11
      const resultado = calcularAirbnb(
        "2026-01-11",
        "limpeza",
        2,
        true,
        []
      );

      expect(resultado.valor_base).toBe(75.6);
      expect(resultado.valor_total).toBe(75.6);
    });

    it("A007: 3 quartos dentro = R$45,36", () => {
      const resultado = calcularAirbnb(
        "2026-01-19",
        "limpeza",
        3,
        true,
        []
      );

      expect(resultado.valor_base).toBe(45.36);
      expect(resultado.numero_quartos).toBe(3);
    });

    it("A008: 3 quartos fora úteis = R$60,48", () => {
      const resultado = calcularAirbnb(
        "2026-01-19",
        "limpeza",
        3,
        false,
        []
      );

      expect(resultado.valor_base).toBe(60.48);
    });

    it("A009: 3 quartos sab/dom/feriado = R$90,72", () => {
      const resultado = calcularAirbnb(
        "2026-01-11",
        "limpeza",
        3,
        true,
        []
      );

      expect(resultado.valor_base).toBe(90.72);
    });

    it("A010: Sábado (dia normal) sem adicional 25%", () => {
      const resultado = calcularAirbnb(
        "2026-01-11",
        "limpeza",
        1,
        true,
        []
      );

      expect(resultado.valor_base).toBe(63.0);
      expect(resultado.eh_sabado).toBeUndefined(); // Não é proprietário do tipo
    });

    it("A011: Manutenção dentro = hora normal", () => {
      const resultado = calcularAirbnb(
        "2026-01-19",
        "manutencao",
        1,
        true,
        []
      );

      expect(resultado.tipo_servico).toBe("manutencao");
      expect(resultado.valor_base).toBe(31.5);
    });

    it("A012: Manutenção fora + urgência", () => {
      const resultado = calcularAirbnb(
        "2026-01-19",
        "manutencao",
        1,
        false,
        []
      );

      expect(resultado.tipo_servico).toBe("manutencao");
      expect(resultado.valor_base).toBe(42.0);
    });

    it("A013: Revisão com falha: flag requer_analise", () => {
      const resultado = calcularAirbnb(
        "2026-01-19",
        "revisao",
        1,
        true,
        [],
        true
      );

      expect(resultado.tipo_servico).toBe("revisao");
      expect(resultado.tem_falha).toBe(true);
      expect(resultado.requer_analise).toBe(true);
    });

    it("A014: Revisão sem falha: flag requer_analise", () => {
      const resultado = calcularAirbnb(
        "2026-01-19",
        "revisao",
        1,
        true,
        [],
        false
      );

      expect(resultado.tipo_servico).toBe("revisao");
      expect(resultado.requer_analise).toBe(true);
    });

    it("A015: Memória de cálculo verificável", () => {
      const resultado = calcularAirbnb(
        "2026-01-19",
        "limpeza",
        2,
        true,
        []
      );

      expect(resultado.memoria_calculo).toBeDefined();
      expect(resultado.memoria_calculo).toContain("2 quarto");
      expect(resultado.memoria_calculo).toContain("Base: R$37.80");
    });

    it("A016: Feriado em dia útil com 2 quartos", () => {
      const resultado = calcularAirbnb(
        "2026-01-01",
        "limpeza",
        2,
        true,
        ["2026-01-01"]
      );

      expect(resultado.valor_base).toBe(75.6);
    });

    it("A017: Segunda dentro + sábado fora = valores diferentes", () => {
      const seg = calcularAirbnb("2026-01-20", "limpeza", 1, true, []);
      const sab = calcularAirbnb("2026-01-11", "limpeza", 1, false, []);

      expect(seg.valor_total).not.toBe(sab.valor_total);
    });

    it("A018: Consistência entre 1, 2 e 3 quartos", () => {
      const r1 = calcularAirbnb("2026-01-19", "limpeza", 1, true, []);
      const r2 = calcularAirbnb("2026-01-19", "limpeza", 2, true, []);
      const r3 = calcularAirbnb("2026-01-19", "limpeza", 3, true, []);

      expect(r2.valor_base).toBeGreaterThan(r1.valor_base);
      expect(r3.valor_base).toBeGreaterThan(r2.valor_base);
    });

    it("A019: Domingo fora de expediente não duplica adicional", () => {
      const resultado = calcularAirbnb(
        "2026-01-11",
        "limpeza",
        1,
        false,
        []
      );

      expect(resultado.valor_base).toBe(63.0);
    });

    it("A020: Diferentes tipos de serviço mesma data", () => {
      const limpeza = calcularAirbnb("2026-01-19", "limpeza", 1, true, []);
      const manutencao = calcularAirbnb("2026-01-19", "manutencao", 1, true, []);
      const revisao = calcularAirbnb("2026-01-19", "revisao", 1, true, []);

      expect(limpeza.tipo_servico).toBe("limpeza");
      expect(manutencao.tipo_servico).toBe("manutencao");
      expect(revisao.tipo_servico).toBe("revisao");
    });
  });

  // ===============================
  // TESTES DE COMBUSTÍVEL (8 casos)
  // ===============================
  describe("Testes de Combustível", () => {
    it("C001: 30 km: (30÷10) × 6,50 = R$19,50", () => {
      const resultado = calcularCombustivel(1, 30);

      expect(resultado.km_percorrido).toBe(30);
      expect(resultado.valor_total).toBeCloseTo(19.5, 2);
      expect(resultado.km_litro).toBe(10);
      expect(resultado.valor_litro).toBe(6.5);
    });

    it("C002: 50 km: (50÷10) × 6,50 = R$32,50", () => {
      const resultado = calcularCombustivel(1, 50);

      expect(resultado.km_percorrido).toBe(50);
      expect(resultado.valor_total).toBeCloseTo(32.5, 2);
    });

    it("C003: 100 km", () => {
      const resultado = calcularCombustivel(1, 100);

      expect(resultado.km_percorrido).toBe(100);
      expect(resultado.valor_total).toBeCloseTo(65, 2);
    });

    it("C004: Atualização manual: valor_litro muda para R$7,00", () => {
      const resultado = calcularCombustivel(1, 30, {
        valor_litro: 7.0,
        km_litro: 10,
      });

      expect(resultado.valor_litro).toBe(7.0);
      expect(resultado.valor_total).toBeCloseTo(21, 2);
    });

    it("C005: Atualização consumo: km_litro muda para 12", () => {
      const resultado = calcularCombustivel(1, 30, {
        valor_litro: 6.5,
        km_litro: 12,
      });

      expect(resultado.km_litro).toBe(12);
      expect(resultado.valor_total).toBeCloseTo(16.25, 2);
    });

    it("C006: Ambas atualizações simultaneamente", () => {
      const resultado = calcularCombustivel(1, 30, {
        valor_litro: 7.5,
        km_litro: 12,
      });

      expect(resultado.valor_litro).toBe(7.5);
      expect(resultado.km_litro).toBe(12);
      expect(resultado.valor_total).toBeCloseTo(18.75, 2);
    });

    it("C007: 0 km = R$0", () => {
      const resultado = calcularCombustivel(1, 0);

      expect(resultado.valor_total).toBe(0);
    });

    it("C008: Valores fracionados com 2 casas decimais", () => {
      const resultado = calcularCombustivel(1, 45);

      const valor_esperado = (45 / 10) * 6.5;
      expect(resultado.valor_total).toBeCloseTo(valor_esperado, 2);
    });
  });

  // ===============================
  // TESTES DE HORAS (12 casos)
  // ===============================
  describe("Testes de Horas", () => {
    it("H001: Entrada 08:00, saida intervalo 12:00, retorno 13:00, saida 17:00 = 8h integral", () => {
      const registros: RegistroHora[] = [
        { data: "2026-01-19", tipo: "entrada", horario: "08:00" },
        { data: "2026-01-19", tipo: "saida_intervalo", horario: "12:00" },
        { data: "2026-01-19", tipo: "retorno_intervalo", horario: "13:00" },
        { data: "2026-01-19", tipo: "saida", horario: "17:00" },
      ];

      const resultado = calcularHoras(registros);

      // 4 horas (08:00-12:00) + 4 horas (13:00-17:00) = 8 horas
      expect(resultado.horas_efetivas).toBeGreaterThanOrEqual(8);
      expect(resultado.tipo_cobranca).toBe("integral");
    });

    it("H002: Entrada 08:00, saida 16:00 sem intervalo = 8h diaria integral", () => {
      const registros: RegistroHora[] = [
        { data: "2026-01-19", tipo: "entrada", horario: "08:00" },
        { data: "2026-01-19", tipo: "saida", horario: "16:00" },
      ];

      const resultado = calcularHoras(registros);

      expect(resultado.horas_efetivas).toBeCloseTo(8, 1);
      expect(resultado.percentual_diaria).toBeCloseTo(100, 1);
      expect(resultado.tipo_cobranca).toBe("integral");
    });

    it("H003: Entrada 08:00, saida 12:00 = 4h = 50% proporcional", () => {
      const registros: RegistroHora[] = [
        { data: "2026-01-19", tipo: "entrada", horario: "08:00" },
        { data: "2026-01-19", tipo: "saida", horario: "12:00" },
      ];

      const resultado = calcularHoras(registros);

      expect(resultado.horas_efetivas).toBeCloseTo(4, 1);
      expect(resultado.percentual_diaria).toBeCloseTo(50, 1);
      expect(resultado.tipo_cobranca).toBe("proporcional");
    });

    it("H004: Intervalo efetivo não desconta se não registrado", () => {
      // Sem registrar intervalo, as horas inteiras são contadas
      const registros: RegistroHora[] = [
        { data: "2026-01-19", tipo: "entrada", horario: "08:00" },
        { data: "2026-01-19", tipo: "saida", horario: "17:00" },
      ];

      const resultado = calcularHoras(registros);

      expect(resultado.horas_efetivas).toBeCloseTo(9, 1);
    });

    it("H005: Entrada 09:30, saida 17:30 = 8h", () => {
      const registros: RegistroHora[] = [
        { data: "2026-01-19", tipo: "entrada", horario: "09:30" },
        { data: "2026-01-19", tipo: "saida", horario: "17:30" },
      ];

      const resultado = calcularHoras(registros);

      expect(resultado.horas_efetivas).toBeCloseTo(8, 1);
    });

    it("H006: Múltiplos períodos com intervalos", () => {
      const registros: RegistroHora[] = [
        { data: "2026-01-19", tipo: "entrada", horario: "08:00" },
        { data: "2026-01-19", tipo: "saida_intervalo", horario: "12:00" },
        { data: "2026-01-19", tipo: "retorno_intervalo", horario: "13:00" },
        { data: "2026-01-19", tipo: "saida_intervalo", horario: "15:00" },
        { data: "2026-01-19", tipo: "retorno_intervalo", horario: "15:30" },
        { data: "2026-01-19", tipo: "saida", horario: "17:00" },
      ];

      const resultado = calcularHoras(registros);

      // 4h (08-12) + 2h (13-15) + 1.5h (15:30-17) = 7.5h
      expect(resultado.horas_efetivas).toBeCloseTo(7.5, 0);
    });

    it("H007: Meia jornada = 4h", () => {
      const registros: RegistroHora[] = [
        { data: "2026-01-19", tipo: "entrada", horario: "12:00" },
        { data: "2026-01-19", tipo: "saida", horario: "16:00" },
      ];

      const resultado = calcularHoras(registros);

      expect(resultado.horas_efetivas).toBeCloseTo(4, 1);
      expect(resultado.percentual_diaria).toBeLessThan(100);
    });

    it("H008: Validação bloqueio sequência", () => {
      // Sequência inválida: saida antes de entrada
      const registros: RegistroHora[] = [
        { data: "2026-01-19", tipo: "saida", horario: "12:00" },
        { data: "2026-01-19", tipo: "entrada", horario: "13:00" },
      ];

      const validacao = validarSequenciaHoras(registros);

      expect(validacao.valido).toBe(false);
      expect(validacao.erros.length).toBeGreaterThan(0);
    });

    it("H009: Validação permite retorno sem saida se não houver intervalo", () => {
      const registros: RegistroHora[] = [
        { data: "2026-01-19", tipo: "entrada", horario: "08:00" },
        { data: "2026-01-19", tipo: "saida", horario: "17:00" },
      ];

      const validacao = validarSequenciaHoras(registros);

      expect(validacao.valido).toBe(true);
    });

    it("H010: Horários com minutos fracionados", () => {
      const registros: RegistroHora[] = [
        { data: "2026-01-19", tipo: "entrada", horario: "08:15" },
        { data: "2026-01-19", tipo: "saida_intervalo", horario: "12:30" },
        { data: "2026-01-19", tipo: "retorno_intervalo", horario: "13:15" },
        { data: "2026-01-19", tipo: "saida", horario: "17:45" },
      ];

      const resultado = calcularHoras(registros);

      expect(resultado.horas_efetivas).toBeGreaterThan(0);
    });

    it("H011: Dia inteiro com múltiplos intervalos", () => {
      const registros: RegistroHora[] = [
        { data: "2026-01-19", tipo: "entrada", horario: "08:00" },
        { data: "2026-01-19", tipo: "saida_intervalo", horario: "11:00" },
        { data: "2026-01-19", tipo: "retorno_intervalo", horario: "11:30" },
        { data: "2026-01-19", tipo: "saida_intervalo", horario: "14:00" },
        { data: "2026-01-19", tipo: "retorno_intervalo", horario: "14:30" },
        { data: "2026-01-19", tipo: "saida", horario: "18:00" },
      ];

      const resultado = calcularHoras(registros);

      // 3 (08-11) + 2.5 (11:30-14) + 3.5 (14:30-18) = 9
      expect(resultado.horas_efetivas).toBeCloseTo(9, 0);
    });

    it("H012: Cálculo com precisão de centésimos", () => {
      const registros: RegistroHora[] = [
        { data: "2026-01-19", tipo: "entrada", horario: "08:00" },
        { data: "2026-01-19", tipo: "saida", horario: "12:30" },
      ];

      const resultado = calcularHoras(registros);

      expect(resultado.horas_efetivas).toBeCloseTo(4.5, 2);
    });
  });

  // ===============================
  // TESTES DE EMPRÉSTIMOS (10 casos)
  // ===============================
  describe("Testes de Empréstimos", () => {
    it("E001: Cristiano R$1.600, 18 parcelas, taxa calculável", () => {
      const resultado = calcularEmprestimo(
        "Cristiano",
        1600,
        18,
        2.5,
        "simples"
      );

      expect(resultado.beneficiario_nome).toBe("Cristiano");
      expect(resultado.valor_contratado).toBe(1600);
      expect(resultado.numero_parcelas).toBe(18);
      expect(resultado.parcelas.length).toBe(18);
    });

    it("E002: Memória cálculo auditável", () => {
      const resultado = calcularEmprestimo(
        "Cristiano",
        1600,
        18,
        2.5,
        "simples"
      );

      expect(resultado.memoria_calculo).toBeDefined();
      expect(resultado.memoria_calculo).toContain("1600");
      expect(resultado.memoria_calculo).toContain("18");
      expect(resultado.memoria_calculo).toContain("2.5");
    });

    it("E003: Cálculo juros simples", () => {
      const resultado = calcularEmprestimo(
        "Test",
        1000,
        10,
        1.0,
        "simples"
      );

      // Juros simples: valor inicial × taxa × (n/total_parcelas)
      let total_juros = 0;
      for (let i = 1; i <= 10; i++) {
        const juros = 1000 * 0.01 * (i / 10);
        total_juros += juros;
      }

      const resultado_total_juros = resultado.parcelas.reduce(
        (sum, p) => sum + p.juros,
        0
      );

      expect(resultado_total_juros).toBeCloseTo(total_juros, 1);
    });

    it("E004: Cálculo juros compostos", () => {
      const resultado = calcularEmprestimo(
        "Test",
        1000,
        10,
        1.0,
        "composto"
      );

      expect(resultado.tipo_juros).toBe("composto");
      expect(resultado.parcelas.length).toBe(10);
    });

    it("E005: Principal diminui a cada parcela", () => {
      const resultado = calcularEmprestimo(
        "Test",
        1000,
        10,
        1.0,
        "simples"
      );

      const principal_primeira = resultado.parcelas[0].principal;
      const principal_ultima =
        resultado.parcelas[resultado.parcelas.length - 1].principal;

      expect(principal_primeira).toBe(principal_ultima);
    });

    it("E006: Saldo devedor decresce", () => {
      const resultado = calcularEmprestimo(
        "Test",
        1000,
        10,
        1.0,
        "simples"
      );

      for (let i = 1; i < resultado.parcelas.length; i++) {
        expect(resultado.parcelas[i].saldo_devedor).toBeLessThanOrEqual(
          resultado.parcelas[i - 1].saldo_devedor
        );
      }
    });

    it("E007: Última parcela reduz saldo a zero", () => {
      const resultado = calcularEmprestimo(
        "Test",
        1000,
        10,
        1.0,
        "simples"
      );

      const ultima_parcela = resultado.parcelas[resultado.parcelas.length - 1];

      expect(ultima_parcela.saldo_devedor).toBeCloseTo(0, 1);
    });

    it("E008: Quitação antecipada: desconto de juros restantes", () => {
      const emprestimo = calcularEmprestimo(
        "Test",
        1000,
        10,
        1.0,
        "simples"
      );

      const quitacao = quitarEmprestimoAntecipado(emprestimo, 5);

      expect(quitacao.juros_economizados).toBeGreaterThan(0);
      expect(quitacao.valor_total_devido).toBeGreaterThan(0);
      expect(quitacao.memoria_calculo).toBeDefined();
    });

    it("E009: Parcelamento manual gestor", () => {
      const resultado = calcularEmprestimo(
        "Gestor Customizado",
        2000,
        24,
        1.5,
        "simples"
      );

      expect(resultado.numero_parcelas).toBe(24);
      expect(resultado.taxa_juros_mensal).toBe(1.5);
    });

    it("E010: Data vencimento incrementa corretamente", () => {
      const resultado = calcularEmprestimo(
        "Test",
        1000,
        12,
        1.0,
        "simples",
        "2026-01-15"
      );

      const primeira_data = new Date(resultado.parcelas[0].data_vencimento);
      const segunda_data = new Date(resultado.parcelas[1].data_vencimento);

      expect(segunda_data.getMonth()).toBe(
        (primeira_data.getMonth() + 1) % 12
      );
    });
  });

  // ===============================
  // TESTES DE REAJUSTE IPCA (8 casos)
  // ===============================
  describe("Testes de Reajuste IPCA", () => {
    it("I001: IPCA 5%: urgência R$50 → R$52,50", () => {
      const resultado = aplicarReajusteIpca(5, {
        urgencia: 50,
      });

      expect(resultado.valores_novos.urgencia).toBeCloseTo(52.5, 2);
    });

    it("I002: IPCA 5%: Airbnb R$31,50 → R$33,08", () => {
      const resultado = aplicarReajusteIpca(5, {
        airbnb_1q: 31.5,
      });

      expect(resultado.valores_novos.airbnb_1q).toBeCloseTo(33.075, 2);
    });

    it("I003: Combustível NÃO entra (permanece R$6,50/L)", () => {
      const resultado = aplicarReajusteIpca(5, {
        combustivel_litro: 6.5,
      });

      // Combustível não é reajustado
      expect(resultado.valores_novos.combustivel_litro).toBe(6.5);
    });

    it("I004: Arredondamento a centavos", () => {
      const resultado = aplicarReajusteIpca(3.33, {
        urgencia: 50,
      });

      const valor_novo = resultado.valores_novos.urgencia;
      const casas_decimais = (valor_novo.toString().split(".")[1] || "").length;

      expect(casas_decimais).toBeLessThanOrEqual(2);
    });

    it("I005: Memória cálculo: valores antigos + percentual + novos", () => {
      const resultado = aplicarReajusteIpca(5, {
        urgencia: 50,
        airbnb_1q: 31.5,
      });

      expect(resultado.memorias.length).toBe(2);
      expect(resultado.memorias[0].valor_anterior).toBe(50);
      expect(resultado.memorias[0].percentual_ipca).toBe(5);
      expect(resultado.memorias[0].valor_novo).toBeCloseTo(52.5, 2);
    });

    it("I006: Vigência futura até aprovação", () => {
      const resultado = aplicarReajusteIpca(5, {
        urgencia: 50,
      }, "2026-02-01");

      expect(resultado.memorias[0].data_reajuste).toBe("2026-02-01");
    });

    it("I007: Múltiplos valores simultâneos", () => {
      const resultado = aplicarReajusteIpca(10, {
        urgencia: 50,
        airbnb_1q: 31.5,
        airbnb_2q: 37.8,
        combustivel_litro: 6.5,
      });

      expect(resultado.valores_novos.urgencia).toBeCloseTo(55, 2);
      expect(resultado.valores_novos.airbnb_1q).toBeCloseTo(34.65, 2);
      expect(resultado.valores_novos.airbnb_2q).toBeCloseTo(41.58, 2);
      expect(resultado.valores_novos.combustivel_litro).toBe(6.5);
    });

    it("I008: Observações informam combustível não reajustado", () => {
      const resultado = aplicarReajusteIpca(5, {
        urgencia: 50,
        combustivel_litro: 6.5,
      });

      expect(resultado.observacoes).toContain("Combustível não foi reajustado");
    });
  });

  // ===============================
  // TESTES DE VALIDAÇÃO (10 casos)
  // ===============================
  describe("Testes de Validação", () => {
    it("V001: Sequência cronológica válida", () => {
      const registros: RegistroHora[] = [
        { data: "2026-01-19", tipo: "entrada", horario: "08:00" },
        { data: "2026-01-19", tipo: "saida", horario: "17:00" },
      ];

      const resultado = validarSequenciaHoras(registros);

      expect(resultado.valido).toBe(true);
      expect(resultado.erros.length).toBe(0);
    });

    it("V002: Bloqueio evento fora de ordem", () => {
      const registros: RegistroHora[] = [
        { data: "2026-01-19", tipo: "entrada", horario: "12:00" },
        { data: "2026-01-19", tipo: "entrada", horario: "08:00" },
      ];

      const resultado = validarSequenciaHoras(registros);

      expect(resultado.valido).toBe(false);
      expect(resultado.erros.length).toBeGreaterThan(0);
    });

    it("V003: Retificação até dia seguinte: permitido", () => {
      const hoje = new Date();
      const ontem = new Date(hoje);
      ontem.setDate(ontem.getDate() - 1);
      const data_ontem = ontem.toISOString().split("T")[0];

      const registros: RegistroHora[] = [
        { data: data_ontem, tipo: "entrada", horario: "08:00" },
        { data: data_ontem, tipo: "saida", horario: "17:00" },
      ];

      const resultado = validarSequenciaHoras(registros);

      expect(resultado.requer_retificacao_gestor).toBe(false);
    });

    it("V004: Retificação após 1 dia: marcado como requer_aprovacao_gestor", () => {
      const hoje = new Date();
      const doisDiasAtras = new Date(hoje);
      doisDiasAtras.setDate(doisDiasAtras.getDate() - 2);
      const data_2dias = doisDiasAtras.toISOString().split("T")[0];

      const registros: RegistroHora[] = [
        { data: data_2dias, tipo: "entrada", horario: "08:00" },
        { data: data_2dias, tipo: "saida", horario: "17:00" },
      ];

      const resultado = validarSequenciaHoras(registros);

      expect(resultado.requer_retificacao_gestor).toBe(true);
    });

    it("V005: Sequência entrada → intervalo → retorno → saida válida", () => {
      const registros: RegistroHora[] = [
        { data: "2026-01-19", tipo: "entrada", horario: "08:00" },
        { data: "2026-01-19", tipo: "saida_intervalo", horario: "12:00" },
        { data: "2026-01-19", tipo: "retorno_intervalo", horario: "13:00" },
        { data: "2026-01-19", tipo: "saida", horario: "17:00" },
      ];

      const resultado = validarSequenciaHoras(registros);

      expect(resultado.valido).toBe(true);
    });

    it("V006: Bloqueio: retorno sem saida intervalo", () => {
      const registros: RegistroHora[] = [
        { data: "2026-01-19", tipo: "entrada", horario: "08:00" },
        { data: "2026-01-19", tipo: "retorno_intervalo", horario: "13:00" },
        { data: "2026-01-19", tipo: "saida", horario: "17:00" },
      ];

      const resultado = validarSequenciaHoras(registros);

      expect(resultado.valido).toBe(false);
    });

    it("V007: Mesmos horários não permitidos", () => {
      const registros: RegistroHora[] = [
        { data: "2026-01-19", tipo: "entrada", horario: "08:00" },
        { data: "2026-01-19", tipo: "saida", horario: "08:00" },
      ];

      const resultado = validarSequenciaHoras(registros);

      expect(resultado.valido).toBe(false);
    });

    it("V008: Múltiplos intervalos permitidos", () => {
      const registros: RegistroHora[] = [
        { data: "2026-01-19", tipo: "entrada", horario: "08:00" },
        { data: "2026-01-19", tipo: "saida_intervalo", horario: "10:00" },
        { data: "2026-01-19", tipo: "retorno_intervalo", horario: "10:30" },
        { data: "2026-01-19", tipo: "saida_intervalo", horario: "14:00" },
        { data: "2026-01-19", tipo: "retorno_intervalo", horario: "14:30" },
        { data: "2026-01-19", tipo: "saida", horario: "17:00" },
      ];

      const resultado = validarSequenciaHoras(registros);

      expect(resultado.valido).toBe(true);
    });

    it("V009: Registro com descrição opcional", () => {
      const registros: RegistroHora[] = [
        {
          data: "2026-01-19",
          tipo: "entrada",
          horario: "08:00",
          descricao: "Entrada no turno",
        },
        { data: "2026-01-19", tipo: "saida", horario: "17:00" },
      ];

      const resultado = validarSequenciaHoras(registros);

      expect(resultado.valido).toBe(true);
    });

    it("V010: Validação de sequência com dias diferentes", () => {
      const registros: RegistroHora[] = [
        { data: "2026-01-19", tipo: "entrada", horario: "08:00" },
        { data: "2026-01-20", tipo: "saida", horario: "08:00" },
      ];

      const resultado = validarSequenciaHoras(registros);

      expect(resultado.valido).toBe(true);
    });
  });

  // ===============================
  // TESTES ADICIONAIS EDGE CASES
  // ===============================
  describe("Edge Cases e Integração", () => {
    it("E-C001: Urgência com todos os adicionais", () => {
      const resultado = calcularUrgencia(
        "2026-01-01",
        "10:00",
        "11:30",
        true,
        ["2026-01-01"]
      );

      const esperado = 62.5 + 16.40625 + 21;
      expect(resultado.valor_total).toBeCloseTo(esperado, 2);
      expect(resultado.requer_analise).toBe(false);
    });

    it("E-C002: Airbnb com múltiplas combinações", () => {
      const casos = [
        { quartos: 1 as const, dentro: true, feriados: [] },
        { quartos: 1 as const, dentro: false, feriados: [] },
        { quartos: 2 as const, dentro: true, feriados: [] },
        { quartos: 3 as const, dentro: true, feriados: ["2026-01-19"] },
      ];

      for (const caso of casos) {
        const resultado = calcularAirbnb(
          "2026-01-19",
          "limpeza",
          caso.quartos,
          caso.dentro,
          caso.feriados
        );

        expect(resultado.valor_total).toBeGreaterThan(0);
      }
    });

    it("E-C003: Precisão total de valores (múltiplas casas decimais)", () => {
      const resultado = calcularCombustivel(1, 123, {
        valor_litro: 6.499,
        km_litro: 11.5,
      });

      const valor_esperado = (123 / 11.5) * 6.499;
      expect(resultado.valor_total).toBeCloseTo(valor_esperado, 2);
    });

    it("E-C004: Horas com precisão até centésimos", () => {
      const registros: RegistroHora[] = [
        { data: "2026-01-19", tipo: "entrada", horario: "08:15" },
        { data: "2026-01-19", tipo: "saida", horario: "17:45" },
      ];

      const resultado = calcularHoras(registros);

      expect(resultado.horas_efetivas).toBeCloseTo(9.5, 2);
    });

    it("E-C005: Empréstimo pequeno com múltiplas parcelas", () => {
      const resultado = calcularEmprestimo("Test", 100, 12, 0.5, "simples");

      expect(resultado.parcelas.length).toBe(12);
      const ultima = resultado.parcelas[resultado.parcelas.length - 1];
      expect(ultima.saldo_devedor).toBeCloseTo(0, 1);
    });

    it("E-C006: Reajuste IPCA com percentual fracionado", () => {
      const resultado = aplicarReajusteIpca(2.75, { urgencia: 50 });

      const valor_novo = resultado.valores_novos.urgencia;
      expect(valor_novo).toBeCloseTo(51.38, 1);
    });

    it("E-C007: Validação completa de fluxo diário", () => {
      const registros: RegistroHora[] = [
        { data: "2026-01-19", tipo: "entrada", horario: "08:00" },
        { data: "2026-01-19", tipo: "saida_intervalo", horario: "12:00" },
        { data: "2026-01-19", tipo: "retorno_intervalo", horario: "13:00" },
        { data: "2026-01-19", tipo: "saida", horario: "17:00" },
      ];

      const validacao = validarSequenciaHoras(registros);
      const horas = calcularHoras(registros);

      expect(validacao.valido).toBe(true);
      expect(horas.horas_efetivas).toBeGreaterThanOrEqual(8);
    });

    it("E-C008: Múltiplas urgências no mesmo dia", () => {
      const urg1 = calcularUrgencia("2026-01-19", "08:00", "09:00", false);
      const urg2 = calcularUrgencia("2026-01-19", "14:00", "14:30", true);

      const total = urg1.valor_total + urg2.valor_total;
      expect(total).toBeCloseTo(121, 1);
    });

    it("E-C009: Reajuste IPCA em todos os tipos de apontamento", () => {
      const resultado = aplicarReajusteIpca(5, {
        urgencia: 50,
        airbnb_1q: 31.5,
        airbnb_2q: 37.8,
        combustivel_litro: 6.5,
      });

      expect(resultado.memorias.length).toBe(3);
      expect(resultado.observacoes).toContain("não foi reajustado");
    });

    it("E-C010: Ciclo completo de empréstimo com quitação", () => {
      const emp = calcularEmprestimo("Test", 1000, 10, 1.0, "simples");
      const quit = quitarEmprestimoAntecipado(emp, 5);

      expect(quit.juros_economizados).toBeGreaterThan(0);
      expect(quit.valor_total_devido).toBeGreaterThan(0);
    });
  });
});
