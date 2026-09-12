import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar } from "../../db/connection";
import { calcularInadimplencia, agingPorFaixa } from "./inadimplencia";
import type { Excecao } from "./contratos";
import type { CompetenciaEsperada } from "../types";

async function bancoBase() {
  const db = await criarBancoDeTeste();
  executar(db, "INSERT INTO contas_bancarias (id, banco, numero, titular, tipo) VALUES (1, 'Banco Teste', '000-0', 'Célio', 'corrente')");
  executar(db, "INSERT INTO imoveis (id, apelido, tipo) VALUES (1, 'Kitnet 1', 'kitnet')");
  return db;
}

function excecao(competencia: Partial<CompetenciaEsperada> & { contrato_id: number }): Excecao {
  return {
    motivo: "sem transação correspondente",
    competencia: {
      imovel_id: 1,
      mes_referencia: "2026-01-01",
      valor_esperado: 1000,
      ...competencia,
    },
  };
}

describe("calcularInadimplencia", () => {
  it("sem atraso (hoje ainda não passou do vencimento): situação 'pago', zero encargos", async () => {
    const db = await bancoBase();
    executar(
      db,
      `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio, dia_vencimento)
       VALUES (1, 1, 'Locatário', 'residencial_fixo', 1000, '2026-01-01', 10)`,
    );
    const [status] = calcularInadimplencia(db, [excecao({ contrato_id: 1, mes_referencia: "2026-01-01", valor_esperado: 1000 })], "2026-01-05");

    expect(status.situacao).toBe("pago");
    expect(status.diasAtraso).toBe(0);
    expect(status.multa).toBe(0);
    expect(status.juros).toBe(0);
    expect(status.totalDevido).toBe(1000);
  });

  it("dentro da faixa inicial de multa: aplica multa_percentual sobre o principal, juros pro-rata die", async () => {
    const db = await bancoBase();
    executar(
      db,
      `INSERT INTO contratos_locacao
         (id, imovel_id, locatario, tipo, valor_referencia, data_inicio, dia_vencimento,
          multa_percentual, multa_ate_dias, multa_percentual_substitutiva, juros_mensal_percentual, indice_correcao_mora)
       VALUES (1, 1, 'Locatário', 'residencial_fixo', 1000, '2026-01-01', 1,
               2.0, 5, 10.0, 1.0, 'nenhum')`,
    );
    // Vencimento em 2026-01-01, "hoje" em 2026-01-04 => 3 dias de atraso, dentro de multa_ate_dias=5.
    const [status] = calcularInadimplencia(db, [excecao({ contrato_id: 1, mes_referencia: "2026-01-01", valor_esperado: 1000 })], "2026-01-04");

    expect(status.diasAtraso).toBe(3);
    expect(status.multa).toBeCloseTo(1000 * 0.02, 6); // faixa inicial, sobre o principal
    expect(status.juros).toBeCloseTo(1000 * 0.01 * (3 / 30), 6);
    expect(status.correcaoMonetaria).toBe(0); // índice 'nenhum'
    expect(status.situacao).toBe("em_aberto");
  });

  it("após multa_ate_dias: a multa substitutiva SUBSTITUI a inicial (não soma) e incide sobre o débito já atualizado", async () => {
    const db = await bancoBase();
    executar(
      db,
      `INSERT INTO contratos_locacao
         (id, imovel_id, locatario, tipo, valor_referencia, data_inicio, dia_vencimento,
          multa_percentual, multa_ate_dias, multa_percentual_substitutiva, juros_mensal_percentual, indice_correcao_mora)
       VALUES (1, 1, 'Locatário', 'residencial_fixo', 1000, '2026-01-01', 1,
               2.0, 5, 10.0, 1.0, 'nenhum')`,
    );
    // 40 dias de atraso — bem além de multa_ate_dias=5.
    const [status] = calcularInadimplencia(db, [excecao({ contrato_id: 1, mes_referencia: "2026-01-01", valor_esperado: 1000 })], "2026-02-10");

    const jurosEsperado = 1000 * 0.01 * (40 / 30);
    expect(status.diasAtraso).toBe(40);
    expect(status.juros).toBeCloseTo(jurosEsperado, 6);
    // Multa substitutiva sobre (principal + juros + correção), não apenas sobre o principal.
    expect(status.multa).toBeCloseTo((1000 + jurosEsperado + 0) * 0.1, 6);
    expect(status.situacao).toBe("inadimplente"); // > 30 dias
  });

  it("correção monetária compõe mês a mês pela série cadastrada, sem inventar mês sem taxa", async () => {
    const db = await bancoBase();
    executar(
      db,
      `INSERT INTO contratos_locacao
         (id, imovel_id, locatario, tipo, valor_referencia, data_inicio, dia_vencimento,
          multa_percentual, multa_ate_dias, multa_percentual_substitutiva, juros_mensal_percentual, indice_correcao_mora)
       VALUES (1, 1, 'Locatário', 'residencial_fixo', 1000, '2026-01-01', 1,
               2.0, 5, 10.0, 0, 'igpm')`,
    );
    executar(db, "INSERT INTO indices_economicos (indice, mes_referencia, taxa_mensal) VALUES ('igpm', '2026-01-01', 1.0)");
    // Fevereiro fica sem taxa cadastrada de propósito.

    const [status] = calcularInadimplencia(db, [excecao({ contrato_id: 1, mes_referencia: "2026-01-01", valor_esperado: 1000 })], "2026-03-01");

    // Só janeiro (único mês com taxa) compôs o fator — fevereiro não é inventado.
    expect(status.correcaoMonetaria).toBeCloseTo(1000 * 0.01, 6);
  });

  it("honorários só aparecem quando o atraso ultrapassa o gatilho judicial do contrato", async () => {
    const db = await bancoBase();
    executar(
      db,
      `INSERT INTO contratos_locacao
         (id, imovel_id, locatario, tipo, valor_referencia, data_inicio, dia_vencimento,
          multa_percentual, multa_ate_dias, multa_percentual_substitutiva, juros_mensal_percentual,
          indice_correcao_mora, honorarios_percentual, dias_gatilho_judicial)
       VALUES (1, 1, 'Locatário', 'residencial_fixo', 1000, '2026-01-01', 1,
               2.0, 5, 10.0, 0, 'nenhum', 20, 60)`,
    );

    // 45 dias — ainda abaixo do gatilho de 60.
    const [statusAntes] = calcularInadimplencia(db, [excecao({ contrato_id: 1, mes_referencia: "2026-01-01", valor_esperado: 1000 })], "2026-02-15");
    expect(statusAntes.honorarios).toBe(0);

    // 70 dias — passou do gatilho de 60.
    const [statusDepois] = calcularInadimplencia(db, [excecao({ contrato_id: 1, mes_referencia: "2026-01-01", valor_esperado: 1000 })], "2026-03-12");
    expect(statusDepois.honorarios).toBeGreaterThan(0);
    expect(statusDepois.totalDevido).toBeCloseTo(
      1000 + statusDepois.juros + statusDepois.correcaoMonetaria + statusDepois.multa + statusDepois.honorarios,
      6,
    );
  });

  it("contrato não encontrado: usa os valores padrão documentados (nunca quebra nem inventa cláusula)", async () => {
    const db = await bancoBase();
    // Nenhum contrato inserido — o id 1 referenciado pela exceção não existe na tabela.
    const [status] = calcularInadimplencia(db, [excecao({ contrato_id: 1, mes_referencia: "2026-01-01", valor_esperado: 1000 })], "2026-01-10");

    // Padrões: dia_vencimento=5, multa_percentual=2%, multa_ate_dias=5 → 5 dias de atraso, na faixa inicial.
    expect(status.diasAtraso).toBe(5);
    expect(status.multa).toBeCloseTo(1000 * 0.02, 6);
  });
});

