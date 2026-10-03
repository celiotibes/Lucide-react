import { describe, expect, it, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { consultar, executar } from "../../db/connection";
import { criarEntidadeLegal } from "../erp/entidadeLegal";
import { registrarLancamentoContabil } from "../erp/ledger";
import { registrarAvaliacaoMercado } from "../patrimonio/avaliacaoMercado";
import { registrarRateioDestino } from "./rateioDividas";
import { obterJurosPagosPeriodo, type EventoJuros } from "./historicoJuros";
import {
  classificarJurosPorAtividade,
  patrimonioLiquidoAjustadoPorJuros,
  impactoJurosNaLiquidezMensal,
  impactoJurosNoResultadoAnual,
} from "./indicadoresAjustadosJuros";

const CPF_TESTE = "52998224725";

// Contas do plano de contas ERP (ver src/domain/erp/planoDeContasErp.ts) usadas nos testes
// de impactoJurosNoResultadoAnual, que lançam diretamente no razão via registrarLancamentoContabil.
const CONTA_RECEITA_ALUGUEL = 4101; // 4.1.01
const CONTA_DESPESA_JUROS_FINANCIAMENTO = 5501; // 5.5.01
const CONTA_DESPESA_CONDOMINIO = 5210; // 5.2.10

let db: Database;

beforeEach(async () => {
  db = await criarBancoDeTeste();
});

function ultimoId(tabela: string): number {
  return consultar<{ id: number }>(db, `SELECT id FROM ${tabela} ORDER BY id DESC LIMIT 1`)[0].id;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function criarImovel(overrides: Partial<{ apelido: string; valorAquisicao: number | null }> = {}): number {
  const p = { apelido: "Kitnet Teste", valorAquisicao: null as number | null, ...overrides };
  executar(db, "INSERT INTO imoveis (apelido, tipo, financiado, valor_aquisicao) VALUES (?, 'kitnet', 1, ?)", [
    p.apelido,
    p.valorAquisicao,
  ]);
  return ultimoId("imoveis");
}

function criarFinanciamentoSac(
  overrides: Partial<{
    imovelId: number;
    instituicao: string;
    valorContratado: number;
    taxaJurosMensal: number;
    dataContrato: string;
    parcelasTotal: number;
  }> = {},
): number {
  const p = {
    imovelId: overrides.imovelId ?? criarImovel(),
    instituicao: "Caixa",
    valorContratado: 12000,
    taxaJurosMensal: 1,
    dataContrato: "2024-01-01",
    parcelasTotal: 12,
    ...overrides,
  };
  executar(
    db,
    "INSERT INTO financiamentos (imovel_id, instituicao, sistema, valor_contratado, taxa_juros_mensal, data_contrato, parcelas_total) VALUES (?, ?, 'SAC', ?, ?, ?, ?)",
    [p.imovelId, p.instituicao, p.valorContratado, p.taxaJurosMensal, p.dataContrato, p.parcelasTotal],
  );
  return ultimoId("financiamentos");
}

function criarContrato(
  imovelId: number,
  overrides: Partial<{ valorReferencia: number; dataInicio: string; diaVencimento: number }> = {},
): number {
  const p = { valorReferencia: 1000, dataInicio: "2020-01-01", diaVencimento: 10, ...overrides };
  executar(
    db,
    `INSERT INTO contratos_locacao
      (imovel_id, locatario, tipo, valor_referencia, dia_vencimento, data_inicio,
       multa_percentual, multa_ate_dias, multa_percentual_substitutiva, juros_mensal_percentual)
     VALUES (?, 'Locatário Teste', 'residencial_fixo', ?, ?, ?, 2.0, 5, 10.0, 1.0)`,
    [imovelId, p.valorReferencia, p.diaVencimento, p.dataInicio],
  );
  return ultimoId("contratos_locacao");
}

function criarPeriodo(entidadeId: number, ano: number, mes: number): number {
  executar(db, "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, ?, ?, 'aberto')", [
    entidadeId,
    ano,
    mes,
  ]);
  return ultimoId("periodos_contabeis");
}

let proximoOrigemId = 1;
function lancarReceitaAluguel(entidadeId: number, periodoId: number, valor: number, data: string): void {
  registrarLancamentoContabil(db, {
    entidade_id: entidadeId,
    periodo_id: periodoId,
    conta_id: CONTA_RECEITA_ALUGUEL,
    data_lancamento: data,
    valor_credito: valor,
    descricao: "Aluguel recebido (teste)",
    origem_modulo: "manual",
    origem_id: proximoOrigemId++,
    referencia_documento: `TESTE-RECEITA-${proximoOrigemId}`,
  });
}

function lancarDespesaJurosFinanciamento(entidadeId: number, periodoId: number, valor: number, data: string): void {
  registrarLancamentoContabil(db, {
    entidade_id: entidadeId,
    periodo_id: periodoId,
    conta_id: CONTA_DESPESA_JUROS_FINANCIAMENTO,
    data_lancamento: data,
    valor_debito: valor,
    descricao: "Juros de financiamento (teste)",
    origem_modulo: "manual",
    origem_id: proximoOrigemId++,
    referencia_documento: `TESTE-JUROS-${proximoOrigemId}`,
  });
}

function lancarDespesaCondominio(entidadeId: number, periodoId: number, valor: number, data: string): void {
  registrarLancamentoContabil(db, {
    entidade_id: entidadeId,
    periodo_id: periodoId,
    conta_id: CONTA_DESPESA_CONDOMINIO,
    data_lancamento: data,
    valor_debito: valor,
    descricao: "Condomínio (teste)",
    origem_modulo: "manual",
    origem_id: proximoOrigemId++,
    referencia_documento: `TESTE-DESPESA-${proximoOrigemId}`,
  });
}

/** Evento de juros mínimo e válido para os testes puros de `classificarJurosPorAtividade`
 * (não depende de banco — só a quebra por destino importa para essa função). */
function eventoStub(quebraPorDestino: EventoJuros["quebraPorDestino"], valorJuros: number): EventoJuros {
  return {
    data: "2024-01-01",
    ano: 2024,
    mes: 1,
    dividaTipo: "financiamento",
    dividaId: 1,
    descricaoDivida: "Evento de teste",
    valorJuros,
    fonte: "exato",
    formula: "teste",
    fonteDados: "teste",
    quebraPorDestino,
  };
}

describe("indicadoresAjustadosJuros", () => {
  describe("classificarJurosPorAtividade", () => {
    it("separa corretamente por destino e a soma bate com o total dos eventos de entrada", () => {
      const eventos: EventoJuros[] = [
        eventoStub(
          [
            { destino: "Empresa (imóveis)", valor: 100 },
            { destino: "Pessoal", valor: 50 },
          ],
          150,
        ),
        eventoStub(
          [
            { destino: "Advocacia", valor: 30 },
            { destino: "não classificado", valor: 20 },
          ],
          50,
        ),
      ];

      const resultado = classificarJurosPorAtividade(eventos);

      const totalDeEntrada = eventos.reduce((soma, e) => soma + e.valorJuros, 0);
      expect(resultado.descontadoDaAtividade + resultado.excluidoPessoal + resultado.excluidoAdvocacia).toBeCloseTo(
        totalDeEntrada,
        2,
      );

      expect(resultado.descontadoDaAtividade).toBeCloseTo(120, 2); // 100 (empresa) + 20 (não classificado)
      expect(resultado.excluidoPessoal).toBeCloseTo(50, 2);
      expect(resultado.excluidoAdvocacia).toBeCloseTo(30, 2);
      expect(resultado.incluidoNaoClassificado).toBeCloseTo(20, 2);
      // "não classificado" é sempre um SUBCONJUNTO do descontado, nunca somado em dobro.
      expect(resultado.incluidoNaoClassificado).toBeLessThanOrEqual(resultado.descontadoDaAtividade);
    });

    it("rótulos de destino livres (nem pessoal, nem advocacia, nem 'não classificado') entram no desconto da atividade", () => {
      const eventos: EventoJuros[] = [eventoStub([{ destino: "Empresa (imóveis de locação/Airbnb)", valor: 200 }], 200)];
      const resultado = classificarJurosPorAtividade(eventos);
      expect(resultado.descontadoDaAtividade).toBeCloseTo(200, 2);
      expect(resultado.excluidoPessoal).toBe(0);
      expect(resultado.excluidoAdvocacia).toBe(0);
      expect(resultado.incluidoNaoClassificado).toBe(0);
      expect(resultado.aviso).toBeNull();
    });

    it("segrega por substring case-insensitive: qualquer destino contendo 'pessoal' ou 'advocacia' é excluído (exigência de separação PF × empresa)", () => {
      const eventos: EventoJuros[] = [
        eventoStub(
          [
            { destino: "Despesa PESSOAL do titular", valor: 40 },
            { destino: "Honorários de Advocacia", valor: 25 },
            { destino: "Empresa (imóveis)", valor: 35 },
          ],
          100,
        ),
      ];
      const resultado = classificarJurosPorAtividade(eventos);
      expect(resultado.excluidoPessoal).toBeCloseTo(40, 2);
      expect(resultado.excluidoAdvocacia).toBeCloseTo(25, 2);
      expect(resultado.descontadoDaAtividade).toBeCloseTo(35, 2);
    });

    it("quebraPorDestino vazia não contribui para nenhum total e não quebra o cálculo", () => {
      const eventos: EventoJuros[] = [eventoStub([], 100)];
      const resultado = classificarJurosPorAtividade(eventos);
      expect(resultado.descontadoDaAtividade).toBe(0);
      expect(resultado.excluidoPessoal).toBe(0);
      expect(resultado.excluidoAdvocacia).toBe(0);
      expect(resultado.incluidoNaoClassificado).toBe(0);
      expect(resultado.aviso).toBeNull();
    });

    it("sem nenhum evento, retorna todos os totais zerados e aviso null", () => {
      const resultado = classificarJurosPorAtividade([]);
      expect(resultado).toEqual({
        descontadoDaAtividade: 0,
        incluidoNaoClassificado: 0,
        excluidoPessoal: 0,
        excluidoAdvocacia: 0,
        aviso: null,
      });
    });

    it("aviso de 'não classificado' só aparece quando há valor não classificado, e cita o valor formatado", () => {
      const comNaoClassificado = classificarJurosPorAtividade([eventoStub([{ destino: "não classificado", valor: 20 }], 20)]);
      expect(comNaoClassificado.aviso).toContain("R$");
      expect(comNaoClassificado.aviso).toContain("20,00");

      const semNaoClassificado = classificarJurosPorAtividade([eventoStub([{ destino: "Empresa (imóveis)", valor: 20 }], 20)]);
      expect(semNaoClassificado.aviso).toBeNull();
    });
  });

  describe("patrimonioLiquidoAjustadoPorJuros", () => {
    it("rejeita período invertido (anoFim antes de anoInicio)", () => {
      expect(() => patrimonioLiquidoAjustadoPorJuros(db, { anoInicio: 2025, anoFim: 2024 })).toThrow(/Período inválido/);
    });

    it("desconta os juros da atividade do ganho bruto — o ganho líquido de juros é menor que o bruto e o retorno líquido cai em relação ao bruto", () => {
      const imovelId = criarImovel({ apelido: "Kitnet A", valorAquisicao: 300000 });
      criarContrato(imovelId, { valorReferencia: 2000, dataInicio: "2020-01-01" });
      const financiamentoId = criarFinanciamentoSac({
        imovelId,
        valorContratado: 12000,
        taxaJurosMensal: 1,
        dataContrato: "2024-01-01",
        parcelasTotal: 12,
      });
      registrarRateioDestino(db, { dividaTipo: "financiamento", dividaId: financiamentoId, destino: "Empresa (imóveis)", percentual: 100 });

      const resultado = patrimonioLiquidoAjustadoPorJuros(db, { anoInicio: 2024, anoFim: 2024 });

      // Confere a classificação diretamente contra o módulo reaproveitado (sem reimplementar
      // a lógica de reconstituição de juros aqui).
      const eventos = obterJurosPagosPeriodo(db, { anoInicio: 2024, anoFim: 2024 });
      const classificacao = classificarJurosPorAtividade(eventos);

      expect(resultado.custoHistorico.ganhoPatrimonioLiquidoBruto).toBeCloseTo(2000 * 12, 2); // NOI anual = aluguel (sem despesa)
      expect(resultado.custoHistorico.jurosDescontados).toBeCloseTo(classificacao.descontadoDaAtividade, 2);
      expect(classificacao.descontadoDaAtividade).toBeGreaterThan(0);
      expect(resultado.custoHistorico.ganhoLiquidoDeJuros).toBeCloseTo(
        resultado.custoHistorico.ganhoPatrimonioLiquidoBruto - classificacao.descontadoDaAtividade,
        2,
      );
      expect(resultado.custoHistorico.denominadorReferencia).toBe(300000);
      expect(resultado.custoHistorico.motivoRetornoIndisponivel).toBeNull();
      expect(resultado.custoHistorico.retornoBrutoPercentual).not.toBeNull();
      expect(resultado.custoHistorico.retornoLiquidoDeJurosPercentual).not.toBeNull();
      // o indicador "modulado por juros" pedido pelo usuário: o retorno líquido de juros é
      // estritamente menor que o retorno bruto, porque há juros pagos atribuídos à atividade.
      expect(resultado.custoHistorico.retornoLiquidoDeJurosPercentual!).toBeLessThan(
        resultado.custoHistorico.retornoBrutoPercentual!,
      );

      // valorMercado: mesmo ganho bruto/líquido de juros (não depende do valor do imóvel).
      expect(resultado.valorMercado.ganhoPatrimonioLiquidoBruto).toBeCloseTo(resultado.custoHistorico.ganhoPatrimonioLiquidoBruto, 2);
      expect(resultado.valorMercado.jurosDescontados).toBeCloseTo(resultado.custoHistorico.jurosDescontados, 2);

      expect(resultado.jurosTotaisReconstituidos).toBeCloseTo(
        eventos.reduce((soma, e) => soma + e.valorJuros, 0),
        2,
      );
    });

    it("acumula o NOI de múltiplos anos do período (ganho bruto não é só o do último ano)", () => {
      const imovelId = criarImovel({ apelido: "Kitnet B", valorAquisicao: 100000 });
      criarContrato(imovelId, { valorReferencia: 1000, dataInicio: "2020-01-01" });

      const doisAnos = patrimonioLiquidoAjustadoPorJuros(db, { anoInicio: 2024, anoFim: 2025 });
      const umAno = patrimonioLiquidoAjustadoPorJuros(db, { anoInicio: 2024, anoFim: 2024 });

      expect(doisAnos.custoHistorico.ganhoPatrimonioLiquidoBruto).toBeCloseTo(2 * umAno.custoHistorico.ganhoPatrimonioLiquidoBruto, 2);
    });

    it("sem avaliação de mercado, a base 'valor de mercado' fica indisponível com motivo claro; com avaliação, usa o valor de mercado como denominador", () => {
      const imovelId = criarImovel({ apelido: "Kitnet C", valorAquisicao: 300000 });
      criarContrato(imovelId, { valorReferencia: 2000, dataInicio: "2020-01-01" });

      const semAvaliacao = patrimonioLiquidoAjustadoPorJuros(db, { anoInicio: 2024, anoFim: 2024 });
      expect(semAvaliacao.valorMercado.denominadorReferencia).toBe(0);
      expect(semAvaliacao.valorMercado.retornoBrutoPercentual).toBeNull();
      expect(semAvaliacao.valorMercado.retornoLiquidoDeJurosPercentual).toBeNull();
      expect(semAvaliacao.valorMercado.motivoRetornoIndisponivel).toBeTruthy();

      registrarAvaliacaoMercado(db, { imovelId, valorAvaliado: 350000, dataAvaliacao: "2024-06-01" });
      const comAvaliacao = patrimonioLiquidoAjustadoPorJuros(db, { anoInicio: 2024, anoFim: 2024 });
      expect(comAvaliacao.valorMercado.denominadorReferencia).toBe(350000);
      expect(comAvaliacao.valorMercado.motivoRetornoIndisponivel).toBeNull();
      expect(comAvaliacao.valorMercado.retornoBrutoPercentual).toBeCloseTo((comAvaliacao.valorMercado.ganhoPatrimonioLiquidoBruto / 350000) * 100, 2);
    });

    it("sem nenhum imóvel com valor_aquisicao cadastrado, a base 'custo histórico' fica indisponível com motivo claro", () => {
      criarImovel({ apelido: "Sem valor", valorAquisicao: null });
      const resultado = patrimonioLiquidoAjustadoPorJuros(db, { anoInicio: 2024, anoFim: 2024 });
      expect(resultado.custoHistorico.denominadorReferencia).toBe(0);
      expect(resultado.custoHistorico.retornoBrutoPercentual).toBeNull();
      expect(resultado.custoHistorico.retornoLiquidoDeJurosPercentual).toBeNull();
      expect(resultado.custoHistorico.motivoRetornoIndisponivel).toBeTruthy();
    });

    it("segrega juros pessoais e de advocacia do desconto — exigência de separação PF × empresa: descontar o rateio errado subestimaria o ganho líquido", () => {
      const imovelId = criarImovel({ apelido: "Kitnet D", valorAquisicao: 300000 });
      criarContrato(imovelId, { valorReferencia: 1000, dataInicio: "2020-01-01" });
      const financiamentoId = criarFinanciamentoSac({
        imovelId,
        valorContratado: 12000,
        taxaJurosMensal: 1,
        dataContrato: "2024-01-01",
        parcelasTotal: 12,
      });
      registrarRateioDestino(db, { dividaTipo: "financiamento", dividaId: financiamentoId, destino: "Pessoal", percentual: 60 });
      registrarRateioDestino(db, { dividaTipo: "financiamento", dividaId: financiamentoId, destino: "Empresa (imóveis)", percentual: 40 });

      const resultado = patrimonioLiquidoAjustadoPorJuros(db, { anoInicio: 2024, anoFim: 2024 });

      expect(resultado.jurosExcluidosPessoal).toBeCloseTo(resultado.jurosTotaisReconstituidos * 0.6, 1);
      expect(resultado.custoHistorico.jurosDescontados).toBeCloseTo(resultado.jurosTotaisReconstituidos * 0.4, 1);
      // descontar o total de juros (em vez de só a fatia da empresa) subestimaria o ganho líquido.
      expect(resultado.custoHistorico.ganhoLiquidoDeJuros).toBeGreaterThan(
        resultado.custoHistorico.ganhoPatrimonioLiquidoBruto - resultado.jurosTotaisReconstituidos,
      );
    });

    it("juros sem rateio cadastrado ficam 'não classificado' e disparam o aviso, mas ainda são descontados por precaução", () => {
      const imovelId = criarImovel({ apelido: "Kitnet E", valorAquisicao: 300000 });
      criarContrato(imovelId, { valorReferencia: 1000, dataInicio: "2020-01-01" });
      criarFinanciamentoSac({ imovelId, valorContratado: 12000, taxaJurosMensal: 1, dataContrato: "2024-01-01", parcelasTotal: 12 });
      // nenhum rateio cadastrado para este financiamento.

      const resultado = patrimonioLiquidoAjustadoPorJuros(db, { anoInicio: 2024, anoFim: 2024 });

      expect(resultado.jurosIncluidosNaoClassificado).toBeGreaterThan(0);
      expect(resultado.avisoJurosNaoClassificado).toBeTruthy();
      expect(resultado.custoHistorico.jurosDescontados).toBeCloseTo(resultado.jurosIncluidosNaoClassificado, 2);
    });
  });

  describe("impactoJurosNaLiquidezMensal", () => {
    it("calcula o percentual do fluxo de caixa líquido mensal comprometido pelos juros do mês", () => {
      const imovelId = criarImovel({ apelido: "Kitnet A" });
      criarContrato(imovelId, { valorReferencia: 1000, dataInicio: "2020-01-01" });
      const financiamentoId = criarFinanciamentoSac({
        imovelId,
        valorContratado: 12000,
        taxaJurosMensal: 1,
        dataContrato: "2024-01-01",
        parcelasTotal: 12,
      });
      registrarRateioDestino(db, { dividaTipo: "financiamento", dividaId: financiamentoId, destino: "Empresa (imóveis)", percentual: 100 });

      // primeira parcela do financiamento cai em fev/2024 (1 mês após o contrato).
      const resultado = impactoJurosNaLiquidezMensal(db, 2024, 2);

      expect(resultado.fluxoCaixaLiquidoDoMes).toBeCloseTo(1000, 2);
      expect(resultado.jurosDoMes).toBeGreaterThan(0);
      expect(resultado.percentualComprometidoPorJuros).toBeCloseTo((resultado.jurosDoMes / 1000) * 100, 2);
      expect(resultado.motivoPercentualIndisponivel).toBeNull();
      expect(resultado.jurosExcluidosPessoal).toBe(0);
    });

    it("mês sem nenhum juro pago: percentual comprometido é zero", () => {
      const imovelId = criarImovel({ apelido: "Kitnet B" });
      criarContrato(imovelId, { valorReferencia: 1000, dataInicio: "2020-01-01" });
      // janeiro/2024: antes da 1ª parcela do financiamento (que só existiria a partir de fev).

      const resultado = impactoJurosNaLiquidezMensal(db, 2024, 1);
      expect(resultado.jurosDoMes).toBe(0);
      expect(resultado.percentualComprometidoPorJuros).toBe(0);
      expect(resultado.motivoPercentualIndisponivel).toBeNull();
    });

    it("fluxo de caixa líquido do mês zero: percentual fica indisponível com motivo claro (não divide por zero)", () => {
      // nenhum imóvel/contrato cadastrado — portfólio inteiro sem receita nem despesa no mês.
      const resultado = impactoJurosNaLiquidezMensal(db, 2024, 1);
      expect(resultado.fluxoCaixaLiquidoDoMes).toBe(0);
      expect(resultado.percentualComprometidoPorJuros).toBeNull();
      expect(resultado.motivoPercentualIndisponivel).toContain("zero");
    });

    it("fluxo de caixa líquido do mês negativo: percentual fica indisponível, mas os valores crus continuam expostos", () => {
      const r = criarEntidadeLegal(db, { nome: "Titular Teste", cpf_cnpj: CPF_TESTE });
      if (!r.entidade_id) throw new Error(`Falha ao criar entidade: ${r.mensagem}`);
      const imovelId = criarImovel({ apelido: "Kitnet C" });
      criarContrato(imovelId, { valorReferencia: 500, dataInicio: "2020-01-01" });
      executar(
        db,
        "INSERT INTO contas_a_pagar (entidade_id, fornecedor_nome, valor, data_vencimento, status, imovel_id, criado_em) VALUES (?, 'Condomínio Teste', ?, ?, 'pendente', ?, ?)",
        [r.entidade_id, 2000, "2024-01-15", imovelId, "2024-01-01"],
      );

      const resultado = impactoJurosNaLiquidezMensal(db, 2024, 1);
      expect(resultado.fluxoCaixaLiquidoDoMes).toBeLessThan(0);
      expect(resultado.percentualComprometidoPorJuros).toBeNull();
      expect(resultado.motivoPercentualIndisponivel).toBeTruthy();
    });
  });

  describe("impactoJurosNoResultadoAnual", () => {
    it("sem nenhum juro de financiamento lançado manualmente no razão, resultadoLiquidoSemConsiderarJuros é igual ao resultado líquido oficial da DRE", () => {
      const r = criarEntidadeLegal(db, { nome: "Titular Teste", cpf_cnpj: CPF_TESTE });
      if (!r.entidade_id) throw new Error(`Falha ao criar entidade: ${r.mensagem}`);
      const entidadeId = r.entidade_id;

      for (let mes = 1; mes <= 12; mes++) {
        const periodoId = criarPeriodo(entidadeId, 2024, mes);
        lancarReceitaAluguel(entidadeId, periodoId, 2000, `2024-${pad(mes)}-05`);
      }

      const imovelId = criarImovel({ apelido: "Kitnet A", valorAquisicao: 300000 });
      const financiamentoId = criarFinanciamentoSac({
        imovelId,
        valorContratado: 12000,
        taxaJurosMensal: 1,
        dataContrato: "2024-01-01",
        parcelasTotal: 12,
      });
      registrarRateioDestino(db, { dividaTipo: "financiamento", dividaId: financiamentoId, destino: "Empresa (imóveis)", percentual: 100 });

      const resultado = impactoJurosNoResultadoAnual(db, 2024);

      expect(resultado.jurosJaContabilizadosNoDRE).toBe(0);
      expect(resultado.resultadoLiquidoAnual).toBeCloseTo(2000 * 12, 2);
      expect(resultado.resultadoLiquidoSemConsiderarJuros).toBeCloseTo(resultado.resultadoLiquidoAnual, 2);
      expect(resultado.jurosDoAno).toBeGreaterThan(0);
      expect(resultado.percentualDoResultadoConsumidoPorJuros).toBeCloseTo(
        (resultado.jurosDoAno / resultado.resultadoLiquidoSemConsiderarJuros) * 100,
        2,
      );
      expect(resultado.motivoPercentualIndisponivel).toBeNull();
      expect(resultado.alertaDuplaContagem).toBeTruthy();
    });

    it("quando há juros de financiamento JÁ lançados manualmente no razão, 'desfaz' exatamente essa subtração em vez de contar jurosDoAno duas vezes", () => {
      const r = criarEntidadeLegal(db, { nome: "Titular Teste", cpf_cnpj: CPF_TESTE });
      if (!r.entidade_id) throw new Error(`Falha ao criar entidade: ${r.mensagem}`);
      const entidadeId = r.entidade_id;

      const periodosIds: number[] = [];
      for (let mes = 1; mes <= 12; mes++) {
        const periodoId = criarPeriodo(entidadeId, 2024, mes);
        periodosIds.push(periodoId);
        lancarReceitaAluguel(entidadeId, periodoId, 2000, `2024-${pad(mes)}-05`);
      }
      // R$500 de juros de financiamento lançados manualmente no razão em janeiro/2024.
      lancarDespesaJurosFinanciamento(entidadeId, periodosIds[0], 500, "2024-01-15");

      const resultado = impactoJurosNoResultadoAnual(db, 2024);

      expect(resultado.jurosJaContabilizadosNoDRE).toBeCloseTo(500, 2);
      // a DRE oficial já está R$500 menor por causa do lançamento manual.
      expect(resultado.resultadoLiquidoAnual).toBeCloseTo(2000 * 12 - 500, 2);
      // mas "antes de qualquer juro" desfaz exatamente esse valor, batendo com o cenário sem
      // nenhum lançamento manual (mesma receita, R$24.000) — não dobra o desconto.
      expect(resultado.resultadoLiquidoSemConsiderarJuros).toBeCloseTo(2000 * 12, 2);
      expect(resultado.alertaDuplaContagem).toBeTruthy();
    });

    it("sem nenhum período contábil aberto no ano, o resultado líquido fica indisponível com motivo claro", () => {
      const resultado = impactoJurosNoResultadoAnual(db, 2024);
      expect(resultado.resultadoLiquidoAnual).toBe(0);
      expect(resultado.jurosJaContabilizadosNoDRE).toBe(0);
      expect(resultado.percentualDoResultadoConsumidoPorJuros).toBeNull();
      expect(resultado.motivoPercentualIndisponivel).toContain("Nenhum período contábil aberto");
      expect(resultado.alertaDuplaContagem).toBeTruthy();
    });

    it("resultado líquido do ano (antes de qualquer juro) é zero: percentual fica indisponível, sem dividir por zero", () => {
      const r = criarEntidadeLegal(db, { nome: "Titular Teste", cpf_cnpj: CPF_TESTE });
      if (!r.entidade_id) throw new Error(`Falha ao criar entidade: ${r.mensagem}`);
      const entidadeId = r.entidade_id;
      criarPeriodo(entidadeId, 2024, 1); // período aberto, sem nenhum lançamento.

      const resultado = impactoJurosNoResultadoAnual(db, 2024);
      expect(resultado.resultadoLiquidoSemConsiderarJuros).toBe(0);
      expect(resultado.percentualDoResultadoConsumidoPorJuros).toBeNull();
      expect(resultado.motivoPercentualIndisponivel).toContain("zero");
    });

    it("resultado líquido do ano (antes de qualquer juro) já é negativo: percentual fica indisponível, sem ser enganoso", () => {
      const r = criarEntidadeLegal(db, { nome: "Titular Teste", cpf_cnpj: CPF_TESTE });
      if (!r.entidade_id) throw new Error(`Falha ao criar entidade: ${r.mensagem}`);
      const entidadeId = r.entidade_id;
      const periodoId = criarPeriodo(entidadeId, 2024, 1);
      lancarDespesaCondominio(entidadeId, periodoId, 5000, "2024-01-15");

      const resultado = impactoJurosNoResultadoAnual(db, 2024);
      expect(resultado.resultadoLiquidoSemConsiderarJuros).toBeLessThan(0);
      expect(resultado.percentualDoResultadoConsumidoPorJuros).toBeNull();
      expect(resultado.motivoPercentualIndisponivel).toBeTruthy();
    });

    it("segrega juros pessoais/advocacia também no indicador anual (exigência de separação PF × empresa)", () => {
      const r = criarEntidadeLegal(db, { nome: "Titular Teste", cpf_cnpj: CPF_TESTE });
      if (!r.entidade_id) throw new Error(`Falha ao criar entidade: ${r.mensagem}`);
      const entidadeId = r.entidade_id;
      for (let mes = 1; mes <= 12; mes++) {
        lancarReceitaAluguel(entidadeId, criarPeriodo(entidadeId, 2024, mes), 1000, `2024-${pad(mes)}-05`);
      }

      const financiamentoId = criarFinanciamentoSac({
        valorContratado: 12000,
        taxaJurosMensal: 1,
        dataContrato: "2024-01-01",
        parcelasTotal: 12,
      });
      registrarRateioDestino(db, { dividaTipo: "financiamento", dividaId: financiamentoId, destino: "Pessoal", percentual: 100 });

      const resultado = impactoJurosNoResultadoAnual(db, 2024);
      // 100% pessoal: nada deve ser descontado da atividade.
      expect(resultado.jurosDoAno).toBe(0);
      expect(resultado.jurosExcluidosPessoal).toBeGreaterThan(0);
    });
  });
});
