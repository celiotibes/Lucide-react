/**
 * MÓDULO: Simulação de liquidez futura — "o que acontece com meu caixa mensal nos próximos N
 * meses se eu amortizar parcialmente ou quitar uma dívida específica, mantendo a média
 * histórica real de ocupação/receita dos imóveis e o reajuste médio histórico de aluguel".
 *
 * ##########################################################################################
 * AVISO CENTRAL — SIMULAÇÃO GERENCIAL, NUNCA CONTÁBIL: todo número aqui é uma PROJEÇÃO (receita
 * futura, despesa futura, saldo devedor futuro) — nenhuma função deste módulo escreve em
 * `ledger_entries`, `aluguel_competencias`, `contas_a_pagar` nem em qualquer tabela do razão, e
 * NENHUM valor daqui deve alimentar ou substituir DRE, Balanço Patrimonial ou Demonstração de
 * Fluxo de Caixa oficiais (regime de competência, a custo histórico) — ver `erp/relatorios-
 * integrados.ts`/`reports/*` para esses. É puramente um apoio à decisão de alocação de caixa
 * ("vale a pena amortizar esta dívida agora?"), no mesmo espírito gerencial/paralelo de
 * `patrimonio/indicadoresHistorico.ts` e `patrimonio/avaliacaoMercado.ts`.
 * ##########################################################################################
 *
 * NUNCA PROJEÇÃO DE MERCADO INVENTADA — decisão do usuário (rodada anterior): toda projeção de
 * receita/reajuste futuro é extrapolação ESTATÍSTICA de dado real já cadastrado, nunca um
 * número de mercado "achado" por IA:
 *   - Receita/ocupação futura: média REAL dos últimos meses disponíveis em
 *     `aluguel_competencias` (nunca a receita contratual nominal) — ver
 *     `projetarOcupacaoEReceitaMedia`. Amostra pequena é sinalizada explicitamente
 *     (`amostraPequena`), nunca escondida.
 *   - Reajuste médio de aluguel: 1ª prioridade = média real de `contrato_reajustes.
 *     percentual_aplicado` (reajustes JÁ aplicados a contratos reais); 2ª prioridade (sem
 *     nenhum reajuste ainda registrado) = variação composta do índice oficial IGP-M já
 *     baixado/lançado em `indices_economicos` (`domain/indices/bacenSgs.ts`, BACEN/FGV — nunca
 *     um índice "estimado por IA"); sem nenhuma das duas fontes, a taxa fica `null` e a
 *     projeção usa crescimento ZERO (nunca fabrica um percentual).
 *   - Se uma camada de IA algum dia comentar este relatório, só pode dar leitura qualitativa
 *     ("essa queda de liquidez no mês 3 é por causa da saída de caixa da amortização, não um
 *     problema estrutural") — NUNCA gerar o número de receita/reajuste projetado.
 *
 * REUTILIZAÇÃO — nada do cálculo de amortização/juros é duplicado aqui:
 *   - `priorizacaoQuitacao.ts::simularImpactoAmortizacaoParcial` é a ÚNICA fonte da economia
 *     de juros e do novo saldo devedor da dívida-alvo — nunca recalculado por fora.
 *   - `financiamento/amortizacao.ts::gerarCronograma[SAC|Price]` é a ÚNICA fonte de cronograma
 *     (tanto o original — "manter" — quanto o recomputado sobre o novo saldo — "alternativo",
 *     a mesma chamada que `simularImpactoAmortizacaoParcial` já faz internamente, aqui refeita
 *     só para obter a quebra MÊS A MÊS que aquela função não expõe, não para redefinir a conta).
 *   - `erp/analytics-integradas.ts::calcularOcupacao` é a base do denominador de ocupação
 *     (total de imóveis elegíveis à locação).
 *
 * LIMITAÇÃO DE DADO conhecida e documentada (ver `projetarOcupacaoEReceitaMedia`): dívida de
 * consumo e financiamento 'OUTRO' não têm cronograma teórico — o serviço mensal futuro dessas
 * dívidas é uma aproximação simples (parcela fixa por `ceil(saldo ÷ parcela)` meses, mesma
 * aproximação já documentada em `priorizacaoQuitacao.ts::estimarParcelasRestantes`), nunca a
 * data exata de quitação de um extrato bancário real.
 */
import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import { calcularOcupacao } from "../erp/analytics-integradas";
import { listarTaxas } from "../indices/bacenSgs";
import {
  gerarCronograma,
  gerarCronogramaPrice,
  gerarCronogramaSAC,
  type Financiamento,
  type ParcelaAmortizacao,
} from "../financiamento/amortizacao";
import { saldoDevedorFinanciamento } from "../patrimonio/balancoPatrimonial";
import {
  simularImpactoAmortizacaoParcial,
  type ResultadoSimulacaoAmortizacao,
} from "./priorizacaoQuitacao";
import type { DividaTipo } from "./rateioDividas";

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Mesma fórmula de `somarMeses` em `financiamento/amortizacao.ts`/`priorizacaoQuitacao.ts` —
 * cópia local pelo mesmo critério já documentado nesses módulos (dependência de um único
 * arquivo, sem criar um utilitário compartilhado novo fora do escopo desta tarefa). */
