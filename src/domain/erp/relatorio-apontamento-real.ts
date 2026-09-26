/**
 * Relatórios do Painel de Conferência (apontamentos de prestadores), reconstruídos contra o
 * schema REAL do banco contábil (contabilidade-reconstituicao/schema.sql):
 * apontamentos_diarios, historico_horarios, itens_remuneraveis, movimentacoes_financeiras e
 * fechamentos_semanais.
 *
 * Histórico: existiu um `relatorios-apontamento.ts` (removido — ver
 * docs/dominios-a-reconstruir.md, seção 8) que consultava 7 tabelas fictícias
 * (apontamentos_urgencia, apontamentos_airbnb, apontamentos_combustivel, apontamentos_horas,
 * emprestimos_parcelas, memorias_reajuste, reembolsos) que nunca existiram no schema. Este
 * módulo reaproveita só a COMPOSIÇÃO dos relatórios daquele arquivo (resumo de apontamentos,
 * despesas de remuneração, comparativo entre prestadores) — a leitura de dado é inteiramente
 * nova, contra as tabelas reais.
 *
 * Não existe tabela real de "reembolsos" — o equivalente no schema real é o status de
 * pagamento: fechamentos_semanais (aberto/fechado/aprovado/pago) e movimentacoes_financeiras
 * (vale/empréstimo/adiantamento, pendente/aprovado/descontado/rejeitado). O quarto relatório
 * deste módulo (relatorioStatusPagamento) cobre esse caso de uso com dado real, no lugar do
 * relatório de reembolsos fictício.
 */
import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import { calcularHoras } from "../apontamentos/apontamentoUtils";
import type { StatusApontamento, TipoApontamento } from "../apontamentos";

export interface FiltrosRelatorioApontamento {
  data_inicio?: string; // YYYY-MM-DD, inclusive
  data_fim?: string; // YYYY-MM-DD, inclusive
  prestador_id?: number;
}

function condicoesPeriodo(
  filtros: FiltrosRelatorioApontamento,
  colunaData: string,
  colunaPrestador: string,
): { where: string; params: (string | number)[] } {
  const condicoes: string[] = [];
  const params: (string | number)[] = [];

  if (filtros.data_inicio) {
    condicoes.push(`${colunaData} >= ?`);
    params.push(filtros.data_inicio);
  }
  if (filtros.data_fim) {
    condicoes.push(`${colunaData} <= ?`);
    params.push(filtros.data_fim);
  }
  if (filtros.prestador_id) {
    condicoes.push(`${colunaPrestador} = ?`);
    params.push(filtros.prestador_id);
  }

  return { where: condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "", params };
}

/** itens_remuneraveis.tipo (schema real) → chave do totalizador por rubrica deste módulo.
 * Mesmo mapeamento usado em painelConferenciaRepo.ts, para as duas telas falarem o mesmo
 * vocabulário. */
const TIPO_ITEM_PARA_CHAVE: Record<string, keyof TotaisPorTipo> = {
  diaria: "diaria",
  airbnb: "airbnb",
  urgencia: "urgencia",
  deslocamento: "deslocamento",
  materiais: "materiais",
  extra: "extra",
};

interface TotaisPorTipo {
  diaria: number;
  airbnb: number;
  urgencia: number;
  deslocamento: number;
  materiais: number;
  extra: number;
}

function totaisPorTipoVazio(): TotaisPorTipo {
  return { diaria: 0, airbnb: 0, urgencia: 0, deslocamento: 0, materiais: 0, extra: 0 };
}

// ===================================================================================
// Relatório 1: Resumo de Apontamentos
// ===================================================================================

export interface ResumoApontamentosPrestador {
  prestador_id: number;
  prestador_nome: string;
  total_apontamentos: number;
  horas_apontadas: number;
  valor_por_tipo: TotaisPorTipo;
  valor_total: number;
  por_status: Record<StatusApontamento, number>;
}

export interface ResumoApontamentos {
  periodo_inicio: string;
  periodo_fim: string;
  prestadores_ativos: number;
  total_apontamentos: number;
  horas_totais: number;
  valor_total_geral: number;
  por_prestador: ResumoApontamentosPrestador[];
}

interface ApontamentoBaseRow {
  id: number;
  prestador_id: number;
  prestador_nome: string;
  entrada: string;
  saida_intervalo: string | null;
  retorno_intervalo: string | null;
  saida_final: string;
  status: string;
}

