import { describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { consultar, executar } from "../../../db/connection";
import { criarEntidadeLegal } from "../entidadeLegal";
import { validarBalanceamento } from "../ledger";
import {
  automatizarRateioPorDocumento,
  integrarRateioAoAluguel,
  processarDocumentoRateio,
  relatorioRateiosRealizados,
} from "../automacao-rateios";

/**
 * Primeira suíte deste módulo rodando contra o schema real (`criarBancoDeTeste()`), não
 * contra fixtures fictícias. Antes desta suíte, TODA chamada a `processarDocumentoRateio`
 * ou `integrarRateioAoAluguel` falhava com "FOREIGN KEY constraint failed" (conta_id
 * fictícios 20-26 — ver comentário no topo de automacao-rateios.ts) e, mesmo corrigindo
 * isso, o pipeline completo para 2+ imóveis ainda falhava com "UNIQUE constraint failed"
 * (origem_id repetido — ver ACHADOs 1 e 2 no mesmo arquivo). Depois, o pipeline completo
 * (automatizarRateioPorDocumento) creditava o mesmo rateio duas vezes por imóvel com
 * contrato ativo, desbalanceando o período (ACHADO 3, ver comentário de
 * integrarRateioAoAluguel) — corrigido nesta tarefa fazendo integrarRateioAoAluguel
 * RECLASSIFICAR o crédito já lançado em vez de somar um crédito novo. Os quatro problemas
 * foram corrigidos; nenhum `it.fails` resta neste arquivo.
 */

async function montarBase() {
  const db = await criarBancoDeTeste();
  const onboarding = criarEntidadeLegal(db, {
    nome: "Titular de Teste",
    cpf_cnpj: "52998224725",
  });
  expect(onboarding.sucesso).toBe(true);
  const entidade_id = onboarding.entidade_id!;

  executar(
    db,
    "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2025, 1, 'aberto')",
    [entidade_id],
  );
  const periodo_id = consultar<{ id: number }>(
    db,
    "SELECT id FROM periodos_contabeis WHERE entidade_id = ? AND ano = 2025 AND mes = 1",
    [entidade_id],
  )[0].id;

  return { db, entidade_id, periodo_id };
}

function criarImovel(
  db: Database,
  apelido: string,
  opcoes: { fracao_ideal?: number; area_m2?: number } = {},
): number {
  executar(
    db,
    "INSERT INTO imoveis (apelido, tipo, uso_pessoal, financiado, fracao_ideal, area_m2) VALUES (?, 'kitnet', 0, 0, ?, ?)",
    [apelido, opcoes.fracao_ideal ?? null, opcoes.area_m2 ?? null],
  );
  return consultar<{ id: number }>(db, "SELECT last_insert_rowid() as id")[0].id;
}

function criarContrato(
  db: Database,
  imovel_id: number,
  opcoes: { data_fim?: string | null; valor_referencia?: number } = {},
): number {
  executar(
    db,
    `INSERT INTO contratos_locacao (imovel_id, locatario, tipo, valor_referencia, data_inicio, data_fim)
     VALUES (?, 'Locatário Teste', 'residencial_fixo', ?, '2024-01-01', ?)`,
    [imovel_id, opcoes.valor_referencia ?? 1000, opcoes.data_fim ?? null],
  );
  return consultar<{ id: number }>(db, "SELECT last_insert_rowid() as id")[0].id;
}

function criarDocumento(
  db: Database,
  opcoes: { tipo?: string; valor?: number | null; cnpj?: string } = {},
): number {
  executar(
    db,
    `INSERT INTO documentos (tipo, arquivo_nome, valor, data_documento, cnpj_cpf_contraparte, criado_em)
     VALUES (?, 'doc.pdf', ?, '2025-01-10', ?, '2025-01-01')`,
    // "valor" in opcoes, não opcoes.valor ?? 1000 — um `null` EXPLÍCITO (o caso que o
    // teste "documento sem valor (NULL)" precisa simular) é engolido pelo `??`, que trata
    // null igual a "não informado" e cairia no default 1000 mesmo quando o chamador
    // pediu null de propósito.
    [opcoes.tipo ?? "fatura", "valor" in opcoes ? opcoes.valor : 1000, opcoes.cnpj ?? "11.111.111/0001-11"],
  );
  return consultar<{ id: number }>(db, "SELECT last_insert_rowid() as id")[0].id;
}

describe("automacao-rateios: processarDocumentoRateio — rateio proporcional entre imóveis com contrato ativo", () => {
  it("rateia proporcionalmente por fração ideal e grava débito+créditos balanceados no ledger real", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const imovelA = criarImovel(db, "A", { fracao_ideal: 0.6 });
    const imovelB = criarImovel(db, "B", { fracao_ideal: 0.4 });
    criarContrato(db, imovelA);
    criarContrato(db, imovelB);
    const documento_id = criarDocumento(db, { valor: 1000 });

    const resultado = processarDocumentoRateio(db, documento_id, entidade_id, periodo_id);
    expect(resultado).not.toBeNull();
    expect(resultado!.valor_total).toBe(1000);
    expect(resultado!.rateios_por_imovel).toHaveLength(2);

    const porImovel = new Map(resultado!.rateios_por_imovel.map((r) => [r.imovel_id, r]));
    expect(porImovel.get(imovelA)!.percentual).toBeCloseTo(60, 2);
    expect(porImovel.get(imovelA)!.valor_rateado).toBeCloseTo(600, 2);
    expect(porImovel.get(imovelB)!.percentual).toBeCloseTo(40, 2);
    expect(porImovel.get(imovelB)!.valor_rateado).toBeCloseTo(400, 2);

    // O débito total da despesa e a soma dos créditos por imóvel devem bater — o par
    // fica balanceado (ao contrário da integração com o aluguel, ver ACHADO 3 abaixo).
    const linhas = consultar<{ valor_debito: number | null; valor_credito: number | null }>(
      db, "SELECT valor_debito, valor_credito FROM ledger_entries WHERE periodo_id = ?", [periodo_id],
    );
    const totalDebito = linhas.reduce((s, l) => s + (l.valor_debito ?? 0), 0);
    const totalCredito = linhas.reduce((s, l) => s + (l.valor_credito ?? 0), 0);
    expect(totalDebito).toBeCloseTo(1000, 2);
    expect(totalCredito).toBeCloseTo(1000, 2);
    expect(validarBalanceamento(db, periodo_id).balanceado).toBe(true);
  });

  it("cai para divisão igual quando nenhum imóvel com contrato ativo tem fração ideal nem área m²", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const imovelA = criarImovel(db, "A");
    const imovelB = criarImovel(db, "B");
    criarContrato(db, imovelA);
    criarContrato(db, imovelB);
    const documento_id = criarDocumento(db, { valor: 900 });

    const resultado = processarDocumentoRateio(db, documento_id, entidade_id, periodo_id);
    expect(resultado!.rateios_por_imovel).toHaveLength(2);
    for (const r of resultado!.rateios_por_imovel) {
      expect(r.percentual).toBeCloseTo(50, 2);
      expect(r.valor_rateado).toBeCloseTo(450, 2);
    }
  });

  it("soma dos valores rateados bate com o valor do documento mesmo quando os percentuais individuais não fecham em 100% exato (arredondamento de fração)", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    // Três imóveis com peso igual: cada percentual é 33.333...%, que não soma
    // exatamente a 100.000000% em ponto flutuante — o caso real de "rateio com
    // percentuais que não somam 100%" pedido pela tarefa.
    const imoveis = [criarImovel(db, "A", { fracao_ideal: 1 }), criarImovel(db, "B", { fracao_ideal: 1 }), criarImovel(db, "C", { fracao_ideal: 1 })];
    imoveis.forEach((id) => criarContrato(db, id));
    const documento_id = criarDocumento(db, { valor: 1000 });

    const resultado = processarDocumentoRateio(db, documento_id, entidade_id, periodo_id);
    const somaPercentuais = resultado!.rateios_por_imovel.reduce((s, r) => s + r.percentual, 0);
    const somaValores = resultado!.rateios_por_imovel.reduce((s, r) => s + r.valor_rateado, 0);

    // O ponto que importa para a contabilidade: o valor em R$ soma exatamente o
    // documento, mesmo que o percentual por linha não seja um número "redondo".
    expect(somaValores).toBeCloseTo(1000, 6);
    expect(somaPercentuais).toBeCloseTo(100, 6);
    expect(validarBalanceamento(db, periodo_id).balanceado).toBe(true);
  });

  it("imóvel sem contrato ativo (nenhum contrato) não participa do rateio", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const comContrato1 = criarImovel(db, "Com contrato 1", { fracao_ideal: 0.5 });
    const comContrato2 = criarImovel(db, "Com contrato 2", { fracao_ideal: 0.5 });
    const semContrato = criarImovel(db, "Sem contrato", { fracao_ideal: 1.0 }); // pesaria mais se entrasse
    criarContrato(db, comContrato1);
    criarContrato(db, comContrato2);
    const documento_id = criarDocumento(db, { valor: 1000 });

    const resultado = processarDocumentoRateio(db, documento_id, entidade_id, periodo_id);
    const idsRateados = resultado!.rateios_por_imovel.map((r) => r.imovel_id);
    expect(idsRateados).toContain(comContrato1);
    expect(idsRateados).toContain(comContrato2);
    expect(idsRateados).not.toContain(semContrato);
    // Excluído do cálculo inteiro, não só do rateio: cai para 50/50 entre os dois com contrato.
    resultado!.rateios_por_imovel.forEach((r) => expect(r.percentual).toBeCloseTo(50, 2));
  });

  it("imóvel com contrato encerrado (data_fim no passado) não participa do rateio", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const ativo = criarImovel(db, "Ativo", { fracao_ideal: 1 });
    const encerrado = criarImovel(db, "Encerrado", { fracao_ideal: 1 });
    criarContrato(db, ativo);
    criarContrato(db, encerrado, { data_fim: "2020-01-01" });
    const documento_id = criarDocumento(db, { valor: 500 });

    const resultado = processarDocumentoRateio(db, documento_id, entidade_id, periodo_id);
    expect(resultado!.rateios_por_imovel).toHaveLength(1);
    expect(resultado!.rateios_por_imovel[0].imovel_id).toBe(ativo);
    expect(resultado!.rateios_por_imovel[0].valor_rateado).toBeCloseTo(500, 2);
  });

  it("documento inexistente retorna null sem gravar nada no ledger", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const resultado = processarDocumentoRateio(db, 99999, entidade_id, periodo_id);
    expect(resultado).toBeNull();
    expect(consultar(db, "SELECT id FROM ledger_entries")).toHaveLength(0);
  });

  it("documento sem valor (NULL) retorna null sem gravar nada no ledger", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const documento_id = criarDocumento(db, { valor: null });
    const resultado = processarDocumentoRateio(db, documento_id, entidade_id, periodo_id);
    expect(resultado).toBeNull();
    expect(consultar(db, "SELECT id FROM ledger_entries")).toHaveLength(0);
  });
});

