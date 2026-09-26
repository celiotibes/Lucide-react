import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { consultar, executar } from "../../db/connection";
import { criarEntidadeLegal, sincronizarRazao, validarDocumento } from "./entidadeLegal";
import { migrarTransacoesParaLedger } from "./migracao-ledger";
import { CONTA_CAIXA_ERP, CONTA_CLASSIFICACAO_PENDENTE, MAPA_APP_PARA_ERP } from "./mapeamentoPlanoApp";
import { PLANO_DE_CONTAS } from "../planoDeContas";
import { PLANO_DE_CONTAS_ERP } from "./planoDeContasErp";

// CPF real na aritmética dos dígitos verificadores, mas sem titular: 529.982.247-25 é o
// exemplo canônico usado em documentação da Receita. Nenhum dado de pessoa real entra aqui.
const CPF_TESTE = "52998224725";

let db: Database;
/** Id da entidade criada no beforeEach. O onboarding vem ANTES de haver transação — é a
 * ordem real de uso, e é o que faz `sincronizarRazao` no corpo do teste ser a única
 * migração que roda (criarEntidadeLegal já migra o que encontra na hora). */
let entidade_id: number;

async function prepararBanco() {
  db = await criarBancoDeTeste();
  executar(
    db,
    "INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo) VALUES (1, 'Teste', '0001', '12345', 'Titular', 'corrente')",
  );
  const r = criarEntidadeLegal(db, { nome: "Titular de Teste", cpf_cnpj: CPF_TESTE });
  if (!r.entidade_id) throw new Error(`Fixture não conseguiu criar a entidade: ${r.mensagem}`);
  entidade_id = r.entidade_id;
}

function inserirTransacao(
  id: number,
  data: string,
  valor: number,
  codigo: string | null,
  descricao = `Transação ${id}`,
) {
  executar(
    db,
    `INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo)
     VALUES (?, 1, ?, ?, ?, ?)`,
    [id, data, valor, descricao, codigo],
  );
}

function totais() {
  return consultar<{ d: number; c: number }>(
    db,
    "SELECT COALESCE(SUM(valor_debito), 0) AS d, COALESCE(SUM(valor_credito), 0) AS c FROM ledger_entries",
  )[0];
}

function pernas(origem_id: number) {
  return consultar<{ conta_id: number; valor_debito: number | null; valor_credito: number | null; periodo_id: number }>(
    db,
    `SELECT conta_id, valor_debito, valor_credito, periodo_id FROM ledger_entries
     WHERE origem_modulo = 'transacoes' AND origem_id = ? ORDER BY conta_id`,
    [origem_id],
  );
}

describe("mapeamento entre os dois planos de contas", () => {
  it("cobre todo código do plano do app", () => {
    const naoMapeados = PLANO_DE_CONTAS.map((c) => c.codigo).filter((c) => !MAPA_APP_PARA_ERP[c]);
    expect(naoMapeados).toEqual([]);
  });

  it("só aponta para contas que existem no plano do razão", () => {
    const idsErp = new Set<number>(PLANO_DE_CONTAS_ERP.map((c) => c.id));
    const orfas = Object.entries(MAPA_APP_PARA_ERP).filter(([, id]) => !idsErp.has(id));
    expect(orfas).toEqual([]);
    expect(idsErp.has(CONTA_CAIXA_ERP)).toBe(true);
    expect(idsErp.has(CONTA_CLASSIFICACAO_PENDENTE)).toBe(true);
  });

  it("não traduz por igualdade de código — os dois planos colidem", () => {
    // 1.1.01 é receita de aluguel no app e Caixa no razão. Se a tradução fosse por
    // string (o defeito antigo), o aluguel cairia na própria conta de caixa.
    expect(MAPA_APP_PARA_ERP["1.1.01"]).not.toBe(CONTA_CAIXA_ERP);
    const porCodigo = new Map(PLANO_DE_CONTAS_ERP.map((c) => [c.codigo, c.id]));
    expect(MAPA_APP_PARA_ERP["2.1.01"]).not.toBe(porCodigo.get("2.1.01")); // não é Capital social
  });
});

