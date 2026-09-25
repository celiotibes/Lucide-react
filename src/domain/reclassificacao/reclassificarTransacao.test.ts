import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { consultar, executar } from "../../db/connection";
import { criarEntidadeLegal, sincronizarRazao } from "../erp/entidadeLegal";
import { CONTA_CAIXA_ERP, MAPA_APP_PARA_ERP, CONTA_CLASSIFICACAO_PENDENTE } from "../erp/mapeamentoPlanoApp";
import { validarBalanceamento } from "../erp/ledger";
import {
  reclassificarTransacao,
  reclassificarTransacoesEmLote,
  historicoRazaoDaTransacao,
} from "./reclassificarTransacao";

const CPF_TESTE = "52998224725";

let db: Database;
let entidade_id: number;

async function prepararBanco() {
  db = await criarBancoDeTeste();
  executar(
    db,
    "INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo) VALUES (1, 'Teste', '0001', '12345', 'Titular', 'corrente')",
  );
  const r = criarEntidadeLegal(db, { nome: "Titular de Teste", cpf_cnpj: CPF_TESTE });
  if (!r.entidade_id) throw new Error(`Fixture não conseguiu criar a entidade: ${r.mensagem}`);
  entidade_id = r.entidade_id;
}

function inserirTransacao(id: number, data: string, valor: number, codigo: string | null, descricao = `Transação ${id}`) {
  executar(
    db,
    `INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo)
     VALUES (?, 1, ?, ?, ?, ?)`,
    [id, data, valor, descricao, codigo],
  );
}

function pernasAtivas(transacaoId: number) {
  // Pernas SEM estorno (o estado "atual" do razão para esta transação), como qualquer
  // relatório (DRE, balancete) enxergaria ao somar o saldo de uma conta.
  return consultar<{ conta_id: number; valor_debito: number | null; valor_credito: number | null; periodo_id: number }>(
    db,
    `SELECT conta_id, valor_debito, valor_credito, periodo_id FROM ledger_entries
     WHERE estornado_por_id IS NULL
       AND (
         (origem_modulo = 'transacoes' AND origem_id = ?)
         OR (origem_modulo = 'manual' AND referencia_documento LIKE ?)
       )
     ORDER BY conta_id`,
    [transacaoId, `TXN-${transacaoId}-RECLASS%`],
  );
}

function saldoConta(contaId: number) {
  const [s] = consultar<{ d: number; c: number }>(
    db,
    "SELECT COALESCE(SUM(valor_debito),0) AS d, COALESCE(SUM(valor_credito),0) AS c FROM ledger_entries WHERE conta_id = ?",
    [contaId],
  );
  return (s.d || 0) - (s.c || 0);
}