function somarMeses(dataIso: string, meses: number): string {
  const data = new Date(dataIso + "T00:00:00");
  data.setMonth(data.getMonth() + meses);
  return data.toISOString().slice(0, 10);
}

function arredondar2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function chaveAnoMes(dataIso: string): number {
  return Number(dataIso.slice(0, 4)) * 100 + Number(dataIso.slice(5, 7));
}

// ============================================================================
// 1) OCUPAÇÃO E RECEITA MÉDIA HISTÓRICA — base real de toda a simulação
// ============================================================================

/** Amostra com menos meses de dado real do que isto é sinalizada como pequena — abaixo de um
 * trimestre, a média mensal tem baixa confiança estatística (qualquer mês atípico domina o
 * resultado). Nunca impede o cálculo, só sinaliza (mesma filosofia de `taxaDesconhecida` em
 * `priorizacaoQuitacao.ts`: nunca excluir silenciosamente). */
const LIMITE_AMOSTRA_PEQUENA = 3;

export interface ProjecaoOcupacaoReceita {
  imovelId: number | null;
  mesesHistoricoSolicitados: number;
  /** Quantos meses da janela pedida tinham de fato ao menos uma competência de aluguel
   * gerada — pode ser menor que `mesesHistoricoSolicitados` (ex: imóvel adquirido há pouco
   * tempo, ou sistema usado há menos tempo que a janela pedida). */
  mesesComDadosReais: number;
  amostraPequena: boolean;
  /** 0–100. Média, entre os meses com dado real, de (imóveis com competência gerada no mês ÷
   * total de imóveis elegíveis à locação — mesmo denominador de `calcularOcupacao`). */
  ocupacaoMediaHistorica: number;
  /** Média real de `aluguel_competencias.valor_devido` por mês, nos meses com dado — nunca o
   * valor contratual nominal dos contratos ativos hoje. */
  receitaMediaHistoricaMensal: number;
  mesesDespesaComDadosReais: number;
  /** Média real de `contas_a_pagar.valor` por mês, nos meses com lançamento. */
  despesaMediaHistoricaMensal: number;
  /** Taxa anual composta de reajuste de aluguel, extraída de dado real (ver cabeçalho do
   * módulo) — `null` quando nenhuma fonte real está disponível (nunca fabricada). */
  taxaReajusteMediaAnualPct: number | null;
  fonteTaxaReajuste: string;
  /** Explica exatamente a janela, as fontes e qualquer limitação de amostra — legenda
   * obrigatória desta área do sistema. */
  metodologia: string;
}

interface MesJanela {
  ano: number;
  mes: number;
  chave: number;
}

function construirJanela(dataFinalIso: string, quantidadeMeses: number): MesJanela[] {
  const lista: MesJanela[] = [];
  let cursor = dataFinalIso;
  for (let i = 0; i < quantidadeMeses; i++) {
    const ano = Number(cursor.slice(0, 4));
    const mes = Number(cursor.slice(5, 7));
    lista.unshift({ ano, mes, chave: ano * 100 + mes });
    cursor = somarMeses(cursor, -1);
  }
  return lista;
}

/** Reajuste médio real de aluguel — ver prioridade de fontes no cabeçalho do módulo. Função
 * pura de leitura, nunca escreve nada. */
function taxaReajusteMediaAnualReal(
  db: Database,
  imovelId: number | null,
  dataReferencia: string,
): { taxa: number | null; fonte: string } {
  const linhasReajuste = consultar<{ percentual_aplicado: number }>(
    db,
    `SELECT cr.percentual_aplicado
     FROM contrato_reajustes cr
     JOIN contratos_locacao c ON c.id = cr.contrato_id
     WHERE cr.eh_reajuste_anual = 1
       AND cr.data_vigencia <= ?
       AND (? IS NULL OR c.imovel_id = ?)`,
    [dataReferencia, imovelId, imovelId],
  );
  if (linhasReajuste.length > 0) {
    const media = linhasReajuste.reduce((acc, l) => acc + l.percentual_aplicado, 0) / linhasReajuste.length;
    return {
      taxa: arredondar2(media),
      fonte:
        `Média aritmética de contrato_reajustes.percentual_aplicado (${linhasReajuste.length} reajuste(s) anual(is) ` +
        `JÁ aplicado(s) a contrato(s) reais${imovelId !== null ? ` do imóvel #${imovelId}` : ""}) — histórico interno real, ` +
        `nunca um número de mercado.`,
    };
  }

  const taxasIgpm = listarTaxas(db, "igpm").filter((t) => t.mes_referencia < dataReferencia);
  if (taxasIgpm.length > 0) {
    const ultimas = taxasIgpm.slice(-12);
    const fatorComposto = ultimas.reduce((acc, t) => acc * (1 + t.taxa_mensal / 100), 1);
    return {
      taxa: arredondar2((fatorComposto - 1) * 100),
      fonte:
        `Nenhum reajuste de contrato ainda registrado — variação composta dos últimos ${ultimas.length} mês(es) do ` +
        `IGP-M (indices_economicos, mesma fonte usada em contratos/reajustes.ts), índice oficial (FGV) real, ` +
        `nunca um índice/percentual de mercado estimado por IA.`,
    };
  }

  return {
    taxa: null,
    fonte:
      "Nenhum reajuste de contrato registrado (contrato_reajustes) nem taxa de IGP-M cadastrada em " +
      "indices_economicos — sem dado real disponível, a taxa de reajuste futuro NÃO é estimada (a projeção de " +
      "receita mantém o valor médio histórico constante, sem nenhum crescimento fabricado).",
  };
}