/** Horas de um apontamento a partir dos horários brutos. Um apontamento em rascunho pode ter
 * entrada/saida_final ainda vazios (ver `criarApontamento` em apontamento-prestador.ts) —
 * calcularHoras quebraria tentando fazer split(":") de string vazia, então isso conta como
 * 0h em vez de propagar um erro que não é responsabilidade deste relatório resolver. */
function horasDoApontamento(linha: ApontamentoBaseRow): number {
  if (!linha.entrada || !linha.saida_final) return 0;
  try {
    return calcularHoras(linha.entrada, linha.saida_final, linha.saida_intervalo ?? undefined, linha.retorno_intervalo ?? undefined);
  } catch {
    return 0;
  }
}

function buscarApontamentosBase(db: Database, filtros: FiltrosRelatorioApontamento): ApontamentoBaseRow[] {
  const { where, params } = condicoesPeriodo(filtros, "ad.data", "ad.prestador_id");
  return consultar<ApontamentoBaseRow>(
    db,
    `SELECT ad.id, ad.prestador_id, p.nome AS prestador_nome, ad.entrada, ad.saida_intervalo,
            ad.retorno_intervalo, ad.saida_final, ad.status
     FROM apontamentos_diarios ad
     JOIN prestadores p ON p.id = ad.prestador_id
     ${where}
     ORDER BY ad.prestador_id, ad.data`,
    params,
  );
}

interface ItemPorApontamentoRow {
  apontamento_id: number;
  tipo: string;
  total: number;
}

/** valor_final de itens_remuneraveis agregado por apontamento+tipo, restrito aos apontamentos
 * que já passaram pelo filtro de período/prestador (join com apontamentos_diarios de novo,
 * para não somar itens de apontamentos fora do período). */
function buscarItensPorApontamento(db: Database, filtros: FiltrosRelatorioApontamento): ItemPorApontamentoRow[] {
  const { where, params } = condicoesPeriodo(filtros, "ad.data", "ad.prestador_id");
  return consultar<ItemPorApontamentoRow>(
    db,
    `SELECT ir.apontamento_id AS apontamento_id, ir.tipo AS tipo, SUM(ir.valor_final) AS total
     FROM itens_remuneraveis ir
     JOIN apontamentos_diarios ad ON ad.id = ir.apontamento_id
     ${where}
     GROUP BY ir.apontamento_id, ir.tipo`,
    params,
  );
}

const STATUS_APONTAMENTO_VAZIO = (): Record<StatusApontamento, number> => ({
  rascunho: 0,
  enviado: 0,
  aprovado: 0,
  retificado: 0,
  rejeitado: 0,
});

export function relatorioResumoApontamentos(db: Database, filtros: FiltrosRelatorioApontamento = {}): ResumoApontamentos {
  const apontamentos = buscarApontamentosBase(db, filtros);
  const itens = buscarItensPorApontamento(db, filtros);

  const valorPorApontamento = new Map<number, TotaisPorTipo>();
  for (const item of itens) {
    const chave = TIPO_ITEM_PARA_CHAVE[item.tipo];
    if (!chave) continue; // tipo fora do vocabulário conhecido (schema evoluiu) — ignora em vez de quebrar
    const atual = valorPorApontamento.get(item.apontamento_id) ?? totaisPorTipoVazio();
    atual[chave] += item.total;
    valorPorApontamento.set(item.apontamento_id, atual);
  }

  const porPrestador = new Map<number, ResumoApontamentosPrestador>();
  for (const apontamento of apontamentos) {
    let entrada = porPrestador.get(apontamento.prestador_id);
    if (!entrada) {
      entrada = {
        prestador_id: apontamento.prestador_id,
        prestador_nome: apontamento.prestador_nome,
        total_apontamentos: 0,
        horas_apontadas: 0,
        valor_por_tipo: totaisPorTipoVazio(),
        valor_total: 0,
        por_status: STATUS_APONTAMENTO_VAZIO(),
      };
      porPrestador.set(apontamento.prestador_id, entrada);
    }

    entrada.total_apontamentos += 1;
    entrada.horas_apontadas += horasDoApontamento(apontamento);
    if (apontamento.status in entrada.por_status) {
      entrada.por_status[apontamento.status as StatusApontamento] += 1;
    }

    const valores = valorPorApontamento.get(apontamento.id);
    if (valores) {
      for (const chave of Object.keys(valores) as (keyof TotaisPorTipo)[]) {
        entrada.valor_por_tipo[chave] += valores[chave];
        entrada.valor_total += valores[chave];
      }
    }
  }

  const porPrestadorLista = Array.from(porPrestador.values()).sort((a, b) => b.valor_total - a.valor_total);

  return {
    periodo_inicio: filtros.data_inicio ?? "",
    periodo_fim: filtros.data_fim ?? "",
    prestadores_ativos: porPrestadorLista.length,
    total_apontamentos: apontamentos.length,
    horas_totais: porPrestadorLista.reduce((soma, p) => soma + p.horas_apontadas, 0),
    valor_total_geral: porPrestadorLista.reduce((soma, p) => soma + p.valor_total, 0),
    por_prestador: porPrestadorLista,
  };
}

