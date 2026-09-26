import { describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { consultar, executar } from "../../db/connection";
import { criarEntidadeLegal } from "../erp/entidadeLegal";
import { validarBalanceamento } from "../erp/ledger";
import {
  cadastrarPessoa,
  listarPessoas,
  editarPessoa,
  removerPessoa,
  cadastrarContaPessoal,
  listarContasPessoais,
  removerContaPessoal,
  registrarMovimentoPessoal,
  relatorioMovimentosPessoais,
  relatorioSegregacaoPatrimonial,
  CONTA_CAPITAL_SOCIAL_ERP,
  CONTA_EMPRESTIMO_SOCIO_ERP,
} from "./contasPessoais";

/** Suíte contra o schema REAL (contabilidade-reconstituicao/schema.sql), via
 * criarBancoDeTeste() — nunca contra tabela fictícia (ver docs/dominios-a-reconstruir.md,
 * seção 2, e a regra geral do documento sobre reconstrução). */
async function montarBase() {
  const db = await criarBancoDeTeste();
  const onboarding = criarEntidadeLegal(db, { nome: "Titular de Teste", cpf_cnpj: "52998224725" });
  expect(onboarding.sucesso).toBe(true);
  const entidade_id = onboarding.entidade_id!;

  executar(db, "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2025, 1, 'aberto')", [
    entidade_id,
  ]);
  const periodo_id = consultar<{ id: number }>(
    db,
    "SELECT id FROM periodos_contabeis WHERE entidade_id = ? AND ano = 2025 AND mes = 1",
    [entidade_id],
  )[0].id;

  return { db, entidade_id, periodo_id };
}

function saldoConta(db: Database, periodo_id: number, conta_id: number): number {
  const [{ debito, credito }] = consultar<{ debito: number; credito: number }>(
    db,
    `SELECT COALESCE(SUM(valor_debito), 0) as debito, COALESCE(SUM(valor_credito), 0) as credito
     FROM ledger_entries WHERE periodo_id = ? AND conta_id = ?`,
    [periodo_id, conta_id],
  );
  return debito - credito;
}

function totalLancamentosEntidade(db: Database, periodo_id: number): number {
  const [{ total }] = consultar<{ total: number }>(
    db,
    "SELECT COUNT(*) as total FROM ledger_entries WHERE periodo_id = ?",
    [periodo_id],
  );
  return total;
}

describe("contasPessoais — cadastro de pessoa e conta pessoal", () => {
  it("cadastra, lista, edita e remove uma pessoa", async () => {
    const { db } = await montarBase();

    const r1 = cadastrarPessoa(db, { nome: "Maria Sócia", cpf: "111.111.111-11", tipo_relacao: "socio" });
    expect(r1.sucesso).toBe(true);
    const pessoaId = r1.id!;

    const lista = listarPessoas(db);
    expect(lista.map((p) => p.nome)).toContain("Maria Sócia");

    const edicao = editarPessoa(db, pessoaId, { observacoes: "Sócia de fato desde 2020" });
    expect(edicao.sucesso).toBe(true);
    expect(listarPessoas(db).find((p) => p.id === pessoaId)?.observacoes).toBe("Sócia de fato desde 2020");

    const remocao = removerPessoa(db, pessoaId);
    expect(remocao.sucesso).toBe(true);
    expect(listarPessoas(db).find((p) => p.id === pessoaId)).toBeUndefined();
  });

  it("recusa remover pessoa com conta pessoal cadastrada", async () => {
    const { db } = await montarBase();
    const pessoa = cadastrarPessoa(db, { nome: "João Titular", tipo_relacao: "titular" });
    cadastrarContaPessoal(db, { pessoa_id: pessoa.id!, banco: "Banco X", numero: "12345-6", tipo: "corrente" });

    const remocao = removerPessoa(db, pessoa.id!);
    expect(remocao.sucesso).toBe(false);
    expect(remocao.mensagem).toMatch(/conta\(s\) pessoal/);
  });

  it("cadastra e lista contas pessoais de uma pessoa, e recusa cadastro para pessoa inexistente", async () => {
    const { db } = await montarBase();
    const pessoa = cadastrarPessoa(db, { nome: "João Titular", tipo_relacao: "titular" });

    const semPessoa = cadastrarContaPessoal(db, { pessoa_id: 9999, banco: "Banco X", numero: "1", tipo: "corrente" });
    expect(semPessoa.sucesso).toBe(false);

    const r = cadastrarContaPessoal(db, {
      pessoa_id: pessoa.id!,
      banco: "Banco X",
      numero: "12345-6",
      tipo: "corrente",
    });
    expect(r.sucesso).toBe(true);

    const contas = listarContasPessoais(db, pessoa.id!);
    expect(contas).toHaveLength(1);
    expect(contas[0].banco).toBe("Banco X");
  });

  it("recusa remover conta pessoal com movimento registrado", async () => {
    const { db } = await montarBase();
    const pessoa = cadastrarPessoa(db, { nome: "João Titular", tipo_relacao: "titular" });
    const conta = cadastrarContaPessoal(db, {
      pessoa_id: pessoa.id!,
      banco: "Banco X",
      numero: "1",
      tipo: "corrente",
    });

    registrarMovimentoPessoal(db, {
      conta_pessoal_id: conta.id!,
      data: "2025-01-05",
      valor: 500,
      descricao: "Depósito qualquer",
    });

    const remocao = removerContaPessoal(db, conta.id!);
    expect(remocao.sucesso).toBe(false);
    expect(remocao.mensagem).toMatch(/movimento/);
  });
});

describe("contasPessoais — registrarMovimentoPessoal", () => {
  it("movimento comum (sem transferência) não mexe no razão da entidade", async () => {
    const { db, periodo_id } = await montarBase();
    const pessoa = cadastrarPessoa(db, { nome: "João Titular", tipo_relacao: "titular" });
    const conta = cadastrarContaPessoal(db, {
      pessoa_id: pessoa.id!,
      banco: "Banco X",
      numero: "1",
      tipo: "corrente",
    });

    const antesDoLedger = totalLancamentosEntidade(db, periodo_id);

    const movimentoId = registrarMovimentoPessoal(db, {
      conta_pessoal_id: conta.id!,
      data: "2025-01-10",
      valor: 1500,
      descricao: "Salário",
      categoria: "salario",
    });
    expect(movimentoId).toBeGreaterThan(0);

    // Nenhum lançamento novo no razão — movimento puramente pessoal.
    expect(totalLancamentosEntidade(db, periodo_id)).toBe(antesDoLedger);

    const [gravado] = consultar<{ transferencia_entidade_id: number | null; valor: number }>(
      db,
      "SELECT transferencia_entidade_id, valor FROM movimentos_pessoais WHERE id = ?",
      [movimentoId],
    );
    expect(gravado.transferencia_entidade_id).toBeNull();
    expect(gravado.valor).toBe(1500);
  });

  it("recusa transferência sem os dados da entidade", async () => {
    const { db } = await montarBase();
    const pessoa = cadastrarPessoa(db, { nome: "João Titular", tipo_relacao: "titular" });
    const conta = cadastrarContaPessoal(db, {
      pessoa_id: pessoa.id!,
      banco: "Banco X",
      numero: "1",
      tipo: "corrente",
    });

    expect(() =>
      registrarMovimentoPessoal(db, {
        conta_pessoal_id: conta.id!,
        data: "2025-01-10",
        valor: -1000,
        descricao: "Aporte sem dados de entidade",
        categoria: "aporte_capital",
      }),
    ).toThrow(/exige os dados dela/);
  });

  it("recusa categoria de transferência com sinal de valor incompatível", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const pessoa = cadastrarPessoa(db, { nome: "João Titular", tipo_relacao: "titular" });
    const conta = cadastrarContaPessoal(db, {
      pessoa_id: pessoa.id!,
      banco: "Banco X",
      numero: "1",
      tipo: "corrente",
    });

    // aporte_capital é dinheiro SAINDO da pessoa (valor negativo) — positivo é rejeitado.
    expect(() =>
      registrarMovimentoPessoal(db, {
        conta_pessoal_id: conta.id!,
        data: "2025-01-10",
        valor: 1000,
        descricao: "Aporte com sinal errado",
        categoria: "aporte_capital",
        transferencia: { entidade_id, periodo_id },
      }),
    ).toThrow(/valor deve ser negativo/);
  });

  it("aporte de capital (pessoa→entidade) cria lançamento espelho: débito Caixa, crédito Capital Social", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const pessoa = cadastrarPessoa(db, { nome: "João Titular", tipo_relacao: "titular" });
    const conta = cadastrarContaPessoal(db, {
      pessoa_id: pessoa.id!,
      banco: "Banco X",
      numero: "1",
      tipo: "corrente",
    });

    const saldoCaixaAntes = saldoConta(db, periodo_id, 1101); // CONTA_CAIXA_ERP
    const saldoCapitalAntes = saldoConta(db, periodo_id, CONTA_CAPITAL_SOCIAL_ERP);

    const movimentoId = registrarMovimentoPessoal(db, {
      conta_pessoal_id: conta.id!,
      data: "2025-01-15",
      valor: -10000, // sai da pessoa
      descricao: "Aporte inicial de capital",
      categoria: "aporte_capital",
      transferencia: { entidade_id, periodo_id },
    });

    // Espelho gravado no movimento pessoal.
    const [gravado] = consultar<{ transferencia_entidade_id: number | null }>(
      db,
      "SELECT transferencia_entidade_id FROM movimentos_pessoais WHERE id = ?",
      [movimentoId],
    );
    expect(gravado.transferencia_entidade_id).not.toBeNull();

    // Caixa da entidade sobe (débito) e Capital Social sobe (crédito) em 10.000.
    expect(saldoConta(db, periodo_id, 1101) - saldoCaixaAntes).toBe(10000);
    expect(saldoConta(db, periodo_id, CONTA_CAPITAL_SOCIAL_ERP) - saldoCapitalAntes).toBe(-10000); // crédito reduz débito-crédito

    // Período continua balanceado (débito = crédito).
    expect(validarBalanceamento(db, periodo_id).balanceado).toBe(true);
  });

  it("empréstimo de sócio (pessoa→entidade) usa a conta de Empréstimo de Sócio, não Capital Social", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const pessoa = cadastrarPessoa(db, { nome: "Sócio Financiador", tipo_relacao: "socio" });
    const conta = cadastrarContaPessoal(db, {
      pessoa_id: pessoa.id!,
      banco: "Banco Y",
      numero: "2",
      tipo: "corrente",
    });

    registrarMovimentoPessoal(db, {
      conta_pessoal_id: conta.id!,
      data: "2025-01-20",
      valor: -5000,
      descricao: "Empréstimo do sócio para cobrir despesa",
      categoria: "emprestimo_socio",
      transferencia: { entidade_id, periodo_id },
    });

    expect(saldoConta(db, periodo_id, CONTA_EMPRESTIMO_SOCIO_ERP)).toBe(-5000); // crédito
    expect(saldoConta(db, periodo_id, CONTA_CAPITAL_SOCIAL_ERP)).toBe(0); // Capital Social intocado
    expect(validarBalanceamento(db, periodo_id).balanceado).toBe(true);
  });

  it("devolução de empréstimo (entidade→pessoa) reduz o passivo de Empréstimo de Sócio", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const pessoa = cadastrarPessoa(db, { nome: "Sócio Financiador", tipo_relacao: "socio" });
    const conta = cadastrarContaPessoal(db, {
      pessoa_id: pessoa.id!,
      banco: "Banco Y",
      numero: "2",
      tipo: "corrente",
    });

    registrarMovimentoPessoal(db, {
      conta_pessoal_id: conta.id!,
      data: "2025-01-05",
      valor: -5000,
      descricao: "Empréstimo do sócio",
      categoria: "emprestimo_socio",
      transferencia: { entidade_id, periodo_id },
    });

    registrarMovimentoPessoal(db, {
      conta_pessoal_id: conta.id!,
      data: "2025-01-25",
      valor: 2000,
      descricao: "Devolução parcial do empréstimo",
      categoria: "devolucao_emprestimo",
      transferencia: { entidade_id, periodo_id },
    });

    // Saldo líquido do passivo: -5000 (crédito) + 2000 (débito) = -3000 ainda devedor pra entidade.
    expect(saldoConta(db, periodo_id, CONTA_EMPRESTIMO_SOCIO_ERP)).toBe(-3000);
    expect(validarBalanceamento(db, periodo_id).balanceado).toBe(true);
  });
});

