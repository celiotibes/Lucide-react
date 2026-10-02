/**
 * Testes do módulo Cache em Memória
 * Validar: set, get, invalidate, invalidarPrefixo, TTL automático, stats
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cache, criarCacheRelatorio } from "../utils/cache-memoria.js";

describe("Cache em Memória", () => {
  beforeEach(() => {
    cache.limpar();
  });

  afterEach(() => {
    cache.limpar();
  });

  describe("set/get básico", () => {
    it("deve armazenar e recuperar um valor", () => {
      const valor = { receita: 50000, despesa: 30000 };
      cache.set("dre:2026:10", valor);

      const recuperado = cache.get("dre:2026:10");
      expect(recuperado).toEqual(valor);
    });

    it("deve retornar null quando chave não existe", () => {
      const resultado = cache.get("inexistente");
      expect(resultado).toBeNull();
    });

    it("deve suportar tipagem TypeScript com <T>", () => {
      interface DRE {
        receita: number;
        despesa: number;
      }
      const dre: DRE = { receita: 100000, despesa: 70000 };
      cache.set("dre:2026:09", dre);

      const recuperado = cache.get<DRE>("dre:2026:09");
      expect(recuperado?.receita).toBe(100000);
    });
  });

  describe("TTL e expiração automática", () => {
    it("deve expirar valor após TTL", async () => {
      const valor = { teste: true };
      cache.set("temp", valor, { ttl: 100 }); // 100ms

      expect(cache.get("temp")).toEqual(valor);

      // Aguarda expiração
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(cache.get("temp")).toBeNull();
    });

    it("deve usar TTL default de 1h se não especificado", () => {
      cache.set("chave", { value: 123 });
      expect(cache.get("chave")).toEqual({ value: 123 });
      // Não expira imediatamente
    });

    it("deve lipar timer anterior ao sobrescrever chave", async () => {
      cache.set("chave", "valor1", { ttl: 100 });
      await new Promise((resolve) => setTimeout(resolve, 50));

      cache.set("chave", "valor2", { ttl: 200 }); // Reseta timer
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Ainda deve existir (timer foi ressetado)
      expect(cache.get("chave")).toBe("valor2");
    });
  });

  describe("invalidate", () => {
    it("deve remover valor imediatamente", () => {
      cache.set("chave", "valor");
      expect(cache.get("chave")).toBe("valor");

      cache.invalidate("chave");
      expect(cache.get("chave")).toBeNull();
    });

    it("deve limpar timer pendente", async () => {
      cache.set("chave", "valor", { ttl: 1000 });
      cache.invalidate("chave");

      await new Promise((resolve) => setTimeout(resolve, 1100));
      // Não deve ter erro ao tentar limpar timer inexistente
      expect(cache.get("chave")).toBeNull();
    });
  });

  describe("invalidarPrefixo", () => {
    it("deve remover todas as chaves com prefixo especificado", () => {
      cache.set("dre:2026:10", { v: 1 });
      cache.set("dre:2026:09", { v: 2 });
      cache.set("fluxo:proximo-30d", { v: 3 });

      cache.invalidarPrefixo("dre:");

      expect(cache.get("dre:2026:10")).toBeNull();
      expect(cache.get("dre:2026:09")).toBeNull();
      expect(cache.get("fluxo:proximo-30d")).toEqual({ v: 3 }); // Preservado
    });

    it("deve ser seguro quando prefixo não existe", () => {
      cache.set("outra:chave", { v: 1 });

      // Não deve lançar erro
      cache.invalidarPrefixo("inexistente:");
      expect(cache.get("outra:chave")).toEqual({ v: 1 }); // Preservado
    });
  });

  describe("limpar", () => {
    it("deve remover tudo do cache", () => {
      cache.set("chave1", "valor1");
      cache.set("chave2", "valor2");

      cache.limpar();

      expect(cache.get("chave1")).toBeNull();
      expect(cache.get("chave2")).toBeNull();
      expect(cache.stats().total).toBe(0);
    });
  });

  describe("stats", () => {
    it("deve retornar total de chaves", () => {
      cache.set("chave1", "valor1");
      cache.set("chave2", "valor2");
      cache.set("chave3", "valor3");

      const stats = cache.stats();
      expect(stats.total).toBe(3);
      expect(stats.chaves).toContain("chave1");
      expect(stats.chaves).toContain("chave2");
      expect(stats.chaves).toContain("chave3");
    });

    it("deve refletir removals", () => {
      cache.set("chave1", "valor1");
      cache.set("chave2", "valor2");
      cache.invalidate("chave1");

      const stats = cache.stats();
      expect(stats.total).toBe(1);
      expect(stats.chaves).toEqual(["chave2"]);
    });
  });

  describe("criarCacheRelatorio", () => {
    it("deve criar cache type-safe com prefixo", () => {
      const cacheDre = criarCacheRelatorio("dre");

      cacheDre.set(2026, 10, { receita: 100000 });
      const valor = cacheDre.get(2026, 10);

      expect(valor).toEqual({ receita: 100000 });
    });

    it("deve invalidar com ano/mês", () => {
      const cacheDre = criarCacheRelatorio("dre");

      cacheDre.set(2026, 10, { receita: 100000 });
      cacheDre.invalidate(2026, 10);

      expect(cacheDre.get(2026, 10)).toBeNull();
    });
  });

  describe("Caso de uso real: DRE com múltiplos meses", () => {
    it("deve cachear DRE de vários meses sem conflito", () => {
      const dre2026_10 = { receita: 100000, despesa: 70000 };
      const dre2026_09 = { receita: 90000, despesa: 65000 };

      cache.set("dre:2026:10", dre2026_10);
      cache.set("dre:2026:09", dre2026_09);

      expect(cache.get("dre:2026:10")).toEqual(dre2026_10);
      expect(cache.get("dre:2026:09")).toEqual(dre2026_09);
    });

    it("deve responder em < 10ms após cache hit", () => {
      const dre = { receita: 100000, despesa: 70000 };
      cache.set("dre:2026:10", dre);

      const inicio = performance.now();
      const resultado = cache.get("dre:2026:10");
      const latencia = performance.now() - inicio;

      expect(resultado).toEqual(dre);
      expect(latencia).toBeLessThan(10); // < 10ms
    });
  });
});
