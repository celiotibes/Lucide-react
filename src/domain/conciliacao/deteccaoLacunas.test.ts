import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar } from "../../db/connection";
import { registrarLote } from "../importacao/cofre";
import { aprovarLinhas } from "../importacao/triagem";
import { detectarLacunas, detectarLacunasEmLotesImportados, LIMIAR_PADRAO_DIAS_SEM_MOVIMENTO } from "./deteccaoLacunas";

let db: Database;

async function prepararBanco() {
  db = await criarBancoDeTeste();
  executar(
    db,
    "INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo) VALUES (1, 'Banco Teste', '0001', '12345', 'Titular', 'corrente')",
  );
  executar(
    db,
    "INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo) VALUES (2, 'Outro Banco', '0002', '54321', 'Titular', 'corrente')",
  );
}

function inserirTransacao(id: number, data: string, valor: number, conta_id = 1) {
  executar(
    db,
    `INSERT INTO transacoes (id, conta_id, data, valor, descricao_original)
     VALUES (?, ?, ?, ?, ?)`,
    [id, conta_id, data, valor, `Transação ${id} de ${data}`],
  );
}

function informarSaldo(conta_id: number, data: string, saldo: number) {
  executar(
    db,
    `INSERT INTO extrato_saldos_informados (conta_id, data, saldo) VALUES (?, ?, ?)`,
    [conta_id, data, saldo],
  );
}