describe("reclassificarTransacao — reproduz e corrige o defeito 1", () => {
  beforeEach(async () => {
    await prepararBanco();
  });

  it("CENÁRIO EXATO DO RELATO: despesa (5210) reclassificada para capex/ativo (1205) — o razão reflete a nova classificação após re-sincronizar", () => {
    inserirTransacao(1, "2024-03-15", -1000, "2.1.01"); // Condomínio — despesa, conta 5210
    sincronizarRazao(db, entidade_id);

    const contaAntiga = MAPA_APP_PARA_ERP["2.1.01"]; // 5210
    const contaNova = MAPA_APP_PARA_ERP["2.1.03"]; // 1205, capex/ativo
    expect(contaAntiga).toBe(5210);
    expect(contaNova).toBe(1205);

    // Antes da correção: o razão está na despesa, como esperado.
    expect(pernasAtivas(1).find((l) => l.conta_id === contaAntiga)).toBeTruthy();
    expect(saldoConta(contaAntiga)).toBeCloseTo(1000, 2); // débito de despesa

    const resultado = reclassificarTransacao(db, 1, "2.1.03");
    expect(resultado.sucesso).toBe(true);
    expect(resultado.razao_ajustado).toBe(true);

    // Sem isso o defeito original reaparece: rodar a sincronização de novo não deve mudar
    // nada (idempotência), mas TAMBÉM não pode desfazer a correção.
    const sync2 = sincronizarRazao(db, entidade_id);
    expect(sync2.transacoes_migradas).toBe(0);
    expect(sync2.transacoes_ja_migradas).toBe(1);

    // A ASSERÇÃO CENTRAL: o razão agora reflete a classificação nova.
    const ativas = pernasAtivas(1);
    expect(ativas.find((l) => l.conta_id === contaNova)).toBeTruthy();

    // A perna ORIGINAL da migração (a que classificou errado) está estornada — continua
    // existindo como registro histórico, mas marcada, não mais "a classificação atual".
    const [original] = consultar<{ estornado_por_id: number | null }>(
      db,
      "SELECT estornado_por_id FROM ledger_entries WHERE origem_modulo='transacoes' AND origem_id=1 AND conta_id=?",
      [contaAntiga],
    );
    expect(original.estornado_por_id).not.toBeNull();

    // A despesa antiga (5210) voltou a zero — o estorno cancelou o valor errado (a soma da
    // perna original + a perna de estorno, ambas em 5210, é zero); o capex (1205) recebeu
    // o valor certo, como débito de ativo (imóvel entrando no patrimônio).
    expect(saldoConta(contaAntiga)).toBeCloseTo(0, 2);
    expect(saldoConta(contaNova)).toBeCloseTo(1000, 2);

    // transacoes.plano_conta_codigo (o que a tela mostra) bate com o razão.
    const [t] = consultar<{ plano_conta_codigo: string }>(db, "SELECT plano_conta_codigo FROM transacoes WHERE id = 1");
    expect(t.plano_conta_codigo).toBe("2.1.03");

    // A trilha existe e é auditável: dá pra ver a despesa original, o estorno dela e o
    // novo lançamento no capex, cada um com sua própria descrição e sem apagar nada.
    const historico = historicoRazaoDaTransacao(db, 1);
    expect(historico.length).toBe(3); // original (estornada) + estorno + novo
    expect(historico[0].conta_id).toBe(contaAntiga);
    expect(historico[0].estornado_por_id).not.toBeNull();
    expect(historico.some((h) => h.descricao.startsWith("ESTORNO"))).toBe(true);
    expect(historico.some((h) => h.descricao.startsWith("RECLASSIFICAÇÃO"))).toBe(true);

    // O razão inteiro continua fechado (débito == crédito) — o estorno não pode ter
    // deixado o período desbalanceado.
    const periodos = consultar<{ id: number }>(db, "SELECT id FROM periodos_contabeis");
    for (const p of periodos) {
      expect(validarBalanceamento(db, p.id).balanceado).toBe(true);
    }

    // A perna de CAIXA nunca foi tocada — mesmo id, mesmo valor, sempre.
    const [caixa] = consultar<{ n: number }>(
      db,
      "SELECT COUNT(*) AS n FROM ledger_entries WHERE origem_modulo='transacoes' AND origem_id=1 AND conta_id=?",
      [CONTA_CAIXA_ERP],
    );
    expect(caixa.n).toBe(1);
  });

  it("PROVA DE QUE O TESTE PEGA O BUG: sem o estorno (UPDATE direto + re-sincronizar), o razão fica divergente", () => {
    inserirTransacao(1, "2024-03-15", -1000, "2.1.01");
    sincronizarRazao(db, entidade_id);
    const contaAntiga = MAPA_APP_PARA_ERP["2.1.01"];
    const contaNova = MAPA_APP_PARA_ERP["2.1.03"];

    // Simula o defeito original: UPDATE direto na tela, sem passar pela reclassificação.
    executar(db, "UPDATE transacoes SET plano_conta_codigo = ? WHERE id = 1", ["2.1.03"]);
    sincronizarRazao(db, entidade_id); // idempotente — não faz nada, é exatamente o defeito

    // O razão continua na conta ERRADA — reproduz literalmente o que o relato descreveu.
    expect(saldoConta(contaAntiga)).toBeCloseTo(1000, 2);
    expect(saldoConta(contaNova)).toBeCloseTo(0, 2);
  });

  it("transação ainda não migrada: reclassificar só atualiza o rótulo, não mexe no razão (nada para estornar)", () => {
    inserirTransacao(1, "2024-03-15", -500, "2.1.01");
    // NÃO sincroniza — a transação nunca chegou ao razão.

    const r = reclassificarTransacao(db, 1, "2.1.02");
    expect(r.sucesso).toBe(true);
    expect(r.razao_ajustado).toBe(false);
    const [t] = consultar<{ plano_conta_codigo: string }>(db, "SELECT plano_conta_codigo FROM transacoes WHERE id = 1");
    expect(t.plano_conta_codigo).toBe("2.1.02");
    expect(consultar(db, "SELECT * FROM ledger_entries").length).toBe(0);
  });

  it("transação pendente (sem código) migrada para a conta transitória, depois classificada: o razão sai de 1.9.99", () => {
    inserirTransacao(1, "2024-04-01", 777, null);
    sincronizarRazao(db, entidade_id);
    expect(saldoConta(CONTA_CLASSIFICACAO_PENDENTE)).toBeCloseTo(-777, 2); // crédito de entrada não classificada... natureza debito na verdade

    const r = reclassificarTransacao(db, 1, "1.1.01");
    expect(r.sucesso).toBe(true);
    expect(r.razao_ajustado).toBe(true);
    expect(saldoConta(CONTA_CLASSIFICACAO_PENDENTE)).toBeCloseTo(0, 2);
    expect(saldoConta(MAPA_APP_PARA_ERP["1.1.01"])).toBeCloseTo(-777, 2); // crédito de receita
  });

  it("ida e volta (A→B→A) não colide com a UNIQUE constraint do razão", () => {
    inserirTransacao(1, "2024-03-15", -1000, "2.1.01");
    sincronizarRazao(db, entidade_id);

    const r1 = reclassificarTransacao(db, 1, "2.1.02");
    expect(r1.sucesso).toBe(true);
    const r2 = reclassificarTransacao(db, 1, "2.1.01"); // volta pra conta original
    expect(r2.sucesso).toBe(true);
    expect(r2.razao_ajustado).toBe(true);
    const r3 = reclassificarTransacao(db, 1, "2.1.02"); // e de novo
    expect(r3.sucesso).toBe(true);

    expect(saldoConta(MAPA_APP_PARA_ERP["2.1.01"])).toBeCloseTo(0, 2);
    expect(saldoConta(MAPA_APP_PARA_ERP["2.1.02"])).toBeCloseTo(1000, 2);
    const historico = historicoRazaoDaTransacao(db, 1);
    expect(historico.length).toBe(7); // original + 3×(estorno+novo)
  });

  it("período fechado: a correção não toca o período fechado, é lançada no período aberto corrente", () => {
    inserirTransacao(1, "2024-03-15", -1000, "2.1.01");
    sincronizarRazao(db, entidade_id);

    executar(db, "UPDATE periodos_contabeis SET status = 'fechado' WHERE entidade_id = ? AND ano = 2024 AND mes = 3", [entidade_id]);

    const antes = consultar<{ estornado_por_id: number | null }>(
      db,
      "SELECT estornado_por_id FROM ledger_entries WHERE periodo_id = (SELECT id FROM periodos_contabeis WHERE ano=2024 AND mes=3) AND conta_id = ?",
      [MAPA_APP_PARA_ERP["2.1.01"]],
    );
    expect(antes[0].estornado_por_id).toBeNull();

    const r = reclassificarTransacao(db, 1, "2.1.02");
    expect(r.sucesso).toBe(true);
    expect(r.razao_ajustado).toBe(true);
    expect(r.periodo_correcao_id).toBeDefined();
    expect(r.periodo_correcao_id).not.toBe(r.periodo_original_id);

    // O período fechado permanece intocado como registro histórico: a linha antiga segue
    // lá, agora marcada como estornada (o estorno mora no período NOVO, não nele).
    const linhaFechada = consultar<{ status: string }>(
      db,
      "SELECT status FROM periodos_contabeis WHERE id = ?",
      [r.periodo_original_id],
    )[0];
    expect(linhaFechada.status).toBe("fechado");

    // O lançamento de estorno e o novo caíram no período de correção, que está aberto.
    const [periodoCorrecao] = consultar<{ status: string }>(db, "SELECT status FROM periodos_contabeis WHERE id = ?", [r.periodo_correcao_id]);
    expect(periodoCorrecao.status).toBe("aberto");

    // Balanceamento preservado nos dois períodos.
    expect(validarBalanceamento(db, r.periodo_original_id!).balanceado).toBe(true);
    expect(validarBalanceamento(db, r.periodo_correcao_id!).balanceado).toBe(true);
  });

  it("reclassificar para o mesmo código não faz nada (idempotente)", () => {
    inserirTransacao(1, "2024-03-15", -1000, "2.1.01");
    sincronizarRazao(db, entidade_id);
    const r = reclassificarTransacao(db, 1, "2.1.01");
    expect(r.sucesso).toBe(true);
    expect(r.razao_ajustado).toBe(false);
    expect(historicoRazaoDaTransacao(db, 1).length).toBe(1); // só a original, nada estornado
  });
});

