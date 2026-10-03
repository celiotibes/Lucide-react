import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { consultar, executar } from "../../db/connection";
import { criarEntidadeLegal } from "../erp/entidadeLegal";
import {
  registrarAvaliacaoMercado,
  listarAvaliacoesMercado,
  obterUltimaAvaliacaoMercado,
  relatorioPatrimonioMercado,
  calcularIndicadoresViabilidade,
  calcularPaybackMercado,
  calcularYieldsMercado,
  calcularValorizacaoAnualizada,
  calcularTirAproximada,
  calcularLtvMercado,
  calcularDscrMercado,
  type AvaliacaoMercado,
} from "./avaliacaoMercado";

async function bancoComImovel(opts?: { valorAquisicao?: number; usoPessoal?: 0 | 1 }) {
  const db = await criarBancoDeTeste();
  executar(
    db,
    "INSERT INTO imoveis (id, apelido, tipo, cidade, uso_pessoal, valor_aquisicao) VALUES (1, 'Kitnet 1', 'kitnet', 'Florianópolis', ?, ?)",
    [opts?.usoPessoal ?? 0, opts?.valorAquisicao ?? 200000],
  );
  return db;
}

describe("registrarAvaliacaoMercado — cache imoveis.valor_venal_atual", () => {
  it("atualiza o cache quando a avaliação registrada é a mais recente", async () => {
    const db = await bancoComImovel();

    registrarAvaliacaoMercado(db, { imovelId: 1, valorAvaliado: 300000, dataAvaliacao: "2026-01-15" });

    const [imovel] = consultar<{ valor_venal_atual: number; data_avaliacao_venal: string }>(
      db,
      "SELECT valor_venal_atual, data_avaliacao_venal FROM imoveis WHERE id = 1",
    );
    expect(imovel.valor_venal_atual).toBe(300000);
    expect(imovel.data_avaliacao_venal).toBe("2026-01-15");
  });

  it("uma segunda avaliação mais recente atualiza o cache de novo", async () => {
    const db = await bancoComImovel();

    registrarAvaliacaoMercado(db, { imovelId: 1, valorAvaliado: 300000, dataAvaliacao: "2026-01-15" });
    registrarAvaliacaoMercado(db, { imovelId: 1, valorAvaliado: 320000, dataAvaliacao: "2026-06-01" });

    const [imovel] = consultar<{ valor_venal_atual: number; data_avaliacao_venal: string }>(
      db,
      "SELECT valor_venal_atual, data_avaliacao_venal FROM imoveis WHERE id = 1",
    );
    expect(imovel.valor_venal_atual).toBe(320000);
    expect(imovel.data_avaliacao_venal).toBe("2026-06-01");
  });

  it("NÃO sobrescreve o cache com uma avaliação antiga inserida fora de ordem", async () => {
    const db = await bancoComImovel();

    registrarAvaliacaoMercado(db, { imovelId: 1, valorAvaliado: 320000, dataAvaliacao: "2026-06-01" });
    // Avaliação antiga, digitada depois (ex: laudo de anos atrás que faltava no sistema).
    registrarAvaliacaoMercado(db, { imovelId: 1, valorAvaliado: 250000, dataAvaliacao: "2024-01-10" });

    const [imovel] = consultar<{ valor_venal_atual: number; data_avaliacao_venal: string }>(
      db,
      "SELECT valor_venal_atual, data_avaliacao_venal FROM imoveis WHERE id = 1",
    );
    // O cache continua refletindo a avaliação de fato mais recente (2026-06-01/320000).
    expect(imovel.valor_venal_atual).toBe(320000);
    expect(imovel.data_avaliacao_venal).toBe("2026-06-01");

    // Mas o histórico completo tem as duas linhas, mais recente primeiro.
    const historico = listarAvaliacoesMercado(db, 1);
    expect(historico).toHaveLength(2);
    expect(historico[0].data_avaliacao).toBe("2026-06-01");
    expect(historico[1].data_avaliacao).toBe("2024-01-10");
  });

  it("rejeita valor avaliado <= 0 e imóvel inexistente", async () => {
    const db = await bancoComImovel();
    expect(() =>
      registrarAvaliacaoMercado(db, { imovelId: 1, valorAvaliado: 0, dataAvaliacao: "2026-01-01" }),
    ).toThrow();
    expect(() =>
      registrarAvaliacaoMercado(db, { imovelId: 999, valorAvaliado: 100, dataAvaliacao: "2026-01-01" }),
    ).toThrow();
  });
});

