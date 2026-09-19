/**
 * Relatórios de Gestão Imobiliária
 * Módulo imovel-gestao com análise de receitas, despesas, ROI e fluxo de caixa
 *
 * Relatórios implementados:
 * 1. relatorioReceitasAluguel() - Receitas por imóvel e inquilino
 * 2. relatorioDespesasOperacionais() - Despesas operacionais consolidadas
 * 3. relatorioRetornoImagem() - ROI e retorno de investimento
 * 4. relatorioComparativoPropriedades() - Desempenho comparativo entre imóveis
 * 5. relatorioManutencaoAgendada() - Manutenção preventiva e corretiva
 * 6. relatorioFluxoCaixaPropriedades() - Fluxo de caixa por imóvel
 * 7. relatorioProvisioneFuturas() - Reservas e provisões para manutenção
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";

/**
 * Builder fluente para construir relatórios imobiliários
 */
export class RelatorioImovelBuilder {
  private db: Database;
  private entidade_id: number;
  private periodo_id?: number;
  private data_inicio?: string;
  private data_fim?: string;
  private imovel_id?: number;
  private inquilino_id?: number;

  constructor(db: Database, entidade_id: number) {
    this.db = db;
    this.entidade_id = entidade_id;
  }

  comPeriodo(periodo_id: number): this {
    this.periodo_id = periodo_id;
    return this;
  }

  comImovel(imovel_id: number): this {
    this.imovel_id = imovel_id;
    return this;
  }

  comInquilino(inquilino_id: number): this {
    this.inquilino_id = inquilino_id;
    return this;
  }

  entreDataas(data_inicio: string, data_fim: string): this {
    this.data_inicio = data_inicio;
    this.data_fim = data_fim;
    return this;
  }

  build() {
    return {
      db: this.db,
      entidade_id: this.entidade_id,
      periodo_id: this.periodo_id,
      data_inicio: this.data_inicio,
      data_fim: this.data_fim,
      imovel_id: this.imovel_id,
      inquilino_id: this.inquilino_id,
    };
  }
}

// ============================================================================
// INTERFACES DE RELATÓRIOS
// ============================================================================

export interface LinhaReceitaAluguel {
  data_vencimento: string;
  inquilino_nome: string;
  cpf_cnpj?: string;
  valor_aluguel: number;
  reajuste?: number;
  total_recebido: number;
  status_pagamento: "pago" | "vencido" | "a_vencer";
}

export interface RelatorioReceitasAluguel {
  periodo: string;
  imovel_id: number;
  endereco: string;
  total_receita_aluguel: number;
  quantidade_inquilinos_ativos: number;
  receita_media_mensal: number;
  receita_minima: number;
  receita_maxima: number;
  linhas: LinhaReceitaAluguel[];
}

export interface LinhaDespesaOperacional {
  data: string;
  imovel_endereco: string;
  tipo_despesa: string;
  descricao: string;
  valor: number;
  fornecedor?: string;
  centro_custo?: string;
}

export interface RelatorioDespesasOperacionais {
  periodo: string;
  total_condominio: number;
  total_agua_esgoto: number;
  total_energia: number;
  total_internet: number;
  total_manutencao: number;
  total_seguros: number;
  total_geral: number;
  quantidade_despesas: number;
  despesa_media: number;
  despesas_por_imovel: Record<string, number>;
  linhas: LinhaDespesaOperacional[];
}

export interface RetornoImovel {
  imovel_id: number;
  endereco: string;
  valor_aquisicao: number;
  receita_anual_estimada: number;
  despesa_anual_estimada: number;
  lucro_liquido_anual: number;
  roi_percentual: number;
  periodo_payback_anos: number;
  yield_mensal: number;
  yield_anual: number;
}

export interface RelatorioRetornoImagem {
  periodo: string;
  quantidade_imoveis: number;
  roi_medio_geral: number;
  yield_medio_geral: number;
  roi_total_anual: number;
  imoveis: RetornoImovel[];
}

export interface ComparativoImovel {
  imovel_id: number;
  endereco: string;
  tipo_imovel: string;
  valor_aquisicao: number;
  valor_aluguel_mensal: number;
  despesas_mensais: number;
  margem_liquida: number;
  margem_percentual: number;
  ocupacao_percentual: number;
  roi_anual: number;
  score_performance: number;
}