/** Ocupação e receita média histórica REAL — base de toda projeção de liquidez futura deste
 * módulo. Nunca usa o valor contratual nominal dos contratos vigentes hoje como "receita
 * futura": sempre a média do que de fato foi devido (`aluguel_competencias.valor_devido`) nos
 * meses com dado disponível dentro da janela pedida. `imovelId` restringe a um único imóvel;
 * omitido, considera o portfólio inteiro (mesmo escopo de `calcularOcupacao`). */
export function projetarOcupacaoEReceitaMedia(
  db: Database,
  opcoes: { imovelId?: number; mesesHistorico?: number; dataReferencia?: string } = {},
): ProjecaoOcupacaoReceita {
  const imovelId = opcoes.imovelId ?? null;
  const mesesHistorico = opcoes.mesesHistorico ?? 12;
  const dataReferencia = opcoes.dataReferencia ?? hoje();
  if (!(mesesHistorico > 0)) {
    throw new Error(`mesesHistorico inválido (${mesesHistorico}) — deve ser maior que zero.`);
  }

  const janela = construirJanela(dataReferencia, mesesHistorico);
  const chaveInicio = janela[0].chave;
  const chaveFim = janela[janela.length - 1].chave;

  const linhasReceita = consultar<{ ano: number; mes: number; total: number; imoveis: number }>(
    db,
    `SELECT ano, mes, COALESCE(SUM(valor_devido), 0) as total, COUNT(DISTINCT imovel_id) as imoveis
     FROM aluguel_competencias
     WHERE status != 'cancelado'
       AND (ano * 100 + mes) BETWEEN ? AND ?
       AND (? IS NULL OR imovel_id = ?)
     GROUP BY ano, mes`,
    [chaveInicio, chaveFim, imovelId, imovelId],
  );
  const receitaPorChave = new Map(linhasReceita.map((l) => [l.ano * 100 + l.mes, l]));
  const mesesComReceita = janela.filter((m) => receitaPorChave.has(m.chave));
  const mesesComDadosReais = mesesComReceita.length;
  const amostraPequena = mesesComDadosReais < LIMITE_AMOSTRA_PEQUENA;

  const ocupacaoAtual = calcularOcupacao(db);
  const totalImoveisElegiveis = imovelId !== null ? 1 : ocupacaoAtual.total_imoveis;

  let ocupacaoMediaHistorica: number;
  if (mesesComDadosReais === 0) {
    // Sem nenhuma competência real na janela — usa a ocupação ATUAL (snapshot de
    // calcularOcupacao) como única referência disponível; nunca inventa uma taxa histórica.
    ocupacaoMediaHistorica = imovelId !== null ? 0 : arredondar2(ocupacaoAtual.taxa_ocupacao_pct);
  } else if (totalImoveisElegiveis > 0) {
    const mediaImoveisOcupados =
      mesesComReceita.reduce((acc, m) => acc + (receitaPorChave.get(m.chave)?.imoveis ?? 0), 0) / mesesComDadosReais;
    ocupacaoMediaHistorica = arredondar2((mediaImoveisOcupados / totalImoveisElegiveis) * 100);
  } else {
    ocupacaoMediaHistorica = 0;
  }

  const totalReceita = mesesComReceita.reduce((acc, m) => acc + (receitaPorChave.get(m.chave)?.total ?? 0), 0);
  const receitaMediaHistoricaMensal = mesesComDadosReais > 0 ? arredondar2(totalReceita / mesesComDadosReais) : 0;

  const linhasDespesa = consultar<{ ano: number; mes: number; total: number }>(
    db,
    `SELECT CAST(strftime('%Y', data_vencimento) AS INTEGER) as ano,
            CAST(strftime('%m', data_vencimento) AS INTEGER) as mes,
            COALESCE(SUM(valor), 0) as total
     FROM contas_a_pagar
     WHERE status != 'cancelada'
       AND (? IS NULL OR imovel_id = ?)
     GROUP BY ano, mes
     HAVING (ano * 100 + mes) BETWEEN ? AND ?`,
    [imovelId, imovelId, chaveInicio, chaveFim],
  );
  const mesesDespesaComDadosReais = linhasDespesa.length;
  const totalDespesa = linhasDespesa.reduce((acc, l) => acc + l.total, 0);
  const despesaMediaHistoricaMensal = mesesDespesaComDadosReais > 0 ? arredondar2(totalDespesa / mesesDespesaComDadosReais) : 0;

  const { taxa: taxaReajusteMediaAnualPct, fonte: fonteTaxaReajuste } = taxaReajusteMediaAnualReal(db, imovelId, dataReferencia);

  const inicioFmt = `${janela[0].ano}-${String(janela[0].mes).padStart(2, "0")}`;
  const fimFmt = `${janela[janela.length - 1].ano}-${String(janela[janela.length - 1].mes).padStart(2, "0")}`;
  const metodologia =
    `Janela solicitada: ${mesesHistorico} mês(es), de ${inicioFmt} a ${fimFmt} (terminando em ${dataReferencia}). ` +
    `Ocupação/receita: média real de ${mesesComDadosReais} mês(es) com competência de aluguel gerada ` +
    `(aluguel_competencias${imovelId !== null ? `, imóvel #${imovelId}` : ", todo o portfólio"}) — nunca o valor contratual nominal. ` +
    (amostraPequena
      ? `AMOSTRA PEQUENA: só ${mesesComDadosReais} mês(es) de histórico real disponível (mínimo recomendado: ${LIMITE_AMOSTRA_PEQUENA}) — ` +
        `a média abaixo tem baixa confiança estatística; use com cautela ou aguarde mais meses de dado real.`
      : `Amostra considerada suficiente (${mesesComDadosReais} ≥ ${LIMITE_AMOSTRA_PEQUENA} meses).`) +
    ` Despesa recorrente: média real de ${mesesDespesaComDadosReais} mês(es) com lançamento em contas_a_pagar. ` +
    `Reajuste de aluguel futuro: ${fonteTaxaReajuste}`;

  return {
    imovelId,
    mesesHistoricoSolicitados: mesesHistorico,
    mesesComDadosReais,
    amostraPequena,
    ocupacaoMediaHistorica,
    receitaMediaHistoricaMensal,
    mesesDespesaComDadosReais,
    despesaMediaHistoricaMensal,
    taxaReajusteMediaAnualPct,
    fonteTaxaReajuste,
    metodologia,
  };
}

