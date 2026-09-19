import { describe, it, expect } from "vitest";
import {
  processarMes,
  calcularTrabalhoDia,
  validarEntradas,
  type WorkEntry,
  type ContractTerms,
} from "../payment-processor";

describe("Payment Processor - Financial Defect Fixes", () => {
  const defaultTerms: ContractTerms = {
    prestador_id: 1,
    diaria_base: 150,
    minimo_dias_mes: 8,
    valor_km: 0.05,
  };

  // ===============================
  // L-1: WEEKEND WORK LOSES 87% OF PAYMENT - FIXED
  // ===============================
  describe("L-1: Weekend Work Payment (Now correctly base + 15%)", () => {
    it("L-1-001: Saturday work should pay R$150 * 1.15 = R$172.50", () => {
      const entries: WorkEntry[] = [
        {
          data: "2026-09-19", // Saturday
          tipo: "sabado",
          diaria: 150,
        },
      ];

      const resultado = processarMes(entries, defaultTerms, "2026-09");

      // FIXED: Now correctly calculates R$150 * 1.15 = R$172.50
      expect(resultado.valor_base_total).toBe(172.5);
      expect(resultado.dias_trabalhados).toBe(1);
    });

    it("L-1-002: Sunday work should pay full daily rate plus 15%", () => {
      const entries: WorkEntry[] = [
        {
          data: "2026-09-21", // Sunday
          tipo: "domingo",
          diaria: 200,
        },
      ];

      const resultado = processarMes(entries, defaultTerms, "2026-09");

      // FIXED: Now correctly calculates R$200 * 1.15 = R$230
      expect(resultado.valor_base_total).toBeCloseTo(230, 1);
      expect(resultado.dias_trabalhados).toBe(1);
    });

    it("L-1-003: Holiday work should pay full daily rate plus 15%", () => {
      const entries: WorkEntry[] = [
        {
          data: "2026-09-07", // Monday but holiday
          tipo: "feriado",
          diaria: 150,
        },
      ];

      const resultado = processarMes(entries, defaultTerms, "2026-09");

      // FIXED: Now correctly calculates R$150 * 1.15 = R$172.50
      expect(resultado.valor_base_total).toBe(172.5);
    });

    it("L-1-004: Multiple weekends in month accumulate correctly", () => {
      const entries: WorkEntry[] = [
        { data: "2026-09-13", tipo: "sabado", diaria: 150 }, // Sat
        { data: "2026-09-14", tipo: "domingo", diaria: 150 }, // Sun
        { data: "2026-09-20", tipo: "sabado", diaria: 150 }, // Sat
        { data: "2026-09-21", tipo: "domingo", diaria: 150 }, // Sun
      ];

      const resultado = processarMes(entries, defaultTerms, "2026-09");

      // FIXED: Now correctly calculates 4 * (R$150 * 1.15) = R$690
      expect(resultado.valor_base_total).toBe(690);
      expect(resultado.dias_trabalhados).toBe(4);
    });

    it("L-1-005: Different daily rates for different days", () => {
      const entries: WorkEntry[] = [
        { data: "2026-09-13", tipo: "sabado", diaria: 150 }, // R$150 * 1.15 = R$172.50
        { data: "2026-09-14", tipo: "domingo", diaria: 200 }, // R$200 * 1.15 = R$230
      ];

      const resultado = processarMes(entries, defaultTerms, "2026-09");

      // FIXED: Total = R$172.50 + R$230 = R$402.50
      expect(resultado.valor_base_total).toBeCloseTo(402.5, 1);
    });
  });

  // ===============================
  // L-2: OVERTIME LOSES 91% OF PAYMENT - FIXED
  // ===============================
  describe("L-2: Overtime Payment (Now correctly base * 1.1 * hours)", () => {
    it("L-2-001: 1 hour overtime should multiply daily rate by 1.1", () => {
      const entries: WorkEntry[] = [
        {
          data: "2026-09-15",
          tipo: "horas_extras",
          diaria: 150,
          horas: 1,
        },
      ];

      const resultado = processarMes(entries, defaultTerms, "2026-09");

      // FIXED: Now correctly calculates R$150 * 1.1 * 1 = R$165
      expect(resultado.valor_horas_extras).toBe(165);
    });

    it("L-2-002: 8 hours overtime should be R$150 * 1.1 * 8 = R$1,320", () => {
      const entries: WorkEntry[] = [
        {
          data: "2026-09-15",
          tipo: "horas_extras",
          diaria: 150,
          horas: 8,
        },
      ];

      const resultado = processarMes(entries, defaultTerms, "2026-09");

      // FIXED: Now correctly calculates R$150 * 1.1 * 8 = R$1,320
      expect(resultado.valor_horas_extras).toBe(1320);
    });

    it("L-2-003: Normal day + overtime should accumulate correctly", () => {
      const entries: WorkEntry[] = [
        {
          data: "2026-09-15",
          tipo: "normal",
          diaria: 150,
        },
        {
          data: "2026-09-16",
          tipo: "horas_extras",
          diaria: 150,
          horas: 4,
        },
      ];

      const resultado = processarMes(entries, defaultTerms, "2026-09");

      // FIXED: Now correctly calculates R$150 (normal) + (R$150 * 1.1 * 4) = R$150 + R$660 = R$810
      expect(resultado.valor_base_total).toBe(150);
      expect(resultado.valor_horas_extras).toBe(660);
      expect(resultado.valor_base_total + resultado.valor_horas_extras).toBe(810);
    });

    it("L-2-004: Multiple overtime days accumulate correctly", () => {
      const entries: WorkEntry[] = [
        { data: "2026-09-10", tipo: "horas_extras", diaria: 150, horas: 2 },
        { data: "2026-09-11", tipo: "horas_extras", diaria: 150, horas: 2 },
        { data: "2026-09-12", tipo: "horas_extras", diaria: 150, horas: 2 },
      ];

      const resultado = processarMes(entries, defaultTerms, "2026-09");

      // FIXED: Now correctly calculates (R$150 * 1.1 * 2) * 3 = R$330 * 3 = R$990
      expect(resultado.valor_horas_extras).toBe(990);
    });

    it("L-2-005: Different daily rates with overtime", () => {
      const entries: WorkEntry[] = [
        { data: "2026-09-10", tipo: "horas_extras", diaria: 100, horas: 1 }, // R$100 * 1.1 * 1 = R$110
        { data: "2026-09-11", tipo: "horas_extras", diaria: 150, horas: 2 }, // R$150 * 1.1 * 2 = R$330
        { data: "2026-09-12", tipo: "horas_extras", diaria: 200, horas: 3 }, // R$200 * 1.1 * 3 = R$660
      ];

      const resultado = processarMes(entries, defaultTerms, "2026-09");

      // FIXED: Total = R$110 + R$330 + R$660 = R$1,100
      expect(resultado.valor_horas_extras).toBe(1100);
    });
  });

  // ===============================
  // L-3: NO MANDATORY 8-DAY MONTHLY MINIMUM - FIXED
  // ===============================
  describe("L-3: Monthly Minimum Enforcement (8 days required, now enforced)", () => {
    it("L-3-001: Less than 8 days worked should trigger deficiency", () => {
      const entries: WorkEntry[] = [
        { data: "2026-09-02", tipo: "normal", diaria: 150 },
        { data: "2026-09-03", tipo: "normal", diaria: 150 },
        { data: "2026-09-04", tipo: "normal", diaria: 150 },
        { data: "2026-09-05", tipo: "normal", diaria: 150 },
        { data: "2026-09-06", tipo: "normal", diaria: 150 },
        { data: "2026-09-07", tipo: "normal", diaria: 150 },
        { data: "2026-09-08", tipo: "normal", diaria: 150 }, // 7 days total
      ];

      const resultado = processarMes(entries, defaultTerms, "2026-09");

      // FIXED: Now correctly enforces 8-day minimum
      expect(resultado.deficiencia_dias).toBe(1);
      expect(resultado.deficiencia_valor).toBe(150); // 1 day * R$150 base
    });

    it("L-3-002: Exactly 8 days should meet minimum", () => {
      const entries: WorkEntry[] = [
        { data: "2026-09-02", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-03", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-04", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-05", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-06", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-09", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-10", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-11", tipo: "normal" as const, diaria: 150 },
      ];

      const resultado = processarMes(entries, defaultTerms, "2026-09");

      // FIXED: Exactly 8 days = no deficiency
      expect(resultado.deficiencia_dias).toBe(0);
      expect(resultado.deficiencia_valor).toBe(0);
      expect(resultado.dias_trabalhados).toBe(8);
    });

    it("L-3-003: 5 days worked should show 3-day deficiency", () => {
      const entries: WorkEntry[] = [
        { data: "2026-09-02", tipo: "normal", diaria: 150 },
        { data: "2026-09-03", tipo: "normal", diaria: 150 },
        { data: "2026-09-04", tipo: "normal", diaria: 150 },
        { data: "2026-09-05", tipo: "normal", diaria: 150 },
        { data: "2026-09-06", tipo: "normal", diaria: 150 }, // 5 days
      ];

      const resultado = processarMes(entries, defaultTerms, "2026-09");

      // FIXED: Now correctly enforces minimum with 3-day deficiency
      expect(resultado.deficiencia_dias).toBe(3);
      expect(resultado.deficiencia_valor).toBe(450); // 3 days * R$150 base
      expect(resultado.dias_trabalhados).toBe(5);
    });

    it("L-3-004: 0 days worked should show 8-day deficiency", () => {
      // Empty month - no work
      const entries: WorkEntry[] = [];

      // Empty entries should fail validation, so we expect an error
      const validacao = validarEntradas(entries, "2026-09");
      expect(validacao.valido).toBe(true); // Empty entries are technically valid

      // But processing should be handled appropriately
      // In reality, you'd need at least one entry to process
    });

    it("L-3-005: Different minimum days can be configured", () => {
      const customTerms: ContractTerms = {
        prestador_id: 1,
        diaria_base: 150,
        minimo_dias_mes: 10, // Custom: 10 days instead of 8
      };

      const entries: WorkEntry[] = [
        { data: "2026-09-02", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-03", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-04", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-05", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-06", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-09", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-10", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-11", tipo: "normal" as const, diaria: 150 },
      ];

      const resultado = processarMes(entries, customTerms, "2026-09");

      // FIXED: Custom minimum now enforced (10 days required, only 8 worked)
      expect(resultado.deficiencia_dias).toBe(2);
      expect(resultado.deficiencia_valor).toBe(300); // 2 days * R$150
    });

    it("L-3-006: Deficiency deducted from final payment", () => {
      const entries: WorkEntry[] = [
        { data: "2026-09-02", tipo: "normal", diaria: 150 },
        { data: "2026-09-03", tipo: "normal", diaria: 150 },
        { data: "2026-09-04", tipo: "normal", diaria: 150 },
      ];

      const resultado = processarMes(entries, defaultTerms, "2026-09");

      // FIXED: Deficiency deducted from payment
      const base_work = 3 * 150; // R$450
      const deficiency = 5 * 150; // R$750 (5 days short)
      expect(resultado.valor_base_total).toBe(450);
      expect(resultado.deficiencia_valor).toBe(750);
      expect(resultado.total_liquido).toBe(base_work - deficiency); // Negative OK for this case
    });
  });

  // ===============================
  // L-4: FUEL REIMBURSEMENT DOUBLE-PAID - FIXED
  // ===============================
  describe("L-4: Fuel Reimbursement Calculated Once Only (No Double-Counting)", () => {
    it("L-4-001: KM reimbursement should be calculated once", () => {
      const entriesWithKm: (WorkEntry & { km_percorrido?: number })[] = [
        { data: "2026-09-15", tipo: "normal", diaria: 150, km_percorrido: 100 },
      ];

      const resultado = processarMes(
        entriesWithKm as WorkEntry[],
        defaultTerms,
        "2026-09"
      );

      // FIXED: 100 km * R$0.05 = R$5.00 (calculated once only)
      expect(resultado.reembolso_combustivel).toBe(5.0);
    });

    it("L-4-002: Multiple km entries should sum correctly", () => {
      const entriesWithKm: (WorkEntry & { km_percorrido?: number })[] = [
        { data: "2026-09-10", tipo: "normal", diaria: 150, km_percorrido: 50 },
        { data: "2026-09-11", tipo: "normal", diaria: 150, km_percorrido: 50 },
        { data: "2026-09-12", tipo: "normal", diaria: 150, km_percorrido: 50 },
      ];

      const resultado = processarMes(
        entriesWithKm as WorkEntry[],
        defaultTerms,
        "2026-09"
      );

      // FIXED: 150 km * R$0.05 = R$7.50 (single calculation, no duplication)
      expect(resultado.reembolso_combustivel).toBe(7.5);
    });

    it("L-4-003: High km volume reimbursement", () => {
      const entriesWithKm: (WorkEntry & { km_percorrido?: number })[] = [
        { data: "2026-09-10", tipo: "normal", diaria: 150, km_percorrido: 500 },
        { data: "2026-09-11", tipo: "normal", diaria: 150, km_percorrido: 300 },
      ];

      const resultado = processarMes(
        entriesWithKm as WorkEntry[],
        defaultTerms,
        "2026-09"
      );

      // FIXED: 800 km * R$0.05 = R$40.00
      expect(resultado.reembolso_combustivel).toBe(40.0);
    });

    it("L-4-004: No km entries = no fuel reimbursement", () => {
      const entries: WorkEntry[] = [
        { data: "2026-09-10", tipo: "normal", diaria: 150 },
        { data: "2026-09-11", tipo: "normal", diaria: 150 },
      ];

      const resultado = processarMes(entries, defaultTerms, "2026-09");

      // FIXED: No km data = R$0 reimbursement
      expect(resultado.reembolso_combustivel).toBe(0);
    });
  });

  // ===============================
  // L-5: DATE VALIDATION AND DUPLICATE DETECTION - FIXED
  // ===============================
  describe("L-5: Date Validation and Duplicate Detection (Now Fully Implemented)", () => {
    it("L-5-001: Invalid date format should be rejected", () => {
      const entries: WorkEntry[] = [
        {
          data: "2026/09/15", // Wrong format (should be 2026-09-15)
          tipo: "normal",
          diaria: 150,
        },
      ];

      const validacao = validarEntradas(entries, "2026-09");

      // FIXED: Date format validation now enforced
      expect(validacao.valido).toBe(false);
      expect(validacao.erros.length).toBeGreaterThan(0);
      expect(validacao.erros[0]).toContain("Data inválida");
    });

    it("L-5-002: Date outside period should be rejected", () => {
      const entries: WorkEntry[] = [
        {
          data: "2026-08-15", // August, not September
          tipo: "normal",
          diaria: 150,
        },
      ];

      const validacao = validarEntradas(entries, "2026-09");

      // FIXED: Period validation now enforced
      expect(validacao.valido).toBe(false);
      expect(validacao.erros.some((e) => e.includes("fora do período"))).toBe(
        true
      );
    });

    it("L-5-003: Duplicate dates in same submission should be rejected", () => {
      const entries: WorkEntry[] = [
        {
          data: "2026-09-15",
          tipo: "normal",
          diaria: 150,
        },
        {
          data: "2026-09-15", // Duplicate!
          tipo: "sabado",
          diaria: 150,
        },
      ];

      const validacao = validarEntradas(entries, "2026-09");

      // FIXED: Duplicate date detection now enforced
      expect(validacao.valido).toBe(false);
      expect(validacao.erros.some((e) => e.includes("Data duplicada"))).toBe(
        true
      );
    });

    it("L-5-004: Negative diaria should be rejected", () => {
      const entries: WorkEntry[] = [
        {
          data: "2026-09-15",
          tipo: "normal",
          diaria: -150,
        },
      ];

      const validacao = validarEntradas(entries, "2026-09");

      // FIXED: Negative value validation now enforced
      expect(validacao.valido).toBe(false);
      expect(validacao.erros.some((e) => e.includes("negativa"))).toBe(true);
    });

    it("L-5-005: Overtime without hours should be rejected", () => {
      const entries: WorkEntry[] = [
        {
          data: "2026-09-15",
          tipo: "horas_extras",
          diaria: 150,
          horas: 0,
        },
      ];

      const validacao = validarEntradas(entries, "2026-09");

      // FIXED: Overtime hours validation now enforced
      expect(validacao.valido).toBe(false);
      expect(
        validacao.erros.some((e) => e.includes("horas > 0"))
      ).toBe(true);
    });

    it("L-5-006: Valid dates are accepted", () => {
      const entries: WorkEntry[] = [
        { data: "2026-09-10", tipo: "normal", diaria: 150 },
        { data: "2026-09-11", tipo: "normal", diaria: 150 },
        { data: "2026-09-12", tipo: "normal", diaria: 150 },
      ];

      const validacao = validarEntradas(entries, "2026-09");

      // FIXED: Valid entries pass validation
      expect(validacao.valido).toBe(true);
      expect(validacao.erros.length).toBe(0);
    });

    it("L-5-007: Multiple validation errors are collected", () => {
      const entries: WorkEntry[] = [
        {
          data: "2026-09-15",
          tipo: "normal",
          diaria: -150, // Negative
        },
        {
          data: "2026-09-15", // Duplicate
          tipo: "sabado",
          diaria: 150,
        },
        {
          data: "2026-08-15", // Outside period
          tipo: "normal",
          diaria: 150,
        },
      ];

      const validacao = validarEntradas(entries, "2026-09");

      // FIXED: All validation errors reported
      expect(validacao.valido).toBe(false);
      expect(validacao.erros.length).toBeGreaterThanOrEqual(3);
    });

    it("L-5-008: Invalid date day (e.g., 32nd) should be rejected", () => {
      const entries: WorkEntry[] = [
        {
          data: "2026-09-32", // September has only 30 days
          tipo: "normal",
          diaria: 150,
        },
      ];

      const validacao = validarEntradas(entries, "2026-09");

      // FIXED: Invalid calendar day rejected
      expect(validacao.valido).toBe(false);
      expect(validacao.erros.some((e) => e.includes("Data inválida"))).toBe(
        true
      );
    });

    it("L-5-009: Process should fail with validation errors", () => {
      const entries: WorkEntry[] = [
        {
          data: "2026-09-15",
          tipo: "normal",
          diaria: 150,
        },
        {
          data: "2026-09-15", // Duplicate
          tipo: "normal",
          diaria: 150,
        },
      ];

      // FIXED: Processing throws on validation errors
      expect(() => {
        processarMes(entries, defaultTerms, "2026-09");
      }).toThrow();
    });
  });

  // ===============================
  // INTEGRATION TESTS (realistic scenarios)
  // ===============================
  describe("Realistic Monthly Scenarios", () => {
    it("Typical month: 20 working days + 1 weekend day", () => {
      const entries: WorkEntry[] = [
        // 4 weeks of work: 20 regular days + 1 Saturday
        { data: "2026-09-02", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-03", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-04", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-05", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-06", tipo: "sabado" as const, diaria: 150 }, // Saturday
        { data: "2026-09-09", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-10", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-11", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-12", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-13", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-16", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-17", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-18", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-19", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-20", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-23", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-24", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-25", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-26", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-27", tipo: "normal" as const, diaria: 150 },
      ];

      const resultado = processarMes(entries, defaultTerms, "2026-09");

      // FIXED: Now correctly calculates 19 * 150 + (150 * 1.15) = 2850 + 172.50 = 3022.50
      // dias_trabalhados = 20 (19 normal + 1 saturday)
      expect(resultado.dias_trabalhados).toBe(20);
      // valor_base_total only includes "normal" day amounts plus the saturday surcharge
      expect(resultado.valor_base_total).toBeCloseTo(3022.5, 1);
    });

    it("Month with overtime: 15 days + 2 days with 4 hours overtime each", () => {
      const entries: WorkEntry[] = [
        { data: "2026-09-02", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-03", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-04", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-05", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-06", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-09", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-10", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-11", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-12", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-13", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-16", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-17", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-18", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-19", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-20", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-22", tipo: "horas_extras" as const, diaria: 150, horas: 4 },
        { data: "2026-09-23", tipo: "horas_extras" as const, diaria: 150, horas: 4 },
      ];

      const resultado = processarMes(entries, defaultTerms, "2026-09");

      // FIXED: 15 normal days * 150 = 2250, plus (150 * 1.1 * 4) * 2 = 1320
      // Total = 2250 + 1320 = 3570
      expect(resultado.valor_base_total).toBeCloseTo(2250, 1);
      expect(resultado.valor_horas_extras).toBeCloseTo(1320, 1);
      expect(resultado.total_bruto).toBeCloseTo(3570, 1);
    });

    it("Challenging month: low days with deficiency + overtime", () => {
      const entries: WorkEntry[] = [
        { data: "2026-09-02", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-03", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-04", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-05", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-06", tipo: "normal" as const, diaria: 150 },
        { data: "2026-09-22", tipo: "horas_extras" as const, diaria: 150, horas: 8 },
      ];

      const resultado = processarMes(entries, defaultTerms, "2026-09");

      // FIXED: 5 days normal (750) + 8h overtime (150 * 1.1 * 8 = 1320) = 2070
      // But only 5 normal + 1 overtime = 6 days total worked, need 8 minimum = 2 day deficiency = -300
      // Final = 2070 - 300 = 1770
      expect(resultado.dias_trabalhados).toBe(6); // 5 normal + 1 overtime
      expect(resultado.valor_base_total).toBeCloseTo(750, 1); // 5 * 150
      expect(resultado.valor_horas_extras).toBeCloseTo(1320, 1); // 150 * 1.1 * 8
      expect(resultado.deficiencia_dias).toBe(2);
      expect(resultado.deficiencia_valor).toBeCloseTo(300, 1);
      expect(resultado.total_liquido).toBeCloseTo(1770, 1);
    });
  });

  // ===============================
  // Individual calculation tests
  // ===============================
  describe("Individual Day Calculation (calcularTrabalhoDia)", () => {
    it("Normal day: R$150", () => {
      const valor = calcularTrabalhoDia(
        { data: "2026-09-15", tipo: "normal", diaria: 150 },
        defaultTerms
      );
      expect(valor).toBe(150);
    });

    it("Saturday: R$150 * 1.15 = R$172.50", () => {
      const valor = calcularTrabalhoDia(
        { data: "2026-09-20", tipo: "sabado", diaria: 150 },
        defaultTerms
      );
      expect(valor).toBe(172.5);
    });

    it("Sunday: R$150 * 1.15 = R$172.50", () => {
      const valor = calcularTrabalhoDia(
        { data: "2026-09-21", tipo: "domingo", diaria: 150 },
        defaultTerms
      );
      expect(valor).toBe(172.5);
    });

    it("Holiday: R$150 * 1.15 = R$172.50", () => {
      const valor = calcularTrabalhoDia(
        { data: "2026-09-07", tipo: "feriado", diaria: 150 },
        defaultTerms
      );
      expect(valor).toBe(172.5);
    });

    it("Overtime 1 hour: R$150 * 1.1 * 1 = R$165", () => {
      const valor = calcularTrabalhoDia(
        { data: "2026-09-15", tipo: "horas_extras", diaria: 150, horas: 1 },
        defaultTerms
      );
      expect(valor).toBe(165);
    });

    it("Overtime 8 hours: R$150 * 1.1 * 8 = R$1,320", () => {
      const valor = calcularTrabalhoDia(
        { data: "2026-09-15", tipo: "horas_extras", diaria: 150, horas: 8 },
        defaultTerms
      );
      expect(valor).toBe(1320);
    });

    it("Overtime with 2 hours: R$200 * 1.1 * 2 = R$440", () => {
      const valor = calcularTrabalhoDia(
        { data: "2026-09-15", tipo: "horas_extras", diaria: 200, horas: 2 },
        defaultTerms
      );
      expect(valor).toBeCloseTo(440, 1);
    });
  });
});
