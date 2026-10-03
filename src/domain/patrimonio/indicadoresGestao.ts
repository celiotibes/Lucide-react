/**
 * Indicadores de GESTÃO FINANCEIRA consolidados (liquidez, endividamento, margem,
 * ocupação, inadimplência) — painel gerencial do portfólio inteiro, separado dos
 * relatórios contábeis oficiais (DRE/Balanço/Fluxo de Caixa, relatorios-integrados.ts),
 * mas construído sobre os MESMOS dados: nenhuma consulta aqui reescreve a agregação de
 * ativo/passivo/receita/despesa do razão — reaproveita gerarBalanco()/gerarDRE() para
 * isso, do mesmo jeito que avaliacaoMercado.ts é gerencial em cima do mesmo ledger que
 * o Balanço oficial usa a custo histórico (ver comentário desse arquivo).
 *
 * Este módulo é PURAMENTE DE LEITURA: nenhuma função aqui chama
 * registrarLancamentoContabil nem grava em nenhuma tabela. É consolidado por PORTFÓLIO
 * inteiro (não por imóvel individual) — indicador por imóvel é indicadoresHistorico.ts/
 * avaliacaoMercado.ts, construídos em paralelo por outra tarefa.
 *
 * Cada indicador devolve, além do valor, `formula` e `fonte_dados` (de onde veio cada
 * número) — e nunca fabrica um valor com dado insuficiente: nesse caso o campo numérico
 * final vem `null` e `motivo_nulo` explica por quê (mesmo padrão de
 * calcularComprometimentoRenda/calcularAlavancagemPorImovel em balancoPatrimonial.ts:
 * nunca 0/NaN escondendo ausência de dado).
 */