export interface RelatorioComparativoPropriedades {
  periodo: string;
  quantidade_imoveis: number;
  melhor_desempenho: ComparativoImovel;
  pior_desempenho: ComparativoImovel;
  desempenho_medio: {
    valor_aluguel_medio: number;
    despesas_medias: number;
    margem_media: number;
    roi_medio: number;
  };
  imoveis: ComparativoImovel[];
}

export interface LinhaManutencao {
  data_manutencao: string;
  imovel_endereco: string;
  tipo_manutencao: string;
  descricao: string;
  valor: number;
  prestador_servico: string;
  status: "pendente" | "concluida" | "cancelada";
  dias_atraso?: number;
}

export interface RelatorioManutencaoAgendada {
  periodo: string;
  total_pendente: number;
  total_concluida: number;
  total_cancelada: number;
  custo_total_pendente: number;
  custo_total_concluido: number;
  quantidade_pendente: number;
  quantidade_concluida: number;
  linhas: LinhaManutencao[];
}

export interface FluxoCaixaPropriedade {
  imovel_id: number;
  endereco: string;
  saldo_inicial: number;
  entradas_aluguel: number;
  entradas_outras: number;
  total_entradas: number;
  saidas_despesas: number;
  saidas_manutencao: number;
  total_saidas: number;
  fluxo_liquido: number;
  saldo_final: number;
}

export interface RelatorioFluxoCaixaPropriedades {
  periodo: string;
  quantidade_imoveis: number;
  fluxo_total_geral: number;
  entradas_totais: number;
  saidas_totais: number;
  imagem: FluxoCaixaPropriedade[];
}

export interface ProvisioneFutura {
  imovel_id: number;
  endereco: string;
  reserva_manutencao: number;
  reserva_seguro: number;
  reserva_vaga: number;
  reserva_reforma: number;
  total_provisoes: number;
  percentual_receita: number;
  situacao: "adequada" | "insuficiente" | "excessiva";
}

export interface RelatorioProvisioneFuturas {
  periodo: string;
  quantidade_imoveis: number;
  provisao_total_manutencao: number;
  provisao_total_seguro: number;
  provisao_total_vaga: number;
  provisao_total_reforma: number;
  provisao_total_geral: number;
  imoveis: ProvisioneFutura[];
}

// ============================================================================
// RELATÓRIO 1: RECEITAS DE ALUGUEL
// ============================================================================

export function relatorioReceitasAluguel(
  db: Database,
  entidade_id: number,
  imovel_id: number,
  data_inicio: string,
  data_fim: string,
): RelatorioReceitasAluguel {
  // Obter dados do imóvel
  const [imovelData] = consultar<{ endereco: string }>(
    db,
    `SELECT endereco FROM imoveis WHERE id = ? AND entidade_id = ?`,
    [imovel_id, entidade_id],
  );

  if (!imovelData) {
    throw new Error(`Imóvel ${imovel_id} não encontrado`);
  }

  // Obter receitas de aluguel
  const receitas = consultar<{
    data_vencimento: string;
    inquilino_nome: string;
    cpf_cnpj?: string;
    valor_aluguel: number;
    reajuste?: number;
    total_recebido: number;
    status_pagamento: "pago" | "vencido" | "a_vencer";
  }>(
    db,
    `SELECT
       cr.data_vencimento,
       i.nome_completo as inquilino_nome,
       i.cpf as cpf_cnpj,
       cr.valor_aluguel,
       COALESCE(cr.valor_reajuste, 0) as reajuste,
       COALESCE(cr.valor_pago, cr.valor_aluguel) as total_recebido,
       CASE
         WHEN cr.data_vencimento < DATE('now') AND cr.valor_pago = 0 THEN 'vencido'
         WHEN cr.data_vencimento > DATE('now') THEN 'a_vencer'
         ELSE 'pago'
       END as status_pagamento
     FROM contratos_locacao cr
     INNER JOIN inquilinos i ON cr.inquilino_id = i.id
     WHERE cr.imovel_id = ? AND cr.entidade_id = ?
       AND cr.data_vencimento BETWEEN ? AND ?
     ORDER BY cr.data_vencimento ASC`,
    [imovel_id, entidade_id, data_inicio, data_fim],
  );

  let total_receita = 0;
  receitas.forEach((r) => {
    total_receita += r.total_recebido;
  });

  const quantidade_inquilinos = new Set(receitas.map((r) => r.inquilino_nome)).size;
  const media_mensal = receitas.length > 0 ? total_receita / receitas.length : 0;
  const valores = receitas.map((r) => r.total_recebido).sort((a, b) => a - b);
  const minima = valores.length > 0 ? valores[0] : 0;
  const maxima = valores.length > 0 ? valores[valores.length - 1] : 0;

  return {
    periodo: `${data_inicio} a ${data_fim}`,
    imovel_id,
    endereco: imovelData.endereco,
    total_receita_aluguel: total_receita,
    quantidade_inquilinos_ativos: quantidade_inquilinos,
    receita_media_mensal: media_mensal,
    receita_minima: minima,
    receita_maxima: maxima,
    linhas: receitas,
  };
}