describe("automacao-rateios: integrarRateioAoAluguel", () => {
  it("valor_rateio_adicional <= 0 não gera lançamento", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const imovel_id = criarImovel(db, "A");
    const contrato_id = criarContrato(db, imovel_id);
    expect(integrarRateioAoAluguel(db, entidade_id, periodo_id, contrato_id, imovel_id, 0, "Rateio")).toBe(false);
    expect(integrarRateioAoAluguel(db, entidade_id, periodo_id, contrato_id, imovel_id, -10, "Rateio")).toBe(false);
    expect(consultar(db, "SELECT id FROM ledger_entries")).toHaveLength(0);
  });

  it("contrato inexistente retorna false sem gravar nada", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const imovel_id = criarImovel(db, "A");
    expect(integrarRateioAoAluguel(db, entidade_id, periodo_id, 99999, imovel_id, 100, "Rateio")).toBe(false);
    expect(consultar(db, "SELECT id FROM ledger_entries")).toHaveLength(0);
  });

  // ACHADOS 2 e 3 (corrigidos nesta tarefa — ver o comentário completo em
  // automacao-rateios.ts): integrarRateioAoAluguel deixou de lançar um crédito novo e
  // passou a RECLASSIFICAR (estornar + relançar, mesmo padrão de reclassificarTransacao.ts)
  // o crédito que processarDocumentoRateio já lança por imóvel. Por isso ela agora exige
  // esse crédito já lançado — os dois testes abaixo cobrem os dois lados dessa mudança.
  it("sem crédito de rateio já lançado para este imóvel neste período, retorna false sem gravar nada", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const imovel_id = criarImovel(db, "A");
    const contrato_id = criarContrato(db, imovel_id);
    // Nenhuma chamada a processarDocumentoRateio antes: não há crédito "rateio a receber"
    // para este imóvel neste período, então não há o que reclassificar.
    expect(integrarRateioAoAluguel(db, entidade_id, periodo_id, contrato_id, imovel_id, 150, "Rateio condomínio")).toBe(false);
    expect(consultar(db, "SELECT id FROM ledger_entries")).toHaveLength(0);
  });

  it("contrato existente reclassifica o crédito de rateio já lançado para a entidade/período corretos (não fixos em 1/1) e mantém o período balanceado", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    // Um segundo período, para provar que o valor passado é o usado (achado corrigido:
    // antes gravava sempre entidade_id=1, periodo_id=1, fixos no código).
    executar(db, "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2025, 2, 'aberto')", [entidade_id]);
    const periodo2 = consultar<{ id: number }>(db, "SELECT id FROM periodos_contabeis WHERE ano=2025 AND mes=2")[0].id;

    const imovel_id = criarImovel(db, "A", { fracao_ideal: 1 });
    const contrato_id = criarContrato(db, imovel_id);
    const documento_id = criarDocumento(db, { valor: 150 });

    // Pré-condição que integrarRateioAoAluguel agora exige: processarDocumentoRateio já
    // lançou o crédito "rateio a receber" por imóvel neste período — é ele que será
    // reclassificado, não um crédito novo.
    processarDocumentoRateio(db, documento_id, entidade_id, periodo2);

    const sucesso = integrarRateioAoAluguel(db, entidade_id, periodo2, contrato_id, imovel_id, 150, "Rateio condomínio");
    expect(sucesso).toBe(true);

    const [linhaViva] = consultar<{ entidade_id: number; periodo_id: number; conta_id: number; valor_credito: number }>(
      db,
      "SELECT entidade_id, periodo_id, conta_id, valor_credito FROM ledger_entries WHERE valor_credito IS NOT NULL AND estornado_por_id IS NULL ORDER BY id DESC LIMIT 1",
      [],
    );
    expect(linhaViva.entidade_id).toBe(entidade_id);
    expect(linhaViva.periodo_id).toBe(periodo2);
    expect(linhaViva.valor_credito).toBe(150);
    // A conta precisa existir de fato em contas_plano_contas (FK real) — se não existisse,
    // o INSERT já teria lançado "FOREIGN KEY constraint failed".
    const [conta] = consultar<{ grupo: string }>(db, "SELECT grupo FROM contas_plano_contas WHERE id = ?", [linhaViva.conta_id]);
    expect(conta.grupo).toBe("receita");

    // A reclassificação (estorno + relançamento no mesmo valor) nunca desbalanceia o
    // período — ao contrário do crédito duplicado de antes da correção (ACHADO 3).
    expect(validarBalanceamento(db, periodo2).balanceado).toBe(true);
  });
});