/** Datas ISO consecutivas de `inicio` (inclusive) por `quantos` dias. */
function faixaDeDias(inicio: string, quantos: number): string[] {
  const d = new Date(`${inicio}T00:00:00Z`);
  const datas: string[] = [];
  for (let i = 0; i < quantos; i++) {
    datas.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return datas;
}

describe("detectarLacunas", () => {
  beforeEach(async () => {
    await prepararBanco();
  });

  it("conta com movimento diário não gera lacuna nenhuma", () => {
    let id = 1;
    for (const data of faixaDeDias("2024-01-01", 31)) {
      inserirTransacao(id++, data, 100);
    }

    const lacunas = detectarLacunas(db, 1, "2024-01-01", "2024-01-31");
    expect(lacunas).toEqual([]);
  });

  it("20 dias de silêncio no meio gera lacuna com contexto correto", () => {
    inserirTransacao(1, "2024-01-05", 500);
    inserirTransacao(2, "2024-01-10", -200);
    // silêncio de 2024-01-11 a 2024-01-30 (20 dias) antes do próximo movimento
    inserirTransacao(3, "2024-01-31", 300);
    inserirTransacao(4, "2024-02-05", -50);

    const lacunas = detectarLacunas(db, 1, "2024-01-01", "2024-02-10");

    expect(lacunas).toHaveLength(1);
    const [lacuna] = lacunas;
    expect(lacuna.data_inicio_lacuna).toBe("2024-01-11");
    expect(lacuna.data_fim_lacuna).toBe("2024-01-30");
    expect(lacuna.dias_sem_movimento).toBe(20);
    expect(lacuna.contexto.antes).toEqual({
      data: "2024-01-10",
      valor: -200,
      descricao_original: "Transação 2 de 2024-01-10",
    });
    expect(lacuna.contexto.depois).toEqual({
      data: "2024-01-31",
      valor: 300,
      descricao_original: "Transação 3 de 2024-01-31",
    });
    expect(lacuna.severidade).toBe("normal");
  });

  it("fins de semana isolados (2-3 dias) não disparam falso positivo", () => {
    // sexta 05/01, segunda 08/01 (2 dias de silêncio: sábado e domingo)
    inserirTransacao(1, "2024-01-05", 100);
    inserirTransacao(2, "2024-01-08", 100);
    // sexta 12/01, terça 16/01 (3 dias: sáb, dom e segunda, feriado emendado)
    inserirTransacao(3, "2024-01-12", 100);
    inserirTransacao(4, "2024-01-16", 100);

    const lacunas = detectarLacunas(db, 1, "2024-01-05", "2024-01-16");
    expect(lacunas).toEqual([]);
  });

  it("respeita um limiar customizado quando informado", () => {
    inserirTransacao(1, "2024-01-01", 100);
    inserirTransacao(2, "2024-01-05", 100); // 3 dias de silêncio (02,03,04)

    expect(detectarLacunas(db, 1, "2024-01-01", "2024-01-05")).toEqual([]);
    const comLimiarBaixo = detectarLacunas(db, 1, "2024-01-01", "2024-01-05", {
      limiar_dias_sem_movimento: 2,
    });
    expect(comLimiarBaixo).toHaveLength(1);
    expect(comLimiarBaixo[0].dias_sem_movimento).toBe(3);
  });

  it("usa o limiar padrão documentado de 7 dias", () => {
    expect(LIMIAR_PADRAO_DIAS_SEM_MOVIMENTO).toBe(7);
  });

  it("lacuna que coincide com saldo informado sem transação correspondente ganha severidade alta", () => {
    inserirTransacao(1, "2024-03-01", 1000);
    inserirTransacao(2, "2024-03-25", 800);
    // saldo do extrato conferido no meio do silêncio, sem transação nenhuma que explique
    informarSaldo(1, "2024-03-15", 950);

    const lacunas = detectarLacunas(db, 1, "2024-03-01", "2024-03-31");
    expect(lacunas).toHaveLength(1);
    expect(lacunas[0].severidade).toBe("alta");
    expect(lacunas[0].saldos_informados_no_periodo).toEqual([{ data: "2024-03-15", saldo: 950 }]);
  });

  it("lacuna sem saldo informado por perto permanece com severidade normal", () => {
    inserirTransacao(1, "2024-04-01", 1000);
    inserirTransacao(2, "2024-04-25", 800);

    const lacunas = detectarLacunas(db, 1, "2024-04-01", "2024-04-30");
    expect(lacunas).toHaveLength(1);
    expect(lacunas[0].severidade).toBe("normal");
    expect(lacunas[0].saldos_informados_no_periodo).toEqual([]);
  });

  it("lacuna na borda do período busca contexto fora do intervalo pedido", () => {
    // transação bem antes do intervalo pedido, e nada dentro do intervalo até o dia 20
    inserirTransacao(1, "2023-12-01", 500);
    inserirTransacao(2, "2024-05-20", 700);

    const lacunas = detectarLacunas(db, 1, "2024-05-01", "2024-05-31");
    // a lacuna de borda vai de 2024-05-01 até 2024-05-19 (19 dias)
    const bordaInicial = lacunas.find((l) => l.data_inicio_lacuna === "2024-05-01");
    expect(bordaInicial).toBeDefined();
    expect(bordaInicial?.data_fim_lacuna).toBe("2024-05-19");
    expect(bordaInicial?.contexto.antes).toEqual({
      data: "2023-12-01",
      valor: 500,
      descricao_original: "Transação 1 de 2023-12-01",
    });
  });
});

describe("detectarLacunasEmLotesImportados", () => {
  beforeEach(async () => {
    await prepararBanco();
  });

  it("usa o intervalo real dos lotes concluídos daquela conta, não de outras contas", () => {
    // Lote concluído da conta 1: 01/06 a 10/06, com 20 dias de silêncio embutidos.
    const lote1 = registrarLote(
      db,
      { arquivo_nome: "conta1.ofx", arquivo_hash_sha256: "hash1", arquivo_bytes: 10, tipo_detectado: "ofx", conta_id: 1 },
      [
        { data: "2024-06-01", valor: 100, descricaoOriginal: "linha 1" },
        { data: "2024-06-30", valor: 100, descricaoOriginal: "linha 2" },
      ],
    );
    const linhasLote1 = db.exec("SELECT id FROM importacao_linhas WHERE lote_id = " + lote1.lote_id)[0]
      .values.map((v) => v[0] as number);
    aprovarLinhas(db, linhasLote1);
    executar(db, "UPDATE lotes_importacao SET status = 'concluido' WHERE id = ?", [lote1.lote_id]);

    // Lote concluído da conta 2, com datas bem diferentes — não deve influenciar o
    // intervalo calculado para a conta 1.
    const lote2 = registrarLote(
      db,
      { arquivo_nome: "conta2.ofx", arquivo_hash_sha256: "hash2", arquivo_bytes: 10, tipo_detectado: "ofx", conta_id: 2 },
      [
        { data: "2020-01-01", valor: 50, descricaoOriginal: "outra conta" },
        { data: "2020-01-02", valor: 50, descricaoOriginal: "outra conta" },
      ],
    );
    const linhasLote2 = db.exec("SELECT id FROM importacao_linhas WHERE lote_id = " + lote2.lote_id)[0]
      .values.map((v) => v[0] as number);
    aprovarLinhas(db, linhasLote2);
    executar(db, "UPDATE lotes_importacao SET status = 'concluido' WHERE id = ?", [lote2.lote_id]);

    const resultado = detectarLacunasEmLotesImportados(db, 1);

    expect(resultado.data_inicio).toBe("2024-06-01");
    expect(resultado.data_fim).toBe("2024-06-30");
    expect(resultado.lotes_considerados).toBe(1);
    expect(resultado.lacunas).toHaveLength(1);
    expect(resultado.lacunas[0].dias_sem_movimento).toBe(28);
  });

  it("um lote ainda em triagem não conta para o intervalo", () => {
    registrarLote(
      db,
      { arquivo_nome: "pendente.ofx", arquivo_hash_sha256: "hash3", arquivo_bytes: 10, tipo_detectado: "ofx", conta_id: 1 },
      [{ data: "2024-07-01", valor: 100, descricaoOriginal: "linha ainda em triagem" }],
    );

    const resultado = detectarLacunasEmLotesImportados(db, 1);
    expect(resultado.data_inicio).toBeNull();
    expect(resultado.data_fim).toBeNull();
    expect(resultado.lotes_considerados).toBe(0);
    expect(resultado.lacunas).toEqual([]);
  });
});
