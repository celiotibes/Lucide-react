/**
 * Calculadora de viabilidade para projetos de EXPANSÃO/AMPLIAÇÃO (ex: construir mais
 * kitnets, ampliar um imóvel já existente, ou erguer uma unidade nova hipotética).
 *
 * DECISÃO DO USUÁRIO (2026-09-29): o sistema NÃO tem e não deve inventar nenhuma base de
 * custo de construção (m², CUB regional, tabela de insumos etc.) — o usuário entra
 * manualmente com a estimativa de custo de obra e de receita/despesa adicional esperada
 * (`projetos_expansao`, preenchido por fora deste módulo, nesta mesma tabela). Este arquivo
 * só CALCULA os indicadores de viabilidade a partir do que foi informado — nunca estima ou
 * corrige o custo de obra em si.
 *
 * CONSISTÊNCIA DE FÓRMULA — mesma família de indicadores de `patrimonio/indicadoresHistorico.ts`
 * (Payback simples, Yield, DSCR), aplicados aqui a um PROJETO HIPOTÉTICO (ainda não é um
 * imóvel cadastrado) em vez de a um imóvel já existente:
 *   - Payback simples aqui = custo de obra ÷ fluxo de caixa líquido mensal do projeto × 12,
 *     mesma lógica de `calcularPaybackSimples` (valor investido ÷ retorno anual), mas com
 *     "fluxo de caixa líquido mensal do projeto" (receita adicional − despesa adicional,
 *     informado pelo usuário) no lugar do NOI anual apurado no razão.
 *   - Yield anual aqui = retorno anual do projeto ÷ custo de obra × 100, mesma fórmula de
 *     `calcularYieldLiquido` (NOI anual ÷ valor de aquisição × 100), com o custo de obra no
 *     lugar do valor de aquisição.
 * Quando o projeto está vinculado a um imóvel já cadastrado (`imovel_id` preenchido), a
 * comparação com o indicador do imóvel existente REAPROVEITA
 * `calcularIndicadoresHistoricoPortfolio` (chamando-a, não duplicando a fórmula) — ver
 * `compararComImovelExistente` abaixo.
 *
 * Status do projeto (`status`): ciclo rascunho → em_analise → aprovado, com "descartado"
 * alcançável de qualquer estado não-terminal. `aprovado` e `descartado` são terminais.
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { calcularIndicadoresHistoricoPortfolio, type IndicadorNumerico } from "../patrimonio/indicadoresHistorico";

function round2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

// ============================================================================
// TIPOS
// ============================================================================

export type StatusProjetoExpansao = "rascunho" | "em_analise" | "aprovado" | "descartado";

const STATUS_VALIDOS: StatusProjetoExpansao[] = ["rascunho", "em_analise", "aprovado", "descartado"];

export interface ProjetoExpansao {
  id: number;
  imovel_id: number | null;
  descricao: string;
  custo_obra_estimado: number;
  receita_adicional_mensal_estimada: number;
  despesa_adicional_mensal_estimada: number;
  data_estimativa: string;
  status: StatusProjetoExpansao;
  observacoes: string | null;
  criado_em: string;
}

export interface NovoProjetoExpansao {
  imovelId?: number | null;
  descricao: string;
  custoObraEstimado: number;
  receitaAdicionalMensalEstimada: number;
  /** Padrão 0 quando omitido — mesmo default da coluna no schema. */
  despesaAdicionalMensalEstimada?: number;
  dataEstimativa: string;
  observacoes?: string | null;
}

/** Comparação do projeto de expansão contra o imóvel já cadastrado a que está vinculado
 * (`imovel_id`), quando existir. `null` quando o projeto é uma unidade nova hipotética
 * (`imovel_id` null) — não há imóvel existente com que comparar. */
export interface ComparacaoComImovelExistente {
  imovelId: number;
  apelido: string;
  /** Yield líquido do imóvel existente — vem de `calcularIndicadoresHistoricoPortfolio`
   * (patrimonio/indicadoresHistorico.ts), sem recalcular a fórmula aqui. */
  yieldLiquidoImovelExistente: IndicadorNumerico;
  /** yieldAnualProjeto − yieldLiquidoImovelExistente, em pontos percentuais. `null` quando
   * o imóvel existente não tem yield líquido apurável (ver `motivoNulo` do indicador acima). */
  diferencaPontosPercentuais: number | null;
  /** `null` quando a diferença não pôde ser calculada (ver `diferencaPontosPercentuais`). */
  avaliacao: "melhor" | "pior" | "parecido" | null;
  motivoNulo?: string;
}

