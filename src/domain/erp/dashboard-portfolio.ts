/**
 * Dashboard de Portfólio de Imóveis
 * Métricas e KPIs: NOI, Taxa Ocupação, ROI, Cashflow, Inadimplência
 *
 * ACHADO (balde D — módulo órfão investigado nesta sessão): o módulo original foi escrito
 * contra um schema fictício, divergente do real (`contabilidade-reconstituicao/schema.sql`)
 * em vários pontos, não só na tabela `despesas_operacionais_agendadas` (que não existe):
 *   - `contratos_locacao` não tem coluna `status` nem `valor_aluguel` (é `valor_referencia`,
 *     e "ativo" é inferido por `data_inicio`/`data_fim`, nunca por uma coluna de status);
 *   - `imoveis` não tem `entidade_id` — no schema real um imóvel não pertence a uma entidade
 *     legal (é global ao usuário; `entidades_legais` existe para separar CPF/CNPJ para fins
 *     fiscais, não para segmentar o patrimônio físico). O filtro de portfólio usado aqui é
 *     `uso_pessoal = 0`, a mesma convenção de `reports/desempenhoPorImovel.ts`.
 * Nenhuma dessas queries rodava contra `criarBancoDeTeste()` (schema real) antes desta
 * revisão — só contra a cópia fictícia em `__tests__/test-setup.ts`, que não provava nada.
 *
 * DECISÃO (despesas_operacionais_agendadas → reaproveitar `contas_a_pagar`): o conceito de
 * "despesa operacional agendada por imóvel" (condomínio, IPTU, seguro) já é coberto por
 * `contas_a_pagar` (src/domain/contasAPagar/contasAPagar.ts) — uma obrigação com
 * `data_vencimento`, `imovel_id` e `status`, já com aging e baixa integrada ao razão. Criar
 * uma tabela nova só para "despesa agendada" duplicaria esse modelo sem trazer nada que
 * `contas_a_pagar` não tenha: uma despesa recorrente (condomínio todo mês) já é lançada como
 * uma linha de `contas_a_pagar` por competência (uma por mês), exatamente como qualquer outro
 * ERP de referência trata "despesa recorrente" — não como uma definição de recorrência à
 * parte, mas como instâncias concretas com vencimento. Este módulo lê a despesa operacional
 * do mês de um imóvel como `SUM(valor) FROM contas_a_pagar WHERE imovel_id = ? AND
 * status != 'cancelada' AND data_vencimento` dentro do mês — pendente ou já paga, porque
 * NOI/cashflow aqui são pelo REGIME DE COMPETÊNCIA (a despesa existe no mês em que vence,
 * independente de já ter sido baixada), não de caixa efetivo.
 *
 * Integração com: imovel-gestao, integracao-contratos, integracao-rateios, ledger,
 * contas_a_pagar. A inadimplência real (atraso de aluguel) é responsabilidade de
 * `reconcile/inadimplencia.ts` / `integracao-inadimplencia.ts` — este módulo só expõe o
 * ponto de extensão (`calcularInadimplencia`), sem duplicar aquela lógica.
 */

import type { Database } from "sql.js";
import { consultar } from "../../db/connection";

export interface MetricaImove {
  imovel_id: number;
  endereco: string;
  valor_aquisicao: number;
  noi_mensal: number;
  noi_anual: number;
  taxa_ocupacao: number;
  roi_anual: number;
  cashflow_mensal: number;
  inadimplencia_valor: number;
  inadimplencia_percentual: number;
  dias_medio_inadimplencia: number;
}

export interface PortfolioMetrics {
  total_imoveis: number;
  valor_total: number;
  noi_mensal_total: number;
  noi_anual_total: number;
  roi_medio_anual: number;
  taxa_ocupacao_media: number;
  cashflow_mensal_total: number;
  inadimplencia_valor_total: number;
  inadimplencia_percentual_media: number;
  imoveis: MetricaImove[];
}

function round2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

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

/** Dias entre duas datas ISO "AAAA-MM-DD" (inclusive), nunca negativo. */
function diasEntreInclusive(inicio: string, fim: string): number {
  const a = new Date(`${inicio}T00:00:00Z`).getTime();
  const b = new Date(`${fim}T00:00:00Z`).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1;
}