describe("automacao-rateios: automatizarRateioPorDocumento — pipeline completo", () => {
  it("processa o documento e integra ao contrato de cada imóvel com contrato ativo, sem colidir no ledger", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const imovelA = criarImovel(db, "A", { fracao_ideal: 0.6 });
    const imovelB = criarImovel(db, "B", { fracao_ideal: 0.4 });
    criarContrato(db, imovelA);
    criarContrato(db, imovelB);
    const documento_id = criarDocumento(db, { valor: 1000 });

    // ACHADOS 1 e 2 de integrarRateioAoAluguel (documentados no arquivo): antes da
    // correção, esta chamada lançava "UNIQUE constraint failed" já no segundo imóvel.
    const resultado = automatizarRateioPorDocumento(db, documento_id, entidade_id, periodo_id);
    expect(resultado.sucesso).toBe(true);
    expect(resultado.imoveis_alocados).toBe(2);
    expect(resultado.valor_total).toBe(1000);
  });

  it("não integra ao contrato imóveis sem contrato ativo (imoveis_alocados reflete só os elegíveis)", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const comContrato = criarImovel(db, "Com contrato", { fracao_ideal: 0.5 });
    const semContrato = criarImovel(db, "Sem contrato", { fracao_ideal: 0.5 });
    criarContrato(db, comContrato);
    const documento_id = criarDocumento(db, { valor: 800 });

    const resultado = automatizarRateioPorDocumento(db, documento_id, entidade_id, periodo_id);
    expect(resultado.sucesso).toBe(true);
    // Só o imóvel com contrato ativo participa do rateio inteiro (ver teste equivalente
    // em processarDocumentoRateio) — logo só ele pode ser "alocado" ao contrato depois.
    expect(resultado.imoveis_alocados).toBe(1);
    void semContrato;
  });

  it("documento inexistente retorna sucesso:false sem gravar nada", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const resultado = automatizarRateioPorDocumento(db, 99999, entidade_id, periodo_id);
    expect(resultado).toEqual({ sucesso: false, imoveis_alocados: 0, valor_total: 0 });
    expect(consultar(db, "SELECT id FROM ledger_entries")).toHaveLength(0);
  });

  // ACHADOS 2 e 3 (corrigidos nesta tarefa — ver o comentário completo em
  // integrarRateioAoAluguel, automacao-rateios.ts): o pipeline completo
  // (automatizarRateioPorDocumento) creditava o rateio duas vezes por imóvel com contrato
  // ativo — uma vez em processarDocumentoRateio, outra em integrarRateioAoAluguel — sem
  // nenhuma perna de débito para a segunda, desbalanceando o período no valor total
  // rateado. A correção: integrarRateioAoAluguel passou a RECLASSIFICAR (estornar +
  // relançar) o crédito que processarDocumentoRateio já lança, em vez de somar um crédito
  // novo — o par estorno+relançamento é balanceado por construção. Provado abaixo (antigos
  // `it.fails`, promovidos a `it` — se alguém reintroduzir a duplicidade, estes dois
  // testes voltam a falhar).
});

