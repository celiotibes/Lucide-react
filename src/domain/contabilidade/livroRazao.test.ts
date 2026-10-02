import { describe, expect, it, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { consultar, executar } from "../../db/connection";
import { gerarLancamentos, gerarBalancete, gerarRazaoDaConta } from "./livroRazao";

let db: Database;

beforeEach(async () => {
  db = await criarBancoDeTeste();
});

function criarContaBancaria(overrides: Partial<{ banco: string; numero: string }> = {}): number {
  const p = { banco: "Banco Teste", numero: "0001", ...overrides };
  executar(
    db,
    "INSERT INTO contas_bancarias (banco, numero, titular, tipo) VALUES (?, ?, 'Titular', 'corrente')",
    [p.banco, p.numero],
  );
  return consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id")[0].id;
}

function criarTransacao(
  contaId: number,
  data: string,
  valor: number,
  planoContaCodigo: string | null = null,
  descricao = "Transação de teste",
): number {
  executar(
    db,
    "INSERT INTO transacoes (conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (?, ?, ?, ?, ?)",
    [contaId, data, valor, descricao, planoContaCodigo],
  );
  return consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id")[0].id;
}

describe("livroRazao", () => {
  describe("gerarLancamentos", () => {
    it("entrada (valor positivo): débito no banco, crédito na contrapartida", () => {
      const contaId = criarContaBancaria();
      criarTransacao(contaId, "2025-01-10", 1500, "1.1.01", "Aluguel recebido");

      const lancamentos = gerarLancamentos(db, "2025-01-01", "2025-01-31");
      expect(lancamentos).toHaveLength(1);
      const [l] = lancamentos;
      expect(l.valor).toBe(1500);
      expect(l.contaDebito).toBe("Banco Banco Teste · 0001");
      expect(l.contaCredito).toMatch(/^1\.1\.01/);
      expect(l.historico).toBe("Aluguel recebido");
    });

    it("saída (valor negativo): crédito no banco, débito na contrapartida, valor em módulo", () => {
      const contaId = criarContaBancaria();
      criarTransacao(contaId, "2025-01-15", -300, "2.1.01", "Condomínio pago");

      const [l] = gerarLancamentos(db, "2025-01-01", "2025-01-31");
      expect(l.valor).toBe(300);
      expect(l.contaCredito).toBe("Banco Banco Teste · 0001");
      expect(l.contaDebito).toMatch(/^2\.1\.01/);
    });

    it("transação sem plano_conta_codigo vira 'Sem categoria (pendente)'", () => {
      const contaId = criarContaBancaria();
      criarTransacao(contaId, "2025-01-20", 100, null);

      const [l] = gerarLancamentos(db, "2025-01-01", "2025-01-31");
      expect(l.contaCredito).toBe("Sem categoria (pendente)");
    });

    it("filtra pelo período (BETWEEN inclusive) e ordena por data, depois id", () => {
      const contaId = criarContaBancaria();
      criarTransacao(contaId, "2024-12-31", 10, null, "fora do período, antes");
      const id1 = criarTransacao(contaId, "2025-01-01", 20, null, "início do período");
      const id2 = criarTransacao(contaId, "2025-01-31", 30, null, "fim do período");
      criarTransacao(contaId, "2025-02-01", 40, null, "fora do período, depois");

      const lancamentos = gerarLancamentos(db, "2025-01-01", "2025-01-31");
      expect(lancamentos.map((l) => l.transacaoId)).toEqual([id1, id2]);
    });

    it("período sem nenhuma transação retorna lista vazia", () => {
      expect(gerarLancamentos(db, "2025-01-01", "2025-01-31")).toEqual([]);
    });
  });

  describe("gerarBalancete", () => {
    it("soma débitos e créditos por conta e calcula o saldo (débito - crédito)", () => {
      const contaId = criarContaBancaria();
      criarTransacao(contaId, "2025-01-10", 1000, "1.1.01"); // débito banco, crédito 1.1.01
      criarTransacao(contaId, "2025-01-15", -400, "2.1.01"); // crédito banco, débito 2.1.01

      const lancamentos = gerarLancamentos(db, "2025-01-01", "2025-01-31");
      const balancete = gerarBalancete(lancamentos);

      const contaBanco = balancete.find((b) => b.conta === "Banco Banco Teste · 0001")!;
      expect(contaBanco.totalDebito).toBe(1000);
      expect(contaBanco.totalCredito).toBe(400);
      expect(contaBanco.saldo).toBe(600);

      const conta1101 = balancete.find((b) => b.conta.startsWith("1.1.01"))!;
      expect(conta1101.totalCredito).toBe(1000);
      expect(conta1101.totalDebito).toBe(0);
      expect(conta1101.saldo).toBe(-1000);

      const conta2101 = balancete.find((b) => b.conta.startsWith("2.1.01"))!;
      expect(conta2101.totalDebito).toBe(400);
      expect(conta2101.saldo).toBe(400);
    });

    it("ordena as linhas por nome de conta", () => {
      const contaId = criarContaBancaria();
      criarTransacao(contaId, "2025-01-10", 100, "2.1.01");
      criarTransacao(contaId, "2025-01-11", 100, "1.1.01");

      const balancete = gerarBalancete(gerarLancamentos(db, "2025-01-01", "2025-01-31"));
      const nomes = balancete.map((b) => b.conta);
      expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b)));
    });

    it("lista de lançamentos vazia retorna balancete vazio", () => {
      expect(gerarBalancete([])).toEqual([]);
    });
  });

  describe("gerarRazaoDaConta", () => {
    it("filtra só os lançamentos que tocam a conta pedida e acumula o saldo em ordem", () => {
      const contaId = criarContaBancaria();
      criarTransacao(contaId, "2025-01-05", 1000, "1.1.01"); // banco +1000 (débito)
      criarTransacao(contaId, "2025-01-10", -300, "2.1.01"); // banco -300 (crédito)
      criarTransacao(contaId, "2025-01-15", 200, "1.1.01"); // banco +200 (débito)

      const lancamentos = gerarLancamentos(db, "2025-01-01", "2025-01-31");
      const razaoBanco = gerarRazaoDaConta(lancamentos, "Banco Banco Teste · 0001");

      expect(razaoBanco).toHaveLength(3);
      expect(razaoBanco.map((l) => l.saldoAcumulado)).toEqual([1000, 700, 900]);
      expect(razaoBanco[0].debito).toBe(1000);
      expect(razaoBanco[0].credito).toBe(0);
      expect(razaoBanco[1].debito).toBe(0);
      expect(razaoBanco[1].credito).toBe(300);
    });

    it("conta que não aparece em nenhum lançamento retorna lista vazia", () => {
      const contaId = criarContaBancaria();
      criarTransacao(contaId, "2025-01-05", 1000, "1.1.01");
      const razao = gerarRazaoDaConta(gerarLancamentos(db, "2025-01-01", "2025-01-31"), "Conta Inexistente");
      expect(razao).toEqual([]);
    });
  });
});
