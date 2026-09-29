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
