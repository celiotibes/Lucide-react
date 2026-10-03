/**
 * Indicadores de investimento imobiliário a CUSTO HISTÓRICO (valor_aquisicao).
 *
 * Camada PARALELA aos relatórios contábeis oficiais (DRE, Balanço — `erp/relatorios-
 * integrados.ts`, `reports/*`) e também paralela a `patrimonio/avaliacaoMercado.ts` (que usa
 * o MESMO tipo de indicador — NOI, Cap Rate, ROI — mas com valor de MERCADO no denominador,
 * responsabilidade de outro módulo). Este arquivo nunca usa `valor_venal_atual` — só
 * `imoveis.valor_aquisicao` (custo histórico de aquisição) — e, como `avaliacaoMercado.ts`,
 * é puramente de LEITURA/gestão gerencial: não grava em `ledger_entries` nem em nenhuma
 * tabela do razão.
 *
 * FONTE DE RECEITA/DESPESA — reaproveitada, não recalculada do zero:
 *   - NOI anual (receita de aluguel − despesas operacionais lançadas em `contas_a_pagar`,
 *     regime de competência): vem de `erp/dashboard-portfolio.ts` via `obterPortfolioCompleto`
 *     (mesma fonte que `avaliacaoMercado.ts` já reaproveita). Usado como numerador de Yield
 *     líquido, Payback, Cash-on-Cash e DSCR — nunca recalculado aqui.
 *   - Receita BRUTA anual (sem descontar despesa) é necessária para Yield bruto e GRM, e
 *     `dashboard-portfolio.ts` não a expõe isolada (só o NOI já líquido; a função que soma
 *     `contratos_locacao` por mês, `obterAluguelVigenteNoMes`, é privada — não exportada).
 *     Alterar `dashboard-portfolio.ts` para exportá-la está fora do escopo desta tarefa (só
 *     este arquivo, seu teste e `PatrimonioView.tsx` são versionados aqui). Por isso
 *     `receitaBrutaAnual()` abaixo REPLICA deliberadamente a mesma fonte e a mesma regra de
 *     vigência (interseção de intervalo do contrato com o mês, idêntica à de
 *     `dashboard-portfolio.ts`) — não é uma definição de receita nova.
 *   - Saldo devedor de financiamento: `financiamento/amortizacao.ts` (cronograma SAC/Price)
 *     via `patrimonio/balancoPatrimonial.ts` (`saldoDevedorFinanciamento`), mesma fonte usada
 *     na aba "Alavancagem por imóvel" desta mesma tela.
 *
 * Convenção de filtro: `uso_pessoal = 0` (fora da atividade de investimento) — mesma regra de
 * `erp/dashboard-portfolio.ts`, `reports/desempenhoPorImovel.ts` e `avaliacaoMercado.ts`.
 *
 * REGRA: imóvel sem financiamento nunca produz LTV/DSCR/Debt Yield "zero" (indicador não faz
 * sentido, não é zero de alavancagem) e imóvel sem `valor_aquisicao` cadastrado nunca produz
 * yield/GRM/payback "zero" ou `NaN` — cada função abaixo retorna `valor: null` com
 * `motivoNulo` explicando o porquê, nunca um número fabricado.
 */

import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import { obterPortfolioCompleto } from "../erp/dashboard-portfolio";
import { obterEntidadeAtiva } from "../erp/entidadeLegal";
import { gerarCronograma, type Financiamento } from "../financiamento/amortizacao";
import { saldoDevedorFinanciamento } from "./balancoPatrimonial";

function round2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

// ============================================================================
// TIPOS
// ============================================================================

/** Cada indicador carrega, além do número, a fórmula usada e a fonte dos dados — a "legenda
 * explicativa" pedida: quem lê a tela sabe exatamente de onde veio o número e como foi
 * calculado, sem precisar confiar cegamente no sistema. `valor: null` é sempre acompanhado de
 * `motivoNulo` (nunca um `null` silencioso). */
export interface IndicadorNumerico {
  valor: number | null;
  formula: string;
  fonteDados: string;
  motivoNulo?: string;
}