// ============================================================================
// 2) SIMULAÇÃO DE CENÁRIO DE LIQUIDEZ FUTURA — mês a mês, "manter" vs. alternativo
// ============================================================================

export type CenarioLiquidez = "manter" | "amortizar_parcial" | "quitar_divida";

export interface ParametrosSimulacaoLiquidez {
  meses: number;
  cenario: CenarioLiquidez;
  /** Obrigatório para 'amortizar_parcial'/'quitar_divida' — qual dívida é a alvo da simulação. */
  dividaTipo?: DividaTipo;
  dividaId?: number;
  /** Obrigatório para 'amortizar_parcial'. Ignorado para 'quitar_divida' (usa o saldo devedor
   * integral da dívida-alvo, via `simularImpactoAmortizacaoParcial`). */
  valorAmortizacao?: number;
  imovelId?: number;
  mesesHistorico?: number;
  dataReferencia?: string;
}

export interface MesLiquidezComparada {
  /** 1-based: 1 = primeiro mês futuro após `dataReferencia`. */
  indice: number;
  ano: number;
  mes: number;
  receitaProjetada: number;
  despesaRecorrenteProjetada: number;
  servicoDividaTotalManter: number;
  servicoDividaTotalAlternativo: number;
  /** > 0 só no mês 1, só no cenário alternativo — saída de caixa única da amortização/quitação. */
  saidaCaixaAmortizacao: number;
  liquidezManter: number;
  liquidezAlternativo: number;
  liquidezAcumuladaManter: number;
  liquidezAcumuladaAlternativo: number;
}

export interface SimulacaoLiquidezResultado {
  parametros: ParametrosSimulacaoLiquidez;
  projecaoBase: ProjecaoOcupacaoReceita;
  /** `null` quando `cenario = 'manter'` (não há dívida-alvo a simular). */
  impactoAmortizacao: ResultadoSimulacaoAmortizacao | null;
  meses: MesLiquidezComparada[];
  liquidezAcumuladaFinalManter: number;
  liquidezAcumuladaFinalAlternativo: number;
  ganhoLiquidezAcumulada: number;
  /** Aproximação GERENCIAL de patrimônio líquido ao final do horizonte — caixa acumulado no
   * cenário menos o saldo devedor remanescente da dívida-alvo (as demais dívidas são
   * idênticas nos dois cenários e se cancelam no ganho). NÃO é o Balanço Patrimonial oficial. */
  patrimonioLiquidoFuturoManter: number;
  patrimonioLiquidoFuturoAlternativo: number;
  ganhoPatrimonioLiquidoFuturo: number;
  formula: string;
  fonteDados: string;
  avisoGerencial: string;
}

