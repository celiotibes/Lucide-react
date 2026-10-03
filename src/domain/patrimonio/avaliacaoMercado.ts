/**
 * Avaliação Patrimonial de Mercado — camada GERENCIAL, nunca oficial.
 *
 * Decisão do usuário (2026-09-29, ver também o cabeçalho de `imovel_avaliacoes_mercado`
 * em contabilidade-reconstituicao/schema.sql): os relatórios oficiais (DRE, Balanço, Fluxo
 * de Caixa — `domain/erp/relatorios-integrados.ts`, `domain/reports/*`) usam e SEMPRE VÃO
 * CONTINUAR usando custo histórico (`imoveis.valor_aquisicao`), para fins fiscais/periciais.
 * Este módulo é uma camada PARALELA e opcional, para decisão de negócio (viabilidade, ROI,
 * indicadores tipo BI), que nunca influencia aquele lado.
 *
 * REGRA DE OURO, sem exceção: nada neste arquivo chama `registrarLancamentoContabil` nem
 * escreve em `ledger_entries` (ou em qualquer tabela do razão). É uma camada de
 * LEITURA/gestão gerencial pura — grava apenas em `imovel_avaliacoes_mercado` (histórico de
 * avaliações) e no cache `imoveis.valor_venal_atual`/`data_avaliacao_venal`, ambas fora do
 * razão contábil. Se algum dia alguém for "contabilizar reavaliação de imóvel a valor
 * justo" (o que a legislação/perícia brasileira normalmente NÃO aceita para pessoa física
 * fora de eventos específicos), isso é uma feature contábil oficial nova, com suas próprias
 * regras de partida dobrada — não uma extensão deste módulo.
 *
 * Fonte de dados de receita/despesa por imóvel: reaproveitada de
 * `domain/erp/dashboard-portfolio.ts` (via `obterPortfolioCompleto`, que já calcula o NOI
 * anual = soma dos 12 meses de (aluguel vigente nos contratos - despesas operacionais
 * lançadas em `contas_a_pagar`), filtrando `uso_pessoal = 0`). Este módulo NÃO reimplementa
 * esse cálculo — só troca o DENOMINADOR do Cap Rate/ROI de custo histórico (valor_aquisicao)
 * para valor de mercado (a avaliação mais recente).
 *
 * INDICADORES AVANÇADOS (payback, yield, CAGR, TIR aproximada, LTV e DSCR a mercado) — ver
 * seção dedicada mais abaixo, cada um com `formula`/`fonteDados` em TEXTO no próprio retorno
 * (não só em comentário JSDoc), porque a tela (`AvaliacaoMercadoView.tsx`) precisa mostrar
 * essa explicação em runtime (tooltip/legenda) para o usuário.
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { obterPortfolioCompleto } from "../erp/dashboard-portfolio";
import { obterEntidadeAtiva } from "../erp/entidadeLegal";
import { saldoDevedorFinanciamento, parcelaMensalFinanciamento } from "./balancoPatrimonial";
import type { Financiamento } from "../financiamento/amortizacao";

// ============================================================================
// TIPOS
// ============================================================================

export interface NovaAvaliacaoMercado {
  imovelId: number;
  valorAvaliado: number;
  /** Data ISO "AAAA-MM-DD". */
  dataAvaliacao: string;
  metodologia?: string;
  fonte?: string;
  observacoes?: string;
}

export interface AvaliacaoMercado {
  id: number;
  imovel_id: number;
  valor_avaliado: number;
  data_avaliacao: string;
  metodologia: string | null;
  fonte: string | null;
  observacoes: string | null;
  criado_em: string;
}

/** De onde veio o valor de mercado "mais recente" retornado: do histórico
 * (`imovel_avaliacoes_mercado`, o caso normal) ou do cache em `imoveis` (fallback, usado
 * quando o imóvel tem `valor_venal_atual` semeado no cadastro mas ainda nenhuma linha de
 * histórico registrada por este módulo). */
export type OrigemValorMercado = "historico" | "cache_imoveis";

export interface UltimaAvaliacaoMercado {
  valorAvaliado: number;
  dataAvaliacao: string | null;
  origem: OrigemValorMercado;
}

// ============================================================================
// HELPERS
// ============================================================================

function imovelExiste(db: Database, imovelId: number): boolean {
  return consultar<{ id: number }>(db, "SELECT id FROM imoveis WHERE id = ?", [imovelId]).length > 0;
}

// ============================================================================
// REGISTRO E HISTÓRICO
// ============================================================================

/**
 * Registra uma nova avaliação de mercado (valor venal) para um imóvel.
 *
 * Depois de inserir, atualiza `imoveis.valor_venal_atual`/`data_avaliacao_venal` (o cache
 * de "valor mais recente" usado pelo cadastro) SE E SOMENTE SE a avaliação recém-inserida
 * for, de fato, a mais recente do histórico do imóvel (`data_avaliacao` igual ao MAX() de
 * `data_avaliacao` em `imovel_avaliacoes_mercado` para aquele imóvel, já incluindo esta
 * linha). Uma avaliação histórica inserida fora de ordem (ex: usuário digitando um laudo
 * antigo que faltava no sistema, depois de já ter uma avaliação mais recente cadastrada)
 * NÃO sobrescreve o cache — ele continua refletindo a avaliação de fato mais recente.
 */