describe("contasPessoais — relatorioMovimentosPessoais", () => {
  it("fecha o saldo somando entradas e saídas, separando depósitos/saques de transferências", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const pessoa = cadastrarPessoa(db, { nome: "João Titular", tipo_relacao: "titular" });
    const conta = cadastrarContaPessoal(db, {
      pessoa_id: pessoa.id!,
      banco: "Banco X",
      numero: "1",
      tipo: "corrente",
    });

    registrarMovimentoPessoal(db, {
      conta_pessoal_id: conta.id!,
      data: "2025-01-02",
      valor: 3000,
      descricao: "Salário",
      categoria: "salario",
    });
    registrarMovimentoPessoal(db, {
      conta_pessoal_id: conta.id!,
      data: "2025-01-05",
      valor: -800,
      descricao: "Supermercado",
      categoria: "alimentacao",
    });
    registrarMovimentoPessoal(db, {
      conta_pessoal_id: conta.id!,
      data: "2025-01-10",
      valor: -1000,
      descricao: "Aporte de capital",
      categoria: "aporte_capital",
      transferencia: { entidade_id, periodo_id },
    });
    registrarMovimentoPessoal(db, {
      conta_pessoal_id: conta.id!,
      data: "2025-01-20",
      valor: 400,
      descricao: "Retirada de capital",
      categoria: "retirada_capital",
      transferencia: { entidade_id, periodo_id },
    });

    const extrato = relatorioMovimentosPessoais(db, pessoa.id!, { inicio: "2025-01-01", fim: "2025-01-31" });

    expect(extrato.total_depositos).toBe(3000);
    expect(extrato.total_saques).toBe(800);
    expect(extrato.total_transferencias_para_entidade).toBe(1000);
    expect(extrato.total_transferencias_da_entidade).toBe(400);
    expect(extrato.movimentos).toHaveLength(4);

    // Saldo fecha: 3000 - 800 - 1000 + 400 = 1600.
    const somaBruta = 3000 - 800 - 1000 + 400;
    expect(extrato.saldo_periodo).toBe(somaBruta);
    expect(extrato.saldo_atual).toBe(somaBruta);
  });

  it("filtra movimentos fora do período", async () => {
    const { db } = await montarBase();
    const pessoa = cadastrarPessoa(db, { nome: "João Titular", tipo_relacao: "titular" });
    const conta = cadastrarContaPessoal(db, {
      pessoa_id: pessoa.id!,
      banco: "Banco X",
      numero: "1",
      tipo: "corrente",
    });

    registrarMovimentoPessoal(db, {
      conta_pessoal_id: conta.id!,
      data: "2024-12-31",
      valor: 100,
      descricao: "Fora do período",
    });
    registrarMovimentoPessoal(db, {
      conta_pessoal_id: conta.id!,
      data: "2025-01-15",
      valor: 200,
      descricao: "Dentro do período",
    });

    const extrato = relatorioMovimentosPessoais(db, pessoa.id!, { inicio: "2025-01-01", fim: "2025-01-31" });
    expect(extrato.movimentos).toHaveLength(1);
    expect(extrato.saldo_periodo).toBe(200);
    expect(extrato.saldo_atual).toBe(300); // saldo_atual não filtra por período
  });
});