describe("reclassificarTransacoesEmLote — tudo ou nada", () => {
  beforeEach(async () => {
    await prepararBanco();
  });

  it("reclassifica várias transações numa única transação de banco", () => {
    inserirTransacao(1, "2024-03-10", 1000, "1.1.01");
    inserirTransacao(2, "2024-03-11", -200, "2.1.01");
    inserirTransacao(3, "2024-03-12", -300, "2.1.02");
    sincronizarRazao(db, entidade_id);

    const r = reclassificarTransacoesEmLote(db, [
      { transacao_id: 1, novo_codigo: "1.2.01" },
      { transacao_id: 2, novo_codigo: "2.1.03" },
      { transacao_id: 3, novo_codigo: "2.1.04" },
    ]);

    expect(r.sucesso).toBe(true);
    expect(r.processadas).toBe(3);
    expect(r.razao_ajustadas).toBe(3);
    expect(saldoConta(MAPA_APP_PARA_ERP["1.2.01"])).toBeCloseTo(-1000, 2); // crédito de receita
    expect(saldoConta(MAPA_APP_PARA_ERP["2.1.03"])).toBeCloseTo(200, 2);
    expect(saldoConta(MAPA_APP_PARA_ERP["2.1.04"])).toBeCloseTo(300, 2);
  });

  it("uma falha no meio do lote reverte TUDO — nenhuma transação fica pela metade", () => {
    inserirTransacao(1, "2024-03-10", 1000, "1.1.01");
    inserirTransacao(2, "2024-03-11", -200, "2.1.01");
    sincronizarRazao(db, entidade_id);

    const r = reclassificarTransacoesEmLote(db, [
      { transacao_id: 1, novo_codigo: "1.2.01" },
      { transacao_id: 999999, novo_codigo: "2.1.03" }, // não existe — força a falha
      { transacao_id: 2, novo_codigo: "2.1.04" },
    ]);

    expect(r.sucesso).toBe(false);
    // Nada foi alterado: transação 1 continua na classificação original no razão.
    const [t1] = consultar<{ plano_conta_codigo: string }>(db, "SELECT plano_conta_codigo FROM transacoes WHERE id = 1");
    expect(t1.plano_conta_codigo).toBe("1.1.01");
    expect(saldoConta(MAPA_APP_PARA_ERP["1.1.01"])).toBeCloseTo(-1000, 2);
    expect(saldoConta(MAPA_APP_PARA_ERP["1.2.01"])).toBeCloseTo(0, 2);
  });
});