export function registrarAvaliacaoMercado(db: Database, dados: NovaAvaliacaoMercado): number {
  if (!imovelExiste(db, dados.imovelId)) {
    throw new Error(`Imóvel ${dados.imovelId} não encontrado.`);
  }
  if (!Number.isFinite(dados.valorAvaliado) || dados.valorAvaliado <= 0) {
    throw new Error("O valor avaliado deve ser maior que zero.");
  }
  if (!dados.dataAvaliacao || !dados.dataAvaliacao.trim()) {
    throw new Error("Informe a data da avaliação.");
  }

  executar(
    db,
    `INSERT INTO imovel_avaliacoes_mercado
       (imovel_id, valor_avaliado, data_avaliacao, metodologia, fonte, observacoes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      dados.imovelId,
      dados.valorAvaliado,
      dados.dataAvaliacao,
      dados.metodologia?.trim() || null,
      dados.fonte?.trim() || null,
      dados.observacoes?.trim() || null,
    ],
  );

  const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id");

  const [{ maxData }] = consultar<{ maxData: string | null }>(
    db,
    "SELECT MAX(data_avaliacao) AS maxData FROM imovel_avaliacoes_mercado WHERE imovel_id = ?",
    [dados.imovelId],
  );

  // maxData já inclui a linha recém-inserida: se ela é igual ao máximo, é (ou empata como)
  // a mais recente — atualiza o cache. Se houver outra linha com data posterior, maxData
  // será maior que dados.dataAvaliacao e o cache fica intocado.
  if (maxData !== null && dados.dataAvaliacao >= maxData) {
    executar(
      db,
      "UPDATE imoveis SET valor_venal_atual = ?, data_avaliacao_venal = ? WHERE id = ?",
      [dados.valorAvaliado, dados.dataAvaliacao, dados.imovelId],
    );
  }

  return id;
}

/** Histórico completo de avaliações de mercado de um imóvel, mais recente primeiro. */
export function listarAvaliacoesMercado(db: Database, imovelId: number): AvaliacaoMercado[] {
  return consultar<AvaliacaoMercado>(
    db,
    `SELECT id, imovel_id, valor_avaliado, data_avaliacao, metodologia, fonte, observacoes, criado_em
     FROM imovel_avaliacoes_mercado
     WHERE imovel_id = ?
     ORDER BY data_avaliacao DESC, id DESC`,
    [imovelId],
  );
}

/**
 * A avaliação de mercado mais recente de um imóvel.
 *
 * Prioridade: 1) a linha mais recente de `imovel_avaliacoes_mercado`; 2) se não houver
 * nenhuma, cai para o cache `imoveis.valor_venal_atual`/`data_avaliacao_venal` (pode ter
 * sido semeado no cadastro do imóvel antes deste módulo existir); 3) `null` se nem o
 * histórico nem o cache tiverem valor.
 */
export function obterUltimaAvaliacaoMercado(db: Database, imovelId: number): UltimaAvaliacaoMercado | null {
  const [ultima] = consultar<{ valor_avaliado: number; data_avaliacao: string }>(
    db,
    `SELECT valor_avaliado, data_avaliacao FROM imovel_avaliacoes_mercado
     WHERE imovel_id = ? ORDER BY data_avaliacao DESC, id DESC LIMIT 1`,
    [imovelId],
  );
  if (ultima) {
    return { valorAvaliado: ultima.valor_avaliado, dataAvaliacao: ultima.data_avaliacao, origem: "historico" };
  }

  const [imovel] = consultar<{ valor_venal_atual: number | null; data_avaliacao_venal: string | null }>(
    db,
    "SELECT valor_venal_atual, data_avaliacao_venal FROM imoveis WHERE id = ?",
    [imovelId],
  );
  if (imovel && imovel.valor_venal_atual !== null && imovel.valor_venal_atual > 0) {
    return { valorAvaliado: imovel.valor_venal_atual, dataAvaliacao: imovel.data_avaliacao_venal, origem: "cache_imoveis" };
  }

  return null;
}

// ============================================================================
// RELATÓRIO: PATRIMÔNIO A CUSTO HISTÓRICO x VALOR DE MERCADO
// ============================================================================

export interface LinhaPatrimonioMercado {
  imovelId: number;
  apelido: string;
  cidade: string | null;
  valorHistorico: number;
  valorMercado: number | null;
  dataUltimaAvaliacao: string | null;
  origemValorMercado: OrigemValorMercado | "indisponivel";
  diferencaAbsoluta: number | null;
  /** Percentual em relação ao valor histórico; `null` se não houver valor de mercado ou o
   * valor histórico for zero/ausente (divisão indefinida). */
  diferencaPercentual: number | null;
}

export interface RelatorioPatrimonioMercado {
  linhas: LinhaPatrimonioMercado[];
  totalHistorico: number;
  /** Soma do valor de mercado; para imóvel sem nenhuma avaliação (nem histórico, nem
   * cache), usa o valor histórico como substituto nesta soma — para o total do portfólio
   * não ficar artificialmente subestimado por falta de avaliação, mas a linha individual
   * continua marcando `valorMercado: null` / `origemValorMercado: "indisponivel"` para a
   * tela deixar isso visível. */
  totalMercado: number;
  diferencaTotalAbsoluta: number;
  diferencaTotalPercentual: number | null;
}

/** Para cada imóvel de investimento (`uso_pessoal = 0` — mesma convenção usada em
 * `reports/desempenhoPorImovel.ts` e `erp/dashboard-portfolio.ts`, já que um imóvel de
 * residência própria não faz parte da atividade e não tem "viabilidade de negócio" a
 * avaliar), compara custo histórico de aquisição com o valor de mercado mais recente. */
export function relatorioPatrimonioMercado(db: Database): RelatorioPatrimonioMercado {
  const imoveis = consultar<{ id: number; apelido: string; cidade: string | null; valor_aquisicao: number | null }>(
    db,
    "SELECT id, apelido, cidade, valor_aquisicao FROM imoveis WHERE uso_pessoal = 0 ORDER BY apelido",
  );

  const linhas: LinhaPatrimonioMercado[] = imoveis.map((imovel) => {
    const valorHistorico = imovel.valor_aquisicao ?? 0;
    const ultima = obterUltimaAvaliacaoMercado(db, imovel.id);

    const valorMercado = ultima?.valorAvaliado ?? null;
    const diferencaAbsoluta = valorMercado !== null ? valorMercado - valorHistorico : null;
    const diferencaPercentual =
      valorMercado !== null && valorHistorico > 0 ? (diferencaAbsoluta! / valorHistorico) * 100 : null;

    return {
      imovelId: imovel.id,
      apelido: imovel.apelido,
      cidade: imovel.cidade,
      valorHistorico,
      valorMercado,
      dataUltimaAvaliacao: ultima?.dataAvaliacao ?? null,
      origemValorMercado: ultima?.origem ?? "indisponivel",
      diferencaAbsoluta,
      diferencaPercentual,
    };
  });

  const totalHistorico = linhas.reduce((soma, l) => soma + l.valorHistorico, 0);
  const totalMercado = linhas.reduce((soma, l) => soma + (l.valorMercado ?? l.valorHistorico), 0);
  const diferencaTotalAbsoluta = totalMercado - totalHistorico;
  const diferencaTotalPercentual = totalHistorico > 0 ? (diferencaTotalAbsoluta / totalHistorico) * 100 : null;

  return { linhas, totalHistorico, totalMercado, diferencaTotalAbsoluta, diferencaTotalPercentual };
}

// ============================================================================
// INDICADORES AVANÇADOS A VALOR DE MERCADO — payback, yield, CAGR, TIR aprox., LTV, DSCR
// ============================================================================

/** Indicador com a fórmula e a fonte dos dados expostas como TEXTO (para a tela renderizar
 * em tooltip/legenda) — diferente do resto do arquivo, que só documenta a fórmula em
 * comentário JSDoc (sem valor em runtime). `valor` é `null` quando o indicador não pôde ser
 * calculado; `motivoIndisponivel` explica o porquê nesse caso (nunca populado quando `valor`
 * não é `null`). */
export interface IndicadorMercadoComExplicacao<T> {
  valor: T | null;
  formula: string;
  fonteDados: string;
  motivoIndisponivel: string | null;
}

function diasEntreIso(inicioIso: string, fimIso: string): number {
  const a = new Date(`${inicioIso}T00:00:00Z`).getTime();
  const b = new Date(`${fimIso}T00:00:00Z`).getTime();
  return (b - a) / (1000 * 60 * 60 * 24);
}

/** Payback simples a valor de mercado = valor de mercado mais recente / fluxo de caixa
 * líquido anual (mesmo NOI anual usado em Cap Rate/ROI — única fonte de "resultado por
 * imóvel" reaproveitável neste sistema, ver decisão de design documentada abaixo). */
export function calcularPaybackMercado(
  valorMercado: number | null,
  fluxoCaixaLiquidoAnual: number,
): IndicadorMercadoComExplicacao<number> {
  const formula = "Payback a mercado = valor de mercado mais recente ÷ fluxo de caixa líquido anual (NOI anual)";
  const fonteDados =
    "Valor de mercado: obterUltimaAvaliacaoMercado (histórico imovel_avaliacoes_mercado, ou cache " +
    "imoveis.valor_venal_atual). Fluxo de caixa líquido anual: NOI anual de erp/dashboard-portfolio.ts " +
    "(obterPortfolioCompleto) — mesma fonte usada no Cap Rate/ROI.";
  if (valorMercado === null || valorMercado <= 0) {
    return { valor: null, formula, fonteDados, motivoIndisponivel: "sem valor de mercado conhecido" };
  }
  if (fluxoCaixaLiquidoAnual <= 0) {
    return {
      valor: null,
      formula,
      fonteDados,
      motivoIndisponivel: "fluxo de caixa líquido anual não positivo — payback indefinido",
    };
  }
  return { valor: valorMercado / fluxoCaixaLiquidoAnual, formula, fonteDados, motivoIndisponivel: null };
}

/** Yield bruto e líquido a valor de mercado. O yield líquido usa a receita líquida anual =
 * NOI anual — por isso é NUMERICAMENTE IGUAL ao Cap Rate (mesma fórmula/fonte); exposto como
 * campo próprio porque "yield" e "cap rate" são rótulos convencionais distintos no mercado
 * imobiliário, mesmo calculados da mesma forma aqui (mesma decisão de design documentada
 * abaixo para Cap Rate/ROI). */
export function calcularYieldsMercado(
  receitaBrutaAnualValor: number,
  receitaLiquidaAnualValor: number,
  valorMercado: number | null,
): { bruto: IndicadorMercadoComExplicacao<number>; liquido: IndicadorMercadoComExplicacao<number> } {
  const fonteDados =
    "Receita bruta anual: soma do aluguel vigente mês a mês nos contratos de locação " +
    "(contratos_locacao.valor_referencia), mesma lógica de vigência de erp/dashboard-portfolio.ts " +
    "(reimplementada localmente porque aquela função é privada/não exportada). Receita líquida anual: " +
    "NOI anual de erp/dashboard-portfolio.ts. Valor de mercado: obterUltimaAvaliacaoMercado.";
  const formulaBruto = "Yield bruto a mercado = receita bruta anual ÷ valor de mercado mais recente × 100";
  const formulaLiquido =
    "Yield líquido a mercado = receita líquida anual (NOI) ÷ valor de mercado mais recente × 100 " +
    "(numericamente igual ao Cap Rate)";
  const semValorMercado = valorMercado === null || valorMercado <= 0;

  return {
    bruto: semValorMercado
      ? { valor: null, formula: formulaBruto, fonteDados, motivoIndisponivel: "sem valor de mercado conhecido" }
      : {
          valor: (receitaBrutaAnualValor / valorMercado) * 100,
          formula: formulaBruto,
          fonteDados,
          motivoIndisponivel: null,
        },
    liquido: semValorMercado
      ? { valor: null, formula: formulaLiquido, fonteDados, motivoIndisponivel: "sem valor de mercado conhecido" }
      : {
          valor: (receitaLiquidaAnualValor / valorMercado) * 100,
          formula: formulaLiquido,
          fonteDados,
          motivoIndisponivel: null,
        },
  };
}

/** CAGR de valorização a partir do HISTÓRICO de avaliações de mercado (`imovel_avaliacoes_mercado`,
 * via `listarAvaliacoesMercado`) — usa a avaliação mais antiga e a mais recente do histórico.
 * `null` com menos de 2 avaliações (não há como calcular uma taxa de variação sem 2 pontos no
 * tempo), ou com intervalo de tempo zero/inválido entre elas. */
export function calcularValorizacaoAnualizada(historico: AvaliacaoMercado[]): IndicadorMercadoComExplicacao<number> {
  const formula =
    "CAGR = (valor da avaliação mais recente ÷ valor da avaliação mais antiga)^(1/anos) − 1, " +
    "anos = dias entre as duas avaliações ÷ 365,25";
  const fonteDados =
    "Histórico completo de imovel_avaliacoes_mercado (listarAvaliacoesMercado) — compara a avaliação mais " +
    "antiga registrada com a mais recente.";
  if (historico.length < 2) {
    return {
      valor: null,
      formula,
      fonteDados,
      motivoIndisponivel: "histórico insuficiente — precisa de pelo menos 2 avaliações",
    };
  }
  // historico vem ordenado DESC (mais recente primeiro, ver listarAvaliacoesMercado).
  const maisRecente = historico[0];
  const maisAntiga = historico[historico.length - 1];
  const anos = diasEntreIso(maisAntiga.data_avaliacao, maisRecente.data_avaliacao) / 365.25;
  if (anos <= 0 || maisAntiga.valor_avaliado <= 0) {
    return {
      valor: null,
      formula,
      fonteDados,
      motivoIndisponivel: "intervalo de tempo insuficiente (ou inválido) entre a avaliação mais antiga e a mais recente",
    };
  }
  const cagr = Math.pow(maisRecente.valor_avaliado / maisAntiga.valor_avaliado, 1 / anos) - 1;
  return { valor: cagr * 100, formula, fonteDados, motivoIndisponivel: null };
}

/** VPL (valor presente líquido) de um fluxo de caixa anual [t=0, t=1, ...] a uma taxa dada. */
function calcularVPL(fluxos: number[], taxaAnual: number): number {
  return fluxos.reduce((soma, fluxo, t) => soma + fluxo / Math.pow(1 + taxaAnual, t), 0);
}

/** TIR (IRR) por bisseção sobre o VPL — sem biblioteca externa. Procura uma raiz entre
 * -99,99% e +1000% a.a.; se o VPL não trocar de sinal nesse intervalo (ex: todos os fluxos
 * positivos, ou todos negativos), não há TIR identificável e retorna `null`. */
function calcularTirPorBisseccao(fluxos: number[]): number | null {
  const MAX_ITERACOES = 200;
  const TOLERANCIA = 1e-9;
  let baixo = -0.9999;
  let alto = 10;
  let vplBaixo = calcularVPL(fluxos, baixo);
  const vplAlto = calcularVPL(fluxos, alto);
  if (!Number.isFinite(vplBaixo) || !Number.isFinite(vplAlto)) return null;
  if (vplBaixo !== 0 && vplAlto !== 0 && Math.sign(vplBaixo) === Math.sign(vplAlto)) return null;

  for (let i = 0; i < MAX_ITERACOES; i++) {
    const meio = (baixo + alto) / 2;
    const vplMeio = calcularVPL(fluxos, meio);
    if (Math.abs(vplMeio) < TOLERANCIA) return meio;
    if (Math.sign(vplMeio) === Math.sign(vplBaixo)) {
      baixo = meio;
      vplBaixo = vplMeio;
    } else {
      alto = meio;
    }
  }
  return (baixo + alto) / 2;
}

/** Data de referência usada como PROXY da data de aquisição do imóvel — o cadastro
 * (`imoveis`) não tem um campo `data_aquisicao` (só `valor_aquisicao`, o custo). Prioridade:
 * 1) a mais antiga entre `financiamentos.data_contrato` do imóvel (financiamento normalmente
 * contratado na aquisição); 2) se não houver financiamento, a avaliação mais antiga do
 * histórico (`imovel_avaliacoes_mercado`); 3) `null` se não houver nenhuma das duas (TIR não
 * pode ser calculada sem uma referência temporal para o fluxo inicial). */
function obterDataReferenciaAquisicao(db: Database, imovelId: number): string | null {
  const [financiamento] = consultar<{ data_contrato: string | null }>(
    db,
    "SELECT MIN(data_contrato) AS data_contrato FROM financiamentos WHERE imovel_id = ?",
    [imovelId],
  );
  if (financiamento?.data_contrato) return financiamento.data_contrato;

  const historico = listarAvaliacoesMercado(db, imovelId);
  if (historico.length > 0) return historico[historico.length - 1].data_avaliacao;

  return null;
}

/**
 * TIR (IRR) APROXIMADA do imóvel — fluxo de caixa: -valor_aquisicao (custo histórico) na
 * data de referência da aquisição (ver `obterDataReferenciaAquisicao`), seguido de um fluxo
 * anual = NOI anual atual em cada ano intermediário, e no último ano NOI anual + valor de
 * mercado mais recente (um "encerramento hipotético"/venda simulada no fim). Resolvida
 * numericamente por bisseção sobre o VPL (`calcularTirPorBisseccao`).
 *
 * ⚠️ É UMA APROXIMAÇÃO, não um retorno realizado: (1) assume o NOI anual constante em todos
 * os anos entre a aquisição e hoje — este sistema só tem o NOI do ano corrente, não uma série
 * histórica anual por imóvel; (2) o "encerramento" no valor de mercado atual NÃO é uma venda
 * real, é uma simulação de quanto seria a TIR SE o imóvel fosse vendido hoje pelo valor de
 * mercado mais recente; (3) a data de aquisição em si pode ser um proxy quando o imóvel não é
 * financiado (ver `obterDataReferenciaAquisicao`). Use como estimativa de ordem de grandeza,
 * nunca como retorno certificado.
 */
export function calcularTirAproximada(
  db: Database,
  imovelId: number,
  valorAquisicao: number | null,
  noiAnual: number,
  valorMercado: number | null,
  dataUltimaAvaliacao: string | null,
): IndicadorMercadoComExplicacao<number> {
  const formula =
    "TIR aproximada: VPL(taxa) = −valor_aquisicao + Σ NOI_anual/(1+taxa)^t (anos intermediários) + " +
    "(NOI_anual + valor_de_mercado)/(1+taxa)^anos (último ano) = 0, resolvida por bisseção";
  const fonteDados =
    "APROXIMAÇÃO — assume NOI anual constante entre os anos conhecidos e uma venda hipotética (não real) " +
    "no valor de mercado atual. Custo de aquisição: imoveis.valor_aquisicao. Data de referência da " +
    "aquisição: PROXY (não existe campo data_aquisicao no cadastro) — data do financiamento mais antigo " +
    "(financiamentos.data_contrato) quando o imóvel é financiado, senão a avaliação mais antiga do " +
    "histórico (imovel_avaliacoes_mercado). NOI anual: erp/dashboard-portfolio.ts. Valor de mercado/data: " +
    "obterUltimaAvaliacaoMercado.";

  if (!valorAquisicao || valorAquisicao <= 0) {
    return {
      valor: null,
      formula,
      fonteDados,
      motivoIndisponivel: "sem valor de aquisição (custo histórico) cadastrado",
    };
  }
  if (!valorMercado || valorMercado <= 0 || !dataUltimaAvaliacao) {
    return { valor: null, formula, fonteDados, motivoIndisponivel: "sem valor de mercado conhecido" };
  }

  const dataAquisicaoRef = obterDataReferenciaAquisicao(db, imovelId);
  if (!dataAquisicaoRef) {
    return {
      valor: null,
      formula,
      fonteDados,
      motivoIndisponivel:
        "sem data de referência para a aquisição (nem financiamento, nem histórico de avaliações)",
    };
  }

  const anos = Math.round(diasEntreIso(dataAquisicaoRef, dataUltimaAvaliacao) / 365.25);
  if (anos < 1) {
    return {
      valor: null,
      formula,
      fonteDados,
      motivoIndisponivel: "período entre a aquisição (ou proxy) e a avaliação mais recente é menor que 1 ano",
    };
  }

  const fluxos: number[] = [-valorAquisicao];
  for (let ano = 1; ano < anos; ano++) fluxos.push(noiAnual);
  fluxos.push(noiAnual + valorMercado);

  const tir = calcularTirPorBisseccao(fluxos);
  if (tir === null) {
    return {
      valor: null,
      formula,
      fonteDados,
      motivoIndisponivel:
        "não foi possível encontrar uma TIR dentro da faixa avaliada (-99,99% a +1000% a.a.) para este fluxo de caixa",
    };
  }
  return { valor: tir * 100, formula, fonteDados, motivoIndisponivel: null };
}

/** Todos os financiamentos vinculados ao imóvel (qualquer sistema). */
function obterFinanciamentosDoImovel(db: Database, imovelId: number): Financiamento[] {
  return consultar<Financiamento>(db, "SELECT * FROM financiamentos WHERE imovel_id = ?", [imovelId]);
}

/** LTV (Loan-to-Value) a valor de MERCADO = saldo devedor dos financiamentos do imóvel ÷
 * valor de mercado mais recente × 100 — mais realista que o LTV a custo histórico porque
 * reflete a alavancagem real de hoje (o denominador acompanha o valor de mercado verdadeiro,
 * não o preço pago no passado). Sem financiamento cadastrado, o saldo devedor é 0 (0% de
 * alavancagem — estado bem definido, não "indisponível"). */
export function calcularLtvMercado(
  db: Database,
  imovelId: number,
  valorMercado: number | null,
  dataReferencia: string,
): IndicadorMercadoComExplicacao<number> {
  const formula = "LTV a mercado = saldo devedor dos financiamentos do imóvel ÷ valor de mercado mais recente × 100";
  const fonteDados =
    "Saldo devedor: financiamentos + saldoDevedorFinanciamento (domain/patrimonio/balancoPatrimonial.ts — " +
    "cronograma SAC/Price teórico, ou saldo_devedor_manual para financiamento 'OUTRO'), na data de hoje. " +
    "Valor de mercado: obterUltimaAvaliacaoMercado.";
  if (valorMercado === null || valorMercado <= 0) {
    return { valor: null, formula, fonteDados, motivoIndisponivel: "sem valor de mercado conhecido" };
  }

  const financiamentos = obterFinanciamentosDoImovel(db, imovelId);
  const saldos = financiamentos.map((f) => saldoDevedorFinanciamento(f, dataReferencia));
  if (saldos.some((s) => s === null)) {
    return {
      valor: null,
      formula,
      fonteDados,
      motivoIndisponivel: "financiamento 'OUTRO' sem saldo_devedor_manual informado — saldo devedor incompleto",
    };
  }
  const saldoDevedorTotal = saldos.reduce((soma: number, s) => soma + (s ?? 0), 0);
  return { valor: (saldoDevedorTotal / valorMercado) * 100, formula, fonteDados, motivoIndisponivel: null };
}

/** DSCR (Debt Service Coverage Ratio) = NOI anual ÷ serviço da dívida anual (soma das
 * parcelas mensais × 12 de todos os financiamentos do imóvel).
 *
 * OBSERVAÇÃO: este indicador NÃO muda com o valor de mercado — nem o NOI nem o serviço da
 * dívida dependem do valor do imóvel — então é IDÊNTICO ao DSCR que seria calculado a custo
 * histórico. Incluído aqui só para a tela de avaliação de mercado ficar completa (indicador
 * de negócio padrão de qualquer análise de financiamento imobiliário), reaproveitando
 * `parcelaMensalFinanciamento` (domain/patrimonio/balancoPatrimonial.ts) em vez de recalcular
 * do zero — sem importar `indicadoresHistorico.ts` (módulo em edição paralela por outro
 * agente nesta rodada), que pode já expor este mesmo indicador do lado de custo histórico. */
export function calcularDscrMercado(
  db: Database,
  imovelId: number,
  noiAnual: number,
  dataReferencia: string,
): IndicadorMercadoComExplicacao<number> {
  const formula =
    "DSCR = NOI anual ÷ serviço da dívida anual (soma das parcelas mensais × 12 de todos os financiamentos do imóvel)";
  const fonteDados =
    "NOI anual: erp/dashboard-portfolio.ts (mesma fonte do Cap Rate). Parcela mensal: " +
    "parcelaMensalFinanciamento (domain/patrimonio/balancoPatrimonial.ts). Idêntico ao DSCR a custo " +
    "histórico — o cálculo não depende do valor do imóvel.";

  const financiamentos = obterFinanciamentosDoImovel(db, imovelId);
  if (financiamentos.length === 0) {
    return {
      valor: null,
      formula,
      fonteDados,
      motivoIndisponivel: "sem financiamento cadastrado para este imóvel — sem serviço da dívida a cobrir",
    };
  }
  const parcelas = financiamentos.map((f) => parcelaMensalFinanciamento(f, dataReferencia));
  if (parcelas.some((p) => p === null)) {
    return {
      valor: null,
      formula,
      fonteDados,
      motivoIndisponivel: "financiamento 'OUTRO' sem parcela_mensal_manual informada",
    };
  }
  const servicoDividaAnual = parcelas.reduce((soma: number, p) => soma + (p ?? 0), 0) * 12;
  if (servicoDividaAnual <= 0) {
    return {
      valor: null,
      formula,
      fonteDados,
      motivoIndisponivel: "serviço da dívida zerado (financiamento já quitado ou ainda não iniciado)",
    };
  }
  return { valor: noiAnual / servicoDividaAnual, formula, fonteDados, motivoIndisponivel: null };
}

/** Receita BRUTA anual (sem descontar despesas) de um imóvel — soma do aluguel vigente mês a
 * mês pelos contratos de locação. Mesma lógica/filtro de vigência de
 * `erp/dashboard-portfolio.ts` (função privada `obterAluguelVigenteNoMes`, não exportada) —
 * reimplementada aqui (duplicação deliberada e mínima, só esta consulta) porque este módulo
 * não deve editar dashboard-portfolio.ts para exportá-la. O NOI anual (receita líquida)
 * continua vindo de `obterPortfolioCompleto`, nunca recalculado aqui. */
function receitaBrutaAnual(db: Database, imovelId: number, ano: number): number {
  const contratos = consultar<{ valor_referencia: number; data_inicio: string; data_fim: string | null }>(
    db,
    "SELECT valor_referencia, data_inicio, data_fim FROM contratos_locacao WHERE imovel_id = ?",
    [imovelId],
  );

  let total = 0;
  for (let mes = 1; mes <= 12; mes++) {
    const mm = String(mes).padStart(2, "0");
    const inicioMes = `${ano}-${mm}-01`;
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const fimMes = `${ano}-${mm}-${String(ultimoDia).padStart(2, "0")}`;
    total += contratos
      .filter((c) => c.data_inicio <= fimMes && (c.data_fim === null || c.data_fim >= inicioMes))
      .reduce((soma, c) => soma + c.valor_referencia, 0);
  }
  return total;
}

// ============================================================================
// INDICADORES DE VIABILIDADE (NOI, CAP RATE, ROI...) — sempre a valor de MERCADO
// ============================================================================

export interface IndicadorViabilidadeImovel {
  imovelId: number;
  apelido: string;
  /** NOI (Net Operating Income) anualizado — reaproveitado de
   * `erp/dashboard-portfolio.ts` (`obterPortfolioCompleto`/`calcularNOIAnual`): soma dos 12
   * meses de (aluguel vigente nos contratos de locação - despesas operacionais lançadas em
   * `contas_a_pagar`, por competência). Não é recalculado aqui. */
  noiAnual: number;
  valorMercado: number | null;
  dataAvaliacaoMercado: string | null;
  /** Cap Rate = NOI anual / valor de mercado × 100. `null` sem valor de mercado conhecido. */
  capRatePercentual: number | null;
  /** ROI simples = resultado do período anualizado / valor de mercado × 100. `null` sem
   * valor de mercado conhecido.
   *
   * DECISÃO DE DESIGN: neste sistema, a única fonte de "receita/despesa operacional por
   * imóvel" reaproveitável (dashboard-portfolio.ts) define o resultado do período anualizado
   * exatamente como o NOI anual (aluguel vigente − despesas operacionais; o cashflow mensal
   * do mesmo módulo usa a idêntica subtração). Não existe, hoje, uma segunda métrica de
   * "resultado" distinta do NOI para uma base de imóveis alavancados/desalavancados. Por
   * isso, ROI simples e Cap Rate coincidem numericamente aqui — ambos expostos como campos
   * separados (rótulos diferentes têm significado diferente para quem lê o indicador,
   * mesmo quando a fórmula-base é a mesma), em vez de inventar uma métrica nova que este
   * módulo, por regra, não pode derivar de lançamentos contábeis (`ledger_entries`). */
  roiPercentual: number | null;

  /** Payback simples a valor de mercado (anos para recuperar o valor de mercado via fluxo de
   * caixa líquido anual). `null` sem valor de mercado, ou com fluxo de caixa líquido anual não
   * positivo (payback indefinido nesse caso). */
  paybackMercadoAnos: IndicadorMercadoComExplicacao<number>;
  /** Yield bruto a mercado = receita bruta anual (sem descontar despesas) / valor de mercado. */
  yieldBrutoMercadoPercentual: IndicadorMercadoComExplicacao<number>;
  /** Yield líquido a mercado = receita líquida anual (NOI) / valor de mercado — numericamente
   * igual ao Cap Rate (mesma fórmula/fonte); ver decisão de design já documentada acima para
   * Cap Rate/ROI. Rótulo próprio porque "yield" e "cap rate" são termos convencionais
   * distintos no mercado imobiliário, mesmo calculados da mesma forma aqui. */
  yieldLiquidoMercadoPercentual: IndicadorMercadoComExplicacao<number>;
  /** CAGR de valorização a partir do HISTÓRICO de avaliações de mercado do imóvel
   * (`imovel_avaliacoes_mercado`). `null` com menos de 2 avaliações no histórico. */
  valorizacaoAnualizadaPercentual: IndicadorMercadoComExplicacao<number>;
  /** TIR (IRR) APROXIMADA — ver documentação de `calcularTirAproximada`: assume fluxo anual
   * constante entre os pontos conhecidos e um "encerramento hipotético" (venda simulada, não
   * real) no valor de mercado atual. Resolvida numericamente por bisseção. */
  tirAproximadaPercentual: IndicadorMercadoComExplicacao<number>;
  /** LTV a valor de mercado = saldo devedor dos financiamentos / valor de mercado mais
   * recente — mais realista que o LTV a custo histórico (reflete a alavancagem real de hoje). */
  ltvMercadoPercentual: IndicadorMercadoComExplicacao<number>;
  /** DSCR = NOI anual / serviço da dívida anual. NÃO muda com o valor de mercado (ver
   * documentação de `calcularDscrMercado`) — incluído aqui só para a tela ficar completa. */
  dscrMercado: IndicadorMercadoComExplicacao<number>;
}

export interface IndicadoresViabilidadePortfolio {
  ano: number;
  entidadeId: number | null;
  imoveis: IndicadorViabilidadeImovel[];
  /** NOI anual somado — só dos imóveis com valor de mercado conhecido (mesma base usada nos
   * consolidados de Cap Rate/ROI abaixo, para a razão ficar consistente). */
  noiAnualTotalConsiderado: number;
  valorMercadoTotal: number;
  capRateConsolidadoPercentual: number | null;
  roiConsolidadoPercentual: number | null;
  /** Quantidade de imóveis do portfólio sem nenhum valor de mercado (excluídos dos
   * consolidados acima, mas ainda listados em `imoveis` com os campos de mercado nulos). */
  imoveisSemAvaliacaoMercado: number;
}

/**
 * Indicadores de viabilidade de negócio por imóvel e consolidado do portfólio — sempre a
 * valor de MERCADO no denominador (nunca custo histórico; para custo histórico, ver os
 * relatórios oficiais em `erp/relatorios-integrados.ts`/`reports/*`).
 *
 * `ano` (padrão: ano corrente) é o ano-base do NOI anualizado. A entidade legal é obtida via
 * `obterEntidadeAtiva` (sistema é monoentidade hoje, mesma convenção de
 * `erp/entidadeLegal.ts`) — sem entidade cadastrada (onboarding ainda não rodou), as
 * despesas operacionais de `contas_a_pagar` não podem ser escopadas e o NOI sai só com a
 * receita de aluguel (sem desconto de despesas), o mesmo comportamento degradado que
 * `dashboard-portfolio.ts` já teria nesse cenário.
 *
 * Os indicadores avançados (payback, yield, CAGR, TIR aproximada, LTV e DSCR a mercado) são
 * calculados por imóvel, não consolidados no portfólio: TIR/CAGR de imóveis diferentes não
 * podem ser somados/tirados a média de forma direta (dependem de valores e horizontes de
 * tempo distintos), diferente de NOI/valor de mercado que são somáveis em R$.
 */
export function calcularIndicadoresViabilidade(
  db: Database,
  ano: number = new Date().getFullYear(),
): IndicadoresViabilidadePortfolio {
  const entidade = obterEntidadeAtiva(db);
  const entidadeId = entidade?.id ?? null;
  // Sentinela que não bate com nenhum entidade_id real (PK positiva) quando não há
  // entidade ativa — mantém a mesma consulta de `obterPortfolioCompleto` utilizável mesmo
  // antes do onboarding, em vez de duplicar aqui o cálculo de NOI.
  const portfolio = obterPortfolioCompleto(db, entidadeId ?? -1, ano, 1);
  // Data de referência para saldo devedor/parcela de financiamento (LTV e DSCR a mercado) —
  // "hoje", para refletir a alavancagem/dívida REAL atual, não a de uma data histórica.
  const dataReferenciaHoje = new Date().toISOString().slice(0, 10);

  const imoveis: IndicadorViabilidadeImovel[] = portfolio.imoveis.map((metrica) => {
    const [cadastro] = consultar<{ apelido: string; valor_aquisicao: number | null }>(
      db,
      "SELECT apelido, valor_aquisicao FROM imoveis WHERE id = ?",
      [metrica.imovel_id],
    );
    const ultima = obterUltimaAvaliacaoMercado(db, metrica.imovel_id);
    const valorMercado = ultima?.valorAvaliado ?? null;
    const capRatePercentual = valorMercado && valorMercado > 0 ? (metrica.noi_anual / valorMercado) * 100 : null;

    const historico = listarAvaliacoesMercado(db, metrica.imovel_id);
    const receitaBruta = receitaBrutaAnual(db, metrica.imovel_id, ano);
    const yields = calcularYieldsMercado(receitaBruta, metrica.noi_anual, valorMercado);

    return {
      imovelId: metrica.imovel_id,
      apelido: cadastro?.apelido ?? metrica.endereco,
      noiAnual: metrica.noi_anual,
      valorMercado,
      dataAvaliacaoMercado: ultima?.dataAvaliacao ?? null,
      capRatePercentual,
      roiPercentual: capRatePercentual,
      paybackMercadoAnos: calcularPaybackMercado(valorMercado, metrica.noi_anual),
      yieldBrutoMercadoPercentual: yields.bruto,
      yieldLiquidoMercadoPercentual: yields.liquido,
      valorizacaoAnualizadaPercentual: calcularValorizacaoAnualizada(historico),
      tirAproximadaPercentual: calcularTirAproximada(
        db,
        metrica.imovel_id,
        cadastro?.valor_aquisicao ?? null,
        metrica.noi_anual,
        valorMercado,
        ultima?.dataAvaliacao ?? null,
      ),
      ltvMercadoPercentual: calcularLtvMercado(db, metrica.imovel_id, valorMercado, dataReferenciaHoje),
      dscrMercado: calcularDscrMercado(db, metrica.imovel_id, metrica.noi_anual, dataReferenciaHoje),
    };
  });

  const comValorMercado = imoveis.filter((i) => i.valorMercado !== null && i.valorMercado > 0);
  const noiAnualTotalConsiderado = comValorMercado.reduce((soma, i) => soma + i.noiAnual, 0);
  const valorMercadoTotal = comValorMercado.reduce((soma, i) => soma + (i.valorMercado ?? 0), 0);
  const capRateConsolidadoPercentual =
    valorMercadoTotal > 0 ? (noiAnualTotalConsiderado / valorMercadoTotal) * 100 : null;

  return {
    ano,
    entidadeId,
    imoveis,
    noiAnualTotalConsiderado,
    valorMercadoTotal,
    capRateConsolidadoPercentual,
    roiConsolidadoPercentual: capRateConsolidadoPercentual,
    imoveisSemAvaliacaoMercado: imoveis.length - comValorMercado.length,
  };
}