// ============================================================================
// RELATÓRIO 2: DESPESAS OPERACIONAIS
// ============================================================================

export function relatorioDespesasOperacionais(
  db: Database,
  entidade_id: number,
  data_inicio: string,
  data_fim: string,
): RelatorioDespesasOperacionais {
  const despesas = consultar<{
    imovel_id: number;
    imovel_endereco: string;
    tipo_despesa: string;
    descricao: string;
    valor: number;
    data_lancamento: string;
    fornecedor?: string;
  }>(
    db,
    `SELECT
       i.id as imovel_id,
       i.endereco as imovel_endereco,
       le.descricao as tipo_despesa,
       le.descricao,
       COALESCE(le.valor_debito, 0) as valor,
       le.data_lancamento,
       '' as fornecedor
     FROM ledger_entries le
     INNER JOIN imoveis i ON le.centro_custo_id = i.id
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE le.entidade_id = ? AND le.origem_modulo = 'imovel-gestao'
       AND cp.grupo = 'despesa'
       AND le.data_lancamento BETWEEN ? AND ?
     ORDER BY le.data_lancamento ASC`,
    [entidade_id, data_inicio, data_fim],
  );

  let total_condominio = 0;
  let total_agua = 0;
  let total_energia = 0;
  let total_internet = 0;
  let total_manutencao = 0;
  let total_seguros = 0;
  const despesas_por_imovel: Record<string, number> = {};

  const linhasFormatadas: LinhaDespesaOperacional[] = despesas.map((d) => {
    // Categorizar despesa
    const tipoLower = d.tipo_despesa.toLowerCase();
    if (tipoLower.includes("condominio")) {
      total_condominio += d.valor;
    } else if (tipoLower.includes("agua") || tipoLower.includes("esgoto")) {
      total_agua += d.valor;
    } else if (tipoLower.includes("energia") || tipoLower.includes("eletricidade")) {
      total_energia += d.valor;
    } else if (tipoLower.includes("internet")) {
      total_internet += d.valor;
    } else if (tipoLower.includes("manutencao")) {
      total_manutencao += d.valor;
    } else if (tipoLower.includes("seguro")) {
      total_seguros += d.valor;
    }

    // Agrupar por imóvel
    if (!despesas_por_imovel[d.imovel_endereco]) {
      despesas_por_imovel[d.imovel_endereco] = 0;
    }
    despesas_por_imovel[d.imovel_endereco] += d.valor;

    return {
      data: d.data_lancamento,
      imovel_endereco: d.imovel_endereco,
      tipo_despesa: d.tipo_despesa,
      descricao: d.descricao,
      valor: d.valor,
      fornecedor: d.fornecedor,
      centro_custo: d.imovel_endereco,
    };
  });

  const total_geral = total_condominio + total_agua + total_energia + total_internet + total_manutencao + total_seguros;

  return {
    periodo: `${data_inicio} a ${data_fim}`,
    total_condominio,
    total_agua_esgoto: total_agua,
    total_energia,
    total_internet,
    total_manutencao,
    total_seguros,
    total_geral,
    quantidade_despesas: despesas.length,
    despesa_media: despesas.length > 0 ? total_geral / despesas.length : 0,
    despesas_por_imovel,
    linhas: linhasFormatadas,
  };
}