export interface ViabilidadeProjetoExpansao {
  projetoId: number;
  descricao: string;
  status: StatusProjetoExpansao;
  imovelId: number | null;
  custoObraEstimado: number;
  receitaAdicionalMensalEstimada: number;
  despesaAdicionalMensalEstimada: number;
  fluxoCaixaLiquidoMensal: IndicadorNumerico;
  paybackSimplesAnos: IndicadorNumerico;
  yieldAnual: IndicadorNumerico;
  roiAcumulado5Anos: IndicadorNumerico;
  roiAcumulado10Anos: IndicadorNumerico;
  comparacaoComImovelExistente: ComparacaoComImovelExistente | null;
}

// ============================================================================
// CRIAÇÃO E LISTAGEM
// ============================================================================

function validarNovoProjeto(dados: NovoProjetoExpansao): void {
  if (!dados.descricao || !dados.descricao.trim()) {
    throw new Error("Descrição do projeto de expansão é obrigatória.");
  }
  if (!Number.isFinite(dados.custoObraEstimado) || dados.custoObraEstimado <= 0) {
    throw new Error("Custo de obra estimado deve ser um número maior que zero.");
  }
  if (!Number.isFinite(dados.receitaAdicionalMensalEstimada) || dados.receitaAdicionalMensalEstimada < 0) {
    throw new Error("Receita adicional mensal estimada deve ser um número maior ou igual a zero.");
  }
  const despesa = dados.despesaAdicionalMensalEstimada ?? 0;
  if (!Number.isFinite(despesa) || despesa < 0) {
    throw new Error("Despesa adicional mensal estimada deve ser um número maior ou igual a zero.");
  }
  if (!dados.dataEstimativa || !/^\d{4}-\d{2}-\d{2}$/.test(dados.dataEstimativa)) {
    throw new Error("Data da estimativa é obrigatória e deve estar no formato AAAA-MM-DD.");
  }
}

/** Cria um projeto de expansão, sempre em status inicial 'rascunho' (schema:
 * `projetos_expansao.status DEFAULT 'rascunho'`). Se `imovelId` for informado, valida que o
 * imóvel existe — `imovel_id` é opcional (NULL = unidade nova hipotética, não ampliação de
 * imóvel existente). Retorna o id do projeto criado. */
export function criarProjetoExpansao(db: Database, dados: NovoProjetoExpansao): number {
  validarNovoProjeto(dados);

  const imovelId = dados.imovelId ?? null;
  if (imovelId !== null) {
    const [imovel] = consultar<{ id: number }>(db, "SELECT id FROM imoveis WHERE id = ?", [imovelId]);
    if (!imovel) {
      throw new Error(`Imóvel ${imovelId} não encontrado — não é possível vincular o projeto de expansão a ele.`);
    }
  }

  executar(
    db,
    `INSERT INTO projetos_expansao
       (imovel_id, descricao, custo_obra_estimado, receita_adicional_mensal_estimada,
        despesa_adicional_mensal_estimada, data_estimativa, status, observacoes)
     VALUES (?, ?, ?, ?, ?, ?, 'rascunho', ?)`,
    [
      imovelId,
      dados.descricao.trim(),
      dados.custoObraEstimado,
      dados.receitaAdicionalMensalEstimada,
      dados.despesaAdicionalMensalEstimada ?? 0,
      dados.dataEstimativa,
      dados.observacoes?.trim() || null,
    ],
  );

  const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id");
  return id;
}

/** Transições de status permitidas — grafo fixo, sem atalho: rascunho → em_analise →
 * aprovado, e qualquer estado NÃO-terminal (rascunho, em_analise) → descartado a qualquer
 * momento. `aprovado` e `descartado` são terminais: nenhuma transição sai deles. */
const TRANSICOES_PERMITIDAS: Record<StatusProjetoExpansao, StatusProjetoExpansao[]> = {
  rascunho: ["em_analise", "descartado"],
  em_analise: ["aprovado", "descartado"],
  aprovado: [],
  descartado: [],
};