// ===================================================================================
// Relatório 2: Despesas de Remuneração
// ===================================================================================

export interface DespesaRemuneracaoLinha {
  data: string;
  prestador_nome: string;
  rubrica: string;
  valor: number;
}

export interface DespesasRemuneracaoTipo {
  valor: number;
  percentual: number; // 0-100
  quantidade: number;
  detalhamento: DespesaRemuneracaoLinha[];
}

export interface DespesasRemuneracao {
  periodo_inicio: string;
  periodo_fim: string;
  total_geral: number;
  por_tipo: Record<keyof TotaisPorTipo, DespesasRemuneracaoTipo>;
}

interface ItemDetalhadoRow {
  data: string;
  prestador_nome: string;
  tipo: string;
  rubrica: string;
  valor_final: number;
}

export function relatorioDespesasRemuneracao(db: Database, filtros: FiltrosRelatorioApontamento = {}): DespesasRemuneracao {
  const { where, params } = condicoesPeriodo(filtros, "ad.data", "ad.prestador_id");
  const itens = consultar<ItemDetalhadoRow>(
    db,
    `SELECT ad.data AS data, p.nome AS prestador_nome, ir.tipo AS tipo, ir.rubrica AS rubrica, ir.valor_final AS valor_final
     FROM itens_remuneraveis ir
     JOIN apontamentos_diarios ad ON ad.id = ir.apontamento_id
     JOIN prestadores p ON p.id = ad.prestador_id
     ${where}
     ORDER BY ad.data`,
    params,
  );

  const porTipo: Record<keyof TotaisPorTipo, DespesasRemuneracaoTipo> = {
    diaria: { valor: 0, percentual: 0, quantidade: 0, detalhamento: [] },
    airbnb: { valor: 0, percentual: 0, quantidade: 0, detalhamento: [] },
    urgencia: { valor: 0, percentual: 0, quantidade: 0, detalhamento: [] },
    deslocamento: { valor: 0, percentual: 0, quantidade: 0, detalhamento: [] },
    materiais: { valor: 0, percentual: 0, quantidade: 0, detalhamento: [] },
    extra: { valor: 0, percentual: 0, quantidade: 0, detalhamento: [] },
  };

  for (const item of itens) {
    const chave = TIPO_ITEM_PARA_CHAVE[item.tipo];
    if (!chave) continue;
    porTipo[chave].valor += item.valor_final;
    porTipo[chave].quantidade += 1;
    porTipo[chave].detalhamento.push({
      data: item.data,
      prestador_nome: item.prestador_nome,
      rubrica: item.rubrica,
      valor: item.valor_final,
    });
  }

  const totalGeral = Object.values(porTipo).reduce((soma, t) => soma + t.valor, 0);
  for (const tipo of Object.values(porTipo)) {
    tipo.percentual = totalGeral > 0 ? (tipo.valor / totalGeral) * 100 : 0;
  }

  return {
    periodo_inicio: filtros.data_inicio ?? "",
    periodo_fim: filtros.data_fim ?? "",
    total_geral: totalGeral,
    por_tipo: porTipo,
  };
}

// ===================================================================================
// Relatório 3: Comparativo entre Prestadores
// ===================================================================================

