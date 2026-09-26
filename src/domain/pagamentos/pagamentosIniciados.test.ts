import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar, consultar } from "../../db/connection";
import { criarEntidadeLegal } from "../erp/entidadeLegal";
import { registrarContaAPagar } from "../contasAPagar/contasAPagar";
import {
  solicitarPagamento,
  confirmarPagamento,
  registrarFalhaPagamento,
  conciliarPagamentoComTransacao,
  relatorioPagamentosPendentes,
  obterPagamento,
} from "./pagamentosIniciados";

const CPF_TESTE = "52998224725";

let db: Database;
let entidade_id: number;
let conta_bancaria_id: number;

beforeEach(async () => {
  db = await criarBancoDeTeste();
  executar(
    db,
    "INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo) VALUES (1, 'Banco 1', '0001', '11111', 'Titular', 'corrente')",
  );
  conta_bancaria_id = 1;
  const r = criarEntidadeLegal(db, { nome: "Titular de Teste", cpf_cnpj: CPF_TESTE });
  if (!r.entidade_id) throw new Error(`Fixture não conseguiu criar a entidade: ${r.mensagem}`);
  entidade_id = r.entidade_id;
});

function inserirTransacaoDeTeste(valor: number, data = "2025-06-10"): number {
  executar(
    db,
    "INSERT INTO transacoes (conta_id, data, valor, descricao_original) VALUES (?, ?, ?, ?)",
    [conta_bancaria_id, data, valor, "PIX ENVIADO TESTE"],
  );
  return consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id")[0].id;
}

describe("solicitarPagamento", () => {
  it("cria o registro com status 'solicitado'", () => {
    const r = solicitarPagamento(db, {
      entidade_id,
      conta_bancaria_id,
      tipo: "pix",
      valor: 500,
      destinatario_nome: "Fornecedor Ltda",
      destinatario_documento: "12345678000199",
      destinatario_chave_pix: "fornecedor@pix.com",
      data_solicitacao: "2025-06-01",
    });
    expect(r.sucesso).toBe(true);
    expect(r.id).toBeDefined();

    const pagamento = obterPagamento(db, r.id!);
    expect(pagamento?.status).toBe("solicitado");
    expect(pagamento?.valor).toBe(500);
    expect(pagamento?.destinatario_chave_pix).toBe("fornecedor@pix.com");
    expect(pagamento?.data_confirmacao).toBeNull();
    expect(pagamento?.transacao_id).toBeNull();
  });

  it("recusa chave PIX em pagamento do tipo 'ted'", () => {
    const r = solicitarPagamento(db, {
      entidade_id,
      conta_bancaria_id,
      tipo: "ted",
      valor: 500,
      destinatario_nome: "Fornecedor Ltda",
      destinatario_documento: "12345678000199",
      destinatario_chave_pix: "nao-deveria-existir",
      data_solicitacao: "2025-06-01",
    });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/chave pix/i);
  });

  it("recusa valor não positivo", () => {
    const r = solicitarPagamento(db, {
      entidade_id,
      conta_bancaria_id,
      tipo: "ted",
      valor: 0,
      destinatario_nome: "Fornecedor Ltda",
      destinatario_documento: "12345678000199",
      data_solicitacao: "2025-06-01",
    });
    expect(r.sucesso).toBe(false);
  });

  it("recusa conta bancária inexistente", () => {
    const r = solicitarPagamento(db, {
      entidade_id,
      conta_bancaria_id: 999,
      tipo: "ted",
      valor: 500,
      destinatario_nome: "Fornecedor Ltda",
      destinatario_documento: "12345678000199",
      data_solicitacao: "2025-06-01",
    });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/conta bancária/i);
  });

  describe("vinculado a uma conta a pagar", () => {
    it("valida que a obrigação existe e está pendente", () => {
      const contaAPagar = registrarContaAPagar(db, {
        entidade_id,
        fornecedor_nome: "Fornecedor Ltda",
        valor: 800,
        data_vencimento: "2025-06-15",
      });
      expect(contaAPagar.sucesso).toBe(true);

      const r = solicitarPagamento(db, {
        entidade_id,
        conta_bancaria_id,
        tipo: "ted",
        valor: 800,
        destinatario_nome: "Fornecedor Ltda",
        destinatario_documento: "12345678000199",
        contas_a_pagar_id: contaAPagar.id!,
        data_solicitacao: "2025-06-14",
      });
      expect(r.sucesso).toBe(true);
      expect(obterPagamento(db, r.id!)?.contas_a_pagar_id).toBe(contaAPagar.id);
    });

    it("recusa quando a conta a pagar não existe", () => {
      const r = solicitarPagamento(db, {
        entidade_id,
        conta_bancaria_id,
        tipo: "ted",
        valor: 800,
        destinatario_nome: "Fornecedor Ltda",
        destinatario_documento: "12345678000199",
        contas_a_pagar_id: 999,
        data_solicitacao: "2025-06-14",
      });
      expect(r.sucesso).toBe(false);
      expect(r.mensagem).toMatch(/não encontrada/i);
    });

    it("recusa quando a conta a pagar já está cancelada", () => {
      const contaAPagar = registrarContaAPagar(db, {
        entidade_id,
        fornecedor_nome: "Fornecedor Ltda",
        valor: 800,
        data_vencimento: "2025-06-15",
      });
      executar(db, "UPDATE contas_a_pagar SET status = 'cancelada' WHERE id = ?", [contaAPagar.id]);

      const r = solicitarPagamento(db, {
        entidade_id,
        conta_bancaria_id,
        tipo: "ted",
        valor: 800,
        destinatario_nome: "Fornecedor Ltda",
        destinatario_documento: "12345678000199",
        contas_a_pagar_id: contaAPagar.id!,
        data_solicitacao: "2025-06-14",
      });
      expect(r.sucesso).toBe(false);
      expect(r.mensagem).toMatch(/cancelada/i);
    });

    it("recusa quando a conta a pagar já está paga", () => {
      const contaAPagar = registrarContaAPagar(db, {
        entidade_id,
        fornecedor_nome: "Fornecedor Ltda",
        valor: 800,
        data_vencimento: "2025-06-15",
      });
      executar(db, "UPDATE contas_a_pagar SET status = 'paga', data_pagamento = '2025-06-10' WHERE id = ?", [
        contaAPagar.id,
      ]);

      const r = solicitarPagamento(db, {
        entidade_id,
        conta_bancaria_id,
        tipo: "ted",
        valor: 800,
        destinatario_nome: "Fornecedor Ltda",
        destinatario_documento: "12345678000199",
        contas_a_pagar_id: contaAPagar.id!,
        data_solicitacao: "2025-06-14",
      });
      expect(r.sucesso).toBe(false);
      expect(r.mensagem).toMatch(/já está paga/i);
    });
  });
});

