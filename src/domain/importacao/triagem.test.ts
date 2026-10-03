import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { consultar, executar } from "../../db/connection";
import { hashDoArquivo, loteExistente, provaDaTransacao, registrarLote, type LinhaBruta } from "./cofre";
import {
  aprovarLinhas,
  concluirLote,
  corrigirLinha,
  descartarLote,
  listarLinhas,
  listarLotes,
  rejeitarLinhas,
} from "./triagem";

let db: Database;

const LINHAS: LinhaBruta[] = [
  { data: "2024-03-10", valor: 2500, descricaoOriginal: "ALUGUEL KITNET 101", fitid: "A1" },
  { data: "2024-03-12", valor: -430.5, descricaoOriginal: "CONDOMINIO ED AURORA", fitid: "A2" },
  { data: "2024-03-15", valor: 1800, descricaoOriginal: "ALUGUEL KITNET 102", fitid: "A3" },
];

function registrar(linhas: LinhaBruta[] = LINHAS, hash = "hash-extrato-marco", nome = "extrato-03.ofx") {
  return registrarLote(
    db,
    { arquivo_nome: nome, arquivo_hash_sha256: hash, arquivo_bytes: 4096, tipo_detectado: "ofx", conta_id: 1 },
    linhas,
  );
}

beforeEach(async () => {
  db = await criarBancoDeTeste();
  executar(
    db,
    "INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo) VALUES (1, 'Teste', '0001', '12345', 'Titular', 'corrente')",
  );
});

