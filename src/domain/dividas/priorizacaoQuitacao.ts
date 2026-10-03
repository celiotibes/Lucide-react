/**
 * MÓDULO: Priorização de quitação/amortização parcial de dívidas — "qual dívida vale mais a
 * pena atacar primeiro para diminuir a perda de renda com juros e aumentar o patrimônio
 * líquido futuro", segregado por destino (PF × empresa de fato × advocacia × outro).
 *
 * MÉTODO: avalanche de dívidas (o clássico de finanças pessoais) — ordena pela TAXA DE JUROS
 * EFETIVA anual, maior primeiro, não pelo menor saldo (esse seria o método "bola de neve",
 * psicologicamente mais fácil mas financeiramente pior: quitar primeiro a dívida mais cara
 * relativamente é o que minimiza o total de juros pagos ao longo do tempo).
 *
 * TAXA DE JUROS EFETIVA ANUAL — nunca inventada, sempre a partir de dado já cadastrado:
 *   - financiamento SAC/PRICE: `taxa_juros_mensal` (contratada), composta ao ano.
 *   - financiamento 'OUTRO': NÃO tem taxa conhecida — `taxa_juros_mensal` existe na tabela
 *     (NOT NULL DEFAULT 0.8) mas não representa custo real: 'OUTRO' não segue fórmula
 *     bancária de amortização (ver `financiamento/amortizacao.ts::gerarCronograma`, que
 *     devolve `[]` para 'OUTRO'). Usar esse campo aqui seria inventar uma taxa — por isso
 *     todo financiamento 'OUTRO' entra com `taxaDesconhecida: true`.
 *   - dívida de consumo: `taxa_juros_mensal_estimada`, composta ao ano, ou `null` (taxa
 *     desconhecida) quando o usuário não preencheu — a fonte típica (Registrato/SCR do
 *     Bacen) não traz taxa, só saldo devedor.
 *
 * DÍVIDA SEM TAXA CONHECIDA: nunca excluída silenciosamente — entra no fim da lista de
 * `priorizarQuitacaoDividas`, com `taxaDesconhecida: true` e uma `justificativa` explicando
 * por que não foi comparada pelo método avalanche, para o usuário decidir se cadastra a taxa
 * ou prioriza por outro critério (ex: saldo devedor, para reduzir exposição/risco).
 *
 * CUSTO ANUAL ESTIMADO DE JUROS = saldo devedor atual × taxa anual efetiva — aproximação
 * SIMPLES e deliberada (documentada em `formulaCustoAnual` de cada item): presume que o saldo
 * fica constante pelos próximos 12 meses, o que NÃO acontece (o saldo cai a cada amortização/
 * pagamento) — por isso é um TETO do custo anual, não a soma exata dos juros de cada parcela
 * futura do cronograma. Para o número exato de um financiamento SAC/PRICE, some
 * `parcela.juros` do cronograma teórico (`financiamento/amortizacao.ts::gerarCronograma`)
 * diretamente — é o que `simularImpactoAmortizacaoParcial` faz para comparar antes/depois.
 *
 * SEGREGAÇÃO POR DESTINO: reaproveita `listarRateioDestinos`/`aplicarRateio`
 * (`rateioDividas.ts`) sobre o SALDO DEVEDOR (não sobre o juros, como `historicoJuros.ts` já
 * faz) — mesma regra de resíduo "não classificado" para dívida sem rateio cadastrado ou com
 * rateio somando menos que 100%, nunca presumindo destino.
 *
 * LEITURA/SIMULAÇÃO APENAS: nenhuma função deste módulo escreve no banco nem lança no razão —
 * uma amortização parcial REAL continua sendo feita pelos módulos já existentes de contas a
 * pagar/financiamento. `simularImpactoAmortizacaoParcial` é um "e se", não uma transação.
 */
import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import {
  gerarCronograma,
  gerarCronogramaSAC,
  gerarCronogramaPrice,
  type Financiamento,
} from "../financiamento/amortizacao";
import { saldoDevedorFinanciamento } from "../patrimonio/balancoPatrimonial";
import { listarRateioDestinos, aplicarRateio, type DividaTipo, type ValorRateado } from "./rateioDividas";
import { obterJurosPagosPeriodo } from "./historicoJuros";
import { formatarMoeda } from "../formatarMoeda";

