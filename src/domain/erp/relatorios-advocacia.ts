/**
 * Relatórios do Módulo Advocacia (Serviços Legais)
 * Análise de processos, despesas, riscos e provisões
 * Padrão RelatorioBuilder para construção e formatação
 */

import type { Database } from "sql.js";
import { consultar } from "../../db/connection";

/**
 * RelatorioBuilder Advocacia: Padrão para construir relatórios de legal
 */
export class RelatorioBuilderAdvocacia {
  private dados: Record<string, any> = {};
  private metadados: {
    titulo: string;
    data_geracao: string;
    periodo?: string;
    origem_modulo: string;
    filtros?: Record<string, any>;
  };

  constructor(titulo: string, origem_modulo: string = "advocacia") {
    this.metadados = {
      titulo,
      data_geracao: new Date().toISOString(),
      origem_modulo,
    };
  }

  adicionar(chave: string, valor: any): this {
    this.dados[chave] = valor;
    return this;
  }

  comPeriodo(periodo: string): this {
    this.metadados.periodo = periodo;
    return this;
  }

  comFiltros(filtros: Record<string, any>): this {
    this.metadados.filtros = filtros;
    return this;
  }

  obter(): Record<string, any> {
    return {
      metadados: this.metadados,
      ...this.dados,
    };
  }

  formatarMoeda(valor: number): string {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(valor);
  }

  formatarPercentual(valor: number): string {
    return `${(valor * 100).toFixed(2)}%`;
  }

  formatarData(data: string): string {
    return new Date(data).toLocaleDateString("pt-BR");
  }
}

// ============================================================================
// TIPOS DE DADOS ESPECÍFICOS
// ============================================================================

export interface ProcessoAtivoDetalhado {
  id: number;
  numero_processo: string;
  tipo: string;
  descricao: string;
  data_ajuizamento: string;
  status: string;
  foro: string;
  valor_causa: number;
  estimativa_despesa: number;
  despesas_realizadas: number;
  risco: string;
  risco_score: number; // 0-100
  advocados: string[];
  proximos_prazos: string[];
}

export interface ProcessosAtivos {
  total_processos_ativos: number;
  valor_total_envolvido: number;
  valor_total_estimado: number;
  valor_despesas_realizadas: number;
  por_status: Record<string, number>;
  por_risco: Record<
    string,
    {
      quantidade: number;
      valor_envolvido: number;
      /** Percentual aplicado sobre valor_envolvido para chegar a
       *  provisao_recomendada. Vai no relatório porque sem ele a provisão é um
       *  número sem memória de cálculo — quem revisa não consegue conferir. */
      aliquota_provisao: number;
      provisao_recomendada: number;
    }
  >;
  processos_listados: ProcessoAtivoDetalhado[];
  alertas: Array<{
    tipo: string; // "alto_risco" | "perto_vencimento" | "acima_orcamento"
    quantidade: number;
    descricao: string;
  }>;
}

export interface DespesaLegalDetalhada {
  id: number;
  data_lancamento: string;
  tipo_despesa: string;
  descricao: string;
  processo_numero: string;
  valor: number;
  beneficiario: string;
  status_pagamento: string;
  referencia_documento: string;
}

export interface DespesasLegais {
  periodo: string;
  total_geral: number;
  total_pago: number;
  total_pendente: number;
  por_tipo: Record<
    string,
    {
      valor: number;
      percentual: number;
      quantidade: number;
      valor_medio: number;
    }
  >;
  por_advogado: Record<
    string,
    {
      valor: number;
      percentual: number;
      quantidade_processos: number;
    }
  >;
  despesas_listadas: DespesaLegalDetalhada[];
  evolucao_mensal: Array<{
    mes: string;
    valor: number;
    quantidade: number;
  }>;
}