describe("obterUltimaAvaliacaoMercado — fallback para o cache", () => {
  it("retorna null quando não há histórico nem cache", async () => {
    const db = await bancoComImovel();
    expect(obterUltimaAvaliacaoMercado(db, 1)).toBeNull();
  });

  it("cai para imoveis.valor_venal_atual/data_avaliacao_venal quando não há linha em imovel_avaliacoes_mercado", async () => {
    const db = await bancoComImovel();
    executar(db, "UPDATE imoveis SET valor_venal_atual = 280000, data_avaliacao_venal = '2025-12-01' WHERE id = 1");

    const ultima = obterUltimaAvaliacaoMercado(db, 1);
    expect(ultima).toEqual({ valorAvaliado: 280000, dataAvaliacao: "2025-12-01", origem: "cache_imoveis" });
  });

  it("prioriza o histórico sobre o cache quando ambos existem", async () => {
    const db = await bancoComImovel();
    executar(db, "UPDATE imoveis SET valor_venal_atual = 280000, data_avaliacao_venal = '2025-12-01' WHERE id = 1");
    registrarAvaliacaoMercado(db, { imovelId: 1, valorAvaliado: 300000, dataAvaliacao: "2026-01-15" });

    const ultima = obterUltimaAvaliacaoMercado(db, 1);
    expect(ultima).toEqual({ valorAvaliado: 300000, dataAvaliacao: "2026-01-15", origem: "historico" });
  });
});

describe("relatorioPatrimonioMercado", () => {
  it("calcula a diferença histórico × mercado corretamente", async () => {
    const db = await bancoComImovel({ valorAquisicao: 200000 });
    registrarAvaliacaoMercado(db, { imovelId: 1, valorAvaliado: 260000, dataAvaliacao: "2026-01-15" });

    const relatorio = relatorioPatrimonioMercado(db);
    expect(relatorio.linhas).toHaveLength(1);
    const linha = relatorio.linhas[0];
    expect(linha.valorHistorico).toBe(200000);
    expect(linha.valorMercado).toBe(260000);
    expect(linha.diferencaAbsoluta).toBe(60000);
    expect(linha.diferencaPercentual).toBeCloseTo(30, 5);
    expect(linha.origemValorMercado).toBe("historico");

    expect(relatorio.totalHistorico).toBe(200000);
    expect(relatorio.totalMercado).toBe(260000);
    expect(relatorio.diferencaTotalAbsoluta).toBe(60000);
    expect(relatorio.diferencaTotalPercentual).toBeCloseTo(30, 5);
  });

  it("imóvel sem nenhuma avaliação aparece com valorMercado null, mas contribui pelo valor histórico no total", async () => {
    const db = await bancoComImovel({ valorAquisicao: 150000 });

    const relatorio = relatorioPatrimonioMercado(db);
    const linha = relatorio.linhas[0];
    expect(linha.valorMercado).toBeNull();
    expect(linha.origemValorMercado).toBe("indisponivel");
    expect(linha.diferencaAbsoluta).toBeNull();
    expect(relatorio.totalMercado).toBe(150000);
  });

  it("exclui imóvel de uso pessoal do relatório", async () => {
    const db = await bancoComImovel({ valorAquisicao: 200000, usoPessoal: 0 });
    executar(
      db,
      "INSERT INTO imoveis (id, apelido, tipo, cidade, uso_pessoal, valor_aquisicao) VALUES (2, 'Casa própria', 'outro', 'Curitiba', 1, 900000)",
    );
    registrarAvaliacaoMercado(db, { imovelId: 2, valorAvaliado: 1200000, dataAvaliacao: "2026-01-01" });

    const relatorio = relatorioPatrimonioMercado(db);
    expect(relatorio.linhas).toHaveLength(1);
    expect(relatorio.linhas[0].imovelId).toBe(1);
  });
});