describe("migrarTransacoesParaLedger", () => {
  beforeEach(async () => {
    await prepararBanco();
  });

  it("grava as duas pernas e o razão fecha", () => {
    inserirTransacao(1, "2024-03-10", 2500, "1.1.01"); // aluguel recebido
    inserirTransacao(2, "2024-03-15", -430.5, "2.1.01"); // condomínio pago

    const r = sincronizarRazao(db, entidade_id);

    expect(r.transacoes_migradas).toBe(2);
    expect(r.transacoes_falhadas).toBe(0);
    const t = totais();
    expect(t.d).toBeCloseTo(t.c, 2);
    expect(t.d).toBeCloseTo(2930.5, 2);
  });

  it("entrada debita o caixa e credita a receita", () => {
    inserirTransacao(1, "2024-03-10", 2500, "1.1.01");
    sincronizarRazao(db, entidade_id);

    const linhas = pernas(1);
    expect(linhas).toHaveLength(2);
    const caixa = linhas.find((l) => l.conta_id === CONTA_CAIXA_ERP);
    const receita = linhas.find((l) => l.conta_id === MAPA_APP_PARA_ERP["1.1.01"]);
    expect(caixa?.valor_debito).toBe(2500);
    expect(caixa?.valor_credito).toBeNull();
    expect(receita?.valor_credito).toBe(2500);
    expect(receita?.valor_debito).toBeNull();
  });

  it("saída credita o caixa e debita a despesa", () => {
    inserirTransacao(1, "2024-03-15", -430.5, "2.1.01");
    sincronizarRazao(db, entidade_id);

    const linhas = pernas(1);
    const caixa = linhas.find((l) => l.conta_id === CONTA_CAIXA_ERP);
    const despesa = linhas.find((l) => l.conta_id === MAPA_APP_PARA_ERP["2.1.01"]);
    expect(caixa?.valor_credito).toBe(430.5);
    expect(despesa?.valor_debito).toBe(430.5);
  });

  it("capex vai para o imobilizado, não para despesa", () => {
    inserirTransacao(1, "2024-05-02", -80000, "2.1.03"); // obra
    sincronizarRazao(db, entidade_id);

    const conta = MAPA_APP_PARA_ERP["2.1.03"];
    expect(PLANO_DE_CONTAS_ERP.find((c) => c.id === conta)?.grupo).toBe("ativo");
    expect(pernas(1).find((l) => l.conta_id === conta)?.valor_debito).toBe(80000);
  });

  it("amortização de financiamento reduz passivo, não vira despesa", () => {
    inserirTransacao(1, "2024-05-05", -1200, "2.1.06");
    sincronizarRazao(db, entidade_id);

    const conta = MAPA_APP_PARA_ERP["2.1.06"];
    expect(PLANO_DE_CONTAS_ERP.find((c) => c.id === conta)?.grupo).toBe("passivo");
    // Débito num passivo = obrigação diminuindo.
    expect(pernas(1).find((l) => l.conta_id === conta)?.valor_debito).toBe(1200);
  });

  it("caução recebida vira passivo e devolvida o zera", () => {
    inserirTransacao(1, "2024-01-05", 3000, "9.0.02");
    inserirTransacao(2, "2024-12-20", -3000, "9.0.02");
    sincronizarRazao(db, entidade_id);

    const conta = MAPA_APP_PARA_ERP["9.0.02"];
    const [saldo] = consultar<{ d: number; c: number }>(
      db,
      `SELECT COALESCE(SUM(valor_debito),0) AS d, COALESCE(SUM(valor_credito),0) AS c
       FROM ledger_entries WHERE conta_id = ?`,
      [conta],
    );
    expect(saldo.c - saldo.d).toBe(0);
    expect(saldo.c).toBe(3000); // houve movimento real, não ausência de lançamento
  });

  it("transferência entre contas próprias não toca receita nem despesa", () => {
    inserirTransacao(1, "2024-02-01", -5000, "9.0.01");
    inserirTransacao(2, "2024-02-01", 5000, "9.0.01");
    sincronizarRazao(db, entidade_id);

    const resultado = consultar<{ n: number }>(
      db,
      `SELECT COUNT(*) AS n FROM ledger_entries l
       JOIN contas_plano_contas c ON c.id = l.conta_id
       WHERE c.grupo IN ('receita', 'despesa')`,
    )[0];
    expect(resultado.n).toBe(0);
  });

  it("cada lançamento cai na competência da própria data, não no mês corrente", () => {
    inserirTransacao(1, "2021-07-09", 1000, "1.1.01");
    inserirTransacao(2, "2023-11-28", 1000, "1.1.01");
    sincronizarRazao(db, entidade_id);

    const periodos = consultar<{ ano: number; mes: number }>(
      db,
      `SELECT p.ano, p.mes FROM periodos_contabeis p
       JOIN ledger_entries l ON l.periodo_id = p.id
       GROUP BY p.ano, p.mes ORDER BY p.ano`,
    );
    expect(periodos).toEqual([
      { ano: 2021, mes: 7 },
      { ano: 2023, mes: 11 },
    ]);
  });

  it("é idempotente — rodar duas vezes não duplica", () => {
    inserirTransacao(1, "2024-03-10", 2500, "1.1.01");
    const primeira = sincronizarRazao(db, entidade_id);
    const segunda = sincronizarRazao(db, entidade_id);

    expect(primeira.transacoes_migradas).toBe(1);
    expect(segunda.transacoes_migradas).toBe(0);
    expect(segunda.transacoes_ja_migradas).toBe(1);
    expect(totais().d).toBeCloseTo(2500, 2);
  });

  it("transação sem classificação entra na conta transitória em vez de sumir", () => {
    inserirTransacao(1, "2024-04-01", 777, null);
    const r = sincronizarRazao(db, entidade_id);

    expect(r.transacoes_migradas).toBe(1);
    expect(r.transacoes_sem_classificacao).toBe(1);
    expect(pernas(1).some((l) => l.conta_id === CONTA_CLASSIFICACAO_PENDENTE)).toBe(true);
    // O caixa continua certo: é esse o ponto de não descartar a transação.
    expect(totais().d).toBeCloseTo(777, 2);
    expect(totais().c).toBeCloseTo(777, 2);
  });

  it("data inválida vira erro nomeado, sem cair no mês corrente", () => {
    inserirTransacao(1, "sem-data", 100, "1.1.01");
    const r = sincronizarRazao(db, entidade_id);

    expect(r.transacoes_migradas).toBe(0);
    expect(r.erros[0].transacao_id).toBe(1);
    expect(r.erros[0].erro).toMatch(/Data inválida/);
    expect(totais().d).toBe(0);
  });

  it("período fechado recusa o lançamento e não deixa perna órfã", () => {
    inserirTransacao(1, "2024-03-10", 2500, "1.1.01");
    executar(
      db,
      "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2024, 3, 'fechado')",
      [entidade_id],
    );

    const r = migrarTransacoesParaLedger(db, entidade_id);

    expect(r.transacoes_migradas).toBe(0);
    expect(r.erros[0].erro).toMatch(/fechado/);
    expect(totais().d).toBe(0);
    expect(totais().c).toBe(0);
  });

  it("uma transação por cada código do plano do app deixa o razão fechado", () => {
    PLANO_DE_CONTAS.forEach((conta, i) => {
      inserirTransacao(i + 1, "2024-06-01", i % 2 === 0 ? 100 + i : -(100 + i), conta.codigo);
    });
    const r = sincronizarRazao(db, entidade_id);

    expect(r.transacoes_falhadas).toBe(0);
    expect(r.transacoes_sem_classificacao).toBe(0);
    expect(r.transacoes_migradas).toBe(PLANO_DE_CONTAS.length);
    const t = totais();
    expect(t.d).toBeCloseTo(t.c, 2);
  });
});

