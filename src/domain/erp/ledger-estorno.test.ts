import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar, consultar } from "../../db/connection";
import { criarEntidadeLegal, sincronizarRazao } from "./entidadeLegal";
import { estornarLancamento } from "./ledger";

/**
 * Este arquivo existe por causa de um defeito que EU introduzi e que nenhum teste pegou.
 *
 * Ao consertar o razão, troquei `UNIQUE (origem_modulo, origem_id)` — que só deixava passar
 * UMA perna por documento e portanto impedia partida dobrada — por
 * `UNIQUE (origem_modulo, origem_id, conta_id)` como constraint de tabela. A partida dobrada
 * passou a funcionar, e com ela 1122 transações entraram no razão com os períodos fechando.
 *
 * O que não percebi: `estornarLancamento()` monta a reversão com
 * `INSERT ... SELECT entidade_id, periodo_id, conta_id, ... origem_modulo, origem_id ...`,
 * copiando do original exatamente a tripla da chave nova. Toda chamada morria com
 * "UNIQUE constraint failed", nas duas pernas. Ou seja: o estorno — a única forma contábil
 * legítima de desfazer um lançamento, e a peça de que a reclassificação depende — estava
 * quebrado para TODOS os módulos, e a suíte não notava porque os fixtures que exercitavam
 * estorno montavam a tabela à mão, sem a constraint do schema real.
 *
 * A correção: a unicidade não é mais constraint de tabela, é o índice parcial
 * idx_ledger_origem_unica, que indexa a mesma tripla mas exclui as linhas mortas — a
 * reversão (estorno_de_id IS NOT NULL) e o original já revertido (estornado_por_id IS NOT
 * NULL). Continua barrando reimportação duplicada; para de barrar estorno e relançamento.
 *
 * Os testes abaixo usam `criarBancoDeTeste()`, que roda o schema.sql de verdade. Um teste de
 * estorno sobre tabela montada à mão não prova nada sobre produção — foi assim que o defeito
 * sobreviveu.
 */
describe("estorno contra o schema real", () => {
  async function bancoComRazao() {
    const db = await criarBancoDeTeste();
    executar(
      db,
      "INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo) VALUES (1,'T','0001','1','T','corrente')",
    );
    const { entidade_id } = criarEntidadeLegal(db, { nome: "Titular Teste", cpf_cnpj: "52998224725" });
    executar(
      db,
      `INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo)
       VALUES (1, 1, '2024-03-10', 2500, 'Aluguel recebido', '1.1.01')`,
    );
    sincronizarRazao(db, entidade_id!);
    const pernas = consultar<{ id: number; conta_id: number }>(
      db,
      "SELECT id, conta_id FROM ledger_entries WHERE origem_modulo = 'transacoes' AND origem_id = 1 ORDER BY id",
    );
    return { db, entidade_id: entidade_id!, pernas };
  }

  it("estorna as DUAS pernas da partida dobrada sem bater na unicidade da origem", async () => {
    const { db, pernas } = await bancoComRazao();
    expect(pernas).toHaveLength(2); // débito no caixa, crédito na contrapartida

    for (const perna of pernas) {
      expect(estornarLancamento(db, perna.id, "teste de regressão", 1)).toBe(true);
    }

    const [total] = consultar<{ n: number }>(db, "SELECT COUNT(*) AS n FROM ledger_entries");
    expect(total.n).toBe(4); // 2 originais + 2 reversões
  });

  it("liga original e reversão nos dois sentidos, e a reversão inverte débito e crédito", async () => {
    const { db, pernas } = await bancoComRazao();
    const original = pernas[0];
    estornarLancamento(db, original.id, "motivo registrado", 7);

    const [par] = consultar<{
      debito_original: number | null;
      credito_original: number | null;
      debito_estorno: number | null;
      credito_estorno: number | null;
      motivo: string | null;
      volta_para: number | null;
      criado_por: number | null;
    }>(
      db,
      `SELECT o.valor_debito AS debito_original, o.valor_credito AS credito_original,
              e.valor_debito AS debito_estorno, e.valor_credito AS credito_estorno,
              o.motivo_estorno AS motivo, e.estorno_de_id AS volta_para, e.criado_por
         FROM ledger_entries o
         JOIN ledger_entries e ON e.id = o.estornado_por_id
        WHERE o.id = ?`,
      [original.id],
    );

    expect(par).toBeDefined();
    expect(par.volta_para).toBe(original.id); // vínculo inverso, o que distingue estorno de duplicata
    expect(par.motivo).toBe("motivo registrado");
    expect(par.criado_por).toBe(7);
    expect(par.debito_estorno ?? null).toBe(par.credito_original ?? null);
    expect(par.credito_estorno ?? null).toBe(par.debito_original ?? null);
  });

  it("depois de estornar, aceita RELANÇAR a mesma origem na mesma conta (caso da reclassificação)", async () => {
    const { db, entidade_id, pernas } = await bancoComRazao();
    const caixa = pernas[0];
    estornarLancamento(db, caixa.id, "reclassificação", 1);

    // A perna de caixa de uma reclassificação volta na MESMA conta (só a contrapartida
    // muda). Com a constraint de tabela anterior isso era impossível, o que tornava a
    // reclassificação irreparável no razão.
    const relancar = () =>
      executar(
        db,
        `INSERT INTO ledger_entries
           (entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, descricao,
            origem_modulo, origem_id, referencia_documento)
         SELECT entidade_id, periodo_id, conta_id, data_lancamento, 2500,
                'Relançamento após reclassificação', origem_modulo, origem_id,
                referencia_documento || '-R2'
           FROM ledger_entries WHERE id = ?`,
        [caixa.id],
      );
    expect(relancar).not.toThrow();
  });

  it("continua barrando reimportação duplicada: mesma origem, mesma conta, nada estornado", async () => {
    const { db, pernas } = await bancoComRazao();
    const duplicar = () =>
      executar(
        db,
        `INSERT INTO ledger_entries
           (entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, descricao,
            origem_modulo, origem_id, referencia_documento)
         SELECT entidade_id, periodo_id, conta_id, data_lancamento, valor_debito,
                'Duplicata', origem_modulo, origem_id, referencia_documento || '-DUP'
           FROM ledger_entries WHERE id = ?`,
        [pernas[0].id],
      );
    expect(duplicar).toThrow(/UNIQUE/i);
  });

  it("estorno de lançamento inexistente devolve false em vez de gravar lixo", async () => {
    const { db } = await bancoComRazao();
    const [antes] = consultar<{ n: number }>(db, "SELECT COUNT(*) AS n FROM ledger_entries");
    expect(estornarLancamento(db, 999999, "não existe", 1)).toBe(false);
    const [depois] = consultar<{ n: number }>(db, "SELECT COUNT(*) AS n FROM ledger_entries");
    expect(depois.n).toBe(antes.n);
  });
});