describe("calcularIndicadoresViabilidade — NOI, Cap Rate, ROI a valor de mercado", () => {
  async function bancoComContratoEDespesa() {
    const db = await bancoComImovel({ valorAquisicao: 200000 });
    const r = criarEntidadeLegal(db, { nome: "Titular de Teste", cpf_cnpj: "52998224725" });
    if (!r.entidade_id) throw new Error(`Fixture não conseguiu criar a entidade: ${r.mensagem}`);

    // Contrato vigente o ano inteiro: aluguel de R$2.000/mês => R$24.000/ano de receita.
    executar(
      db,
      `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio)
       VALUES (1, 1, 'Inquilino Teste', 'residencial_fixo', 2000, '2020-01-01')`,
    );

    // Despesa operacional de R$500/mês (condomínio), lançada em contas_a_pagar em cada mês
    // do ano-base => R$6.000/ano de despesa. NOI anual esperado: 24000 - 6000 = 18000.
    for (let mes = 1; mes <= 12; mes++) {
      const mm = String(mes).padStart(2, "0");
      executar(
        db,
        `INSERT INTO contas_a_pagar (entidade_id, fornecedor_nome, valor, data_vencimento, status, imovel_id, criado_em)
         VALUES (?, 'Condomínio', 500, ?, 'pendente', 1, ?)`,
        [r.entidade_id, `2026-${mm}-10`, `2026-${mm}-01`],
      );
    }

    registrarAvaliacaoMercado(db, { imovelId: 1, valorAvaliado: 300000, dataAvaliacao: "2026-01-01" });

    return db;
  }

  it("calcula NOI anual, Cap Rate e ROI simples com dados conhecidos", async () => {
    const db = await bancoComContratoEDespesa();

    const indicadores = calcularIndicadoresViabilidade(db, 2026);
    expect(indicadores.imoveis).toHaveLength(1);
    const imovel = indicadores.imoveis[0];

    expect(imovel.noiAnual).toBeCloseTo(18000, 2);
    expect(imovel.valorMercado).toBe(300000);
    // Cap Rate = NOI anual / valor de mercado * 100 = 18000/300000*100 = 6%.
    expect(imovel.capRatePercentual).toBeCloseTo(6, 5);
    // ROI simples usa a mesma base (ver decisão de design documentada no módulo).
    expect(imovel.roiPercentual).toBeCloseTo(6, 5);

    expect(indicadores.noiAnualTotalConsiderado).toBeCloseTo(18000, 2);
    expect(indicadores.valorMercadoTotal).toBe(300000);
    expect(indicadores.capRateConsolidadoPercentual).toBeCloseTo(6, 5);
    expect(indicadores.roiConsolidadoPercentual).toBeCloseTo(6, 5);
    expect(indicadores.imoveisSemAvaliacaoMercado).toBe(0);
  });

  it("imóvel sem valor de mercado fica com capRate/roi null e é excluído do consolidado", async () => {
    const db = await bancoComImovel({ valorAquisicao: 200000 });
    const r = criarEntidadeLegal(db, { nome: "Titular de Teste", cpf_cnpj: "52998224725" });
    if (!r.entidade_id) throw new Error("fixture");

    const indicadores = calcularIndicadoresViabilidade(db, 2026);
    expect(indicadores.imoveis).toHaveLength(1);
    expect(indicadores.imoveis[0].valorMercado).toBeNull();
    expect(indicadores.imoveis[0].capRatePercentual).toBeNull();
    expect(indicadores.imoveis[0].roiPercentual).toBeNull();
    expect(indicadores.imoveisSemAvaliacaoMercado).toBe(1);
    expect(indicadores.valorMercadoTotal).toBe(0);
    expect(indicadores.capRateConsolidadoPercentual).toBeNull();
  });

  it("exclui imóvel de uso pessoal dos indicadores de viabilidade", async () => {
    const db = await bancoComContratoEDespesa();
    executar(
      db,
      "INSERT INTO imoveis (id, apelido, tipo, cidade, uso_pessoal, valor_aquisicao) VALUES (2, 'Casa própria', 'outro', 'Curitiba', 1, 900000)",
    );

    const indicadores = calcularIndicadoresViabilidade(db, 2026);
    expect(indicadores.imoveis.map((i) => i.imovelId)).toEqual([1]);
  });
});

