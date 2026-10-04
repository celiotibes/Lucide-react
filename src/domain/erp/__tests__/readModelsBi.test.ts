import { describe, it, expect, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { criarEntidadeLegal } from "../entidadeLegal";
import { registrarLancamentoContabil, estornarLancamento } from "../ledger";
import { CONTA_CAIXA_ERP } from "../mapeamentoPlanoApp";
import { atribuirTitularidade } from "../titularidade-economica";
import { criarCentroCustoImovel, analiseRentabilidadePorCentro } from "../alocacao-centros-custo";
import {
  resultadoMensal,
  saldoPorConta,
  resultadoPorCentroCusto,
  centavosParaReais,
  emReais,
} from "../readModelsBi";

const RECEITA = 4101;
const DESPESA = 6301;

describe("Read-models BI (v_bi_*)", () => {
  let db: Database;
  let pf: number;
  let pj: number;
  let jan: number;
  let fev: number;
  let seq = 0;

  const periodo = (mes: number): number => {
    db.run("INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2026, ?, 'aberto')", [pf, mes]);
    return db.exec("SELECT last_insert_rowid()")[0].values[0][0] as number;
  };

  /** Partida dobrada: caixa x (receita|despesa). Devolve [id da perna de caixa, id da perna de resultado]. */
  const lancar = (
    tipo: "receita" | "despesa",
    periodo_id: number,
    data: string,
    valor: number,
    centro?: number,
  ): [number, number] => {
    const origem_id = ++seq;
    const base = {
      entidade_id: pf,
      periodo_id,
      data_lancamento: data,
      descricao: `L${origem_id}`,
      origem_modulo: "contratos" as const,
      origem_id,
      referencia_documento: `L${origem_id}`,
      centro_custo_id: centro,
    };
    if (tipo === "receita") {
      const a = registrarLancamentoContabil(db, { ...base, conta_id: CONTA_CAIXA_ERP, valor_debito: valor });
      const b = registrarLancamentoContabil(db, { ...base, conta_id: RECEITA, valor_credito: valor });
      return [a, b];
    }
    const a = registrarLancamentoContabil(db, { ...base, conta_id: DESPESA, valor_debito: valor });
    const b = registrarLancamentoContabil(db, { ...base, conta_id: CONTA_CAIXA_ERP, valor_credito: valor });
    return [b, a];
  };

  beforeEach(async () => {
    seq = 0;
    db = await criarBancoDeTeste();
    pf = criarEntidadeLegal(db, { nome: "Célio PF", cpf_cnpj: "52998224725" }).entidade_id!;
    pj = criarEntidadeLegal(db, { nome: "Locadora PJ", cpf_cnpj: "11222333000181" }).entidade_id!;
    jan = periodo(1);
    fev = periodo(2);
  });

  it("bate com a soma manual em centavos inteiros, sem resíduo de ponto flutuante", () => {
    // 0,10 + 0,20 em float dá 0,30000000000000004: o read-model tem de dar 30 centavos exatos.
    lancar("receita", jan, "2026-01-05", 0.1);
    lancar("receita", jan, "2026-01-06", 0.2);
    lancar("receita", jan, "2026-01-07", 1234.56);
    lancar("despesa", jan, "2026-01-08", 200.01);
    lancar("receita", fev, "2026-02-01", 999.99);

    const linhas = resultadoMensal(db, { entidadeId: pf });
    const rec = linhas.filter((l) => l.grupo === "receita" && l.competencia === "2026-01");
    const desp = linhas.filter((l) => l.grupo === "despesa" && l.competencia === "2026-01");
    expect(rec).toHaveLength(1);
    expect(rec[0].credito_centavos).toBe(10 + 20 + 123456);
    expect(rec[0].resultado_centavos).toBe(123486);
    expect(rec[0].qtd_lancamentos).toBe(3);
    expect(desp[0].debito_centavos).toBe(20001);
    expect(desp[0].resultado_centavos).toBe(-20001);
    expect(Number.isInteger(rec[0].credito_centavos)).toBe(true);

    expect(linhas.find((l) => l.competencia === "2026-02")!.resultado_centavos).toBe(99999);

    // Filtros de período e grupo
    expect(resultadoMensal(db, { competenciaDe: "2026-02" }).every((l) => l.competencia === "2026-02")).toBe(true);
    expect(resultadoMensal(db, { competenciaAte: "2026-01" }).every((l) => l.competencia === "2026-01")).toBe(true);
    expect(resultadoMensal(db, { grupo: "despesa" })).toHaveLength(1);
  });

  it("saldo por conta segue a natureza e fecha com a partida dobrada", () => {
    lancar("receita", jan, "2026-01-05", 1000);
    lancar("despesa", jan, "2026-01-06", 250.5);

    const saldos = saldoPorConta(db, { entidadeId: pf });
    const caixa = saldos.find((s) => s.conta_id === CONTA_CAIXA_ERP)!;
    const receita = saldos.find((s) => s.conta_id === RECEITA)!;
    const despesa = saldos.find((s) => s.conta_id === DESPESA)!;
    expect(caixa.saldo_centavos).toBe(100000 - 25050);
    expect(receita.saldo_centavos).toBe(100000); // conta credora: crédito - débito
    expect(despesa.saldo_centavos).toBe(25050);
    expect(saldos.reduce((a, s) => a + s.debito_centavos, 0)).toBe(saldos.reduce((a, s) => a + s.credito_centavos, 0));
    expect(saldoPorConta(db, { entidadeId: pf, grupo: "receita" })).toHaveLength(1);
    expect(saldoPorConta(db, { contaId: DESPESA })).toHaveLength(1);
  });

  it("estorno neutraliza: par original+reverso some das views; só o lançamento vivo permanece", () => {
    const [cx1, rec1] = lancar("receita", jan, "2026-01-05", 700);
    lancar("receita", jan, "2026-01-06", 300);
    estornarLancamento(db, cx1, "erro de digitação", 1);
    estornarLancamento(db, rec1, "erro de digitação", 1);

    const [rec] = resultadoMensal(db, { grupo: "receita" });
    expect(rec.credito_centavos).toBe(30000);
    expect(rec.debito_centavos).toBe(0);
    expect(rec.qtd_lancamentos).toBe(1);
    expect(saldoPorConta(db, { contaId: CONTA_CAIXA_ERP })[0].saldo_centavos).toBe(30000);

    // O razão cru continua com tudo (o BI só filtra, não apaga): 4 pernas originais + 2 reversos.
    expect(db.exec("SELECT COUNT(*) FROM ledger_entries")[0].values[0][0]).toBe(6);

    // Estornar um segundo lançamento inteiro não altera o que sobrou.
    const [cx2, rec2] = lancar("receita", jan, "2026-01-09", 50);
    estornarLancamento(db, cx2, "x", 1);
    estornarLancamento(db, rec2, "x", 1);
    expect(resultadoMensal(db, { grupo: "receita" })[0].credito_centavos).toBe(30000);
  });

  it("estorno em OUTRO mês: o BI mostra o efetivo (par some); a soma crua do razão difere mês a mês (divergência documentada)", () => {
    const [, rec1] = lancar("receita", jan, "2026-01-05", 700);
    // Reverso lançado em fevereiro (o que acontece quando janeiro já está fechado).
    db.run(
      `INSERT INTO ledger_entries (entidade_id, periodo_id, conta_id, data_lancamento, valor_debito,
         descricao, origem_modulo, origem_id, referencia_documento, estorno_de_id)
       VALUES (?, ?, ?, '2026-02-02', 700, 'estorno', 'contratos', 1, 'L1', ?)`,
      [pf, fev, RECEITA, rec1],
    );
    const reverso = db.exec("SELECT last_insert_rowid()")[0].values[0][0] as number;
    db.run("UPDATE ledger_entries SET estornado_por_id = ? WHERE id = ?", [reverso, rec1]);

    expect(resultadoMensal(db, { grupo: "receita" })).toHaveLength(0);
    const cru = db.exec(
      `SELECT p.mes, SUM(COALESCE(le.valor_credito,0)) - SUM(COALESCE(le.valor_debito,0))
       FROM ledger_entries le JOIN periodos_contabeis p ON p.id = le.periodo_id
       WHERE le.conta_id = ${RECEITA} GROUP BY p.mes ORDER BY p.mes`,
    )[0].values;
    expect(cru).toEqual([[1, 700], [2, -700]]);
  });

  it("titularidade é respeitada: o overlay move o lançamento de titular sem tocar o razão", () => {
    const [cx, rec] = lancar("receita", jan, "2026-01-05", 1000);
    lancar("receita", jan, "2026-01-06", 400);

    expect(resultadoMensal(db, { titularId: pf })[0].credito_centavos).toBe(140000);
    expect(resultadoMensal(db, { titularId: pj })).toHaveLength(0);

    atribuirTitularidade(db, { ledger_entry_id: rec, titular_economico_id: pj, motivo: "Aluguel da operação de locação" });
    atribuirTitularidade(db, { ledger_entry_id: cx, titular_economico_id: pj, motivo: "Aluguel da operação de locação" });

    expect(resultadoMensal(db, { titularId: pf })[0].credito_centavos).toBe(40000);
    expect(resultadoMensal(db, { titularId: pj })[0].credito_centavos).toBe(100000);
    expect(saldoPorConta(db, { titularId: pj, contaId: CONTA_CAIXA_ERP })[0].saldo_centavos).toBe(100000);
    // Quem registrou continua sendo a PF.
    expect(resultadoMensal(db, { entidadeId: pf }).reduce((a, l) => a + l.credito_centavos, 0)).toBe(140000);
    const soma = [pf, pj].reduce(
      (a, t) => a + resultadoMensal(db, { titularId: t }).reduce((x, l) => x + l.credito_centavos, 0),
      0,
    );
    expect(soma).toBe(140000);
  });

  it("resultado por centro de custo/imóvel (convenção IM-####) e lançamento sem centro", () => {
    const cc7 = criarCentroCustoImovel(db, pf, 7, "Kitnet 7");
    const cc9 = criarCentroCustoImovel(db, pf, 9, "Kitnet 9");
    lancar("receita", jan, "2026-01-05", 1000, cc7);
    lancar("despesa", jan, "2026-01-06", 150.25, cc7);
    lancar("receita", jan, "2026-01-07", 800, cc9);
    lancar("despesa", jan, "2026-01-08", 10, undefined);

    const linhas = resultadoPorCentroCusto(db, { entidadeId: pf });
    const l7 = linhas.find((l) => l.centro_custo_id === cc7)!;
    expect(l7.imovel_id).toBe(7);
    expect(l7.receita_centavos).toBe(100000);
    expect(l7.despesa_centavos).toBe(15025);
    expect(l7.resultado_centavos).toBe(84975);
    expect(linhas.find((l) => l.centro_custo_id === null)!.resultado_centavos).toBe(-1000);
    expect(resultadoPorCentroCusto(db, { imovelId: 9 })[0].resultado_centavos).toBe(80000);
    expect(resultadoMensal(db, { centroCustoId: cc7 })).toHaveLength(2);
  });

  it("zeragem de encerramento não zera o resultado do BI, mas o saldo patrimonial a considera", () => {
    lancar("receita", jan, "2026-01-05", 500);
    // Mesmo formato de fecharContasDeResultado: origem 'manual', ref 'ENCERRAMENTO-<periodo>'.
    registrarLancamentoContabil(db, {
      entidade_id: pf,
      periodo_id: jan,
      conta_id: RECEITA,
      data_lancamento: "2026-01-31",
      valor_debito: 500,
      descricao: "zeragem",
      origem_modulo: "manual",
      origem_id: jan,
      referencia_documento: `ENCERRAMENTO-${jan}`,
    });
    expect(resultadoMensal(db, { grupo: "receita" })[0].resultado_centavos).toBe(50000);
    expect(saldoPorConta(db, { contaId: RECEITA })[0].saldo_centavos).toBe(0);
  });

  it("emReais/centavosParaReais só na borda de apresentação", () => {
    lancar("receita", jan, "2026-01-05", 1234.56);
    const [linha] = resultadoMensal(db, { grupo: "receita" });
    expect(centavosParaReais(linha.credito_centavos)).toBe(1234.56);
    const ap = emReais(linha);
    expect(ap.credito_reais).toBe(1234.56);
    expect(ap.resultado_reais).toBe(1234.56);
    expect("credito_centavos" in ap).toBe(false);
  });

  it("paridade com analiseRentabilidadePorCentro SEM estorno; COM estorno o cálculo antigo diverge", () => {
    const cc = criarCentroCustoImovel(db, pf, 3, "Kitnet 3");
    lancar("receita", jan, "2026-01-05", 1000, cc);
    lancar("despesa", jan, "2026-01-06", 120.1, cc);
    const antigo = () => analiseRentabilidadePorCentro(db, pf, jan)[0];
    const novo = () => resultadoPorCentroCusto(db, { entidadeId: pf, centroCustoId: cc })[0];

    expect(novo().receita_centavos / 100).toBe(antigo().receita_total);
    expect(novo().despesa_centavos / 100).toBe(antigo().despesa_total);
    expect(novo().resultado_centavos / 100).toBe(antigo().resultado_liquido);

    // Com estorno da receita: o antigo soma só créditos e ignora o reverso (débito) e superestima.
    const [cx, rec] = lancar("receita", jan, "2026-01-09", 400, cc);
    estornarLancamento(db, cx, "erro", 1);
    estornarLancamento(db, rec, "erro", 1);
    expect(novo().receita_centavos).toBe(100000);
    expect(antigo().receita_total).toBe(1400); // divergência conhecida (docs/BI-READ-MODELS.md)
  });
});
