/**
 * Report Formatter Service
 *
 * Responsável por formatar dados de relatórios para exibição
 *
 * Funções:
 * - Formatar relatório executivo em estrutura final
 * - Gerar HTML/PDF
 * - Formatar alertas
 * - Gerar sumário executivo
 */


import { logger } from "../../services/logger-service.js";
import type { DREResumo } from "./dre-calculator-service.js";
import type { FluxoResumo } from "./cash-flow-service.js";
import type { MargensPorPropriedadeResumo } from "./margins-service.ts";
import type { ContasResumo } from "./accounts-service.js";

export interface AlertaExecutivo {
  tipo: "crítico" | "aviso" | "info";
  titulo: string;
  descricao: string;
  valor?: number;
  recomendacao?: string;
}

export interface SumarioExecutivo {
  taxaOcupacao: number; // % de imóveis alugados
  inadimplencia: number; // %
  diasDeCaixaDisponivel: number;
  statusGeral: "OK" | "ATENÇÃO" | "CRÍTICO";
  alertasTopCinco: AlertaExecutivo[];
}

export interface RelatorioExecutivoFormatado {
  periodo: string; // YYYY-MM
  mes: number;
  ano: number;
  dre: DREResumo;
  fluxo: FluxoResumo;
  margens: MargensPorPropriedadeResumo;
  alertas: AlertaExecutivo[];
  contas: ContasResumo;
  sumario: SumarioExecutivo;
  criadoEm: string; // ISO timestamp
}

/**
 * Gera alertas executivos baseado nos dados do relatório
 */
export function gerarAlertasExecutivos(
  dreResumo: DREResumo,
  fluxoResumo: FluxoResumo,
  margensResumo: MargensPorPropriedadeResumo,
  contasResumo: ContasResumo,
): AlertaExecutivo[] {
  const alertas: AlertaExecutivo[] = [];

  // Alerta de fluxo de caixa negativo
  if (fluxoResumo.diasAteSaldoNegativo !== null) {
    alertas.push({
      tipo: "crítico",
      titulo: "Projeção de Caixa Negativa",
      descricao: `Projeção indica saldo negativo em ${fluxoResumo.diasAteSaldoNegativo} dias`,
      valor: fluxoResumo.projecao30dias,
      recomendacao: "Considere refinanciamento ou renegociação de despesas",
    });
  }

  // Alerta de margens baixas
  if (margensResumo.mediaGeral < 0.1) {
    alertas.push({
      tipo: "crítico",
      titulo: "Margens Muito Baixas",
      descricao: `Margem média de ${(margensResumo.mediaGeral * 100).toFixed(2)}% está crítica`,
      valor: margensResumo.mediaGeral,
      recomendacao: "Revisar estratégia de precificação ou reduzir custos",
    });
  }

  // Alerta de contas vencidas
  if (contasResumo.aReceber.percentualVencido > 20) {
    alertas.push({
      tipo: "aviso",
      titulo: "Alta Taxa de Contas Vencidas",
      descricao: `${contasResumo.aReceber.percentualVencido}% das contas a receber estão vencidas`,
      valor: contasResumo.aReceber.vencido,
    });
  }

  // Alerta de receita em queda
  if (dreResumo.variacao.mesAnterior < -10) {
    alertas.push({
      tipo: "aviso",
      titulo: "Receita em Queda",
      descricao: `Receita caiu ${Math.abs(dreResumo.variacao.mesAnterior).toFixed(2)}% comparado ao mês anterior`,
      valor: dreResumo.receitaTotal,
    });
  }

  // Alerta informativo de lucro baixo
  if (dreResumo.lucroLiquido < 1000) {
    alertas.push({
      tipo: "info",
      titulo: "Lucro Líquido Abaixo do Esperado",
      descricao: `Lucro líquido de R$ ${dreResumo.lucroLiquido.toFixed(2)} está abaixo do esperado`,
      valor: dreResumo.lucroLiquido,
    });
  }

  return alertas.sort((a, b) => {
    const severidade = { crítico: 0, aviso: 1, info: 2 };
    return severidade[a.tipo] - severidade[b.tipo];
  });
}

/**
 * Gera sumário executivo
 */
