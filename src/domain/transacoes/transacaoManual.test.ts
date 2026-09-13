import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar, consultar } from "../../db/connection";
import { criarTransacaoManual, excluirTransacao, dividirTransacao } from "./transacaoManual";
import { listarHistoricoDoRegistro } from "../auditoria/logAlteracoes";

async function bancoBase() {
  const db = await criarBancoDeTeste();
  executar(db, "INSERT INTO contas_bancarias (id, banco, numero, titular, tipo) VALUES (1, 'Banco Teste', '000-0', 'Célio', 'corrente')");
  executar(db, "INSERT INTO imoveis (id, apelido, tipo) VALUES (1, 'Kitnet 1', 'kitnet')");
  return db;
}

describe("criarTransacaoManual", () => {
  it("insere a transação com os dados informados e registra no log de alterações", async () => {
    const db = await bancoBase();
    const id = criarTransacaoManual(db, {
      contaId: 1,
      data: "2026-03-10",
      valor: -150,
      descricaoOriginal: "Pagamento em dinheiro — reparo elétrico",
      planoContaCodigo: "2.1.04",
      imovelId: 1,
    });

    const [transacao] = consultar<{ valor: number; plano_conta_codigo: string; imovel_id: number; categorizado_por: string }>(
      db,
      "SELECT valor, plano_conta_codigo, imovel_id, categorizado_por FROM transacoes WHERE id = ?",
      [id],
    );
    expect(transacao.valor).toBe(-150);
    expect(transacao.plano_conta_codigo).toBe("2.1.04");
    expect(transacao.imovel_id).toBe(1);
    expect(transacao.categorizado_por).toBe("manual");

    const [log] = listarHistoricoDoRegistro(db, "transacoes", id);
    expect(log.operacao).toBe("criacao");
  });

  it("sem categoria informada, categorizado_por fica null (não força 'manual' sem categoria nenhuma)", async () => {
    const db = await bancoBase();
    const id = criarTransacaoManual(db, { contaId: 1, data: "2026-03-10", valor: -50, descricaoOriginal: "Lançamento avulso" });
    const [transacao] = consultar<{ categorizado_por: string | null }>(db, "SELECT categorizado_por FROM transacoes WHERE id = ?", [id]);
    expect(transacao.categorizado_por).toBeNull();
  });
});

describe("excluirTransacao", () => {
  it("apaga a transação e registra a exclusão no log", async () => {
    const db = await bancoBase();
    const id = criarTransacaoManual(db, { contaId: 1, data: "2026-03-10", valor: -50, descricaoOriginal: "Para excluir" });

    excluirTransacao(db, id);

    expect(consultar(db, "SELECT id FROM transacoes WHERE id = ?", [id])).toEqual([]);
    const [log] = listarHistoricoDoRegistro(db, "transacoes", id);
    expect(log.operacao).toBe("exclusao");
    expect(log.resumo).toContain("Para excluir");
  });

  it("limpa rateio e vínculo de documento antes de apagar (senão FOREIGN KEY quebraria o DELETE)", async () => {
    const db = await bancoBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, fracao_ideal) VALUES (2, 'Kitnet 2', 'kitnet', 0.5)");
    executar(db, "UPDATE imoveis SET fracao_ideal = 0.5 WHERE id = 1");
    const id = criarTransacaoManual(db, { contaId: 1, data: "2026-03-10", valor: -200, descricaoOriginal: "Despesa coletiva" });
    executar(db, "INSERT INTO rateios (transacao_id, imovel_id, criterio, percentual, valor_rateado) VALUES (?, 1, 'fracao_ideal', 0.5, -100)", [id]);
    executar(db, "INSERT INTO rateios (transacao_id, imovel_id, criterio, percentual, valor_rateado) VALUES (?, 2, 'fracao_ideal', 0.5, -100)", [id]);
    executar(db, "INSERT INTO documentos (id, tipo, arquivo_nome, criado_em) VALUES (1, 'recibo', 'r.pdf', '2026-01-01')");
    executar(db, "INSERT INTO documento_transacoes (documento_id, transacao_id, score, status) VALUES (1, ?, 1, 'confirmado')", [id]);

    expect(() => excluirTransacao(db, id)).not.toThrow();
    expect(consultar(db, "SELECT id FROM rateios WHERE transacao_id = ?", [id])).toEqual([]);
    expect(consultar(db, "SELECT id FROM documento_transacoes WHERE transacao_id = ?", [id])).toEqual([]);
  });

  it("transação inexistente lança erro claro, em vez de silenciosamente não fazer nada", async () => {
    const db = await bancoBase();
    expect(() => excluirTransacao(db, 999)).toThrow(/999/);
  });
});

