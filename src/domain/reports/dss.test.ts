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

  it("ACHADO (regressão): condomínio/manutenção RATEADO entre kitnets do mesmo prédio conta no gasto real do imóvel, não só a transação lançada direto nele", async () => {
    // Cenário real: uma conta de condomínio do prédio (R$1000) é rateada 60%/40% entre a
    // Kitnet 02 (id 1, deste contrato) e outra unidade (id 2) — a transação em si fica sem
    // imóvel direto (t.imovel_id = NULL, convenção de transação rateada — ver dre.ts), e a
    // fatia de cada imóvel mora na tabela `rateios`. Antes da correção, `linhasDespesa` e
    // `totalDespendido` ignoravam essa fatia por completo (só olhavam t.imovel_id = ?),
    // fazendo o DSS reportar um "superávit" que não existe de verdade.
    const db = await bancoComContratoBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, financiado) VALUES (2, 'Kitnet 16', 'kitnet', 0)");
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (10, 1, '2026-08-15', -1000, 'CONDOMINIO PREDIO', '2.1.01')",
    );
    executar(
      db,
      "INSERT INTO rateios (transacao_id, imovel_id, criterio, percentual, valor_rateado, base_incompleta) VALUES (10, 1, 'fracao_ideal', 0.6, -600, 0)",
    );
    executar(
      db,
      "INSERT INTO rateios (transacao_id, imovel_id, criterio, percentual, valor_rateado, base_incompleta) VALUES (10, 2, 'fracao_ideal', 0.4, -400, 0)",
    );
    // Também uma transação de arrecadação de rateio (aluguel), para o saldo não ficar
    // artificialmente positivo por não ter arrecadado nada.
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, contrato_id) VALUES (11, 1, '2026-08-10', 1539, 'PIX ALUGUEL', '1.1.01', 1)",
    );

    const resultado = gerarDss(db, 1, "2026-08-01", "2026-08-31");

    // 60% dos R$1000 rateados (R$600) devem entrar no gasto real da Kitnet 02, não zero.
    expect(resultado?.totalDespendido).toBe(600);
    expect(resultado?.linhasDespesa).toEqual([{ codigo: "2.1.01", descricao: "Condomínio e IPTU", total: 600 }]);
    // arrecadado = 1539 * (1 - 55/100) = 692.55; saldo = 692.55 - 600 = 92.55 (superávit real).
    expect(resultado?.saldoValor).toBeCloseTo(692.55 - 600, 6);
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
