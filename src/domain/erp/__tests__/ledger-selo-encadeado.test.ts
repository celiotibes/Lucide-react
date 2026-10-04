import { describe, it, expect, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { criarEntidadeLegal } from "../entidadeLegal";
import { registrarLancamentoContabil, encerrarPeriodo, verificarSelosLedger } from "../ledger";
import { CONTA_CAIXA_ERP } from "../mapeamentoPlanoApp";

const CONTA_RECEITA = 4101;

describe("Selo encadeado dos encerramentos", () => {
  let db: Database;
  let entidade_id: number;

  const abrirPeriodo = (ano: number, mes: number): number => {
    // encerrarPeriodo já abre o período seguinte (criarSaldosProximoPeriodo): reaproveita se existir.
    db.run("INSERT OR IGNORE INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, ?, ?, 'aberto')", [entidade_id, ano, mes]);
    return db.exec("SELECT id FROM periodos_contabeis WHERE entidade_id = ? AND ano = ? AND mes = ?", [entidade_id, ano, mes])[0].values[0][0];
  };
  const receita = (periodo_id: number, data: string, valor: number, ref: string) => {
    registrarLancamentoContabil(db, { entidade_id, periodo_id, conta_id: CONTA_CAIXA_ERP, data_lancamento: data, valor_debito: valor, descricao: "Recebimento", origem_modulo: "manual", origem_id: 1, referencia_documento: ref });
    registrarLancamentoContabil(db, { entidade_id, periodo_id, conta_id: CONTA_RECEITA, data_lancamento: data, valor_credito: valor, descricao: "Recebimento", origem_modulo: "manual", origem_id: 1, referencia_documento: ref });
  };
  const encerramentos = () =>
    db.exec("SELECT hash_anterior, hash_selo, hash_lancamentos FROM ledger_encerramentos ORDER BY id")[0].values as string[][];

  beforeEach(async () => {
    db = await criarBancoDeTeste();
    const r = criarEntidadeLegal(db, { nome: "Titular", cpf_cnpj: "52998224725" });
    entidade_id = r.entidade_id!;
  });

  it("grava selo, encadeia o segundo período no primeiro e a verificação passa", async () => {
    const p1 = abrirPeriodo(2026, 1);
    receita(p1, "2026-01-10", 1000, "T1");
    await encerrarPeriodo(db, p1, 1, "fechamento jan");
    const p2 = abrirPeriodo(2026, 2);
    receita(p2, "2026-02-10", 500, "T2");
    await encerrarPeriodo(db, p2, 1, "fechamento fev");

    const [a, b] = encerramentos();
    expect(a[0]).toBe("GENESIS");
    expect(a[1]).toMatch(/^[0-9a-f]{64}$/);
    expect(b[0]).toBe(a[1]);
    expect(b[1]).not.toBe(a[1]);

    const v = await verificarSelosLedger(db, entidade_id);
    expect(v.integro).toBe(true);
    expect(v.periodos.every((p) => p.ok)).toBe(true);
  });

  it("detecta adulteração de lançamento de período passado (mesmo burlando os triggers)", async () => {
    const p1 = abrirPeriodo(2026, 1);
    receita(p1, "2026-01-10", 1000, "T1");
    await encerrarPeriodo(db, p1, 1, "jan");

    db.run("DROP TRIGGER tg_ledger_entries_no_update_dados"); // atacante com acesso ao arquivo do banco
    db.run("UPDATE ledger_entries SET valor_debito = 9999 WHERE periodo_id = ? AND valor_debito IS NOT NULL", [p1]);

    const v = await verificarSelosLedger(db, entidade_id);
    expect(v.integro).toBe(false);
    expect(v.periodos[0].ok).toBe(false);
    expect(v.periodos[0].motivo).toMatch(/lançamentos do período diferem/);
  });

  it("estorno de lançamento de período fechado (atualiza só estornado_por_id) não quebra o selo", async () => {
    const p1 = abrirPeriodo(2026, 1);
    receita(p1, "2026-01-10", 1000, "T1");
    await encerrarPeriodo(db, p1, 1, "jan");
    db.run("UPDATE ledger_entries SET auditada = 1 WHERE periodo_id = ?", [p1]);
    expect((await verificarSelosLedger(db, entidade_id)).integro).toBe(true);
  });

  it("período fechado não reabre, não é excluído e o encerramento é append-only", async () => {
    const p1 = abrirPeriodo(2026, 1);
    receita(p1, "2026-01-10", 1000, "T1");
    await encerrarPeriodo(db, p1, 1, "jan");

    expect(() => db.run("UPDATE periodos_contabeis SET status = 'aberto' WHERE id = ?", [p1])).toThrow(/irreversível/);
    expect(() => db.run("DELETE FROM periodos_contabeis WHERE id = ?", [p1])).toThrow(/não pode ser excluído/);
    expect(() => db.run("UPDATE ledger_encerramentos SET hash_selo = 'x'")).toThrow(/append-only/);
    expect(() => db.run("DELETE FROM ledger_encerramentos")).toThrow(/append-only/);
  });
});