export interface ProvisaoRisco {
  risco_baixo: {
    quantidade_processos: number;
    valor_envolvido: number;
    aliquota_provisao: number; // 25%
    provisao: number;
  };
  risco_medio: {
    quantidade_processos: number;
    valor_envolvido: number;
    aliquota_provisao: number; // 50%
    provisao: number;
  };
  risco_alto: {
    quantidade_processos: number;
    valor_envolvido: number;
    aliquota_provisao: number; // 75%
    provisao: number;
  };
  risco_critico: {
    quantidade_processos: number;
    valor_envolvido: number;
    aliquota_provisao: number; // 100%
    provisao: number;
  };
  provisao_total: number;
  composicao_risco: Array<{
    risco: string;
    quantidade: number;
    percentual: number;
  }>;
}

export interface AdvogadoComparativo {
  id: number;
  nome: string;
  especialidade: string;
  processos_ativos: number;
  processos_concluidos: number;
  taxa_vitoria: number; // percentual
  despesas_totais: number;
  despesa_media_processo: number;
  taxa_reembolso: number; // percentual
  score_eficiencia: number; // 0-100
}

export interface AdvogadosComparativos {
  periodo: string;
  total_advogados: number;
  total_processos: number;
  total_despesas: number;
  advogados: AdvogadoComparativo[];
  agregados: {
    advogado_mais_ativo: {
      nome: string;
      processos: number;
    };
    advogado_mais_eficiente: {
      nome: string;
      score: number;
    };
    advogado_maior_custo: {
      nome: string;
      valor: number;
    };
  };
}

export interface PrevisaoDespesasLegais {
  periodo: string;
  orcamento_anual: number;
  gasto_realizado: number;
  gasto_projetado: number;
  saldo_disponivel: number;
  taxa_utilizacao: number;
  processos_novos_esperados: number;
  despesa_media_processo: number;
  projecao_mes_mes: Array<{
    mes: string;
    orcamento: number;
    gasto_realizado: number;
    gasto_projetado: number;
    variancia: number;
    percentual_utilizado: number;
  }>;
  desvios: Array<{
    tipo: string; // "acima_orcamento" | "processo_novo"
    impacto: number;
    descricao: string;
  }>;
}

export interface AuditoriaProcesso {
  processo_id: number;
  numero_processo: string;
  tipo: string;
  status: string;
  trilha_auditoria: Array<{
    data_evento: string;
    tipo_evento: string; // "criacao" | "atualizacao" | "despesa" | "mudanca_status"
    usuario: string;
    descricao: string;
    documento_referencia?: string;
    valor_afetado?: number;
  }>;
  documentos_anexados: Array<{
    id: number;
    nome: string;
    data_upload: string;
    tipo_documento: string;
    tamanho_bytes: number;
  }>;
  historico_valores: Array<{
    data: string;
    tipo_evento: string;
    valor_anterior: number;
    valor_novo: number;
  }>;
}

export interface AuditoriaProcessos {
  periodo: string;
  total_processos_auditados: number;
  conformidade_geral: number; // percentual
  processos: AuditoriaProcesso[];
  achados: Array<{
    tipo: string; // "documentacao_incompleta" | "valores_inconsistentes"
    quantidade: number;
    processos_afetados: string[]; // números dos processos
  }>;
  recomendacoes: string[];
}

// ============================================================================
// REPORT FUNCTIONS
// ============================================================================

/**
 * Relatório 1: Processos Ativos
 * Análise detalhada de casos ativosr por status e risco
 */
