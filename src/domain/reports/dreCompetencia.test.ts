import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar } from "../../db/connection";
import { criarEntidadeLegal, sincronizarRazao } from "../erp/entidadeLegal";
import { reclassificarTransacao } from "../reclassificacao/reclassificarTransacao";
import { compararReceitaCaixaXCompetencia } from "./dreCompetencia";

const CPF_TESTE = "52998224725";

async function bancoBase() {
  const db = await criarBancoDeTeste();
  executar(db, "INSERT INTO contas_bancarias (id, banco, numero, titular, tipo) VALUES (1, 'Banco Teste', '000-0', 'Célio', 'corrente')");
  executar(db, "INSERT INTO imoveis (id, apelido, tipo) VALUES (1, 'Kitnet 1', 'kitnet')");
  executar(
    db,
    "INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio) VALUES (1, 1, 'Fulano', 'residencial_fixo', 1000, '2026-01-01')",
  );
  const r = criarEntidadeLegal(db, { nome: "Titular de Teste", cpf_cnpj: CPF_TESTE });
  if (!r.entidade_id) throw new Error(`Fixture não conseguiu criar a entidade: ${r.mensagem}`);
  return { db, entidade_id: r.entidade_id };
}

describe("compararReceitaCaixaXCompetencia — verificação independente do defeito do núcleo ERP (soma de um lado só)", () => {
  // `receitaCaixa` vem de `SUM(t.valor)` sobre `transacoes` filtrado por
  // `t.plano_conta_codigo = '1.1.01'` — uma coluna já líquida (positivo/negativo), não um
  // par débito/crédito separado como em `ledger_entries`. Reclassificar (reclassificarTransacao.ts)
  // é um UPDATE direto nessa mesma linha, nunca um INSERT de linha reversa em `transacoes`
  // (o estorno de fato fica isolado em `ledger_entries`, fora do alcance desta query) — por
  // isso não há como uma transação "sumir" do lado antigo sem sair do novo, nem contar dobrado.
  it("uma transação de aluguel reclassificada para FORA da conta caixa some da receita de caixa (nunca fica contando duas vezes)", async () => {
    const { db, entidade_id } = await bancoBase();

    // Recebimento de aluguel, corretamente em conta caixa (1.1.01).
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, contrato_id) VALUES (1, 1, '2026-03-05', 1000, 'aluguel', '1.1.01', 1)",
    );
    sincronizarRazao(db, entidade_id);

    const antes = compararReceitaCaixaXCompetencia(db, "2026-03-01", "2026-03-31");
    const mesAntes = antes.find((l) => l.mes === "2026-03");
    expect(mesAntes?.receitaCaixa).toBe(1000);
    expect(mesAntes?.receitaCompetencia).toBe(1000);
    expect(mesAntes?.diferenca).toBe(0);

    // Reclassificado por engano para uma conta de despesa (não devia nem ter sido possível
    // na tela, mas o ponto sob teste é a query, não a validação da tela).
    const resultado = reclassificarTransacao(db, 1, "2.1.01");
    expect(resultado.sucesso).toBe(true);
    expect(resultado.razao_ajustado).toBe(true);

    const depois = compararReceitaCaixaXCompetencia(db, "2026-03-01", "2026-03-31");
    const mesDepois = depois.find((l) => l.mes === "2026-03");
    // A ASSERÇÃO CENTRAL: a receita de caixa cai a zero — não continua em 1000 (resíduo da
    // classificação antiga) nem vira -1000/2000 (dobra por algum lado não descontado).
    expect(mesDepois?.receitaCaixa).toBe(0);
    expect(mesDepois?.receitaCompetencia).toBe(1000); // competência não muda, só o caixa
    expect(mesDepois?.diferenca).toBe(1000);
  });

  it("round-trip de reclassificação (1.1.01 → outra conta → 1.1.01) devolve a receita de caixa ao valor original, sem resíduo", async () => {
    const { db, entidade_id } = await bancoBase();
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, contrato_id) VALUES (1, 1, '2026-05-05', 1000, 'aluguel', '1.1.01', 1)",
    );
    sincronizarRazao(db, entidade_id);

    reclassificarTransacao(db, 1, "2.1.01"); // sai da conta caixa
    reclassificarTransacao(db, 1, "1.1.01"); // volta para a conta caixa

    const linhas = compararReceitaCaixaXCompetencia(db, "2026-05-01", "2026-05-31");
    const mes = linhas.find((l) => l.mes === "2026-05");
    expect(mes?.receitaCaixa).toBe(1000); // não 0, não 2000 — exatamente o original
  });
});
