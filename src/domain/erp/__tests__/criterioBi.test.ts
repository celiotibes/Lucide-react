import { describe, it, expect, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { criarEntidadeLegal } from "../entidadeLegal";
import { CONTA_CAIXA_ERP } from "../mapeamentoPlanoApp";
import { criarCentroCustoImovel, analiseRentabilidadePorCentro } from "../alocacao-centros-custo";
import { calcularKPIRentabilidade, calcularTendencia, calcularOcupacao } from "../analytics-integradas";
import { calcularBudgetVariance } from "../budget-variance";
import { gerarProjecaoCaixa } from "../cash-forecast";
import { gerarDRE, gerarFluxoCaixa, gerarBalanco, gerarRelatorioIntegrado } from "../relatorios-integrados";
import { resultadoMensal, compararBrutoLiquido, resumirDivergenciaEstornos } from "../readModelsBi";
import {
  fragmentoLedger,
  normalizarAsOf,
  resultadosDivergem,
  tratamentoAlternativo,
} from "../criterioBi";

const RECEITA = 4101;
const DESPESA = 6301;

/**
 * Cenário (entidade PF, imóvel IM-0001):
 *  jan: receita 1000 (criada 10/01), receita 400 (criada 12/01), despesa 150 (15/01)
 *  fev: receita 300 (03/02); em 05/02 a receita de 400 de janeiro é ESTORNADA (reverso lançado em fev,
 *       porque janeiro já está fechado) — o par estornado+estornador cruza meses.
 * Valores esperados à mão:
 *  bruto  jan: receita 1400 (crédito)            | fev: receita 300 crédito, reverso 400 débito
 *  líquido jan: receita 1000                      | fev: receita 300
 */
describe("Critério de BI: tratamento de estorno, período e asOf", () => {
  let db: Database;
  let pf: number;
  let jan: number;
  let fev: number;
  let cc: number;
  let seq = 0;

  const insere = (o: {
    periodo: number;
    conta: number;
    deb?: number;
    cred?: number;
    data: string;
    criadoEm: string;
    origemId: number;
    centro?: number;
    estornoDe?: number;
  }): number => {
    db.run(
      `INSERT INTO ledger_entries (entidade_id, periodo_id, centro_custo_id, conta_id, data_lancamento,
         valor_debito, valor_credito, descricao, origem_modulo, origem_id, referencia_documento,
         criado_em, estorno_de_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'x', 'contratos', ?, ?, ?, ?)`,
      [
        pf,
        o.periodo,
        o.centro ?? null,
        o.conta,
        o.data,
        o.deb ?? null,
        o.cred ?? null,
        o.origemId,
        `REF-${o.origemId}`,
        o.criadoEm,
        o.estornoDe ?? null,
      ],
    );
    return db.exec("SELECT last_insert_rowid()")[0].values[0][0] as number;
  };

  /** Partida dobrada receita: caixa (débito) x receita (crédito). Devolve [caixa, receita]. */
  const receita = (periodo: number, valor: number, data: string, criadoEm: string): [number, number] => {
    const id = ++seq;
    const cx = insere({ periodo, conta: CONTA_CAIXA_ERP, deb: valor, data, criadoEm, origemId: id, centro: cc });
    const rc = insere({ periodo, conta: RECEITA, cred: valor, data, criadoEm, origemId: id, centro: cc });
    return [cx, rc];
  };

  const despesa = (periodo: number, valor: number, data: string, criadoEm: string): void => {
    const id = ++seq;
    insere({ periodo, conta: DESPESA, deb: valor, data, criadoEm, origemId: id, centro: cc });
    insere({ periodo, conta: CONTA_CAIXA_ERP, cred: valor, data, criadoEm, origemId: id, centro: cc });
  };

  /** Estorna as duas pernas num período posterior: reverso com estorno_de_id e vínculo no original. */
  const estornar = (pernas: [number, number], periodo: number, data: string, criadoEm: string, valor: number): void => {
    const id = ++seq;
    const rcvCx = insere({ periodo, conta: CONTA_CAIXA_ERP, cred: valor, data, criadoEm, origemId: id, estornoDe: pernas[0] });
    const rcvRc = insere({ periodo, conta: RECEITA, deb: valor, data, criadoEm, origemId: id, estornoDe: pernas[1] });
    db.run("UPDATE ledger_entries SET estornado_por_id = ? WHERE id = ?", [rcvCx, pernas[0]]);
    db.run("UPDATE ledger_entries SET estornado_por_id = ? WHERE id = ?", [rcvRc, pernas[1]]);
  };

  const periodo = (mes: number): number => {
    db.run("INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2026, ?, 'aberto')", [pf, mes]);
    return db.exec("SELECT last_insert_rowid()")[0].values[0][0] as number;
  };

  /** Estado do razão só com janeiro (o que existia no fechamento de 31/01). */
  const lancarJaneiro = (): [number, number] => {
    receita(jan, 1000, "2026-01-10", "2026-01-10 09:00:00");
    const r2 = receita(jan, 400, "2026-01-12", "2026-01-12 09:00:00");
    despesa(jan, 150, "2026-01-15", "2026-01-15 09:00:00");
    return r2;
  };

  beforeEach(async () => {
    seq = 0;
    db = await criarBancoDeTeste();
    pf = criarEntidadeLegal(db, { nome: "Célio PF", cpf_cnpj: "52998224725" }).entidade_id!;
    jan = periodo(1);
    fev = periodo(2);
    cc = criarCentroCustoImovel(db, pf, 1, "Kitnet 1");
  });

  const cenarioCompleto = (): void => {
    const r2 = lancarJaneiro();
    receita(fev, 300, "2026-02-03", "2026-02-03 09:00:00");
    estornar(r2, fev, "2026-02-05", "2026-02-05 09:00:00", 400);
  };

  describe("fragmento SQL", () => {
    it("critério ausente ou bruto sem filtro gera fragmento VAZIO (SQL idêntico ao de antes)", () => {
      expect(fragmentoLedger(undefined)).toEqual({ sql: "", params: [] });
      expect(fragmentoLedger({})).toEqual({ sql: "", params: [] });
      expect(fragmentoLedger({ tratamentoEstorno: "bruto" })).toEqual({ sql: "", params: [] });
    });

    it("valida entradas e normaliza asOf", () => {
      expect(() => fragmentoLedger({ de: "2026-13" })).toThrow(/YYYY-MM/);
      expect(() => fragmentoLedger({ ate: "26-01" })).toThrow(/YYYY-MM/);
      expect(() => fragmentoLedger({ asOf: "ontem" })).toThrow(/asOf/);
      expect(() => fragmentoLedger({ tratamentoEstorno: "x" as never, de: "2026-01" })).toThrow(/inválido/);
      expect(normalizarAsOf("2026-01-31")).toBe("2026-01-31 23:59:59");
      expect(normalizarAsOf("2026-01-31T10:30")).toBe("2026-01-31 10:30:59");
      expect(normalizarAsOf("2026-01-31T10:30:15.123Z")).toBe("2026-01-31 10:30:15");
      expect(tratamentoAlternativo("bruto")).toBe("liquido");
    });
  });

  describe("golden: o padrão não muda os números", () => {
    beforeEach(cenarioCompleto);

    it("valores fixos do cenário (calculados à mão) com e sem o parâmetro explícito 'bruto'", () => {
      const kpiJan = calcularKPIRentabilidade(db, pf, jan);
      expect(kpiJan.receita_total).toBe(1400);
      expect(kpiJan.despesa_total).toBe(150);
      expect(kpiJan.resultado_liquido).toBe(1250);
      const kpiFev = calcularKPIRentabilidade(db, pf, fev);
      expect(kpiFev.receita_total).toBe(300); // o reverso (débito) é ignorado: divergência conhecida

      // DRE já é líquida de contrapartida dentro do período: jan 1400; fev 300 - 400 (reverso).
      expect(gerarDRE(db, pf, jan).receitas.aluguel).toBe(1400);
      expect(gerarDRE(db, pf, fev).receitas.aluguel).toBe(-100);

      const fluxoFev = gerarFluxoCaixa(db, pf, fev);
      expect(fluxoFev.operacional.entradas).toBe(300);
      expect(fluxoFev.operacional.saidas).toBe(400);

      const rent = analiseRentabilidadePorCentro(db, pf, jan);
      expect(rent).toHaveLength(1);
      expect(rent[0].receita_total).toBe(1400);
      expect(rent[0].despesa_total).toBe(150);
    });

    it("omitir o critério == { tratamentoEstorno: 'bruto' } == {} em todas as funções (toEqual profundo)", () => {
      const explicito = { tratamentoEstorno: "bruto" as const };
      expect(calcularKPIRentabilidade(db, pf, jan, explicito)).toEqual(calcularKPIRentabilidade(db, pf, jan));
      expect(calcularKPIRentabilidade(db, pf, fev, {})).toEqual(calcularKPIRentabilidade(db, pf, fev));
      expect(calcularTendencia(db, pf, fev, jan, explicito)).toEqual(calcularTendencia(db, pf, fev, jan));
      expect(calcularOcupacao(db, explicito)).toEqual(calcularOcupacao(db));
      expect(calcularBudgetVariance(db, pf, fev, explicito)).toEqual(calcularBudgetVariance(db, pf, fev));
      expect(gerarProjecaoCaixa(db, pf, fev, explicito)).toEqual(gerarProjecaoCaixa(db, pf, fev));
      for (const p of [jan, fev]) {
        expect(gerarDRE(db, pf, p, explicito)).toEqual(gerarDRE(db, pf, p));
        expect(gerarBalanco(db, pf, p, explicito)).toEqual(gerarBalanco(db, pf, p));
        expect(gerarFluxoCaixa(db, pf, p, explicito)).toEqual(gerarFluxoCaixa(db, pf, p));
        expect(gerarRelatorioIntegrado(db, pf, p, explicito)).toEqual(gerarRelatorioIntegrado(db, pf, p));
        expect(analiseRentabilidadePorCentro(db, pf, p, explicito)).toEqual(analiseRentabilidadePorCentro(db, pf, p));
      }
    });
  });

  describe("'liquido' exclui o par estornado+estornador", () => {
    beforeEach(cenarioCompleto);
    const liquido = { tratamentoEstorno: "liquido" as const };

    it("valores fixos do cenário", () => {
      expect(calcularKPIRentabilidade(db, pf, jan, liquido).receita_total).toBe(1000);
      expect(calcularKPIRentabilidade(db, pf, fev, liquido).receita_total).toBe(300);
      expect(gerarDRE(db, pf, jan, liquido).receitas.aluguel).toBe(1000);
      expect(gerarDRE(db, pf, fev, liquido).receitas.aluguel).toBe(300);
      const fluxoFev = gerarFluxoCaixa(db, pf, fev, liquido);
      expect(fluxoFev.operacional.entradas).toBe(300);
      expect(fluxoFev.operacional.saidas).toBe(0);
      expect(analiseRentabilidadePorCentro(db, pf, jan, liquido)[0].receita_total).toBe(1000);
      expect(calcularBudgetVariance(db, pf, jan, liquido).receitas_realizadas).toBeGreaterThanOrEqual(0);
    });

    it("bate com a view v_bi_resultado_mensal (centavos)", () => {
      const viewJan = resultadoMensal(db, { entidadeId: pf, grupo: "receita", competenciaDe: "2026-01", competenciaAte: "2026-01" });
      const viewFev = resultadoMensal(db, { entidadeId: pf, grupo: "receita", competenciaDe: "2026-02", competenciaAte: "2026-02" });
      const soma = (ls: { credito_centavos: number }[]) => ls.reduce((a, l) => a + l.credito_centavos, 0);
      expect(Math.round(calcularKPIRentabilidade(db, pf, jan, liquido).receita_total * 100)).toBe(soma(viewJan));
      expect(Math.round(calcularKPIRentabilidade(db, pf, fev, liquido).receita_total * 100)).toBe(soma(viewFev));
      const viewDesp = resultadoMensal(db, { entidadeId: pf, grupo: "despesa", competenciaAte: "2026-01" });
      expect(Math.round(calcularKPIRentabilidade(db, pf, jan, liquido).despesa_total * 100)).toBe(
        viewDesp.reduce((a, l) => a + l.debito_centavos, 0),
      );
    });

    it("os caminhos 'view' (sem asOf) e 'SQL direto' (com asOf futuro) do líquido coincidem", () => {
      const pelaView = compararBrutoLiquido(db, { entidadeId: pf });
      const peloSql = compararBrutoLiquido(db, { entidadeId: pf, asOf: "2099-12-31" });
      expect(peloSql).toEqual(pelaView);
    });
  });

  describe("compararBrutoLiquido", () => {
    beforeEach(cenarioCompleto);

    it("devolve bruto, líquido e diferença por mês/conta (centavos)", () => {
      const linhas = compararBrutoLiquido(db, { entidadeId: pf, grupo: "receita" });
      expect(linhas).toEqual([
        expect.objectContaining({
          competencia: "2026-01",
          conta_id: RECEITA,
          bruto_centavos: 140000,
          liquido_centavos: 100000,
          diferenca_centavos: 40000,
        }),
        expect.objectContaining({
          competencia: "2026-02",
          conta_id: RECEITA,
          bruto_centavos: -10000, // +300 de receita e −400 do reverso lançado em fevereiro
          liquido_centavos: 30000,
          diferenca_centavos: -40000,
        }),
      ]);
      const resumo = resumirDivergenciaEstornos(linhas);
      expect(resumo.temDivergencia).toBe(true);
      expect(resumo.diferencaTotalCentavos).toBe(0); // compensam entre meses...
      expect(resumo.diferencaAbsolutaCentavos).toBe(80000); // ...mas o desvio mensal é real
      expect(resumo.competenciasAfetadas).toEqual(["2026-01", "2026-02"]);
    });

    it("despesa sem estorno não diverge; filtro de competência recorta", () => {
      const desp = compararBrutoLiquido(db, { entidadeId: pf, grupo: "despesa" });
      expect(desp).toHaveLength(1);
      expect(desp[0].diferenca_centavos).toBe(0);
      expect(desp[0].bruto_centavos).toBe(-15000);
      const soFev = compararBrutoLiquido(db, { entidadeId: pf, de: "2026-02" });
      expect(soFev.every((l) => l.competencia === "2026-02")).toBe(true);
      expect(compararBrutoLiquido(db, { entidadeId: pf, ate: "2026-01", grupo: "receita" })).toHaveLength(1);
    });

    it("sem estornos não há divergência", async () => {
      const limpo = await criarBancoDeTeste();
      expect(resumirDivergenciaEstornos(compararBrutoLiquido(limpo))).toMatchObject({ temDivergencia: false });
    });
  });

  describe("período (de/ate) e asOf", () => {
    it("de/ate filtram por competência do período contábil", () => {
      cenarioCompleto();
      expect(calcularKPIRentabilidade(db, pf, jan, { de: "2026-02" }).receita_total).toBe(0);
      expect(calcularKPIRentabilidade(db, pf, jan, { de: "2026-01", ate: "2026-01" }).receita_total).toBe(1400);
      expect(calcularKPIRentabilidade(db, pf, fev, { ate: "2026-01" }).receita_total).toBe(0);
    });

    it("asOf reproduz o fechamento passado: BI em 31/01 == o que o BI mostrava naquela data", () => {
      // 1) Só janeiro existe: é o "fechamento" de janeiro, calculado pelo critério padrão.
      lancarJaneiro();
      const fechamento = {
        kpi: calcularKPIRentabilidade(db, pf, jan),
        dre: gerarDRE(db, pf, jan),
        fluxo: gerarFluxoCaixa(db, pf, jan),
        balanco: gerarBalanco(db, pf, jan),
        rent: analiseRentabilidadePorCentro(db, pf, jan),
      };
      const cmpFechamento = compararBrutoLiquido(db, { entidadeId: pf });

      // 2) Depois do fechamento: lançamento novo em fevereiro e o estorno cruzando meses.
      // Pernas (caixa, receita) da receita de 400, lançadas antes de qualquer estorno.
      const ids = db.exec("SELECT id FROM ledger_entries WHERE valor_credito = 400 OR valor_debito = 400 ORDER BY id");
      const r2: [number, number] = [ids[0].values[0][0] as number, ids[0].values[1][0] as number];
      receita(fev, 300, "2026-02-03", "2026-02-03 09:00:00");
      estornar(r2, fev, "2026-02-05", "2026-02-05 09:00:00", 400);

      // Hoje (sem asOf) o bruto de janeiro continua o mesmo (o estorno caiu em fevereiro)...
      expect(calcularKPIRentabilidade(db, pf, jan).receita_total).toBe(1400);
      // ...mas o líquido de hoje já difere do fechamento:
      expect(calcularKPIRentabilidade(db, pf, jan, { tratamentoEstorno: "liquido" }).receita_total).toBe(1000);

      // 3) asOf de 31/01 reconstitui exatamente o fechamento, nos dois critérios (sem estorno ainda).
      for (const t of ["bruto", "liquido"] as const) {
        const c = { tratamentoEstorno: t, asOf: "2026-01-31" };
        expect(calcularKPIRentabilidade(db, pf, jan, c)).toEqual(fechamento.kpi);
        expect(gerarDRE(db, pf, jan, c)).toEqual(fechamento.dre);
        expect(gerarFluxoCaixa(db, pf, jan, c)).toEqual(fechamento.fluxo);
        expect(gerarBalanco(db, pf, jan, c)).toEqual(fechamento.balanco);
        expect(analiseRentabilidadePorCentro(db, pf, jan, c)).toEqual(fechamento.rent);
      }
      expect(compararBrutoLiquido(db, { entidadeId: pf, asOf: "2026-01-31" })).toEqual(cmpFechamento);

      // 4) Entre o lançamento de fevereiro e o estorno (04/02): fevereiro já existe, o par ainda não está anulado.
      const meio = { tratamentoEstorno: "liquido" as const, asOf: "2026-02-04" };
      expect(calcularKPIRentabilidade(db, pf, jan, meio).receita_total).toBe(1400);
      expect(calcularKPIRentabilidade(db, pf, fev, meio).receita_total).toBe(300);

      // 5) A partir de 05/02 o líquido exclui o par.
      const depois = { tratamentoEstorno: "liquido" as const, asOf: "2026-02-05" };
      expect(calcularKPIRentabilidade(db, pf, jan, depois).receita_total).toBe(1000);
      expect(compararBrutoLiquido(db, { entidadeId: pf, asOf: "2026-02-04", grupo: "receita" }).every((l) => l.diferenca_centavos === 0)).toBe(true);
      expect(resumirDivergenciaEstornos(compararBrutoLiquido(db, { entidadeId: pf, asOf: "2026-02-05" })).temDivergencia).toBe(true);
    });

    it("asOf aceita data-hora e considera o dia inteiro quando só há data", () => {
      lancarJaneiro();
      expect(calcularKPIRentabilidade(db, pf, jan, { asOf: "2026-01-10" }).receita_total).toBe(1000);
      expect(calcularKPIRentabilidade(db, pf, jan, { asOf: "2026-01-09" }).receita_total).toBe(0);
      expect(calcularKPIRentabilidade(db, pf, jan, { asOf: "2026-01-12 08:59" }).receita_total).toBe(1000);
      expect(calcularKPIRentabilidade(db, pf, jan, { asOf: "2026-01-12T09:00:00" }).receita_total).toBe(1400);
    });
  });

  describe("somente leitura", () => {
    it("não grava nada: PRAGMA query_only não deixa nenhuma função falhar e nenhuma linha muda", () => {
      cenarioCompleto();
      const contagens = (): Record<string, number> => {
        const tabelas = db.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")[0]
          .values.map((v) => v[0] as string);
        return Object.fromEntries(tabelas.map((t) => [t, db.exec(`SELECT COUNT(*) FROM "${t}"`)[0].values[0][0] as number]));
      };
      const fotoRazao = () => JSON.stringify(db.exec("SELECT * FROM ledger_entries ORDER BY id"));

      const antesContagens = contagens();
      const antesRazao = fotoRazao();
      const antesChanges = db.exec("SELECT total_changes()")[0].values[0][0];

      db.run("PRAGMA query_only = ON"); // qualquer INSERT/UPDATE/DELETE a partir daqui lança erro
      try {
        for (const t of ["bruto", "liquido"] as const) {
          for (const extra of [{}, { asOf: "2026-02-04" }, { de: "2026-01", ate: "2026-02" }]) {
            const c = { tratamentoEstorno: t, ...extra };
            for (const p of [jan, fev]) {
              calcularKPIRentabilidade(db, pf, p, c);
              calcularBudgetVariance(db, pf, p, c);
              gerarProjecaoCaixa(db, pf, p, c);
              gerarRelatorioIntegrado(db, pf, p, c);
              analiseRentabilidadePorCentro(db, pf, p, c);
            }
            calcularOcupacao(db, c);
            compararBrutoLiquido(db, { entidadeId: pf, ...extra });
          }
        }
        // Prova de que o guard de fato bloqueia escrita (senão o teste acima não provaria nada).
        expect(() => db.run("UPDATE ledger_entries SET motivo_estorno = 'x'")).toThrow();
      } finally {
        db.run("PRAGMA query_only = OFF");
      }

      expect(contagens()).toEqual(antesContagens);
      expect(fotoRazao()).toBe(antesRazao);
      expect(db.exec("SELECT total_changes()")[0].values[0][0]).toBe(antesChanges);
    });

    it("resultadosDivergem compara por conteúdo", () => {
      expect(resultadosDivergem({ a: 1 }, { a: 1 })).toBe(false);
      expect(resultadosDivergem({ a: 1 }, { a: 2 })).toBe(true);
    });
  });
});