import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import { gerarBalanco, gerarDRE } from "../erp/relatorios-integrados";
import { gerarRelatorioAging } from "../contasAPagar/contasAPagar";
import { apurarInadimplenciaContratoPorCompetencia } from "../erp/aluguel-competencias";
import { gerarCronograma, type Financiamento } from "../financiamento/amortizacao";
import { saldoDevedorFinanciamento } from "./balancoPatrimonial";

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function ultimoDiaDoMes(ano: number, mes: number): string {
  const dia = new Date(ano, mes, 0).getDate();
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Mesma fórmula de somarMeses em financiamento/amortizacao.ts e patrimonio/
 * balancoPatrimonial.ts (não exportada de lá — cópia local em vez de acrescentar
 * superfície pública a um módulo por uma dependência de um arquivo novo, mesmo critério
 * já usado em aluguel-competencias.ts para calcularDiasAtraso). */
function somarMeses(dataIso: string, meses: number): string {
  const data = new Date(dataIso + "T00:00:00");
  data.setMonth(data.getMonth() + meses);
  return data.toISOString().slice(0, 10);
}

/** Contas 1.1.01 (Caixa) / 1.1.02 (Conta bancária) / 1.1.03 (Aplicações financeiras) —
 * ver PLANO_DE_CONTAS_ERP (planoDeContasErp.ts). Deliberadamente NÃO as mesmas do grupo
 * "ativo circulante" de gerarBalanco() (que soma toda a faixa 1.1%, LIKE '1.1%'): aquela
 * faixa também inclui 1.1.04-1.1.06 (contas a receber de juros/multa e a provisão sobre
 * elas) e 1.1.05/1.1.09 (contas correntes pessoais / transferências em trânsito) — nada
 * disso é caixa disponível para pagar uma obrigação de curto prazo. Liquidez corrente
 * precisa do ativo realmente líquido, por isso a soma aqui é restrita a estas 3 contas.
 */
const CONTAS_CAIXA_FINANCEIRO = ["1.1.01", "1.1.02", "1.1.03"];

/** Saldo acumulado (débito - crédito) das contas informadas, até e incluindo o período
 * pedido — mesma lógica de acumulação de gerarBalanco() (um Balanço é uma fotografia
 * acumulada, não o movimento do mês), só que restrita a uma lista específica de códigos
 * em vez do agrupamento amplo por LIKE que gerarBalanco usa. Não reescreve a agregação
 * de ativo/passivo do Balanço — é a mesma condição de acumulação, para um subconjunto de
 * contas que gerarBalanco() não expõe separado. */
function saldoAcumuladoContas(
  db: Database,
  entidade_id: number,
  periodo_id: number,
  codigos: string[],
): number {
  const placeholders = codigos.map(() => "?").join(",");
  const [linha] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(COALESCE(le.valor_debito, 0) - COALESCE(le.valor_credito, 0)), 0) as total
     FROM ledger_entries le
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE le.entidade_id = ?
       AND le.periodo_id IN (
         SELECT pc2.id FROM periodos_contabeis pc2
         INNER JOIN periodos_contabeis pc_alvo ON pc_alvo.id = ?
         WHERE pc2.entidade_id = pc_alvo.entidade_id
           AND (pc2.ano < pc_alvo.ano OR (pc2.ano = pc_alvo.ano AND pc2.mes <= pc_alvo.mes))
       )
       AND cp.codigo IN (${placeholders})`,
    [entidade_id, periodo_id, ...codigos],
  );
  return linha?.total ?? 0;
}

// ===========================================================================
// 1) LIQUIDEZ CORRENTE
// ===========================================================================

export interface LiquidezCorrenteGestao {
  periodo_id: number;
  /** Data usada como referência para "contas a pagar em aberto" e para a janela de 12
   * meses de financiamento — o último dia do mês do período contábil pedido. */
  data_referencia: string;
  ativo_circulante_financeiro: number;
  contas_a_pagar_em_aberto: number;
  parcela_financiamento_proximos_12_meses: number;
  passivo_circulante_consolidado: number;
  indice: number | null;
  motivo_nulo: string | null;
  formula: string;
  fonte_dados: string;
}

/** Soma as parcelas de financiamento (SAC/Price via gerarCronograma, ou o valor manual
 * de um financiamento 'OUTRO') com vencimento nos 12 meses seguintes a `dataReferencia`,
 * só para financiamentos de imóveis do PORTFÓLIO (uso_pessoal = 0 — mesma convenção de
 * dashboard-portfolio.ts). Reaproveita gerarCronograma()/saldoDevedorFinanciamento()
 * (financiamento/amortizacao.ts, patrimonio/balancoPatrimonial.ts) — a mesma projeção de
 * parcela que calcularLiquidezCorrente() já usa lá, só que escopada por portfólio em vez
 * de por regime_patrimonial='proprio' (aquela é a liquidez PESSOAL do CPF; esta é a
 * liquidez do NEGÓCIO de locação, registrada no razão desta entidade). */
function somaParcelasFinanciamentoProximos12Meses(db: Database, dataReferencia: string): number {
  const dataLimite = somarMeses(dataReferencia, 12);
  const financiamentos = consultar<Financiamento>(
    db,
    `SELECT f.* FROM financiamentos f
     INNER JOIN imoveis i ON i.id = f.imovel_id
     WHERE i.uso_pessoal = 0`,
  );

  let total = 0;
  for (const f of financiamentos) {
    if (f.sistema === "OUTRO") {
      // Sem cronograma teórico (ver gerarCronograma) — mesma aproximação por saldo ÷
      // parcela que calcularLiquidezCorrente() usa em balancoPatrimonial.ts, só quando
      // os dois campos manuais foram informados; sem eles, não contribui (nunca se
      // fabrica esse valor).
      if (f.parcela_mensal_manual !== null && f.parcela_mensal_manual > 0) {
        const saldo = saldoDevedorFinanciamento(f, dataReferencia);
        if (saldo !== null) {
          const parcelasRestantes = Math.ceil(saldo / f.parcela_mensal_manual);
          total += f.parcela_mensal_manual * Math.min(12, Math.max(0, parcelasRestantes));
        }
      }
      continue;
    }
    const cronograma = gerarCronograma(f);
    total += cronograma
      .filter((p) => p.data >= dataReferencia && p.data < dataLimite)
      .reduce((acc, p) => acc + p.parcela, 0);
  }
  return total;
}

/** Liquidez corrente = (caixa + conta bancária + aplicações financeiras) / (contas a
 * pagar em aberto + parcela de financiamento vencendo nos próximos 12 meses). Mostra se
 * o negócio de locação (esta entidade, este razão) tem caixa disponível para cobrir seus
 * compromissos de curto prazo — não confundir com calcularLiquidezCorrente()
 * (balancoPatrimonial.ts), que é a liquidez PESSOAL do CPF a partir de outras tabelas
 * (financiamentos por regime_patrimonial='proprio', dívidas de consumo, cauções, saldo
 * de TODAS as transações já importadas). Aqui os dois lados vêm do razão oficial desta
 * entidade (ledger_entries/contas_a_pagar) mais a projeção de financiamento do
 * portfólio. */
export function calcularLiquidezCorrenteGestao(
  db: Database,
  entidade_id: number,
  periodo_id: number,
): LiquidezCorrenteGestao {
  const formula =
    "(Caixa + Conta bancária + Aplicações financeiras) / (Contas a pagar em aberto + parcelas de financiamento vencendo nos próximos 12 meses)";
  const fonte_dados =
    "Ativo: ledger_entries, contas 1.1.01/1.1.02/1.1.03 (planoDeContasErp.ts), saldo acumulado até o período — mesma lógica de acumulação de gerarBalanco(), restrita às 3 contas realmente líquidas (exclui 1.1.04-1.1.06, contas a receber). Contas a pagar: gerarRelatorioAging() (contasAPagar.ts) sobre contas_a_pagar status='pendente', na data de referência = último dia do período. Financiamento: soma das parcelas com vencimento nos 12 meses seguintes, via gerarCronograma()/saldoDevedorFinanciamento() (financiamento/amortizacao.ts, patrimonio/balancoPatrimonial.ts), para financiamentos de imóveis do portfólio (imoveis.uso_pessoal = 0); financiamento 'OUTRO' usa parcela_mensal_manual quando informada, senão não contribui.";

  const [periodo] = consultar<{ ano: number; mes: number }>(
    db,
    "SELECT ano, mes FROM periodos_contabeis WHERE id = ?",
    [periodo_id],
  );
  if (!periodo) {
    return {
      periodo_id,
      data_referencia: hoje(),
      ativo_circulante_financeiro: 0,
      contas_a_pagar_em_aberto: 0,
      parcela_financiamento_proximos_12_meses: 0,
      passivo_circulante_consolidado: 0,
      indice: null,
      motivo_nulo: `Período contábil ${periodo_id} não encontrado.`,
      formula,
      fonte_dados,
    };
  }

  const dataReferencia = ultimoDiaDoMes(periodo.ano, periodo.mes);
  const ativoCirculanteFinanceiro = saldoAcumuladoContas(
    db,
    entidade_id,
    periodo_id,
    CONTAS_CAIXA_FINANCEIRO,
  );
  const contasAPagarEmAberto = gerarRelatorioAging(db, entidade_id, dataReferencia).total_geral;
  const parcelaFinanciamento = somaParcelasFinanciamentoProximos12Meses(db, dataReferencia);
  const passivoCirculante = contasAPagarEmAberto + parcelaFinanciamento;

  return {
    periodo_id,
    data_referencia: dataReferencia,
    ativo_circulante_financeiro: ativoCirculanteFinanceiro,
    contas_a_pagar_em_aberto: contasAPagarEmAberto,
    parcela_financiamento_proximos_12_meses: parcelaFinanciamento,
    passivo_circulante_consolidado: passivoCirculante,
    indice: passivoCirculante > 0 ? ativoCirculanteFinanceiro / passivoCirculante : null,
    motivo_nulo:
      passivoCirculante > 0
        ? null
        : "Sem contas a pagar em aberto nem parcelas de financiamento nos próximos 12 meses — passivo circulante é zero, índice fica indefinido (não é 'infinito').",
    formula,
    fonte_dados,
  };
}

// ===========================================================================
// 2) ÍNDICE DE ENDIVIDAMENTO
// ===========================================================================

export interface IndiceEndividamentoGestao {
  periodo_id: number;
  ativo_total: number;
  passivo_total: number;
  indice: number | null;
  motivo_nulo: string | null;
  formula: string;
  fonte_dados: string;
}

/** Índice de endividamento = passivo total / ativo total, ambos do Balanço oficial —
 * reaproveita gerarBalanco() por inteiro, sem reagregar nada do razão aqui. */
export function calcularIndiceEndividamentoGestao(
  db: Database,
  entidade_id: number,
  periodo_id: number,
): IndiceEndividamentoGestao {
  const balanco = gerarBalanco(db, entidade_id, periodo_id);
  const ativoTotal = balanco.ativo.total_ativo;
  const passivoTotal = balanco.passivo.total_passivo;

  return {
    periodo_id,
    ativo_total: ativoTotal,
    passivo_total: passivoTotal,
    indice: ativoTotal > 0 ? passivoTotal / ativoTotal : null,
    motivo_nulo:
      ativoTotal > 0
        ? null
        : "Ativo total do Balanço é zero neste período — índice de endividamento fica indefinido.",
    formula: "Passivo total / Ativo total",
    fonte_dados:
      "gerarBalanco() (erp/relatorios-integrados.ts) — passivo.total_passivo e ativo.total_ativo, saldo acumulado do razão contábil oficial (ledger_entries) até este período.",
  };
}

// ===========================================================================
// 3) MARGEM LÍQUIDA CONSOLIDADA
// ===========================================================================

export interface MargemLiquidaPeriodo {
  periodo_id: number;
  ano: number;
  mes: number;
  receita_bruta: number;
  resultado_liquido: number;
  margem_percentual: number | null;
  motivo_nulo: string | null;
}

export interface MargemLiquidaConsolidada {
  periodos: MargemLiquidaPeriodo[];
  formula: string;
  fonte_dados: string;
}

/** Margem líquida consolidada = resultado líquido do período / receita bruta do
 * período, para cada período contábil disponível da entidade — reaproveita gerarDRE()
 * por período, sem reagregar a DRE aqui. Devolve uma linha por período (aberto ou
 * fechado) em vez de um único número: "o(s) período(s) contábil(is) disponível(is)" no
 * pedido é plural de propósito — o usuário compara a evolução mês a mês, não só o mês
 * corrente. */
export function calcularMargemLiquidaConsolidada(
  db: Database,
  entidade_id: number,
): MargemLiquidaConsolidada {
  const periodos = consultar<{ id: number; ano: number; mes: number }>(
    db,
    "SELECT id, ano, mes FROM periodos_contabeis WHERE entidade_id = ? ORDER BY ano, mes",
    [entidade_id],
  );

  const linhas: MargemLiquidaPeriodo[] = periodos.map((p) => {
    const dre = gerarDRE(db, entidade_id, p.id);
    const receita = dre.receitas.total_receitas;
    return {
      periodo_id: p.id,
      ano: p.ano,
      mes: p.mes,
      receita_bruta: receita,
      resultado_liquido: dre.resultado_final,
      margem_percentual: receita > 0 ? (dre.resultado_final / receita) * 100 : null,
      motivo_nulo:
        receita > 0 ? null : "Receita bruta do período é zero — margem líquida fica indefinida.",
    };
  });

  return {
    periodos: linhas,
    formula: "Resultado líquido do período (DRE.resultado_final) / Receita bruta do período (DRE.receitas.total_receitas) × 100",
    fonte_dados:
      "gerarDRE() (erp/relatorios-integrados.ts), um cálculo por período contábil (periodos_contabeis) já registrado para esta entidade.",
  };
}

// ===========================================================================
// 4) GIRO DE CAIXA / CONSUMO MÉDIO MENSAL
// ===========================================================================

export interface MesConsumoCaixa {
  periodo_id: number;
  ano: number;
  mes: number;
  saida_caixa: number;
}

export interface ConsumoMedioMensalCaixa {
  meses_considerados: MesConsumoCaixa[];
  janela_meses_alvo: number;
  media_mensal: number | null;
  motivo_nulo: string | null;
  formula: string;
  fonte_dados: string;
}

/** Janela padrão de 6 meses: uma média móvel semestral captura variação sazonal (um mês
 * de IPTU/seguro anual concentrado não domina sozinho a média, como aconteceria com uma
 * janela de 1-3 meses) sem diluir demais uma mudança real e recente no padrão de gasto
 * (o que uma janela de 12 meses faria). É a mesma janela usada como referência de
 * "burn rate" mensal em análise financeira de caixa; documentada aqui por ser uma
 * escolha, não um valor imposto pelo domínio — outra janela pode ser passada em
 * `janelaMeses`. */
const JANELA_PADRAO_MESES_CONSUMO = 6;

/** Giro de caixa / consumo médio mensal = média aritmética das saídas de caixa (créditos
 * nas contas 1.1.01/1.1.02/1.1.03) dos últimos `janelaMeses` períodos contábeis
 * disponíveis da entidade (do mais recente para trás). Usa menos meses que a janela-alvo
 * quando a entidade não tem histórico suficiente — nunca preenche com zero os meses que
 * faltam (isso subestimaria o consumo real). */
export function calcularConsumoMedioMensalCaixa(
  db: Database,
  entidade_id: number,
  janelaMeses: number = JANELA_PADRAO_MESES_CONSUMO,
): ConsumoMedioMensalCaixa {
  const formula = `Média aritmética das saídas de caixa (SUM(valor_credito) nas contas 1.1.01/1.1.02/1.1.03) dos últimos ${janelaMeses} período(s) contábil(is) disponível(is) da entidade, do mais recente para trás`;
  const fonte_dados =
    "ledger_entries, SUM(valor_credito) por período contábil (periodos_contabeis) nas contas 1.1.01 (Caixa)/1.1.02 (Conta bancária)/1.1.03 (Aplicações financeiras) — as mesmas contas que gerarFluxoCaixa() (erp/relatorios-integrados.ts) soma para 'saídas'.";

  const periodos = consultar<{ id: number; ano: number; mes: number }>(
    db,
    "SELECT id, ano, mes FROM periodos_contabeis WHERE entidade_id = ? ORDER BY ano DESC, mes DESC LIMIT ?",
    [entidade_id, janelaMeses],
  );

  if (periodos.length === 0) {
    return {
      meses_considerados: [],
      janela_meses_alvo: janelaMeses,
      media_mensal: null,
      motivo_nulo: "Nenhum período contábil cadastrado para esta entidade.",
      formula,
      fonte_dados,
    };
  }

  const meses: MesConsumoCaixa[] = periodos.map((p) => {
    const [linha] = consultar<{ total: number }>(
      db,
      `SELECT COALESCE(SUM(le.valor_credito), 0) as total
       FROM ledger_entries le
       INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
       WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.codigo IN ('1.1.01', '1.1.02', '1.1.03')`,
      [entidade_id, p.id],
    );
    return { periodo_id: p.id, ano: p.ano, mes: p.mes, saida_caixa: linha?.total ?? 0 };
  });

  const media = meses.reduce((acc, m) => acc + m.saida_caixa, 0) / meses.length;

  return {
    meses_considerados: meses,
    janela_meses_alvo: janelaMeses,
    media_mensal: media,
    motivo_nulo: null,
    formula:
      meses.length < janelaMeses
        ? `${formula} (só ${meses.length} período(s) disponível(is) — menos que a janela-alvo).`
        : formula,
    fonte_dados,
  };
}

// ===========================================================================
// 5) TAXA DE INADIMPLÊNCIA CONSOLIDADA
// ===========================================================================

export interface InadimplenciaConsolidada {
  data_referencia: string;
  valor_em_atraso: number;
  valor_total_esperado: number;
  taxa_percentual: number | null;
  contratos_considerados: number;
  motivo_nulo: string | null;
  formula: string;
  fonte_dados: string;
}

/** Taxa de inadimplência consolidada = soma do valor em atraso (competências pendentes
 * já vencidas, por contrato, via apurarInadimplenciaContratoPorCompetencia) / soma do
 * valor total esperado até a data de referência (todas as competências com vencimento
 * até lá, pagas ou não) × 100 — dos contratos RESIDENCIAIS (dia_vencimento preenchido;
 * airbnb/temporada não gera competência mensal, ver gerarCompetenciasPendentes) de
 * imóveis do portfólio (uso_pessoal = 0).
 *
 * Numerador e denominador usam a MESMA data de corte (`dataReferencia`) e o mesmo
 * conjunto de contratos de propósito: o numerador (valor ainda pendente e vencido) é
 * sempre um subconjunto do denominador (tudo que já venceu, pago ou não), o que mantém a
 * taxa entre 0-100% — diferente de comparar contra só o esperado numa janela recente
 * (uma dívida de meses atrás entraria no numerador sem contrapartida no denominador,
 * inflando artificialmente a taxa acima de 100%). */
export function calcularInadimplenciaConsolidada(
  db: Database,
  dataReferencia?: string,
): InadimplenciaConsolidada {
  const dataRef = dataReferencia ?? hoje();
  const formula =
    "Soma do valor em atraso (competências pendentes já vencidas, por contrato, via apurarInadimplenciaContratoPorCompetencia) / Soma do valor total esperado até a data de referência (todas as competências com vencimento até lá, pagas ou não) × 100";
  const fonte_dados =
    "aluguel_competencias, contratos residenciais (contratos_locacao.dia_vencimento preenchido) dos imóveis do portfólio (imoveis.uso_pessoal = 0). Numerador: apurarInadimplenciaContratoPorCompetencia() (erp/aluguel-competencias.ts) por contrato, somado. Denominador: SUM(valor_devido) de aluguel_competencias com data_vencimento <= data de referência, excluindo competências canceladas.";

  const contratos = consultar<{ id: number }>(
    db,
    `SELECT c.id FROM contratos_locacao c
     INNER JOIN imoveis i ON i.id = c.imovel_id
     WHERE i.uso_pessoal = 0 AND c.dia_vencimento IS NOT NULL`,
  );

  if (contratos.length === 0) {
    return {
      data_referencia: dataRef,
      valor_em_atraso: 0,
      valor_total_esperado: 0,
      taxa_percentual: null,
      contratos_considerados: 0,
      motivo_nulo:
        "Nenhum contrato residencial (com dia_vencimento) em imóvel do portfólio — o modelo de competência mensal não se aplica a contratos airbnb/temporada.",
      formula,
      fonte_dados,
    };
  }

  let valorEmAtraso = 0;
  for (const contrato of contratos) {
    const apurado = apurarInadimplenciaContratoPorCompetencia(db, contrato.id, dataRef);
    if (apurado) valorEmAtraso += apurado.valor_aluguel_vencido;
  }

  const idsContratos = contratos.map((c) => c.id);
  const placeholders = idsContratos.map(() => "?").join(",");
  const [esperado] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(valor_devido), 0) as total FROM aluguel_competencias
     WHERE contrato_id IN (${placeholders}) AND data_vencimento <= ? AND status != 'cancelado'`,
    [...idsContratos, dataRef],
  );
  const valorTotalEsperado = esperado?.total ?? 0;

  return {
    data_referencia: dataRef,
    valor_em_atraso: valorEmAtraso,
    valor_total_esperado: valorTotalEsperado,
    taxa_percentual: valorTotalEsperado > 0 ? (valorEmAtraso / valorTotalEsperado) * 100 : null,
    contratos_considerados: contratos.length,
    motivo_nulo:
      valorTotalEsperado > 0
        ? null
        : "Nenhuma competência de aluguel com vencimento até a data de referência — rode gerarCompetenciasPendentes() para os contratos antes de apurar este indicador.",
    formula,
    fonte_dados,
  };
}

