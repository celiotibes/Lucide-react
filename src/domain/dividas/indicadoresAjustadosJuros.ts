/**
 * MÓDULO: Indicadores de retorno de investimento MODULADOS pelo custo de juros pagos.
 *
 * Pedido do usuário (2026-09-29): os indicadores de retorno de investimento (Yield, Cap
 * Rate, Cash-on-Cash, resultado da DRE, liquidez mensal...) hoje não descontam o custo de
 * juros pagos das dívidas do investidor — este módulo é uma camada NOVA, gerencial, que
 * PEGA os indicadores/relatórios já existentes e os MODULA pelos juros reconstituídos em
 * `historicoJuros.ts`, sem recalcular nada que já exista:
 *
 *   - Ganho de patrimônio (custo histórico e valor de mercado): reaproveita
 *     `patrimonio/indicadoresHistorico.ts` (`calcularIndicadoresHistoricoPortfolio`,
 *     `calcularYieldLiquido`) e `patrimonio/avaliacaoMercado.ts`
 *     (`calcularIndicadoresViabilidade`) — NUNCA recalcula NOI/valor de aquisição/valor de
 *     mercado do zero.
 *   - Juros pagos: reaproveita `dividas/historicoJuros.ts` (`obterJurosPagosPeriodo`,
 *     `relatorioJurosMensal`, `relatorioJurosAnual`) — NUNCA reimplementa a reconstituição
 *     de juros (cronograma SAC/Price, histórico confirmado, estimativa, mora).
 *   - Liquidez mensal: reaproveita `erp/dashboard-portfolio.ts` (`obterPortfolioCompleto`,
 *     campo `cashflow_mensal_total`).
 *   - Resultado anual: reaproveita `erp/relatorios-integrados.ts` (`gerarDRE`), somado por
 *     período contábil do ano — mesmo padrão de `patrimonio/indicadoresGestao.ts`
 *     (`calcularMargemLiquidaConsolidada`, que também itera `gerarDRE` por período).
 *
 * ESCOPO: só PORTFÓLIO (não por imóvel) — o pedido permite "opcionalmente por imóvel, se
 * fizer sentido com o dado disponível"; decisão deliberada de manter no nível de portfólio
 * porque `obterJurosPagosPeriodo` já devolve juros por DÍVIDA (financiamento/dívida de
 * consumo/contrato de locação), não por IMÓVEL — várias dívidas de consumo rateadas não têm
 * nenhum vínculo com um imóvel específico (ver `rateioDividas.ts`), então "juros por imóvel"
 * exigiria uma segunda camada de rateio que não existe hoje e inflaria o escopo desta tarefa.
 *
 * CLASSIFICAÇÃO POR DESTINO (`empresa` × `pessoal` × `advocacia` × `não classificado`):
 * `divida_rateio_destinos.destino` é TEXTO LIVRE (ver cabeçalho de `rateioDividas.ts`), não
 * um enum fechado — a UI só sugere "Pessoal"/"Empresa (...)"/"Advocacia". Este módulo
 * classifica cada fatia de `quebraPorDestino` por substring case-insensitive:
 *   - contém "pessoal"   → EXCLUÍDO do patrimônio da atividade (não é custo do investimento
 *     imobiliário, é dívida pessoal do titular).
 *   - contém "advocacia" → EXCLUÍDO (custo do escritório de advocacia, não da atividade
 *     imobiliária).
 *   - destino exatamente "não classificado" (mesmo texto usado por
 *     `historicoJuros.ts::NAO_CLASSIFICADO`, privado lá — duplicado aqui deliberadamente,
 *     mesma convenção de "réplica documentada" já usada em `indicadoresHistorico.ts`/
 *     `avaliacaoMercado.ts` para `receitaBrutaAnual`) → INCLUÍDO no desconto, por precaução,
 *     com um aviso explícito de que ainda não foi classificado pelo usuário (o rateio pode
 *     revelar depois que parte dele é pessoal/advocacia, reduzindo o desconto).
 *   - qualquer outro rótulo (ex: "Empresa (imóveis)", "Empresa (imóveis de locação/Airbnb)")
 *     → INCLUÍDO como custo da atividade.
 */