// ============================================================================
// RELATÓRIO 3: RETORNO DE IMAGEM (ROI)
// ============================================================================

export function relatorioRetornoImagem(
  db: Database,
  entidade_id: number,
  data_inicio: string,
  data_fim: string,
): RelatorioRetornoImagem {
  const imoveis = consultar<{ id: number; endereco: string; valor_aquisicao: number }>(
    db,
    `SELECT id, endereco, valor_aquisicao FROM imoveis WHERE entidade_id = ? ORDER BY endereco ASC`,
    [entidade_id],
  );

  const retornos: RetornoImovel[] = imoveis.map((imovel) => {
    // Receitas de aluguel
    const [receitaData] = consultar<{ total: number }>(
      db,
      // contratos_locacao guarda vigência (data_inicio/data_fim), não vencimento —
       // data_vencimento não existe nem aqui nem no schema de produção. O recorte certo
       // para "aluguel do período" é o contrato vigente na janela; data_fim nulo é
       // contrato em vigor (ver schema.sql).
       `SELECT COALESCE(SUM(valor_aluguel), 0) as total
       FROM contratos_locacao
       WHERE imovel_id = ?
         AND data_inicio <= ?
         AND (data_fim IS NULL OR data_fim >= ?)`,
      [imovel.id, data_fim, data_inicio],
    );

    // Despesas do período
    const [despesaData] = consultar<{ total: number }>(
      db,
      `SELECT COALESCE(SUM(valor_debito), 0) as total
       FROM ledger_entries
       WHERE centro_custo_id = ? AND entidade_id = ?
         AND data_lancamento BETWEEN ? AND ?
         AND origem_modulo = 'imovel-gestao'`,
      [imovel.id, entidade_id, data_inicio, data_fim],
    );

    const receita_anual = (receitaData?.total || 0) * 12;
    const despesa_anual = (despesaData?.total || 0) * 12;
    const lucro_liquido = receita_anual - despesa_anual;
    const roi_percentual =
      imovel.valor_aquisicao > 0 ? (lucro_liquido / imovel.valor_aquisicao) * 100 : 0;
    const periodo_payback =
      receita_anual > 0 ? imovel.valor_aquisicao / receita_anual : Number.POSITIVE_INFINITY;
    const yield_mensal = imovel.valor_aquisicao > 0 ? ((receitaData?.total || 0) / imovel.valor_aquisicao) * 100 : 0;
    const yield_anual = yield_mensal * 12;

    return {
      imovel_id: imovel.id,
      endereco: imovel.endereco,
      valor_aquisicao: imovel.valor_aquisicao,
      receita_anual_estimada: receita_anual,
      despesa_anual_estimada: despesa_anual,
      lucro_liquido_anual: lucro_liquido,
      roi_percentual: Math.round(roi_percentual * 100) / 100,
      periodo_payback_anos: Math.round(periodo_payback * 100) / 100,
      yield_mensal: Math.round(yield_mensal * 100) / 100,
      yield_anual: Math.round(yield_anual * 100) / 100,
    };
  });

  const roi_medio =
    retornos.length > 0
      ? retornos.reduce((sum, r) => sum + r.roi_percentual, 0) / retornos.length
      : 0;
  const yield_medio =
    retornos.length > 0
      ? retornos.reduce((sum, r) => sum + r.yield_anual, 0) / retornos.length
      : 0;
  const roi_total = retornos.reduce((sum, r) => sum + r.lucro_liquido_anual, 0);

  return {
    periodo: `${data_inicio} a ${data_fim}`,
    quantidade_imoveis: imoveis.length,
    roi_medio_geral: Math.round(roi_medio * 100) / 100,
    yield_medio_geral: Math.round(yield_medio * 100) / 100,
    roi_total_anual: Math.round(roi_total * 100) / 100,
    imoveis: retornos,
  };
}

// ============================================================================
// RELATÓRIO 4: COMPARATIVO DE PROPRIEDADES
// ============================================================================