/** Atualiza o status do projeto, validando a transição contra `TRANSICOES_PERMITIDAS`.
 * Lança erro claro tanto para status inválido (fora do enum do schema) quanto para
 * transição não permitida (incluindo tentar sair de um estado terminal). */
export function atualizarStatusProjeto(db: Database, id: number, novoStatus: StatusProjetoExpansao): void {
  if (!STATUS_VALIDOS.includes(novoStatus)) {
    throw new Error(`Status "${novoStatus}" inválido — use um de: ${STATUS_VALIDOS.join(", ")}.`);
  }

  const [projeto] = consultar<{ status: StatusProjetoExpansao }>(db, "SELECT status FROM projetos_expansao WHERE id = ?", [id]);
  if (!projeto) {
    throw new Error(`Projeto de expansão ${id} não encontrado.`);
  }

  const statusAtual = projeto.status;
  if (statusAtual === "aprovado" || statusAtual === "descartado") {
    throw new Error(`Projeto ${id} está em status terminal "${statusAtual}" — não aceita nova transição de status.`);
  }
  const permitidos = TRANSICOES_PERMITIDAS[statusAtual];
  if (!permitidos.includes(novoStatus)) {
    throw new Error(
      `Transição de status inválida: "${statusAtual}" → "${novoStatus}". A partir de "${statusAtual}" só é permitido ir para: ${
        permitidos.length > 0 ? permitidos.join(", ") : "(nenhum — estado terminal)"
      }.`,
    );
  }

  executar(db, "UPDATE projetos_expansao SET status = ? WHERE id = ?", [novoStatus, id]);
}

export interface FiltrosProjetosExpansao {
  status?: StatusProjetoExpansao;
  imovelId?: number | null;
}

/** Lista projetos de expansão, mais recentes primeiro (por `criado_em`, desempate por `id`),
 * com filtro opcional por status e/ou imóvel vinculado (`imovelId: null` filtra explicitamente
 * as unidades novas hipotéticas, sem imóvel vinculado). */
export function listarProjetosExpansao(db: Database, filtros?: FiltrosProjetosExpansao): ProjetoExpansao[] {
  const condicoes: string[] = [];
  const params: (string | number | null)[] = [];

  if (filtros?.status !== undefined) {
    condicoes.push("status = ?");
    params.push(filtros.status);
  }
  if (filtros?.imovelId !== undefined) {
    if (filtros.imovelId === null) {
      condicoes.push("imovel_id IS NULL");
    } else {
      condicoes.push("imovel_id = ?");
      params.push(filtros.imovelId);
    }
  }

  const where = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";
  return consultar<ProjetoExpansao>(
    db,
    `SELECT * FROM projetos_expansao ${where} ORDER BY criado_em DESC, id DESC`,
    params,
  );
}

// ============================================================================
// INDICADORES DE VIABILIDADE — funções puras, testáveis com números conhecidos
// ============================================================================

const FONTE_PROJETO =
  "Custo de obra e receita/despesa adicional mensal: projetos_expansao, estimativas informadas manualmente pelo usuário (o sistema não infere nem corrige nenhum valor de custo de construção).";

/** Fluxo de caixa líquido mensal do projeto = receita adicional mensal − despesa adicional
 * mensal (ambas estimadas pelo usuário em `projetos_expansao`). Sempre calculável (nunca
 * `null`) — pode ser negativo. */
export function calcularFluxoCaixaLiquidoMensal(receitaAdicionalMensal: number, despesaAdicionalMensal: number): IndicadorNumerico {
  return {
    valor: round2(receitaAdicionalMensal - despesaAdicionalMensal),
    formula: "Fluxo de caixa líquido mensal do projeto = receita adicional mensal estimada − despesa adicional mensal estimada",
    fonteDados: FONTE_PROJETO,
  };
}

/** Payback simples (anos) = custo de obra ÷ (fluxo de caixa líquido mensal do projeto × 12).
 * `× 12` primeiro anualiza o fluxo mensal (mesma base "anual" usada por Yield anual e ROI
 * acumulado abaixo, e pela mesma fórmula de `calcularPaybackSimples` de
 * `patrimonio/indicadoresHistorico.ts`: valor investido ÷ retorno ANUAL) — daí o resultado
 * já sair direto em anos, sem precisar de nova conversão. `null` quando o fluxo mensal não é
 * positivo — o projeto, pelas estimativas informadas, não se paga pela própria operação. */