export function gerarSumario(
  dreResumo: DREResumo,
  fluxoResumo: FluxoResumo,
  margensResumo: MargensPorPropriedadeResumo,
  contasResumo: ContasResumo,
  alertas: AlertaExecutivo[],
): SumarioExecutivo {
  try {
    // Taxa de ocupação (placeholder - implementar cálculo real)
    const taxaOcupacao = margensResumo.total > 0 ? 85 : 0;

    // Inadimplência
    const inadimplencia = contasResumo.aReceber.percentualVencido;

    // Dias de caixa
    const despesaDiaria = contasResumo.aPagar.total > 0 ? contasResumo.aPagar.total / 30 : 1;
    const diasDeCaixaDisponivel = Math.floor(fluxoResumo.saldoAtual / despesaDiaria);

    // Status geral
    let statusGeral: "OK" | "ATENÇÃO" | "CRÍTICO" = "OK";
    const alertasCriticos = alertas.filter((a) => a.tipo === "crítico");
    const alertasAvisos = alertas.filter((a) => a.tipo === "aviso");

    if (alertasCriticos.length > 0) {
      statusGeral = "CRÍTICO";
    } else if (alertasAvisos.length > 1) {
      statusGeral = "ATENÇÃO";
    }

    // Top 5 alertas
    const alertasTopCinco = alertas.slice(0, 5);

    return {
      taxaOcupacao,
      inadimplencia,
      diasDeCaixaDisponivel,
      statusGeral,
      alertasTopCinco,
    };
  } catch (erro) {
    logger.error("[ReportFormatterService] Erro ao gerar sumário:", erro);
    return {
      taxaOcupacao: 0,
      inadimplencia: 0,
      diasDeCaixaDisponivel: 0,
      statusGeral: "CRÍTICO",
      alertasTopCinco: [],
    };
  }
}

/**
 * Formata relatório executivo completo
 */
export function formatarRelatorioExecutivo(
  mes: number,
  ano: number,
  dreResumo: DREResumo,
  fluxoResumo: FluxoResumo,
  margensResumo: MargensPorPropriedadeResumo,
  contasResumo: ContasResumo,
): RelatorioExecutivoFormatado {
  const alertas = gerarAlertasExecutivos(dreResumo, fluxoResumo, margensResumo, contasResumo);
  const sumario = gerarSumario(dreResumo, fluxoResumo, margensResumo, contasResumo, alertas);

  return {
    periodo: `${ano}-${String(mes).padStart(2, "0")}`,
    mes,
    ano,
    dre: dreResumo,
    fluxo: fluxoResumo,
    margens: margensResumo,
    alertas,
    contas: contasResumo,
    sumario,
    criadoEm: new Date().toISOString(),
  };
}

/**
 * Gera HTML formatado para o relatório
 */
export function gerarHTMLRelatorio(relatorio: RelatorioExecutivoFormatado): string {
  try {
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório Executivo ${relatorio.periodo}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 30px; }
    .metric { display: inline-block; margin: 10px 20px; }
    .metric-value { font-size: 24px; font-weight: bold; color: #007bff; }
    .metric-label { font-size: 12px; color: #666; }
    .alert { padding: 10px; margin: 10px 0; border-radius: 4px; }
    .alert.critico { background-color: #f8d7da; border-left: 4px solid #dc3545; }
    .alert.aviso { background-color: #fff3cd; border-left: 4px solid #ffc107; }
    .alert.info { background-color: #d1ecf1; border-left: 4px solid #17a2b8; }
  </style>
</head>
<body>
  <h1>Relatório Executivo - ${relatorio.periodo}</h1>

  <h2>Sumário Executivo</h2>
  <div>
    <div class="metric">
      <div class="metric-value">${relatorio.sumario.statusGeral}</div>
      <div class="metric-label">Status Geral</div>
    </div>
    <div class="metric">
      <div class="metric-value">${relatorio.sumario.inadimplencia}%</div>
      <div class="metric-label">Inadimplência</div>
    </div>
    <div class="metric">
      <div class="metric-value">${relatorio.sumario.diasDeCaixaDisponivel}</div>
      <div class="metric-label">Dias de Caixa</div>
    </div>
  </div>

  <h2>Alertas</h2>
  ${relatorio.alertas.map((a) => `
    <div class="alert ${a.tipo}">
      <strong>${a.titulo}</strong><br>
      ${a.descricao}
      ${a.recomendacao ? `<br><em>${a.recomendacao}</em>` : ""}
    </div>
  `).join("")}

  <h2>Demonstração de Resultado</h2>
  <div class="metric">
    <div class="metric-value">R$ ${relatorio.dre.receitaTotal.toFixed(2)}</div>
    <div class="metric-label">Receita Total</div>
  </div>
  <div class="metric">
    <div class="metric-value">R$ ${relatorio.dre.despesaTotal.toFixed(2)}</div>
    <div class="metric-label">Despesa Total</div>
  </div>
  <div class="metric">
    <div class="metric-value">R$ ${relatorio.dre.lucroLiquido.toFixed(2)}</div>
    <div class="metric-label">Lucro Líquido</div>
  </div>

  <p style="margin-top: 40px; font-size: 12px; color: #999;">
    Gerado em: ${new Date(relatorio.criadoEm).toLocaleString("pt-BR")}
  </p>
</body>
</html>
    `;
    return html;
  } catch (erro) {
    logger.error("[ReportFormatterService] Erro ao gerar HTML:", erro);
    return "<p>Erro ao gerar relatório</p>";
  }
}