it(
  "ACHADO (produto, corrigido): automatizarRateioPorDocumento fecha o período balanceado mesmo com imóveis de contrato ativo — a reclassificação não duplica o crédito",
  async () => {
    const db = await criarBancoDeTeste();
    const onboarding = criarEntidadeLegal(db, { nome: "Titular de Teste", cpf_cnpj: "52998224725" });
    const entidade_id = onboarding.entidade_id!;
    executar(db, "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2025, 1, 'aberto')", [entidade_id]);
    const periodo_id = consultar<{ id: number }>(db, "SELECT id FROM periodos_contabeis WHERE ano=2025 AND mes=1")[0].id;

    executar(db, "INSERT INTO imoveis (apelido, tipo, uso_pessoal, financiado, fracao_ideal) VALUES ('A','kitnet',0,0,1)");
    const imovel_id = consultar<{ id: number }>(db, "SELECT last_insert_rowid() as id")[0].id;
    executar(
      db,
      `INSERT INTO contratos_locacao (imovel_id, locatario, tipo, valor_referencia, data_inicio, data_fim)
       VALUES (?, 'L', 'residencial_fixo', 1000, '2024-01-01', NULL)`,
      [imovel_id],
    );
    executar(
      db,
      `INSERT INTO documentos (tipo, arquivo_nome, valor, data_documento, cnpj_cpf_contraparte, criado_em)
       VALUES ('fatura', 'x.pdf', 1000, '2025-01-10', '11.111.111/0001-11', '2025-01-01')`,
    );
    const documento_id = consultar<{ id: number }>(db, "SELECT last_insert_rowid() as id")[0].id;

    const resultado = automatizarRateioPorDocumento(db, documento_id, entidade_id, periodo_id);
    expect(resultado.sucesso).toBe(true);

    // Pipeline correto: período balanceado (débito == crédito) — antes da correção ficava
    // desbalanceado em exatamente 1000 (o rateio inteiro creditado duas vezes, sem débito
    // correspondente na segunda vez).
    expect(validarBalanceamento(db, periodo_id).balanceado).toBe(true);
  },
);

it(
  "ACHADO (produto, corrigido): relatorioRateiosRealizados mostra valor_rateio_recebido > 0 depois que o rateio é integrado ao aluguel",
  async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const imovel_id = criarImovel(db, "A", { fracao_ideal: 1 });
    criarContrato(db, imovel_id);
    const documento_id = criarDocumento(db, { valor: 500 });

    const resultado = automatizarRateioPorDocumento(db, documento_id, entidade_id, periodo_id);
    expect(resultado.sucesso).toBe(true);

    const [linha] = relatorioRateiosRealizados(db, periodo_id);
    expect(linha.imovel_id).toBe(imovel_id);
    // A perna de estorno da reclassificação (débito em CONTA_RATEIO_RECEITA, marcada
    // 'manual' por imóvel — ver comentário de integrarRateioAoAluguel) é o evento
    // "recebido" que faltava: o rateio inteiro (500) foi absorvido no aluguel do contrato.
    expect(linha.valor_rateio_esperado).toBeCloseTo(500, 2);
    expect(linha.valor_rateio_recebido).toBeCloseTo(500, 2);
    expect(linha.divergencia).toBeCloseTo(0, 2);
  },
);
