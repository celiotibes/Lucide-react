import { describe, it, expect, beforeEach } from "vitest";
import { gerarProjecaoCaixa } from "../cash-forecast";
import { prepararBancoTeste } from "./test-setup";

describe("Cash Forecast (12-month projection)", () => {
  let db: any;
  let entidade_id: number;
  let periodo_id: number;

  beforeEach(async () => {
    const setup = await prepararBancoTeste();
    db = setup.db;
    entidade_id = setup.entidade_id;
    periodo_id = setup.periodo_id;
  });

  describe("gerarProjecaoCaixa", () => {
    it("deve retornar estrutura de projeção válida", () => {
      const projecao = gerarProjecaoCaixa(db, entidade_id, periodo_id);

      expect(projecao).toHaveProperty("mes_projecao");
      expect(projecao).toHaveProperty("saldo_atual");
      expect(projecao).toHaveProperty("projecoes");
      expect(projecao).toHaveProperty("saldo_minimo_projetado");
      expect(projecao).toHaveProperty("saldo_maximo_projetado");
      expect(projecao).toHaveProperty("mes_critico");
      expect(projecao).toHaveProperty("tendencia");
      expect(projecao).toHaveProperty("recomendacoes");
    });

    it("deve gerar 12 meses de projeção", () => {
      const projecao = gerarProjecaoCaixa(db, entidade_id, periodo_id);

      expect(projecao.projecoes.length).toBe(12);
    });

    it("cada projeção mensal deve ter estrutura válida", () => {
      const projecao = gerarProjecaoCaixa(db, entidade_id, periodo_id);

      for (const proj of projecao.projecoes) {
        expect(proj).toHaveProperty("ano");
        expect(proj).toHaveProperty("mes");
        expect(proj).toHaveProperty("saldo_inicial");
        expect(proj).toHaveProperty("entradas_operacional");
        expect(proj).toHaveProperty("saidas_operacional");
        expect(proj).toHaveProperty("liquido_operacional");
        expect(proj).toHaveProperty("saldo_final");
        expect(proj).toHaveProperty("confianca");
        expect(["alta", "media", "baixa"]).toContain(proj.confianca);
      }
    });

    it("líquido operacional = entradas - saídas", () => {
      const projecao = gerarProjecaoCaixa(db, entidade_id, periodo_id);

      for (const proj of projecao.projecoes) {
        const esperado = proj.entradas_operacional - proj.saidas_operacional;
        expect(proj.liquido_operacional).toBe(esperado);
      }
    });

    it("saldo_final >= 0 (conservador)", () => {
      const projecao = gerarProjecaoCaixa(db, entidade_id, periodo_id);

      for (const proj of projecao.projecoes) {
        expect(proj.saldo_final).toBeGreaterThanOrEqual(0);
      }
    });

    it("saldo_minimo deve ser menor ou igual a todos os saldos_final", () => {
      const projecao = gerarProjecaoCaixa(db, entidade_id, periodo_id);

      for (const proj of projecao.projecoes) {
        expect(projecao.saldo_minimo_projetado).toBeLessThanOrEqual(proj.saldo_final + 0.01);
      }
    });

    it("saldo_maximo deve ser maior ou igual a todos os saldos_final", () => {
      const projecao = gerarProjecaoCaixa(db, entidade_id, periodo_id);

      for (const proj of projecao.projecoes) {
        expect(projecao.saldo_maximo_projetado).toBeGreaterThanOrEqual(proj.saldo_final - 0.01);
      }
    });

    it("mes_critico deve ser null se saldo nunca negativo", () => {
      const projecao = gerarProjecaoCaixa(db, entidade_id, periodo_id);

      const temNegativo = projecao.projecoes.some((p) => p.saldo_final < 0);
      if (!temNegativo) {
        expect(projecao.mes_critico).toBeNull();
      }
    });

    it("tendencia deve estar em positiva/negativa/estavel", () => {
      const projecao = gerarProjecaoCaixa(db, entidade_id, periodo_id);

      expect(["positiva", "negativa", "estavel"]).toContain(projecao.tendencia);
    });

    it("recomendacoes deve ser array", () => {
      const projecao = gerarProjecaoCaixa(db, entidade_id, periodo_id);

      expect(Array.isArray(projecao.recomendacoes)).toBe(true);
    });

    it("mes_projecao deve estar no formato YYYY/MM", () => {
      const projecao = gerarProjecaoCaixa(db, entidade_id, periodo_id);

      expect(projecao.mes_projecao).toMatch(/^\d{4}\/\d{2}$/);
    });

    it("meses devem ser sequenciais", () => {
      const projecao = gerarProjecaoCaixa(db, entidade_id, periodo_id);

      for (let i = 1; i < projecao.projecoes.length; i++) {
        const atual = projecao.projecoes[i];
        const anterior = projecao.projecoes[i - 1];

        let mesEsperado = anterior.mes + 1;
        let anoEsperado = anterior.ano;

        if (mesEsperado > 12) {
          mesEsperado = 1;
          anoEsperado += 1;
        }

        expect(atual.mes).toBe(mesEsperado);
        expect(atual.ano).toBe(anoEsperado);
      }
    });

    it("primeiro saldo_inicial deve ser saldo_atual", () => {
      const projecao = gerarProjecaoCaixa(db, entidade_id, periodo_id);

      expect(projecao.projecoes[0].saldo_inicial).toBe(projecao.saldo_atual);
    });

    it("saldo_inicial de mês i+1 deve ser saldo_final de mês i", () => {
      const projecao = gerarProjecaoCaixa(db, entidade_id, periodo_id);

      for (let i = 1; i < projecao.projecoes.length; i++) {
        expect(projecao.projecoes[i].saldo_inicial).toBe(projecao.projecoes[i - 1].saldo_final);
      }
    });
  });
});
