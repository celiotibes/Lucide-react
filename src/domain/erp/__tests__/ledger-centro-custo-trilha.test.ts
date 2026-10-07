import type { Database } from "sql.js";
import { describe, it, expect, beforeEach } from "vitest";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { criarEntidadeLegal } from "../entidadeLegal";
import { CONTA_CAIXA_ERP } from "../mapeamentoPlanoApp";
import { registrarLancamentoContabil } from "../ledger";
import { alocarLancamentoACentro } from "../alocacao-centros-custo";

describe("Trilha de centro de custo no razão", () => {
  let db: Database;
  let lancamento_id: number;
  let centros: number[];

  beforeEach(async () => {
    db = await criarBancoDeTeste();
    const r = criarEntidadeLegal(db, { nome: "Titular de Teste", cpf_cnpj: "52998224725" });
    if (!r.entidade_id) throw new Error(`Fixture não criou a entidade: ${r.mensagem}`);
    const entidade_id = r.entidade_id;
    db.run("INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2026, 1, 'aberto')", [entidade_id]);
    const periodo_id = Number(db.exec("SELECT last_insert_rowid()")[0].values[0][0]);
    lancamento_id = registrarLancamentoContabil(db, {
      entidade_id,
      periodo_id,
      conta_id: CONTA_CAIXA_ERP,
      data_lancamento: "2026-01-15",
      valor_debito: 500,
      descricao: "Despesa rateável",
      origem_modulo: "manual",
      origem_id: 1,
      referencia_documento: "TEST-CC-001",
    });
    centros = [];
    for (const codigo of ["CC-A", "CC-B"]) {
      db.run("INSERT INTO centros_custo (entidade_id, codigo, descricao, tipo, ativo) VALUES (?, ?, ?, 'imovel', 1)", [entidade_id, codigo, codigo]);
      centros.push(Number(db.exec("SELECT last_insert_rowid()")[0].values[0][0]));
    }
  });

  const trilha = () =>
    db.exec(`SELECT centro_custo_anterior_id, centro_custo_novo_id FROM ledger_centro_custo_historico WHERE ledger_entry_id = ${lancamento_id} ORDER BY id`)[0]?.values ?? [];

  it("troca de centro por qualquer escritor gera linha de trilha (anterior -> novo)", () => {
    alocarLancamentoACentro(db, lancamento_id, centros[0]);
    alocarLancamentoACentro(db, lancamento_id, centros[1]);
    expect(trilha()).toEqual([
      [null, centros[0]],
      [centros[0], centros[1]],
    ]);
  });

  it("UPDATE que não muda o centro não gera trilha", () => {
    alocarLancamentoACentro(db, lancamento_id, centros[0]);
    alocarLancamentoACentro(db, lancamento_id, centros[0]);
    expect(trilha()).toHaveLength(1);
  });

  it("a trilha é append-only: UPDATE e DELETE são bloqueados", () => {
    alocarLancamentoACentro(db, lancamento_id, centros[0]);
    expect(() => db.run("UPDATE ledger_centro_custo_historico SET centro_custo_novo_id = 999")).toThrow(/append-only/);
    expect(() => db.run("DELETE FROM ledger_centro_custo_historico")).toThrow(/append-only/);
  });

  it("o valor contábil continua imutável mesmo com o centro editável", () => {
    expect(() => db.run("UPDATE ledger_entries SET valor_debito = 1 WHERE id = ?", [lancamento_id])).toThrow(/imutáveis|alterados/i);
  });
});