export function relatorioComparativoPropriedades(
  db: Database,
  entidade_id: number,
  data_inicio: string,
  data_fim: string,
): RelatorioComparativoPropriedades {
  const imoveis = consultar<{ id: number; endereco: string; tipo_imovel: string; valor_aquisicao: number }>(
    db,
    `SELECT id, endereco, tipo_imovel, valor_aquisicao FROM imoveis WHERE entidade_id = ? ORDER BY endereco ASC`,
    [entidade_id],
  );

  const comparativos: ComparativoImovel[] = imoveis.map((imovel) => {
    // Receita
    const [receitaData] = consultar<{ total: number }>(
      db,
      // contratos_locacao guarda vigência (data_inicio/data_fim), não vencimento —
       // data_vencimento não existe nem aqui nem no schema de produção. O recorte certo
       // para "aluguel do período" é o contrato vigente na janela; data_fim nulo é
       // contrato em vigor (ver schema.sql).
       `SELECT COALESCE(SUM(valor_aluguel), 0) as total
       FROM contratos_locacao
       WHERE imovel_id = ?
         AND data_inicio <= ?
         AND (data_fim IS NULL OR data_fim >= ?)`,
      [imovel.id, data_fim, data_inicio],
    );

    // Despesas
    const [despesaData] = consultar<{ total: number }>(
      db,
      `SELECT COALESCE(SUM(valor_debito), 0) as total
       FROM ledger_entries
       WHERE centro_custo_id = ? AND entidade_id = ?
         AND data_lancamento BETWEEN ? AND ?
         AND origem_modulo = 'imovel-gestao'`,
      [imovel.id, entidade_id, data_inicio, data_fim],
    );

    const receita_mensal = receitaData?.total || 0;
    const despesa_mensal = despesaData?.total || 0;
    const margem = receita_mensal - despesa_mensal;
    const margem_pct = receita_mensal > 0 ? (margem / receita_mensal) * 100 : 0;
    const roi_anual = imovel.valor_aquisicao > 0 ? (margem * 12 / imovel.valor_aquisicao) * 100 : 0;

    // Score de performance (0-100)
    const score = Math.max(0, Math.min(100, roi_anual / 10 + margem_pct));

    return {
      imovel_id: imovel.id,
      endereco: imovel.endereco,
      tipo_imovel: imovel.tipo_imovel,
      valor_aquisicao: imovel.valor_aquisicao,
      valor_aluguel_mensal: receita_mensal,
      despesas_mensais: despesa_mensal,
      margem_liquida: margem,
      margem_percentual: Math.round(margem_pct * 100) / 100,
      ocupacao_percentual: 100, // Simplificado, seria calculado com vacâncias
      roi_anual: Math.round(roi_anual * 100) / 100,
      score_performance: Math.round(score * 100) / 100,
    };
  });

  // Ordenar por performance
  comparativos.sort((a, b) => b.score_performance - a.score_performance);

  const melhor = comparativos[0];
  const pior = comparativos[comparativos.length - 1];

  const desempenho_medio = {
    valor_aluguel_medio:
      comparativos.length > 0
        ? comparativos.reduce((sum, c) => sum + c.valor_aluguel_mensal, 0) / comparativos.length
        : 0,
    despesas_medias:
      comparativos.length > 0
        ? comparativos.reduce((sum, c) => sum + c.despesas_mensais, 0) / comparativos.length
        : 0,
    margem_media:
      comparativos.length > 0
        ? comparativos.reduce((sum, c) => sum + c.margem_liquida, 0) / comparativos.length
        : 0,
    roi_medio:
      comparativos.length > 0
        ? comparativos.reduce((sum, c) => sum + c.roi_anual, 0) / comparativos.length
        : 0,
  };

  return {
    periodo: `${data_inicio} a ${data_fim}`,
    quantidade_imoveis: imoveis.length,
    melhor_desempenho: melhor,
    pior_desempenho: pior,
    desempenho_medio,
    imoveis: comparativos,
  };
}

// ============================================================================
// RELATÓRIO 5: MANUTENÇÃO AGENDADA
// ============================================================================