export function relatorioProcessosAtivos(
  db: Database,
  entidade_id: number,
  periodo_id: number,
): ProcessosAtivos {
  const processos = consultar<{
    id: number;
    numero_processo: string;
    tipo: string;
    descricao: string;
    data_ajuizamento: string;
    status: string;
    foro: string;
    valor_causa: number;
    estimativa_despesa: number;
    risco_potencial: string;
  }>(
    db,
    `SELECT id, numero_processo, tipo, descricao, data_ajuizamento,
            status, foro, valor_causa, estimativa_despesa, risco_potencial
     FROM processos_legais
     WHERE entidade_id = ? AND status IN ('ativo', 'em_recurso')
     ORDER BY data_ajuizamento DESC`,
    [entidade_id]
  );

  // Despesas realizadas por processo
  const despesasPorProcesso: Record<number, number> = {};
  processos.forEach((p) => {
    const [despesas] = consultar<{ total: number }>(
      db,
      `SELECT COALESCE(SUM(valor_despesa), 0) as total
       FROM despesas_legais
       WHERE processo_id = ?`,
      [p.id]
    );
    despesasPorProcesso[p.id] = despesas?.total || 0;
  });

  // Agregação por status
  const porStatus: Record<string, number> = {};
  processos.forEach((p) => {
    porStatus[p.status] = (porStatus[p.status] || 0) + 1;
  });

  // Agregação por risco com cálculo de provisão
  const riscoPorcentual = {
    baixo: 0.25,
    médio: 0.5,
    alto: 0.75,
    crítico: 1.0,
  };

  const porRisco: Record<
    string,
    {
      quantidade: number;
      valor_envolvido: number;
      aliquota_provisao: number;
      provisao_recomendada: number;
    }
  > = {};

  processos.forEach((p) => {
    const riscoKey = p.risco_potencial || "desconhecido";
    // Risco não classificado provisiona como o mais conservador: deixar em 0 trataria
    // "ninguém avaliou ainda" como "não há risco", que é a leitura errada.
    const aliquota =
      riscoPorcentual[riscoKey as keyof typeof riscoPorcentual] ?? riscoPorcentual.crítico;
    if (!porRisco[riscoKey]) {
      porRisco[riscoKey] = {
        quantidade: 0,
        valor_envolvido: 0,
        aliquota_provisao: aliquota,
        provisao_recomendada: 0,
      };
    }
    porRisco[riscoKey].quantidade += 1;
    porRisco[riscoKey].valor_envolvido += p.valor_causa;
    porRisco[riscoKey].provisao_recomendada += p.valor_causa * aliquota;
  });

  // Alertas
  const alertas = [];
  // Só 'alto' e 'crítico' entram aqui. Antes somava a quantidade de TODOS os baldes de
  // risco, inclusive 'baixo', e alertava "processos com risco alto ou crítico" para uma
  // carteira inteiramente de risco baixo — o alerta disparava sempre e não dizia nada.
  const processosAltoRisco = Object.entries(porRisco)
    .filter(([risco]) => risco === "alto" || risco === "crítico")
    .reduce((soma, [, r]) => soma + r.quantidade, 0);

  if (processosAltoRisco > 0) {
    alertas.push({
      tipo: "alto_risco",
      quantidade: processosAltoRisco,
      descricao: "Processos com risco alto ou crítico",
    });
  }

  const totalValor = processos.reduce((sum, p) => sum + p.valor_causa, 0);
  const totalEstimado = processos.reduce(
    (sum, p) => sum + p.estimativa_despesa,
    0
  );
  const totalRealizado = Object.values(despesasPorProcesso).reduce(
    (sum, v) => sum + v,
    0
  );

  // O tipo já previa "acima_orcamento" na lista de alertas, mas nada o emitia: gastar
  // mais que o estimado passava silenciosamente, que é justamente o que este relatório
  // deveria denunciar.
  if (totalRealizado > totalEstimado) {
    alertas.push({
      tipo: "acima_orcamento",
      quantidade: processos.filter(
        (p) => (despesasPorProcesso[p.id] || 0) > p.estimativa_despesa
      ).length,
      descricao: `Despesas realizadas (${totalRealizado}) excedem o estimado (${totalEstimado})`,
    });
  }

  const processosDetalhados = processos.map((p) => ({
    id: p.id,
    numero_processo: p.numero_processo,
    tipo: p.tipo,
    descricao: p.descricao,
    data_ajuizamento: p.data_ajuizamento,
    status: p.status,
    foro: p.foro,
    valor_causa: p.valor_causa,
    estimativa_despesa: p.estimativa_despesa,
    despesas_realizadas: despesasPorProcesso[p.id] || 0,
    risco: p.risco_potencial,
    risco_score: {
      baixo: 25,
      médio: 50,
      alto: 75,
      crítico: 100,
    }[p.risco_potencial as string] || 0,
    advocados: [],
    proximos_prazos: [],
  }));

  return {
    total_processos_ativos: processos.length,
    valor_total_envolvido: totalValor,
    valor_total_estimado: totalEstimado,
    valor_despesas_realizadas: totalRealizado,
    por_status: porStatus,
    por_risco: porRisco,
    processos_listados: processosDetalhados,
    alertas,
  };
}