const NAO_CLASSIFICADO = "não classificado";
const TOLERANCIA_CENTAVOS = 0.005;

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Mesma fórmula de `somarMeses` em `financiamento/amortizacao.ts`/`patrimonio/
 * balancoPatrimonial.ts`/`patrimonio/indicadoresGestao.ts` — cópia local por dependência de
 * um único arquivo, mesmo critério já documentado em `indicadoresGestao.ts`. */
function subtrairMeses(dataIso: string, meses: number): string {
  const data = new Date(dataIso + "T00:00:00");
  data.setMonth(data.getMonth() - meses);
  return data.toISOString().slice(0, 10);
}

function arredondarCentavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function arredondarPercentual(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/** Mesma aproximação de `balancoPatrimonial.ts::estimarParcelasRestantes` (não exportada de
 * lá) — usada só quando não há prazo/cronograma cadastrado (dívida de consumo). */
function estimarParcelasRestantes(saldoDevedor: number, parcelaMensal: number): number {
  return parcelaMensal > 0 ? Math.ceil(saldoDevedor / parcelaMensal) : 0;
}

function descricaoFinanciamento(instituicao: string, apelidoImovel: string | null): string {
  return `${instituicao} — financiamento${apelidoImovel ? ` (${apelidoImovel})` : ""}`;
}

function descricaoDividaConsumo(instituicao: string, tipo: string): string {
  return `${instituicao} (${tipo})`;
}

/** Taxa mensal composta ao ano: (1 + taxaMensal/100)^12 - 1, em percentual. `null` de
 * entrada (taxa desconhecida) sempre produz `null` de saída — nunca fabrica uma taxa. */
function taxaAnualEfetiva(taxaMensalPercentual: number | null): number | null {
  if (taxaMensalPercentual === null) return null;
  return arredondarPercentual((Math.pow(1 + taxaMensalPercentual / 100, 12) - 1) * 100);
}

/** Quebra `valor` (aqui, sempre um SALDO DEVEDOR, não um evento de juros) pelo rateio de
 * destino real da dívida, com o resíduo não coberto por nenhum percentual cadastrado (dívida
 * sem rateio, ou com rateio somando menos que 100%) sob "não classificado" — mesma regra de
 * `quebraPorDestinoCompleta` em `historicoJuros.ts` (não exportada de lá, cópia local pelo
 * mesmo critério do módulo). */
function quebraPorDestinoSaldo(db: Database, dividaTipo: DividaTipo, dividaId: number, valor: number): ValorRateado[] {
  const rateios = listarRateioDestinos(db, dividaTipo, dividaId);
  if (rateios.length === 0) {
    return [{ destino: NAO_CLASSIFICADO, valor: arredondarCentavos(valor) }];
  }
  const fatias = aplicarRateio(valor, rateios);
  const somaClassificada = fatias.reduce((acc, f) => acc + f.valor, 0);
  const residuo = arredondarCentavos(valor - somaClassificada);
  return residuo > TOLERANCIA_CENTAVOS ? [...fatias, { destino: NAO_CLASSIFICADO, valor: residuo }] : fatias;
}

interface DividaConsumoRow {
  id: number;
  tipo: string;
  instituicao: string;
  saldo_devedor_atual: number;
  parcela_mensal: number;
  data_referencia_saldo: string;
  taxa_juros_mensal_estimada: number | null;
}

const FORMULA_CUSTO_ANUAL =
  "Saldo devedor atual × taxa de juros anual efetiva (aproximação simples: presume saldo constante pelos 12 meses seguintes — na prática o saldo cai a cada amortização/pagamento, então este valor é um TETO do custo anual, não a soma exata dos juros de cada parcela futura do cronograma).";

const FORMULA_JUROS_12M =
  "Soma de EventoJuros.valorJuros (obterJurosPagosPeriodo, historicoJuros.ts) desta dívida, restrita aos eventos com data nos últimos 12 meses corridos até a data de referência — dado histórico real (ou estimado, conforme o rótulo 'fonte' de cada evento — ver historicoJuros.ts), não uma projeção.";

/** Soma de juros pagos/reconhecidos desta dívida nos últimos 12 meses corridos até
 * `dataReferencia` (não ano-calendário) — reaproveita `obterJurosPagosPeriodo`
 * (historicoJuros.ts) por inteiro, sem reagregar nada do razão aqui. */
function jurosPagosUltimos12Meses(db: Database, dividaTipo: DividaTipo, dividaId: number, dataReferencia: string): number {
  const dataInicio = subtrairMeses(dataReferencia, 12);
  const anoInicio = Number(dataInicio.slice(0, 4));
  const anoFim = Number(dataReferencia.slice(0, 4));
  const eventos = obterJurosPagosPeriodo(db, { anoInicio, anoFim });
  return arredondarCentavos(
    eventos
      .filter((e) => e.dividaTipo === dividaTipo && e.dividaId === dividaId && e.data >= dataInicio && e.data <= dataReferencia)
      .reduce((acc, e) => acc + e.valorJuros, 0),
  );
}

export interface CustoDeCarregarDivida {
  dividaTipo: DividaTipo;
  dividaId: number;
  descricaoDivida: string;
  saldoDevedorAtual: number;
  /** Taxa mensal usada como base do cálculo — `null` quando desconhecida (nunca fabricada). */
  taxaJurosMensalPercentual: number | null;
  /** Composta ao ano a partir de `taxaJurosMensalPercentual` — `null` na mesma condição. */
  taxaJurosAnualEfetivaPercentual: number | null;
  taxaDesconhecida: boolean;
  /** Por que a taxa é desconhecida (financiamento 'OUTRO' sem fórmula, ou dívida de consumo
   * sem `taxa_juros_mensal_estimada` preenchida) — `null` quando a taxa é conhecida. */
  motivoTaxaDesconhecida: string | null;
  /** `null` quando a taxa é desconhecida — nunca estimamos custo sem taxa. */
  custoAnualEstimadoJuros: number | null;
  formulaCustoAnual: string;
  /** Contexto real (não projeção): quanto de juros esta dívida já custou nos últimos 12
   * meses, via `historicoJuros.ts::obterJurosPagosPeriodo`. */
  jurosPagosUltimos12Meses: number;
  formulaJurosPagosUltimos12Meses: string;
}

/** Custo de carregar UMA dívida ativa (saldo devedor > 0) até o fim: taxa anual efetiva,
 * custo anual estimado (aproximação simples, ver `FORMULA_CUSTO_ANUAL`) e o juro real já
 * pago nos últimos 12 meses (contexto histórico, não estimativa). `dataReferencia` tem
 * default `hoje()` para uso normal (tela/relatório do dia); parâmetro explícito existe para
 * reproduzir um cálculo em uma data passada (ex: testes determinísticos). */
export function calcularCustoDeCarregarDivida(
  db: Database,
  dividaTipo: DividaTipo,
  dividaId: number,
  dataReferencia: string = hoje(),
): CustoDeCarregarDivida {
  if (dividaTipo === "financiamento") {
    const [f] = consultar<Financiamento & { apelido_imovel: string | null }>(
      db,
      `SELECT f.*, i.apelido AS apelido_imovel FROM financiamentos f LEFT JOIN imoveis i ON i.id = f.imovel_id WHERE f.id = ?`,
      [dividaId],
    );
    if (!f) throw new Error(`Financiamento ${dividaId} não encontrado.`);

    const saldo = saldoDevedorFinanciamento(f, dataReferencia) ?? 0;
    const descricao = descricaoFinanciamento(f.instituicao, f.apelido_imovel);

    let taxaMensal: number | null = null;
    let motivoTaxaDesconhecida: string | null = null;
    if (f.sistema === "OUTRO") {
      motivoTaxaDesconhecida = `Financiamento 'OUTRO' (${f.instituicao}) não segue fórmula de amortização SAC/PRICE — taxa_juros_mensal cadastrada não representa o custo real contratado (ver financiamento/amortizacao.ts::gerarCronograma, que não gera cronograma para 'OUTRO').`;
    } else {
      taxaMensal = f.taxa_juros_mensal;
    }

    const taxaAnual = taxaAnualEfetiva(taxaMensal);
    const custoAnual = taxaAnual !== null ? arredondarCentavos(saldo * (taxaAnual / 100)) : null;

    return {
      dividaTipo: "financiamento",
      dividaId,
      descricaoDivida: descricao,
      saldoDevedorAtual: saldo,
      taxaJurosMensalPercentual: taxaMensal,
      taxaJurosAnualEfetivaPercentual: taxaAnual,
      taxaDesconhecida: taxaAnual === null,
      motivoTaxaDesconhecida,
      custoAnualEstimadoJuros: custoAnual,
      formulaCustoAnual: FORMULA_CUSTO_ANUAL,
      jurosPagosUltimos12Meses: jurosPagosUltimos12Meses(db, "financiamento", dividaId, dataReferencia),
      formulaJurosPagosUltimos12Meses: FORMULA_JUROS_12M,
    };
  }

  const [d] = consultar<DividaConsumoRow>(db, "SELECT * FROM dividas_consumo WHERE id = ?", [dividaId]);
  if (!d) throw new Error(`Dívida de consumo ${dividaId} não encontrada.`);

  const descricao = descricaoDividaConsumo(d.instituicao, d.tipo);
  const taxaMensal = d.taxa_juros_mensal_estimada;
  const motivoTaxaDesconhecida =
    taxaMensal === null
      ? `Dívida de consumo (${d.instituicao}) sem taxa_juros_mensal_estimada informada — a fonte típica (Registrato/SCR do Bacen) traz só o saldo devedor, não a taxa; cadastre-a para incluir esta dívida na comparação pelo método avalanche.`
      : null;
  const taxaAnual = taxaAnualEfetiva(taxaMensal);
  const custoAnual = taxaAnual !== null ? arredondarCentavos(d.saldo_devedor_atual * (taxaAnual / 100)) : null;

  return {
    dividaTipo: "divida_consumo",
    dividaId,
    descricaoDivida: descricao,
    saldoDevedorAtual: d.saldo_devedor_atual,
    taxaJurosMensalPercentual: taxaMensal,
    taxaJurosAnualEfetivaPercentual: taxaAnual,
    taxaDesconhecida: taxaAnual === null,
    motivoTaxaDesconhecida,
    custoAnualEstimadoJuros: custoAnual,
    formulaCustoAnual: FORMULA_CUSTO_ANUAL,
    jurosPagosUltimos12Meses: jurosPagosUltimos12Meses(db, "divida_consumo", dividaId, dataReferencia),
    formulaJurosPagosUltimos12Meses: FORMULA_JUROS_12M,
  };
}

export interface ItemPriorizacaoQuitacao extends CustoDeCarregarDivida {
  /** 1 = primeira a atacar. Método avalanche: maior taxa anual efetiva primeiro; dívidas com
   * `taxaDesconhecida: true` sempre vêm depois de TODAS as dívidas com taxa conhecida. */
  prioridade: number;
  /** Saldo devedor rateado pelos destinos cadastrados da dívida (`listarRateioDestinos` +
   * `aplicarRateio`) — "quanto desta dívida é da empresa vs pessoal vs advocacia". */
  quebraPorDestino: ValorRateado[];
  /** Texto determinístico (template, não gerado por IA) explicando a posição no ranking. */
  justificativa: string;
}

function formatarPercentual(valor: number): string {
  return `${valor.toFixed(2)}%`;
}

function construirJustificativa(c: CustoDeCarregarDivida, indice: number, maiorTaxaConhecida: number | null): string {
  if (c.taxaDesconhecida) {
    return (
      `Taxa de juros não informada para esta dívida — sem esse dado não é possível estimar o custo anual de ` +
      `juros nem posicioná-la pelo método avalanche (maior taxa primeiro). ${c.motivoTaxaDesconhecida ?? ""} ` +
      `Colocada ao final da lista até a taxa ser cadastrada; o saldo devedor de ${formatarMoeda(c.saldoDevedorAtual)} ` +
      `continua relevante para a decisão de liquidez.`
    ).trim();
  }

  const taxaFmt = formatarPercentual(c.taxaJurosAnualEfetivaPercentual!);
  const custoFmt = formatarMoeda(c.custoAnualEstimadoJuros ?? 0);

  if (indice === 0) {
    return (
      `Taxa de ${taxaFmt} a.a. é a mais alta do portfólio entre as dívidas com taxa conhecida (método avalanche) ` +
      `— quitar ou amortizar esta dívida primeiro reduz o custo financeiro anual em até ${custoFmt} ` +
      `(estimativa, ver fórmula em custoAnualEstimadoJuros).`
    );
  }

  return (
    `Taxa de ${taxaFmt} a.a. — ${indice + 1}ª mais alta do portfólio entre as dívidas com taxa conhecida ` +
    `(a mais alta é ${formatarPercentual(maiorTaxaConhecida ?? 0)} a.a.). Custo anual estimado de juros mantendo ` +
    `esta dívida em aberto: ${custoFmt}.`
  );
}

/** TODAS as dívidas ativas (financiamento com saldo devedor > 0, ou dívida de consumo com
 * saldo devedor > 0), ordenadas por prioridade de quitação — critério principal: TAXA DE
 * JUROS EFETIVA ANUAL, maior primeiro (avalanche). Dívida sem taxa conhecida nunca é
 * excluída: entra no fim da lista com `taxaDesconhecida: true`, desempatada entre si pelo
 * maior saldo devedor (maior exposição) já que não há taxa para comparar. `dataReferencia`
 * tem default `hoje()` — parâmetro explícito existe para reprodutibilidade (ex: testes). */
export function priorizarQuitacaoDividas(db: Database, dataReferencia: string = hoje()): ItemPriorizacaoQuitacao[] {
  const financiamentosAtivos = consultar<Financiamento>(db, "SELECT * FROM financiamentos").filter(
    (f) => (saldoDevedorFinanciamento(f, dataReferencia) ?? 0) > 0,
  );
  const dividasConsumoAtivas = consultar<DividaConsumoRow>(db, "SELECT * FROM dividas_consumo").filter(
    (d) => d.saldo_devedor_atual > 0,
  );

  const custos: CustoDeCarregarDivida[] = [
    ...financiamentosAtivos.map((f) => calcularCustoDeCarregarDivida(db, "financiamento", f.id, dataReferencia)),
    ...dividasConsumoAtivas.map((d) => calcularCustoDeCarregarDivida(db, "divida_consumo", d.id, dataReferencia)),
  ];

  const comTaxa = custos.filter((c) => !c.taxaDesconhecida);
  const semTaxa = custos.filter((c) => c.taxaDesconhecida);

  // Avalanche: maior taxa anual efetiva primeiro; empate desempatado pelo maior custo anual
  // estimado (mesma ordem de "mais caro para carregar").
  comTaxa.sort(
    (a, b) =>
      b.taxaJurosAnualEfetivaPercentual! - a.taxaJurosAnualEfetivaPercentual! ||
      (b.custoAnualEstimadoJuros ?? 0) - (a.custoAnualEstimadoJuros ?? 0),
  );
  // Sem taxa conhecida: não há critério de avalanche a aplicar — desempata pelo maior saldo
  // devedor (maior exposição), sempre depois de todas as dívidas com taxa conhecida.
  semTaxa.sort((a, b) => b.saldoDevedorAtual - a.saldoDevedorAtual);

  const ordenados = [...comTaxa, ...semTaxa];
  const maiorTaxaConhecida = comTaxa[0]?.taxaJurosAnualEfetivaPercentual ?? null;

  return ordenados.map((c, indice) => ({
    ...c,
    prioridade: indice + 1,
    quebraPorDestino: quebraPorDestinoSaldo(db, c.dividaTipo, c.dividaId, c.saldoDevedorAtual),
    justificativa: construirJustificativa(c, indice, maiorTaxaConhecida),
  }));
}

export interface ResultadoSimulacaoAmortizacao {
  dividaTipo: DividaTipo;
  dividaId: number;
  valorAmortizadoSolicitado: number;
  /** Igual a `valorAmortizadoSolicitado`, exceto quando maior que o saldo devedor — nesse
   * caso limitado ao saldo devedor (não se amortiza mais do que se deve). */
  valorAmortizadoEfetivo: number;
  saldoDevedorAntes: number;
  novoSaldoDevedor: number;
  /** Só preenchido para financiamento SAC/PRICE (cronograma teórico existe); `null` para
   * dívida de consumo, que não tem cronograma — ver `formula` para a aproximação usada lá. */
  totalJurosRestanteAntes: number | null;
  totalJurosRestanteDepois: number | null;
  economiaJurosEstimada: number;
  formula: string;
  fonteDados: string;
}

/** Estima quanto de juro futuro deixaria de ser pago com uma amortização parcial de
 * `valorAmortizado` HOJE (ou em `dataReferencia`, se informada), para uma dívida específica.
 *
 * Financiamento SAC/PRICE: recalcula o cronograma (`financiamento/amortizacao.ts`) com o
 * saldo devedor reduzido, MANTENDO o número de parcelas restantes originais (reduz o valor
 * de cada parcela, não o prazo — a mesma opção mais comum oferecida por bancos; reduzir prazo
 * em vez de parcela dá uma economia diferente, não simulada aqui) — compara o total de juros
 * do cronograma original (parcelas ainda não vencidas) com o do cronograma recalculado.
 *
 * Financiamento 'OUTRO': sem cronograma nem taxa conhecida (ver módulo) — lança erro em vez
 * de fabricar uma economia sem base.
 *
 * Dívida de consumo: estimativa simples e documentada — `valorAmortizado × taxa mensal
 * estimada × meses restantes estimados` (mesma aproximação de parcelas restantes de
 * `balancoPatrimonial.ts::estimarParcelasRestantes`). Exige `taxa_juros_mensal_estimada`
 * cadastrada — sem taxa, lança erro (nunca inventa taxa).
 *
 * Puramente de leitura/simulação: não escreve no banco nem lança no razão. */
export function simularImpactoAmortizacaoParcial(
  db: Database,
  dividaTipo: DividaTipo,
  dividaId: number,
  valorAmortizado: number,
  dataReferencia: string = hoje(),
): ResultadoSimulacaoAmortizacao {
  if (!(valorAmortizado > 0)) {
    throw new Error(`Valor de amortização inválido (${valorAmortizado}) — deve ser maior que zero.`);
  }

  if (dividaTipo === "financiamento") {
    const [f] = consultar<Financiamento>(db, "SELECT * FROM financiamentos WHERE id = ?", [dividaId]);
    if (!f) throw new Error(`Financiamento ${dividaId} não encontrado.`);
    if (f.sistema === "OUTRO") {
      throw new Error(
        `Financiamento 'OUTRO' (${f.instituicao}) não tem cronograma de amortização SAC/PRICE nem taxa contratada ` +
          `conhecida — não é possível simular economia de juros para este sistema (ver financiamento/amortizacao.ts::gerarCronograma).`,
      );
    }

    const cronogramaOriginal = gerarCronograma(f);
    const saldoAtual = saldoDevedorFinanciamento(f, dataReferencia, cronogramaOriginal) ?? 0;
    if (saldoAtual <= 0) {
      throw new Error(`Financiamento ${dividaId} já está quitado (saldo devedor zero em ${dataReferencia}) — não há juros futuros a economizar.`);
    }

    const parcelasFuturas = cronogramaOriginal.filter((p) => p.data > dataReferencia); // ainda não vencidas
    const totalJurosRestanteAntes = arredondarCentavos(parcelasFuturas.reduce((acc, p) => acc + p.juros, 0));
    const parcelasRestantes = parcelasFuturas.length;

    const valorAmortizadoEfetivo = Math.min(valorAmortizado, saldoAtual);
    const novoSaldo = arredondarCentavos(saldoAtual - valorAmortizadoEfetivo);

    const totalJurosRestanteDepois =
      novoSaldo <= 0 || parcelasRestantes === 0
        ? 0
        : arredondarCentavos(
            (f.sistema === "PRICE" ? gerarCronogramaPrice : gerarCronogramaSAC)(
              novoSaldo,
              f.taxa_juros_mensal,
              parcelasRestantes,
              dataReferencia,
            ).reduce((acc, p) => acc + p.juros, 0),
          );

    return {
      dividaTipo: "financiamento",
      dividaId,
      valorAmortizadoSolicitado: valorAmortizado,
      valorAmortizadoEfetivo,
      saldoDevedorAntes: saldoAtual,
      novoSaldoDevedor: novoSaldo,
      totalJurosRestanteAntes,
      totalJurosRestanteDepois,
      economiaJurosEstimada: arredondarCentavos(totalJurosRestanteAntes - totalJurosRestanteDepois),
      formula:
        `Recalcula o cronograma ${f.sistema} (financiamento/amortizacao.ts) com o saldo devedor reduzido ` +
        `(saldo atual − valor amortizado, limitado ao saldo atual) e o mesmo número de parcelas restantes ` +
        `originais (mantém o prazo final do contrato, reduz o valor de cada parcela) — economia = total de ` +
        `juros do cronograma original (parcelas ainda não vencidas) menos o total de juros do cronograma ` +
        `recalculado. Aproximação: é uma simulação, não uma renegociação real; o banco pode oferecer redução ` +
        `de prazo em vez de parcela, com resultado diferente.`,
      fonteDados: `financiamentos#${dividaId} — cronograma recalculado por financiamento/amortizacao.ts::gerarCronogramaSAC/gerarCronogramaPrice`,
    };
  }

  const [d] = consultar<DividaConsumoRow>(db, "SELECT * FROM dividas_consumo WHERE id = ?", [dividaId]);
  if (!d) throw new Error(`Dívida de consumo ${dividaId} não encontrada.`);
  if (d.saldo_devedor_atual <= 0) {
    throw new Error(`Dívida de consumo ${dividaId} já está quitada (saldo devedor atual zero) — não há juros futuros a economizar.`);
  }
  if (d.taxa_juros_mensal_estimada === null) {
    throw new Error(
      `Dívida de consumo ${dividaId} (${d.instituicao}) sem taxa_juros_mensal_estimada informada — não é possível ` +
        `estimar economia de juros sem uma taxa (nunca inventamos taxa). Cadastre a taxa estimada primeiro.`,
    );
  }

  const mesesRestantesEstimados = estimarParcelasRestantes(d.saldo_devedor_atual, d.parcela_mensal);
  const valorAmortizadoEfetivo = Math.min(valorAmortizado, d.saldo_devedor_atual);
  const novoSaldo = arredondarCentavos(d.saldo_devedor_atual - valorAmortizadoEfetivo);
  const economiaJurosEstimada = arredondarCentavos(valorAmortizadoEfetivo * (d.taxa_juros_mensal_estimada / 100) * mesesRestantesEstimados);

  return {
    dividaTipo: "divida_consumo",
    dividaId,
    valorAmortizadoSolicitado: valorAmortizado,
    valorAmortizadoEfetivo,
    saldoDevedorAntes: d.saldo_devedor_atual,
    novoSaldoDevedor: novoSaldo,
    totalJurosRestanteAntes: null,
    totalJurosRestanteDepois: null,
    economiaJurosEstimada,
    formula:
      `Estimativa simples (dívida de consumo não tem cronograma de amortização): valor amortizado (limitado ao ` +
      `saldo devedor atual) × taxa_juros_mensal_estimada × meses restantes estimados (ceil(saldo devedor atual ÷ ` +
      `parcela mensal), mesma aproximação de balancoPatrimonial.ts::estimarParcelasRestantes) — assume que o valor ` +
      `amortizado deixa de gerar juros por todos os meses restantes estimados, o que tende a superestimar levemente ` +
      `a economia real.`,
    fonteDados: `dividas_consumo#${dividaId}.taxa_juros_mensal_estimada, .saldo_devedor_atual, .parcela_mensal`,
  };
}
