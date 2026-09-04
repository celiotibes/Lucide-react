import { describe, expect, it } from "vitest";
import { executar } from "../../db/connection";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { conciliar } from "./contratos";
import type { CompetenciaEsperada } from "../types";

describe("conciliar — uma transação não pode quitar duas competências", () => {
  it("não deixa um único pagamento de janeiro mascarar o calote de fevereiro", async () => {
    const db = await criarBancoDeTeste();
    executar(db, "INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo, ativa_desde) VALUES (1, 'Banco', '1', '1', 'T', 'corrente', '2026-01-01')");
    executar(db, "INSERT INTO imoveis (id, apelido, tipo) VALUES (1, 'Kitnet', 'kitnet')");
    executar(
      db,
      "INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio) VALUES (1, 1, 'Locatário', 'residencial_fixo', 1000, '2026-01-01')",
    );
    executar(
      db,
      `INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, contrato_id)
       VALUES (1, 1, '2026-01-25', 1000, 'pix aluguel', '1.1.01', 1)`,
    );

    const competencias: CompetenciaEsperada[] = [
      { contrato_id: 1, imovel_id: 1, mes_referencia: "2026-01-01", valor_esperado: 1000 },
      { contrato_id: 1, imovel_id: 1, mes_referencia: "2026-02-01", valor_esperado: 1000 },
    ];

    const excecoes = conciliar(db, competencias);

    // Só fevereiro deve virar exceção — o único PIX de 25/jan quita janeiro (mais próximo),
    // e não pode ser reaproveitado para "quitar" fevereiro também.
    expect(excecoes).toHaveLength(1);
    expect(excecoes[0].competencia.mes_referencia).toBe("2026-02-01");
  });

  it("concilia normalmente quando cada competência tem seu próprio pagamento", async () => {
    const db = await criarBancoDeTeste();
    executar(db, "INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo, ativa_desde) VALUES (1, 'Banco', '1', '1', 'T', 'corrente', '2026-01-01')");
    executar(db, "INSERT INTO imoveis (id, apelido, tipo) VALUES (1, 'Kitnet', 'kitnet')");
    executar(
      db,
      "INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio) VALUES (1, 1, 'Locatário', 'residencial_fixo', 1000, '2026-01-01')",
    );
    executar(
      db,
      `INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, contrato_id)
       VALUES (1, 1, '2026-01-10', 1000, 'pix jan', '1.1.01', 1)`,
    );
    executar(
      db,
      `INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, contrato_id)
       VALUES (2, 1, '2026-02-10', 1000, 'pix fev', '1.1.01', 1)`,
    );

    const competencias: CompetenciaEsperada[] = [
      { contrato_id: 1, imovel_id: 1, mes_referencia: "2026-01-01", valor_esperado: 1000 },
      { contrato_id: 1, imovel_id: 1, mes_referencia: "2026-02-01", valor_esperado: 1000 },
    ];

    expect(conciliar(db, competencias)).toHaveLength(0);
  });
});