import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import { obterEntidadeAtiva } from "../erp/entidadeLegal";
import { obterPortfolioCompleto } from "../erp/dashboard-portfolio";
import { gerarDRE } from "../erp/relatorios-integrados";
import { calcularIndicadoresHistoricoPortfolio, calcularYieldLiquido, type IndicadorNumerico } from "../patrimonio/indicadoresHistorico";
import { calcularIndicadoresViabilidade } from "../patrimonio/avaliacaoMercado";
import { obterJurosPagosPeriodo, relatorioJurosMensal, relatorioJurosAnual, type EventoJuros } from "./historicoJuros";
import { formatarMoeda } from "../formatarMoeda";

function round2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/** Mesmo texto de `historicoJuros.ts::NAO_CLASSIFICADO` (não exportado de lá) — ver
 * decisão de "réplica documentada" no cabeçalho deste arquivo. */
const NAO_CLASSIFICADO = "não classificado";

function resolverEntidadeId(db: Database): number {
  // Sentinela que não bate com nenhum entidade_id real (PK positiva) quando não há entidade
  // ativa — mesma convenção de indicadoresHistorico.ts/avaliacaoMercado.ts/indicadoresGestao.ts.
  return obterEntidadeAtiva(db)?.id ?? -1;
}

// ============================================================================
// CLASSIFICAÇÃO DE JUROS POR DESTINO (compartilhada pelas 3 funções do módulo)
// ============================================================================

export interface ClassificacaoJurosPorAtividade {
  /** Soma dos eventos/fatias com destino "empresa"/atividade + "não classificado" (por
   * precaução) — o valor efetivamente descontado dos indicadores de retorno. */
  descontadoDaAtividade: number;
  /** Parte de `descontadoDaAtividade` vinda especificamente de "não classificado" — sempre
   * um subconjunto do total, nunca somado em dobro. */
  incluidoNaoClassificado: number;
  /** Somas EXCLUÍDAS (não fazem parte do custo da atividade de investimento imobiliário). */
  excluidoPessoal: number;
  excluidoAdvocacia: number;
  /** Aviso pronto para exibição na tela, presente sempre que `incluidoNaoClassificado > 0`. */
  aviso: string | null;
}

/** Classifica os eventos de juros (`EventoJuros[]`, de `obterJurosPagosPeriodo`/
 * `relatorioJurosMensal`/`relatorioJurosAnual`) pela regra de destino documentada no
 * cabeçalho do arquivo. Função pura — não acessa o banco (os eventos já vêm prontos de
 * `historicoJuros.ts`, com `quebraPorDestino` já calculado por dívida). */
export function classificarJurosPorAtividade(eventos: EventoJuros[]): ClassificacaoJurosPorAtividade {
  let descontado = 0;
  let naoClassificado = 0;
  let pessoal = 0;
  let advocacia = 0;

  for (const evento of eventos) {
    for (const fatia of evento.quebraPorDestino) {
      const destinoLower = fatia.destino.toLowerCase();
      if (destinoLower.includes("pessoal")) {
        pessoal += fatia.valor;
        continue;
      }
      if (destinoLower.includes("advocacia")) {
        advocacia += fatia.valor;
        continue;
      }
      if (fatia.destino === NAO_CLASSIFICADO) {
        naoClassificado += fatia.valor;
        descontado += fatia.valor;
        continue;
      }
      descontado += fatia.valor; // "empresa"/atividade, ou qualquer outro rótulo livre não reconhecido acima
    }
  }

  return {
    descontadoDaAtividade: round2(descontado),
    incluidoNaoClassificado: round2(naoClassificado),
    excluidoPessoal: round2(pessoal),
    excluidoAdvocacia: round2(advocacia),
    aviso:
      naoClassificado > 0.005
        ? `${formatarMoeda(round2(naoClassificado))} em juros com destino ainda "não classificado" foram incluídos no desconto por precaução — classifique o rateio dessas dívidas (rateioDividas.ts) para que este valor deixe de ser uma estimativa conservadora e passe a refletir o destino real (pode reduzir o desconto, se parte for pessoal/advocacia).`
        : null,
  };
}