// ===========================================================================
// 6) TAXA DE OCUPAÇÃO DO PORTFÓLIO
// ===========================================================================

export interface OcupacaoPortfolio {
  data_referencia: string;
  imoveis_aptos: number;
  imoveis_ocupados: number;
  imoveis_em_obra_excluidos: number;
  imoveis_uso_pessoal_excluidos: number;
  taxa_percentual: number | null;
  motivo_nulo: string | null;
  formula: string;
  fonte_dados: string;
}

/** Taxa de ocupação do portfólio = nº de imóveis com contrato de locação vigente na data
 * de referência / nº total de imóveis aptos à locação × 100. "Apto à locação" exclui
 * uso_pessoal=1 (mesma convenção de dashboard-portfolio.ts) e qualquer imóvel com uma
 * `obras` ativa na data de referência (data_inicio <= referência <= data_fim, ou sem
 * data_fim ainda) — um imóvel em obra não pode ser oferecido para locação, então não
 * deve contar contra a taxa como "vago". */
export function calcularTaxaOcupacaoPortfolio(
  db: Database,
  dataReferencia?: string,
): OcupacaoPortfolio {
  const dataRef = dataReferencia ?? hoje();
  const formula =
    "Nº de imóveis do portfólio com contrato de locação vigente na data de referência / Nº total de imóveis aptos à locação (uso_pessoal = 0 e sem obra ativa na data) × 100";
  const fonte_dados =
    "imoveis (uso_pessoal exclui uso pessoal), obras (data_inicio/data_fim ativa na data de referência exclui imóvel em obra) e contratos_locacao (data_inicio <= referência <= data_fim ou data_fim nula = vigente).";

  const todosImoveis = consultar<{ id: number; uso_pessoal: number }>(
    db,
    "SELECT id, uso_pessoal FROM imoveis",
  );
  const usoPessoal = todosImoveis.filter((i) => i.uso_pessoal === 1).length;
  const candidatos = todosImoveis.filter((i) => i.uso_pessoal === 0);

  const idsEmObra = new Set(
    consultar<{ imovel_id: number }>(
      db,
      "SELECT DISTINCT imovel_id FROM obras WHERE data_inicio <= ? AND (data_fim IS NULL OR data_fim >= ?)",
      [dataRef, dataRef],
    ).map((o) => o.imovel_id),
  );

  const aptos = candidatos.filter((i) => !idsEmObra.has(i.id));
  const emObraExcluidos = candidatos.length - aptos.length;

  if (aptos.length === 0) {
    return {
      data_referencia: dataRef,
      imoveis_aptos: 0,
      imoveis_ocupados: 0,
      imoveis_em_obra_excluidos: emObraExcluidos,
      imoveis_uso_pessoal_excluidos: usoPessoal,
      taxa_percentual: null,
      motivo_nulo:
        "Nenhum imóvel apto à locação (todos são uso pessoal ou estão com obra ativa na data de referência).",
      formula,
      fonte_dados,
    };
  }

  const idsAptos = aptos.map((i) => i.id);
  const placeholders = idsAptos.map(() => "?").join(",");
  const idsOcupados = new Set(
    consultar<{ imovel_id: number }>(
      db,
      `SELECT DISTINCT imovel_id FROM contratos_locacao
       WHERE imovel_id IN (${placeholders}) AND data_inicio <= ? AND (data_fim IS NULL OR data_fim >= ?)`,
      [...idsAptos, dataRef, dataRef],
    ).map((c) => c.imovel_id),
  );

  return {
    data_referencia: dataRef,
    imoveis_aptos: aptos.length,
    imoveis_ocupados: idsOcupados.size,
    imoveis_em_obra_excluidos: emObraExcluidos,
    imoveis_uso_pessoal_excluidos: usoPessoal,
    taxa_percentual: (idsOcupados.size / aptos.length) * 100,
    motivo_nulo: null,
    formula,
    fonte_dados,
  };
}

