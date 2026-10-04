/**
 * Testes para Schemas de Validacao Zod
 * Valida todos os schemas de entrada com casos extremos e boundary values
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";

describe("Zod Validation Schemas - Comprehensive Tests", () => {
  describe("Numeric Validation - Integer Constraints", () => {
    const integerSchema = z.coerce.number().int().min(1).max(100);

    it("deve aceitar inteiro dentro do range", () => {
      expect(integerSchema.safeParse(50).success).toBe(true);
    });

    it("deve rejeitar float", () => {
      expect(integerSchema.safeParse(50.5).success).toBe(false);
    });

    it("deve coercionar string para inteiro", () => {
      const result = integerSchema.safeParse("50");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(50);
      }
    });

    it("deve rejeitar string nao numerica", () => {
      expect(integerSchema.safeParse("abc").success).toBe(false);
    });

    it("deve rejeitar valor abaixo do minimo", () => {
      expect(integerSchema.safeParse(0).success).toBe(false);
    });

    it("deve rejeitar valor acima do maximo", () => {
      expect(integerSchema.safeParse(101).success).toBe(false);
    });

    it("deve aceitar minimo exato", () => {
      expect(integerSchema.safeParse(1).success).toBe(true);
    });

    it("deve aceitar maximo exato", () => {
      expect(integerSchema.safeParse(100).success).toBe(true);
    });

    it("deve rejeitar infinito", () => {
      expect(integerSchema.safeParse(Infinity).success).toBe(false);
    });

    it("deve rejeitar NaN", () => {
      expect(integerSchema.safeParse(NaN).success).toBe(false);
    });
  });

  describe("Numeric Validation - Positive Numbers", () => {
    const positiveSchema = z.coerce.number().finite().positive();

    it("deve aceitar numero positivo", () => {
      expect(positiveSchema.safeParse(100).success).toBe(true);
    });

    it("deve rejeitar zero", () => {
      expect(positiveSchema.safeParse(0).success).toBe(false);
    });

    it("deve rejeitar numero negativo", () => {
      expect(positiveSchema.safeParse(-100).success).toBe(false);
    });

    it("deve aceitar numero decimal positivo muito pequeno", () => {
      expect(positiveSchema.safeParse(0.0001).success).toBe(true);
    });

    it("deve rejeitar infinito", () => {
      expect(positiveSchema.safeParse(Infinity).success).toBe(false);
    });

    it("deve rejeitar -infinito", () => {
      expect(positiveSchema.safeParse(-Infinity).success).toBe(false);
    });
  });

  describe("String Validation - Length Constraints", () => {
    const stringSchema = z.string().min(1).max(100);

    it("deve aceitar string dentro do range", () => {
      expect(stringSchema.safeParse("hello").success).toBe(true);
    });

    it("deve rejeitar string vazia", () => {
      expect(stringSchema.safeParse("").success).toBe(false);
    });

    it("deve aceitar string com 1 caracter", () => {
      expect(stringSchema.safeParse("a").success).toBe(true);
    });

    it("deve aceitar string com 100 caracteres", () => {
      const str = "a".repeat(100);
      expect(stringSchema.safeParse(str).success).toBe(true);
    });

    it("deve rejeitar string com 101 caracteres", () => {
      const str = "a".repeat(101);
      expect(stringSchema.safeParse(str).success).toBe(false);
    });

    it("deve aceitar string com espacos", () => {
      expect(stringSchema.safeParse("hello world").success).toBe(true);
    });

    it("deve aceitar string com caracteres especiais", () => {
      expect(stringSchema.safeParse("hello@#$%").success).toBe(true);
    });

    it("deve rejeitar non-string", () => {
      expect(stringSchema.safeParse(123).success).toBe(false);
    });
  });

  describe("String Validation - With Trim", () => {
    const trimSchema = z.string().min(1).max(100).trim();

    it("deve trimmar espacos em branco", () => {
      const result = trimSchema.safeParse("  hello  ");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("hello");
      }
    });

    it("deve rejeitar apenas espacos", () => {
      expect(trimSchema.safeParse("   ").success).toBe(false);
    });

    it("deve aceitar string com espacos no meio", () => {
      const result = trimSchema.safeParse("  hello world  ");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("hello world");
      }
    });
  });

  describe("Enum Validation", () => {
    const enumSchema = z.enum(["baixa", "media", "critica"]);

    it("deve aceitar valor exato", () => {
      expect(enumSchema.safeParse("baixa").success).toBe(true);
      expect(enumSchema.safeParse("media").success).toBe(true);
      expect(enumSchema.safeParse("critica").success).toBe(true);
    });

    it("deve rejeitar valor nao exato (case sensitive)", () => {
      expect(enumSchema.safeParse("Baixa").success).toBe(false);
      expect(enumSchema.safeParse("MEDIA").success).toBe(false);
    });

    it("deve rejeitar valor diferente", () => {
      expect(enumSchema.safeParse("altissima").success).toBe(false);
    });

    it("deve rejeitar null", () => {
      expect(enumSchema.safeParse(null).success).toBe(false);
    });

    it("deve rejeitar undefined", () => {
      expect(enumSchema.safeParse(undefined).success).toBe(false);
    });
  });

  describe("Strict Object Validation", () => {
    const strictSchema = z.object({
      name: z.string().min(1),
      age: z.coerce.number().int().min(0),
    }).strict();

    it("deve aceitar objeto valido com campos exatos", () => {
      expect(strictSchema.safeParse({ name: "John", age: 30 }).success).toBe(true);
    });

    it("deve rejeitar campos extras", () => {
      expect(strictSchema.safeParse({ name: "John", age: 30, email: "john@test.com" }).success).toBe(false);
    });

    it("deve rejeitar objeto sem campos obrigatorios", () => {
      expect(strictSchema.safeParse({ name: "John" }).success).toBe(false);
    });

    it("deve rejeitar objeto com campos nulos", () => {
      expect(strictSchema.safeParse({ name: null, age: 30 }).success).toBe(false);
    });

    it("deve coercionar age string para numero", () => {
      const result = strictSchema.safeParse({ name: "John", age: "30" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.age).toBe(30);
      }
    });
  });

  describe("Optional Field Validation", () => {
    const optionalSchema = z.object({
      required: z.string(),
      optional: z.string().optional(),
      withDefault: z.string().optional().default("default-value"),
    });

    it("deve aceitar objeto com campo opcional ausente", () => {
      expect(optionalSchema.safeParse({ required: "test" }).success).toBe(true);
    });

    it("deve aceitar objeto com campo opcional presente", () => {
      expect(optionalSchema.safeParse({ required: "test", optional: "value" }).success).toBe(true);
    });

    it("deve usar valor padrao quando opcional ausente", () => {
      const result = optionalSchema.safeParse({ required: "test" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.withDefault).toBe("default-value");
      }
    });

    it("deve rejeitar quando campo obrigatorio ausente", () => {
      expect(optionalSchema.safeParse({ optional: "value" }).success).toBe(false);
    });
  });

  describe("Array Validation", () => {
    const arraySchema = z.array(z.string().min(1)).max(10);

    it("deve aceitar array valido", () => {
      expect(arraySchema.safeParse(["a", "b", "c"]).success).toBe(true);
    });

    it("deve aceitar array vazio", () => {
      expect(arraySchema.safeParse([]).success).toBe(true);
    });

    it("deve rejeitar array com elemento vazio", () => {
      expect(arraySchema.safeParse(["a", "", "c"]).success).toBe(false);
    });

    it("deve rejeitar array maior que maximo", () => {
      const arr = Array(11).fill("a");
      expect(arraySchema.safeParse(arr).success).toBe(false);
    });

    it("deve aceitar array com 10 elementos (maximo)", () => {
      const arr = Array(10).fill("a");
      expect(arraySchema.safeParse(arr).success).toBe(true);
    });
  });

  describe("Regex Validation", () => {
    const emailSchema = z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);

    it("deve aceitar email valido", () => {
      expect(emailSchema.safeParse("test@example.com").success).toBe(true);
    });

    it("deve rejeitar email sem @", () => {
      expect(emailSchema.safeParse("testexample.com").success).toBe(false);
    });

    it("deve rejeitar email sem dominio", () => {
      expect(emailSchema.safeParse("test@").success).toBe(false);
    });

    it("deve rejeitar email com espacos", () => {
      expect(emailSchema.safeParse("test @example.com").success).toBe(false);
    });
  });

  describe("Transformation Pipeline", () => {
    const transformSchema = z.coerce.number().int().positive().pipe(
      z.number().min(1).max(100)
    );

    it("deve aplicar transformacoes em sequencia", () => {
      const result = transformSchema.safeParse("50");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(50);
      }
    });

    it("deve rejeitar se alguma transformacao falhar", () => {
      expect(transformSchema.safeParse("abc").success).toBe(false);
    });

    it("deve validar constraints apos transformacoes", () => {
      expect(transformSchema.safeParse("150").success).toBe(false);
    });
  });

  describe("Nullable and Optional Combinations", () => {
    const complexSchema = z.object({
      required: z.string(),
      nullable: z.string().nullable(),
      optional: z.string().optional(),
      optionalNullable: z.string().nullable().optional(),
    });

    it("deve aceitar campos nulos", () => {
      expect(complexSchema.safeParse({
        required: "test",
        nullable: null,
      }).success).toBe(true);
    });

    it("deve rejeitar null em campo obrigatorio", () => {
      expect(complexSchema.safeParse({
        required: null,
      }).success).toBe(false);
    });

    it("deve aceitar optional como undefined", () => {
      const result = complexSchema.safeParse({
        required: "test",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("Error Messages", () => {
    const schema = z.object({
      age: z.coerce.number().int().min(0, "Age must be positive").max(150, "Age must be <= 150"),
    });

    it("deve retornar mensagem de erro customizada", () => {
      const result = schema.safeParse({ age: -1 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("positive");
      }
    });

    it("deve retornar todos os erros", () => {
      const multiErrorSchema = z.object({
        name: z.string().min(1),
        age: z.coerce.number().int().positive(),
        email: z.string().email(),
      });

      const result = multiErrorSchema.safeParse({
        name: "",
        age: -5,
        email: "invalid",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Date Validation", () => {
    const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format");

    it("deve aceitar data em formato YYYY-MM-DD", () => {
      expect(dateSchema.safeParse("2026-10-04").success).toBe(true);
    });

    it("deve rejeitar formato DD/MM/YYYY", () => {
      expect(dateSchema.safeParse("04/10/2026").success).toBe(false);
    });

    it("deve rejeitar mes invalido", () => {
      expect(dateSchema.safeParse("2026-13-04").success).toBe(false);
    });

    it("deve aceitar dia de mes invalido (validacao regex, nao calendario)", () => {
      // Regex nao valida calendarios, apenas formato
      expect(dateSchema.safeParse("2026-02-31").success).toBe(true);
    });
  });
});