const AVISO_GERENCIAL =
  "SIMULAÇÃO GERENCIAL de apoio à decisão de alocação de caixa — NUNCA substitui nem alimenta os relatórios " +
  "contábeis oficiais (DRE, Balanço Patrimonial, Demonstração de Fluxo de Caixa a custo histórico). Nenhum " +
  "lançamento é gravado no razão (ledger_entries), em contas_a_pagar ou em aluguel_competencias por esta simulação.";

/** Serviço mensal de UM financiamento, lido do cronograma teórico (SAC/Price) pelo (ano,mes) —
 * mesmo padrão de filtro de `historicoJuros.ts::eventosExatosFinanciamentos`. Para 'OUTRO',
 * usa a parcela mensal manual (sem cronograma teórico — mesma limitação documentada em
 * `priorizacaoQuitacao.ts`). */
function servicoFinanciamentoNoMes(f: Financiamento, cronograma: ParcelaAmortizacao[], ano: number, mes: number): number {
  if (f.sistema === "OUTRO") return f.parcela_mensal_manual ?? 0;
  const parcela = cronograma.find((p) => {
    const [a, m] = p.data.split("-").map(Number);
    return a === ano && m === mes;
  });
  return parcela?.parcela ?? 0;
}

/** Serviço mensal de UMA dívida de consumo — aproximação simples documentada no cabeçalho do
 * módulo: `parcela_mensal` fixa por `ceil(saldo ÷ parcela_mensal)` meses a partir de
 * `dataReferencia`, depois zero (dívida considerada quitada). */
function servicoConsumoNoMes(saldo: number, parcelaMensal: number, dataReferencia: string, ano: number, mes: number): number {
  if (saldo <= 0 || parcelaMensal <= 0) return 0;
  const mesesRestantes = Math.ceil(saldo / parcelaMensal);
  const chaveAlvo = ano * 100 + mes;
  const chaveInicio = chaveAnoMes(dataReferencia);
  const chaveFim = chaveAnoMes(somarMeses(dataReferencia, mesesRestantes));
  return chaveAlvo > chaveInicio && chaveAlvo <= chaveFim ? parcelaMensal : 0;
}

interface DividaConsumoBasica {
  id: number;
  saldo_devedor_atual: number;
  parcela_mensal: number;
}

/** Projeta, mês a mês pelos próximos `meses`, a liquidez no cenário "manter como está"
 * (todas as dívidas ativas seguem o cronograma normal) versus o cenário alternativo simulado
 * ('amortizar_parcial' ou 'quitar_divida' de UMA dívida-alvo) — lado a lado, para comparação
 * direta. Receita e despesa futuras vêm de `projetarOcupacaoEReceitaMedia` (nunca inventadas);
 * o efeito da amortização/quitação sobre a dívida-alvo vem de
 * `priorizacaoQuitacao.ts::simularImpactoAmortizacaoParcial` (nunca recalculado por fora). */