describe("fluxo completo solicitado → confirmado → conciliado", () => {
  it("percorre o ciclo de vida inteiro", () => {
    const solicitado = solicitarPagamento(db, {
      entidade_id,
      conta_bancaria_id,
      tipo: "pix",
      valor: 300,
      destinatario_nome: "Prestador de Serviço",
      destinatario_documento: "52998224725",
      destinatario_chave_pix: "prestador@pix.com",
      data_solicitacao: "2025-06-01",
    });
    expect(solicitado.sucesso).toBe(true);
    const pagamento_id = solicitado.id!;
    expect(obterPagamento(db, pagamento_id)?.status).toBe("solicitado");

    const confirmado = confirmarPagamento(db, pagamento_id, "2025-06-01");
    expect(confirmado.sucesso).toBe(true);
    const apósConfirmar = obterPagamento(db, pagamento_id);
    expect(apósConfirmar?.status).toBe("confirmado");
    expect(apósConfirmar?.data_confirmacao).toBe("2025-06-01");

    const transacao_id = inserirTransacaoDeTeste(-300, "2025-06-02");
    const conciliado = conciliarPagamentoComTransacao(db, pagamento_id, transacao_id);
    expect(conciliado.sucesso).toBe(true);
    const apósConciliar = obterPagamento(db, pagamento_id);
    expect(apósConciliar?.status).toBe("conciliado");
    expect(apósConciliar?.transacao_id).toBe(transacao_id);
  });

  it("não deixa confirmar um pagamento que não está 'solicitado'", () => {
    const solicitado = solicitarPagamento(db, {
      entidade_id,
      conta_bancaria_id,
      tipo: "ted",
      valor: 300,
      destinatario_nome: "Prestador",
      destinatario_documento: "52998224725",
      data_solicitacao: "2025-06-01",
    });
    const pagamento_id = solicitado.id!;
    confirmarPagamento(db, pagamento_id);

    const segundaConfirmacao = confirmarPagamento(db, pagamento_id);
    expect(segundaConfirmacao.sucesso).toBe(false);
  });

  it("não deixa conciliar um pagamento ainda 'solicitado' (sem confirmação do provedor)", () => {
    const solicitado = solicitarPagamento(db, {
      entidade_id,
      conta_bancaria_id,
      tipo: "ted",
      valor: 300,
      destinatario_nome: "Prestador",
      destinatario_documento: "52998224725",
      data_solicitacao: "2025-06-01",
    });
    const pagamento_id = solicitado.id!;
    const transacao_id = inserirTransacaoDeTeste(-300);

    const conciliado = conciliarPagamentoComTransacao(db, pagamento_id, transacao_id);
    expect(conciliado.sucesso).toBe(false);
    expect(conciliado.mensagem).toMatch(/confirmado/i);
  });
});