export interface ComparativoPrestadorLinha {
  prestador_id: number;
  prestador_nome: string;
  total_apontamentos: number;
  horas_apontadas: number;
  valor_total: number;
  valor_medio_apontamento: number;
  valor_por_hora: number | null; // null quando não há horas apontadas (evita divisão por zero silenciosa)
  taxa_retificacao: number; // 0-100: % dos apontamentos que foram retificados
}

export interface ComparativoPrestadores {
  periodo_inicio: string;
  periodo_fim: string;
  prestadores: ComparativoPrestadorLinha[];
  agregados: {
    prestador_mais_ativo: { nome: string; total_apontamentos: number } | null;
    prestador_maior_valor: { nome: string; valor_total: number } | null;
    prestador_maior_valor_hora: { nome: string; valor_por_hora: number } | null;
  };
}

export function relatorioComparativoPrestadores(db: Database, filtros: FiltrosRelatorioApontamento = {}): ComparativoPrestadores {
  const resumo = relatorioResumoApontamentos(db, filtros);

  const prestadores: ComparativoPrestadorLinha[] = resumo.por_prestador.map((p) => {
    const totalRetificado = p.por_status.retificado;
    const valorPorHora = p.horas_apontadas > 0 ? p.valor_total / p.horas_apontadas : null;
    return {
      prestador_id: p.prestador_id,
      prestador_nome: p.prestador_nome,
      total_apontamentos: p.total_apontamentos,
      horas_apontadas: p.horas_apontadas,
      valor_total: p.valor_total,
      valor_medio_apontamento: p.total_apontamentos > 0 ? p.valor_total / p.total_apontamentos : 0,
      valor_por_hora: valorPorHora,
      taxa_retificacao: p.total_apontamentos > 0 ? (totalRetificado / p.total_apontamentos) * 100 : 0,
    };
  });

  const maisAtivo = prestadores.length
    ? prestadores.reduce((a, b) => (b.total_apontamentos > a.total_apontamentos ? b : a))
    : null;
  const maiorValor = prestadores.length ? prestadores.reduce((a, b) => (b.valor_total > a.valor_total ? b : a)) : null;
  const comHoras = prestadores.filter((p) => p.valor_por_hora !== null);
  const maiorValorHora = comHoras.length
    ? comHoras.reduce((a, b) => ((b.valor_por_hora as number) > (a.valor_por_hora as number) ? b : a))
    : null;

  return {
    periodo_inicio: filtros.data_inicio ?? "",
    periodo_fim: filtros.data_fim ?? "",
    prestadores,
    agregados: {
      prestador_mais_ativo: maisAtivo ? { nome: maisAtivo.prestador_nome, total_apontamentos: maisAtivo.total_apontamentos } : null,
      prestador_maior_valor: maiorValor ? { nome: maiorValor.prestador_nome, valor_total: maiorValor.valor_total } : null,
      prestador_maior_valor_hora: maiorValorHora
        ? { nome: maiorValorHora.prestador_nome, valor_por_hora: maiorValorHora.valor_por_hora as number }
        : null,
    },
  };
}

// ===================================================================================
// Relatório 4: Status de Pagamento (fechamentos semanais + movimentações financeiras)
// ===================================================================================

export interface StatusFechamentosPrestador {
  quantidade_por_status: Record<string, number>; // aberto | fechado | aprovado | pago
  valor_bruto_total: number;
  valor_liquido_total: number;
  valor_pendente_pagamento: number; // soma de valor_liquido de fechamentos com status != 'pago'
}

export interface StatusMovimentacoesPrestador {
  quantidade_por_status: Record<string, number>; // pendente | aprovado | descontado | rejeitado
  valor_por_tipo: Record<string, number>; // vale | emprestimo | adiantamento
  valor_pendente_aprovacao: number;
}

export interface StatusPagamentoPrestador {
  prestador_id: number;
  prestador_nome: string;
  fechamentos: StatusFechamentosPrestador;
  movimentacoes: StatusMovimentacoesPrestador;
}

export interface StatusPagamento {
  periodo_inicio: string;
  periodo_fim: string;
  prestadores: StatusPagamentoPrestador[];
  totalizadores: {
    valor_pendente_pagamento_total: number;
    valor_pendente_aprovacao_total: number;
  };
}

interface FechamentoStatusRow {
  prestador_id: number;
  prestador_nome: string;
  status: string;
  valor_bruto: number;
  valor_liquido: number;
}

