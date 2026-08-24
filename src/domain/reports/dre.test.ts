import { describe, expect, it } from "vitest";
import { executar } from "../../db/connection";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { aplicarRateio } from "../rateio/motorRateio";
import { gerarDre, gerarSerieMensal, resultadoLiquido } from "./dre";

describe("gerarDre — exclusão de imóvel de uso pessoal em transação rateada", () => {
  it("exclui só a fatia rateada para o imóvel de uso pessoal, não a transação rateada inteira", async () => {
    const db = await criarBancoDeTeste();
    executar(db, "INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo, ativa_desde) VALUES (1, 'Banco', '1', '1', 'T', 'corrente', '2026-01-01')");
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, uso_pessoal) VALUES (1, 'Kitnet alugada', 'kitnet', 0)");
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, uso_pessoal) VALUES (2, 'Residência própria', 'apartamento', 1)");

    // Receita de aluguel só da kitnet alugada.
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (1, 1, '2026-03-05', 1000, 'aluguel', '1.1.01', 1)",
    );
    // Condomínio do prédio, rateado 50/50 entre a kitnet alugada e a residência própria.
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (2, 1, '2026-03-10', -1000, 'condominio', '2.1.01')",
    );
    aplicarRateio(db, 2, [1, 2], "por_unidade");

    const linhas = gerarDre(db, "2026-03-01", "2026-03-31");
    const total = resultadoLiquido(linhas);

    // Só R$500 (a fatia da kitnet alugada) deve entrar como despesa — não os R$1000 inteiros.
    const despesaCondominio = linhas.find((l) => l.codigo === "2.1.01");
    expect(despesaCondominio?.total).toBe(-500);
    expect(total).toBe(500); // 1000 de receita - 500 de despesa da atividade (não 0)

    const serie = gerarSerieMensal(db, "2026-03-01", "2026-03-31");
    expect(serie[0].despesa).toBe(-500);
    expect(serie[0].receita).toBe(1000);
  });

  it("mantém no DRE agregado uma transação sem imóvel e sem rateio (ex.: salário)", async () => {
    const db = await criarBancoDeTeste();
    executar(db, "INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo, ativa_desde) VALUES (1, 'Banco', '1', '1', 'T', 'corrente', '2026-01-01')");
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, 1, '2026-03-05', -200, 'tarifa bancária', '2.1.09')",
    );

    const linhas = gerarDre(db, "2026-03-01", "2026-03-31");
    expect(linhas.find((l) => l.codigo === "2.1.09")?.total).toBe(-200);
  });
});