export function simularCenarioLiquidezFutura(db: Database, parametros: ParametrosSimulacaoLiquidez): SimulacaoLiquidezResultado {
  const { meses, cenario, dividaTipo, dividaId, valorAmortizacao, imovelId, mesesHistorico = 12 } = parametros;
  const dataReferencia = parametros.dataReferencia ?? hoje();

  if (!(meses > 0)) throw new Error(`Número de meses inválido (${meses}) — deve ser maior que zero.`);

  if (cenario !== "manter") {
    if (dividaTipo === undefined || dividaId === undefined) {
      throw new Error(`Cenário '${cenario}' exige dividaTipo e dividaId (qual dívida será amortizada/quitada).`);
    }
    if (cenario === "amortizar_parcial" && !(valorAmortizacao !== undefined && valorAmortizacao > 0)) {
      throw new Error("Cenário 'amortizar_parcial' exige valorAmortizacao maior que zero.");
    }
  }

  const projecaoBase = projetarOcupacaoEReceitaMedia(db, { imovelId, mesesHistorico, dataReferencia });

  let impactoAmortizacao: ResultadoSimulacaoAmortizacao | null = null;
  let financiamentoAlvo: Financiamento | null = null;
  let dividaConsumoAlvo: DividaConsumoBasica | null = null;
  let cronogramaOriginalAlvo: ParcelaAmortizacao[] = [];
  let cronogramaAlternativoAlvo: ParcelaAmortizacao[] = [];
  let novoSaldoAlvo: number | null = null;

  if (cenario !== "manter" && dividaTipo !== undefined && dividaId !== undefined) {
    if (dividaTipo === "financiamento") {
      const [f] = consultar<Financiamento>(db, "SELECT * FROM financiamentos WHERE id = ?", [dividaId]);
      if (!f) throw new Error(`Financiamento ${dividaId} não encontrado.`);
      financiamentoAlvo = f;
      cronogramaOriginalAlvo = gerarCronograma(f);

      const saldoAtual = saldoDevedorFinanciamento(f, dataReferencia, cronogramaOriginalAlvo) ?? 0;
      const valorAlvo = cenario === "quitar_divida" ? saldoAtual : (valorAmortizacao as number);
      impactoAmortizacao = simularImpactoAmortizacaoParcial(db, "financiamento", dividaId, valorAlvo, dataReferencia);
      novoSaldoAlvo = impactoAmortizacao.novoSaldoDevedor;

      if (novoSaldoAlvo > 0 && f.sistema !== "OUTRO") {
        const parcelasRestantes = cronogramaOriginalAlvo.filter((p) => p.data > dataReferencia).length;
        if (parcelasRestantes > 0) {
          const gerador = f.sistema === "PRICE" ? gerarCronogramaPrice : gerarCronogramaSAC;
          cronogramaAlternativoAlvo = gerador(novoSaldoAlvo, f.taxa_juros_mensal, parcelasRestantes, dataReferencia);
        }
      }
    } else {
      const [d] = consultar<DividaConsumoBasica>(
        db,
        "SELECT id, saldo_devedor_atual, parcela_mensal FROM dividas_consumo WHERE id = ?",
        [dividaId],
      );
      if (!d) throw new Error(`Dívida de consumo ${dividaId} não encontrada.`);
      dividaConsumoAlvo = d;

      const valorAlvo = cenario === "quitar_divida" ? d.saldo_devedor_atual : (valorAmortizacao as number);
      impactoAmortizacao = simularImpactoAmortizacaoParcial(db, "divida_consumo", dividaId, valorAlvo, dataReferencia);
      novoSaldoAlvo = impactoAmortizacao.novoSaldoDevedor;
    }
  }

  // Todas as demais dívidas ativas (exceto a alvo) — pré-carregadas uma única vez fora do
  // laço de meses, cronogramas incluídos.
  const todosFinanciamentos = consultar<Financiamento>(db, "SELECT * FROM financiamentos");
  const todasDividasConsumo = consultar<DividaConsumoBasica>(db, "SELECT id, saldo_devedor_atual, parcela_mensal FROM dividas_consumo");
  const cronogramasPorFinanciamento = new Map<number, ParcelaAmortizacao[]>(
    todosFinanciamentos.map((f) => [f.id, f.id === financiamentoAlvo?.id ? cronogramaOriginalAlvo : gerarCronograma(f)]),
  );

  function servicoOutrasDividasNoMes(ano: number, mes: number): number {
    let total = 0;
    for (const f of todosFinanciamentos) {
      if (dividaTipo === "financiamento" && dividaId === f.id) continue;
      const saldo = saldoDevedorFinanciamento(f, dataReferencia, cronogramasPorFinanciamento.get(f.id)) ?? 0;
      if (saldo <= 0) continue;
      total += servicoFinanciamentoNoMes(f, cronogramasPorFinanciamento.get(f.id) ?? [], ano, mes);
    }
    for (const d of todasDividasConsumo) {
      if (dividaTipo === "divida_consumo" && dividaId === d.id) continue;
      total += servicoConsumoNoMes(d.saldo_devedor_atual, d.parcela_mensal, dataReferencia, ano, mes);
    }
    return arredondar2(total);
  }

  function servicoAlvoManterNoMes(ano: number, mes: number): number {
    if (financiamentoAlvo) return servicoFinanciamentoNoMes(financiamentoAlvo, cronogramaOriginalAlvo, ano, mes);
    if (dividaConsumoAlvo) return servicoConsumoNoMes(dividaConsumoAlvo.saldo_devedor_atual, dividaConsumoAlvo.parcela_mensal, dataReferencia, ano, mes);
    return 0;
  }

  function servicoAlvoAlternativoNoMes(indice: number, ano: number, mes: number): number {
    if (financiamentoAlvo) {
      if (novoSaldoAlvo !== null && novoSaldoAlvo <= 0) return 0;
      return cronogramaAlternativoAlvo[indice - 1]?.parcela ?? 0;
    }
    if (dividaConsumoAlvo && novoSaldoAlvo !== null) {
      return servicoConsumoNoMes(novoSaldoAlvo, dividaConsumoAlvo.parcela_mensal, dataReferencia, ano, mes);
    }
    return 0;
  }

  // Crescimento mensal de receita extraído do reajuste médio histórico real (ver
  // `projetarOcupacaoEReceitaMedia`/cabeçalho do módulo) — ZERO quando não há nenhum dado real
  // disponível, nunca um percentual fabricado.
  const taxaMensalReajuste =
    projecaoBase.taxaReajusteMediaAnualPct !== null ? Math.pow(1 + projecaoBase.taxaReajusteMediaAnualPct / 100, 1 / 12) - 1 : 0;

  const mesesResultado: MesLiquidezComparada[] = [];
  let acumuladoManter = 0;
  let acumuladoAlternativo = 0;

  for (let indice = 1; indice <= meses; indice++) {
    const dataMes = somarMeses(dataReferencia, indice);
    const ano = Number(dataMes.slice(0, 4));
    const mes = Number(dataMes.slice(5, 7));

    const receitaProjetada = arredondar2(projecaoBase.receitaMediaHistoricaMensal * Math.pow(1 + taxaMensalReajuste, indice));
    const despesaRecorrenteProjetada = projecaoBase.despesaMediaHistoricaMensal;

    const servicoOutras = servicoOutrasDividasNoMes(ano, mes);
    const servicoAlvoManter = servicoAlvoManterNoMes(ano, mes);
    const servicoAlvoAlternativo = servicoAlvoAlternativoNoMes(indice, ano, mes);

    const servicoDividaTotalManter = arredondar2(servicoOutras + servicoAlvoManter);
    const servicoDividaTotalAlternativo = arredondar2(servicoOutras + servicoAlvoAlternativo);

    const saidaCaixaAmortizacao = indice === 1 && impactoAmortizacao ? impactoAmortizacao.valorAmortizadoEfetivo : 0;

    const liquidezManter = arredondar2(receitaProjetada - despesaRecorrenteProjetada - servicoDividaTotalManter);
    const liquidezAlternativo = arredondar2(
      receitaProjetada - despesaRecorrenteProjetada - servicoDividaTotalAlternativo - saidaCaixaAmortizacao,
    );

    acumuladoManter = arredondar2(acumuladoManter + liquidezManter);
    acumuladoAlternativo = arredondar2(acumuladoAlternativo + liquidezAlternativo);

    mesesResultado.push({
      indice,
      ano,
      mes,
      receitaProjetada,
      despesaRecorrenteProjetada,
      servicoDividaTotalManter,
      servicoDividaTotalAlternativo,
      saidaCaixaAmortizacao,
      liquidezManter,
      liquidezAlternativo,
      liquidezAcumuladaManter: acumuladoManter,
      liquidezAcumuladaAlternativo: acumuladoAlternativo,
    });
  }

  // Patrimônio líquido futuro — aproximação gerencial (ver JSDoc da interface): caixa
  // acumulado no horizonte menos o saldo devedor remanescente da dívida-alvo ao final dele.
  const dataFimHorizonte = somarMeses(dataReferencia, meses);
  const saldoFinalAlvoManter = financiamentoAlvo
    ? (saldoDevedorFinanciamento(financiamentoAlvo, dataFimHorizonte, cronogramaOriginalAlvo) ?? 0)
    : dividaConsumoAlvo
      ? Math.max(0, dividaConsumoAlvo.saldo_devedor_atual - dividaConsumoAlvo.parcela_mensal * meses)
      : 0;
  const saldoFinalAlvoAlternativo =
    novoSaldoAlvo === null
      ? saldoFinalAlvoManter
      : financiamentoAlvo
        ? meses <= cronogramaAlternativoAlvo.length
          ? cronogramaAlternativoAlvo[meses - 1].saldoDevedorFinal
          : 0
        : Math.max(0, novoSaldoAlvo - (dividaConsumoAlvo?.parcela_mensal ?? 0) * meses);

  // Dívida de consumo não tem cronograma teórico (ver cabeçalho do módulo): `servicoConsumoNoMes`
  // é amortização puramente linear (parcela fixa ÷ meses restantes), sem nenhum juro embutido
  // no fluxo de caixa mês a mês — diferente do financiamento SAC/PRICE, cujo cronograma JÁ
  // decompõe o juro real em cada parcela. Por isso, para dívida de consumo, o juro futuro
  // evitado (`impactoAmortizacao.economiaJurosEstimada`, mesma fonte real de
  // priorizacaoQuitacao.ts — nunca recalculado aqui) é somado explicitamente ao patrimônio
  // líquido futuro alternativo: sem este ajuste, quitar uma dívida de consumo pareceria neutro
  // em patrimônio líquido (o caixa pago hoje é exatamente igual ao principal que deixaria de
  // ser pago depois), quando na realidade também evita o juro que a taxa estimada da dívida
  // cobraria sobre esse saldo. Para financiamento, NUNCA somar de novo aqui — o cronograma já
  // reflete o juro evitado dentro de `acumuladoAlternativo`, e somar de novo duplicaria o ganho.
  const jurosEvitadosConsumoNaoRefletidosNoCaixa = dividaConsumoAlvo && impactoAmortizacao ? impactoAmortizacao.economiaJurosEstimada : 0;

  const patrimonioLiquidoFuturoManter = arredondar2(acumuladoManter - saldoFinalAlvoManter);
  const patrimonioLiquidoFuturoAlternativo = arredondar2(
    acumuladoAlternativo - saldoFinalAlvoAlternativo + jurosEvitadosConsumoNaoRefletidosNoCaixa,
  );

  return {
    parametros,
    projecaoBase,
    impactoAmortizacao,
    meses: mesesResultado,
    liquidezAcumuladaFinalManter: acumuladoManter,
    liquidezAcumuladaFinalAlternativo: acumuladoAlternativo,
    ganhoLiquidezAcumulada: arredondar2(acumuladoAlternativo - acumuladoManter),
    patrimonioLiquidoFuturoManter,
    patrimonioLiquidoFuturoAlternativo,
    ganhoPatrimonioLiquidoFuturo: arredondar2(patrimonioLiquidoFuturoAlternativo - patrimonioLiquidoFuturoManter),
    formula:
      "liquidez do mês = receitaProjetada (receitaMediaHistoricaMensal × (1+taxaMensalReajuste)^mês, reajuste médio " +
      "histórico real — ver projecaoBase) − despesaRecorrenteProjetada (despesaMediaHistoricaMensal) − serviço total " +
      "da dívida do mês (cronograma SAC/PRICE real de financiamento/amortizacao.ts, ou parcela fixa para 'OUTRO'/" +
      "consumo). No cenário alternativo, a dívida-alvo usa o novo saldo/cronograma de " +
      "priorizacaoQuitacao.ts::simularImpactoAmortizacaoParcial, com a saída de caixa integral da amortização no " +
      "mês 1. liquidezAcumulada = soma corrida mês a mês; patrimonioLiquidoFuturo = liquidezAcumulada ao final do " +
      "horizonte − saldo devedor remanescente da dívida-alvo nessa mesma data (aproximação gerencial, não o Balanço " +
      "Patrimonial oficial). Só para dívida de consumo (sem cronograma teórico, serviço mensal sem juro embutido no " +
      "fluxo de caixa): soma-se também economiaJurosEstimada (priorizacaoQuitacao.ts) ao patrimônio líquido futuro " +
      "alternativo, para não tratar como neutro o juro real evitado — financiamento não soma de novo (já refletido " +
      "no cronograma).",
    fonteDados:
      `projetarOcupacaoEReceitaMedia (aluguel_competencias/contas_a_pagar, imóvel ${imovelId ?? "— portfólio inteiro"}) + ` +
      `priorizacaoQuitacao.ts::simularImpactoAmortizacaoParcial (dívida-alvo: ${dividaTipo ?? "nenhuma — cenário 'manter'"}` +
      `${dividaId !== undefined ? ` #${dividaId}` : ""}) + financiamento/amortizacao.ts (cronogramas das demais dívidas ativas).`,
    avisoGerencial: AVISO_GERENCIAL,
  };
}