describe("contasPessoais — relatorioSegregacaoPatrimonial", () => {
  it("consolida transferências confirmadas nos dois sentidos e reporta integridade OK quando tudo tem espelho", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const pessoa = cadastrarPessoa(db, { nome: "João Titular", tipo_relacao: "titular" });
    const conta = cadastrarContaPessoal(db, {
      pessoa_id: pessoa.id!,
      banco: "Banco X",
      numero: "1",
      tipo: "corrente",
    });

    registrarMovimentoPessoal(db, {
      conta_pessoal_id: conta.id!,
      data: "2025-01-10",
      valor: -10000,
      descricao: "Aporte de capital",
      categoria: "aporte_capital",
      transferencia: { entidade_id, periodo_id },
    });
    registrarMovimentoPessoal(db, {
      conta_pessoal_id: conta.id!,
      data: "2025-01-15",
      valor: -3000,
      descricao: "Empréstimo de sócio",
      categoria: "emprestimo_socio",
      transferencia: { entidade_id, periodo_id },
    });
    registrarMovimentoPessoal(db, {
      conta_pessoal_id: conta.id!,
      data: "2025-01-20",
      valor: 1000,
      descricao: "Retirada de capital",
      categoria: "retirada_capital",
      transferencia: { entidade_id, periodo_id },
    });

    const relatorio = relatorioSegregacaoPatrimonial(db, entidade_id, periodo_id);

    expect(relatorio.total_pessoa_para_entidade).toBe(13000); // 10000 + 3000
    expect(relatorio.total_entidade_para_pessoa).toBe(1000);
    expect(relatorio.saldo_liquido).toBe(12000);
    expect(relatorio.transferencias_orfas).toHaveLength(0);
    expect(relatorio.integro).toBe(true);
  });

  it("detecta uma transferência órfã inserida direto no banco, sem passar por registrarMovimentoPessoal", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const pessoa = cadastrarPessoa(db, { nome: "João Titular", tipo_relacao: "titular" });
    const conta = cadastrarContaPessoal(db, {
      pessoa_id: pessoa.id!,
      banco: "Banco X",
      numero: "1",
      tipo: "corrente",
    });

    // Transferência normal, com espelho — não deve aparecer como órfã.
    registrarMovimentoPessoal(db, {
      conta_pessoal_id: conta.id!,
      data: "2025-01-05",
      valor: -2000,
      descricao: "Aporte regular",
      categoria: "aporte_capital",
      transferencia: { entidade_id, periodo_id },
    });

    // INSERT direto na tabela, por fora da função — categoria de transferência, mas
    // transferencia_entidade_id nunca preenchido. É exatamente o cenário de confusão
    // patrimonial que o relatório precisa flagrar.
    executar(
      db,
      `INSERT INTO movimentos_pessoais (conta_pessoal_id, data, valor, descricao, categoria)
       VALUES (?, ?, ?, ?, ?)`,
      [conta.id!, "2025-01-18", -7000, "Aporte lançado por fora, sem espelho", "aporte_capital"],
    );

    const relatorio = relatorioSegregacaoPatrimonial(db, entidade_id, periodo_id);

    expect(relatorio.integro).toBe(false);
    expect(relatorio.transferencias_orfas).toHaveLength(1);
    expect(relatorio.transferencias_orfas[0].valor).toBe(-7000);
    expect(relatorio.transferencias_orfas[0].pessoa_nome).toBe("João Titular");
    expect(relatorio.transferencias_orfas[0].categoria).toBe("aporte_capital");

    // O total confirmado NÃO inclui a órfã — só o que tem espelho de verdade.
    expect(relatorio.total_pessoa_para_entidade).toBe(2000);
  });

  it("um movimento comum (categoria não-transferência) sem espelho nunca é reportado como órfão", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const pessoa = cadastrarPessoa(db, { nome: "João Titular", tipo_relacao: "titular" });
    const conta = cadastrarContaPessoal(db, {
      pessoa_id: pessoa.id!,
      banco: "Banco X",
      numero: "1",
      tipo: "corrente",
    });

    registrarMovimentoPessoal(db, {
      conta_pessoal_id: conta.id!,
      data: "2025-01-10",
      valor: 500,
      descricao: "Movimento comum qualquer",
      categoria: "salario",
    });

    const relatorio = relatorioSegregacaoPatrimonial(db, entidade_id, periodo_id);
    expect(relatorio.integro).toBe(true);
    expect(relatorio.transferencias_orfas).toHaveLength(0);
  });
});