// ============================================================================
// 1) PATRIMÔNIO LÍQUIDO AJUSTADO POR JUROS (custo histórico × valor de mercado)
// ============================================================================

export interface GanhoPatrimonioLiquidoBase {
  rotulo: "Ajustado a custo histórico" | "Ajustado a valor de mercado";
  /** Ganho de patrimônio líquido do portfólio no período, ANTES de descontar juros — soma
   * do NOI anual (receita de aluguel − despesas operacionais, mesma fonte de
   * `calcularYieldLiquido`/Cap Rate) de todos os anos do período. Deliberadamente IGUAL nas
   * duas bases (custo histórico e valor de mercado): o NOI não depende de qual valor se usa
   * para avaliar o imóvel — só a base de COMPARAÇÃO (o denominador do retorno percentual)
   * muda entre as duas linhas. */
  ganhoPatrimonioLiquidoBruto: number;
  /** Juros pagos no período atribuídos à atividade de investimento imobiliário (destino
   * "empresa"/atividade + "não classificado", por precaução) — ver
   * `classificarJurosPorAtividade`. Igual nas duas bases (o desconto de juros não depende de
   * qual valor de imóvel se usa). */
  jurosDescontados: number;
  /** = ganhoPatrimonioLiquidoBruto − jurosDescontados: o que o investidor realmente teve de
   * ganho de patrimônio líquido agregado no período, DEPOIS de excluir o custo de juros. */
  ganhoLiquidoDeJuros: number;
  /** Valor de aquisição total do portfólio (custo histórico) ou valor de mercado total mais
   * recente conhecido do portfólio (valor de mercado) — denominador do retorno percentual. */
  denominadorReferencia: number;
  /** Retorno percentual ANTES de descontar juros = ganhoPatrimonioLiquidoBruto ÷
   * denominadorReferencia × 100. */
  retornoBrutoPercentual: number | null;
  /** Retorno percentual DEPOIS de descontar juros = ganhoLiquidoDeJuros ÷
   * denominadorReferencia × 100 — o indicador "modulado por juros" pedido pelo usuário. */
  retornoLiquidoDeJurosPercentual: number | null;
  motivoRetornoIndisponivel: string | null;
  formula: string;
  fonteDados: string;
}

export interface PatrimonioLiquidoAjustadoPorJurosResultado {
  anoInicio: number;
  anoFim: number;
  custoHistorico: GanhoPatrimonioLiquidoBase;
  valorMercado: GanhoPatrimonioLiquidoBase;
  /** Total geral reconstituído por `obterJurosPagosPeriodo` no período, TODOS os destinos
   * (empresa + pessoal + advocacia + não classificado) — contexto/auditoria, não é o valor
   * descontado dos indicadores acima (esse é `custoHistorico.jurosDescontados`, que já
   * exclui pessoal/advocacia). */
  jurosTotaisReconstituidos: number;
  jurosExcluidosPessoal: number;
  jurosExcluidosAdvocacia: number;
  jurosIncluidosNaoClassificado: number;
  avisoJurosNaoClassificado: string | null;
}

/** Soma do NOI anual do portfólio inteiro (todos os imóveis de investimento) em cada ano de
 * [anoInicio, anoFim] — reaproveita `calcularIndicadoresViabilidade` (avaliacaoMercado.ts)
 * ano a ano, sem recalcular NOI (o próprio módulo não expõe uma versão multi-ano). */
function noiAcumuladoPortfolio(db: Database, anoInicio: number, anoFim: number): number {
  let total = 0;
  for (let ano = anoInicio; ano <= anoFim; ano++) {
    const viabilidade = calcularIndicadoresViabilidade(db, ano);
    total += viabilidade.imoveis.reduce((soma, imovel) => soma + imovel.noiAnual, 0);
  }
  return round2(total);
}

