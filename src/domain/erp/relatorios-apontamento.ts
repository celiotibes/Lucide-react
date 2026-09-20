/**
 * Relatórios do Módulo Apontamento (Prestador)
 * Análise de urgências, Airbnb, combustível, horas, empréstimos e IPCA
 * Padrão RelatorioBuilder para construção e formatação
 */

import type { Database } from "sql.js";
import { consultar } from "../../db/connection";

/**
 * RelatorioBuilder: Padrão para construir relatórios estruturados
 * Oferece métodos para: agregação, cálculos, formatação, validação
 */
export class RelatorioBuilder {
  private dados: Record<string, any> = {};
  private metadados: {
    titulo: string;
    data_geracao: string;
    periodo?: string;
    origem_modulo: string;
    filtros?: Record<string, any>;
  };

  constructor(titulo: string, origem_modulo: string) {
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

export interface ResumoApontamentos {
  periodo_inicio: string;
  periodo_fim: string;
  prestadores_ativos: number;
  total_apontamentos: number;
  valor_total_pago: number;
  por_tipo: {
    urgencias: {
      quantidade: number;
      valor: number;
      valor_medio: number;
    };
    airbnb: {
      quantidade: number;
      valor: number;
      valor_medio: number;
    };
    combustivel: {
      quantidade: number;
      valor: number;
      km_total: number;
      km_medio: number;
    };
    horas: {
      quantidade: number;
      valor: number;
      horas_total: number;
      horas_media: number;
    };
    emprestimo: {
      quantidade: parcelas;
      valor_devido: number;
      valor_pago: number;
    };
  };
  prestadores: Array<{
    prestador_id: number;
    nome: string;
    total_apontamentos: number;
    valor_total: number;
    ultimos_30_dias: number;
  }>;
}

export interface DespesasRemuneracao {
  periodo: string;
  total_geral: number;
  distribuicao: {
    urgencias: {
      valor: number;
      percentual: number;
      detalhamento: Array<{
        data: string;
        valor: number;
        duracao_minutos: number;
        eh_domingo: boolean;
        descricao: string;
      }>;
    };
    airbnb: {
      valor: number;
      percentual: number;
      detalhamento: Array<{
        data: string;
        tipo_servico: string;
        valor: number;
        numero_quartos: number;
      }>;
    };
    combustivel: {
      valor: number;
      percentual: number;
      detalhamento: Array<{
        data: string;
        km_percorrido: number;
        valor: number;
        valor_litro: number;
      }>;
    };
    horas: {
      valor: number;
      percentual: number;
      detalhamento: Array<{
        data: string;
        horas: number;
        valor_hora: number;
        valor: number;
      }>;
    };
    emprestimo: {
      valor: number;
      percentual: number;
      detalhamento: Array<{
        mes: string;
        parcela_numero: number;
        principal: number;
        juros: number;
        valor: number;
      }>;
    };
  };
}

export interface Reembolsos {
  periodo: string;
  total_solicitado: number;
  total_aprovado: number;
  total_rejeitado: number;
  pendente_aprovacao: number;
  linhas: Array<{
    id: number;
    data_solicitacao: string;
    tipo_despesa: string;
    valor_solicitado: number;
    valor_aprovado: number;
    status: "pendente" | "aprovado" | "rejeitado";
    justificativa?: string;
    observacoes?: string;
    prestador_nome: string;
  }>;
}

export interface ComparativoProvedor {
  periodo: string;
  prestadores: Array<{
    prestador_id: number;
    nome: string;
    total_apontamentos: number;
    total_pago: number;
    valor_medio_apontamento: number;
    produtividade_score: number; // 0-100
    tipos_servicos: {
      urgencias: number;
      airbnb: number;
      combustivel: number;
      horas: number;
      emprestimo: number;
    };
    compliance_score: number; // 0-100, baseado em rejeições
    taxa_aprovacao: number;
  }>;
  agregados: {
    prestador_mais_ativo: {
      nome: string;
      total: number;
    };
    prestador_mais_produtivo: {
      nome: string;
      valor_medio: number;
    };
    prestador_maior_taxa_rejeicao: {
      nome: string;
      taxa: number;
    };
  };
}

export interface AcumuloIPCA {
  periodo_inicio: string;
  periodo_fim: string;
  itens: Array<{
    id: number;
    prestador_nome: string;
    tipo_item: "valor_hora" | "valor_combustivel" | "valor_urgencia";
    valor_anterior: number;
    indice_ipca: number;
    percentual_acumulado: number;
    valor_novo: number;
    economia: number; // diferença entre reajuste total e IPCA puro
    data_reajuste: string;
  }>;
  resumo: {
    total_itens_reajustados: number;
    total_reajuste: number;
    indice_medio_ipca: number;
    valor_economia_total: number;
  };
}

export interface ProvisaoImposto {
  periodo: string;
  prestadores: Array<{
    prestador_id: number;
    nome: string;
    faturamento_bruto: number;
    deducoes_permitidas: number;
    base_tributavel: number;
    aliquota_efetiva: number;
    imposto_estimado: number;
    provisao_irpj: number;
    provisao_pis: number;
    provisao_cofins: number;
    provisao_total: number;
    observacoes?: string;
  }>;
  totalizadores: {
    faturamento_bruto_total: number;
    deducoes_total: number;
    base_tributavel_total: number;
    provisao_irpj_total: number;
    provisao_pis_total: number;
    provisao_cofins_total: number;
    provisao_total_geral: number;
  };
}

// ============================================================================
// REPORT FUNCTIONS
// ============================================================================

/** Intervalo de datas de um período contábil.
 *
 * periodos_contabeis guarda ano/mes — nem o schema de produção nem o de teste têm
 * data_inicio/data_fim. Este módulo consultava essas duas colunas e portanto falhava
 * com "no such column" contra qualquer banco real, não só no teste. O restante do
 * código (ledger.ts) já lê ano/mes; aqui passa a derivar o intervalo deles. */
function intervaloDoPeriodo(periodo?: { ano: number; mes: number }): { inicio: string; fim: string } {
  if (!periodo) return { inicio: "", fim: "" };
  const mes = String(periodo.mes).padStart(2, "0");
  const ultimoDia = new Date(periodo.ano, periodo.mes, 0).getDate();
  return {
    inicio: `${periodo.ano}-${mes}-01`,
    fim: `${periodo.ano}-${mes}-${String(ultimoDia).padStart(2, "0")}`,
  };
}

/**
 * Relatório 1: Resumo de Apontamentos
 * Análise agregada por tipo de apontamento e prestador
 */
export function relatorioResumoApontamentos(
  db: Database,
  entidade_id: number,
  periodo_id: number,
): ResumoApontamentos {
  const builder = new RelatorioBuilder(
    "Resumo de Apontamentos",
    "apontamento-prestador"
  );

  // Buscar período
  const [periodo] = consultar<{ ano: number; mes: number }>(
    db,
    `SELECT ano, mes FROM periodos_contabeis WHERE id = ?`,
    [periodo_id]
  );
  const intervalo = intervaloDoPeriodo(periodo);

  // Total de apontamentos por tipo
  const [urgencias] = consultar<{ qtd: number; valor: number }>(
    db,
    `SELECT COUNT(*) as qtd, COALESCE(SUM(valor_total), 0) as valor
     FROM apontamentos_urgencia
     WHERE entidade_id = ? AND periodo_id = ?`,
    [entidade_id, periodo_id]
  );

  const [airbnb] = consultar<{ qtd: number; valor: number }>(
    db,
    `SELECT COUNT(*) as qtd, COALESCE(SUM(valor_total), 0) as valor
     FROM apontamentos_airbnb
     WHERE entidade_id = ? AND periodo_id = ?`,
    [entidade_id, periodo_id]
  );

  const [combustivel] = consultar<{
    qtd: number;
    valor: number;
    km: number;
  }>(
    db,
    `SELECT COUNT(*) as qtd, COALESCE(SUM(valor_total), 0) as valor, COALESCE(SUM(km_percorrido), 0) as km
     FROM apontamentos_combustivel
     WHERE entidade_id = ? AND periodo_id = ?`,
    [entidade_id, periodo_id]
  );

  const [horas] = consultar<{ qtd: number; valor: number; hrs: number }>(
    db,
    `SELECT COUNT(*) as qtd, COALESCE(SUM(valor_total), 0) as valor, COALESCE(SUM(horas_efetivas), 0) as hrs
     FROM apontamentos_horas
     WHERE entidade_id = ? AND periodo_id = ?`,
    [entidade_id, periodo_id]
  );

  const [emprestimo] = consultar<{ qtd: number; valor: number }>(
    db,
    `SELECT COUNT(*) as qtd, COALESCE(SUM(valor_parcela), 0) as valor
     FROM emprestimos_parcelas
     WHERE entidade_id = ? AND periodo_id = ?`,
    [entidade_id, periodo_id]
  );

  // Prestadores ativos
  const prestadores = consultar<{
    prestador_id: number;
    nome: string;
    qtd: number;
    valor: number;
  }>(
    db,
    `SELECT DISTINCT p.id as prestador_id, p.nome,
            COUNT(DISTINCT a.id) as qtd, COALESCE(SUM(a.valor_total), 0) as valor
     FROM prestadores p
     LEFT JOIN apontamentos_urgencia a ON p.id = a.prestador_id AND a.entidade_id = ? AND a.periodo_id = ?
     WHERE p.entidade_id = ?
     GROUP BY p.id
     HAVING COUNT(a.id) > 0
     ORDER BY valor DESC`,
    [entidade_id, periodo_id, entidade_id]
  );

  const totalPago =
    (urgencias?.valor || 0) +
    (airbnb?.valor || 0) +
    (combustivel?.valor || 0) +
    (horas?.valor || 0) +
    (emprestimo?.valor || 0);

  const result: ResumoApontamentos = {
    periodo_inicio: intervalo.inicio,
    periodo_fim: intervalo.fim,
    prestadores_ativos: prestadores.length,
    total_apontamentos:
      (urgencias?.qtd || 0) +
      (airbnb?.qtd || 0) +
      (combustivel?.qtd || 0) +
      (horas?.qtd || 0) +
      (emprestimo?.qtd || 0),
    valor_total_pago: totalPago,
    por_tipo: {
      urgencias: {
        quantidade: urgencias?.qtd || 0,
        valor: urgencias?.valor || 0,
        valor_medio: (urgencias?.qtd || 0) > 0 ? (urgencias?.valor || 0) / (urgencias?.qtd || 1) : 0,
      },
      airbnb: {
        quantidade: airbnb?.qtd || 0,
        valor: airbnb?.valor || 0,
        valor_medio: (airbnb?.qtd || 0) > 0 ? (airbnb?.valor || 0) / (airbnb?.qtd || 1) : 0,
      },
      combustivel: {
        quantidade: combustivel?.qtd || 0,
        valor: combustivel?.valor || 0,
        km_total: combustivel?.km || 0,
        km_medio: (combustivel?.qtd || 0) > 0 ? (combustivel?.km || 0) / (combustivel?.qtd || 1) : 0,
      },
      horas: {
        quantidade: horas?.qtd || 0,
        valor: horas?.valor || 0,
        horas_total: horas?.hrs || 0,
        horas_media: (horas?.qtd || 0) > 0 ? (horas?.hrs || 0) / (horas?.qtd || 1) : 0,
      },
      emprestimo: {
        quantidade: emprestimo?.qtd || 0,
        valor_devido: emprestimo?.valor || 0,
        valor_pago: 0,
      },
    },
    prestadores: prestadores.map((p) => ({
      prestador_id: p.prestador_id,
      nome: p.nome,
      total_apontamentos: p.qtd,
      valor_total: p.valor,
      ultimos_30_dias: 0,
    })),
  };

  return result;
}

/**
 * Relatório 2: Despesas de Remuneração Detalhado
 * Análise consolidada de todos os tipos de despesa por prestador
 */
export function relatorioDespesasRemuneracao(
  db: Database,
  entidade_id: number,
  periodo_id: number,
): DespesasRemuneracao {
  const builder = new RelatorioBuilder(
    "Despesas de Remuneração",
    "apontamento-prestador"
  );

  const [periodo] = consultar<{ mes: number; ano: number }>(
    db,
    `SELECT mes, ano FROM periodos_contabeis WHERE id = ?`,
    [periodo_id]
  );

  // Urgências
  const urgencias = consultar<{
    data: string;
    valor: number;
    minutos: number;
    domingo: boolean;
    descricao: string;
  }>(
    db,
    `SELECT data, valor_total as valor, minutos_trabalhados as minutos,
            eh_domingo as domingo, '' as descricao
     FROM apontamentos_urgencia
     WHERE entidade_id = ? AND periodo_id = ?
     ORDER BY data`,
    [entidade_id, periodo_id]
  );

  const totalUrgencias = urgencias.reduce((sum, u) => sum + u.valor, 0);

  // Airbnb
  const airbnb = consultar<{
    data: string;
    tipo_servico: string;
    valor: number;
    numero_quartos: number;
  }>(
    db,
    `SELECT data, tipo_servico, valor_total as valor, numero_quartos
     FROM apontamentos_airbnb
     WHERE entidade_id = ? AND periodo_id = ?
     ORDER BY data`,
    [entidade_id, periodo_id]
  );

  const totalAirbnb = airbnb.reduce((sum, a) => sum + a.valor, 0);

  // Combustível
  const combustivel = consultar<{
    data: string;
    km_percorrido: number;
    valor: number;
    valor_litro: number;
  }>(
    db,
    `SELECT data, km_percorrido, valor_total as valor, valor_litro
     FROM apontamentos_combustivel
     WHERE entidade_id = ? AND periodo_id = ?
     ORDER BY data`,
    [entidade_id, periodo_id]
  );

  const totalCombustivel = combustivel.reduce((sum, c) => sum + c.valor, 0);

  // Horas
  const horas = consultar<{
    data: string;
    horas_efetivas: number;
    valor_hora: number;
    valor: number;
  }>(
    db,
    `SELECT data, horas_efetivas, 0 as valor_hora, valor_total as valor
     FROM apontamentos_horas
     WHERE entidade_id = ? AND periodo_id = ?
     ORDER BY data`,
    [entidade_id, periodo_id]
  );

  const totalHoras = horas.reduce((sum, h) => sum + h.valor, 0);

  // Empréstimo
  const emprestimo = consultar<{
    mes: string;
    parcela_numero: number;
    principal: number;
    juros: number;
    valor: number;
  }>(
    db,
    `SELECT strftime('%Y-%m', data_vencimento) as mes, numero as parcela_numero,
            principal, juros, valor_parcela as valor
     FROM emprestimos_parcelas
     WHERE entidade_id = ? AND periodo_id = ?
     ORDER BY data_vencimento`,
    [entidade_id, periodo_id]
  );

  const totalEmprestimo = emprestimo.reduce((sum, e) => sum + e.valor, 0);

  const totalGeral =
    totalUrgencias + totalAirbnb + totalCombustivel + totalHoras + totalEmprestimo;

  const result: DespesasRemuneracao = {
    periodo: `${periodo?.mes || ""}/${periodo?.ano || ""}`,
    total_geral: totalGeral,
    distribuicao: {
      urgencias: {
        valor: totalUrgencias,
        percentual: totalGeral > 0 ? totalUrgencias / totalGeral : 0,
        detalhamento: urgencias.map((u) => ({
          data: u.data,
          valor: u.valor,
          duracao_minutos: u.minutos,
          eh_domingo: u.domingo || false,
          descricao: u.descricao,
        })),
      },
      airbnb: {
        valor: totalAirbnb,
        percentual: totalGeral > 0 ? totalAirbnb / totalGeral : 0,
        detalhamento: airbnb.map((a) => ({
          data: a.data,
          tipo_servico: a.tipo_servico,
          valor: a.valor,
          numero_quartos: a.numero_quartos,
        })),
      },
      combustivel: {
        valor: totalCombustivel,
        percentual: totalGeral > 0 ? totalCombustivel / totalGeral : 0,
        detalhamento: combustivel.map((c) => ({
          data: c.data,
          km_percorrido: c.km_percorrido,
          valor: c.valor,
          valor_litro: c.valor_litro,
        })),
      },
      horas: {
        valor: totalHoras,
        percentual: totalGeral > 0 ? totalHoras / totalGeral : 0,
        detalhamento: horas.map((h) => ({
          data: h.data,
          horas: h.horas_efetivas,
          valor_hora: h.valor_hora || 0,
          valor: h.valor,
        })),
      },
      emprestimo: {
        valor: totalEmprestimo,
        percentual: totalGeral > 0 ? totalEmprestimo / totalGeral : 0,
        detalhamento: emprestimo.map((e) => ({
          mes: e.mes,
          parcela_numero: e.parcela_numero,
          principal: e.principal,
          juros: e.juros,
          valor: e.valor,
        })),
      },
    },
  };

  return result;
}

/**
 * Relatório 3: Rastreamento de Reembolsos
 * Status de aprovação e rejeição de despesas
 */
export function relatorioReembolsos(
  db: Database,
  entidade_id: number,
  periodo_id: number,
): Reembolsos {
  const reembolsos = consultar<{
    id: number;
    data_solicitacao: string;
    tipo_despesa: string;
    valor_solicitado: number;
    valor_aprovado: number;
    // Estava tipado como `string` genérico, mais largo que o union de Reembolsos.linhas —
    // a coluna `status` só assume estes 3 valores (ver CHECK/uso em toda a tabela reembolsos).
    status: "pendente" | "aprovado" | "rejeitado";
    justificativa?: string;
    observacoes?: string;
    prestador_nome: string;
  }>(
    db,
    `SELECT r.id, r.data_solicitacao, r.tipo_despesa, r.valor_solicitado,
            COALESCE(r.valor_aprovado, 0) as valor_aprovado, r.status,
            r.justificativa, r.observacoes, p.nome as prestador_nome
     FROM reembolsos r
     LEFT JOIN prestadores p ON r.prestador_id = p.id
     WHERE r.entidade_id = ? AND r.periodo_id = ?
     ORDER BY r.data_solicitacao DESC`,
    [entidade_id, periodo_id]
  );

  const totalSolicitado = reembolsos.reduce(
    (sum, r) => sum + r.valor_solicitado,
    0
  );
  const totalAprovado = reembolsos.reduce(
    (sum, r) => sum + r.valor_aprovado,
    0
  );
  const totalRejeitado = reembolsos
    .filter((r) => r.status === "rejeitado")
    .reduce((sum, r) => sum + r.valor_solicitado, 0);
  const pendente = reembolsos
    .filter((r) => r.status === "pendente")
    .reduce((sum, r) => sum + r.valor_solicitado, 0);

  return {
    periodo: "Período Geral",
    total_solicitado: totalSolicitado,
    total_aprovado: totalAprovado,
    total_rejeitado: totalRejeitado,
    pendente_aprovacao: pendente,
    linhas: reembolsos,
  };
}

/**
 * Relatório 4: Comparativo entre Provedores
 * Matriz de comparação pessoa vs pessoa
 */
export function relatorioComparativoProvedor(
  db: Database,
  entidade_id: number,
  periodo_id: number,
): ComparativoProvedor {
  const prestadores = consultar<{
    prestador_id: number;
    nome: string;
  }>(db, `SELECT id as prestador_id, nome FROM prestadores WHERE entidade_id = ?`, [
    entidade_id,
  ]);

  const [periodo] = consultar<{ mes: number; ano: number }>(
    db,
    `SELECT mes, ano FROM periodos_contabeis WHERE id = ?`,
    [periodo_id]
  );

  const relatorios = prestadores.map((prest) => {
    // Total de apontamentos
    const [totalAponts] = consultar<{ total: number }>(
      db,
      `SELECT COUNT(*) as total FROM apontamentos_urgencia
       WHERE prestador_id = ? AND entidade_id = ? AND periodo_id = ?`,
      [prest.prestador_id, entidade_id, periodo_id]
    );

    // Total pago
    const [totalPago] = consultar<{ valor: number }>(
      db,
      `SELECT COALESCE(SUM(valor_total), 0) as valor FROM apontamentos_urgencia
       WHERE prestador_id = ? AND entidade_id = ? AND periodo_id = ?
       UNION ALL
       SELECT COALESCE(SUM(valor_total), 0) FROM apontamentos_airbnb
       WHERE prestador_id = ? AND entidade_id = ? AND periodo_id = ?`,
      [
        prest.prestador_id,
        entidade_id,
        periodo_id,
        prest.prestador_id,
        entidade_id,
        periodo_id,
      ]
    );

    // Rejeições
    const [rejeicoes] = consultar<{ qtd: number }>(
      db,
      `SELECT COUNT(*) as qtd FROM apontamentos_urgencia
       WHERE prestador_id = ? AND requer_analise = 1 AND entidade_id = ? AND periodo_id = ?`,
      [prest.prestador_id, entidade_id, periodo_id]
    );

    const totalApts = totalAponts?.total || 0;
    const valorMedio = totalApts > 0 ? (totalPago?.valor || 0) / totalApts : 0;

    return {
      prestador_id: prest.prestador_id,
      nome: prest.nome,
      total_apontamentos: totalApts,
      total_pago: totalPago?.valor || 0,
      valor_medio_apontamento: valorMedio,
      produtividade_score: Math.min(100, (totalApts / 50) * 100),
      tipos_servicos: {
        urgencias: totalApts,
        airbnb: 0,
        combustivel: 0,
        horas: 0,
        emprestimo: 0,
      },
      compliance_score: Math.max(
        0,
        100 - ((rejeicoes?.qtd || 0) / totalApts) * 100
      ),
      taxa_aprovacao: totalApts > 0 ? ((totalApts - (rejeicoes?.qtd || 0)) / totalApts) * 100 : 100,
    };
  });

  const agregados = {
    prestador_mais_ativo: relatorios.length > 0 ? {
      nome: relatorios[0].nome,
      total: relatorios[0].total_apontamentos,
    } : { nome: "", total: 0 },
    prestador_mais_produtivo: relatorios.length > 0 ? {
      nome: relatorios.sort(
        (a, b) => b.valor_medio_apontamento - a.valor_medio_apontamento
      )[0].nome,
      valor_medio: relatorios[0].valor_medio_apontamento,
    } : { nome: "", valor_medio: 0 },
    prestador_maior_taxa_rejeicao: relatorios.length > 0 ? {
      nome: relatorios.sort((a, b) => a.taxa_aprovacao - b.taxa_aprovacao)[0].nome,
      taxa: 100 - relatorios.sort((a, b) => a.taxa_aprovacao - b.taxa_aprovacao)[0].taxa_aprovacao,
    } : { nome: "", taxa: 0 },
  };

  return {
    periodo: `${periodo?.mes}/${periodo?.ano}`,
    prestadores: relatorios,
    agregados,
  };
}

/**
 * Relatório 5: Acúmulo IPCA
 * Rastreamento de impacto de reajustes por IPCA
 */
export function relatorioAcumuloIPCA(
  db: Database,
  entidade_id: number,
  periodo_id: number,
): AcumuloIPCA {
  const [periodo] = consultar<{ ano: number; mes: number }>(
    db,
    `SELECT ano, mes FROM periodos_contabeis WHERE id = ?`,
    [periodo_id]
  );
  const intervalo = intervaloDoPeriodo(periodo);

  const reajustes = consultar<{
    id: number;
    prestador_nome: string;
    tipo_item: string;
    valor_anterior: number;
    indice_ipca: number;
    valor_novo: number;
    data_reajuste: string;
  }>(
    db,
    `SELECT mr.id, p.nome as prestador_nome, tipo_item, valor_anterior, indice_ipca,
            valor_novo, data_reajuste
     FROM memorias_reajuste mr
     LEFT JOIN prestadores p ON mr.prestador_id = p.id
     WHERE mr.entidade_id = ? AND mr.periodo_id = ?
     ORDER BY mr.data_reajuste DESC`,
    [entidade_id, periodo_id]
  );

  const itens = reajustes.map((r) => {
    const percentualAcumulado = r.valor_anterior > 0 ? (r.valor_novo - r.valor_anterior) / r.valor_anterior : 0;
    const economia = r.valor_novo - (r.valor_anterior * (1 + r.indice_ipca / 100));

    return {
      id: r.id,
      prestador_nome: r.prestador_nome || "Desconhecido",
      tipo_item: r.tipo_item as any,
      valor_anterior: r.valor_anterior,
      indice_ipca: r.indice_ipca,
      percentual_acumulado: percentualAcumulado,
      valor_novo: r.valor_novo,
      economia,
      data_reajuste: r.data_reajuste,
    };
  });

  const totalReajuste = itens.reduce((sum, i) => sum + (i.valor_novo - i.valor_anterior), 0);
  const indiceMedio = itens.length > 0 ? itens.reduce((sum, i) => sum + i.indice_ipca, 0) / itens.length : 0;
  const economiaTotal = itens.reduce((sum, i) => sum + i.economia, 0);

  return {
    periodo_inicio: intervalo.inicio,
    periodo_fim: intervalo.fim,
    itens,
    resumo: {
      total_itens_reajustados: itens.length,
      total_reajuste: totalReajuste,
      indice_medio_ipca: indiceMedio,
      valor_economia_total: economiaTotal,
    },
  };
}

/**
 * Relatório 6: Provisão de Impostos
 * Cálculo de IRPJ, PIS e COFINS por prestador
 */
export function relatorioProvisaoImposto(
  db: Database,
  entidade_id: number,
  periodo_id: number,
): ProvisaoImposto {
  const prestadores = consultar<{ id: number; nome: string }>(
    db,
    `SELECT id, nome FROM prestadores WHERE entidade_id = ?`,
    [entidade_id]
  );

  const [periodo] = consultar<{ mes: number; ano: number }>(
    db,
    `SELECT mes, ano FROM periodos_contabeis WHERE id = ?`,
    [periodo_id]
  );

  let irpjTotal = 0,
    pisTotal = 0,
    cofinsTotal = 0,
    faturamentoTotal = 0,
    deducoesTotal = 0,
    provisaoTotal = 0;

  const prestadoresCompostos = prestadores.map((prest) => {
    // Faturamento bruto (todos os apontamentos)
    const [faturamento] = consultar<{ valor: number }>(
      db,
      `SELECT COALESCE(SUM(u.valor_total + COALESCE(a.valor_total, 0) + COALESCE(c.valor_total, 0) + COALESCE(h.valor_total, 0)), 0) as valor
       FROM apontamentos_urgencia u
       LEFT JOIN apontamentos_airbnb a ON u.prestador_id = a.prestador_id
       LEFT JOIN apontamentos_combustivel c ON u.prestador_id = c.prestador_id
       LEFT JOIN apontamentos_horas h ON u.prestador_id = h.prestador_id
       WHERE u.prestador_id = ? AND u.entidade_id = ? AND u.periodo_id = ?`,
      [prest.id, entidade_id, periodo_id]
    );

    const faturamentoBruto = faturamento?.valor || 0;
    const deducoes = faturamentoBruto * 0.15; // 15% de deduções (simplificado)
    const baseTributavel = faturamentoBruto - deducoes;

    // Alíquotas (exemplos simplificados)
    const aliquotaIRPJ = 0.15;
    const aliquotaPIS = 0.0165;
    const aliquotaCOFINS = 0.076;

    const impostoIRPJ = baseTributavel * aliquotaIRPJ;
    const impostoPIS = baseTributavel * aliquotaPIS;
    const impostoCOFINS = baseTributavel * aliquotaCOFINS;
    const provisaoTotalPrest = impostoIRPJ + impostoPIS + impostoCOFINS;

    irpjTotal += impostoIRPJ;
    pisTotal += impostoPIS;
    cofinsTotal += impostoCOFINS;
    faturamentoTotal += faturamentoBruto;
    deducoesTotal += deducoes;
    provisaoTotal += provisaoTotalPrest;

    return {
      prestador_id: prest.id,
      nome: prest.nome,
      faturamento_bruto: faturamentoBruto,
      deducoes_permitidas: deducoes,
      base_tributavel: baseTributavel,
      aliquota_efetiva: baseTributavel > 0 ? provisaoTotalPrest / baseTributavel : 0,
      imposto_estimado: provisaoTotalPrest,
      provisao_irpj: impostoIRPJ,
      provisao_pis: impostoPIS,
      provisao_cofins: impostoCOFINS,
      provisao_total: provisaoTotalPrest,
    };
  });

  return {
    periodo: `${periodo?.mes || ""}/${periodo?.ano || ""}`,
    prestadores: prestadoresCompostos,
    totalizadores: {
      faturamento_bruto_total: faturamentoTotal,
      deducoes_total: deducoesTotal,
      base_tributavel_total: faturamentoTotal - deducoesTotal,
      provisao_irpj_total: irpjTotal,
      provisao_pis_total: pisTotal,
      provisao_cofins_total: cofinsTotal,
      provisao_total_geral: provisaoTotal,
    },
  };
}

// ============================================================================
// EXPORTS AUXILIARES
// ============================================================================

export type parcelas = number; // temporary fix for missing type