export interface IndicadoresHistoricoImovel {
  imovelId: number;
  apelido: string;
  ano: number;
  dataReferencia: string;
  valorAquisicao: number | null;
  temFinanciamento: boolean;
  yieldBruto: IndicadorNumerico;
  yieldLiquido: IndicadorNumerico;
  grm: IndicadorNumerico;
  paybackSimplesAnos: IndicadorNumerico;
  cashOnCashReturn: IndicadorNumerico;
  ltv: IndicadorNumerico;
  dscr: IndicadorNumerico;
  debtYield: IndicadorNumerico;
}

export interface IndicadoresHistoricoPortfolio {
  ano: number;
  dataReferencia: string;
  imoveis: IndicadoresHistoricoImovel[];
}

// ============================================================================
// FONTE DE DADOS: receita bruta anual (ver decisão no cabeçalho do arquivo)
// ============================================================================

function doisDigitos(n: number): string {
  return String(n).padStart(2, "0");
}
function primeiroDiaMes(ano: number, mes: number): string {
  return `${ano}-${doisDigitos(mes)}-01`;
}
function ultimoDiaMes(ano: number, mes: number): string {
  const dia = new Date(ano, mes, 0).getDate();
  return `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
}

/** Soma de `valor_referencia` dos contratos de locação vigentes em cada um dos 12 meses do
 * ano — SEM descontar despesa (diferente de `calcularNOIAnual` de `dashboard-portfolio.ts`).
 * Réplica deliberada da mesma fonte/regra de vigência daquele módulo (ver cabeçalho). */
function receitaBrutaAnual(db: Database, imovel_id: number, ano: number): number {
  let total = 0;
  for (let mes = 1; mes <= 12; mes++) {
    const inicioMes = primeiroDiaMes(ano, mes);
    const fimMes = ultimoDiaMes(ano, mes);
    const contratos = consultar<{ valor_referencia: number; data_inicio: string; data_fim: string | null }>(
      db,
      `SELECT valor_referencia, data_inicio, data_fim FROM contratos_locacao WHERE imovel_id = ?`,
      [imovel_id],
    );
    total += contratos
      .filter((c) => c.data_inicio <= fimMes && (c.data_fim === null || c.data_fim >= inicioMes))
      .reduce((soma, c) => soma + c.valor_referencia, 0);
  }
  return total;
}

// ============================================================================
// FONTE DE DADOS: financiamento (saldo devedor + serviço anual da dívida)
// ============================================================================

function listarFinanciamentosDoImovel(db: Database, imovel_id: number): Financiamento[] {
  return consultar<Financiamento>(db, "SELECT * FROM financiamentos WHERE imovel_id = ?", [imovel_id]);
}

interface AgregadoFinanciamentoImovel {
  temFinanciamento: boolean;
  /** Soma de `saldoDevedorFinanciamento` (amortizacao.ts/balancoPatrimonial.ts) na data de
   * referência. `null` quando incompleto (ver `saldoIncompleto`). */
  saldoDevedorAtual: number | null;
  /** Financiamento 'OUTRO' sem `saldo_devedor_manual` informado — o saldo agregado NÃO pode
   * ser tratado como conhecido (mesma regra de `calcularAlavancagemPorImovel`). */
  saldoIncompleto: boolean;
  /** Soma de juros + amortização (parcela) vencendo dentro do ano-base — cronograma teórico
   * SAC/Price (amortizacao.ts) para financiamento normal, ou
   * `parcela_mensal_manual × 12` para financiamento 'OUTRO'. */
  servicoDividaAnual: number | null;
  /** Financiamento 'OUTRO' sem `parcela_mensal_manual` informado. */
  servicoIncompleto: boolean;
  /** Soma de `valor_contratado` (valor financiado na assinatura, nunca o saldo devedor
   * atual) — usado como base do capital próprio investido no Cash-on-Cash (ver função
   * `calcularCashOnCashReturn`). */
  somaValorContratado: number;
}

function agregarFinanciamentosDoImovel(db: Database, imovel_id: number, ano: number, dataReferencia: string): AgregadoFinanciamentoImovel {
  const financiamentos = listarFinanciamentosDoImovel(db, imovel_id);
  if (financiamentos.length === 0) {
    return {
      temFinanciamento: false,
      saldoDevedorAtual: null,
      saldoIncompleto: false,
      servicoDividaAnual: null,
      servicoIncompleto: false,
      somaValorContratado: 0,
    };
  }

  let saldoDevedorAtual = 0;
  let saldoIncompleto = false;
  let servicoDividaAnual = 0;
  let servicoIncompleto = false;
  let somaValorContratado = 0;

  for (const f of financiamentos) {
    somaValorContratado += f.valor_contratado;

    const saldo = saldoDevedorFinanciamento(f, dataReferencia);
    if (saldo === null) saldoIncompleto = true;
    else saldoDevedorAtual += saldo;

    if (f.sistema === "OUTRO") {
      if (f.parcela_mensal_manual === null) servicoIncompleto = true;
      else servicoDividaAnual += f.parcela_mensal_manual * 12;
    } else {
      const cronograma = gerarCronograma(f);
      servicoDividaAnual += cronograma.filter((p) => p.data.slice(0, 4) === String(ano)).reduce((acc, p) => acc + p.parcela, 0);
    }
  }

  return {
    temFinanciamento: true,
    saldoDevedorAtual: saldoIncompleto ? null : saldoDevedorAtual,
    saldoIncompleto,
    servicoDividaAnual: servicoIncompleto ? null : servicoDividaAnual,
    servicoIncompleto,
    somaValorContratado,
  };
}

// ============================================================================
// INDICADORES — funções puras, testáveis com números conhecidos
// ============================================================================

const FONTE_RECEITA_BRUTA =
  "Receita: contratos_locacao (soma de valor_referencia dos contratos vigentes em cada mês do ano-base — mesma regra de vigência de erp/dashboard-portfolio.ts, réplica documentada porque a função lá é privada); valor de aquisição: imoveis.valor_aquisicao (custo histórico).";
const FONTE_NOI = "NOI anual: erp/dashboard-portfolio.ts (obterPortfolioCompleto → NOI = receita de aluguel de contratos_locacao − despesas operacionais de contas_a_pagar, regime de competência); valor de aquisição: imoveis.valor_aquisicao (custo histórico).";
const FONTE_DIVIDA = "Saldo devedor e serviço da dívida: domain/financiamento/amortizacao.ts (cronograma SAC/Price) e domain/patrimonio/balancoPatrimonial.ts (saldoDevedorFinanciamento); para financiamento 'Outro', financiamentos.saldo_devedor_manual/parcela_mensal_manual (informado pelo usuário).";

/** Yield bruto = receita bruta anual ÷ valor de aquisição × 100. Não desconta despesa
 * operacional — mede o retorno da receita de locação sobre o capital histórico investido,
 * sem levar em conta custo de manutenção/condomínio/IPTU (ver Yield líquido para isso). */
export function calcularYieldBruto(receitaBrutaAnualValor: number, valorAquisicao: number | null): IndicadorNumerico {
  const base: Omit<IndicadorNumerico, "valor" | "motivoNulo"> = {
    formula: "Yield bruto = receita bruta anual (contratos de locação, sem descontar despesa) ÷ valor de aquisição × 100",
    fonteDados: FONTE_RECEITA_BRUTA,
  };
  if (valorAquisicao === null || valorAquisicao <= 0) {
    return { ...base, valor: null, motivoNulo: "Imóvel sem valor_aquisicao cadastrado — yield indefinido." };
  }
  return { ...base, valor: round2((receitaBrutaAnualValor / valorAquisicao) * 100) };
}

/** Yield líquido = NOI anual (já líquido de despesa operacional) ÷ valor de aquisição × 100.
 * É o "Cap Rate a custo histórico" — mesma fórmula do Cap Rate de avaliacaoMercado.ts, mas
 * com valor_aquisicao no denominador em vez de valor de mercado. */
export function calcularYieldLiquido(noiAnual: number, valorAquisicao: number | null): IndicadorNumerico {
  const base: Omit<IndicadorNumerico, "valor" | "motivoNulo"> = {
    formula: "Yield líquido = NOI anual (receita de aluguel − despesas operacionais) ÷ valor de aquisição × 100",
    fonteDados: FONTE_NOI,
  };
  if (valorAquisicao === null || valorAquisicao <= 0) {
    return { ...base, valor: null, motivoNulo: "Imóvel sem valor_aquisicao cadastrado — yield indefinido." };
  }
  return { ...base, valor: round2((noiAnual / valorAquisicao) * 100) };
}

/** GRM (Gross Rent Multiplier) = valor de aquisição ÷ receita bruta anual. Múltiplo clássico
 * de comparação rápida entre imóveis (quantos anos de aluguel bruto "cabem" no preço pago) —
 * inverso do Yield bruto, mas expresso como múltiplo (não percentual), a forma como o
 * mercado imobiliário costuma reportar esse indicador. */
export function calcularGRM(receitaBrutaAnualValor: number, valorAquisicao: number | null): IndicadorNumerico {
  const base: Omit<IndicadorNumerico, "valor" | "motivoNulo"> = {
    formula: "GRM = valor de aquisição ÷ receita bruta anual (contratos de locação, sem descontar despesa)",
    fonteDados: FONTE_RECEITA_BRUTA,
  };
  if (valorAquisicao === null || valorAquisicao <= 0) {
    return { ...base, valor: null, motivoNulo: "Imóvel sem valor_aquisicao cadastrado — GRM indefinido." };
  }
  if (receitaBrutaAnualValor <= 0) {
    return { ...base, valor: null, motivoNulo: "Receita bruta anual é zero — GRM indefinido (divisão por zero)." };
  }
  return { ...base, valor: round2(valorAquisicao / receitaBrutaAnualValor) };
}

/** Payback simples = valor de aquisição ÷ NOI anual (fluxo de caixa líquido ANTES do serviço
 * da dívida) = anos para recuperar o investimento pela própria operação do imóvel, como se
 * tivesse sido comprado à vista (não desconta parcela de financiamento — ver Cash-on-Cash
 * para o payback alavancado). */
export function calcularPaybackSimples(noiAnual: number, valorAquisicao: number | null): IndicadorNumerico {
  const base: Omit<IndicadorNumerico, "valor" | "motivoNulo"> = {
    formula: "Payback simples (anos) = valor de aquisição ÷ NOI anual (fluxo de caixa líquido anual antes do serviço da dívida)",
    fonteDados: FONTE_NOI,
  };
  if (valorAquisicao === null || valorAquisicao <= 0) {
    return { ...base, valor: null, motivoNulo: "Imóvel sem valor_aquisicao cadastrado — payback indefinido." };
  }
  if (noiAnual <= 0) {
    return {
      ...base,
      valor: null,
      motivoNulo: "NOI anual não positivo no ano-base — o investimento não se paga pela própria operação nesse cenário.",
    };
  }
  return { ...base, valor: round2(valorAquisicao / noiAnual) };
}

/** Cash-on-Cash Return = (NOI anual − serviço anual da dívida) ÷ capital próprio investido ×
 * 100 — o retorno de caixa sobre o caixa que de fato saiu do bolso na aquisição.
 *
 * DECISÃO DE FÓRMULA (documentada, ver pedido do usuário): capital próprio investido =
 * valor de aquisição − soma do valor_contratado dos financiamentos vinculados ao imóvel na
 * assinatura. Isso é equivalente a "valor de aquisição − saldo devedor do financiamento na
 * data de aquisição" (saldo devedor = valor_contratado integral antes da 1ª amortização) —
 * a primeira opção que o pedido descreveu. Deliberadamente NÃO se usa "entrada + amortizações
 * pagas até hoje": esse segundo caminho mistura o retorno de caixa corrente com a equity
 * construída por amortização/tempo, o que infla artificialmente o CoC de um financiamento
 * antigo (quanto mais tempo passou, "menor" o capital que aparenta estar em risco) — não é a
 * definição padrão de Cash-on-Cash Return (Investopedia/mercado: retorno sobre o caixa
 * efetivamente investido na aquisição, que não muda com o tempo). Sem financiamento, capital
 * próprio investido = valor de aquisição integral (compra à vista) — nesse caso o CoC
 * coincide com o Yield líquido, o que é esperado (sem alavancagem, não há diferença). */
export function calcularCashOnCashReturn(
  noiAnual: number,
  servicoDividaAnual: number | null,
  valorAquisicao: number | null,
  somaValorContratado: number,
): IndicadorNumerico {
  const base: Omit<IndicadorNumerico, "valor" | "motivoNulo"> = {
    formula:
      "Cash-on-Cash Return = (NOI anual − serviço anual da dívida [juros + amortização do ano]) ÷ capital próprio investido × 100, onde capital próprio investido = valor de aquisição − valor contratado dos financiamentos na assinatura (nunca o saldo devedor atual)",
    fonteDados: `${FONTE_NOI} ${FONTE_DIVIDA}`,
  };
  if (valorAquisicao === null || valorAquisicao <= 0) {
    return { ...base, valor: null, motivoNulo: "Imóvel sem valor_aquisicao cadastrado — Cash-on-Cash indefinido." };
  }
  const capitalProprioInvestido = valorAquisicao - somaValorContratado;
  if (capitalProprioInvestido <= 0) {
    return {
      ...base,
      valor: null,
      motivoNulo: "Capital próprio investido não positivo (financiamento contratado ≥ valor de aquisição) — Cash-on-Cash indefinido.",
    };
  }
  if (servicoDividaAnual === null) {
    return {
      ...base,
      valor: null,
      motivoNulo: "Financiamento 'Outro' sem parcela_mensal_manual informada — serviço da dívida desconhecido.",
    };
  }
  return { ...base, valor: round2(((noiAnual - servicoDividaAnual) / capitalProprioInvestido) * 100) };
}

/** LTV (Loan-to-Value) = saldo devedor atual ÷ valor de aquisição × 100. Sem financiamento,
 * o indicador não faz sentido (não é 0% de alavancagem — é "não se aplica"). */
export function calcularLTV(saldoDevedorAtual: number | null, valorAquisicao: number | null, temFinanciamento: boolean): IndicadorNumerico {
  const base: Omit<IndicadorNumerico, "valor" | "motivoNulo"> = {
    formula: "LTV = saldo devedor atual dos financiamentos do imóvel ÷ valor de aquisição × 100",
    fonteDados: FONTE_DIVIDA,
  };
  if (!temFinanciamento) {
    return { ...base, valor: null, motivoNulo: "Imóvel sem financiamento cadastrado — LTV não se aplica." };
  }
  if (valorAquisicao === null || valorAquisicao <= 0) {
    return { ...base, valor: null, motivoNulo: "Imóvel sem valor_aquisicao cadastrado — LTV indefinido." };
  }
  if (saldoDevedorAtual === null) {
    return {
      ...base,
      valor: null,
      motivoNulo: "Financiamento 'Outro' sem saldo_devedor_manual informado — saldo devedor desconhecido.",
    };
  }
  return { ...base, valor: round2((saldoDevedorAtual / valorAquisicao) * 100) };
}

/** DSCR (Debt Service Coverage Ratio) = NOI anual ÷ serviço anual da dívida (juros +
 * amortização do ano-base). Abaixo de 1,0 o NOI não cobre nem o serviço da dívida. */
export function calcularDSCR(noiAnual: number, servicoDividaAnual: number | null, temFinanciamento: boolean): IndicadorNumerico {
  const base: Omit<IndicadorNumerico, "valor" | "motivoNulo"> = {
    formula: "DSCR = NOI anual ÷ serviço anual da dívida (juros + amortização do ano-base)",
    fonteDados: `${FONTE_NOI} ${FONTE_DIVIDA}`,
  };
  if (!temFinanciamento) {
    return { ...base, valor: null, motivoNulo: "Imóvel sem financiamento cadastrado — DSCR não se aplica." };
  }
  if (servicoDividaAnual === null) {
    return {
      ...base,
      valor: null,
      motivoNulo: "Financiamento 'Outro' sem parcela_mensal_manual informada — serviço da dívida desconhecido.",
    };
  }
  if (servicoDividaAnual === 0) {
    return {
      ...base,
      valor: null,
      motivoNulo: "Serviço da dívida no ano-base é zero (financiamento ainda não iniciado ou já quitado nesse ano) — DSCR indefinido.",
    };
  }
  return { ...base, valor: round2(noiAnual / servicoDividaAnual) };
}

/** Debt Yield = NOI anual ÷ saldo devedor atual × 100 — métrica usada por credores como
 * alternativa ao DSCR/LTV, menos sensível a premissas de taxa de juros/prazo de amortização
 * (mede a cobertura do NOI sobre o principal em aberto, não sobre a parcela). */
export function calcularDebtYield(noiAnual: number, saldoDevedorAtual: number | null, temFinanciamento: boolean): IndicadorNumerico {
  const base: Omit<IndicadorNumerico, "valor" | "motivoNulo"> = {
    formula: "Debt Yield = NOI anual ÷ saldo devedor atual do financiamento × 100",
    fonteDados: `${FONTE_NOI} ${FONTE_DIVIDA}`,
  };
  if (!temFinanciamento) {
    return { ...base, valor: null, motivoNulo: "Imóvel sem financiamento cadastrado — Debt Yield não se aplica." };
  }
  if (saldoDevedorAtual === null) {
    return {
      ...base,
      valor: null,
      motivoNulo: "Financiamento 'Outro' sem saldo_devedor_manual informado — saldo devedor desconhecido.",
    };
  }
  if (saldoDevedorAtual <= 0) {
    return { ...base, valor: null, motivoNulo: "Saldo devedor atual é zero (financiamento quitado) — Debt Yield indefinido." };
  }
  return { ...base, valor: round2((noiAnual / saldoDevedorAtual) * 100) };
}

// ============================================================================
// AGREGAÇÃO POR IMÓVEL E PORTFÓLIO
// ============================================================================

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Indicadores de investimento a custo histórico de todos os imóveis de investimento
 * (`uso_pessoal = 0`). `ano` é o ano-base do NOI/receita/serviço da dívida anualizados
 * (padrão: ano corrente); `dataReferencia` é a data de apuração do saldo devedor/LTV (padrão:
 * hoje — pode ser anterior ao fim de `ano`, mesma convenção de `balancoPatrimonial.ts`).
 *
 * A entidade legal (para escopar despesas de `contas_a_pagar`, exigido por
 * `obterPortfolioCompleto`) vem de `obterEntidadeAtiva` — sistema monoentidade, mesma
 * convenção de `avaliacaoMercado.ts`. Sem entidade cadastrada, usa um sentinela que não bate
 * com nenhum `entidade_id` real; o NOI sai só com a receita, sem desconto de despesas (mesmo
 * comportamento degradado herdado de `dashboard-portfolio.ts`).
 */
export function calcularIndicadoresHistoricoPortfolio(
  db: Database,
  ano: number = new Date().getFullYear(),
  dataReferencia: string = hojeIso(),
): IndicadoresHistoricoPortfolio {
  const entidade = obterEntidadeAtiva(db);
  const entidadeId = entidade?.id ?? -1;
  const portfolio = obterPortfolioCompleto(db, entidadeId, ano, 1);
  const noiAnualPorId = new Map(portfolio.imoveis.map((m) => [m.imovel_id, m.noi_anual]));

  const imoveis = consultar<{ id: number; apelido: string; valor_aquisicao: number | null }>(
    db,
    "SELECT id, apelido, valor_aquisicao FROM imoveis WHERE uso_pessoal = 0 ORDER BY apelido",
  );

  const linhas = imoveis.map((imovel): IndicadoresHistoricoImovel => {
    const noiAnual = noiAnualPorId.get(imovel.id) ?? 0;
    const receitaBruta = receitaBrutaAnual(db, imovel.id, ano);
    const financiamento = agregarFinanciamentosDoImovel(db, imovel.id, ano, dataReferencia);
    const valorAquisicao = imovel.valor_aquisicao;

    return {
      imovelId: imovel.id,
      apelido: imovel.apelido,
      ano,
      dataReferencia,
      valorAquisicao,
      temFinanciamento: financiamento.temFinanciamento,
      yieldBruto: calcularYieldBruto(receitaBruta, valorAquisicao),
      yieldLiquido: calcularYieldLiquido(noiAnual, valorAquisicao),
      grm: calcularGRM(receitaBruta, valorAquisicao),
      paybackSimplesAnos: calcularPaybackSimples(noiAnual, valorAquisicao),
      cashOnCashReturn: calcularCashOnCashReturn(noiAnual, financiamento.servicoDividaAnual, valorAquisicao, financiamento.somaValorContratado),
      ltv: calcularLTV(financiamento.saldoDevedorAtual, valorAquisicao, financiamento.temFinanciamento),
      dscr: calcularDSCR(noiAnual, financiamento.servicoDividaAnual, financiamento.temFinanciamento),
      debtYield: calcularDebtYield(noiAnual, financiamento.saldoDevedorAtual, financiamento.temFinanciamento),
    };
  });

  return { ano, dataReferencia, imoveis: linhas };
}
