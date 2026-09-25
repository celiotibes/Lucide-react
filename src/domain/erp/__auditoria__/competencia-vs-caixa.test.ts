import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { executar, consultar } from "../../../db/connection";
import { criarEntidadeLegal, sincronizarRazao } from "../entidadeLegal";
import { gerarDRE } from "../relatorios-integrados";

/**
 * ACHADO estrutural (gravidade MODERADA — lacuna de modelagem, não conta errada):
 * o sistema não distingue "data do documento/competência" de "data do extrato/caixa".
 *
 * `transacoes` (contabilidade-reconstituicao/schema.sql) tem uma única coluna de data:
 * `data DATE NOT NULL`, preenchida pelo parser com a data em que o dinheiro se moveu no
 * extrato bancário. `migracao-ledger.ts` usa essa MESMA data, sem alternativa, tanto como
 * `data_lancamento` do razão quanto para decidir o PERÍODO CONTÁBIL do lançamento
 * ("A data manda na competência" — comentário do próprio arquivo). Não existe campo para
 * "data do documento" (a data do boleto/nota) separado da "data do extrato" (quando o
 * dinheiro efetivamente saiu ou entrou).
 *
 * Efeito para um laudo pericial: um boleto de condomínio referente a dezembro, pago em
 * janeiro, é reconhecido 100% em janeiro — nunca em dezembro. Não há como o sistema
 * reconstituir regime de competência real (a despesa pertence ao mês do FATO GERADOR, não
 * ao mês do pagamento); o que existe é regime de caixa disfarçado de "competência" pelo
 * nome do campo `data_lancamento`. Para uma reconstituição contábil pericial — que
 * frequentemente precisa mostrar a QUE MÊS uma despesa se refere, não só quando foi paga —
 * essa distinção pode mudar o resultado de um mês específico sob disputa.
 *
 * Como reproduzir: `npx vitest run src/domain/erp/__auditoria__/competencia-vs-caixa.test.ts`.
 *
 * Onde corrigir: não é um bug pontual — é lacuna de schema. Precisaria de uma coluna
 * adicional em `transacoes` (ex.: `data_competencia`) opcionalmente preenchida na triagem
 * (importacao/triagem.ts::corrigirLinha já tem o padrão de correção manual de campo), e
 * migracao-ledger.ts passaria a usar `data_competencia ?? data` para decidir o período —
 * mantendo `data_lancamento`/data do extrato como está, para o fluxo de caixa continuar
 * correto em regime de caixa.
 */
describe("migracao-ledger: não distingue competência (documento) de caixa (extrato)", () => {
  it.fails("uma despesa de condomínio referente a dezembro, paga em janeiro, deveria poder ser reconhecida na competência de dezembro", async () => {
    const db = await criarBancoDeTeste();
    const { entidade_id } = criarEntidadeLegal(db, { nome: "Titular", cpf_cnpj: "52998224725" });

    executar(
      db,
      `INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo) VALUES (1, 'Teste', '0001', '12345', 'Titular', 'corrente')`,
    );
    // Boleto de condomínio "referente a Dezembro/2024", mas pago (data do extrato) em
    // janeiro de 2025 — o caso clássico de descasamento entre competência e caixa.
    executar(
      db,
      `INSERT INTO transacoes (conta_id, data, valor, descricao_original, plano_conta_codigo)
       VALUES (1, '2025-01-05', -450, 'CONDOMINIO REF DEZEMBRO/2024', '2.1.01')`,
    );

    sincronizarRazao(db, entidade_id!);

    const periodoDezembro = consultar<{ id: number }>(
      db,
      "SELECT id FROM periodos_contabeis WHERE entidade_id = ? AND ano = 2024 AND mes = 12",
      [entidade_id!],
    )[0];

    // Não existe nem período de dezembro/2024 criado (o sistema só cria o período de
    // janeiro/2025, a data do EXTRATO) — a despesa não pode, de forma alguma, compor o
    // resultado do mês a que realmente se refere.
    expect(periodoDezembro).toBeDefined();
    const dreDezembro = gerarDRE(db, entidade_id!, periodoDezembro?.id ?? -1);
    expect(dreDezembro.custos.condominio).toBeCloseTo(450, 2);
  });
});