describe("agingPorFaixa", () => {
  it("agrupa por faixa de atraso e ignora competências sem atraso (diasAtraso <= 0)", () => {
    const base: Omit<import("../types").StatusInadimplencia, "diasAtraso" | "totalDevido" | "situacao"> = {
      competencia: { contrato_id: 1, imovel_id: 1, mes_referencia: "2026-01-01", valor_esperado: 1000 },
      multa: 0,
      juros: 0,
      correcaoMonetaria: 0,
      honorarios: 0,
    };
    const status: import("../types").StatusInadimplencia[] = [
      { ...base, diasAtraso: 0, totalDevido: 1000, situacao: "pago" },
      { ...base, diasAtraso: 10, totalDevido: 1000, situacao: "em_aberto" },
      { ...base, diasAtraso: 45, totalDevido: 1100, situacao: "inadimplente" },
      { ...base, diasAtraso: 120, totalDevido: 1300, situacao: "inadimplente" },
    ];

    const aging = agingPorFaixa(status);

    expect(aging["1-30 dias"]).toEqual({ quantidade: 1, total: 1000 });
    expect(aging["31-90 dias"]).toEqual({ quantidade: 1, total: 1100 });
    expect(aging["90+ dias"]).toEqual({ quantidade: 1, total: 1300 });
  });
});
