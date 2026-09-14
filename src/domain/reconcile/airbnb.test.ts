import { describe, expect, it } from "vitest";
import { executar } from "../../db/connection";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { detectarMesesSemReceitaAirbnb } from "./airbnb";

describe("detectarMesesSemReceitaAirbnb", () => {
  it("sinaliza um mês sem nenhuma transação 1.2.01 dentro da vigência do contrato", async () => {
    const db = await criarBancoDeTeste();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo) VALUES (1, 'Kitnet Temporada', 'kitnet')");
    executar(
      db,
      "INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio, data_fim) VALUES (1, 1, 'Hóspedes diversos', 'airbnb_temporada', 0, '2026-01-01', '2026-03-31')",
    );
    executar(db, "INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo, ativa_desde) VALUES (1, 'Banco', '1', '1', 'T', 'corrente', '2026-01-01')");
    // Só janeiro e março têm receita — fevereiro fica mudo.
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (1, 1, '2026-01-10', 500, 'airbnb', '1.2.01', 1)",
    );
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (2, 1, '2026-03-15', 700, 'airbnb', '1.2.01', 1)",
    );

    const meses = detectarMesesSemReceitaAirbnb(db, "2026-01-01", "2026-03-31");
    expect(meses).toHaveLength(1);
    expect(meses[0].mesReferencia).toBe("2026-02");
  });

  it("ignora contrato residencial_fixo (não tem receita 1.2.01 esperada)", async () => {
    const db = await criarBancoDeTeste();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo) VALUES (1, 'Kitnet', 'kitnet')");
    executar(
      db,
      "INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio) VALUES (1, 1, 'Locatário', 'residencial_fixo', 1000, '2026-01-01')",
    );

    expect(detectarMesesSemReceitaAirbnb(db, "2026-01-01", "2026-03-31")).toHaveLength(0);
  });
});
