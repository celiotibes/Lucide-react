import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar } from "../../db/connection";
import { criarEntidadeLegal, sincronizarRazao } from "../erp/entidadeLegal";
import { reclassificarTransacao } from "../reclassificacao/reclassificarTransacao";
import { calcularDesempenhoPorImovel, agruparDesempenhoPorCidade } from "./desempenhoPorImovel";

const CPF_TESTE = "52998224725";

async function bancoBase() {
  const db = await criarBancoDeTeste();
  executar(db, "INSERT INTO contas_bancarias (id, banco, numero, titular, tipo) VALUES (1, 'Banco Teste', '000-0', 'Célio', 'corrente')");
  executar(db, "INSERT INTO imoveis (id, apelido, tipo, cidade) VALUES (1, 'Kitnet 1', 'kitnet', 'Florianópolis')");
  const r = criarEntidadeLegal(db, { nome: "Titular de Teste", cpf_cnpj: CPF_TESTE });
  if (!r.entidade_id) throw new Error(`Fixture não conseguiu criar a entidade: ${r.mensagem}`);
  return { db, entidade_id: r.entidade_id };
}

describe("calcularDesempenhoPorImovel — verificação independente do defeito do núcleo ERP (soma de um lado só)", () => {
  // Este módulo lê `transacoes`/`rateios` (coluna `valor` única, já líquida por natureza),
  // nunca `ledger_entries` (débito/crédito em colunas separadas) — por isso não pode ter o
  // MESMO defeito de relatorios-integrados.ts (SUM(valor_debito) OU SUM(valor_credito) sem
  // descontar o lado oposto): não existe "lado oposto" na coluna `valor`. O risco análogo
  // aqui seria uma reclassificação (reclassificarTransacao.ts) deixar RESÍDUO — a
  // classificação antiga contando de novo, ou a nova contando em dobro. reclassificarTransacao
  // corrige por UPDATE direto em `transacoes.plano_conta_codigo` (nunca por INSERT de uma
  // linha reversa nessa tabela — o estorno fica isolado em `ledger_entries`, que este módulo
  // nem consulta), então o teste abaixo prova que não há duplicação nem resíduo.
  it("uma despesa reclassificada (com estorno no razão) não conta em dobro nem fica resquício na categoria antiga", async () => {
    const { db, entidade_id } = await bancoBase();

    // Condomínio de R$800 classificado (errado) em Condomínio (2.1.01).
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (1, 1, '2026-03-10', -800, 'condominio', '2.1.01', 1)",
    );
    // Receita de aluguel R$2000 no mesmo imóvel/mês, para ter uma base de comparação.
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (2, 1, '2026-03-05', 2000, 'aluguel', '1.1.01', 1)",
    );
    sincronizarRazao(db, entidade_id);

    const antes = calcularDesempenhoPorImovel(db, "2026-03-01", "2026-03-31")[0];
    expect(antes.despesa).toBeCloseTo(800, 2);
    expect(antes.receita).toBeCloseTo(2000, 2);
    expect(antes.resultadoLiquido).toBeCloseTo(1200, 2);

    // Reclassifica: a transação inteira, na verdade, era Prestadores de serviço (2.1.04),
    // não Condomínio (2.1.01) — o ponto sob teste é o estorno/relançamento em si, não o
    // motivo de negócio da reclassificação.
    const resultado = reclassificarTransacao(db, 1, "2.1.04");
    expect(resultado.sucesso).toBe(true);
    expect(resultado.razao_ajustado).toBe(true);

    const depois = calcularDesempenhoPorImovel(db, "2026-03-01", "2026-03-31")[0];
    // A ASSERÇÃO CENTRAL: a despesa total continua R$800 — nem dobrou (o defeito do
    // núcleo teria deixado R$800 em Condomínio E mais R$800 em Prestadores de serviço,
    // virando R$1600) nem sumiu.
    expect(depois.despesa).toBeCloseTo(800, 2);
    expect(depois.resultadoLiquido).toBeCloseTo(1200, 2);

    const cidades = agruparDesempenhoPorCidade(calcularDesempenhoPorImovel(db, "2026-03-01", "2026-03-31"));
    expect(cidades[0].despesa).toBeCloseTo(800, 2);
    expect(cidades[0].resultadoLiquido).toBeCloseTo(1200, 2);
  });

  it("um round-trip de reclassificação (A → B → A) devolve a despesa ao valor original, sem resíduo acumulado", async () => {
    const { db, entidade_id } = await bancoBase();
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (1, 1, '2026-04-10', -500, 'condominio', '2.1.01', 1)",
    );
    sincronizarRazao(db, entidade_id);

    reclassificarTransacao(db, 1, "2.1.04"); // A -> B
    reclassificarTransacao(db, 1, "2.1.01"); // B -> A (volta à classificação original)

    const linhas = calcularDesempenhoPorImovel(db, "2026-04-01", "2026-04-30")[0];
    expect(linhas.despesa).toBeCloseTo(500, 2); // não 1000, não 1500 — exatamente o original
  });
});