/**
 * Relatório 2: Despesas Legais
 * Análise de despesas por tipo, advogado e evolução mensal
 */
export function relatorioDespesasLegais(
  db: Database,
  entidade_id: number,
  periodo_id: number,
): DespesasLegais {
  const [periodo] = consultar<{ mes: number; ano: number }>(
    db,
    `SELECT mes, ano FROM periodos_contabeis WHERE id = ?`,
    [periodo_id]
  );

  const despesas = consultar<{
    id: number;
    data_lancamento: string;
    tipo_despesa: string;
    descricao: string;
    numero_processo: string;
    valor_despesa: number;
    beneficiario: string;
    status_pagamento: string;
    referencia_documento: string;
  }>(
    db,
    `SELECT dl.id, dl.data_lancamento, dl.tipo_despesa, dl.descricao,
            pl.numero_processo, dl.valor_despesa, dl.beneficiario,
            'pago' as status_pagamento, dl.referencia_documento
     FROM despesas_legais dl
     LEFT JOIN processos_legais pl ON dl.processo_id = pl.id
     WHERE dl.entidade_id = ? AND dl.periodo_id = ?
     ORDER BY dl.data_lancamento DESC`,
    [entidade_id, periodo_id]
  );

  // Agregação por tipo
  const porTipo: Record<
    string,
    {
      valor: number;
      percentual: number;
      quantidade: number;
      valor_medio: number;
    }
  > = {};

  despesas.forEach((d) => {
    if (!porTipo[d.tipo_despesa]) {
      porTipo[d.tipo_despesa] = {
        valor: 0,
        percentual: 0,
        quantidade: 0,
        valor_medio: 0,
      };
    }
    porTipo[d.tipo_despesa].valor += d.valor_despesa;
    porTipo[d.tipo_despesa].quantidade += 1;
  });

  const totalGeral = despesas.reduce((sum, d) => sum + d.valor_despesa, 0);

  Object.keys(porTipo).forEach((key) => {
    porTipo[key].percentual = totalGeral > 0 ? porTipo[key].valor / totalGeral : 0;
    porTipo[key].valor_medio =
      porTipo[key].quantidade > 0
        ? porTipo[key].valor / porTipo[key].quantidade
        : 0;
  });

  // Agregação por advogado (beneficiário)
  const porAdvogado: Record<
    string,
    {
      valor: number;
      percentual: number;
      quantidade_processos: number;
    }
  > = {};

  despesas.forEach((d) => {
    if (!porAdvogado[d.beneficiario]) {
      porAdvogado[d.beneficiario] = {
        valor: 0,
        percentual: 0,
        quantidade_processos: 0,
      };
    }
    porAdvogado[d.beneficiario].valor += d.valor_despesa;
    porAdvogado[d.beneficiario].quantidade_processos += 1;
  });

  Object.keys(porAdvogado).forEach((key) => {
    porAdvogado[key].percentual = totalGeral > 0 ? porAdvogado[key].valor / totalGeral : 0;
  });

  // Evolução mensal
  const evolucao: Array<{ mes: string; valor: number; quantidade: number }> =
    [];
  despesas.forEach((d) => {
    const mesFmt = d.data_lancamento.substring(0, 7);
    const existe = evolucao.find((e) => e.mes === mesFmt);
    if (existe) {
      existe.valor += d.valor_despesa;
      existe.quantidade += 1;
    } else {
      evolucao.push({ mes: mesFmt, valor: d.valor_despesa, quantidade: 1 });
    }
  });

  return {
    periodo: `${periodo?.mes || ""}/${periodo?.ano || ""}`,
    total_geral: totalGeral,
    total_pago: totalGeral,
    total_pendente: 0,
    por_tipo: porTipo,
    por_advogado: porAdvogado,
    despesas_listadas: despesas.map((d) => ({
      id: d.id,
      data_lancamento: d.data_lancamento,
      tipo_despesa: d.tipo_despesa,
      descricao: d.descricao,
      processo_numero: d.numero_processo || "",
      valor: d.valor_despesa,
      beneficiario: d.beneficiario,
      status_pagamento: d.status_pagamento,
      referencia_documento: d.referencia_documento,
    })),
    evolucao_mensal: evolucao.sort((a, b) =>
      a.mes.localeCompare(b.mes)
    ),
  };
}