describe("calcularPaybackMercado", () => {
  it("payback = valor de mercado / fluxo de caixa líquido anual", () => {
    const resultado = calcularPaybackMercado(300000, 18000);
    expect(resultado.valor).toBeCloseTo(300000 / 18000, 6); // 16,6667 anos
    expect(resultado.motivoIndisponivel).toBeNull();
    expect(resultado.formula).toContain("Payback");
  });

  it("retorna null sem valor de mercado", () => {
    const resultado = calcularPaybackMercado(null, 18000);
    expect(resultado.valor).toBeNull();
    expect(resultado.motivoIndisponivel).toMatch(/sem valor de mercado/);
  });

  it("retorna null com fluxo de caixa líquido anual não positivo (payback indefinido)", () => {
    const resultado = calcularPaybackMercado(300000, 0);
    expect(resultado.valor).toBeNull();
    expect(resultado.motivoIndisponivel).toMatch(/não positivo/);
  });
});

describe("calcularYieldsMercado", () => {
  it("yield bruto e líquido a mercado com dados conhecidos", () => {
    // Receita bruta anual 24000, receita líquida (NOI) anual 18000, valor de mercado 300000.
    const resultado = calcularYieldsMercado(24000, 18000, 300000);
    expect(resultado.bruto.valor).toBeCloseTo(8, 6); // 24000/300000*100
    expect(resultado.liquido.valor).toBeCloseTo(6, 6); // 18000/300000*100 — igual ao Cap Rate
    expect(resultado.bruto.motivoIndisponivel).toBeNull();
    expect(resultado.liquido.motivoIndisponivel).toBeNull();
  });

  it("retorna null (bruto e líquido) sem valor de mercado", () => {
    const resultado = calcularYieldsMercado(24000, 18000, null);
    expect(resultado.bruto.valor).toBeNull();
    expect(resultado.liquido.valor).toBeNull();
    expect(resultado.bruto.motivoIndisponivel).toMatch(/sem valor de mercado/);
    expect(resultado.liquido.motivoIndisponivel).toMatch(/sem valor de mercado/);
  });
});

function avaliacaoMock(valor: number, data: string, id: number): AvaliacaoMercado {
  return {
    id,
    imovel_id: 1,
    valor_avaliado: valor,
    data_avaliacao: data,
    metodologia: null,
    fonte: null,
    observacoes: null,
    criado_em: "2026-01-01 00:00:00",
  };
}

describe("calcularValorizacaoAnualizada (CAGR)", () => {
  it("retorna null com histórico insuficiente (0 avaliações)", () => {
    const resultado = calcularValorizacaoAnualizada([]);
    expect(resultado.valor).toBeNull();
    expect(resultado.motivoIndisponivel).toBe("histórico insuficiente — precisa de pelo menos 2 avaliações");
  });

  it("retorna null com histórico insuficiente (1 avaliação apenas)", () => {
    const resultado = calcularValorizacaoAnualizada([avaliacaoMock(300000, "2026-01-01", 1)]);
    expect(resultado.valor).toBeNull();
    expect(resultado.motivoIndisponivel).toBe("histórico insuficiente — precisa de pelo menos 2 avaliações");
  });

  it("calcula o CAGR com 2 avaliações — resultado verificável manualmente", () => {
    // Histórico vem ORDENADO DESC (mais recente primeiro), igual a listarAvaliacoesMercado.
    const historico: AvaliacaoMercado[] = [
      avaliacaoMock(200000, "2026-01-01", 2), // mais recente
      avaliacaoMock(100000, "2016-01-01", 1), // mais antiga — valor dobrou em ~10 anos
    ];

    const resultado = calcularValorizacaoAnualizada(historico);

    // Verificação manual independente da implementação: mesma fórmula, calculada aqui à parte.
    const dias =
      (new Date("2026-01-01T00:00:00Z").getTime() - new Date("2016-01-01T00:00:00Z").getTime()) /
      (1000 * 60 * 60 * 24);
    const anosEsperados = dias / 365.25;
    const cagrEsperado = (Math.pow(200000 / 100000, 1 / anosEsperados) - 1) * 100;

    expect(anosEsperados).toBeCloseTo(10, 1); // ~10 anos (3 anos bissextos no intervalo)
    expect(resultado.valor).toBeCloseTo(cagrEsperado, 8);
    expect(resultado.valor).toBeCloseTo(7.18, 1); // ordem de grandeza: dobrou em 10 anos ≈ 7,2% a.a.
    expect(resultado.motivoIndisponivel).toBeNull();
  });
});