export function patrimonioLiquidoAjustadoPorJuros(
  db: Database,
  { anoInicio, anoFim }: { anoInicio: number; anoFim: number },
): PatrimonioLiquidoAjustadoPorJurosResultado {
  if (anoFim < anoInicio) {
    throw new Error(`Período inválido: anoFim (${anoFim}) é anterior a anoInicio (${anoInicio}).`);
  }

  const ganhoBruto = noiAcumuladoPortfolio(db, anoInicio, anoFim);

  // Denominador "custo histórico": valor de aquisição total do portfólio, reaproveitando
  // calcularIndicadoresHistoricoPortfolio (indicadoresHistorico.ts) — ano de referência =
  // anoFim (valor_aquisicao não muda com o tempo, então qualquer ano do intervalo serviria;
  // usar o mais recente é a convenção mais legível).
  const historico = calcularIndicadoresHistoricoPortfolio(db, anoFim);
  const valorAquisicaoTotal = round2(
    historico.imoveis.reduce((soma, i) => soma + (i.valorAquisicao ?? 0), 0),
  );

  // Denominador "valor de mercado": reaproveita o total já agregado por
  // calcularIndicadoresViabilidade (avaliacaoMercado.ts) no ano de referência (anoFim) — só
  // soma imóveis com avaliação de mercado conhecida, mesma convenção daquele módulo.
  const viabilidadeAnoFim = calcularIndicadoresViabilidade(db, anoFim);
  const valorMercadoTotal = round2(viabilidadeAnoFim.valorMercadoTotal);

  // Juros do período, filtrados por destino (ver classificarJurosPorAtividade).
  const eventosJuros = obterJurosPagosPeriodo(db, { anoInicio, anoFim });
  const classificacao = classificarJurosPorAtividade(eventosJuros);
  const jurosTotaisReconstituidos = round2(eventosJuros.reduce((soma, e) => soma + e.valorJuros, 0));

  const ganhoLiquido = round2(ganhoBruto - classificacao.descontadoDaAtividade);

  const fonteDadosComum =
    "Ganho bruto: soma do NOI anual (receita de aluguel − despesas operacionais) de todos os anos do " +
    "período, via calcularIndicadoresViabilidade (domain/patrimonio/avaliacaoMercado.ts), ano a ano — " +
    "mesma fonte de calcularYieldLiquido/Cap Rate; idêntico nas duas bases porque o NOI não depende do " +
    "valor do imóvel. Juros descontados: obterJurosPagosPeriodo (domain/dividas/historicoJuros.ts), " +
    "somando as fatias de quebraPorDestino com destino \"empresa\"/atividade + \"não classificado\" " +
    "(por precaução), excluindo \"pessoal\" e \"advocacia\" — ver classificarJurosPorAtividade.";

  const custoHistorico: GanhoPatrimonioLiquidoBase = {
    rotulo: "Ajustado a custo histórico",
    ganhoPatrimonioLiquidoBruto: ganhoBruto,
    jurosDescontados: classificacao.descontadoDaAtividade,
    ganhoLiquidoDeJuros: ganhoLiquido,
    denominadorReferencia: valorAquisicaoTotal,
    retornoBrutoPercentual: null,
    retornoLiquidoDeJurosPercentual: null,
    motivoRetornoIndisponivel:
      valorAquisicaoTotal > 0
        ? null
        : "Portfólio sem valor de aquisição cadastrado (imoveis.valor_aquisicao) — retorno percentual a custo histórico indefinido.",
    formula:
      "Ganho de patrimônio líquido a custo histórico = NOI anual acumulado do portfólio no período (Σ calcularIndicadoresViabilidade().imoveis[].noiAnual, ano a ano) − juros pagos atribuídos à atividade (obterJurosPagosPeriodo, destino empresa + não classificado). Retorno % = ganho ÷ valor de aquisição total do portfólio (Σ imoveis.valor_aquisicao, calcularIndicadoresHistoricoPortfolio) × 100 — mesma fórmula de calcularYieldLiquido (indicadoresHistorico.ts), agregada para o portfólio e o período inteiros.",
    fonteDados: fonteDadosComum,
  };
  if (valorAquisicaoTotal > 0) {
    const yieldBrutoIndicador: IndicadorNumerico = calcularYieldLiquido(ganhoBruto, valorAquisicaoTotal);
    const yieldLiquidoIndicador: IndicadorNumerico = calcularYieldLiquido(ganhoLiquido, valorAquisicaoTotal);
    custoHistorico.retornoBrutoPercentual = yieldBrutoIndicador.valor;
    custoHistorico.retornoLiquidoDeJurosPercentual = yieldLiquidoIndicador.valor;
  }

  const valorMercado: GanhoPatrimonioLiquidoBase = {
    rotulo: "Ajustado a valor de mercado",
    ganhoPatrimonioLiquidoBruto: ganhoBruto,
    jurosDescontados: classificacao.descontadoDaAtividade,
    ganhoLiquidoDeJuros: ganhoLiquido,
    denominadorReferencia: valorMercadoTotal,
    retornoBrutoPercentual: valorMercadoTotal > 0 ? round2((ganhoBruto / valorMercadoTotal) * 100) : null,
    retornoLiquidoDeJurosPercentual: valorMercadoTotal > 0 ? round2((ganhoLiquido / valorMercadoTotal) * 100) : null,
    motivoRetornoIndisponivel:
      valorMercadoTotal > 0
        ? null
        : "Nenhum imóvel do portfólio tem avaliação de mercado conhecida (imovel_avaliacoes_mercado / imoveis.valor_venal_atual) no ano de referência — retorno percentual a valor de mercado indefinido.",
    formula:
      "Ganho de patrimônio líquido a valor de mercado = mesmo NOI anual acumulado do portfólio (não depende do valor do imóvel) − mesmos juros descontados. Retorno % = ganho ÷ valor de mercado total mais recente do portfólio (calcularIndicadoresViabilidade().valorMercadoTotal, avaliacaoMercado.ts, ano de referência = anoFim) × 100 — mesma fórmula do Cap Rate/Yield líquido a mercado daquele módulo (calcularYieldsMercado/capRateConsolidadoPercentual), replicada aqui apenas na razão NOI÷valor de mercado porque calcularYieldsMercado exige também a receita bruta anual (usada só para o yield bruto, irrelevante para este indicador).",
    fonteDados: fonteDadosComum,
  };

  return {
    anoInicio,
    anoFim,
    custoHistorico,
    valorMercado,
    jurosTotaisReconstituidos,
    jurosExcluidosPessoal: classificacao.excluidoPessoal,
    jurosExcluidosAdvocacia: classificacao.excluidoAdvocacia,
    jurosIncluidosNaoClassificado: classificacao.incluidoNaoClassificado,
    avisoJurosNaoClassificado: classificacao.aviso,
  };
}

