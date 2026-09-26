import { describe, expect, it } from "vitest";
import {
  calcularUrgencia,
  calcularAirbnb,
  calcularCombustivel,
  calcularHoras,
  calcularEmprestimo,
  gerarPropostaReajusteIPCA,
  type TabelasAtuais,
} from "../apontamento-calculos";

/**
 * Testes de src/domain/erp/apontamento-calculos.ts — lógica pura (sem SQL) de cálculo de
 * urgência, Airbnb, combustível, horas, empréstimo e reajuste IPCA do apontamento do
 * prestador.
 *
 * O módulo já era exercitado incidentalmente por
 * __tests__/apontamento-ledger-integration.test.ts, mas só como INSUMO para testar a
 * integração com o ledger (que usa um fixture de schema ad-hoc, escrito à mão, nem o
 * schema.sql real nem test-setup.ts) — nenhum teste cobria as funções de cálculo em si
 * nem seus casos de borda. Este arquivo cobre isso diretamente.
 *
 * ACHADOS (gravidade ALTA) corrigidos nesta tarefa, ambos em apontamento-calculos.ts:
 *
 * 1. calcularCombustivel(quilometros negativo, ...): a fórmula (litros = km ÷ consumo)
 *    não validava o sinal — um erro de digitação ou de integração que mande km negativo
 *    produzia um REEMBOLSO NEGATIVO silencioso (sem erro, sem NaN, um número que parece
 *    perfeitamente válido). Corrigido para recusar explicitamente quilometragem negativa,
 *    mesmo princípio de "nunca fabricar dado" já aplicado a outros módulos (ex:
 *    rateios.base_incompleta).
 *
 * 2. calcularEmprestimo(..., taxa_juros_mensal = 0, ...): um empréstimo/adiantamento
 *    SEM JUROS é uma entrada perfeitamente válida (ex: adiantamento a prestador), mas
 *    taxa 0% faz fator = (1+0)^prazo = 1, e a fórmula do sistema Price divide por
 *    (fator − 1) = 0 — toda parcela saía NaN, silenciosamente, sem lançar erro nenhum.
 *    Corrigido: taxa 0% agora amortiza linearmente (valor_original ÷ prazo_meses, juros
 *    zero em cada parcela).
 *
 * Como reproduzir antes da correção: reverter os dois trechos marcados com comentário em
 * apontamento-calculos.ts e rodar
 * `npx vitest run src/domain/erp/__tests__/apontamento-calculos.test.ts`.
 */
