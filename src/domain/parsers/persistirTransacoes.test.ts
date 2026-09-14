import { describe, expect, it } from "vitest";
import { executar } from "../../db/connection";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { persistirTransacoes } from "./persistirTransacoes";
import type { TransacaoBruta } from "./ofx";

describe("persistirTransacoes — distingue linha malformada de duplicidade real", () => {
  it("conta separadamente uma linha com valor NaN (dado perdido) de uma duplicidade de verdade", async () => {
    const db = await criarBancoDeTeste();
    executar(db, "INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo, ativa_desde) VALUES (1, 'Banco', '1', '1', 'T', 'corrente', '2026-01-01')");

    const transacoes: TransacaoBruta[] = [
      { data: "2026-03-01", valor: 100, descricaoOriginal: "PIX", fitid: "a" },
      { data: "2026-03-02", valor: NaN, descricaoOriginal: "linha corrompida", fitid: "b" },
    ];
    const primeiroResultado = persistirTransacoes(db, 1, transacoes);
    expect(primeiroResultado.inseridas).toBe(1);
    expect(primeiroResultado.malformadas).toBe(1);
    expect(primeiroResultado.duplicadas).toBe(0);

    // Reimportar as mesmas transações: a válida agora é duplicidade (fitid já existe), a
    // malformada continua sendo malformada — nunca chega nem a tentar o INSERT.
    const segundoResultado = persistirTransacoes(db, 1, transacoes);
    expect(segundoResultado.inseridas).toBe(0);
    expect(segundoResultado.malformadas).toBe(1);
    expect(segundoResultado.duplicadas).toBe(1);
  });
});