/**
 * Relatório 3: Provisões de Risco
 * Cálculo de provisão por nível de risco (25%-75%-100%)
 */
export function relatorioProvisoesRisco(
  db: Database,
  entidade_id: number,
  periodo_id: number,
): ProvisaoRisco {
  const processos = consultar<{
    id: number;
    risco_potencial: string;
    valor_causa: number;
  }>(
    db,
    `SELECT id, risco_potencial, valor_causa
     FROM processos_legais
     WHERE entidade_id = ? AND status IN ('ativo', 'em_recurso')`,
    [entidade_id]
  );

  const aliquotas = {
    baixo: 0.25,
    médio: 0.5,
    alto: 0.75,
    crítico: 1.0,
  };

  const riscos = {
    risco_baixo: {
      quantidade_processos: 0,
      valor_envolvido: 0,
      aliquota_provisao: 0.25,
      provisao: 0,
    },
    risco_medio: {
      quantidade_processos: 0,
      valor_envolvido: 0,
      aliquota_provisao: 0.5,
      provisao: 0,
    },
    risco_alto: {
      quantidade_processos: 0,
      valor_envolvido: 0,
      aliquota_provisao: 0.75,
      provisao: 0,
    },
    risco_critico: {
      quantidade_processos: 0,
      valor_envolvido: 0,
      aliquota_provisao: 1.0,
      provisao: 0,
    },
  };

  processos.forEach((p) => {
    const riscoKey = (p.risco_potencial || "baixo").toLowerCase();
    let riscoProp: keyof typeof riscos = "risco_baixo";

    if (riscoKey.includes("médio")) riscoProp = "risco_medio";
    else if (riscoKey.includes("alto")) riscoProp = "risco_alto";
    else if (riscoKey.includes("crítico")) riscoProp = "risco_critico";

    riscos[riscoProp].quantidade_processos += 1;
    riscos[riscoProp].valor_envolvido += p.valor_causa;
    riscos[riscoProp].provisao +=
      p.valor_causa * riscos[riscoProp].aliquota_provisao;
  });

  const provisaoTotal =
    riscos.risco_baixo.provisao +
    riscos.risco_medio.provisao +
    riscos.risco_alto.provisao +
    riscos.risco_critico.provisao;

  const totalProcessos = processos.length;
  const composicaoRisco = [
    {
      risco: "baixo",
      quantidade: riscos.risco_baixo.quantidade_processos,
      percentual:
        totalProcessos > 0
          ? riscos.risco_baixo.quantidade_processos / totalProcessos
          : 0,
    },
    {
      risco: "médio",
      quantidade: riscos.risco_medio.quantidade_processos,
      percentual:
        totalProcessos > 0
          ? riscos.risco_medio.quantidade_processos / totalProcessos
          : 0,
    },
    {
      risco: "alto",
      quantidade: riscos.risco_alto.quantidade_processos,
      percentual:
        totalProcessos > 0
          ? riscos.risco_alto.quantidade_processos / totalProcessos
          : 0,
    },
    {
      risco: "crítico",
      quantidade: riscos.risco_critico.quantidade_processos,
      percentual:
        totalProcessos > 0
          ? riscos.risco_critico.quantidade_processos / totalProcessos
          : 0,
    },
  ];

  return {
    ...riscos,
    provisao_total: provisaoTotal,
    composicao_risco: composicaoRisco,
  };
}

/**
 * Relatório 4: Advogados Comparativos
 * Matriz de comparação de performance entre advogados
 */