describe("apontamento-calculos", () => {
  describe("calcularUrgencia", () => {
    it("dia útil até 60 min: R$ 50, sem análise manual", () => {
      // 2026-01-19 é segunda-feira — dia_semana = 1
      const r = calcularUrgencia("2026-01-19", 45, false, 1);
      expect(r.valor_base).toBe(50);
      expect(r.adicional_percentual).toBe(0);
      expect(r.adicional_deslocamento).toBe(0);
      expect(r.valor_final).toBe(50);
      expect(r.requer_analise_manual).toBe(false);
    });

    it("domingo até 60 min: R$ 62,50", () => {
      // 2026-01-18 é domingo — dia_semana = 0
      const r = calcularUrgencia("2026-01-18", 45, false, 0);
      expect(r.valor_base).toBe(62.5);
      expect(r.valor_final).toBe(62.5);
      expect(r.requer_analise_manual).toBe(false);
    });

    it("dia útil acima de 60 min: exige análise manual, sem adicional automático", () => {
      const r = calcularUrgencia("2026-01-19", 90, false, 1);
      expect(r.requer_analise_manual).toBe(true);
      expect(r.valor_base).toBe(50);
      expect(r.adicional_percentual).toBe(0);
      expect(r.valor_final).toBe(50);
    });

    it("domingo acima de 60 min: R$ 62,50 + minutos excedentes × R$ 0,546875", () => {
      const r = calcularUrgencia("2026-01-18", 90, false, 0);
      expect(r.memoria_calculo.minutos_excedentes).toBe(30);
      expect(r.adicional_percentual).toBeCloseTo(16.41, 2); // 30 × 0.546875 = 16.40625 → 16,41
      expect(r.valor_final).toBeCloseTo(78.91, 2);
      expect(r.requer_analise_manual).toBe(false);
    });

    it("deslocamento Carvoeira ↔ Córrego soma R$ 21 fixo", () => {
      const r = calcularUrgencia("2026-01-19", 45, true, 1, "Carvoeira-Corrego");
      expect(r.adicional_deslocamento).toBe(21);
      expect(r.valor_final).toBe(71);
    });

    it("deslocamento de outro tipo não soma o adicional fixo", () => {
      const r = calcularUrgencia("2026-01-19", 45, true, 1, "Outro-Tipo-Qualquer");
      expect(r.adicional_deslocamento).toBe(0);
      expect(r.valor_final).toBe(50);
    });
  });

  describe("calcularAirbnb", () => {
    it("limpeza dentro do horário comercial em dia útil", () => {
      const r = calcularAirbnb("1q", "limpeza", "10:00", "11:00", 1, true, false);
      expect(r.valor_base).toBe(31.5);
      expect(r.valor_final).toBe(31.5);
      expect(r.requer_analise).toBe(false);
    });

    it("limpeza fora do horário comercial em dia útil", () => {
      const r = calcularAirbnb("1q", "limpeza", "19:00", "20:00", 2, true, false);
      expect(r.valor_base).toBe(42);
      expect(r.valor_final).toBe(42);
    });

    it("limpeza em domingo/feriado nunca conta como 'dentro do comercial', mesmo em horário diurno", () => {
      // Regressão do achado já documentado no código: antes, ehDentroComercial olhava só
      // o relógio (09h–18h) e ignorava se o dia era domingo/feriado — a tarifa de
      // domingo (63) ficava inalcançável para qualquer serviço diurno de domingo.
      const r = calcularAirbnb("1q", "limpeza", "10:00", "11:00", 0, true, false);
      expect(r.memoria_calculo.eh_dentro_comercial).toBe(false);
      expect(r.valor_base).toBe(63);
    });

    it("sábado é tratado como dia normal (tarifa de fora do horário útil, não a de domingo/feriado)", () => {
      const r = calcularAirbnb("1q", "limpeza", "19:00", "20:00", 6, true, false);
      expect(r.memoria_calculo.es_sabado).toBe(true);
      expect(r.valor_base).toBe(42);
    });

    it("2 quartos aplica +20% sobre o valor de 1 quarto", () => {
      const r1q = calcularAirbnb("1q", "limpeza", "10:00", "11:00", 1, true, false);
      const r2q = calcularAirbnb("2q", "limpeza", "10:00", "11:00", 1, true, false);
      expect(r2q.valor_base).toBeCloseTo(r1q.valor_base * 1.2, 6);
    });

    it("manutenção fora do comercial em dia útil soma 20%", () => {
      const r = calcularAirbnb("1q", "manutencao", "19:00", "20:00", 2, true, false);
      expect(r.valor_base).toBe(42);
      expect(r.memoria_calculo.percentual_adicional).toBe(20);
      expect(r.valor_final).toBeCloseTo(50.4, 2);
    });

    it("manutenção fora do comercial em fim de semana soma 25%", () => {
      const r = calcularAirbnb("1q", "manutencao", "19:00", "20:00", 0, true, true);
      expect(r.memoria_calculo.percentual_adicional).toBe(25);
      expect(r.valor_final).toBeCloseTo(52.5, 2);
    });

    it("revisão e urgência sempre exigem análise do gestor, sem valor automático", () => {
      const revisao = calcularAirbnb("1q", "revisao", "10:00", "11:00", 1, true, false);
      const urgencia = calcularAirbnb("1q", "urgencia", "10:00", "11:00", 1, true, false);
      expect(revisao.requer_analise).toBe(true);
      expect(revisao.valor_final).toBe(0);
      expect(urgencia.requer_analise).toBe(true);
      expect(urgencia.valor_final).toBe(0);
    });
  });

  describe("calcularCombustivel", () => {
    it("calcula litros e reembolso pela fórmula km ÷ consumo × valor do litro", () => {
      const r = calcularCombustivel(100, 6.5, 10);
      expect(r.litros).toBe(10);
      expect(r.valor_reembolso).toBe(65);
    });

    it("valores zerados: 0 km percorrido gera 0 litro e 0 de reembolso, sem erro", () => {
      const r = calcularCombustivel(0, 6.5, 10);
      expect(r.litros).toBe(0);
      expect(r.valor_reembolso).toBe(0);
    });

    it("deslocamento negativo é recusado em vez de gerar reembolso negativo", () => {
      expect(() => calcularCombustivel(-50, 6.5, 10)).toThrow(/negativa/i);
    });

    it("usa os valores padrão de litro e consumo quando não informados", () => {
      const r = calcularCombustivel(50);
      expect(r.litros).toBe(5); // 50 ÷ 10 km/l (padrão)
      expect(r.valor_reembolso).toBe(32.5); // 5 × R$ 6,50 (padrão)
    });
  });

  describe("calcularHoras", () => {
    it("diária fracionada: 7h30 trabalhadas é 93,75% da diária (proporcional, não integral)", () => {
      const r = calcularHoras("08:00", "12:00", "13:00", "16:30");
      expect(r.horas_efetivas).toBe(7.5);
      expect(r.intervalo_desconto).toBe(1);
      expect(r.diaria_integral).toBe(false);
      expect(r.percentual_diaria).toBeCloseTo(93.75, 2);
    });

    it("valores zerados: entrada e saída idênticas geram 0 hora efetiva e 0% de diária", () => {
      const r = calcularHoras("09:00", "09:00", "09:00", "09:00");
      expect(r.horas_efetivas).toBe(0);
      expect(r.diaria_integral).toBe(false);
      expect(r.percentual_diaria).toBe(0);
    });

    it("8 horas efetivas é o limiar exato da diária integral (100%)", () => {
      const r = calcularHoras("08:00", "12:00", "13:00", "17:00");
      expect(r.horas_efetivas).toBe(8);
      expect(r.diaria_integral).toBe(true);
      expect(r.percentual_diaria).toBe(100);
    });

    it("jornada acima de 8 horas permanece em 100% (nunca ultrapassa a diária integral)", () => {
      const r = calcularHoras("07:00", "12:00", "13:00", "18:00");
      expect(r.horas_efetivas).toBe(10);
      expect(r.diaria_integral).toBe(true);
      expect(r.percentual_diaria).toBe(100);
    });
  });

  describe("calcularEmprestimo", () => {
    it("valores zerados: taxa de juros 0% amortiza linearmente, sem gerar NaN", () => {
      const r = calcularEmprestimo(1200, 0, 12);

      expect(r.valor_parcela).toBe(100);
      expect(Number.isNaN(r.valor_parcela)).toBe(false);
      expect(r.valor_total_com_juros).toBe(1200); // sem juros: total = valor original

      for (const parcela of r.parcelas_array) {
        expect(parcela.juros).toBe(0);
        expect(Number.isNaN(parcela.principal)).toBe(false);
      }
      expect(r.parcelas_array.at(-1)?.saldo_devedor).toBe(0);
    });

    it("com juros reais, amortiza o valor original por completo ao fim do prazo", () => {
      const r = calcularEmprestimo(1000, 2, 6);

      expect(r.valor_parcela).toBeGreaterThan(0);
      expect(Number.isNaN(r.valor_parcela)).toBe(false);
      expect(r.parcelas_array).toHaveLength(6);
      expect(r.parcelas_array.at(-1)?.saldo_devedor).toBe(0);
      // Parcela fixa (Price): total pago = parcela × prazo
      expect(r.valor_total_com_juros).toBeCloseTo(r.valor_parcela * 6, 2);
      // Juros decrescem conforme o saldo devedor cai
      expect(r.parcelas_array[0].juros).toBeGreaterThan(r.parcelas_array[5].juros);
    });
  });

  describe("gerarPropostaReajusteIPCA", () => {
    const tabelas: TabelasAtuais = {
      urgencia: {
        dia_util_ate_60min: 50,
        domingo_feriado_ate_60min: 62.5,
        taxa_minuto_excedente_dom_fer: 0.55,
      },
      airbnb_1q: { dentro_comercial: 31.5, fora_uteis: 42, sabado_domingo_feriado: 63 },
      airbnb_2q: { dentro_comercial: 37.8, fora_uteis: 50.4, sabado_domingo_feriado: 75.6 },
      deslocamentos: { carvoeira_corrego: 21 },
    };

    it("aplica o percentual do IPCA a todas as rubricas atualizáveis", () => {
      const r = gerarPropostaReajusteIPCA(5, tabelas);

      const urgenciaDiaUtil = r.tabelas_propostas.find((t) => t.rubrica === "Urgência - Dia útil até 60 min");
      expect(urgenciaDiaUtil?.valor_novo).toBeCloseTo(52.5, 2); // 50 × 1,05

      expect(r.memoria_calculo.rubricas_nao_atualizadas).toContain(
        "Combustível (atualização manual necessária)",
      );
    });

    it("valores zerados: 0% de IPCA não altera nenhum valor", () => {
      const r = gerarPropostaReajusteIPCA(0, tabelas);

      for (const proposta of r.tabelas_propostas) {
        expect(proposta.valor_novo).toBe(proposta.valor_atual);
        expect(proposta.diferenca).toBe(0);
      }
      expect(r.memoria_calculo.total_impacto_mensal).toBe(0);
    });
  });
});