// ============================================================================
// 2) IMPACTO DOS JUROS NA LIQUIDEZ MENSAL
// ============================================================================

export interface ImpactoJurosNaLiquidezMensalResultado {
  ano: number;
  mes: number;
  /** Juros do mês atribuídos à atividade de investimento imobiliário (destino
   * empresa/atividade + não classificado, mesmo critério de `classificarJurosPorAtividade` —
   * consistente com `patrimonioLiquidoAjustadoPorJuros`). */
  jurosDoMes: number;
  /** Fluxo de caixa líquido do mês (aluguel vigente − despesas operacionais), ANTES do
   * serviço da dívida — `obterPortfolioCompleto().cashflow_mensal_total`
   * (dashboard-portfolio.ts). Não inclui juros/amortização de financiamento, então descontar
   * `jurosDoMes` dele não faz dupla contagem. */
  fluxoCaixaLiquidoDoMes: number;
  /** = jurosDoMes ÷ fluxoCaixaLiquidoDoMes × 100 — quanto do caixa gerado no mês seria
   * consumido só pelos juros do mês. */
  percentualComprometidoPorJuros: number | null;
  motivoPercentualIndisponivel: string | null;
  jurosExcluidosPessoal: number;
  jurosExcluidosAdvocacia: number;
  jurosIncluidosNaoClassificado: number;
  avisoJurosNaoClassificado: string | null;
  formula: string;
  fonteDados: string;
}

