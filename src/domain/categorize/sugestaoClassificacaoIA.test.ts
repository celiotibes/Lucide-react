import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { consultar, executar } from "../../db/connection";
import { criarEntidadeLegal, sincronizarRazao } from "../erp/entidadeLegal";
import { registrarChamada } from "../ia/proveniencia";
import { chamarComRoteamento } from "../ia/roteador";
import {
  gerarSugestoesPendentes,
  sugestoesPendentesPorTransacao,
  aceitarSugestao,
  rejeitarSugestao,
} from "./sugestaoClassificacaoIA";

// Nenhuma chamada de IA de verdade nestes testes — chamarComRoteamento é mockado (mesmo
// padrão de classificarComIA.test.ts, um nível abaixo: lá mocka-se `fetch`; aqui mocka-se
// o próprio roteador porque é ele quem decide provedor/modelo, e isso é irrelevante para
// este módulo). O mock ainda grava a chamada em `ia_chamadas` de verdade (via
// registrarChamada, não mockado) para os testes de proveniência serem reais.
vi.mock("../ia/roteador", () => ({ chamarComRoteamento: vi.fn() }));

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

/** Configura o mock de chamarComRoteamento para devolver `respostaTexto` desta vez,
 * gravando a chamada de verdade em ia_chamadas (registrarChamada real, não mockado) —
 * exatamente o que o roteador de verdade faz antes de devolver o resultado. */
function mockarProximaResposta(respostaTexto: string) {
  vi.mocked(chamarComRoteamento).mockImplementationOnce(async (prompt, _contexto, opcoes) => {
    const registro = registrarChamada(
      { provedor: "anthropic", modelo: "claude-haiku-4-5", motivo: "teste", sucesso: true, promptTexto: prompt },
      opcoes?.db,
    );
    return { texto: respostaTexto, provedor: "anthropic", modelo: "claude-haiku-4-5", registro };
  });
}

beforeEach(async () => {
  vi.mocked(chamarComRoteamento).mockReset();
  await prepararBanco();
});

describe("gerarSugestoesPendentes", () => {
  it("gera uma sugestão e persiste com proveniência (provedor/modelo/chamada ligados à transação)", async () => {
    inserirTransacao(1, "2024-03-15", -350, null, "CONDOMINIO EDIFICIO AURORA");
    mockarProximaResposta(
      '{"codigo":"2.1.01","confianca":"alta","explicacao":"Descrição menciona condomínio, valor típico dessa conta.","pergunta":null}',
    );

    const resultado = await gerarSugestoesPendentes(db, undefined, 10);
    expect(resultado.candidatas).toBe(1);
    expect(resultado.geradas).toBe(1);
    expect(resultado.ignoradasPorErro).toBe(0);

    const [sugestao] = consultar<{
      transacao_id: number;
      plano_conta_codigo_sugerido: string;
      confianca: string;
      explicacao: string;
      pergunta_para_decisao: string | null;
      ia_chamada_id: number | null;
      status: string;
    }>(db, "SELECT * FROM sugestoes_classificacao_ia WHERE transacao_id = 1");

    expect(sugestao.plano_conta_codigo_sugerido).toBe("2.1.01");
    expect(sugestao.confianca).toBe("alta");
    expect(sugestao.explicacao).toContain("condomínio");
    expect(sugestao.pergunta_para_decisao).toBeNull();
    expect(sugestao.status).toBe("pendente");

    // Proveniência de verdade: a sugestão aponta para uma linha real em ia_chamadas, com
    // a confiança que o modelo reportou já completada nela (mesmo padrão de
    // classificarComIA.ts/atualizarConfiancaChamada).
    expect(sugestao.ia_chamada_id).not.toBeNull();
    const [chamada] = consultar<{ provedor: string; modelo: string; confianca: string; transacao_id: number | null }>(
      db,
      "SELECT provedor, modelo, confianca, transacao_id FROM ia_chamadas WHERE id = ?",
      [sugestao.ia_chamada_id],
    );
    expect(chamada.provedor).toBe("anthropic");
    expect(chamada.modelo).toBe("claude-haiku-4-5");
    expect(chamada.confianca).toBe("alta");
    // vincularChamadaATransacao também rodou: a chamada aponta de volta para a transação.
    expect(chamada.transacao_id).toBe(1);
  });

  it("preenche pergunta_para_decisao quando o mock reporta ambiguidade, em vez de esconder atrás de confiança baixa", async () => {
    inserirTransacao(2, "2024-04-02", -3200, null, "PIX PARA JOAO SILVA");
    mockarProximaResposta(
      '{"codigo":null,"confianca":"baixa","explicacao":"Valor pode ser aluguel ou rateio de condomínio, contraparte não identificada.","pergunta":"Este PIX de R$ 3.200 pode ser aluguel OU rateio de condomínio — a qual imóvel/contrato ele corresponde?"}',
    );

    await gerarSugestoesPendentes(db, undefined, 10);

    const [sugestao] = consultar<{ plano_conta_codigo_sugerido: string | null; pergunta_para_decisao: string | null; confianca: string }>(
      db,
      "SELECT plano_conta_codigo_sugerido, pergunta_para_decisao, confianca FROM sugestoes_classificacao_ia WHERE transacao_id = 2",
    );
    expect(sugestao.confianca).toBe("baixa");
    expect(sugestao.plano_conta_codigo_sugerido).toBeNull();
    expect(sugestao.pergunta_para_decisao).toContain("aluguel OU rateio");
  });

  it("não gera sugestão para transação já classificada", async () => {
    inserirTransacao(3, "2024-01-10", -100, "2.1.01", "JA CLASSIFICADA");

    const resultado = await gerarSugestoesPendentes(db, undefined, 10);
    expect(resultado.candidatas).toBe(0);
    expect(resultado.geradas).toBe(0);
    expect(chamarComRoteamento).not.toHaveBeenCalled();
    expect(consultar(db, "SELECT * FROM sugestoes_classificacao_ia WHERE transacao_id = 3")).toHaveLength(0);
  });

  it("não duplica sugestão pendente para a mesma transação — segunda chamada não reprocessa quem já tem sugestão viva", async () => {
    inserirTransacao(4, "2024-05-01", -80, null, "TARIFA BANCARIA");
    mockarProximaResposta('{"codigo":"2.1.09","confianca":"media","explicacao":"Padrão de tarifa bancária.","pergunta":null}');

    const primeira = await gerarSugestoesPendentes(db, undefined, 10);
    expect(primeira.geradas).toBe(1);
    expect(chamarComRoteamento).toHaveBeenCalledTimes(1);

    const segunda = await gerarSugestoesPendentes(db, undefined, 10);
    expect(segunda.candidatas).toBe(0);
    expect(segunda.geradas).toBe(0);
    expect(chamarComRoteamento).toHaveBeenCalledTimes(1); // não chamou a IA de novo

    expect(consultar(db, "SELECT * FROM sugestoes_classificacao_ia WHERE transacao_id = 4")).toHaveLength(1);
  });

  it("erro da IA (rede, sem provedor) não quebra o lote — transação fica sem sugestão, sem exceção não tratada", async () => {
    inserirTransacao(5, "2024-06-01", -50, null, "DESCRICAO QUALQUER");
    vi.mocked(chamarComRoteamento).mockRejectedValueOnce(new Error("Nenhum provedor de IA está ativo."));

    const resultado = await gerarSugestoesPendentes(db, undefined, 10);
    expect(resultado.candidatas).toBe(1);
    expect(resultado.geradas).toBe(0);
    expect(resultado.ignoradasPorErro).toBe(1);
    expect(consultar(db, "SELECT * FROM sugestoes_classificacao_ia WHERE transacao_id = 5")).toHaveLength(0);
  });
});