describe("calcularTirAproximada — TIR (IRR) aproximada, resolvida por bisseção", () => {
  async function bancoComFinanciamento(opts: {
    valorAquisicao: number;
    dataContrato: string;
    valorMercado: number;
    dataAvaliacao: string;
  }) {
    const db = await bancoComImovel({ valorAquisicao: opts.valorAquisicao });
    executar(
      db,
      `INSERT INTO financiamentos
         (id, imovel_id, instituicao, sistema, valor_contratado, taxa_juros_mensal, data_contrato, parcelas_total, saldo_devedor_manual, parcela_mensal_manual)
       VALUES (1, 1, 'Banco Teste', 'OUTRO', 1, 0, ?, 1, 50000, 1000)`,
      [opts.dataContrato],
    );
    registrarAvaliacaoMercado(db, { imovelId: 1, valorAvaliado: opts.valorMercado, dataAvaliacao: opts.dataAvaliacao });
    return db;
  }

  it("caso verificável manualmente: fluxo de 1 ano só (-100000 → 110000) dá TIR = 10%", async () => {
    // valorAquisicao=100000, sem contrato de locação (noiAnual=0), financiamento contratado em
    // 2025-01-01 (proxy da aquisição), avaliação de mercado de 110000 em 2026-01-01 (~1 ano
    // depois). Fluxo: [-100000, 0 + 110000] → VPL(r) = -100000 + 110000/(1+r) = 0 → r = 10%.
    const db = await bancoComFinanciamento({
      valorAquisicao: 100000,
      dataContrato: "2025-01-01",
      valorMercado: 110000,
      dataAvaliacao: "2026-01-01",
    });

    const ultima = obterUltimaAvaliacaoMercado(db, 1)!;
    const resultado = calcularTirAproximada(db, 1, 100000, 0, ultima.valorAvaliado, ultima.dataAvaliacao);

    expect(resultado.motivoIndisponivel).toBeNull();
    expect(resultado.valor).toBeCloseTo(10, 4);
    expect(resultado.fonteDados).toMatch(/APROXIMAÇÃO/);
  });

  it("segundo caso verificável: fluxo com NOI positivo (-200000 → 318000 em 1 ano) dá TIR = 59%", async () => {
    const db = await bancoComFinanciamento({
      valorAquisicao: 200000,
      dataContrato: "2025-01-01",
      valorMercado: 300000,
      dataAvaliacao: "2026-01-01",
    });
    const ultima = obterUltimaAvaliacaoMercado(db, 1)!;
    // NOI anual de 18000: fluxo final = 18000 + 300000 = 318000. VPL(r) = -200000 + 318000/(1+r) = 0
    // → 1+r = 318000/200000 = 1,59 → r = 59%.
    const resultado = calcularTirAproximada(db, 1, 200000, 18000, ultima.valorAvaliado, ultima.dataAvaliacao);

    expect(resultado.motivoIndisponivel).toBeNull();
    expect(resultado.valor).toBeCloseTo(59, 4);
  });

  it("retorna null sem valor de aquisição cadastrado", async () => {
    const db = await bancoComImovel({ valorAquisicao: 0 });
    registrarAvaliacaoMercado(db, { imovelId: 1, valorAvaliado: 300000, dataAvaliacao: "2026-01-01" });
    const resultado = calcularTirAproximada(db, 1, null, 0, 300000, "2026-01-01");
    expect(resultado.valor).toBeNull();
    expect(resultado.motivoIndisponivel).toMatch(/sem valor de aquisição/);
  });

  it("retorna null sem valor de mercado conhecido", async () => {
    const db = await bancoComImovel({ valorAquisicao: 200000 });
    const resultado = calcularTirAproximada(db, 1, 200000, 0, null, null);
    expect(resultado.valor).toBeNull();
    expect(resultado.motivoIndisponivel).toMatch(/sem valor de mercado/);
  });

  it("retorna null sem data de referência para a aquisição (nem financiamento, nem histórico)", async () => {
    const db = await bancoComImovel({ valorAquisicao: 200000 });
    // Sem histórico de avaliações e sem financiamento — só o cache valor_venal_atual.
    executar(db, "UPDATE imoveis SET valor_venal_atual = 300000, data_avaliacao_venal = '2026-01-01' WHERE id = 1");
    const resultado = calcularTirAproximada(db, 1, 200000, 0, 300000, "2026-01-01");
    expect(resultado.valor).toBeNull();
    expect(resultado.motivoIndisponivel).toMatch(/sem data de referência/);
  });
});

