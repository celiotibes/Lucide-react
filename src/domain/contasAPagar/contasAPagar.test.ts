import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { consultar, executar } from "../../db/connection";
import { criarEntidadeLegal } from "../erp/entidadeLegal";
import { CONTA_CAIXA_ERP, MAPA_APP_PARA_ERP } from "../erp/mapeamentoPlanoApp";
import { inserirDocumento } from "../documentos/documentos";
import {
  registrarContaAPagar,
  baixarContaAPagar,
  cancelarContaAPagar,
  listarContasAPagar,
  gerarRelatorioAging,
  obterContaAPagar,
} from "./contasAPagar";

const CPF_TESTE = "52998224725";

let db: Database;
let entidade_id: number;

async function prepararBanco() {
  db = await criarBancoDeTeste();
  executar(
    db,
    "INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo) VALUES (1, 'Banco 1', '0001', '11111', 'Titular', 'corrente')",
  );
  executar(
    db,
    "INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo) VALUES (2, 'Banco 2', '0002', '22222', 'Titular', 'corrente')",
  );
  const r = criarEntidadeLegal(db, { nome: "Titular de Teste", cpf_cnpj: CPF_TESTE });
  if (!r.entidade_id) throw new Error(`Fixture não conseguiu criar a entidade: ${r.mensagem}`);
  entidade_id = r.entidade_id;
}

function saldoBancario(conta_id: number): number {
  const [r] = consultar<{ total: number | null }>(db, "SELECT SUM(valor) AS total FROM transacoes WHERE conta_id = ?", [
    conta_id,
  ]);
  return r?.total ?? 0;
}

function saldoLedgerConta(conta_id: number): { debito: number; credito: number } {
  const [r] = consultar<{ d: number | null; c: number | null }>(
    db,
    "SELECT SUM(valor_debito) AS d, SUM(valor_credito) AS c FROM ledger_entries WHERE conta_id = ?",
    [conta_id],
  );
  return { debito: r?.d ?? 0, credito: r?.c ?? 0 };
}

/** Soma/subtrai dias de uma data fixa "AAAA-MM-DD" — nunca usa `new Date()` sem argumento,
 * para os testes de aging ficarem determinísticos e nunca dependerem do dia real. */