export function relatorioAdvogadosComparativos(
  db: Database,
  entidade_id: number,
  periodo_id: number,
): AdvogadosComparativos {
  const [periodo] = consultar<{ mes: number; ano: number }>(
    db,
    `SELECT mes, ano FROM periodos_contabeis WHERE id = ?`,
    [periodo_id]
  );

  // Buscar todos os beneficiários (advogados) de despesas
  const advogados = consultar<{ beneficiario: string }>(
    db,
    `SELECT DISTINCT beneficiario
     FROM despesas_legais
     WHERE entidade_id = ?`,
    [entidade_id]
  );

  let totalProcessos = 0;
  let totalDespesas = 0;

  const relatoriosAdvogado = advogados.map((adv) => {
    const [despInfo] = consultar<{ total: number; qtd: number }>(
      db,
      `SELECT COALESCE(SUM(valor_despesa), 0) as total, COUNT(*) as qtd
       FROM despesas_legais
       WHERE beneficiario = ? AND entidade_id = ?`,
      [adv.beneficiario, entidade_id]
    );

    const [procInfo] = consultar<{ processos: number; vitoria: number }>(
      db,
      `SELECT COUNT(DISTINCT processo_id) as processos, 0 as vitoria
       FROM despesas_legais
       WHERE beneficiario = ? AND entidade_id = ?`,
      [adv.beneficiario, entidade_id]
    );

    const despesasTotal = despInfo?.total || 0;
    const processosAtuante = procInfo?.processos || 0;
    const tarifaMedia =
      processosAtuante > 0 ? despesasTotal / processosAtuante : 0;

    totalProcessos += processosAtuante;
    totalDespesas += despesasTotal;

    return {
      id: 0,
      nome: adv.beneficiario,
      especialidade: "Não especificada",
      processos_ativos: processosAtuante,
      processos_concluidos: 0,
      taxa_vitoria: 0,
      despesas_totais: despesasTotal,
      despesa_media_processo: tarifaMedia,
      taxa_reembolso: 0,
      score_eficiencia: Math.min(100, (processosAtuante / 5) * 100),
    };
  });

  const agregados = {
    advogado_mais_ativo: relatoriosAdvogado.length > 0 ? {
      nome: relatoriosAdvogado[0].nome,
      processos: relatoriosAdvogado[0].processos_ativos,
    } : { nome: "", processos: 0 },
    advogado_mais_eficiente: relatoriosAdvogado.length > 0 ? {
      nome: relatoriosAdvogado.sort(
        (a, b) => b.score_eficiencia - a.score_eficiencia
      )[0].nome,
      score: relatoriosAdvogado.sort(
        (a, b) => b.score_eficiencia - a.score_eficiencia
      )[0].score_eficiencia,
    } : { nome: "", score: 0 },
    advogado_maior_custo: relatoriosAdvogado.length > 0 ? {
      nome: relatoriosAdvogado.sort(
        (a, b) => b.despesas_totais - a.despesas_totais
      )[0].nome,
      valor: relatoriosAdvogado.sort(
        (a, b) => b.despesas_totais - a.despesas_totais
      )[0].despesas_totais,
    } : { nome: "", valor: 0 },
  };

  return {
    periodo: `${periodo?.mes || ""}/${periodo?.ano || ""}`,
    total_advogados: advogados.length,
    total_processos: totalProcessos,
    total_despesas: totalDespesas,
    advogados: relatoriosAdvogado,
    agregados,
  };
}

/**
 * Relatório 5: Previsão de Despesas
 * Budget vs actual para serviços legais
 */