/** Soma de `valor_referencia` dos contratos de locação do imóvel vigentes em algum dia do
 * mês (data_inicio <= último dia do mês E (sem data_fim OU data_fim >= primeiro dia do
 * mês)). Soma (não pega só o primeiro contrato, como a versão anterior fazia) porque nada
 * impede dois contratos ativos simultâneos no mesmo imóvel (ex: contrato residencial +
 * contrato de vaga de garagem separado) — pegar só o primeiro subestimava a receita nesse
 * caso. */
function obterAluguelVigenteNoMes(db: Database, imovel_id: number, ano: number, mes: number): number {
  const inicioMes = primeiroDiaMes(ano, mes);
  const fimMes = ultimoDiaMes(ano, mes);
  const contratos = consultar<{ valor_referencia: number; data_inicio: string; data_fim: string | null }>(
    db,
    `SELECT valor_referencia, data_inicio, data_fim FROM contratos_locacao WHERE imovel_id = ?`,
    [imovel_id],
  );
  return contratos
    .filter((c) => c.data_inicio <= fimMes && (c.data_fim === null || c.data_fim >= inicioMes))
    .reduce((soma, c) => soma + c.valor_referencia, 0);
}

/** Despesas operacionais do imóvel no mês — ver decisão no cabeçalho do arquivo: lidas de
 * `contas_a_pagar` (pendentes ou já pagas; nunca canceladas), pelo regime de competência
 * (mês de `data_vencimento`), filtradas também por `entidade_id` porque
 * `contas_a_pagar.entidade_id` é NOT NULL no schema real. */
function obterDespesasOperacionaisDoMes(
  db: Database,
  imovel_id: number,
  entidade_id: number,
  ano: number,
  mes: number,
): number {
  const inicioMes = primeiroDiaMes(ano, mes);
  const fimMes = ultimoDiaMes(ano, mes);
  const [linha] = consultar<{ total: number | null }>(
    db,
    `SELECT COALESCE(SUM(valor), 0) as total FROM contas_a_pagar
     WHERE imovel_id = ? AND entidade_id = ? AND status != 'cancelada'
       AND data_vencimento BETWEEN ? AND ?`,
    [imovel_id, entidade_id, inicioMes, fimMes],
  );
  return linha?.total ?? 0;
}

/**
 * Calcular NOI (Net Operating Income) de um imóvel num mês
 * NOI = (Aluguel + Rateios do(s) contrato(s) vigente(s)) - (despesas operacionais do mês
 * lançadas em contas_a_pagar: condomínio, IPTU, água, energia, manutenção etc)
 */
export function calcularNOI(db: Database, imovel_id: number, entidade_id: number, ano: number, mes: number): number {
  const aluguelMensal = obterAluguelVigenteNoMes(db, imovel_id, ano, mes);
  const totalDespesas = obterDespesasOperacionaisDoMes(db, imovel_id, entidade_id, ano, mes);
  return aluguelMensal - totalDespesas;
}

/** NOI somado dos 12 meses do ano — base real do ROI anual (ver calcularROIAnual). Não é
 * `calcularNOI(mes atual) * 12`: essa extrapolação (usada na versão anterior para o campo
 * noi_anual) diverge do NOI anual de verdade sempre que a receita ou a despesa variarem mês
 * a mês (contrato novo no meio do ano, despesa pontual etc). */
function calcularNOIAnual(db: Database, imovel_id: number, entidade_id: number, ano: number): number {
  let total = 0;
  for (let mes = 1; mes <= 12; mes++) {
    total += calcularNOI(db, imovel_id, entidade_id, ano, mes);
  }
  return total;
}

/**
 * Calcular Taxa de Ocupação de um imóvel num mês
 * Taxa Ocupação = dias_ocupados / dias_do_mês * 100 (capado em 100%)
 *
 * ACHADO: a versão anterior comparava só o NÚMERO do mês do contrato
 * (`dataInicio.getMonth()+1`) sem considerar o ANO, então um contrato iniciado em anos
 * anteriores e ainda vigente (o caso mais comum) caía fora de todos os `if/else if` e
 * contava 0 dias ocupados. Reescrito como interseção de intervalo (contrato × mês
 * consultado), que cobre contrato iniciado antes, durante ou depois do mês, com ou sem
 * data_fim.
 */