describe("aceitarSugestao", () => {
  it("aplica a classificação de verdade no razão via reclassificarTransacao — a transação migra da conta transitória para a conta certa", async () => {
    inserirTransacao(10, "2024-03-15", -350, null, "CONDOMINIO EDIFICIO AURORA");
    sincronizarRazao(db, entidade_id); // migra pendente contra a conta transitória (1999)

    mockarProximaResposta('{"codigo":"2.1.01","confianca":"alta","explicacao":"Condomínio.","pergunta":null}');
    await gerarSugestoesPendentes(db, undefined, 10);
    const [sugestao] = consultar<{ id: number }>(db, "SELECT id FROM sugestoes_classificacao_ia WHERE transacao_id = 10");

    const resultado = aceitarSugestao(db, sugestao.id, 7);
    expect(resultado.sucesso).toBe(true);
    expect(resultado.razao_ajustado).toBe(true); // já estava no razão (transitória) — foi estornada e relançada

    const [t] = consultar<{ plano_conta_codigo: string; categorizado_por: string }>(
      db,
      "SELECT plano_conta_codigo, categorizado_por FROM transacoes WHERE id = 10",
    );
    expect(t.plano_conta_codigo).toBe("2.1.01");
    expect(t.categorizado_por).toBe("ia");

    // O razão de verdade reflete a nova conta (5210, Condomínio) — não só o rótulo do app.
    const contaCondominio = 5210;
    const [perna] = consultar<{ valor_debito: number | null; valor_credito: number | null }>(
      db,
      `SELECT valor_debito, valor_credito FROM ledger_entries
       WHERE estornado_por_id IS NULL AND conta_id = ? AND origem_modulo = 'manual' AND referencia_documento LIKE 'TXN-10-RECLASS%'`,
      [contaCondominio],
    );
    expect(perna.valor_debito).toBeCloseTo(350, 2); // saída debita a contrapartida (despesa)

    // A sugestão foi marcada decidida.
    const [sugestaoDepois] = consultar<{ status: string; decidido_por: number | null; decidido_em: string | null }>(
      db,
      "SELECT status, decidido_por, decidido_em FROM sugestoes_classificacao_ia WHERE id = ?",
      [sugestao.id],
    );
    expect(sugestaoDepois.status).toBe("aceita");
    expect(sugestaoDepois.decidido_por).toBe(7);
    expect(sugestaoDepois.decidido_em).not.toBeNull();

    // Não fica mais entre as sugestões pendentes visíveis na tela.
    expect(sugestoesPendentesPorTransacao(db, [10]).size).toBe(0);
  });

  it("recusa aceitar uma sugestão que já foi decidida", async () => {
    inserirTransacao(11, "2024-03-15", -100, null, "X");
    mockarProximaResposta('{"codigo":"2.1.01","confianca":"alta","explicacao":"X.","pergunta":null}');
    await gerarSugestoesPendentes(db, undefined, 10);
    const [sugestao] = consultar<{ id: number }>(db, "SELECT id FROM sugestoes_classificacao_ia WHERE transacao_id = 11");

    expect(aceitarSugestao(db, sugestao.id).sucesso).toBe(true);
    const segunda = aceitarSugestao(db, sugestao.id);
    expect(segunda.sucesso).toBe(false);
  });
});