export function calcularPaybackSimplesProjeto(custoObraEstimado: number, fluxoCaixaLiquidoMensal: number): IndicadorNumerico {
  const base: Omit<IndicadorNumerico, "valor" | "motivoNulo"> = {
    formula: "Payback simples (anos) = custo de obra estimado ÷ (fluxo de caixa líquido mensal do projeto × 12)",
    fonteDados: FONTE_PROJETO,
  };
  if (fluxoCaixaLiquidoMensal <= 0) {
    return { ...base, valor: null, motivoNulo: "projeto não gera fluxo positivo" };
  }
  return { ...base, valor: round2(custoObraEstimado / (fluxoCaixaLiquidoMensal * 12)) };
}

/** Yield anual do investimento adicional = (fluxo de caixa líquido mensal × 12) ÷ custo de
 * obra × 100. `custo_obra_estimado` é sempre > 0 (CHECK do schema), então nunca há divisão
 * por zero — o valor pode ser negativo quando o fluxo mensal é negativo. */
export function calcularYieldAnualProjeto(custoObraEstimado: number, fluxoCaixaLiquidoMensal: number): IndicadorNumerico {
  return {
    valor: round2(((fluxoCaixaLiquidoMensal * 12) / custoObraEstimado) * 100),
    formula: "Yield anual do investimento adicional = (fluxo de caixa líquido mensal do projeto × 12) ÷ custo de obra estimado × 100",
    fonteDados: FONTE_PROJETO,
  };
}

/** ROI acumulado em N anos = (fluxo de caixa líquido mensal × 12 × N − custo de obra) ÷
 * custo de obra × 100 — mostra quando o investimento "vira" positivo líquido do capital
 * investido (ROI ≥ 0% é o ponto em que o fluxo acumulado já superou o custo de obra). */
export function calcularRoiAcumuladoProjeto(custoObraEstimado: number, fluxoCaixaLiquidoMensal: number, anos: number): IndicadorNumerico {
  return {
    valor: round2(((fluxoCaixaLiquidoMensal * 12 * anos - custoObraEstimado) / custoObraEstimado) * 100),
    formula: `ROI acumulado em ${anos} anos = (fluxo de caixa líquido mensal do projeto × 12 × ${anos} − custo de obra estimado) ÷ custo de obra estimado × 100`,
    fonteDados: FONTE_PROJETO,
  };
}

/** Diferença considerada "parecida" (não melhor nem pior) entre o yield anual do projeto e o
 * yield líquido do imóvel existente, em pontos percentuais — faixa de indiferença para não
 * rotular como "melhor"/"pior" uma diferença pequena demais para ser decisiva. */
const FAIXA_PARECIDO_PP = 1;

/** Compara o yield anual do projeto de expansão com o yield líquido do imóvel já cadastrado a
 * que está vinculado (`imovel_id`) — REAPROVEITA `calcularIndicadoresHistoricoPortfolio`
 * (patrimonio/indicadoresHistorico.ts) para obter o yield líquido do imóvel existente, sem
 * duplicar a fórmula aqui. */
function compararComImovelExistente(db: Database, imovelId: number, yieldAnualProjeto: number): ComparacaoComImovelExistente {
  const portfolio = calcularIndicadoresHistoricoPortfolio(db);
  const linhaImovel = portfolio.imoveis.find((i) => i.imovelId === imovelId);

  if (!linhaImovel) {
    return {
      imovelId,
      apelido: "—",
      yieldLiquidoImovelExistente: {
        valor: null,
        formula: "Yield líquido = NOI anual (receita de aluguel − despesas operacionais) ÷ valor de aquisição × 100",
        fonteDados: "patrimonio/indicadoresHistorico.ts (calcularIndicadoresHistoricoPortfolio)",
      },
      diferencaPontosPercentuais: null,
      avaliacao: null,
      motivoNulo: "Imóvel vinculado não está no portfólio de investimento (uso_pessoal = 0) apurado por indicadoresHistorico.ts — comparação indisponível.",
    };
  }

  const yieldExistente = linhaImovel.yieldLiquido;
  if (yieldExistente.valor === null) {
    return {
      imovelId,
      apelido: linhaImovel.apelido,
      yieldLiquidoImovelExistente: yieldExistente,
      diferencaPontosPercentuais: null,
      avaliacao: null,
      motivoNulo: yieldExistente.motivoNulo ?? "Yield líquido do imóvel existente indisponível — comparação indefinida.",
    };
  }

  const diferenca = round2(yieldAnualProjeto - yieldExistente.valor);
  const avaliacao: "melhor" | "pior" | "parecido" = diferenca > FAIXA_PARECIDO_PP ? "melhor" : diferenca < -FAIXA_PARECIDO_PP ? "pior" : "parecido";

  return {
    imovelId,
    apelido: linhaImovel.apelido,
    yieldLiquidoImovelExistente: yieldExistente,
    diferencaPontosPercentuais: diferenca,
    avaliacao,
  };
}