describe("dividirTransacao", () => {
  it("substitui a transação original por N transações novas cuja soma bate com o valor original", async () => {
    const db = await bancoBase();
    const idOriginal = criarTransacaoManual(db, {
      contaId: 1,
      data: "2026-03-10",
      valor: 1600,
      descricaoOriginal: "PIX RECEBIDO INQUILINO",
    });

    const novosIds = dividirTransacao(db, idOriginal, [
      { valor: 1500, planoContaCodigo: "1.1.01", imovelId: 1, descricaoComplemento: "aluguel" },
      { valor: 100, planoContaCodigo: "1.1.02", imovelId: 1, descricaoComplemento: "reembolso água" },
    ]);

    expect(novosIds).toHaveLength(2);
    // A transação original (valor cheio de 1600, sem categoria) não sobrevive à divisão —
    // só restam as 2 partes. Não se pode comparar por id: SQLite reaproveita o rowid da
    // linha excluída na próxima inserção (mesmo comportamento já aceito em aplicarRateio,
    // que também apaga e reinsere), então o id original pode reaparecer numa das partes
    // novas — o que importa é que a linha ORIGINAL (valor 1600 inteiro, sem plano_conta)
    // não existe mais, não o número do id em si.
    const totalTransacoes = consultar<{ total: number }>(db, "SELECT COUNT(*) AS total FROM transacoes")[0].total;
    expect(totalTransacoes).toBe(2);
    const linhaComValorCheio = consultar(db, "SELECT id FROM transacoes WHERE valor = 1600");
    expect(linhaComValorCheio).toEqual([]);

    const linhas = consultar<{ valor: number; plano_conta_codigo: string; descricao_original: string }>(
      db,
      `SELECT valor, plano_conta_codigo, descricao_original FROM transacoes WHERE id IN (${novosIds.map(() => "?").join(",")})`,
      novosIds,
    );
    const soma = linhas.reduce((acc, l) => acc + l.valor, 0);
    expect(soma).toBeCloseTo(1600, 6); // reconciliação com o valor original preservada
    expect(linhas.find((l) => l.plano_conta_codigo === "1.1.01")?.valor).toBe(1500);
    expect(linhas.find((l) => l.plano_conta_codigo === "1.1.02")?.valor).toBe(100);
    expect(linhas.every((l) => l.descricao_original.includes("PIX RECEBIDO INQUILINO"))).toBe(true);
  });

  it("recusa dividir quando a soma das partes não bate com o valor original (nunca perde nem cria dinheiro)", async () => {
    const db = await bancoBase();
    const id = criarTransacaoManual(db, { contaId: 1, data: "2026-03-10", valor: 1000, descricaoOriginal: "PIX" });

    expect(() =>
      dividirTransacao(db, id, [
        { valor: 500, planoContaCodigo: "1.1.01" },
        { valor: 400, planoContaCodigo: "1.1.02" }, // soma 900, não 1000
      ]),
    ).toThrow(/não bate/);

    // A transação original continua intacta — a validação falhou ANTES de excluir nada.
    expect(consultar(db, "SELECT id FROM transacoes WHERE id = ?", [id])).toHaveLength(1);
  });

  it("recusa dividir em menos de 2 partes", async () => {
    const db = await bancoBase();
    const id = criarTransacaoManual(db, { contaId: 1, data: "2026-03-10", valor: 1000, descricaoOriginal: "PIX" });
    expect(() => dividirTransacao(db, id, [{ valor: 1000, planoContaCodigo: "1.1.01" }])).toThrow(/pelo menos 2 partes/);
  });

  it("aceita diferença de até 1 centavo na soma (tolerância de arredondamento)", async () => {
    const db = await bancoBase();
    const id = criarTransacaoManual(db, { contaId: 1, data: "2026-03-10", valor: 100, descricaoOriginal: "PIX" });
    expect(() =>
      dividirTransacao(db, id, [
        { valor: 33.34, planoContaCodigo: "1.1.01" },
        { valor: 66.665, planoContaCodigo: "1.1.02" }, // soma 100.005, dentro de 1 centavo
      ]),
    ).not.toThrow();
  });

  it("transação inexistente lança erro claro", async () => {
    const db = await bancoBase();
    expect(() =>
      dividirTransacao(db, 999, [
        { valor: 50, planoContaCodigo: "1.1.01" },
        { valor: 50, planoContaCodigo: "1.1.02" },
      ]),
    ).toThrow(/999/);
  });
});