describe("rejeitarSugestao", () => {
  it("marca como rejeitada e não altera a transação nem o razão", async () => {
    inserirTransacao(20, "2024-03-15", -350, null, "CONDOMINIO EDIFICIO AURORA");
    sincronizarRazao(db, entidade_id);

    mockarProximaResposta('{"codigo":"2.1.01","confianca":"media","explicacao":"Talvez condomínio.","pergunta":null}');
    await gerarSugestoesPendentes(db, undefined, 10);
    const [sugestao] = consultar<{ id: number }>(db, "SELECT id FROM sugestoes_classificacao_ia WHERE transacao_id = 20");

    const antesTransacao = consultar(db, "SELECT plano_conta_codigo, categorizado_por FROM transacoes WHERE id = 20");
    const antesLedger = consultar(db, "SELECT COUNT(*) AS n FROM ledger_entries WHERE origem_modulo='manual' AND referencia_documento LIKE 'TXN-20-RECLASS%'");

    const resultado = rejeitarSugestao(db, sugestao.id, 3, "não é bem isso");
    expect(resultado.sucesso).toBe(true);

    const depoisTransacao = consultar(db, "SELECT plano_conta_codigo, categorizado_por FROM transacoes WHERE id = 20");
    const depoisLedger = consultar(db, "SELECT COUNT(*) AS n FROM ledger_entries WHERE origem_modulo='manual' AND referencia_documento LIKE 'TXN-20-RECLASS%'");
    expect(depoisTransacao).toEqual(antesTransacao); // transação intocada
    expect(depoisLedger).toEqual(antesLedger); // nenhum lançamento novo no razão

    const [sugestaoDepois] = consultar<{ status: string; decidido_por: number | null }>(
      db,
      "SELECT status, decidido_por FROM sugestoes_classificacao_ia WHERE id = ?",
      [sugestao.id],
    );
    expect(sugestaoDepois.status).toBe("rejeitada");
    expect(sugestaoDepois.decidido_por).toBe(3);

    // Rejeitada não é mais "pendente" — some da lista que a UI consulta.
    expect(sugestoesPendentesPorTransacao(db, [20]).size).toBe(0);
  });

  it("recusa rejeitar uma sugestão que já foi decidida", async () => {
    inserirTransacao(21, "2024-03-15", -100, null, "X");
    mockarProximaResposta('{"codigo":"2.1.01","confianca":"alta","explicacao":"X.","pergunta":null}');
    await gerarSugestoesPendentes(db, undefined, 10);
    const [sugestao] = consultar<{ id: number }>(db, "SELECT id FROM sugestoes_classificacao_ia WHERE transacao_id = 21");

    expect(rejeitarSugestao(db, sugestao.id).sucesso).toBe(true);
    expect(rejeitarSugestao(db, sugestao.id).sucesso).toBe(false);
  });
});

describe("sugestoesPendentesPorTransacao", () => {
  it("devolve só as sugestões com status pendente, indexadas por transacao_id", async () => {
    inserirTransacao(30, "2024-03-15", -100, null, "A");
    inserirTransacao(31, "2024-03-16", -200, null, "B");
    mockarProximaResposta('{"codigo":"2.1.01","confianca":"alta","explicacao":"A.","pergunta":null}');
    mockarProximaResposta('{"codigo":"2.1.02","confianca":"media","explicacao":"B.","pergunta":null}');
    await gerarSugestoesPendentes(db, undefined, 10);

    const mapa = sugestoesPendentesPorTransacao(db, [30, 31, 999]);
    expect(mapa.size).toBe(2);
    expect(mapa.get(30)?.plano_conta_codigo_sugerido).toBe("2.1.01");
    expect(mapa.get(31)?.plano_conta_codigo_sugerido).toBe("2.1.02");
    expect(mapa.get(999)).toBeUndefined();
  });
});
