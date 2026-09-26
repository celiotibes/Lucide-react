import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { consultar, executar } from "../../db/connection";
import { criarEntidadeLegal } from "../erp/entidadeLegal";
import { encerrarPeriodo, registrarLancamentoContabil, validarBalanceamento } from "../erp/ledger";
import { PeriodoFechadoError } from "../erp/ledger-period-validation";
import { listarPeriodosContabeis, obterUltimoEncerramento } from "./periodos";

// CPF real na aritmética dos dígitos verificadores, mas sem titular — mesmo exemplo
// canônico usado nos outros testes de domínio do razão.
const CPF_TESTE = "52998224725";

// Duas contas analisáveis e ativas do plano do razão (planoDeContasErp.ts), usadas como
// as duas pernas dos lançamentos de teste. Ids fixos: são a própria convenção do plano
// (id derivado do código), não algo inventado por este teste.
const CONTA_CAIXA = 1101; // 1.1.01 — Caixa
const CONTA_BANCO = 1102; // 1.1.02 — Conta bancária

let db: Database;
let entidade_id: number;
let periodo_id: number;

beforeEach(async () => {
  db = await criarBancoDeTeste();

  const r = criarEntidadeLegal(db, { nome: "Titular de Teste", cpf_cnpj: CPF_TESTE });
  if (!r.entidade_id) throw new Error(`Fixture não conseguiu criar a entidade: ${r.mensagem}`);
  entidade_id = r.entidade_id;

  executar(
    db,
    "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2024, 3, 'aberto')",
    [entidade_id],
  );
  periodo_id = consultar<{ id: number }>(
    db,
    "SELECT id FROM periodos_contabeis WHERE entidade_id = ? AND ano = 2024 AND mes = 3",
    [entidade_id],
  )[0].id;
});

function lancarDebito(conta_id: number, valor: number, origem_id: number) {
  registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id,
    data_lancamento: "2024-03-10",
    valor_debito: valor,
    descricao: `Débito de teste ${origem_id}`,
    origem_modulo: "manual",
    origem_id,
    referencia_documento: `TESTE-D-${origem_id}`,
  });
}

function lancarCredito(conta_id: number, valor: number, origem_id: number) {
  registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id,
    data_lancamento: "2024-03-10",
    valor_credito: valor,
    descricao: `Crédito de teste ${origem_id}`,
    origem_modulo: "manual",
    origem_id,
    referencia_documento: `TESTE-C-${origem_id}`,
  });
}

describe("encerrarPeriodo (via tela de fechamento)", () => {
  it("recusa período desbalanceado com a diferença certa, sem gravar encerramento", async () => {
    lancarDebito(CONTA_CAIXA, 1000, 1);
    lancarCredito(CONTA_BANCO, 500, 2); // sobra R$ 500 de débito sem contrapartida

    const validacao = validarBalanceamento(db, periodo_id);
    expect(validacao.balanceado).toBe(false);
    expect(validacao.diferenca).toBeCloseTo(500, 2);

    const r = await encerrarPeriodo(db, periodo_id, 1, "Tentativa de fechamento desbalanceado");

    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toContain("500.00");

    // Nem o registro de encerramento nem a mudança de status podem sobrar de uma
    // tentativa recusada — senão um período desbalanceado pareceria fechado depois.
    expect(obterUltimoEncerramento(db, periodo_id)).toBeNull();
    const periodo = listarPeriodosContabeis(db, entidade_id).find((p) => p.id === periodo_id);
    expect(periodo?.status).toBe("aberto");
  });

  it("fecha período balanceado e grava o hash em ledger_encerramentos", async () => {
    lancarDebito(CONTA_CAIXA, 1000, 1);
    lancarCredito(CONTA_BANCO, 1000, 2);

    expect(validarBalanceamento(db, periodo_id).balanceado).toBe(true);

    const r = await encerrarPeriodo(db, periodo_id, 1, "Fechamento mensal de teste");
    expect(r.sucesso).toBe(true);

    const encerramento = obterUltimoEncerramento(db, periodo_id);
    expect(encerramento).not.toBeNull();
    // SHA-256 em hexadecimal: 64 caracteres — é o hash que depois prova que o balancete
    // apresentado não foi alterado após o fechamento.
    expect(encerramento?.hash_snapshot).toMatch(/^[0-9a-f]{64}$/);
    expect(encerramento?.balancete_OK).toBe(1);
    expect(encerramento?.observacoes).toBe("Fechamento mensal de teste");
    expect(encerramento?.total_debito).toBeCloseTo(1000, 2);
    expect(encerramento?.total_credito).toBeCloseTo(1000, 2);

    const periodo = listarPeriodosContabeis(db, entidade_id).find((p) => p.id === periodo_id);
    expect(periodo?.status).toBe("fechado");
    expect(periodo?.total_debito).toBeCloseTo(1000, 2);
    expect(periodo?.total_credito).toBeCloseTo(1000, 2);
    expect(periodo?.qtd_lancamentos).toBe(2);
  });

  it("período já fechado recusa novo lançamento (PeriodoFechadoError)", async () => {
    lancarDebito(CONTA_CAIXA, 1000, 1);
    lancarCredito(CONTA_BANCO, 1000, 2);

    const r = await encerrarPeriodo(db, periodo_id, 1, "Fechamento");
    expect(r.sucesso).toBe(true);

    expect(() => lancarDebito(CONTA_CAIXA, 50, 3)).toThrow(PeriodoFechadoError);
  });
});