export function calcularTaxaOcupacao(db: Database, imovel_id: number, mes: number, ano: number): number {
  const contratos = consultar<{ data_inicio: string; data_fim: string | null }>(
    db,
    `SELECT data_inicio, data_fim FROM contratos_locacao WHERE imovel_id = ?`,
    [imovel_id],
  );

  if (!contratos || contratos.length === 0) {
    return 0;
  }

  const diasMes = new Date(ano, mes, 0).getDate();
  const inicioMes = primeiroDiaMes(ano, mes);
  const fimMes = ultimoDiaMes(ano, mes);

  let diasOcupados = 0;
  for (const contrato of contratos) {
    const inicioEfetivo = contrato.data_inicio > inicioMes ? contrato.data_inicio : inicioMes;
    const fimContrato = contrato.data_fim ?? fimMes;
    const fimEfetivo = fimContrato < fimMes ? fimContrato : fimMes;
    if (inicioEfetivo <= fimEfetivo) {
      diasOcupados += diasEntreInclusive(inicioEfetivo, fimEfetivo);
    }
  }

  // Capado em 100%: dois contratos sobrepostos no mesmo imóvel (dado inconsistente, mas
  // possível) não podem produzir "120% ocupado".
  return Math.min(100, (diasOcupados / diasMes) * 100);
}

/**
 * Calcular ROI Anual
 * ROI = (NOI anual real (soma dos 12 meses) / valor_aquisicao) * 100
 */
export function calcularROIAnual(db: Database, imovel_id: number, entidade_id: number, ano: number): number {
  const [imovel] = consultar<{ valor_aquisicao: number | null }>(
    db,
    `SELECT valor_aquisicao FROM imoveis WHERE id = ?`,
    [imovel_id],
  );

  if (!imovel || !imovel.valor_aquisicao || imovel.valor_aquisicao <= 0) {
    return 0;
  }

  const noiAnual = calcularNOIAnual(db, imovel_id, entidade_id, ano);
  return (noiAnual / imovel.valor_aquisicao) * 100;
}

/**
 * Calcular Cashflow Mensal
 * Cashflow = Recebimentos (aluguel vigente no mês) - Desembolsos (despesas operacionais do
 * mês). Simplificação deliberada, herdada do módulo original: não distingue "recebido de
 * fato" de "contratado", porque o recebimento efetivo do aluguel é responsabilidade do
 * módulo de inadimplência (reconcile/inadimplencia.ts, integracao-inadimplencia.ts), que
 * este módulo órfão ainda não consome.
 */
export function calcularCashflowMensal(
  db: Database,
  imovel_id: number,
  entidade_id: number,
  ano: number,
  mes: number,
): number {
  const recebimentos = obterAluguelVigenteNoMes(db, imovel_id, ano, mes);
  const desembolsos = obterDespesasOperacionaisDoMes(db, imovel_id, entidade_id, ano, mes);
  return recebimentos - desembolsos;
}

/**
 * Calcular Inadimplência
 * Retorna valor total em atraso e percentual em relação ao aluguel
 *
 * Nota: Este é um cálculo simplificado. A apuração real de atraso (multa, juros, correção
 * monetária por índice contratual) é feita por reconcile/inadimplencia.ts a partir de
 * competências e recebimentos efetivos — fora do escopo deste dashboard, que só expõe o
 * ponto de extensão.
 */
export function calcularInadimplencia(
  db: Database,
  imovel_id: number,
): { valor_atraso: number; percentual: number; dias_medio: number } {
  const contratos = consultar<{ id: number }>(
    db,
    `SELECT id FROM contratos_locacao WHERE imovel_id = ?`,
    [imovel_id],
  );

  if (!contratos || contratos.length === 0) {
    return { valor_atraso: 0, percentual: 0, dias_medio: 0 };
  }

  // Retorno padrão: sem atrasos detectados por este módulo — ver nota acima.
  return {
    valor_atraso: 0,
    percentual: 0,
    dias_medio: 0,
  };
}

/**
 * Obter Métrica Completa de um Imóvel
 */