export function relatorioManutencaoAgendada(
  db: Database,
  entidade_id: number,
  data_inicio: string,
  data_fim: string,
): RelatorioManutencaoAgendada {
  const manutencoes = consultar<{
    data_manutencao: string;
    imovel_endereco: string;
    tipo_manutencao: string;
    descricao: string;
    valor_manutencao: number;
    prestador_servico: string;
    status: "pendente" | "concluida" | "cancelada";
  }>(
    db,
    `SELECT
       m.data_manutencao,
       i.endereco as imovel_endereco,
       m.tipo_manutencao,
       m.descricao,
       m.valor_manutencao,
       m.prestador_servico,
       m.status
     FROM manutencoes m
     INNER JOIN imoveis i ON m.imovel_id = i.id
     WHERE i.entidade_id = ? AND m.data_manutencao BETWEEN ? AND ?
     ORDER BY m.data_manutencao ASC`,
    [entidade_id, data_inicio, data_fim],
  );

  let total_pendente = 0;
  let total_concluida = 0;
  let total_cancelada = 0;
  let quantidade_pendente = 0;
  let quantidade_concluida = 0;
  let custo_pendente = 0;
  let custo_concluido = 0;

  const linhasFormatadas: LinhaManutencao[] = manutencoes.map((m) => {
    if (m.status === "pendente") {
      total_pendente += m.valor_manutencao;
      quantidade_pendente++;
      custo_pendente += m.valor_manutencao;
    } else if (m.status === "concluida") {
      total_concluida += m.valor_manutencao;
      quantidade_concluida++;
      custo_concluido += m.valor_manutencao;
    } else {
      total_cancelada += m.valor_manutencao;
    }

    // Calcular dias de atraso se pendente e data passou
    let dias_atraso: number | undefined;
    const dataManut = new Date(m.data_manutencao);
    const hoje = new Date();
    if (m.status === "pendente" && dataManut < hoje) {
      dias_atraso = Math.floor((hoje.getTime() - dataManut.getTime()) / (1000 * 60 * 60 * 24));
    }

    return {
      data_manutencao: m.data_manutencao,
      imovel_endereco: m.imovel_endereco,
      tipo_manutencao: m.tipo_manutencao,
      descricao: m.descricao,
      valor: m.valor_manutencao,
      prestador_servico: m.prestador_servico,
      status: m.status,
      dias_atraso,
    };
  });

  return {
    periodo: `${data_inicio} a ${data_fim}`,
    total_pendente,
    total_concluida,
    total_cancelada,
    custo_total_pendente: custo_pendente,
    custo_total_concluido: custo_concluido,
    quantidade_pendente,
    quantidade_concluida,
    linhas: linhasFormatadas,
  };
}

// ============================================================================
// RELATÓRIO 6: FLUXO DE CAIXA DE PROPRIEDADES
// ============================================================================