describe("cofre de evidências", () => {
  it("o hash é o do conteúdo, não do nome — dois arquivos iguais batem, um byte muda tudo", async () => {
    const a = new TextEncoder().encode("OFXHEADER:100\nvalor 2500");
    const b = new TextEncoder().encode("OFXHEADER:100\nvalor 2500");
    const c = new TextEncoder().encode("OFXHEADER:100\nvalor 2501");

    expect(await hashDoArquivo(a)).toBe(await hashDoArquivo(b));
    expect(await hashDoArquivo(a)).not.toBe(await hashDoArquivo(c));
    // SHA-256 em hexadecimal: 64 caracteres.
    expect(await hashDoArquivo(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("responde de qual arquivo, em qual linha, veio um lançamento", () => {
    const { lote_id } = registrar();
    const linhas = listarLinhas(db, lote_id);
    aprovarLinhas(db, [linhas[1].id], "perito");

    const transacao_id = listarLinhas(db, lote_id)[1].transacao_id!;
    const prova = provaDaTransacao(db, transacao_id);

    expect(prova?.arquivo_nome).toBe("extrato-03.ofx");
    expect(prova?.arquivo_hash_sha256).toBe("hash-extrato-marco");
    expect(prova?.linha_numero).toBe(2);
    expect(prova?.decidido_por).toBe("perito");
  });

  it("reimportar o mesmo arquivo na mesma conta não cria segundo lote", () => {
    const primeiro = registrar();
    const segundo = registrar();

    expect(segundo.ja_existia).toBe(true);
    expect(segundo.lote_id).toBe(primeiro.lote_id);
    expect(listarLotes(db)).toHaveLength(1);
    expect(consultar(db, "SELECT id FROM importacao_linhas")).toHaveLength(3);
    expect(loteExistente(db, "hash-extrato-marco", 1)?.id).toBe(primeiro.lote_id);
  });
});

describe("triagem", () => {
  it("nenhuma linha vira transação antes de ser aprovada", () => {
    registrar();
    expect(consultar(db, "SELECT id FROM transacoes")).toHaveLength(0);
  });

  it("aprovar cria a transação e liga as duas pontas", () => {
    const { lote_id } = registrar();
    const linhas = listarLinhas(db, lote_id);

    const r = aprovarLinhas(db, linhas.map((l) => l.id));

    expect(r.aprovadas).toBe(3);
    expect(r.recusadas).toEqual([]);
    const transacoes = consultar<{ id: number; valor: number }>(db, "SELECT id, valor FROM transacoes ORDER BY data");
    expect(transacoes).toHaveLength(3);
    expect(listarLinhas(db, lote_id).every((l) => l.transacao_id !== null)).toBe(true);
  });

  it("rejeitar sem motivo é recusado — senão não se sabe por que o valor não está na contabilidade", () => {
    const { lote_id } = registrar();
    const linhas = listarLinhas(db, lote_id);

    const r = rejeitarLinhas(db, [linhas[0].id], "   ");

    expect(r.rejeitadas).toBe(0);
    expect(r.recusadas[0].motivo).toMatch(/exige um motivo/);
    expect(listarLinhas(db, lote_id)[0].status).toBe("pendente");
  });

  it("rejeitar com motivo registra o motivo e não cria transação", () => {
    const { lote_id } = registrar();
    const linhas = listarLinhas(db, lote_id);

    rejeitarLinhas(db, [linhas[0].id], "Lançamento de outra titularidade");

    const linha = listarLinhas(db, lote_id)[0];
    expect(linha.status).toBe("rejeitada");
    expect(linha.motivo).toBe("Lançamento de outra titularidade");
    expect(consultar(db, "SELECT id FROM transacoes")).toHaveLength(0);
  });

  it("linha já aprovada não pode ser rejeitada — o caminho é estorno contábil", () => {
    const { lote_id } = registrar();
    const linhas = listarLinhas(db, lote_id);
    aprovarLinhas(db, [linhas[0].id]);

    const r = rejeitarLinhas(db, [linhas[0].id], "mudei de ideia");

    expect(r.rejeitadas).toBe(0);
    expect(r.recusadas[0].motivo).toMatch(/estorno contábil/);
    expect(consultar(db, "SELECT id FROM transacoes")).toHaveLength(1);
  });
});

describe("detecção de duplicidade", () => {
  it("marca, não descarta, quando o FITID já existe", () => {
    const primeiro = registrar();
    aprovarLinhas(db, listarLinhas(db, primeiro.lote_id).map((l) => l.id));

    // Mesmo conteúdo, arquivo diferente (ex: extrato reexportado pelo banco).
    const segundo = registrar(LINHAS, "outro-hash", "extrato-03-v2.ofx");

    expect(segundo.linhas_duplicata_provavel).toBe(3);
    const linhas = listarLinhas(db, segundo.lote_id);
    expect(linhas.every((l) => l.status === "duplicata_provavel")).toBe(true);
    expect(linhas[0].duplicata_de_id).not.toBeNull();
    expect(linhas[0].motivo).toMatch(/FITID/);
  });

  it("pega CSV e PDF, que não têm FITID, por data e valor", () => {
    const primeiro = registrar();
    aprovarLinhas(db, listarLinhas(db, primeiro.lote_id).map((l) => l.id));

    // Sem fitid: é o caso que a UNIQUE(conta_id, fitid) do banco nunca pegou.
    const semFitid = LINHAS.map((l) => ({ ...l, fitid: null }));
    const segundo = registrar(semFitid, "hash-csv", "extrato-03.csv");

    expect(segundo.linhas_duplicata_provavel).toBe(3);
    expect(listarLinhas(db, segundo.lote_id)[0].motivo).toMatch(/mesma data e mesmo valor/);
  });

  it("duplicata provável ainda pode ser aprovada — o critério tem falso positivo legítimo", () => {
    const primeiro = registrar();
    aprovarLinhas(db, listarLinhas(db, primeiro.lote_id).map((l) => l.id));
    const segundo = registrar(LINHAS.map((l) => ({ ...l, fitid: null })), "hash-csv", "x.csv");

    const alvo = listarLinhas(db, segundo.lote_id)[0];
    const r = aprovarLinhas(db, [alvo.id]);

    expect(r.aprovadas).toBe(1);
    expect(consultar(db, "SELECT id FROM transacoes")).toHaveLength(4);
  });

  it("transação de outra conta não conta como duplicidade", () => {
    executar(
      db,
      "INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo) VALUES (2, 'Outro', '9', '9', 'T', 'corrente')",
    );
    const primeiro = registrar();
    aprovarLinhas(db, listarLinhas(db, primeiro.lote_id).map((l) => l.id));

    const outraConta = registrarLote(
      db,
      { arquivo_nome: "b.ofx", arquivo_hash_sha256: "h2", arquivo_bytes: 10, tipo_detectado: "ofx", conta_id: 2 },
      LINHAS,
    );

    expect(outraConta.linhas_duplicata_provavel).toBe(0);
  });
});

describe("linha malformada", () => {
  const COM_DEFEITO: LinhaBruta[] = [
    { data: "2024-03-10", valor: 2500, descricaoOriginal: "OK", fitid: "B1" },
    { data: "ilegível", valor: 100, descricaoOriginal: "DATA ILEGIVEL", fitid: "B2" },
    { data: "2024-03-11", valor: Number.NaN, descricaoOriginal: "VALOR ILEGIVEL", fitid: "B3" },
  ];

  it("fica registrada com o número da linha em vez de ser descartada", () => {
    const r = registrar(COM_DEFEITO, "hash-defeito");

    expect(r.linhas_malformadas).toBe(2);
    const malformadas = listarLinhas(db, r.lote_id, "malformada");
    expect(malformadas.map((l) => l.linha_numero)).toEqual([2, 3]);
    expect(malformadas[0].motivo).toMatch(/Ilegível no arquivo: data/);
    // O campo que o parser CONSEGUIU ler é preservado — anular os dois perderia dado.
    expect(malformadas[0].valor).toBe(100);
    expect(malformadas[1].data).toBe("2024-03-11");
    // O texto cru do extrato é preservado — é ele que permite voltar ao documento.
    expect(malformadas[0].descricao_original).toBe("DATA ILEGIVEL");
  });

  it("não pode ser aprovada", () => {
    const r = registrar(COM_DEFEITO, "hash-defeito");
    const alvo = listarLinhas(db, r.lote_id, "malformada")[0];

    const decisao = aprovarLinhas(db, [alvo.id]);

    expect(decisao.aprovadas).toBe(0);
    expect(decisao.recusadas[0].motivo).toMatch(/ilegível/);
  });

  it("corrigida, volta a pendente e pode ser aprovada", () => {
    const r = registrar(COM_DEFEITO, "hash-defeito");
    const alvo = listarLinhas(db, r.lote_id, "malformada")[0];

    expect(corrigirLinha(db, alvo.id, { data: "2024-03-20" }).sucesso).toBe(true);
    const corrigida = listarLinhas(db, r.lote_id).find((l) => l.id === alvo.id)!;
    expect(corrigida.status).toBe("pendente");
    expect(corrigida.motivo).toBeNull();

    expect(aprovarLinhas(db, [alvo.id]).aprovadas).toBe(1);
  });

  it("recusa data em formato inválido na correção", () => {
    const r = registrar(COM_DEFEITO, "hash-defeito");
    const alvo = listarLinhas(db, r.lote_id, "malformada")[0];
    expect(corrigirLinha(db, alvo.id, { data: "20/03/2024" }).sucesso).toBe(false);
  });
});

describe("fechamento do lote", () => {
  it("não conclui com linha indecisa dentro", () => {
    const { lote_id } = registrar();
    const r = concluirLote(db, lote_id);

    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/3 linha\(s\) sem decisão/);
    expect(listarLotes(db)[0].status).toBe("em_triagem");
  });

  it("conclui quando tudo foi decidido", () => {
    const { lote_id } = registrar();
    const linhas = listarLinhas(db, lote_id);
    aprovarLinhas(db, [linhas[0].id, linhas[2].id]);
    rejeitarLinhas(db, [linhas[1].id], "Despesa de terceiro");

    expect(concluirLote(db, lote_id).sucesso).toBe(true);
    const lote = listarLotes(db)[0];
    expect(lote.status).toBe("concluido");
    expect(lote.aprovadas).toBe(2);
    expect(lote.rejeitadas).toBe(1);
  });

  it("descartar mantém o que já virou transação e diz isso", () => {
    const { lote_id } = registrar();
    const linhas = listarLinhas(db, lote_id);
    aprovarLinhas(db, [linhas[0].id]);

    const r = descartarLote(db, lote_id, "Arquivo era de outra titularidade");

    expect(r.sucesso).toBe(true);
    expect(r.aprovadas_mantidas).toBe(1);
    expect(r.mensagem).toMatch(/estorno contábil/);
    expect(consultar(db, "SELECT id FROM transacoes")).toHaveLength(1);
    expect(listarLinhas(db, lote_id, "rejeitada")).toHaveLength(2);
  });

  it("descartar sem motivo é recusado", () => {
    const { lote_id } = registrar();
    expect(descartarLote(db, lote_id, "").sucesso).toBe(false);
    expect(listarLotes(db)[0].status).toBe("em_triagem");
  });
});
