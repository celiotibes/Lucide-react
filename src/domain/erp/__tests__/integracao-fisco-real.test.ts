/**
 * integracao-fisco.ts contra o schema real (criarBancoDeTeste(), não a tabela fictícia de
 * test-setup.ts / integracao-externa-completa.test.ts).
 *
 * O módulo já tinha um teste (integracao-externa-completa.test.ts), mas rodando contra
 * `test-setup.ts`: uma tabela `ledger_entries` fictícia com `origem_id`/`origem_modulo`
 * sem NOT NULL e sem o CHECK de valores permitidos, e sem o CHECK do adicional de IRPJ. Foi
 * assim que dois defeitos de fato crasháveis (origem_id ausente do INSERT, origem_modulo
 * 'fisco' fora do CHECK) e um erro de cálculo (adicional de IRPJ não-marginal) nunca
 * apareceram: o fixture antigo é mais permissivo que o banco real. Este arquivo é um
 * complemento aos testes existentes, não uma substituição — os 200+ testes de
 * integracao-externa-completa.test.ts continuam cobrindo o restante do módulo (relatórios,
 * validações) contra o fixture antigo; aqui o foco é exatamente o que só o schema real
 * revela: a gravação no razão de verdade e a regra de cálculo do IRPJ.
 */
import { describe, expect, it, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { consultar, executar } from "../../../db/connection";
import { criarEntidadeLegal } from "../entidadeLegal";
import { CONTA_CAIXA_ERP } from "../mapeamentoPlanoApp";
import {
  calcularIRPJ,
  calcularPIS,
  calcularCOFINS,
  calcularINSS,
  calcularICMS,
  calcularISS,
  registrarImpostoNoLedger,
} from "../integracao-fisco";

const CPF_TESTE = "52998224725";
const CONTA_IMPOSTOS_ERP = 5401; // "Impostos e contribuições" (despesa) — PLANO_DE_CONTAS_ERP

let db: Database;
let entidade_id: number;
let periodo_id: number;

beforeEach(async () => {
  db = await criarBancoDeTeste();
  const r = criarEntidadeLegal(db, { nome: "Titular de Teste", cpf_cnpj: CPF_TESTE });
  if (!r.entidade_id) throw new Error(`Fixture não conseguiu criar a entidade: ${r.mensagem}`);
  entidade_id = r.entidade_id;
  executar(db, "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2025, 6, 'aberto')", [
    entidade_id,
  ]);
  periodo_id = consultar<{ id: number }>(db, "SELECT id FROM periodos_contabeis WHERE ano=2025 AND mes=6")[0].id;
});

function saldoLedgerConta(conta_id: number): { debito: number; credito: number } {
  const [r] = consultar<{ d: number | null; c: number | null }>(
    db,
    "SELECT SUM(valor_debito) AS d, SUM(valor_credito) AS c FROM ledger_entries WHERE conta_id = ?",
    [conta_id],
  );
  return { debito: r?.d ?? 0, credito: r?.c ?? 0 };
}

describe("integracao-fisco: calcularIRPJ", () => {
  it("lucro real abaixo do teto de R$ 20.000: só a alíquota-base de 15%, sem adicional", () => {
    const irpj = calcularIRPJ(15000, "lucro_real");
    expect(irpj.base_calculo).toBe(15000);
    expect(irpj.valor_imposto).toBeCloseTo(15000 * 0.15, 2);
    expect(irpj.aliquota).toBeCloseTo(0.15, 4);
  });

  it("lucro real exatamente em R$ 20.000: ainda sem adicional (só '> 20000' dispara)", () => {
    const irpj = calcularIRPJ(20000, "lucro_real");
    expect(irpj.valor_imposto).toBeCloseTo(20000 * 0.15, 2);
  });

  /**
   * ACHADO (gravidade ALTA, corrigido) — ver o comentário "ACHADO" em calcularIRPJ
   * (integracao-fisco.ts). A regra real do adicional de IRPJ é MARGINAL: 15% sobre todo o
   * lucro, + 10% só sobre o que excede R$ 20.000/mês — exatamente como o docstring da
   * função já dizia. A implementação anterior aplicava 25% sobre a BASE INTEIRA assim que
   * ela passava de R$ 20.000, em vez de só sobre o excedente.
   *
   * Prova de que o defeito era real e material: para R$ 20.001 de lucro, o valor antigo
   * (20001 × 25% = R$ 5.000,25) é quase o DOBRO do valor correto (20001 × 15% + 1 × 10% =
   * R$ 3.000,25) — para qualquer lucro logo acima do teto, o contribuinte pagaria quase
   * duas vezes o IRPJ devido. Os 15% incidem sobre a BASE INTEIRA (20001, não um teto de
   * 20000) — só os 10% adicionais é que incidem apenas sobre o excedente (1); é o mesmo
   * padrão que o teste seguinte (R$ 30.000) já prova sem ambiguidade.
   */
  it("lucro real logo acima do teto (R$ 20.001): adicional de 10% incide só sobre o R$ 1 excedente, não sobre a base inteira", () => {
    const irpj = calcularIRPJ(20001, "lucro_real");
    const esperado = 20001 * 0.15 + 1 * 0.1; // 3000.15 + 0.10 = 3000.25
    expect(irpj.valor_imposto).toBeCloseTo(esperado, 2);
    expect(irpj.valor_imposto).not.toBeCloseTo(20001 * 0.25, 2); // o valor antigo, incorreto
  });

  it("lucro real bem acima do teto (R$ 30.000): 15% sobre tudo + 10% só sobre os R$ 10.000 excedentes", () => {
    const irpj = calcularIRPJ(30000, "lucro_real");
    const esperado = 30000 * 0.15 + 10000 * 0.1; // 4500 + 1000 = 5500
    expect(irpj.valor_imposto).toBeCloseTo(5500, 2);
    expect(irpj.valor_imposto).not.toBeCloseTo(30000 * 0.25, 2); // 7500 — o valor antigo, incorreto
    // Alíquota reportada passa a ser a EFETIVA (valor/base), não mais uma constante 15/25%.
    expect(irpj.aliquota).toBeCloseTo(5500 / 30000, 4);
  });

  it("lucro presumido: 8% sobre a receita bruta (default para comércio), não sobre o lucro", () => {
    const irpj = calcularIRPJ(100000, "lucro_presumido", 500000);
    expect(irpj.base_calculo).toBe(500000);
    expect(irpj.valor_imposto).toBeCloseTo(500000 * 0.08, 2);
  });

  it("simples_nacional: não apura IRPJ separadamente (DAS unificado) — base/alíquota ficam zeradas, não é um erro silencioso", () => {
    const irpj = calcularIRPJ(50000, "simples_nacional");
    expect(irpj.aliquota).toBe(0);
    expect(irpj.base_calculo).toBe(0);
    expect(irpj.valor_imposto).toBe(0);
  });
});

describe("integracao-fisco: demais tributos (fórmulas)", () => {
  it("PIS: 1,65% sobre a receita bruta", () => {
    expect(calcularPIS(200000).valor_imposto).toBeCloseTo(200000 * 0.0165, 2);
  });

  it("COFINS: 7,6% sobre a receita bruta", () => {
    expect(calcularCOFINS(200000).valor_imposto).toBeCloseTo(200000 * 0.076, 2);
  });

  it("INSS patronal: 28,8% sobre a base; empregado: 11%", () => {
    expect(calcularINSS(10000, "patrao").valor_imposto).toBeCloseTo(10000 * 0.288, 2);
    expect(calcularINSS(10000, "empregado").valor_imposto).toBeCloseTo(10000 * 0.11, 2);
  });

  it("ICMS varia por UF (SP 18%, GO 14%) e cai para 18% default numa UF desconhecida", () => {
    expect(calcularICMS(1000, "SP").aliquota).toBeCloseTo(0.18, 4);
    expect(calcularICMS(1000, "GO").aliquota).toBeCloseTo(0.14, 4);
    expect(calcularICMS(1000, "XX").aliquota).toBeCloseTo(0.18, 4);
  });

  it("ISS é 5% em todas as UFs cadastradas", () => {
    expect(calcularISS(1000, "RJ").valor_imposto).toBeCloseTo(50, 2);
  });
});

describe("integracao-fisco: registrarImpostoNoLedger (contra o schema real)", () => {
  /**
   * ACHADO (gravidade CRÍTICA, corrigido) — ver comentário "ACHADO" em
   * registrarImpostoNoLedger (integracao-fisco.ts). Contra o schema real esta função
   * quebrava com "NOT NULL constraint failed: ledger_entries.origem_id" (coluna ausente do
   * INSERT) e, mesmo corrigido isso, gravava só a perna de débito — nunca a de crédito em
   * caixa, apesar do parâmetro `conta_caixa_id` já existir na assinatura para isso.
   */
  it("lança IRPJ no razão com as DUAS pernas (débito na despesa de imposto, crédito em caixa), balanceadas", () => {
    const imposto = calcularIRPJ(50000, "lucro_real");

    const resultado = registrarImpostoNoLedger(db, entidade_id, periodo_id, imposto, CONTA_IMPOSTOS_ERP, CONTA_CAIXA_ERP);
    expect(resultado).toBeGreaterThan(0);

    const impostoConta = saldoLedgerConta(CONTA_IMPOSTOS_ERP);
    const caixaConta = saldoLedgerConta(CONTA_CAIXA_ERP);

    expect(impostoConta.debito).toBeCloseTo(imposto.valor_imposto, 2);
    expect(impostoConta.credito).toBeCloseTo(0, 2);
    expect(caixaConta.credito).toBeCloseTo(imposto.valor_imposto, 2);
    expect(caixaConta.debito).toBeCloseTo(0, 2);

    // O razão inteiro fica balanceado por este lançamento: débito total = crédito total.
    const [{ total_debito, total_credito }] = consultar<{ total_debito: number; total_credito: number }>(
      db,
      "SELECT SUM(valor_debito) AS total_debito, SUM(valor_credito) AS total_credito FROM ledger_entries WHERE entidade_id = ?",
      [entidade_id],
    );
    expect(total_debito).toBeCloseTo(total_credito, 2);

    // Ambas as linhas têm origem_id preenchido (NOT NULL na tabela real) e origem_modulo
    // 'fisco' — que precisou ser acrescentado ao CHECK de contabilidade-reconstituicao/schema.sql.
    const linhas = consultar<{ origem_id: number | null; origem_modulo: string }>(
      db,
      "SELECT origem_id, origem_modulo FROM ledger_entries WHERE entidade_id = ?",
      [entidade_id],
    );
    expect(linhas).toHaveLength(2);
    for (const linha of linhas) {
      expect(linha.origem_id).not.toBeNull();
      expect(linha.origem_modulo).toBe("fisco");
    }
  });

  it("recusa lançar num período fechado (consistente com o resto do razão)", () => {
    executar(db, "UPDATE periodos_contabeis SET status = 'fechado' WHERE id = ?", [periodo_id]);
    const imposto = calcularPIS(100000);
    expect(() =>
      registrarImpostoNoLedger(db, entidade_id, periodo_id, imposto, CONTA_IMPOSTOS_ERP, CONTA_CAIXA_ERP),
    ).toThrow(/fechado/i);
  });

  it("lança PIS e COFINS do mesmo período sem colidir, mesmo debitando a MESMA conta de despesa", () => {
    // Os dois usam a mesma conta de despesa (5401) e a mesma conta de caixa — só o tipo de
    // tributo distingue o origem_id de cada um (ver origemIdImposto). Sem essa distinção,
    // o índice único (origem_modulo, origem_id, conta_id) rejeitaria o segundo lançamento:
    // é exatamente o caso normal de um mês com vários tributos apurados juntos.
    const pis = calcularPIS(100000);
    const cofins = calcularCOFINS(100000);
    expect(registrarImpostoNoLedger(db, entidade_id, periodo_id, pis, 5401, CONTA_CAIXA_ERP)).toBeGreaterThan(0);
    expect(registrarImpostoNoLedger(db, entidade_id, periodo_id, cofins, 5401, CONTA_CAIXA_ERP)).not.toBe(0);

    const caixaConta = saldoLedgerConta(CONTA_CAIXA_ERP);
    expect(caixaConta.credito).toBeCloseTo(pis.valor_imposto + cofins.valor_imposto, 2);
  });
});
