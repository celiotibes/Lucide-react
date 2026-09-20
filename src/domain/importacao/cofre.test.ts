import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar } from "../../db/connection";
import { provasDasTransacoes, registrarLote, type LinhaBruta } from "./cofre";
import { aprovarLinhas, listarLinhas } from "./triagem";

let db: Database;

const LINHAS: LinhaBruta[] = [
  { data: "2024-03-10", valor: 2500, descricaoOriginal: "ALUGUEL KITNET 101", fitid: "A1" },
  { data: "2024-03-12", valor: -430.5, descricaoOriginal: "CONDOMINIO ED AURORA", fitid: "A2" },
  { data: "2024-03-15", valor: 1800, descricaoOriginal: "ALUGUEL KITNET 102", fitid: "A3" },
];

beforeEach(async () => {
  db = await criarBancoDeTeste();
  executar(
    db,
    "INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo) VALUES (1, 'Teste', '0001', '12345', 'Titular', 'corrente')",
  );
});

describe("provasDasTransacoes (consulta em lote)", () => {
  it("devolve, numa única consulta, a prova de cada transação aprovada", () => {
    const { lote_id } = registrarLote(
      db,
      { arquivo_nome: "extrato-03.ofx", arquivo_hash_sha256: "hash-lote", arquivo_bytes: 4096, tipo_detectado: "ofx", conta_id: 1 },
      LINHAS,
    );
    const linhas = listarLinhas(db, lote_id);
    aprovarLinhas(db, [linhas[0].id, linhas[1].id], "perito");
    const idsAprovados = listarLinhas(db, lote_id)
      .filter((l) => l.transacao_id !== null)
      .map((l) => l.transacao_id!);

    const provas = provasDasTransacoes(db, idsAprovados);

    expect(provas.size).toBe(2);
    for (const id of idsAprovados) {
      const prova = provas.get(id)!;
      expect(prova.arquivo_nome).toBe("extrato-03.ofx");
      expect(prova.arquivo_hash_sha256).toBe("hash-lote");
      expect(prova.decidido_por).toBe("perito");
    }
  });

  it("transação sem linha de importação ligada não aparece no Map — ausência é a resposta, não um erro", () => {
    // Lançamento manual/demonstração: existe em `transacoes` mas nunca passou pela triagem,
    // então não há `importacao_linhas.transacao_id` apontando pra ele.
    executar(
      db,
      "INSERT INTO transacoes (conta_id, data, valor, descricao_original) VALUES (1, '2024-04-01', -100, 'Lançamento manual')",
    );
    const [{ id: idManual }] = db.exec("SELECT last_insert_rowid() as id")[0].values.map(([id]) => ({ id: id as number }));

    const provas = provasDasTransacoes(db, [idManual]);

    expect(provas.has(idManual)).toBe(false);
    expect(provas.size).toBe(0);
  });

  it("lista vazia de ids não consulta o banco e devolve Map vazio", () => {
    expect(provasDasTransacoes(db, []).size).toBe(0);
  });

  it("mistura de transações com e sem prova: só as com prova aparecem no Map", () => {
    const { lote_id } = registrarLote(
      db,
      { arquivo_nome: "extrato-04.ofx", arquivo_hash_sha256: "hash-abr", arquivo_bytes: 2048, tipo_detectado: "ofx", conta_id: 1 },
      [LINHAS[0]],
    );
    const linha = listarLinhas(db, lote_id)[0];
    aprovarLinhas(db, [linha.id]);
    const transacaoComProva = listarLinhas(db, lote_id)[0].transacao_id!;

    executar(
      db,
      "INSERT INTO transacoes (conta_id, data, valor, descricao_original) VALUES (1, '2024-04-02', -50, 'Sem origem')",
    );
    const transacaoSemProva = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0] as number;

    const provas = provasDasTransacoes(db, [transacaoComProva, transacaoSemProva]);

    expect(provas.size).toBe(1);
    expect(provas.has(transacaoComProva)).toBe(true);
    expect(provas.has(transacaoSemProva)).toBe(false);
  });
});
