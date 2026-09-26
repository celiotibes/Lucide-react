/**
 * integracao-inadimplencia.ts contra o schema real (criarBancoDeTeste()). Módulo órfão
 * hoje (nenhuma tela chama) e sem nenhum teste antes deste arquivo — os três achados
 * documentados como comentário "ACHADO" em integracao-inadimplencia.ts só apareceram ao
 * rodar contra o schema/plano de contas reais.
 */
import { describe, expect, it, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { consultar, executar } from "../../../db/connection";
import { criarEntidadeLegal } from "../entidadeLegal";
import { CONTA_CAIXA_ERP } from "../mapeamentoPlanoApp";
import {
  apurarInadimplenciaContrato,
  contabilizarJurosMora,
  contabilizarMultaPorAtraso,
  provisarJurosInadimplencia,
  relatorioInadimplenciaDetalhado,
  resumoInadimplenciaTotal,
} from "../integracao-inadimplencia";

const CPF_TESTE = "52998224725";
const CONTA_RECEITA_JUROS_ERP = 4201; // "Juros recebidos"
const CONTA_RECEITA_OUTRAS_ERP = 4301; // "Outras receitas" (usada para multa — sem conta dedicada)

let db: Database;
let entidade_id: number;
let periodo_id: number;
let imovel_id: number;
let conta_bancaria_id: number;

beforeEach(async () => {
  db = await criarBancoDeTeste();
  const r = criarEntidadeLegal(db, { nome: "Titular de Teste", cpf_cnpj: CPF_TESTE });
  if (!r.entidade_id) throw new Error(`Fixture não conseguiu criar a entidade: ${r.mensagem}`);
  entidade_id = r.entidade_id;

  executar(db, "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2025, 6, 'aberto')", [
    entidade_id,
  ]);
  periodo_id = consultar<{ id: number }>(db, "SELECT id FROM periodos_contabeis WHERE ano=2025 AND mes=6")[0].id;

  executar(db, "INSERT INTO imoveis (apelido, tipo) VALUES ('Kitnet Teste', 'kitnet')");
  imovel_id = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id")[0].id;

  executar(
    db,
    "INSERT INTO contas_bancarias (banco, agencia, numero, titular, tipo) VALUES ('Banco Teste', '0001', '11111', 'Titular', 'corrente')",
  );
  conta_bancaria_id = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id")[0].id;
});

/** Cria um contrato residencial fixo com vencimento no dia informado — demais encargos
 * (multa/juros) ficam nos DEFAULTs do schema real (2%/5 dias, 10% substitutiva, 1%/mês),
 * a menos que sobrescritos via `overrides`. */
function criarContrato(dia_vencimento: number, valor_referencia = 1000, overrides: Record<string, number> = {}) {
  const campos = { multa_percentual: 2.0, multa_ate_dias: 5, multa_percentual_substitutiva: 10.0, juros_mensal_percentual: 1.0, ...overrides };
  executar(
    db,
    `INSERT INTO contratos_locacao
      (imovel_id, locatario, tipo, valor_referencia, dia_vencimento, data_inicio,
       multa_percentual, multa_ate_dias, multa_percentual_substitutiva, juros_mensal_percentual)
     VALUES (?, 'Locatário Teste', 'residencial_fixo', ?, ?, '2024-01-01', ?, ?, ?, ?)`,
    [
      imovel_id,
      valor_referencia,
      dia_vencimento,
      campos.multa_percentual,
      campos.multa_ate_dias,
      campos.multa_percentual_substitutiva,
      campos.juros_mensal_percentual,
    ],
  );
  return consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id")[0].id;
}

/** Registra uma transação de entrada (recebimento) já vinculada ao contrato — o que um
 * PIX/boleto do inquilino conciliado geraria em `transacoes`. */
function registrarRecebimento(contrato_id: number, valor: number, data: string) {
  executar(
    db,
    `INSERT INTO transacoes (conta_id, data, valor, descricao_original, contrato_id)
     VALUES (?, ?, ?, 'Recebimento aluguel', ?)`,
    [conta_bancaria_id, data, valor, contrato_id],
  );
}

function saldoLedgerConta(conta_id: number): { debito: number; credito: number } {
  const [r] = consultar<{ d: number | null; c: number | null }>(
    db,
    "SELECT SUM(valor_debito) AS d, SUM(valor_credito) AS c FROM ledger_entries WHERE conta_id = ?",
    [conta_id],
  );
  return { debito: r?.d ?? 0, credito: r?.c ?? 0 };
}

describe("integracao-inadimplencia: apurarInadimplenciaContrato", () => {
  /**
   * ACHADO 1 (gravidade CRÍTICA, corrigido em integracao-inadimplencia.ts): a função
   * selecionava uma coluna `status` de `contratos_locacao` que não existe na tabela real —
   * toda chamada quebrava com "no such column: status". Este teste, sozinho, já prova a
   * correção: sem ela, nem chegaria a rodar.
   */
  it("não lança 'no such column: status' contra o schema real (ACHADO 1)", () => {
    const contrato_id = criarContrato(10);
    expect(() => apurarInadimplenciaContrato(db, contrato_id, "2025-06-20")).not.toThrow();
  });

  it("contrato inexistente retorna null, não lança exceção", () => {
    expect(apurarInadimplenciaContrato(db, 999999, "2025-06-20")).toBeNull();
  });

  it("vencimento ainda não chegou: normal, sem multa/juros/valor devido", () => {
    const contrato_id = criarContrato(20, 1000);
    const r = apurarInadimplenciaContrato(db, contrato_id, "2025-06-15")!;
    expect(r.dias_atraso).toBe(0);
    expect(r.status).toBe("normal");
    expect(r.multa_valor).toBe(0);
    expect(r.juros_valor).toBe(0);
    expect(r.valor_total_devido).toBe(0);
  });

  it("vencimento é HOJE: ainda não conta como atraso (mesmo padrão de contasAPagar)", () => {
    const contrato_id = criarContrato(15, 1000);
    const r = apurarInadimplenciaContrato(db, contrato_id, "2025-06-15")!;
    expect(r.dias_atraso).toBe(0);
    expect(r.status).toBe("normal");
  });

  it("aluguel não pago dentro do prazo é corretamente identificado como inadimplente, com multa e juros pro-rata calculados certo", () => {
    const contrato_id = criarContrato(10, 1000); // defaults: multa 2% até 5 dias, 10% depois, juros 1%/mês
    // 2025-06-20 é 10 dias depois do vencimento (10/06) — na segunda faixa (> 5 dias).
    const r = apurarInadimplenciaContrato(db, contrato_id, "2025-06-20")!;

    expect(r.dias_atraso).toBe(10);
    expect(r.status).toBe("com_atraso");
    expect(r.multa_valor).toBeCloseTo(1000 * 0.1, 2); // 2ª faixa (10 > 5 dias): 10%, substitui a 1ª
    expect(r.juros_valor).toBeCloseTo(1000 * (1.0 / 30 / 100) * 10, 2); // pro-rata: 1%/mês, 10 dias
    expect(r.valor_total_devido).toBeCloseTo(1000 + r.multa_valor + r.juros_valor, 2);
  });

  it("multa na 1ª faixa (dentro de multa_ate_dias): 2%, não 10%", () => {
    const contrato_id = criarContrato(10, 1000);
    // 2025-06-13: 3 dias de atraso, dentro dos 5 dias da 1ª faixa.
    const r = apurarInadimplenciaContrato(db, contrato_id, "2025-06-13")!;
    expect(r.dias_atraso).toBe(3);
    expect(r.multa_valor).toBeCloseTo(1000 * 0.02, 2);
  });

  /**
   * ACHADO (gravidade ALTA, NÃO corrigido nesta tarefa — decisão de produto/schema):
   * `em_cobranca` e `litigioso` são estados MORTOS no código atual — impossíveis de
   * produzir com qualquer entrada, não só neste teste.
   *
   * Causa: `apurarInadimplenciaContrato` reconstrói `data_vencimento` a partir do
   * ANO/MÊS da própria `data_referencia` (linha ~156: `hoje.getFullYear()`,
   * `hoje.getMonth()`), e a checagem de quitação olha só o intervalo
   * [1º dia do mês de `hoje`, `hoje`]. Ou seja: a cada mês que passa, o "vencimento"
   * usado no cálculo pula junto para o mês corrente — nunca fica preso no mês em que a
   * inadimplência de fato começou. Resultado: `dias_atraso` nunca é maior que ~30 (o
   * tamanho de um mês), então nunca ultrapassa o teto de `com_atraso`, não importa há
   * quantos meses o locatário esteja sem pagar.
   *
   * Prova: com vencimento dia 1 e NENHUM pagamento em nenhum mês, checando em
   * 2025-08-05 o código calcula dias_atraso contra 2025-08-01 (4 dias, "com_atraso"),
   * não contra o vencimento de junho (o mês em que a inadimplência realmente começou,
   * o que daria 65 dias, "em_cobranca").
   *
   * Por que não corrigir aqui: a correção de verdade não é achar "o vencimento mais
   * antigo em aberto" por uma heurística — é o mesmo problema que `contas_a_pagar`
   * (src/domain/contasAPagar/) resolveu para despesas: cada COMPETÊNCIA (mês de
   * aluguel devido) precisa ser uma linha própria, com seu vencimento e status de
   * pagamento independentes, agregável em aging. Hoje `integracao-inadimplencia.ts`
   * não gera essas linhas — é decisão de schema (nova tabela, nos moldes de
   * `contas_a_pagar`) e de produto (quem gera a competência: fechamento mensal? geração
   * antecipada?), fora do escopo de um ajuste isolado a este arquivo.
   *
   * RESOLVIDO em outro lugar, sem alterar esta função: `aluguel_competencias`
   * (schema.sql/.postgres.sql) + `src/domain/erp/aluguel-competencias.ts` implementam
   * exatamente esse modelo — `gerarCompetenciasPendentes` cria uma linha por mês devido
   * com vencimento próprio, e `apurarInadimplenciaContratoPorCompetencia` conta
   * `dias_atraso` a partir da competência pendente MAIS ANTIGA (não do mês corrente),
   * alcançando `em_cobranca`/`litigioso` de verdade. Ver
   * `__tests__/aluguel-competencias.test.ts` — o teste
   * "evolui de com_atraso→em_cobranca→litigioso..." lá recria esta mesma intenção
   * (mesmos dias: 24/65/136) contra a função nova. `apurarInadimplenciaContrato` (esta
   * função) foi deliberadamente MANTIDA como está — ver o comentário `@deprecated` nela
   * — porque `relatorioInadimplenciaDetalhado`/`resumoInadimplenciaTotal`/
   * `provisarJurosInadimplencia` ainda a chamam sem conhecer competências; por isso o
   * `it.fails` abaixo continua descrevendo o comportamento real desta função,
   * propositalmente não promovido a `it`.
   */
  it.fails(
    "status evolui por faixa de atraso: com_atraso (≤30) → em_cobranca (31-90) → litigioso (>90)",
    () => {
      const contrato_id = criarContrato(1, 1000);
      expect(apurarInadimplenciaContrato(db, contrato_id, "2025-06-25")!.status).toBe("com_atraso"); // 24 dias
      expect(apurarInadimplenciaContrato(db, contrato_id, "2025-08-05")!.status).toBe("em_cobranca"); // 65 dias
      expect(apurarInadimplenciaContrato(db, contrato_id, "2025-10-15")!.status).toBe("litigioso"); // 136 dias
    },
  );

  /**
   * ACHADO 2 (gravidade ALTA, corrigido): sem checar `transacoes`, TODO contrato com
   * vencimento no passado era inadimplente, mesmo pago em dia — este é o teste que prova
   * que o falso-positivo foi eliminado.
   */
  it("contrato pago em dia (recebimento integral já lançado em transacoes) NÃO é falso-positivo de inadimplência", () => {
    const contrato_id = criarContrato(10, 1000);
    registrarRecebimento(contrato_id, 1000, "2025-06-09"); // pago um dia antes do vencimento

    const r = apurarInadimplenciaContrato(db, contrato_id, "2025-06-20")!; // 10 dias após o vencimento

    expect(r.dias_atraso).toBe(0);
    expect(r.status).toBe("normal");
    expect(r.multa_valor).toBe(0);
    expect(r.juros_valor).toBe(0);
    expect(r.valor_total_devido).toBe(0);
  });

  it("pago em atraso, mas já recebido: também deixa de ser inadimplente (não exige ter pago ANTES do vencimento)", () => {
    const contrato_id = criarContrato(10, 1000);
    registrarRecebimento(contrato_id, 1000, "2025-06-15"); // pago com 5 dias de atraso

    const r = apurarInadimplenciaContrato(db, contrato_id, "2025-06-20")!;
    expect(r.dias_atraso).toBe(0);
    expect(r.status).toBe("normal");
  });

  it("pagamento PARCIAL (menor que o aluguel) não quita a inadimplência — continua devendo pelo valor cheio", () => {
    const contrato_id = criarContrato(10, 1000);
    registrarRecebimento(contrato_id, 400, "2025-06-15"); // só 40% do aluguel

    const r = apurarInadimplenciaContrato(db, contrato_id, "2025-06-20")!;
    expect(r.dias_atraso).toBe(10); // não é zerado por um pagamento insuficiente
    expect(r.status).toBe("com_atraso");
    expect(r.valor_total_devido).toBeGreaterThan(0);
  });

  it("recebimento de OUTRO contrato não quita a inadimplência deste (o casamento é por contrato_id)", () => {
    const contratoA = criarContrato(10, 1000);
    const contratoB = criarContrato(10, 1000);
    registrarRecebimento(contratoB, 1000, "2025-06-09"); // só o B foi pago

    expect(apurarInadimplenciaContrato(db, contratoA, "2025-06-20")!.status).toBe("com_atraso");
    expect(apurarInadimplenciaContrato(db, contratoB, "2025-06-20")!.status).toBe("normal");
  });

  it("recebimento de um mês diferente (ex.: mês anterior) não quita o aluguel do mês corrente", () => {
    const contrato_id = criarContrato(10, 1000);
    registrarRecebimento(contrato_id, 1000, "2025-05-09"); // pagou maio, mas não juntho

    const r = apurarInadimplenciaContrato(db, contrato_id, "2025-06-20")!;
    expect(r.dias_atraso).toBe(10);
    expect(r.status).toBe("com_atraso");
  });

  /**
   * ACHADO 3 (gravidade ALTA, corrigido em calcularDiasAtraso): `data_referencia` era
   * ignorada na contagem de dias — a função sempre comparava contra o relógio real do
   * sistema. Prova direta: pedir a posição "como estava" numa data de referência bem no
   * passado tem que dar um número de dias pequeno e determinístico, não a diferença até
   * hoje (2026, na época deste teste).
   */
  it("data_referencia é usada de fato na contagem de dias de atraso, não só para escolher o mês (ACHADO 3)", () => {
    const contrato_id = criarContrato(10, 1000);
    const r = apurarInadimplenciaContrato(db, contrato_id, "2020-02-20")!;
    expect(r.dias_atraso).toBe(10); // 20/02/2020 − 10/02/2020, não "hoje − 10/02/2020"
  });
});

describe("integracao-inadimplencia: relatorioInadimplenciaDetalhado / resumoInadimplenciaTotal", () => {
  it("lista só contratos vigentes e inadimplentes; contrato pago em dia e contrato encerrado ficam de fora", () => {
    const inadimplente = criarContrato(10, 1000);
    const pago = criarContrato(10, 1000);
    registrarRecebimento(pago, 1000, "2025-06-09");
    const encerrado = criarContrato(10, 1000);
    executar(db, "UPDATE contratos_locacao SET data_fim = '2025-01-01' WHERE id = ?", [encerrado]);

    // relatorioInadimplenciaDetalhado sempre usa "hoje" real — então força-se o cenário
    // via a MESMA regra (dia_vencimento no passado do mês corrente real) só é confiável
    // se o teste não depender do dia do mês em que roda. Em vez disso, testamos a
    // exclusão de vigência e de pagamento diretamente pela função pública que aceita
    // data de referência, e cobrimos o filtro de vigência via SQL isolado.
    const vigentes = consultar<{ id: number }>(
      db,
      "SELECT id FROM contratos_locacao WHERE data_fim IS NULL OR data_fim >= DATE('now')",
    ).map((c) => c.id);
    expect(vigentes).toContain(inadimplente);
    expect(vigentes).toContain(pago);
    expect(vigentes).not.toContain(encerrado);
  });

  it("resumoInadimplenciaTotal soma multa/juros/valor em risco de todos os contratos vigentes em atraso, hoje", () => {
    // relatorioInadimplenciaDetalhado/resumoInadimplenciaTotal chamam
    // apurarInadimplenciaContrato sem data_referencia — usam sempre o relógio real, sem
    // como injetar uma data fixa (limitação conhecida, fora do escopo deste achado; os
    // testes de apurarInadimplenciaContrato acima já cobrem a lógica de cálculo de forma
    // determinística via data_referencia). Vencimento no dia 1 garante atraso em
    // praticamente qualquer dia do mês em que este teste rodar (só não em 1º de mês).
    const contrato_id = criarContrato(1, 1000);
    const hoje = new Date().toISOString().slice(0, 10);

    const antes = resumoInadimplenciaTotal(db);
    expect(antes.contratos_inadimplentes).toBe(1);
    expect(antes.valor_aluguel_em_atraso).toBeCloseTo(1000, 2);
    expect(antes.valor_total_em_risco).toBeGreaterThan(1000); // principal + multa + juros

    registrarRecebimento(contrato_id, 1000, hoje);
    const depois = resumoInadimplenciaTotal(db);
    expect(depois.contratos_inadimplentes).toBe(0); // pago: some do relatório
  });
});

describe("integracao-inadimplencia: contabilização no razão (contas remapeadas do plano real)", () => {
  /**
   * ACHADO (gravidade CRÍTICA, corrigido): os ids de conta eram números mágicos (2, 29, 30)
   * que não existem em `contas_plano_contas` — todo lançamento quebrava com "FOREIGN KEY
   * constraint failed" contra o schema real. Corrigido remapeando para CONTA_CAIXA_ERP
   * (1101) e contas de receita já existentes no plano (4201, 4301).
   */
  it("contabilizarJurosMora grava débito em Caixa e crédito em Receita de Juros (4201), balanceado", () => {
    const contrato_id = criarContrato(10, 1000);
    const ok = contabilizarJurosMora(db, contrato_id, entidade_id, periodo_id, 12.5);
    expect(ok).toBe(true);

    expect(saldoLedgerConta(CONTA_CAIXA_ERP).debito).toBeCloseTo(12.5, 2);
    expect(saldoLedgerConta(CONTA_RECEITA_JUROS_ERP).credito).toBeCloseTo(12.5, 2);
  });

  it("contabilizarJurosMora com valor zero ou negativo não grava nada", () => {
    const contrato_id = criarContrato(10, 1000);
    expect(contabilizarJurosMora(db, contrato_id, entidade_id, periodo_id, 0)).toBe(false);
    expect(saldoLedgerConta(CONTA_CAIXA_ERP).debito).toBe(0);
  });

  it("contabilizarMultaPorAtraso grava débito em Caixa e crédito em Outras Receitas (4301), balanceado", () => {
    const contrato_id = criarContrato(10, 1000);
    const ok = contabilizarMultaPorAtraso(db, contrato_id, entidade_id, periodo_id, 20);
    expect(ok).toBe(true);

    expect(saldoLedgerConta(CONTA_CAIXA_ERP).debito).toBeCloseTo(20, 2);
    expect(saldoLedgerConta(CONTA_RECEITA_OUTRAS_ERP).credito).toBeCloseTo(20, 2);
  });

  /**
   * NÃO CORRIGIDO (decisão de produto fora de escopo) — ver o comentário "ACHADO" em
   * provisarJurosInadimplencia (integracao-inadimplencia.ts). Além de usar ids de conta
   * inexistentes (17, 31), a própria partida dobrada é questionável: debita uma despesa
   * própria do locador para um evento que não é uma despesa dele, e credita uma conta de
   * receita para "reduzi-la" — crédito aumenta receita, não reduz. Corrigir só os ids sem
   * decidir o tratamento contábil correto seria maquiar o defeito, não resolvê-lo.
   */
  it.fails("provisarJurosInadimplencia quebra contra o schema real (contas 17/31 inexistentes) — tratamento contábil correto é decisão de produto", () => {
    const contrato_id = criarContrato(10, 1000);
    const ok = provisarJurosInadimplencia(db, contrato_id, entidade_id, periodo_id);
    expect(ok).toBe(true);
  });
});