export function relatorioFluxoCaixaPropriedades(
  db: Database,
  entidade_id: number,
  data_inicio: string,
  data_fim: string,
): RelatorioFluxoCaixaPropriedades {
  const imoveis = consultar<{ id: number; endereco: string }>(
    db,
    `SELECT id, endereco FROM imoveis WHERE entidade_id = ? ORDER BY endereco ASC`,
    [entidade_id],
  );

  const fluxos: FluxoCaixaPropriedade[] = imoveis.map((imovel) => {
    // Saldo inicial (saldo no início do período)
    const [saldoInicialData] = consultar<{ saldo: number }>(
      db,
      `SELECT COALESCE(SUM(
        CASE WHEN le.valor_debito > 0 THEN le.valor_debito ELSE -le.valor_credito END
      ), 0) as saldo
       FROM ledger_entries le
       WHERE le.centro_custo_id = ? AND le.entidade_id = ?
         AND le.data_lancamento < ?`,
      [imovel.id, entidade_id, data_inicio],
    );

    // Entradas de aluguel
    const [entradasAluguelData] = consultar<{ total: number }>(
      db,
      // contratos_locacao guarda vigência (data_inicio/data_fim), não vencimento —
       // data_vencimento não existe nem aqui nem no schema de produção. O recorte certo
       // para "aluguel do período" é o contrato vigente na janela; data_fim nulo é
       // contrato em vigor (ver schema.sql).
       `SELECT COALESCE(SUM(valor_aluguel), 0) as total
       FROM contratos_locacao
       WHERE imovel_id = ?
         AND data_inicio <= ?
         AND (data_fim IS NULL OR data_fim >= ?)`,
      [imovel.id, data_fim, data_inicio],
    );

    // Outras entradas
    const [outrasEntradosData] = consultar<{ total: number }>(
      db,
      `SELECT COALESCE(SUM(le.valor_credito), 0) as total
       FROM ledger_entries le
       WHERE le.centro_custo_id = ? AND le.entidade_id = ?
         AND le.data_lancamento BETWEEN ? AND ?
         AND le.origem_modulo = 'imovel-gestao'
         AND le.conta_id NOT IN (SELECT id FROM contas_plano_contas WHERE codigo LIKE '5.1.01')`,
      [imovel.id, entidade_id, data_inicio, data_fim],
    );

    // Saídas de despesas
    const [saidasDespesasData] = consultar<{ total: number }>(
      db,
      `SELECT COALESCE(SUM(le.valor_debito), 0) as total
       FROM ledger_entries le
       WHERE le.centro_custo_id = ? AND le.entidade_id = ?
         AND le.data_lancamento BETWEEN ? AND ?
         AND le.origem_modulo = 'imovel-gestao'`,
      [imovel.id, entidade_id, data_inicio, data_fim],
    );

    // Saídas de manutenção
    const [saidasManutencaoData] = consultar<{ total: number }>(
      db,
      `SELECT COALESCE(SUM(valor_manutencao), 0) as total
       FROM manutencoes
       WHERE imovel_id = ? AND data_manutencao BETWEEN ? AND ? AND status = 'concluida'`,
      [imovel.id, data_inicio, data_fim],
    );

    const saldo_inicial = saldoInicialData?.saldo || 0;
    const entradas_aluguel = entradasAluguelData?.total || 0;
    const entradas_outras = outrasEntradosData?.total || 0;
    const saidas_despesas = saidasDespesasData?.total || 0;
    const saidas_manutencao = saidasManutencaoData?.total || 0;

    const total_entradas = entradas_aluguel + entradas_outras;
    const total_saidas = saidas_despesas + saidas_manutencao;
    const fluxo_liquido = total_entradas - total_saidas;
    const saldo_final = saldo_inicial + fluxo_liquido;

    return {
      imovel_id: imovel.id,
      endereco: imovel.endereco,
      saldo_inicial,
      entradas_aluguel,
      entradas_outras,
      total_entradas,
      saidas_despesas,
      saidas_manutencao,
      total_saidas,
      fluxo_liquido,
      saldo_final,
    };
  });

  const fluxo_total = fluxos.reduce((sum, f) => sum + f.fluxo_liquido, 0);
  const entradas_totais = fluxos.reduce((sum, f) => sum + f.total_entradas, 0);
  const saidas_totais = fluxos.reduce((sum, f) => sum + f.total_saidas, 0);

  return {
    periodo: `${data_inicio} a ${data_fim}`,
    quantidade_imoveis: imoveis.length,
    fluxo_total_geral: fluxo_total,
    entradas_totais,
    saidas_totais,
    imagem: fluxos,
  };
}

// ============================================================================
// RELATÓRIO 7: PROVISÕES FUTURAS
// ============================================================================