describe("registrarFalhaPagamento", () => {
  it("marca o pagamento como 'falhou' com o motivo registrado", () => {
    const solicitado = solicitarPagamento(db, {
      entidade_id,
      conta_bancaria_id,
      tipo: "ted",
      valor: 300,
      destinatario_nome: "Prestador",
      destinatario_documento: "52998224725",
      data_solicitacao: "2025-06-01",
    });
    const pagamento_id = solicitado.id!;

    const falha = registrarFalhaPagamento(db, pagamento_id, "Conta destino encerrada pelo banco");
    expect(falha.sucesso).toBe(true);

    const pagamento = obterPagamento(db, pagamento_id);
    expect(pagamento?.status).toBe("falhou");
    expect(pagamento?.motivo_falha).toBe("Conta destino encerrada pelo banco");
  });

  it("exige motivo não vazio", () => {
    const solicitado = solicitarPagamento(db, {
      entidade_id,
      conta_bancaria_id,
      tipo: "ted",
      valor: 300,
      destinatario_nome: "Prestador",
      destinatario_documento: "52998224725",
      data_solicitacao: "2025-06-01",
    });
    const falha = registrarFalhaPagamento(db, solicitado.id!, "   ");
    expect(falha.sucesso).toBe(false);
  });

  it("não deixa marcar como falho um pagamento já conciliado", () => {
    const solicitado = solicitarPagamento(db, {
      entidade_id,
      conta_bancaria_id,
      tipo: "ted",
      valor: 300,
      destinatario_nome: "Prestador",
      destinatario_documento: "52998224725",
      data_solicitacao: "2025-06-01",
    });
    const pagamento_id = solicitado.id!;
    confirmarPagamento(db, pagamento_id);
    const transacao_id = inserirTransacaoDeTeste(-300);
    conciliarPagamentoComTransacao(db, pagamento_id, transacao_id);

    const falha = registrarFalhaPagamento(db, pagamento_id, "Motivo qualquer");
    expect(falha.sucesso).toBe(false);
  });
});

describe("conciliarPagamentoComTransacao", () => {
  it("recusa transacao_id inválido (transação inexistente)", () => {
    const solicitado = solicitarPagamento(db, {
      entidade_id,
      conta_bancaria_id,
      tipo: "ted",
      valor: 300,
      destinatario_nome: "Prestador",
      destinatario_documento: "52998224725",
      data_solicitacao: "2025-06-01",
    });
    const pagamento_id = solicitado.id!;
    confirmarPagamento(db, pagamento_id);

    const conciliado = conciliarPagamentoComTransacao(db, pagamento_id, 999999);
    expect(conciliado.sucesso).toBe(false);
    expect(conciliado.mensagem).toMatch(/não encontrada/i);
    expect(obterPagamento(db, pagamento_id)?.status).toBe("confirmado");
  });

  it("recusa pagamento_id inexistente", () => {
    const transacao_id = inserirTransacaoDeTeste(-300);
    const conciliado = conciliarPagamentoComTransacao(db, 999999, transacao_id);
    expect(conciliado.sucesso).toBe(false);
  });
});

describe("relatorioPagamentosPendentes", () => {
  it("lista apenas 'solicitado' e 'confirmado', não 'falhou' nem 'conciliado'", () => {
    const solicitadoP = solicitarPagamento(db, {
      entidade_id,
      conta_bancaria_id,
      tipo: "ted",
      valor: 100,
      destinatario_nome: "A",
      destinatario_documento: "52998224725",
      data_solicitacao: "2025-06-01",
    }).id!;

    const confirmadoP = solicitarPagamento(db, {
      entidade_id,
      conta_bancaria_id,
      tipo: "ted",
      valor: 200,
      destinatario_nome: "B",
      destinatario_documento: "52998224725",
      data_solicitacao: "2025-06-02",
    }).id!;
    confirmarPagamento(db, confirmadoP);

    const falhouP = solicitarPagamento(db, {
      entidade_id,
      conta_bancaria_id,
      tipo: "ted",
      valor: 300,
      destinatario_nome: "C",
      destinatario_documento: "52998224725",
      data_solicitacao: "2025-06-03",
    }).id!;
    registrarFalhaPagamento(db, falhouP, "recusado pelo banco");

    const conciliadoP = solicitarPagamento(db, {
      entidade_id,
      conta_bancaria_id,
      tipo: "ted",
      valor: 400,
      destinatario_nome: "D",
      destinatario_documento: "52998224725",
      data_solicitacao: "2025-06-04",
    }).id!;
    confirmarPagamento(db, conciliadoP);
    const transacao_id = inserirTransacaoDeTeste(-400, "2025-06-05");
    conciliarPagamentoComTransacao(db, conciliadoP, transacao_id);

    const pendentes = relatorioPagamentosPendentes(db, entidade_id);
    const ids = pendentes.map((p) => p.id);
    expect(ids).toContain(solicitadoP);
    expect(ids).toContain(confirmadoP);
    expect(ids).not.toContain(falhouP);
    expect(ids).not.toContain(conciliadoP);
  });

  it("não mistura pagamentos de outra entidade", () => {
    const outra = criarEntidadeLegal(db, { nome: "Outra Entidade", cpf_cnpj: "11144477735" });
    const outraEntidadeId = outra.entidade_id!;

    solicitarPagamento(db, {
      entidade_id: outraEntidadeId,
      conta_bancaria_id,
      tipo: "ted",
      valor: 100,
      destinatario_nome: "X",
      destinatario_documento: "52998224725",
      data_solicitacao: "2025-06-01",
    });

    const pendentes = relatorioPagamentosPendentes(db, entidade_id);
    expect(pendentes).toHaveLength(0);
  });
});
