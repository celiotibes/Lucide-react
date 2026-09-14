import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar } from "../../db/connection";
import { gerarDss } from "./dss";

async function bancoComContratoBase() {
  const db = await criarBancoDeTeste();
  executar(db, "INSERT INTO contas_bancarias (id, banco, numero, titular, tipo) VALUES (1, 'Banco Teste', '000-0', 'Célio', 'corrente')");
  executar(db, "INSERT INTO imoveis (id, apelido, tipo, financiado) VALUES (1, 'Kitnet 02', 'kitnet', 0)");
  executar(
    db,
    `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio, percentual_aluguel_efetivo)
     VALUES (1, 1, 'Gustavo Pereira Natal', 'residencial_fixo', 1539, '2026-08-29', 55)`,
  );
  return db;
}

describe("gerarDss", () => {
  it("sem sub-rubricas cadastradas, rubricasContratadas vem vazio (nunca inventa composição)", async () => {
    const db = await bancoComContratoBase();
    const resultado = gerarDss(db, 1, "2026-08-01", "2026-08-31");
    expect(resultado?.rubricasContratadas).toEqual([]);
  });

  it("traz as sub-rubricas contratadas como referência, sem somar ao gasto real (linhasDespesa)", async () => {
    // Cenário real: contrato Kitnet 02 JP (29/08/2026) itemiza a Cota de Custeio em 8
    // sub-rubricas — aqui só as 2 primeiras, para o teste ficar direto.
    const db = await bancoComContratoBase();
    executar(
      db,
      "INSERT INTO contrato_custeio_rubricas (contrato_id, referencia, descricao, percentual, valor_base) VALUES (1, '02', 'Conservação de mobiliário de áreas comuns', 4, 61.56)",
    );
    executar(
      db,
      "INSERT INTO contrato_custeio_rubricas (contrato_id, referencia, descricao, percentual, valor_base) VALUES (1, '03', 'Pequenos reparos de áreas comuns', 8, 123.12)",
    );

    const resultado = gerarDss(db, 1, "2026-08-01", "2026-08-31");

    expect(resultado?.rubricasContratadas).toHaveLength(2);
    expect(resultado?.rubricasContratadas[0]).toMatchObject({ referencia: "02", descricao: "Conservação de mobiliário de áreas comuns", percentual: 4, valor_base: 61.56 });
    // Nenhuma transação real foi lançada neste teste — o gasto real continua zerado,
    // provando que as sub-rubricas contratadas não se misturam com linhasDespesa.
    expect(resultado?.linhasDespesa).toEqual([]);
    expect(resultado?.totalDespendido).toBe(0);
  });

  it("só traz as sub-rubricas do contrato pedido, não de outro contrato", async () => {
    const db = await bancoComContratoBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, financiado) VALUES (2, 'Kitnet 16', 'kitnet', 0)");
    executar(
      db,
      `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio, percentual_aluguel_efetivo)
       VALUES (2, 2, 'Outro Locatário', 'residencial_fixo', 2490, '2026-06-27', 55)`,
    );
    executar(db, "INSERT INTO contrato_custeio_rubricas (contrato_id, descricao) VALUES (2, 'Rubrica do outro contrato')");

    const resultado = gerarDss(db, 1, "2026-08-01", "2026-08-31");
    expect(resultado?.rubricasContratadas).toEqual([]);
  });
});