export function obterMetricaImovel(
  db: Database,
  imovel_id: number,
  entidade_id: number,
  ano: number,
  mes: number,
): MetricaImove | null {
  const [imovel] = consultar<{ endereco: string | null; valor_aquisicao: number | null }>(
    db,
    `SELECT endereco, valor_aquisicao FROM imoveis WHERE id = ?`,
    [imovel_id],
  );

  if (!imovel) {
    return null;
  }

  const valorAquisicao = imovel.valor_aquisicao ?? 0;
  const noiMensal = calcularNOI(db, imovel_id, entidade_id, ano, mes);
  const noiAnual = calcularNOIAnual(db, imovel_id, entidade_id, ano);
  const taxaOcupacao = calcularTaxaOcupacao(db, imovel_id, mes, ano);
  const roiAnual = valorAquisicao > 0 ? (noiAnual / valorAquisicao) * 100 : 0;
  const cashflowMensal = calcularCashflowMensal(db, imovel_id, entidade_id, ano, mes);
  const inadimplencia = calcularInadimplencia(db, imovel_id);

  return {
    imovel_id,
    endereco: imovel.endereco ?? "",
    valor_aquisicao: valorAquisicao,
    noi_mensal: round2(noiMensal),
    noi_anual: round2(noiAnual),
    taxa_ocupacao: round2(taxaOcupacao),
    roi_anual: round2(roiAnual),
    cashflow_mensal: round2(cashflowMensal),
    inadimplencia_valor: round2(inadimplencia.valor_atraso),
    inadimplencia_percentual: inadimplencia.percentual,
    dias_medio_inadimplencia: inadimplencia.dias_medio,
  };
}

/**
 * Obter Portfolio Completo com Agregações
 *
 * `entidade_id` escopa as despesas (`contas_a_pagar.entidade_id` é NOT NULL) — não os
 * imóveis em si: no schema real `imoveis` não tem `entidade_id` (ver cabeçalho do
 * arquivo), então o portfólio lista todo imóvel de investimento (`uso_pessoal = 0`), a
 * mesma convenção usada em `reports/desempenhoPorImovel.ts`.
 */
export function obterPortfolioCompleto(
  db: Database,
  entidade_id: number,
  ano: number,
  mes: number,
): PortfolioMetrics {
  const imoveis = consultar<{ id: number }>(
    db,
    `SELECT id FROM imoveis WHERE uso_pessoal = 0 ORDER BY id`,
  );

  const metricas: MetricaImove[] = [];
  let totalImoveis = 0;
  let valorTotalPortfolio = 0;
  let noiMensalTotal = 0;
  let noiAnualTotal = 0;
  let taxaOcupacaoTotal = 0;
  let roiMedioAnual = 0;
  let cashflowMensalTotal = 0;
  let inadimplenciaValorTotal = 0;

  if (imoveis && imoveis.length > 0) {
    for (const imove of imoveis) {
      const metrica = obterMetricaImovel(db, imove.id, entidade_id, ano, mes);

      if (metrica) {
        metricas.push(metrica);
        totalImoveis++;
        valorTotalPortfolio += metrica.valor_aquisicao;
        noiMensalTotal += metrica.noi_mensal;
        noiAnualTotal += metrica.noi_anual;
        taxaOcupacaoTotal += metrica.taxa_ocupacao;
        roiMedioAnual += metrica.roi_anual;
        cashflowMensalTotal += metrica.cashflow_mensal;
        inadimplenciaValorTotal += metrica.inadimplencia_valor;
      }
    }
  }

  const roiMedio = totalImoveis > 0 ? roiMedioAnual / totalImoveis : 0;
  const taxaOcupacaoMedia = totalImoveis > 0 ? taxaOcupacaoTotal / totalImoveis : 0;

  // Calcular inadimplência percentual média
  let inadimplenciaPercentualMedia = 0;
  if (metricas.length > 0) {
    const somaPercentuais = metricas.reduce((acc, m) => acc + m.inadimplencia_percentual, 0);
    inadimplenciaPercentualMedia = somaPercentuais / metricas.length;
  }

  return {
    total_imoveis: totalImoveis,
    valor_total: round2(valorTotalPortfolio),
    noi_mensal_total: round2(noiMensalTotal),
    noi_anual_total: round2(noiAnualTotal),
    roi_medio_anual: round2(roiMedio),
    taxa_ocupacao_media: round2(taxaOcupacaoMedia),
    cashflow_mensal_total: round2(cashflowMensalTotal),
    inadimplencia_valor_total: round2(inadimplenciaValorTotal),
    inadimplencia_percentual_media: round2(inadimplenciaPercentualMedia),
    imoveis: metricas,
  };
}