describe("calcularLtvMercado e calcularDscrMercado — a valor de mercado", () => {
  async function bancoComFinanciamentoOutro() {
    const db = await bancoComImovel({ valorAquisicao: 200000 });
    executar(
      db,
      `INSERT INTO financiamentos
         (id, imovel_id, instituicao, sistema, valor_contratado, taxa_juros_mensal, data_contrato, parcelas_total, saldo_devedor_manual, parcela_mensal_manual)
       VALUES (1, 1, 'Banco Teste', 'OUTRO', 1, 0, '2025-01-01', 1, 50000, 1000)`,
    );
    return db;
  }

  it("LTV a mercado = saldo devedor / valor de mercado × 100", async () => {
    const db = await bancoComFinanciamentoOutro();
    const resultado = calcularLtvMercado(db, 1, 300000, "2026-09-29");
    expect(resultado.valor).toBeCloseTo((50000 / 300000) * 100, 6); // 16,6667%
    expect(resultado.motivoIndisponivel).toBeNull();
  });

  it("LTV é 0 (não null) quando o imóvel não tem financiamento", async () => {
    const db = await bancoComImovel({ valorAquisicao: 200000 });
    const resultado = calcularLtvMercado(db, 1, 300000, "2026-09-29");
    expect(resultado.valor).toBe(0);
    expect(resultado.motivoIndisponivel).toBeNull();
  });

  it("LTV retorna null sem valor de mercado conhecido", async () => {
    const db = await bancoComFinanciamentoOutro();
    const resultado = calcularLtvMercado(db, 1, null, "2026-09-29");
    expect(resultado.valor).toBeNull();
    expect(resultado.motivoIndisponivel).toMatch(/sem valor de mercado/);
  });

  it("LTV retorna null quando financiamento 'OUTRO' não tem saldo_devedor_manual informado", async () => {
    const db = await bancoComImovel({ valorAquisicao: 200000 });
    executar(
      db,
      `INSERT INTO financiamentos
         (id, imovel_id, instituicao, sistema, valor_contratado, taxa_juros_mensal, data_contrato, parcelas_total)
       VALUES (1, 1, 'Banco Teste', 'OUTRO', 1, 0, '2025-01-01', 1)`,
    );
    const resultado = calcularLtvMercado(db, 1, 300000, "2026-09-29");
    expect(resultado.valor).toBeNull();
    expect(resultado.motivoIndisponivel).toMatch(/saldo devedor incompleto/);
  });

  it("DSCR = NOI anual / serviço da dívida anual", async () => {
    const db = await bancoComFinanciamentoOutro();
    // parcela_mensal_manual = 1000 → serviço da dívida anual = 12000. NOI anual = 18000.
    const resultado = calcularDscrMercado(db, 1, 18000, "2026-09-29");
    expect(resultado.valor).toBeCloseTo(18000 / 12000, 6); // 1,5
    expect(resultado.motivoIndisponivel).toBeNull();
    expect(resultado.fonteDados).toMatch(/Idêntico ao DSCR a custo histórico/);
  });

  it("DSCR retorna null quando o imóvel não tem financiamento cadastrado", async () => {
    const db = await bancoComImovel({ valorAquisicao: 200000 });
    const resultado = calcularDscrMercado(db, 1, 18000, "2026-09-29");
    expect(resultado.valor).toBeNull();
    expect(resultado.motivoIndisponivel).toMatch(/sem financiamento cadastrado/);
  });
});