// ===========================================================================
// PAINEL CONSOLIDADO
// ===========================================================================

export interface PainelIndicadoresGestao {
  liquidez_corrente: LiquidezCorrenteGestao;
  indice_endividamento: IndiceEndividamentoGestao;
  margem_liquida: MargemLiquidaConsolidada;
  consumo_medio_mensal_caixa: ConsumoMedioMensalCaixa;
  inadimplencia_consolidada: InadimplenciaConsolidada;
  ocupacao_portfolio: OcupacaoPortfolio;
}

/** Monta os 6 indicadores deste módulo de uma vez, para a tela — cada um continua
 * podendo ser chamado isoladamente pelas funções acima. `periodo_id` ancora liquidez
 * corrente/endividamento (fotografia de um período específico); os demais têm sua
 * própria noção de data/janela (ver cada função). */
export function gerarPainelIndicadoresGestao(
  db: Database,
  entidade_id: number,
  periodo_id: number,
  opcoes?: {
    janelaMesesConsumo?: number;
    dataReferenciaInadimplencia?: string;
    dataReferenciaOcupacao?: string;
  },
): PainelIndicadoresGestao {
  return {
    liquidez_corrente: calcularLiquidezCorrenteGestao(db, entidade_id, periodo_id),
    indice_endividamento: calcularIndiceEndividamentoGestao(db, entidade_id, periodo_id),
    margem_liquida: calcularMargemLiquidaConsolidada(db, entidade_id),
    consumo_medio_mensal_caixa: calcularConsumoMedioMensalCaixa(
      db,
      entidade_id,
      opcoes?.janelaMesesConsumo,
    ),
    inadimplencia_consolidada: calcularInadimplenciaConsolidada(
      db,
      opcoes?.dataReferenciaInadimplencia,
    ),
    ocupacao_portfolio: calcularTaxaOcupacaoPortfolio(db, opcoes?.dataReferenciaOcupacao),
  };
}