interface MovimentacaoStatusRow {
  prestador_id: number;
  prestador_nome: string;
  tipo: string;
  status: string;
  valor: number;
}

export function relatorioStatusPagamento(db: Database, filtros: FiltrosRelatorioApontamento = {}): StatusPagamento {
  const condFechamentos = condicoesPeriodo(filtros, "fs.data_inicio", "fs.prestador_id");
  const fechamentos = consultar<FechamentoStatusRow>(
    db,
    `SELECT fs.prestador_id AS prestador_id, p.nome AS prestador_nome, fs.status AS status,
            fs.valor_bruto AS valor_bruto, fs.valor_liquido AS valor_liquido
     FROM fechamentos_semanais fs
     JOIN prestadores p ON p.id = fs.prestador_id
     ${condFechamentos.where}`,
    condFechamentos.params,
  );

  // movimentacoes_financeiras não tem prestador_id direto — vem de apontamentos_diarios.
  const condMov = condicoesPeriodo(filtros, "mf.data_solicitacao", "ad.prestador_id");
  const movimentacoes = consultar<MovimentacaoStatusRow>(
    db,
    `SELECT ad.prestador_id AS prestador_id, p.nome AS prestador_nome, mf.tipo AS tipo, mf.status AS status, mf.valor AS valor
     FROM movimentacoes_financeiras mf
     JOIN apontamentos_diarios ad ON ad.id = mf.apontamento_id
     JOIN prestadores p ON p.id = ad.prestador_id
     ${condMov.where}`,
    condMov.params,
  );

  const porPrestador = new Map<number, StatusPagamentoPrestador>();
  const obterEntrada = (prestador_id: number, prestador_nome: string): StatusPagamentoPrestador => {
    let entrada = porPrestador.get(prestador_id);
    if (!entrada) {
      entrada = {
        prestador_id,
        prestador_nome,
        fechamentos: {
          quantidade_por_status: { aberto: 0, fechado: 0, aprovado: 0, pago: 0 },
          valor_bruto_total: 0,
          valor_liquido_total: 0,
          valor_pendente_pagamento: 0,
        },
        movimentacoes: {
          quantidade_por_status: { pendente: 0, aprovado: 0, descontado: 0, rejeitado: 0 },
          valor_por_tipo: { vale: 0, emprestimo: 0, adiantamento: 0 },
          valor_pendente_aprovacao: 0,
        },
      };
      porPrestador.set(prestador_id, entrada);
    }
    return entrada;
  };

  for (const linha of fechamentos) {
    const entrada = obterEntrada(linha.prestador_id, linha.prestador_nome);
    entrada.fechamentos.quantidade_por_status[linha.status] = (entrada.fechamentos.quantidade_por_status[linha.status] ?? 0) + 1;
    entrada.fechamentos.valor_bruto_total += linha.valor_bruto;
    entrada.fechamentos.valor_liquido_total += linha.valor_liquido;
    if (linha.status !== "pago") {
      entrada.fechamentos.valor_pendente_pagamento += linha.valor_liquido;
    }
  }

  for (const linha of movimentacoes) {
    const entrada = obterEntrada(linha.prestador_id, linha.prestador_nome);
    entrada.movimentacoes.quantidade_por_status[linha.status] = (entrada.movimentacoes.quantidade_por_status[linha.status] ?? 0) + 1;
    entrada.movimentacoes.valor_por_tipo[linha.tipo] = (entrada.movimentacoes.valor_por_tipo[linha.tipo] ?? 0) + linha.valor;
    if (linha.status === "pendente") {
      entrada.movimentacoes.valor_pendente_aprovacao += linha.valor;
    }
  }

  const prestadores = Array.from(porPrestador.values()).sort(
    (a, b) => b.fechamentos.valor_pendente_pagamento - a.fechamentos.valor_pendente_pagamento,
  );

  return {
    periodo_inicio: filtros.data_inicio ?? "",
    periodo_fim: filtros.data_fim ?? "",
    prestadores,
    totalizadores: {
      valor_pendente_pagamento_total: prestadores.reduce((soma, p) => soma + p.fechamentos.valor_pendente_pagamento, 0),
      valor_pendente_aprovacao_total: prestadores.reduce((soma, p) => soma + p.movimentacoes.valor_pendente_aprovacao, 0),
    },
  };
}
