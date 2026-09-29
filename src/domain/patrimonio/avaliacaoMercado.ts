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
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { obterPortfolioCompleto } from "../erp/dashboard-portfolio";
import { obterEntidadeAtiva } from "../erp/entidadeLegal";

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
// INDICADORES DE VIABILIDADE (NOI, CAP RATE, ROI) — sempre a valor de MERCADO
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

  const imoveis: IndicadorViabilidadeImovel[] = portfolio.imoveis.map((metrica) => {
    const [cadastro] = consultar<{ apelido: string }>(db, "SELECT apelido FROM imoveis WHERE id = ?", [
      metrica.imovel_id,
    ]);
    const ultima = obterUltimaAvaliacaoMercado(db, metrica.imovel_id);
    const valorMercado = ultima?.valorAvaliado ?? null;
    const capRatePercentual = valorMercado && valorMercado > 0 ? (metrica.noi_anual / valorMercado) * 100 : null;

    return {
      imovelId: metrica.imovel_id,
      apelido: cadastro?.apelido ?? metrica.endereco,
      noiAnual: metrica.noi_anual,
      valorMercado,
      dataAvaliacaoMercado: ultima?.dataAvaliacao ?? null,
      capRatePercentual,
      roiPercentual: capRatePercentual,
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