export function impactoJurosNaLiquidezMensal(db: Database, ano: number, mes: number): ImpactoJurosNaLiquidezMensalResultado {
  const relatorioMensal = relatorioJurosMensal(db, ano, mes);
  const classificacao = classificarJurosPorAtividade(relatorioMensal.eventos);
  const jurosDoMes = classificacao.descontadoDaAtividade;

  const entidadeId = resolverEntidadeId(db);
  const portfolio = obterPortfolioCompleto(db, entidadeId, ano, mes);
  const fluxoCaixaLiquidoDoMes = portfolio.cashflow_mensal_total;

  const formula =
    "Percentual do fluxo de caixa líquido do mês comprometido por juros = juros do mês atribuídos à atividade " +
    "(destino empresa/atividade + não classificado, obterJurosPagosPeriodo/relatorioJurosMensal) ÷ fluxo de " +
    "caixa líquido do mês (aluguel vigente − despesas operacionais, ANTES do serviço da dívida) × 100";
  const fonteDados =
    "Juros do mês: relatorioJurosMensal (domain/dividas/historicoJuros.ts), filtrado por destino via " +
    "classificarJurosPorAtividade (mesmo critério empresa/não-classificado de patrimonioLiquidoAjustadoPorJuros). " +
    "Fluxo de caixa líquido do mês: obterPortfolioCompleto (domain/erp/dashboard-portfolio.ts), campo " +
    "cashflow_mensal_total = Σ(aluguel vigente no mês − despesas operacionais de contas_a_pagar por imóvel do " +
    "portfólio); esse fluxo NÃO inclui pagamento de juros/amortização de financiamento — por isso comparar com " +
    "jurosDoMes aqui não é dupla contagem, é a pergunta 'quanto desse caixa operacional seria consumido pelo " +
    "serviço de juros do mês'.";

  let percentualComprometidoPorJuros: number | null = null;
  let motivoPercentualIndisponivel: string | null = null;
  if (fluxoCaixaLiquidoDoMes > 0) {
    percentualComprometidoPorJuros = round2((jurosDoMes / fluxoCaixaLiquidoDoMes) * 100);
  } else if (fluxoCaixaLiquidoDoMes === 0) {
    motivoPercentualIndisponivel =
      "Fluxo de caixa líquido do mês é zero — percentual comprometido por juros fica indefinido (divisão por zero).";
  } else {
    motivoPercentualIndisponivel =
      "Fluxo de caixa líquido do mês é negativo (despesas operacionais superaram o aluguel vigente, antes mesmo " +
      "de considerar juros) — o percentual não é significativo nesse cenário; use jurosDoMes e " +
      "fluxoCaixaLiquidoDoMes diretamente para avaliar o mês.";
  }

  return {
    ano,
    mes,
    jurosDoMes,
    fluxoCaixaLiquidoDoMes,
    percentualComprometidoPorJuros,
    motivoPercentualIndisponivel,
    jurosExcluidosPessoal: classificacao.excluidoPessoal,
    jurosExcluidosAdvocacia: classificacao.excluidoAdvocacia,
    jurosIncluidosNaoClassificado: classificacao.incluidoNaoClassificado,
    avisoJurosNaoClassificado: classificacao.aviso,
    formula,
    fonteDados,
  };
}

// ============================================================================
// 3) IMPACTO DOS JUROS NO RESULTADO ANUAL (DRE) — cuidado com dupla contagem
// ============================================================================