export function relatorioProvisioneFuturas(
  db: Database,
  entidade_id: number,
  data_inicio: string,
  data_fim: string,
): RelatorioProvisioneFuturas {
  const imoveis = consultar<{ id: number; endereco: string }>(
    db,
    `SELECT id, endereco FROM imoveis WHERE entidade_id = ? ORDER BY endereco ASC`,
    [entidade_id],
  );

  const provisoes: ProvisioneFutura[] = imoveis.map((imovel) => {
    // Receita média mensal para cálculo de percentual
    const [receitaData] = consultar<{ total: number }>(
      db,
      // contratos_locacao guarda vigência (data_inicio/data_fim), não vencimento —
       // data_vencimento não existe nem aqui nem no schema de produção. O recorte certo
       // para "aluguel do período" é o contrato vigente na janela; data_fim nulo é
       // contrato em vigor (ver schema.sql).
       `SELECT COALESCE(SUM(valor_aluguel), 0) as total
       FROM contratos_locacao
       WHERE imovel_id = ?
         AND data_inicio <= ?
         AND (data_fim IS NULL OR data_fim >= ?)`,
      [imovel.id, data_fim, data_inicio],
    );

    const receita_media = receitaData?.total || 0;

    // Calcular provisões baseado em histórico
    // Manutenção: 10% da receita anual
    const reserva_manutencao = (receita_media * 12) * 0.10;
    // Seguro: 5% da receita anual
    const reserva_seguro = (receita_media * 12) * 0.05;
    // Vacância: 5% da receita anual
    const reserva_vaga = (receita_media * 12) * 0.05;
    // Reforma grande: 15% da receita anual
    const reserva_reforma = (receita_media * 12) * 0.15;

    const total_provisoes = reserva_manutencao + reserva_seguro + reserva_vaga + reserva_reforma;
    const percentual_receita = receita_media > 0 ? (total_provisoes / (receita_media * 12)) * 100 : 0;

    // Determinar situação
    let situacao: "adequada" | "insuficiente" | "excessiva";
    if (percentual_receita < 20) {
      situacao = "insuficiente";
    } else if (percentual_receita > 40) {
      situacao = "excessiva";
    } else {
      situacao = "adequada";
    }

    return {
      imovel_id: imovel.id,
      endereco: imovel.endereco,
      reserva_manutencao: Math.round(reserva_manutencao * 100) / 100,
      reserva_seguro: Math.round(reserva_seguro * 100) / 100,
      reserva_vaga: Math.round(reserva_vaga * 100) / 100,
      reserva_reforma: Math.round(reserva_reforma * 100) / 100,
      total_provisoes: Math.round(total_provisoes * 100) / 100,
      percentual_receita: Math.round(percentual_receita * 100) / 100,
      situacao,
    };
  });

  const provisao_total_manutencao = provisoes.reduce((sum, p) => sum + p.reserva_manutencao, 0);
  const provisao_total_seguro = provisoes.reduce((sum, p) => sum + p.reserva_seguro, 0);
  const provisao_total_vaga = provisoes.reduce((sum, p) => sum + p.reserva_vaga, 0);
  const provisao_total_reforma = provisoes.reduce((sum, p) => sum + p.reserva_reforma, 0);
  const provisao_total_geral = provisoes.reduce((sum, p) => sum + p.total_provisoes, 0);

  return {
    periodo: `${data_inicio} a ${data_fim}`,
    quantidade_imoveis: imoveis.length,
    provisao_total_manutencao: Math.round(provisao_total_manutencao * 100) / 100,
    provisao_total_seguro: Math.round(provisao_total_seguro * 100) / 100,
    provisao_total_vaga: Math.round(provisao_total_vaga * 100) / 100,
    provisao_total_reforma: Math.round(provisao_total_reforma * 100) / 100,
    provisao_total_geral: Math.round(provisao_total_geral * 100) / 100,
    imoveis: provisoes,
  };
}

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

export function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);
}

export function formatarPercentual(valor: number): string {
  return `${(Math.round(valor * 100) / 100).toFixed(2)}%`;
}

// ============================================================================
// FUNÇÃO CONSOLIDADORA
// ============================================================================

export interface RelatorioConsolidadoImoveisTodos {
  receitas: RelatorioReceitasAluguel | null;
  despesas: RelatorioDespesasOperacionais;
  retorno: RelatorioRetornoImagem;
  comparativo: RelatorioComparativoPropriedades;
  manutencao: RelatorioManutencaoAgendada;
  fluxo_caixa: RelatorioFluxoCaixaPropriedades;
  provisoes: RelatorioProvisioneFuturas;
}

export function gerarRelatorioConsolidadoImoveis(
  db: Database,
  entidade_id: number,
  data_inicio: string,
  data_fim: string,
  imovel_id?: number,
): RelatorioConsolidadoImoveisTodos {
  let receitas: RelatorioReceitasAluguel | null = null;
  if (imovel_id) {
    receitas = relatorioReceitasAluguel(db, entidade_id, imovel_id, data_inicio, data_fim);
  }

  return {
    receitas,
    despesas: relatorioDespesasOperacionais(db, entidade_id, data_inicio, data_fim),
    retorno: relatorioRetornoImagem(db, entidade_id, data_inicio, data_fim),
    comparativo: relatorioComparativoPropriedades(db, entidade_id, data_inicio, data_fim),
    manutencao: relatorioManutencaoAgendada(db, entidade_id, data_inicio, data_fim),
    fluxo_caixa: relatorioFluxoCaixaPropriedades(db, entidade_id, data_inicio, data_fim),
    provisoes: relatorioProvisioneFuturas(db, entidade_id, data_inicio, data_fim),
  };
}
