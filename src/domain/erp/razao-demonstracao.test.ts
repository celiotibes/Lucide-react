import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { consultar } from "../../db/connection";
import { gerarDadosSimulados } from "../seed/dadosSimulados";
import { criarEntidadeLegal, sincronizarRazao } from "./entidadeLegal";
import { validarBalanceamento } from "./ledger";
import { CONTA_CLASSIFICACAO_PENDENTE } from "./mapeamentoPlanoApp";

/** O razão contra o conjunto de demonstração inteiro (~1100 transações geradas pelo mesmo
 * código que o botão "Carregar dados de demonstração" usa), e não só contra casos
 * montados à mão. É este teste que responde à discrepância que abriu a auditoria: Painel
 * com ~R$ 1,9 milhão e Relatórios Integrados com R$ 0,00 sobre exatamente os mesmos
 * dados, porque nada nunca atravessava de `transacoes` para `ledger_entries`. */
describe("razão sobre os dados de demonstração", () => {
  it("lança todas as transações e fecha em todos os períodos", async () => {
    const db = await criarBancoDeTeste();
    const entidade = criarEntidadeLegal(db, { nome: "Titular", cpf_cnpj: "52998224725" });
    expect(entidade.entidade_id).toBeDefined();

    const seed = gerarDadosSimulados(db);
    const r = sincronizarRazao(db, entidade.entidade_id!);

    expect(seed.transacoes).toBeGreaterThan(500); // o gerador de fato produziu volume
    expect(r.transacoes_migradas).toBe(seed.transacoes);
    expect(r.transacoes_falhadas).toBe(0);

    // Duas pernas por transação, nem uma a mais nem a menos.
    const [contagem] = consultar<{ n: number }>(db, "SELECT COUNT(*) AS n FROM ledger_entries");
    expect(contagem.n).toBe(seed.transacoes * 2);

    // Cada período tem de fechar por conta própria — é o que encerrarPeriodo() exige.
    const periodos = consultar<{ id: number; ano: number; mes: number }>(
      db,
      "SELECT id, ano, mes FROM periodos_contabeis ORDER BY ano, mes",
    );
    expect(periodos.length).toBeGreaterThan(1);
    for (const p of periodos) {
      const { balanceado, diferenca } = validarBalanceamento(db, p.id);
      expect(`${p.ano}/${p.mes}: diferença ${diferenca}`).toBe(`${p.ano}/${p.mes}: diferença 0`);
      expect(balanceado).toBe(true);
    }
  });

  it("o caixa do razão bate com a soma do extrato", async () => {
    const db = await criarBancoDeTeste();
    const { entidade_id } = criarEntidadeLegal(db, { nome: "Titular", cpf_cnpj: "52998224725" });
    gerarDadosSimulados(db);
    sincronizarRazao(db, entidade_id!);

    const [extrato] = consultar<{ total: number }>(db, "SELECT COALESCE(SUM(valor), 0) AS total FROM transacoes");
    const [caixa] = consultar<{ saldo: number }>(
      db,
      `SELECT COALESCE(SUM(valor_debito), 0) - COALESCE(SUM(valor_credito), 0) AS saldo
       FROM ledger_entries WHERE conta_id = 1101`,
    );
    expect(caixa.saldo).toBeCloseTo(extrato.total, 2);
  });

  it("nenhuma transação classificada cai na conta transitória", async () => {
    const db = await criarBancoDeTeste();
    const { entidade_id } = criarEntidadeLegal(db, { nome: "Titular", cpf_cnpj: "52998224725" });
    gerarDadosSimulados(db);
    sincronizarRazao(db, entidade_id!);

    const [pendentes] = consultar<{ n: number }>(
      db,
      "SELECT COUNT(*) AS n FROM ledger_entries WHERE conta_id = ?",
      [CONTA_CLASSIFICACAO_PENDENTE],
    );
    const [semCodigo] = consultar<{ n: number }>(
      db,
      "SELECT COUNT(*) AS n FROM transacoes WHERE plano_conta_codigo IS NULL",
    );
    // A conta transitória recebe exatamente as transações sem código — nunca uma que o
    // mapeamento deveria ter coberto e não cobriu.
    expect(pendentes.n).toBe(semCodigo.n);
  });
});
