/**
 * integracao-patrimonio.ts contra o schema real (criarBancoDeTeste()). Reconstrução do
 * balde B (docs/dominios-a-reconstruir.md, seção 5) — leia o comentário completo no topo
 * de integracao-patrimonio.ts antes de mexer neste arquivo: ele documenta por que só 2
 * das funções originais (aquisição financiada, depreciação) foram reconstruídas, e por
 * que as demais duplicariam migracao-ledger.ts ou dependem de tabelas que nunca
 * existiram no schema real.
 */
import { describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { consultar, executar } from "../../../db/connection";
import { criarEntidadeLegal } from "../entidadeLegal";
import {
  contabilizarAquisicaoImovelFinanciada,
  contabilizarDepreciacaoImovel,
  depreciarTodosImoveisElegiveis,
} from "../integracao-patrimonio";

const CONTA_IMOVEIS_ERP = 1205;
const CONTA_EMPRESTIMOS_LP_ERP = 3201;
const CONTA_DEPRECIACAO_ERP = 5301;

async function montarBase() {
  const db: Database = await criarBancoDeTeste();
  const { entidade_id } = criarEntidadeLegal(db, { nome: "Titular Teste", cpf_cnpj: "52998224725" });
  executar(db, "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2025, 1, 'aberto')", [
    entidade_id,
  ]);
  const periodo_id = consultar<{ id: number }>(db, "SELECT id FROM periodos_contabeis WHERE ano=2025 AND mes=1")[0].id;
  return { db, entidade_id: entidade_id!, periodo_id };
}

function criarImovel(
  db: Database,
  opcoes: { apelido?: string; valor_aquisicao?: number | null; uso_pessoal?: number } = {},
): number {
  executar(
    db,
    `INSERT INTO imoveis (apelido, tipo, uso_pessoal, financiado, valor_aquisicao)
     VALUES (?, 'kitnet', ?, 1, ?)`,
    [opcoes.apelido ?? "Kitnet Teste", opcoes.uso_pessoal ?? 0, opcoes.valor_aquisicao ?? null],
  );
  return consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id")[0].id;
}

function criarFinanciamento(db: Database, imovel_id: number, valor_contratado: number): number {
  executar(
    db,
    `INSERT INTO financiamentos (imovel_id, instituicao, sistema, valor_contratado, data_contrato, parcelas_total)
     VALUES (?, 'Banco Teste', 'PRICE', ?, '2025-01-01', 120)`,
    [imovel_id, valor_contratado],
  );
  return consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id")[0].id;
}

function saldoConta(db: Database, conta_id: number): { debito: number; credito: number } {
  const [r] = consultar<{ d: number; c: number }>(
    db,
    "SELECT COALESCE(SUM(valor_debito),0) d, COALESCE(SUM(valor_credito),0) c FROM ledger_entries WHERE conta_id = ?",
    [conta_id],
  );
  return { debito: r.d, credito: r.c };
}

describe("integracao-patrimonio: contabilizarAquisicaoImovelFinanciada", () => {
  it("lança Débito Imóveis / Crédito Empréstimos LP pelo valor contratado, balanceado", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const imovel_id = criarImovel(db, { valor_aquisicao: 200000 });
    criarFinanciamento(db, imovel_id, 150000);

    const ok = contabilizarAquisicaoImovelFinanciada(db, imovel_id, entidade_id, periodo_id);
    expect(ok).toBe(true);

    expect(saldoConta(db, CONTA_IMOVEIS_ERP).debito).toBeCloseTo(150000, 2);
    expect(saldoConta(db, CONTA_EMPRESTIMOS_LP_ERP).credito).toBeCloseTo(150000, 2);
  });

  it("é idempotente: chamar duas vezes para o mesmo imóvel/financiamento não duplica o lançamento", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const imovel_id = criarImovel(db, { valor_aquisicao: 200000 });
    criarFinanciamento(db, imovel_id, 150000);

    expect(contabilizarAquisicaoImovelFinanciada(db, imovel_id, entidade_id, periodo_id)).toBe(true);
    expect(contabilizarAquisicaoImovelFinanciada(db, imovel_id, entidade_id, periodo_id)).toBe(false);

    expect(saldoConta(db, CONTA_IMOVEIS_ERP).debito).toBeCloseTo(150000, 2); // não dobrou
  });

  it("imóvel sem financiamento cadastrado retorna false sem lançar nada", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const imovel_id = criarImovel(db, { valor_aquisicao: 200000 });

    expect(contabilizarAquisicaoImovelFinanciada(db, imovel_id, entidade_id, periodo_id)).toBe(false);
    expect(consultar(db, "SELECT id FROM ledger_entries")).toHaveLength(0);
  });

  it("imóvel inexistente retorna false sem lançar exceção", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    expect(contabilizarAquisicaoImovelFinanciada(db, 99999, entidade_id, periodo_id)).toBe(false);
  });
});