export interface ImpactoJurosNoResultadoAnualResultado {
  ano: number;
  /** Juros do ano atribuídos à atividade de investimento imobiliário (destino
   * empresa/atividade + não classificado) — reconstituição COMPLETA de historicoJuros.ts
   * (cronograma SAC/Price teórico + histórico confirmado + estimativa + mora), independente
   * de o valor já ter sido lançado ou não no razão contábil oficial. */
  jurosDoAno: number;
  /** Resultado líquido anual = soma de `gerarDRE().resultado_final` de todos os períodos
   * contábeis (meses) do ano, como reportado HOJE pela DRE oficial — já líquido de qualquer
   * juro de financiamento efetivamente LANÇADO no razão (conta 5.5.01), quando houver. */
  resultadoLiquidoAnual: number;
  /** Parte de `resultadoLiquidoAnual` que já corresponde a juro de financiamento
   * efetivamente lançado no razão (Σ `gerarDRE().juros_e_multas.despesa_juros_financiamento`,
   * conta 5.5.01, por período do ano) — ver alerta de dupla contagem abaixo. Normalmente 0
   * neste sistema: a reconstituição de `historicoJuros.ts` não depende de lançamento manual
   * no razão, então na prática raramente há um valor aqui além do que o usuário lançou à
   * parte. */
  jurosJaContabilizadosNoDRE: number;
  /** = resultadoLiquidoAnual + jurosJaContabilizadosNoDRE — o resultado ANTES de qualquer
   * juro de financiamento que a própria DRE já tenha descontado (desfaz exatamente o que
   * `gerarDRE` subtraiu, nunca soma `jurosDoAno` aqui — ver alerta de dupla contagem). */
  resultadoLiquidoSemConsiderarJuros: number;
  /** = jurosDoAno ÷ resultadoLiquidoSemConsiderarJuros × 100 — quanto do resultado (antes de
   * qualquer juro) foi consumido pelo custo REAL e COMPLETO de juros do ano. */
  percentualDoResultadoConsumidoPorJuros: number | null;
  motivoPercentualIndisponivel: string | null;
  jurosExcluidosPessoal: number;
  jurosExcluidosAdvocacia: number;
  jurosIncluidosNaoClassificado: number;
  avisoJurosNaoClassificado: string | null;
  /** Explicação explícita, sempre presente, de como a dupla contagem de juros de
   * financiamento entre `historicoJuros.ts` e `gerarDRE` (conta 5.5.01) foi evitada — ver
   * também `fonteDados`. */
  alertaDuplaContagem: string;
  formula: string;
  fonteDados: string;
}

/** Resultado líquido anual = soma de `gerarDRE().resultado_final` de cada período contábil
 * (mês) do ano da entidade — mesmo padrão de iteração de
 * `indicadoresGestao.ts::calcularMargemLiquidaConsolidada` (que também soma `gerarDRE` por
 * período), sem recalcular a DRE. Também devolve a soma de
 * `juros_e_multas.despesa_juros_financiamento` (conta 5.5.01) dos mesmos períodos — o único
 * componente de juros que `gerarDRE` hoje efetivamente desconta do resultado final (ver
 * `relatorios-integrados.ts::gerarDRE`, e o teste de auditoria
 * `erp/__auditoria__/dre.test.ts`, que confirma esse comportamento). */
function resultadoLiquidoAnualDaDre(
  db: Database,
  entidadeId: number,
  ano: number,
): { resultadoLiquidoAnual: number; despesaJurosFinanciamentoAnual: number; periodosConsiderados: number } {
  const periodos = consultar<{ id: number }>(
    db,
    "SELECT id FROM periodos_contabeis WHERE entidade_id = ? AND ano = ?",
    [entidadeId, ano],
  );

  let resultado = 0;
  let despesaJuros = 0;
  for (const periodo of periodos) {
    const dre = gerarDRE(db, entidadeId, periodo.id);
    resultado += dre.resultado_final;
    despesaJuros += dre.juros_e_multas.despesa_juros_financiamento;
  }

  return {
    resultadoLiquidoAnual: round2(resultado),
    despesaJurosFinanciamentoAnual: round2(despesaJuros),
    periodosConsiderados: periodos.length,
  };
}

