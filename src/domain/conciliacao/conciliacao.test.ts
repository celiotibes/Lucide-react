import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { consultar, executar } from "../../db/connection";
import { criarEntidadeLegal, sincronizarRazao } from "../erp/entidadeLegal";
import { registrarLote } from "../importacao/cofre";
import {
  apurarConciliacao,
  registrarConciliacao,
  informarSaldoExtrato,
  obterSaldoExtratoInformado,
  listarConciliacoes,
  obterConciliacao,
} from "./conciliacao";

const CPF_TESTE = "52998224725";

let db: Database;
let entidade_id: number;

async function prepararBanco() {
  db = await criarBancoDeTeste();
  executar(
    db,
    "INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo) VALUES (1, 'Banco Teste', '0001', '12345', 'Titular', 'corrente')",
  );
  const r = criarEntidadeLegal(db, { nome: "Titular de Teste", cpf_cnpj: CPF_TESTE });
  if (!r.entidade_id) throw new Error(`Fixture não conseguiu criar a entidade: ${r.mensagem}`);
  entidade_id = r.entidade_id;
}

function inserirTransacao(id: number, data: string, valor: number, codigo: string | null, conta_id = 1) {
  executar(
    db,
    `INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, conta_id, data, valor, `Transação ${id}`, codigo],
  );
}

describe("apurarConciliacao", () => {
  beforeEach(async () => {
    await prepararBanco();
  });

  it("fecha exatamente quando extrato, transações e razão batem", () => {
    inserirTransacao(1, "2024-03-10", 2500, "1.1.01"); // aluguel recebido
    inserirTransacao(2, "2024-03-15", -430.5, "2.1.01"); // condomínio pago
    sincronizarRazao(db, entidade_id);

    const apuracao = apurarConciliacao(db, 1, "2024-03-31", 2069.5);

    expect(apuracao.saldo_transacoes).toBeCloseTo(2069.5, 2);
    expect(apuracao.saldo_razao).toBeCloseTo(2069.5, 2);
    expect(apuracao.diferenca_extrato_razao).toBeCloseTo(0, 2);
    expect(apuracao.fechada_sem_diferenca).toBe(true);
    expect(apuracao.itens).toEqual([]);
  });

  it("diferença causada por transação não migrada ao razão fecha exatamente por ela", () => {
    inserirTransacao(1, "2024-03-10", 2500, "1.1.01");
    sincronizarRazao(db, entidade_id); // migra só a transação 1

    inserirTransacao(2, "2024-03-15", -430.5, "2.1.01"); // entra DEPOIS da sincronização — fica sem perna no razão

    const apuracao = apurarConciliacao(db, 1, "2024-03-31", 2069.5);

    expect(apuracao.saldo_transacoes).toBeCloseTo(2069.5, 2);
    expect(apuracao.saldo_razao).toBeCloseTo(2500, 2); // só a que foi migrada
    expect(apuracao.diferenca_transacoes_razao).toBeCloseTo(-430.5, 2);
    // extrato bate com as transações (o extrato real já tem os dois lançamentos) — a
    // diferença está só entre transações e razão.
    expect(apuracao.diferenca_extrato_transacoes).toBeCloseTo(0, 2);

    const item = apuracao.itens.find((i) => i.tipo === "nao_lancada_no_razao");
    expect(item).toBeDefined();
    expect(item?.quantidade).toBe(1);
    expect(item?.valor).toBeCloseTo(-430.5, 2);
    expect(item?.afeta_diferenca).toBe(true);
    expect(apuracao.detalhes.nao_lancada_no_razao.map((d) => d.id)).toEqual([2]);

    // Nenhum outro item, e nenhum resíduo — a única causa é a transação não migrada.
    expect(apuracao.itens.every((i) => i.tipo === "nao_lancada_no_razao")).toBe(true);
    expect(apuracao.fechada_sem_diferenca).toBe(false);
  });

  it("diferença causada por linha ainda em triagem (não aprovada) fecha exatamente por ela", () => {
    // Nenhuma transação ainda — só uma linha de extrato importada e não decidida.
    const resultado = registrarLote(
      db,
      { arquivo_nome: "extrato.ofx", arquivo_hash_sha256: "hash-teste", arquivo_bytes: 100, tipo_detectado: "ofx", conta_id: 1 },
      [{ data: "2024-04-05", valor: 850, descricaoOriginal: "PIX recebido" }],
    );
    expect(resultado.linhas_registradas).toBe(1);

    const apuracao = apurarConciliacao(db, 1, "2024-04-30", 850);

    expect(apuracao.saldo_transacoes).toBe(0);
    expect(apuracao.saldo_razao).toBe(0);
    expect(apuracao.diferenca_extrato_transacoes).toBeCloseTo(850, 2);

    const item = apuracao.itens.find((i) => i.tipo === "triagem_pendente");
    expect(item).toBeDefined();
    expect(item?.quantidade).toBe(1);
    expect(item?.valor).toBeCloseTo(850, 2);
    expect(item?.afeta_diferenca).toBe(true);
    expect(apuracao.detalhes.triagem_pendente).toHaveLength(1);
    expect(apuracao.detalhes.triagem_pendente[0].status).toBe("pendente");

    // Sem resíduo — a triagem pendente explica a diferença por completo.
    expect(apuracao.itens.some((i) => i.tipo === "residual_nao_identificado")).toBe(false);
    expect(apuracao.fechada_sem_diferenca).toBe(false);
  });

  it("transação na conta transitória (1.9.99) é informativa e não afeta a diferença", () => {
    inserirTransacao(1, "2024-04-01", 777, null); // sem plano_conta_codigo -> classificação pendente
    sincronizarRazao(db, entidade_id);

    const apuracao = apurarConciliacao(db, 1, "2024-04-30", 777);

    expect(apuracao.fechada_sem_diferenca).toBe(true); // o caixa está certo mesmo sem classificar
    const item = apuracao.itens.find((i) => i.tipo === "classificacao_pendente");
    expect(item).toBeDefined();
    expect(item?.afeta_diferenca).toBe(false);
    expect(item?.quantidade).toBe(1);
  });

  it("diferença sem causa identificada aparece como item residual explícito, nunca escondida", () => {
    inserirTransacao(1, "2024-05-10", 1000, "1.1.01");
    sincronizarRazao(db, entidade_id);

    // Saldo do extrato digitado errado/diferente por um motivo não modelado (ex: erro de
    // digitação, lançamento fora do fluxo) — nada na triagem nem no razão explica.
    const apuracao = apurarConciliacao(db, 1, "2024-05-31", 1050);

    const residual = apuracao.itens.find((i) => i.tipo === "residual_nao_identificado");
    expect(residual).toBeDefined();
    expect(residual?.valor).toBeCloseTo(50, 2);
    expect(residual?.afeta_diferenca).toBe(true);
    expect(apuracao.fechada_sem_diferenca).toBe(false);
  });

  describe("sinal correto em saída e entrada", () => {
    it("entrada (crédito no banco) é positiva no saldo das transações e do razão", () => {
      inserirTransacao(1, "2024-06-01", 1200, "1.1.01");
      sincronizarRazao(db, entidade_id);

      const apuracao = apurarConciliacao(db, 1, "2024-06-30", 1200);

      expect(apuracao.saldo_transacoes).toBe(1200);
      expect(apuracao.saldo_razao).toBe(1200);
      expect(apuracao.fechada_sem_diferenca).toBe(true);
    });

    it("saída (débito no banco) é NEGATIVA no saldo das transações e do razão, não invertida", () => {
      inserirTransacao(1, "2024-06-05", -900, "2.1.01");
      sincronizarRazao(db, entidade_id);

      const apuracao = apurarConciliacao(db, 1, "2024-06-30", -900);

      expect(apuracao.saldo_transacoes).toBe(-900);
      expect(apuracao.saldo_razao).toBe(-900); // se o sinal fosse invertido aqui, daria +900
      expect(apuracao.fechada_sem_diferenca).toBe(true);
    });

    it("entrada e saída juntas resultam no líquido correto, não na soma dos módulos", () => {
      inserirTransacao(1, "2024-06-01", 2000, "1.1.01"); // entrada
      inserirTransacao(2, "2024-06-10", -700, "2.1.01"); // saída
      sincronizarRazao(db, entidade_id);

      const apuracao = apurarConciliacao(db, 1, "2024-06-30", 1300);

      expect(apuracao.saldo_transacoes).toBe(1300); // 2000 - 700, não 2700
      expect(apuracao.saldo_razao).toBe(1300);
      expect(apuracao.fechada_sem_diferenca).toBe(true);
    });
  });
});

describe("informarSaldoExtrato / obterSaldoExtratoInformado", () => {
  beforeEach(async () => {
    await prepararBanco();
  });

  it("grava e recupera o saldo informado", () => {
    const r = informarSaldoExtrato(db, { conta_id: 1, data: "2024-03-31", saldo: 2069.5, informado_por: "Fulano" });
    expect(r.sucesso).toBe(true);

    const salvo = obterSaldoExtratoInformado(db, 1, "2024-03-31");
    expect(salvo?.saldo).toBeCloseTo(2069.5, 2);
    expect(salvo?.informado_por).toBe("Fulano");
  });

  it("reinformar a mesma conta+data corrige o valor, não duplica", () => {
    informarSaldoExtrato(db, { conta_id: 1, data: "2024-03-31", saldo: 1000 });
    informarSaldoExtrato(db, { conta_id: 1, data: "2024-03-31", saldo: 1500 });

    const linhas = consultar<{ n: number }>(
      db,
      "SELECT COUNT(*) as n FROM extrato_saldos_informados WHERE conta_id = 1 AND data = '2024-03-31'",
    );
    expect(linhas[0].n).toBe(1);
    expect(obterSaldoExtratoInformado(db, 1, "2024-03-31")?.saldo).toBe(1500);
  });

  it("recusa data fora do formato AAAA-MM-DD", () => {
    const r = informarSaldoExtrato(db, { conta_id: 1, data: "31/03/2024", saldo: 100 });
    expect(r.sucesso).toBe(false);
  });

  it("recusa conta bancária inexistente", () => {
    const r = informarSaldoExtrato(db, { conta_id: 999, data: "2024-03-31", saldo: 100 });
    expect(r.sucesso).toBe(false);
  });
});

describe("registrarConciliacao / listarConciliacoes / obterConciliacao", () => {
  beforeEach(async () => {
    await prepararBanco();
  });

  it("registra a conciliação e a decomposição fica auditável depois", () => {
    inserirTransacao(1, "2024-03-10", 2500, "1.1.01");
    sincronizarRazao(db, entidade_id);
    inserirTransacao(2, "2024-03-15", -430.5, "2.1.01"); // fica sem migrar de propósito

    const apuracao = apurarConciliacao(db, 1, "2024-03-31", 2069.5);
    const r = registrarConciliacao(db, apuracao, { realizada_por: "Perito" });

    expect(r.sucesso).toBe(true);
    expect(r.conciliacao_id).toBeDefined();

    const registrado = obterConciliacao(db, r.conciliacao_id!);
    expect(registrado).not.toBeNull();
    expect(registrado?.conciliacao.saldo_transacoes).toBeCloseTo(2069.5, 2);
    expect(registrado?.conciliacao.fechada_sem_diferenca).toBe(false);
    expect(registrado?.conciliacao.realizada_por).toBe("Perito");

    const item = registrado?.itens.find((i) => i.tipo === "nao_lancada_no_razao");
    expect(item).toBeDefined();
    expect(item?.referencias).toEqual([2]);

    // O saldo do extrato também fica salvo, independente da conciliação.
    expect(obterSaldoExtratoInformado(db, 1, "2024-03-31")?.saldo).toBeCloseTo(2069.5, 2);
  });

  it("listarConciliacoes traz as conciliações da conta, mais recente primeiro", () => {
    inserirTransacao(1, "2024-03-10", 1000, "1.1.01");
    sincronizarRazao(db, entidade_id);

    registrarConciliacao(db, apurarConciliacao(db, 1, "2024-03-10", 1000));
    inserirTransacao(2, "2024-04-05", 500, "1.1.01");
    sincronizarRazao(db, entidade_id);
    registrarConciliacao(db, apurarConciliacao(db, 1, "2024-04-30", 1500));

    const lista = listarConciliacoes(db, 1);
    expect(lista).toHaveLength(2);
    expect(lista[0].data_corte).toBe("2024-04-30");
    expect(lista[1].data_corte).toBe("2024-03-10");
  });
});