/** Calcula todos os indicadores de viabilidade de um projeto de expansão, a partir das
 * estimativas informadas pelo usuário (`projetos_expansao`) — o sistema não corrige nem
 * completa nenhuma delas. Quando `imovel_id` está preenchido, inclui a comparação com o
 * yield líquido do imóvel já existente (ver `compararComImovelExistente`). */
export function calcularViabilidadeProjeto(db: Database, projetoId: number): ViabilidadeProjetoExpansao {
  const [projeto] = consultar<ProjetoExpansao>(db, "SELECT * FROM projetos_expansao WHERE id = ?", [projetoId]);
  if (!projeto) {
    throw new Error(`Projeto de expansão ${projetoId} não encontrado.`);
  }

  const fluxoCaixaLiquidoMensal = calcularFluxoCaixaLiquidoMensal(
    projeto.receita_adicional_mensal_estimada,
    projeto.despesa_adicional_mensal_estimada,
  );
  const fluxo = fluxoCaixaLiquidoMensal.valor ?? 0;

  const paybackSimplesAnos = calcularPaybackSimplesProjeto(projeto.custo_obra_estimado, fluxo);
  const yieldAnual = calcularYieldAnualProjeto(projeto.custo_obra_estimado, fluxo);
  const roiAcumulado5Anos = calcularRoiAcumuladoProjeto(projeto.custo_obra_estimado, fluxo, 5);
  const roiAcumulado10Anos = calcularRoiAcumuladoProjeto(projeto.custo_obra_estimado, fluxo, 10);

  const comparacaoComImovelExistente =
    projeto.imovel_id !== null ? compararComImovelExistente(db, projeto.imovel_id, yieldAnual.valor ?? 0) : null;

  return {
    projetoId: projeto.id,
    descricao: projeto.descricao,
    status: projeto.status,
    imovelId: projeto.imovel_id,
    custoObraEstimado: projeto.custo_obra_estimado,
    receitaAdicionalMensalEstimada: projeto.receita_adicional_mensal_estimada,
    despesaAdicionalMensalEstimada: projeto.despesa_adicional_mensal_estimada,
    fluxoCaixaLiquidoMensal,
    paybackSimplesAnos,
    yieldAnual,
    roiAcumulado5Anos,
    roiAcumulado10Anos,
    comparacaoComImovelExistente,
  };
}

/** Compara vários projetos lado a lado, ordenados por payback simples (menor primeiro) — a
 * base da priorização "qual expandir primeiro". Projetos sem payback definido (fluxo não
 * positivo, ver `calcularPaybackSimplesProjeto`) vão para o final da lista, ordenados entre
 * si por yield anual (maior primeiro) como critério secundário. */
export function compararProjetos(db: Database, projetoIds: number[]): ViabilidadeProjetoExpansao[] {
  const resultados = projetoIds.map((id) => calcularViabilidadeProjeto(db, id));

  return [...resultados].sort((a, b) => {
    const paybackA = a.paybackSimplesAnos.valor;
    const paybackB = b.paybackSimplesAnos.valor;
    if (paybackA !== null && paybackB !== null) return paybackA - paybackB;
    if (paybackA !== null) return -1; // A tem payback definido, B não → A vem primeiro
    if (paybackB !== null) return 1;
    // Nenhum dos dois tem payback definido — desempata por yield anual (maior primeiro).
    return (b.yieldAnual.valor ?? -Infinity) - (a.yieldAnual.valor ?? -Infinity);
  });
}