function deslocarData(dataBase: string, dias: number): string {
  const d = new Date(`${dataBase}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

describe("contasAPagar", () => {
  beforeEach(async () => {
    await prepararBanco();
  });

  describe("registrarContaAPagar", () => {
    it("herda valor, fornecedor, CNPJ/CPF e plano_conta_codigo de um documento existente quando não informados", () => {
      const documento_id = inserirDocumento(db, {
        tipo: "boleto",
        arquivo_nome: "boleto-condominio.pdf",
        valor: 480.5,
        data_documento: "2024-03-01",
        cnpj_cpf_contraparte: "12345678000199",
        nome_contraparte: "Condomínio Edifício Aurora",
        plano_conta_codigo: "2.1.01",
      });

      const resultado = registrarContaAPagar(db, {
        entidade_id,
        documento_id,
        data_vencimento: "2024-03-10",
      });

      expect(resultado.sucesso).toBe(true);
      expect(resultado.id).toBeTruthy();

      const conta = obterContaAPagar(db, resultado.id!, "2024-03-10");
      expect(conta).not.toBeNull();
      expect(conta!.fornecedor_nome).toBe("Condomínio Edifício Aurora");
      expect(conta!.fornecedor_cnpj_cpf).toBe("12345678000199");
      expect(conta!.valor).toBeCloseTo(480.5, 2);
      expect(conta!.plano_conta_codigo).toBe("2.1.01");
      expect(conta!.documento_id).toBe(documento_id);
    });

    it("não sobrescreve campos informados explicitamente, mesmo com documento vinculado", () => {
      const documento_id = inserirDocumento(db, {
        tipo: "boleto",
        arquivo_nome: "boleto.pdf",
        valor: 100,
        nome_contraparte: "Fornecedor do Documento",
        plano_conta_codigo: "2.1.01",
      });

      const resultado = registrarContaAPagar(db, {
        entidade_id,
        documento_id,
        fornecedor_nome: "Fornecedor Informado à Mão",
        valor: 999,
        data_vencimento: "2024-03-10",
      });

      const conta = obterContaAPagar(db, resultado.id!, "2024-03-10");
      expect(conta!.fornecedor_nome).toBe("Fornecedor Informado à Mão");
      expect(conta!.valor).toBeCloseTo(999, 2);
    });

    it("recusa sem fornecedor identificável", () => {
      const resultado = registrarContaAPagar(db, { entidade_id, valor: 100, data_vencimento: "2024-03-10" });
      expect(resultado.sucesso).toBe(false);
    });

    it("recusa sem valor positivo", () => {
      const resultado = registrarContaAPagar(db, {
        entidade_id,
        fornecedor_nome: "Fornecedor X",
        data_vencimento: "2024-03-10",
      });
      expect(resultado.sucesso).toBe(false);
    });

    it("funciona sem imovel_id nem documento_id — nem toda despesa é ligada a um imóvel", () => {
      const resultado = registrarContaAPagar(db, {
        entidade_id,
        fornecedor_nome: "Escritório de Advocacia",
        valor: 1200,
        data_vencimento: "2024-04-05",
        plano_conta_codigo: "2.1.11",
      });
      expect(resultado.sucesso).toBe(true);

      const conta = obterContaAPagar(db, resultado.id!, "2024-04-01");
      expect(conta!.imovel_id).toBeNull();
      expect(conta!.documento_id).toBeNull();
      expect(conta!.status_calculado).toBe("pendente");
    });
  });

  describe("baixarContaAPagar", () => {
    it("gera lançamento real no razão (débito despesa / crédito caixa) e a conta bancária correta perde saldo", () => {
      const { id } = registrarContaAPagar(db, {
        entidade_id,
        fornecedor_nome: "Condomínio Edifício Aurora",
        valor: 500,
        data_vencimento: "2024-03-10",
        plano_conta_codigo: "2.1.01",
      });

      const resultado = baixarContaAPagar(db, id!, 1, "2024-03-10", 7);

      expect(resultado.sucesso).toBe(true);
      expect(resultado.ledger_entry_id_baixa).toBeTruthy();
      expect(resultado.transacao_id).toBeTruthy();

      // A conta bancária 1 (a escolhida na baixa) perde exatamente o valor — a 2 nem é
      // tocada.
      expect(saldoBancario(1)).toBeCloseTo(-500, 2);
      expect(saldoBancario(2)).toBeCloseTo(0, 2);

      // Razão: crédito em caixa, débito na despesa mapeada (2.1.01 → 5210).
      const contaDespesa = MAPA_APP_PARA_ERP["2.1.01"];
      expect(saldoLedgerConta(CONTA_CAIXA_ERP).credito).toBeCloseTo(500, 2);
      expect(saldoLedgerConta(CONTA_CAIXA_ERP).debito).toBeCloseTo(0, 2);
      expect(saldoLedgerConta(contaDespesa).debito).toBeCloseTo(500, 2);
      expect(saldoLedgerConta(contaDespesa).credito).toBeCloseTo(0, 2);

      // A conta a pagar está marcada como paga, com a prova do lançamento gravada.
      const conta = obterContaAPagar(db, id!, "2024-03-10");
      expect(conta!.status).toBe("paga");
      expect(conta!.status_calculado).toBe("paga");
      expect(conta!.data_pagamento).toBe("2024-03-10");
      expect(conta!.ledger_entry_id_baixa).toBe(resultado.ledger_entry_id_baixa);

      const [lancamentoBaixa] = consultar<{ conta_id: number; valor_debito: number }>(
        db,
        "SELECT conta_id, valor_debito FROM ledger_entries WHERE id = ?",
        [resultado.ledger_entry_id_baixa!],
      );
      expect(lancamentoBaixa.conta_id).toBe(contaDespesa);
      expect(lancamentoBaixa.valor_debito).toBeCloseTo(500, 2);
    });

    it("recusa baixa dupla (conta já paga)", () => {
      const { id } = registrarContaAPagar(db, {
        entidade_id,
        fornecedor_nome: "Fornecedor X",
        valor: 300,
        data_vencimento: "2024-03-10",
        plano_conta_codigo: "2.1.02",
      });

      const primeira = baixarContaAPagar(db, id!, 1, "2024-03-10");
      expect(primeira.sucesso).toBe(true);

      const segunda = baixarContaAPagar(db, id!, 1, "2024-03-15");
      expect(segunda.sucesso).toBe(false);
      expect(segunda.mensagem).toMatch(/já está paga/i);

      // Nenhum efeito colateral da segunda tentativa: saldo bancário reflete só a primeira baixa.
      expect(saldoBancario(1)).toBeCloseTo(-300, 2);
    });

    it("recusa baixar conta inexistente, com mensagem clara", () => {
      const resultado = baixarContaAPagar(db, 999999, 1, "2024-03-10");
      expect(resultado.sucesso).toBe(false);
      expect(resultado.mensagem).toMatch(/não encontrada/i);
    });

    it("recusa baixar conta cancelada", () => {
      const { id } = registrarContaAPagar(db, {
        entidade_id,
        fornecedor_nome: "Fornecedor X",
        valor: 300,
        data_vencimento: "2024-03-10",
      });
      cancelarContaAPagar(db, id!, "Duplicidade");

      const resultado = baixarContaAPagar(db, id!, 1, "2024-03-10");
      expect(resultado.sucesso).toBe(false);
      expect(resultado.mensagem).toMatch(/cancelada/i);
    });
  });

  describe("cancelarContaAPagar", () => {
    it("recusa cancelar uma conta já paga", () => {
      const { id } = registrarContaAPagar(db, {
        entidade_id,
        fornecedor_nome: "Fornecedor X",
        valor: 300,
        data_vencimento: "2024-03-10",
      });
      baixarContaAPagar(db, id!, 1, "2024-03-10");

      const resultado = cancelarContaAPagar(db, id!, "Tentativa indevida");
      expect(resultado.sucesso).toBe(false);
      expect(resultado.mensagem).toMatch(/já paga/i);

      const conta = obterContaAPagar(db, id!, "2024-03-10");
      expect(conta!.status).toBe("paga");
    });

    it("cancela uma conta pendente e é idempotente ao cancelar de novo", () => {
      const { id } = registrarContaAPagar(db, {
        entidade_id,
        fornecedor_nome: "Fornecedor X",
        valor: 300,
        data_vencimento: "2024-03-10",
      });

      const primeira = cancelarContaAPagar(db, id!, "Duplicidade de lançamento");
      expect(primeira.sucesso).toBe(true);

      const conta = obterContaAPagar(db, id!, "2024-03-10");
      expect(conta!.status).toBe("cancelada");
      expect(conta!.status_calculado).toBe("cancelada");

      const segunda = cancelarContaAPagar(db, id!, "De novo");
      expect(segunda.sucesso).toBe(true);
    });
  });

  describe("listarContasAPagar", () => {
    it("calcula 'atrasada' em consulta (nunca grava), comparando data_vencimento com a data de referência", () => {
      registrarContaAPagar(db, {
        entidade_id,
        fornecedor_nome: "A vencer",
        valor: 100,
        data_vencimento: "2024-04-01",
      });
      const { id: idAtrasada } = registrarContaAPagar(db, {
        entidade_id,
        fornecedor_nome: "Atrasada",
        valor: 100,
        data_vencimento: "2024-03-01",
      });

      const lista = listarContasAPagar(db, entidade_id, { data_referencia: "2024-03-15" });
      expect(lista).toHaveLength(2);

      const atrasada = lista.find((c) => c.id === idAtrasada)!;
      expect(atrasada.status).toBe("pendente"); // gravado nunca é 'atrasada'
      expect(atrasada.status_calculado).toBe("atrasada");
      expect(atrasada.dias_atraso).toBe(14);

      const aVencer = lista.find((c) => c.fornecedor_nome === "A vencer")!;
      expect(aVencer.status_calculado).toBe("pendente");
      expect(aVencer.dias_atraso).toBe(0);

      const soAtrasadas = listarContasAPagar(db, entidade_id, { data_referencia: "2024-03-15", status: "atrasada" });
      expect(soAtrasadas.map((c) => c.id)).toEqual([idAtrasada]);
    });

    it("vencimento HOJE ainda não conta como atrasada", () => {
      const { id } = registrarContaAPagar(db, {
        entidade_id,
        fornecedor_nome: "Vence hoje",
        valor: 50,
        data_vencimento: "2024-03-15",
      });
      const conta = obterContaAPagar(db, id!, "2024-03-15");
      expect(conta!.status_calculado).toBe("pendente");
    });
  });

  describe("gerarRelatorioAging", () => {
    it("classifica contas pendentes em faixas de atraso a partir de uma data de referência fixa", () => {
      const DATA_REF = "2025-06-15";

      const aVencer = registrarContaAPagar(db, {
        entidade_id,
        fornecedor_nome: "A vencer",
        valor: 100,
        data_vencimento: deslocarData(DATA_REF, 10),
      }).id!;
      const faixa0a30 = registrarContaAPagar(db, {
        entidade_id,
        fornecedor_nome: "Faixa 0-30 (10 dias)",
        valor: 200,
        data_vencimento: deslocarData(DATA_REF, -10),
      }).id!;
      const limite30 = registrarContaAPagar(db, {
        entidade_id,
        fornecedor_nome: "Limite exato 30 dias",
        valor: 10,
        data_vencimento: deslocarData(DATA_REF, -30),
      }).id!;
      const limite31 = registrarContaAPagar(db, {
        entidade_id,
        fornecedor_nome: "Limite exato 31 dias",
        valor: 20,
        data_vencimento: deslocarData(DATA_REF, -31),
      }).id!;
      const faixa31a60 = registrarContaAPagar(db, {
        entidade_id,
        fornecedor_nome: "Faixa 31-60 (45 dias)",
        valor: 300,
        data_vencimento: deslocarData(DATA_REF, -45),
      }).id!;
      const faixa61a90 = registrarContaAPagar(db, {
        entidade_id,
        fornecedor_nome: "Faixa 61-90 (75 dias)",
        valor: 400,
        data_vencimento: deslocarData(DATA_REF, -75),
      }).id!;
      const faixa90mais = registrarContaAPagar(db, {
        entidade_id,
        fornecedor_nome: "Faixa 90+ (120 dias)",
        valor: 500,
        data_vencimento: deslocarData(DATA_REF, -120),
      }).id!;

      // Não deve entrar no relatório (não é 'pendente').
      const { id: idPaga } = registrarContaAPagar(db, {
        entidade_id,
        fornecedor_nome: "Já paga, mesmo vencida há muito tempo",
        valor: 999,
        data_vencimento: deslocarData(DATA_REF, -200),
      });
      baixarContaAPagar(db, idPaga!, 1, DATA_REF);

      const { id: idCancelada } = registrarContaAPagar(db, {
        entidade_id,
        fornecedor_nome: "Cancelada",
        valor: 999,
        data_vencimento: deslocarData(DATA_REF, -50),
      });
      cancelarContaAPagar(db, idCancelada!, "Não devida");

      const relatorio = gerarRelatorioAging(db, entidade_id, DATA_REF);
      expect(relatorio.data_referencia).toBe(DATA_REF);
      expect(relatorio.faixas.map((f) => f.faixa)).toEqual(["a_vencer", "0-30", "31-60", "61-90", "90+"]);

      const porFaixa = Object.fromEntries(relatorio.faixas.map((f) => [f.faixa, f]));

      expect(porFaixa["a_vencer"].itens.map((i) => i.id)).toEqual([aVencer]);
      expect(porFaixa["0-30"].itens.map((i) => i.id).sort()).toEqual([faixa0a30, limite30].sort());
      expect(porFaixa["31-60"].itens.map((i) => i.id).sort()).toEqual([limite31, faixa31a60].sort());
      expect(porFaixa["61-90"].itens.map((i) => i.id)).toEqual([faixa61a90]);
      expect(porFaixa["90+"].itens.map((i) => i.id)).toEqual([faixa90mais]);

      expect(porFaixa["0-30"].total).toBeCloseTo(210, 2);
      expect(porFaixa["31-60"].total).toBeCloseTo(320, 2);
      expect(porFaixa["61-90"].total).toBeCloseTo(400, 2);
      expect(porFaixa["90+"].total).toBeCloseTo(500, 2);

      // Nem a paga nem a cancelada aparecem em faixa alguma.
      const todosOsIds = relatorio.faixas.flatMap((f) => f.itens.map((i) => i.id));
      expect(todosOsIds).not.toContain(idPaga);
      expect(todosOsIds).not.toContain(idCancelada);

      expect(relatorio.total_geral).toBeCloseTo(100 + 210 + 320 + 400 + 500, 2);
    });
  });
});