// ============================================================================
// 3) COMPARAÇÃO DE MÚLTIPLOS CENÁRIOS
// ============================================================================

export interface ParametrosCenario extends ParametrosSimulacaoLiquidez {
  /** Rótulo de exibição do cenário na comparação (ex: "Quitar consignado Banco X"). */
  nome: string;
}

export interface ItemComparacaoCenario {
  nome: string;
  resultado: SimulacaoLiquidezResultado;
  ganhoLiquidezAcumulada: number;
  ganhoPatrimonioLiquidoFuturo: number;
}

export interface ComparacaoCenariosResultado {
  /** Ordenado do maior para o menor `ganhoPatrimonioLiquidoFuturo` — ver `criterioOrdenacao`. */
  itens: ItemComparacaoCenario[];
  criterioOrdenacao: string;
}

/** Roda `simularCenarioLiquidezFutura` para cada cenário informado e ordena pelo ganho de
 * patrimônio líquido futuro (desempate pelo ganho de liquidez acumulada) — a mesma pergunta de
 * `priorizacaoQuitacao.ts`, mas agora comparando cenários completos de N meses, não só a
 * economia agregada de uma única dívida. */
export function compararCenarios(db: Database, cenarios: ParametrosCenario[]): ComparacaoCenariosResultado {
  if (cenarios.length === 0) throw new Error("Informe ao menos um cenário para comparar.");

  const itens: ItemComparacaoCenario[] = cenarios.map((c) => {
    const resultado = simularCenarioLiquidezFutura(db, c);
    return {
      nome: c.nome,
      resultado,
      ganhoLiquidezAcumulada: resultado.ganhoLiquidezAcumulada,
      ganhoPatrimonioLiquidoFuturo: resultado.ganhoPatrimonioLiquidoFuturo,
    };
  });

  itens.sort((a, b) => b.ganhoPatrimonioLiquidoFuturo - a.ganhoPatrimonioLiquidoFuturo || b.ganhoLiquidezAcumulada - a.ganhoLiquidezAcumulada);

  return {
    itens,
    criterioOrdenacao:
      "Ordenado do maior para o menor ganhoPatrimonioLiquidoFuturo (caixa acumulado − saldo devedor remanescente " +
      "da dívida-alvo, ao final do horizonte simulado, versus o cenário 'manter'); empate desempatado pelo maior " +
      "ganhoLiquidezAcumulada.",
  };
}