export function impactoJurosNoResultadoAnual(db: Database, ano: number): ImpactoJurosNoResultadoAnualResultado {
  const relatorioAnual = relatorioJurosAnual(db, ano);
  const classificacao = classificarJurosPorAtividade(relatorioAnual.eventos);
  const jurosDoAno = classificacao.descontadoDaAtividade;

  const entidadeId = resolverEntidadeId(db);
  const { resultadoLiquidoAnual, despesaJurosFinanciamentoAnual, periodosConsiderados } = resultadoLiquidoAnualDaDre(
    db,
    entidadeId,
    ano,
  );

  const resultadoLiquidoSemConsiderarJuros = round2(resultadoLiquidoAnual + despesaJurosFinanciamentoAnual);

  const alertaDuplaContagem =
    "gerarDRE (erp/relatorios-integrados.ts) já subtrai de resultado_final qualquer juro de financiamento " +
    "efetivamente LANÇADO no razão contábil oficial (conta 5.5.01 'Financiamento imobiliário — juros') — ver " +
    "juros_e_multas.despesa_juros_financiamento. Para não descontar esse valor duas vezes (uma dentro da DRE, " +
    "outra aqui), este indicador NUNCA subtrai jurosDoAno de resultadoLiquidoAnual diretamente: primeiro " +
    "'desfaz' exatamente o que a DRE já subtraiu (resultadoLiquidoSemConsiderarJuros = resultadoLiquidoAnual + " +
    "jurosJaContabilizadosNoDRE — a mesma parcela, com o sinal invertido), e só então compara esse resultado " +
    "'antes de qualquer juro' com jurosDoAno (a reconstituição COMPLETA e independente de historicoJuros.ts, " +
    "que cobre cronograma teórico, histórico confirmado, estimativa e mora — não só o que foi lançado no " +
    "razão). Quando jurosJaContabilizadosNoDRE é 0 (nenhum juro de financiamento foi lançado manualmente na " +
    "conta 5.5.01 — o caso mais comum, já que a reconstituição de historicoJuros.ts não depende de lançamento " +
    "contábil), resultadoLiquidoSemConsiderarJuros = resultadoLiquidoAnual e não há risco algum de dupla " +
    "contagem.";

  const formula =
    "resultadoLiquidoSemConsiderarJuros = resultadoLiquidoAnual (Σ gerarDRE().resultado_final por período do " +
    "ano) + jurosJaContabilizadosNoDRE (Σ gerarDRE().juros_e_multas.despesa_juros_financiamento, conta 5.5.01, " +
    "pelos mesmos períodos — desfaz exatamente o que a DRE já descontou, nunca soma jurosDoAno de novo). " +
    "percentualDoResultadoConsumidoPorJuros = jurosDoAno (relatorioJurosAnual, destino empresa + não " +
    "classificado) ÷ resultadoLiquidoSemConsiderarJuros × 100.";
  const fonteDados =
    "Juros do ano: relatorioJurosAnual (domain/dividas/historicoJuros.ts), filtrado por destino via " +
    "classificarJurosPorAtividade. Resultado líquido: gerarDRE (domain/erp/relatorios-integrados.ts) somado " +
    "por período contábil (periodos_contabeis) do ano, mesmo padrão de iteração de " +
    "indicadoresGestao.ts::calcularMargemLiquidaConsolidada. Ver alertaDuplaContagem para a decisão de não " +
    "somar jurosDoAno e a despesa de juros já contabilizada na DRE.";

  let percentualDoResultadoConsumidoPorJuros: number | null = null;
  let motivoPercentualIndisponivel: string | null = null;
  if (periodosConsiderados === 0) {
    motivoPercentualIndisponivel = `Nenhum período contábil aberto para o ano ${ano} nesta entidade — resultado líquido indisponível.`;
  } else if (resultadoLiquidoSemConsiderarJuros > 0) {
    percentualDoResultadoConsumidoPorJuros = round2((jurosDoAno / resultadoLiquidoSemConsiderarJuros) * 100);
  } else if (resultadoLiquidoSemConsiderarJuros === 0) {
    motivoPercentualIndisponivel =
      "Resultado líquido do ano (antes de qualquer juro) é zero — percentual consumido por juros fica indefinido (divisão por zero).";
  } else {
    motivoPercentualIndisponivel =
      "Resultado líquido do ano (antes de qualquer juro) já é negativo — o percentual não é significativo " +
      "nesse cenário; use jurosDoAno e resultadoLiquidoSemConsiderarJuros diretamente.";
  }

  return {
    ano,
    jurosDoAno,
    resultadoLiquidoAnual,
    jurosJaContabilizadosNoDRE: despesaJurosFinanciamentoAnual,
    resultadoLiquidoSemConsiderarJuros,
    percentualDoResultadoConsumidoPorJuros,
    motivoPercentualIndisponivel,
    jurosExcluidosPessoal: classificacao.excluidoPessoal,
    jurosExcluidosAdvocacia: classificacao.excluidoAdvocacia,
    jurosIncluidosNaoClassificado: classificacao.incluidoNaoClassificado,
    avisoJurosNaoClassificado: classificacao.aviso,
    alertaDuplaContagem,
    formula,
    fonteDados,
  };
}