describe("integracao-patrimonio: contabilizarDepreciacaoImovel", () => {
  it("deprecia 1/12 da taxa anual sobre o valor de aquisição, Débito Depreciação / Crédito Imóveis", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    // 5% a.a. padrão sobre 120.000 = 6.000/ano = 500/mês
    const imovel_id = criarImovel(db, { valor_aquisicao: 120000 });

    const ok = contabilizarDepreciacaoImovel(db, imovel_id, entidade_id, periodo_id);
    expect(ok).toBe(true);

    expect(saldoConta(db, CONTA_DEPRECIACAO_ERP).debito).toBeCloseTo(500, 2);
    expect(saldoConta(db, CONTA_IMOVEIS_ERP).credito).toBeCloseTo(500, 2);
  });

  it("é idempotente por período: rodar duas vezes no MESMO período não duplica", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const imovel_id = criarImovel(db, { valor_aquisicao: 120000 });

    expect(contabilizarDepreciacaoImovel(db, imovel_id, entidade_id, periodo_id)).toBe(true);
    expect(contabilizarDepreciacaoImovel(db, imovel_id, entidade_id, periodo_id)).toBe(false);

    expect(saldoConta(db, CONTA_DEPRECIACAO_ERP).debito).toBeCloseTo(500, 2); // não dobrou
  });

  it("um SEGUNDO período deprecia de novo (não é bloqueado pela idempotência do 1º mês)", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const imovel_id = criarImovel(db, { valor_aquisicao: 120000 });
    executar(db, "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2025, 2, 'aberto')", [
      entidade_id,
    ]);
    const periodo2_id = consultar<{ id: number }>(db, "SELECT id FROM periodos_contabeis WHERE ano=2025 AND mes=2")[0].id;

    expect(contabilizarDepreciacaoImovel(db, imovel_id, entidade_id, periodo_id)).toBe(true);
    expect(contabilizarDepreciacaoImovel(db, imovel_id, entidade_id, periodo2_id)).toBe(true);

    expect(saldoConta(db, CONTA_DEPRECIACAO_ERP).debito).toBeCloseTo(1000, 2); // 2 meses
  });

  it("imóvel sem valor_aquisicao cadastrado retorna false sem lançar nada", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const imovel_id = criarImovel(db, { valor_aquisicao: null });

    expect(contabilizarDepreciacaoImovel(db, imovel_id, entidade_id, periodo_id)).toBe(false);
    expect(consultar(db, "SELECT id FROM ledger_entries")).toHaveLength(0);
  });

  it("taxa anual customizada é respeitada (ex.: 10% a.a. em vez do padrão 5%)", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const imovel_id = criarImovel(db, { valor_aquisicao: 120000 });

    contabilizarDepreciacaoImovel(db, imovel_id, entidade_id, periodo_id, 0.10);

    expect(saldoConta(db, CONTA_DEPRECIACAO_ERP).debito).toBeCloseTo(1000, 2); // 120000*0.10/12
  });
});

describe("integracao-patrimonio: depreciarTodosImoveisElegiveis", () => {
  it("deprecia todos os imóveis elegíveis (valor_aquisicao > 0, não uso pessoal) e ignora os demais", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    criarImovel(db, { apelido: "Elegível A", valor_aquisicao: 120000 });
    criarImovel(db, { apelido: "Elegível B", valor_aquisicao: 60000 });
    criarImovel(db, { apelido: "Uso pessoal", valor_aquisicao: 500000, uso_pessoal: 1 });
    criarImovel(db, { apelido: "Sem valor cadastrado", valor_aquisicao: null });

    const resultado = depreciarTodosImoveisElegiveis(db, entidade_id, periodo_id);

    expect(resultado.processados).toBe(2); // só as 2 elegíveis
    expect(resultado.depreciados).toBe(2);
    // 120000*5%/12=500 + 60000*5%/12=250
    expect(saldoConta(db, CONTA_DEPRECIACAO_ERP).debito).toBeCloseTo(750, 2);
  });

  it("nenhum imóvel elegível retorna {processados: 0, depreciados: 0} sem lançar nada", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    criarImovel(db, { apelido: "Uso pessoal", valor_aquisicao: 500000, uso_pessoal: 1 });

    const resultado = depreciarTodosImoveisElegiveis(db, entidade_id, periodo_id);
    expect(resultado).toEqual({ processados: 0, depreciados: 0 });
    expect(consultar(db, "SELECT id FROM ledger_entries")).toHaveLength(0);
  });
});