describe("calcularIndicadoresViabilidade — indicadores avançados integrados (payback, yields, CAGR, TIR, LTV, DSCR)", () => {
  async function bancoCompleto() {
    const db = await bancoComImovel({ valorAquisicao: 200000 });
    const r = criarEntidadeLegal(db, { nome: "Titular de Teste", cpf_cnpj: "52998224725" });
    if (!r.entidade_id) throw new Error(`Fixture não conseguiu criar a entidade: ${r.mensagem}`);

    // Contrato vigente o ano inteiro: aluguel de R$2.000/mês => R$24.000/ano de receita bruta.
    executar(
      db,
      `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio)
       VALUES (1, 1, 'Inquilino Teste', 'residencial_fixo', 2000, '2020-01-01')`,
    );
    // Despesa operacional de R$500/mês => R$6.000/ano. NOI anual = 24000 - 6000 = 18000.
    for (let mes = 1; mes <= 12; mes++) {
      const mm = String(mes).padStart(2, "0");
      executar(
        db,
        `INSERT INTO contas_a_pagar (entidade_id, fornecedor_nome, valor, data_vencimento, status, imovel_id, criado_em)
         VALUES (?, 'Condomínio', 500, ?, 'pendente', 1, ?)`,
        [r.entidade_id, `2026-${mm}-10`, `2026-${mm}-01`],
      );
    }
    // Financiamento 'OUTRO': saldo devedor 50000, parcela mensal 1000, contratado em 2025-01-01
    // (proxy da data de aquisição, já que imoveis não tem data_aquisicao).
    executar(
      db,
      `INSERT INTO financiamentos
         (id, imovel_id, instituicao, sistema, valor_contratado, taxa_juros_mensal, data_contrato, parcelas_total, saldo_devedor_manual, parcela_mensal_manual)
       VALUES (1, 1, 'Banco Teste', 'OUTRO', 1, 0, '2025-01-01', 1, 50000, 1000)`,
    );
    // Uma única avaliação de mercado — histórico insuficiente para CAGR (< 2 pontos).
    registrarAvaliacaoMercado(db, { imovelId: 1, valorAvaliado: 300000, dataAvaliacao: '2026-01-01' });

    return db;
  }

  it("payback, yields, LTV e DSCR a mercado com dados conhecidos; CAGR null (histórico insuficiente)", async () => {
    const db = await bancoCompleto();
    const indicadores = calcularIndicadoresViabilidade(db, 2026);
    const imovel = indicadores.imoveis[0];

    // Payback = 300000 / 18000.
    expect(imovel.paybackMercadoAnos.valor).toBeCloseTo(300000 / 18000, 6);
    expect(imovel.paybackMercadoAnos.motivoIndisponivel).toBeNull();

    // Yield bruto = 24000/300000*100 = 8%; yield líquido = 18000/300000*100 = 6% (= Cap Rate).
    expect(imovel.yieldBrutoMercadoPercentual.valor).toBeCloseTo(8, 6);
    expect(imovel.yieldLiquidoMercadoPercentual.valor).toBeCloseTo(6, 6);
    expect(imovel.yieldLiquidoMercadoPercentual.valor).toBeCloseTo(imovel.capRatePercentual!, 6);

    // CAGR: só 1 avaliação no histórico → null.
    expect(imovel.valorizacaoAnualizadaPercentual.valor).toBeNull();
    expect(imovel.valorizacaoAnualizadaPercentual.motivoIndisponivel).toBe(
      "histórico insuficiente — precisa de pelo menos 2 avaliações",
    );

    // TIR aproximada: fluxo [-200000, 18000+300000=318000] em ~1 ano → 59%.
    expect(imovel.tirAproximadaPercentual.valor).toBeCloseTo(59, 3);
    expect(imovel.tirAproximadaPercentual.fonteDados).toMatch(/APROXIMAÇÃO/);

    // LTV a mercado = 50000/300000*100.
    expect(imovel.ltvMercadoPercentual.valor).toBeCloseTo((50000 / 300000) * 100, 6);

    // DSCR = 18000 / (1000*12) = 1,5.
    expect(imovel.dscrMercado.valor).toBeCloseTo(1.5, 6);
  });
});