export function relatorioPrevisaoDespesas(
  db: Database,
  entidade_id: number,
  periodo_id: number,
): PrevisaoDespesasLegais {
  const [periodo] = consultar<{ mes: number; ano: number }>(
    db,
    `SELECT mes, ano FROM periodos_contabeis WHERE id = ?`,
    [periodo_id]
  );

  // Buscar orçamento (simplificado: 100.000 anual)
  const orcamentoAnual = 100000;
  const orcamentoMes = orcamentoAnual / 12;

  // Gastos realizados
  const [gastoRealizado] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(valor_despesa), 0) as total
     FROM despesas_legais
     WHERE entidade_id = ? AND periodo_id = ?`,
    [entidade_id, periodo_id]
  );

  const gastoReal = gastoRealizado?.total || 0;
  const gastoProjetado = gastoReal * 1.1; // Projeção: +10%

  const saldoDisponivel = orcamentoAnual - gastoReal;
  const taxaUtilizacao = orcamentoAnual > 0 ? gastoReal / orcamentoAnual : 0;

  // Projeção mês a mês (simplificada)
  const projecaoMesMes = [
    {
      mes: `${periodo?.mes || 1}/${periodo?.ano || 2026}`,
      orcamento: orcamentoMes,
      gasto_realizado: gastoReal,
      gasto_projetado: gastoProjetado,
      variancia: gastoReal - orcamentoMes,
      percentual_utilizado: orcamentoMes > 0 ? gastoReal / orcamentoMes : 0,
    },
  ];

  const desvios = [];
  if (gastoReal > orcamentoMes) {
    desvios.push({
      tipo: "acima_orcamento",
      impacto: gastoReal - orcamentoMes,
      descricao: "Despesas acima do orçado para o período",
    });
  }

  return {
    periodo: `${periodo?.mes || ""}/${periodo?.ano || ""}`,
    orcamento_anual: orcamentoAnual,
    gasto_realizado: gastoReal,
    gasto_projetado: gastoProjetado,
    saldo_disponivel: saldoDisponivel,
    taxa_utilizacao: taxaUtilizacao,
    processos_novos_esperados: 2,
    despesa_media_processo: gastoReal > 0 ? gastoReal / 5 : 0,
    projecao_mes_mes: projecaoMesMes,
    desvios,
  };
}

/**
 * Relatório 6: Auditoria de Processos
 * Trilha de auditoria com referência a documentos
 */
export function relatorioAuditoriaProcessos(
  db: Database,
  entidade_id: number,
  periodo_id: number,
): AuditoriaProcessos {
  const processos = consultar<{
    id: number;
    numero_processo: string;
    tipo: string;
    status: string;
  }>(
    db,
    `SELECT id, numero_processo, tipo, status
     FROM processos_legais
     WHERE entidade_id = ?
     ORDER BY id DESC LIMIT 20`,
    [entidade_id]
  );

  const auditoria = processos.map((p) => {
    // Obter historeco de despesas (simulado como trilha)
    const despesas = consultar<{
      data: string;
      tipo_despesa: string;
      valor: number;
    }>(
      db,
      `SELECT data_lancamento as data, tipo_despesa, valor_despesa as valor
       FROM despesas_legais
       WHERE processo_id = ?
       ORDER BY data_lancamento`,
      [p.id]
    );

    const trilha: AuditoriaProcesso["trilha_auditoria"] = [
      {
        data_evento: new Date().toISOString(),
        tipo_evento: "criacao",
        usuario: "Sistema",
        descricao: `Processo ${p.numero_processo} criado`,
      },
      ...despesas.map((d) => ({
        data_evento: d.data,
        tipo_evento: "despesa" as const,
        usuario: "Sistema",
        descricao: `Lançamento de despesa: ${d.tipo_despesa}`,
        valor_afetado: d.valor,
      })),
    ];

    return {
      processo_id: p.id,
      numero_processo: p.numero_processo,
      tipo: p.tipo,
      status: p.status,
      trilha_auditoria: trilha,
      documentos_anexados: [],
      historico_valores: despesas.map((d) => ({
        data: d.data,
        tipo_evento: d.tipo_despesa,
        valor_anterior: 0,
        valor_novo: d.valor,
      })),
    };
  });

  return {
    periodo: "Período Geral",
    total_processos_auditados: auditoria.length,
    conformidade_geral: 0.95,
    processos: auditoria,
    achados: [],
    recomendacoes: [
      "Manter registros de documentos digitalizados de todos os processos",
      "Revisar prazos de processos em recurso mensalmente",
      "Validar estimativas de despesas trimestralmente",
    ],
  };
}
