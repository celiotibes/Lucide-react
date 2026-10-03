import { describe, it, expect, beforeEach } from "vitest";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { criarEntidadeLegal } from "../entidadeLegal";
import { registrarLancamentoContabil, estornarLancamento } from "../ledger";
import { CONTA_CAIXA_ERP } from "../mapeamentoPlanoApp";
import { atribuirTitularidade, atribuirPorRegra, historicoTitularidade, resumoPorTitular } from "../titularidade-economica";

const CONTA_RECEITA = 4101;

describe("Titularidade econômica (separação retroativa PF x empresa)", () => {
  let db: any;
  let pf: number;
  let pj: number;
  let periodo: number;
  let seq = 0;

  const lancar = (origem_modulo: string, data: string, valor: number, ref: string): number => {
    const origem_id = ++seq;
    registrarLancamentoContabil(db, { entidade_id: pf, periodo_id: periodo, conta_id: CONTA_CAIXA_ERP, data_lancamento: data, valor_debito: valor, descricao: ref, origem_modulo: origem_modulo as any, origem_id, referencia_documento: ref });
    return registrarLancamentoContabil(db, { entidade_id: pf, periodo_id: periodo, conta_id: CONTA_RECEITA, data_lancamento: data, valor_credito: valor, descricao: ref, origem_modulo: origem_modulo as any, origem_id, referencia_documento: ref });
  };
  const titularAtual = (id: number): number =>
    db.exec("SELECT titular_economico_id FROM v_ledger_titular_atual WHERE id = ?", [id])[0].values[0][0];

  beforeEach(async () => {
    db = await criarBancoDeTeste();
    pf = criarEntidadeLegal(db, { nome: "Célio PF", cpf_cnpj: "52998224725" }).entidade_id!;
    pj = criarEntidadeLegal(db, { nome: "Locadora PJ", cpf_cnpj: "11222333000181" }).entidade_id!;
    db.run("INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2026, 1, 'aberto')", [pf]);
    periodo = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
  });

  it("sem atribuição o titular é quem registrou; o razão original nunca é alterado", () => {
    const id = lancar("contratos", "2026-01-10", 1000, "A1");
    expect(titularAtual(id)).toBe(pf);
    atribuirTitularidade(db, { ledger_entry_id: id, titular_economico_id: pj, motivo: "Aluguel da operação de locação" });
    expect(titularAtual(id)).toBe(pj);
    const [le] = db.exec("SELECT entidade_id FROM ledger_entries WHERE id = ?", [id])[0].values;
    expect(le[0]).toBe(pf);
  });

  it("regra por módulo e intervalo leva só a operação de locação para a PJ e é idempotente", () => {
    const aluguel = lancar("contratos", "2026-01-10", 1000, "A1");
    const pessoal = lancar("contas-pessoais", "2026-01-11", 200, "P1");
    const foraDoCorte = lancar("contratos", "2025-12-30", 700, "A0");

    const regra = { entidade_origem_id: pf, titular_destino_id: pj, data_de: "2026-01-01", origens: ["contratos", "imovel-gestao"], motivo: "Corte de abertura do CNPJ", regra: "CORTE-PJ-2026-01" };
    const n1 = atribuirPorRegra(db, regra);
    expect(n1).toBe(2); // as duas pernas do aluguel
    expect(titularAtual(aluguel)).toBe(pj);
    expect(titularAtual(pessoal)).toBe(pf);
    expect(titularAtual(foraDoCorte)).toBe(pf);
    expect(atribuirPorRegra(db, regra)).toBe(0);
  });

  it("regra não desfaz atribuição manual feita para outra entidade", () => {
    const id = lancar("contratos", "2026-01-10", 1000, "A1");
    atribuirTitularidade(db, { ledger_entry_id: id, titular_economico_id: pj, motivo: "manual" });
    atribuirTitularidade(db, { ledger_entry_id: id, titular_economico_id: pf, motivo: "voltou" });
    expect(historicoTitularidade(db, id).map((h) => h.titular_economico_id)).toEqual([pj, pf]);
    expect(historicoTitularidade(db, id)[1].substitui_id).toBe(historicoTitularidade(db, id)[0].id);
  });

  it("estorno herda a titularidade e o saldo do titular zera", () => {
    const id = lancar("contratos", "2026-01-10", 1000, "A1");
    atribuirTitularidade(db, { ledger_entry_id: id, titular_economico_id: pj, motivo: "locação" });
    const reverso = estornarLancamento(db, id, "erro de lançamento", 1);
    expect(titularAtual(reverso)).toBe(pj);
    const pjResumo = resumoPorTitular(db).find((r) => r.titular_economico_id === pj)!;
    expect(pjResumo.total_credito).toBe(pjResumo.total_debito);
    expect(pjResumo.lancamentos).toBe(2);
  });

  it("exige motivo, entidade existente e é append-only", () => {
    const id = lancar("contratos", "2026-01-10", 1000, "A1");
    expect(() => atribuirTitularidade(db, { ledger_entry_id: id, titular_economico_id: pj, motivo: "" })).toThrow(/motivo/i);
    expect(() => atribuirTitularidade(db, { ledger_entry_id: id, titular_economico_id: 9999, motivo: "teste" })).toThrow(/não encontrada/);
    atribuirTitularidade(db, { ledger_entry_id: id, titular_economico_id: pj, motivo: "locação" });
    expect(() => db.run("UPDATE ledger_atribuicoes_titularidade SET titular_economico_id = 1")).toThrow(/append-only/);
    expect(() => db.run("DELETE FROM ledger_atribuicoes_titularidade")).toThrow(/append-only/);
  });
});