describe("entidade legal (onboarding)", () => {
  // Banco SEM entidade: aqui o que está sob teste é justamente a criação dela.
  beforeEach(async () => {
    db = await criarBancoDeTeste();
    executar(
      db,
      "INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo) VALUES (1, 'Teste', '0001', '12345', 'Titular', 'corrente')",
    );
  });

  it("recusa CPF com dígito verificador errado", () => {
    expect(validarDocumento("52998224724").valido).toBe(false);
    expect(validarDocumento("11111111111").valido).toBe(false);
    expect(validarDocumento(CPF_TESTE).valido).toBe(true);
    expect(validarDocumento(CPF_TESTE).tipo).toBe("pessoa_fisica");
  });

  it("aceita CNPJ válido e deduz pessoa jurídica", () => {
    expect(validarDocumento("11222333000181").valido).toBe(true);
    expect(validarDocumento("11222333000181").tipo).toBe("pessoa_juridica");
    expect(validarDocumento("11222333000182").valido).toBe(false);
  });

  it("criar a entidade semeia o plano do razão e já migra o que existia", () => {
    inserirTransacao(1, "2024-03-10", 2500, "1.1.01");

    const r = criarEntidadeLegal(db, { nome: "Titular de Teste", cpf_cnpj: "529.982.247-25" });

    expect(r.sucesso).toBe(true);
    expect(consultar(db, "SELECT id FROM contas_plano_contas").length).toBe(PLANO_DE_CONTAS_ERP.length);
    expect(r.migracao?.transacoes_migradas).toBe(1);
    // Documento gravado sem máscara, senão a unicidade não pega o mesmo CPF pontuado.
    expect(consultar<{ cpf_cnpj: string }>(db, "SELECT cpf_cnpj FROM entidades_legais")[0].cpf_cnpj).toBe(CPF_TESTE);
  });

  it("recusa documento repetido em vez de estourar a constraint", () => {
    criarEntidadeLegal(db, { nome: "Primeiro", cpf_cnpj: CPF_TESTE });
    const r = criarEntidadeLegal(db, { nome: "Segundo", cpf_cnpj: CPF_TESTE });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/Já existe/);
  });

  it("recusa nome vazio", () => {
    expect(criarEntidadeLegal(db, { nome: " ", cpf_cnpj: CPF_TESTE }).sucesso).toBe(false);
  });
});

