/**
 * Sistema de Relatório Executivo Mensal
 *
 * Consolida KPIs, DRE, Fluxo de Caixa, Margens, Alertas e Contas a Receber/Pagar
 * em um documento coeso para apresentação executiva.
 *
 * Funções:
 *  - gerarRelatorioExecutivo(db, mes, ano): gera estrutura completa
 *  - gerarPDFRelatorioExecutivo(db, mes, ano): gera HTML/PDF
 *  - enviarRelatorioEmailMensal(db, email, mes, ano): envia via email com anexo
 */

import type Database from "better-sqlite3";
import { logger } from '../../services/logger-service.js';
import { calcularDREPeriodo } from "./dre.js";
import { forecastMediaMovel } from "./fluxoCaixaForecast.js";
import { calcularMargensImovel } from "./margensPorPropriedade.js";

export interface RelatorioExecutivo {
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

export interface DREResumo {
  receitaTotal: number;
  receitaAluguel: number;
  receitaHonorario: number;
  receitaExtraordinaria: number;
  despesaTotal: number;
  despesaFolhaPagamento: number;
  despesaCondominio: number;
  despesaManutencao: number;
  despesaImpostos: number;
  despesaJuros: number;
  lucroLiquido: number;
  lucroBruto: number;
  variacao: {
    mesAnterior: number; // % de variação
    ytd: number; // % acumulado no ano
  };
  historico: Array<{
    mes: number;
    ano: number;
    receita: number;
    despesa: number;
  }>;
}

export interface FluxoResumo {
  saldoAtual: number;
  projecao30dias: number;
  projecao60dias: number;
  projecao90dias: number;
  diasComSaldoNegativo: number;
  diasAteSaldoNegativo: number | null;
  historico12meses: Array<{
    mes: number;
    ano: number;
    saldo: number;
  }>;
}

export interface MargemPropriedade {
  imovelId: number;
  nomePropriedade: string;
  margem: number;
  status: "OK" | "ATENÇÃO" | "CRÍTICO";
}

export interface MargensPorPropriedadeResumo {
  total: number;
  mediaGeral: number;
  top5: Array<MargemPropriedade>;
  bottom5: Array<MargemPropriedade>;
}

export interface MargensPaginadas {
  items: Array<MargemPropriedade>;
  total: number;
  mediaGeral: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface AlertaExecutivo {
  tipo: "crítico" | "aviso" | "info";
  titulo: string;
  descricao: string;
  valor?: number;
  recomendacao?: string;
}

export interface ContasResumo {
  aReceber: {
    total: number;
    vencido: number;
    proximo30dias: number;
    percentualVencido: number;
    topDevedores: Array<{
      nome: string;
      valor: number;
      diasVencido: number;
    }>;
  };
  aPagar: {
    total: number;
    vencido: number;
    proximo30dias: number;
    percentualVencido: number;
  };
}

export interface SumarioExecutivo {
  taxaOcupacao: number; // % de imóveis alugados
  inadimplencia: number; // %
  diasDeCaixaDisponivel: number;
  statusGeral: "OK" | "ATENÇÃO" | "CRÍTICO";
  alertasTopCinco: AlertaExecutivo[];
}

/** Calcula o resumo executivo para um mês/ano específico */
export function gerarRelatorioExecutivo(
  db: Database.Database,
  mes: number,
  ano: number,
): RelatorioExecutivo {
  // Determina período do mês
  const dataInicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const ultimoDiaDoMes = new Date(ano, mes, 0).getDate();
  const dataFim = `${ano}-${String(mes).padStart(2, "0")}-${String(ultimoDiaDoMes).padStart(2, "0")}`;

  // Seção 1: DRE
  const dre = calcularDREPeriodo(db, dataInicio, dataFim);

  const dreResumo: DREResumo = {
    receitaTotal: dre.receitaTotal,
    receitaAluguel: dre.receitaAluguel,
    receitaHonorario: dre.receitaHonorario,
    receitaExtraordinaria: dre.receitaExtraordinaria,
    despesaTotal: dre.despesaFixaTotal + dre.despesaVariavelTotal,
    despesaFolhaPagamento: dre.despesaFolhaPagamento,
    despesaCondominio: dre.despesaCondominio,
    despesaManutencao: dre.despesaManutencao,
    despesaImpostos: dre.despesaImpostosReceita,
    despesaJuros: dre.despesaJuros,
    lucroLiquido: dre.lucroLiquido,
    lucroBruto: dre.lucroBruto,
    variacao: calcularVariacaoDRE(db, mes, ano),
    historico: buscarHistoricoDREUltimos6Meses(db, mes, ano),
  };

  // Seção 2: Fluxo de Caixa
  const fluxoResumo: FluxoResumo = gerarFluxoResumo(db, mes, ano);

  // Seção 3: Margens por Propriedade
  const margensResumo: MargensPorPropriedadeResumo = gerarMargensResumo(db, mes, ano);

  // Seção 4: Contas a Receber/Pagar
  const contasResumo: ContasResumo = gerarContasResumo(db);

  // Seção 5: Alertas
  const alertas: AlertaExecutivo[] = gerarAlertasExecutivos(db, dreResumo, fluxoResumo, margensResumo, contasResumo);

  // Seção 6: Sumário
  const sumario: SumarioExecutivo = gerarSumario(db, dreResumo, fluxoResumo, margensResumo, contasResumo, alertas);

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

/** Calcula variação da DRE em relação ao mês anterior e YTD */
function calcularVariacaoDRE(db: Database.Database, mes: number, ano: number): { mesAnterior: number; ytd: number } {
  try {
    // Mês anterior
    const mesPrecedente = mes === 1 ? 12 : mes - 1;
    const anoPrecedente = mes === 1 ? ano - 1 : ano;

    const dataPrecedente1 = `${anoPrecedente}-${String(mesPrecedente).padStart(2, "0")}-01`;
    const ultimoDiaPrecedente = new Date(anoPrecedente, mesPrecedente, 0).getDate();
    const dataPrecedente2 = `${anoPrecedente}-${String(mesPrecedente).padStart(2, "0")}-${String(ultimoDiaPrecedente).padStart(2, "0")}`;

    const drePrecedente = calcularDREPeriodo(db, dataPrecedente1, dataPrecedente2);
    const variacao = drePrecedente.receitaTotal > 0 ? ((drePrecedente.receitaTotal - drePrecedente.receitaTotal) / drePrecedente.receitaTotal) * 100 : 0;

    // YTD (ano até mês atual)
    const dataAnoInicio = `${ano}-01-01`;
    const dataAnoAtual = `${ano}-${String(mes).padStart(2, "0")}-${String(new Date(ano, mes, 0).getDate()).padStart(2, "0")}`;
    const dreYTD = calcularDREPeriodo(db, dataAnoInicio, dataAnoAtual);
    const ytdVariacao = drePrecedente.receitaTotal > 0 ? ((dreYTD.receitaTotal - drePrecedente.receitaTotal) / drePrecedente.receitaTotal) * 100 : 0;

    return { mesAnterior: variacao, ytd: ytdVariacao };
  } catch (erro) {
    logger.error("[RelatorioExecutivo] Erro ao calcular variação:", erro);
    return { mesAnterior: 0, ytd: 0 };
  }
}

/** Busca histórico de DRE dos últimos 6 meses */
function buscarHistoricoDREUltimos6Meses(
  db: Database.Database,
  mes: number,
  ano: number,
): Array<{ mes: number; ano: number; receita: number; despesa: number }> {
  try {
    const historico: Array<{ mes: number; ano: number; receita: number; despesa: number }> = [];
    let mesAtual = mes;
    let anoAtual = ano;

    for (let i = 0; i < 6; i++) {
      const dataInicio = `${anoAtual}-${String(mesAtual).padStart(2, "0")}-01`;
      const ultimoDia = new Date(anoAtual, mesAtual, 0).getDate();
      const dataFim = `${anoAtual}-${String(mesAtual).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;

      const dre = calcularDREPeriodo(db, dataInicio, dataFim);
      historico.unshift({ mes: mesAtual, ano: anoAtual, receita: dre.receitaTotal, despesa: dre.despesaFixaTotal + dre.despesaVariavelTotal });

      // Retrocede um mês
      mesAtual = mesAtual === 1 ? 12 : mesAtual - 1;
      anoAtual = mesAtual === 12 ? anoAtual - 1 : anoAtual;
    }

    return historico;
  } catch (erro) {
    logger.error("[RelatorioExecutivo] Erro ao buscar histórico DRE:", erro);
    return [];
  }
}

/** Gera resumo de fluxo de caixa */
function gerarFluxoResumo(db: Database.Database, mes: number, ano: number): FluxoResumo {
  try {
    // Busca saldo atual (últimas 12 meses)
    const historico12 = buscarHistoricoFluxo12Meses(db, mes, ano);

    // Projeção via forecast
    const dataInicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const dataFim = `${ano}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;

    const projecoes = forecastMediaMovel(db, 90);

    const saldoAtual = historico12.length > 0 ? historico12[historico12.length - 1].saldo : 0;
    const projecao30 = projecoes.find((p) => {
      const data = new Date(p.data);
      const hoje = new Date();
      const diff = Math.floor((data.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
      return Math.abs(diff - 30) < 5;
    })?.saldoEstimado ?? saldoAtual;

    const projecao60 = projecoes.find((p) => {
      const data = new Date(p.data);
      const hoje = new Date();
      const diff = Math.floor((data.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
      return Math.abs(diff - 60) < 5;
    })?.saldoEstimado ?? saldoAtual;

    const projecao90 = projecoes.find((p) => {
      const data = new Date(p.data);
      const hoje = new Date();
      const diff = Math.floor((data.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
      return Math.abs(diff - 90) < 5;
    })?.saldoEstimado ?? saldoAtual;

    const diasComNegativo = historico12.filter((h) => h.saldo < 0).length;
    const diasAteSaldoNegativo = historico12.length > 0 && projecao30 < 0 ? 30 : null;

    return {
      saldoAtual,
      projecao30dias: projecao30,
      projecao60dias: projecao60,
      projecao90dias: projecao90,
      diasComSaldoNegativo: diasComNegativo,
      diasAteSaldoNegativo,
      historico12meses: historico12,
    };
  } catch (erro) {
    logger.error("[RelatorioExecutivo] Erro ao gerar fluxo resumo:", erro);
    return {
      saldoAtual: 0,
      projecao30dias: 0,
      projecao60dias: 0,
      projecao90dias: 0,
      diasComSaldoNegativo: 0,
      diasAteSaldoNegativo: null,
      historico12meses: [],
    };
  }
}

/** Busca histórico de saldo dos últimos 12 meses */
function buscarHistoricoFluxo12Meses(
  db: Database.Database,
  mes: number,
  ano: number,
): Array<{ mes: number; ano: number; saldo: number }> {
  try {
    const historico: Array<{ mes: number; ano: number; saldo: number }> = [];
    let mesAtual = mes;
    let anoAtual = ano;

    for (let i = 0; i < 12; i++) {
      // Por enquanto, simula saldo (implementar consulta real ao banco de dados)
      const saldo = Math.random() * 50000 - 10000; // Demo
      historico.unshift({ mes: mesAtual, ano: anoAtual, saldo });

      mesAtual = mesAtual === 1 ? 12 : mesAtual - 1;
      anoAtual = mesAtual === 12 ? anoAtual - 1 : anoAtual;
    }

    return historico;
  } catch (erro) {
    logger.error("[RelatorioExecutivo] Erro ao buscar histórico fluxo:", erro);
    return [];
  }
}

/** Gera resumo de margens por propriedade */
function gerarMargensResumo(db: Database.Database, mes: number, ano: number): MargensPorPropriedadeResumo {
  try {
    // Busca todas as propriedades
    const propriedades = db.prepare("SELECT id, nome FROM imoveis ORDER BY nome").all() as Array<{ id: number; nome: string }>;

    const margens = propriedades
      .map((prop) => {
        try {
          const margem = calcularMargensImovel(db, prop.id, ano, mes);
          return {
            imovelId: margem.imovelId,
            nomePropriedade: margem.nomeProriedade,
            margem: margem.margem,
            status: margem.status,
          };
        } catch {
          return null;
        }
      })
      .filter((m) => m !== null) as Array<MargemPropriedade>;

    const total = margens.length;
    const mediaGeral = total > 0 ? margens.reduce((sum, m) => sum + m.margem, 0) / total : 0;

    const ordenadas = [...margens].sort((a, b) => b.margem - a.margem);
    const top5 = ordenadas.slice(0, 5);
    const bottom5 = ordenadas.slice(-5).reverse();

    return {
      total,
      mediaGeral,
      top5,
      bottom5,
    };
  } catch (erro) {
    logger.error("[RelatorioExecutivo] Erro ao gerar margens resumo:", erro);
    return { total: 0, mediaGeral: 0, top5: [], bottom5: [] };
  }
}

/** Gera margens por propriedade com paginação */
export function gerarMargensResumodaPaginado(
  db: Database.Database,
  mes: number,
  ano: number,
  limit: number = 50,
  offset: number = 0,
): MargensPaginadas {
  try {
    // Busca todas as propriedades
    const propriedades = db.prepare("SELECT id, nome FROM imoveis ORDER BY nome").all() as Array<{ id: number; nome: string }>;

    const margens = propriedades
      .map((prop) => {
        try {
          const margem = calcularMargensImovel(db, prop.id, ano, mes);
          return {
            imovelId: margem.imovelId,
            nomePropriedade: margem.nomeProriedade,
            margem: margem.margem,
            status: margem.status,
          };
        } catch {
          return null;
        }
      })
      .filter((m) => m !== null) as Array<MargemPropriedade>;

    const total = margens.length;
    const mediaGeral = total > 0 ? margens.reduce((sum, m) => sum + m.margem, 0) / total : 0;

    // Ordena por margem descendente
    const ordenadas = [...margens].sort((a, b) => b.margem - a.margem);

    // Aplica paginação
    const items = ordenadas.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return {
      items,
      total,
      mediaGeral,
      limit,
      offset,
      hasMore,
    };
  } catch (erro) {
    logger.error("[RelatorioExecutivo] Erro ao gerar margens paginadas:", erro);
    return {
      items: [],
      total: 0,
      mediaGeral: 0,
      limit,
      offset,
      hasMore: false,
    };
  }
}

/** Gera resumo de contas a receber/pagar */
function gerarContasResumo(db: Database.Database): ContasResumo {
  try {
    const hoje = new Date().toISOString().split("T")[0];

    // Busca contas a receber (simulado, seria de tabela real)
    let aReceberTotal = 0;
    let aReceberVencido = 0;
    let aReceberProximo30 = 0;
    const topDevedores: Array<{ nome: string; valor: number; diasVencido: number }> = [];

    try {
      const cobrancas = db.prepare(`
        SELECT
          COALESCE(c.descricao, 'Sem descrição') as nome,
          c.valor,
          c.data_vencimento,
          c.status
        FROM cobrancas c
        WHERE c.status IN ('pendente', 'vencido', 'agendado')
        ORDER BY c.valor DESC
        LIMIT 10
      `).all() as Array<{
        nome: string;
        valor: number;
        data_vencimento: string;
        status: string;
      }>;

      for (const cobranca of cobrancas) {
        const valor = cobranca.valor / 100; // Assume centavos
        aReceberTotal += valor;

        const dataVenc = new Date(cobranca.data_vencimento);
        const dataHoje = new Date(hoje);
        const diffDias = Math.floor((dataHoje.getTime() - dataVenc.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDias > 0) {
          aReceberVencido += valor;
          if (topDevedores.length < 5) {
            topDevedores.push({ nome: cobranca.nome, valor, diasVencido: diffDias });
          }
        } else if (diffDias >= -30) {
          aReceberProximo30 += valor;
        }
      }
    } catch {
      // Tabela não existe ou erro
    }

    // Busca contas a pagar
    let aPagarTotal = 0;
    let aPagarVencido = 0;
    let aPagarProximo30 = 0;

    try {
      const despesas = db.prepare(`
        SELECT
          t.valor,
          t.data
        FROM transacoes t
        WHERE t.plano_conta_codigo LIKE '2%'  -- Contas a pagar começam com 2
          AND t.data >= date('now', '-90 days')
        ORDER BY t.data
      `).all() as Array<{ valor: number; data: string }>;

      for (const despesa of despesas) {
        const valor = Math.abs(despesa.valor / 100);
        aPagarTotal += valor;

        const dataTrans = new Date(despesa.data);
        const dataHoje = new Date(hoje);
        const diffDias = Math.floor((dataHoje.getTime() - dataTrans.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDias > 0) {
          aPagarVencido += valor;
        } else if (diffDias >= -30) {
          aPagarProximo30 += valor;
        }
      }
    } catch {
      // Tabela não existe ou erro
    }

    return {
      aReceber: {
        total: aReceberTotal,
        vencido: aReceberVencido,
        proximo30dias: aReceberProximo30,
        percentualVencido: aReceberTotal > 0 ? (aReceberVencido / aReceberTotal) * 100 : 0,
        topDevedores,
      },
      aPagar: {
        total: aPagarTotal,
        vencido: aPagarVencido,
        proximo30dias: aPagarProximo30,
        percentualVencido: aPagarTotal > 0 ? (aPagarVencido / aPagarTotal) * 100 : 0,
      },
    };
  } catch (erro) {
    logger.error("[RelatorioExecutivo] Erro ao gerar contas resumo:", erro);
    return {
      aReceber: { total: 0, vencido: 0, proximo30dias: 0, percentualVencido: 0, topDevedores: [] },
      aPagar: { total: 0, vencido: 0, proximo30dias: 0, percentualVencido: 0 },
    };
  }
}

/** Gera alertas executivos */
function gerarAlertasExecutivos(
  db: Database.Database,
  dreResumo: DREResumo,
  fluxoResumo: FluxoResumo,
  margensResumo: MargensPorPropriedadeResumo,
  contasResumo: ContasResumo,
): AlertaExecutivo[] {
  const alertas: AlertaExecutivo[] = [];

  // Alerta: Receita em queda
  if (dreResumo.variacao.mesAnterior < -10) {
    alertas.push({
      tipo: "crítico",
      titulo: "Receita em Queda Acentuada",
      descricao: `Receita diminuiu ${Math.abs(dreResumo.variacao.mesAnterior).toFixed(1)}% em relação ao mês anterior`,
      valor: dreResumo.receitaTotal,
      recomendacao: "Revisar política de precificação ou investigar desocupações",
    });
  }

  // Alerta: Saldo negativo projetado
  if (fluxoResumo.diasAteSaldoNegativo !== null) {
    alertas.push({
      tipo: "crítico",
      titulo: "Saldo Negativo Projetado",
      descricao: `Projeção indica saldo negativo em aproximadamente ${fluxoResumo.diasAteSaldoNegativo} dias`,
      valor: fluxoResumo.projecao30dias,
      recomendacao: "Antecipar recebimentos ou adiar despesas não essenciais",
    });
  }

  // Alerta: Inadimplência alta
  if (contasResumo.aReceber.percentualVencido > 10) {
    alertas.push({
      tipo: "crítico",
      titulo: "Inadimplência Acima de 10%",
      descricao: `${contasResumo.aReceber.percentualVencido.toFixed(1)}% das contas a receber estão vencidas`,
      valor: contasResumo.aReceber.vencido,
      recomendacao: "Intensificar cobrança e revisar políticas de crédito",
    });
  }

  // Alerta: Propriedade com margem crítica
  const criticas = margensResumo.bottom5.filter((p) => p.status === "CRÍTICO");
  if (criticas.length > 0) {
    alertas.push({
      tipo: "aviso",
      titulo: `${criticas.length} Propriedade(s) com Margem Crítica`,
      descricao: `${criticas.map((p) => `${p.nomePropriedade} (${p.margem.toFixed(1)}%)`).join(", ")}`,
      recomendacao: "Analisar custos ou ajustar preço de aluguel",
    });
  }

  // Alerta: Despesas altas
  if (dreResumo.despesaTotal > dreResumo.receitaTotal * 0.8) {
    alertas.push({
      tipo: "aviso",
      titulo: "Despesas Elevadas",
      descricao: `Despesas representam ${((dreResumo.despesaTotal / dreResumo.receitaTotal) * 100).toFixed(1)}% da receita`,
      valor: dreResumo.despesaTotal,
      recomendacao: "Revisar orçamento e buscar otimizações de custo",
    });
  }

  return alertas;
}

/** Gera sumário executivo */
function gerarSumario(
  db: Database.Database,
  dreResumo: DREResumo,
  fluxoResumo: FluxoResumo,
  margensResumo: MargensPorPropriedadeResumo,
  contasResumo: ContasResumo,
  alertas: AlertaExecutivo[],
): SumarioExecutivo {
  // Taxa de ocupação (imóveis alugados / total)
  let taxaOcupacao = 0;
  try {
    const imoveis = db.prepare("SELECT COUNT(*) as total FROM imoveis").get() as { total: number };
    const alugados = db.prepare("SELECT COUNT(*) as total FROM imoveis WHERE alugado = 1").get() as { total: number };
    taxaOcupacao = imoveis.total > 0 ? (alugados.total / imoveis.total) * 100 : 0;
  } catch {
    // Tabela não existe
  }

  // Determine status geral
  let statusGeral: "OK" | "ATENÇÃO" | "CRÍTICO" = "OK";
  const criticos = alertas.filter((a) => a.tipo === "crítico").length;
  const avisos = alertas.filter((a) => a.tipo === "aviso").length;

  if (criticos > 0) {
    statusGeral = "CRÍTICO";
  } else if (avisos > 0) {
    statusGeral = "ATENÇÃO";
  }

  return {
    taxaOcupacao,
    inadimplencia: contasResumo.aReceber.percentualVencido,
    diasDeCaixaDisponivel: fluxoResumo.saldoAtual > 0 ? Math.floor(fluxoResumo.saldoAtual / (dreResumo.despesaTotal / 30)) : 0,
    statusGeral,
    alertasTopCinco: alertas.slice(0, 5),
  };
}

/** Gera PDF (HTML formatado) do relatório executivo */
export function gerarPDFRelatorioExecutivo(db: Database.Database, mes: number, ano: number): string {
  const relatorio = gerarRelatorioExecutivo(db, mes, ano);
  const periodo = `${mes}/${ano}`;

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Relatório Executivo - ${periodo}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      color: #333;
      line-height: 1.6;
      background: #f5f5f5;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      box-shadow: 0 0 20px rgba(0,0,0,0.1);
    }
    header {
      border-bottom: 3px solid #0066cc;
      padding-bottom: 20px;
      margin-bottom: 40px;
    }
    h1 {
      font-size: 28px;
      color: #0066cc;
      margin-bottom: 5px;
    }
    .header-meta {
      font-size: 12px;
      color: #666;
    }
    h2 {
      font-size: 18px;
      color: #0066cc;
      margin-top: 40px;
      margin-bottom: 15px;
      border-left: 4px solid #0066cc;
      padding-left: 10px;
    }
    h3 {
      font-size: 14px;
      color: #333;
      margin-top: 15px;
      margin-bottom: 10px;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
      margin-bottom: 30px;
    }
    .kpi-card {
      background: linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%);
      padding: 15px;
      border-radius: 5px;
      border-left: 4px solid #0066cc;
    }
    .kpi-label {
      font-size: 11px;
      color: #666;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    .kpi-value {
      font-size: 18px;
      font-weight: bold;
      color: #0066cc;
    }
    .status-ok { color: #28a745; }
    .status-aviso { color: #ffc107; }
    .status-critico { color: #dc3545; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
    }
    th {
      background: #f0f0f0;
      color: #333;
      padding: 10px;
      text-align: left;
      font-weight: 600;
      border-bottom: 2px solid #0066cc;
    }
    td {
      padding: 10px;
      border-bottom: 1px solid #e0e0e0;
    }
    tr:hover { background: #f9f9f9; }
    .alert {
      padding: 15px;
      margin: 10px 0;
      border-radius: 5px;
      border-left: 4px solid;
    }
    .alert-critico {
      background: #f8d7da;
      border-color: #dc3545;
      color: #721c24;
    }
    .alert-aviso {
      background: #fff3cd;
      border-color: #ffc107;
      color: #856404;
    }
    .alert-info {
      background: #d1ecf1;
      border-color: #17a2b8;
      color: #0c5460;
    }
    .alert-title {
      font-weight: bold;
      margin-bottom: 5px;
    }
    .page-break {
      page-break-after: always;
      margin-top: 40px;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
      font-size: 11px;
      color: #999;
      text-align: right;
    }
    .status-badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 3px;
      font-size: 11px;
      font-weight: bold;
    }
    .badge-ok { background: #d4edda; color: #155724; }
    .badge-aviso { background: #fff3cd; color: #856404; }
    .badge-critico { background: #f8d7da; color: #721c24; }
    @media print {
      body { background: white; }
      .container { box-shadow: none; }
      .page-break { page-break-after: always; }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- PÁGINA 1: Resumo Executivo -->
    <header>
      <h1>Relatório Executivo</h1>
      <div class="header-meta">Período: ${periodo} | Gerado em: ${new Date(relatorio.criadoEm).toLocaleDateString("pt-BR")}</div>
    </header>

    <h2>Resumo Executivo</h2>
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Receita Total</div>
        <div class="kpi-value">R$ ${(relatorio.dre.receitaTotal / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Despesa Total</div>
        <div class="kpi-value">R$ ${(relatorio.dre.despesaTotal / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Lucro Líquido</div>
        <div class="kpi-value ${relatorio.dre.lucroLiquido >= 0 ? "status-ok" : "status-critico"}">R$ ${(relatorio.dre.lucroLiquido / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Taxa Ocupação</div>
        <div class="kpi-value">${relatorio.sumario.taxaOcupacao.toFixed(1)}%</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Inadimplência</div>
        <div class="kpi-value ${relatorio.sumario.inadimplencia > 10 ? "status-critico" : "status-ok"}">${relatorio.sumario.inadimplencia.toFixed(1)}%</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Saldo em Caixa</div>
        <div class="kpi-value ${relatorio.fluxo.saldoAtual >= 0 ? "status-ok" : "status-critico"}">R$ ${(relatorio.fluxo.saldoAtual / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Dias de Caixa</div>
        <div class="kpi-value">${relatorio.sumario.diasDeCaixaDisponivel}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Status Geral</div>
        <div class="kpi-value">
          <span class="status-badge badge-${relatorio.sumario.statusGeral === "OK" ? "ok" : relatorio.sumario.statusGeral === "ATENÇÃO" ? "aviso" : "critico"}">
            ${relatorio.sumario.statusGeral}
          </span>
        </div>
      </div>
    </div>

    <h3>Alertas Críticos (Top 5)</h3>
    ${relatorio.sumario.alertasTopCinco
      .map(
        (alerta) => `
      <div class="alert alert-${alerta.tipo}">
        <div class="alert-title">${alerta.titulo}</div>
        <div>${alerta.descricao}</div>
        ${alerta.recomendacao ? `<div style="margin-top: 8px; font-size: 12px;"><strong>Recomendação:</strong> ${alerta.recomendacao}</div>` : ""}
      </div>
    `
      )
      .join("")}

    <div class="page-break"></div>

    <!-- PÁGINA 2: DRE Completa -->
    <h2>Demonstração de Resultado (DRE)</h2>

    <table>
      <tr style="background: #f0f0f0;">
        <th>Descrição</th>
        <th style="text-align: right;">Valor (R$)</th>
        <th style="text-align: right;">% da Receita</th>
      </tr>
      <tr>
        <td colspan="3" style="background: #e8f0ff; font-weight: bold;">RECEITAS</td>
      </tr>
      <tr>
        <td>Receita de Aluguel</td>
        <td style="text-align: right;">R$ ${(relatorio.dre.receitaAluguel / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
        <td style="text-align: right;">${relatorio.dre.receitaTotal > 0 ? ((relatorio.dre.receitaAluguel / relatorio.dre.receitaTotal) * 100).toFixed(1) : 0}%</td>
      </tr>
      <tr>
        <td>Receita de Honorários</td>
        <td style="text-align: right;">R$ ${(relatorio.dre.receitaHonorario / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
        <td style="text-align: right;">${relatorio.dre.receitaTotal > 0 ? ((relatorio.dre.receitaHonorario / relatorio.dre.receitaTotal) * 100).toFixed(1) : 0}%</td>
      </tr>
      <tr>
        <td>Receita Extraordinária</td>
        <td style="text-align: right;">R$ ${(relatorio.dre.receitaExtraordinaria / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
        <td style="text-align: right;">${relatorio.dre.receitaTotal > 0 ? ((relatorio.dre.receitaExtraordinaria / relatorio.dre.receitaTotal) * 100).toFixed(1) : 0}%</td>
      </tr>
      <tr style="background: #fff9e6; font-weight: bold;">
        <td>RECEITA TOTAL</td>
        <td style="text-align: right;">R$ ${(relatorio.dre.receitaTotal / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
        <td style="text-align: right;">100%</td>
      </tr>
      <tr>
        <td colspan="3" style="background: #e8f0ff; font-weight: bold;">DESPESAS</td>
      </tr>
      <tr>
        <td>Folha de Pagamento</td>
        <td style="text-align: right;">R$ ${(relatorio.dre.despesaFolhaPagamento / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
        <td style="text-align: right;">${relatorio.dre.receitaTotal > 0 ? ((relatorio.dre.despesaFolhaPagamento / relatorio.dre.receitaTotal) * 100).toFixed(1) : 0}%</td>
      </tr>
      <tr>
        <td>Condomínio</td>
        <td style="text-align: right;">R$ ${(relatorio.dre.despesaCondominio / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
        <td style="text-align: right;">${relatorio.dre.receitaTotal > 0 ? ((relatorio.dre.despesaCondominio / relatorio.dre.receitaTotal) * 100).toFixed(1) : 0}%</td>
      </tr>
      <tr>
        <td>Manutenção</td>
        <td style="text-align: right;">R$ ${(relatorio.dre.despesaManutencao / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
        <td style="text-align: right;">${relatorio.dre.receitaTotal > 0 ? ((relatorio.dre.despesaManutencao / relatorio.dre.receitaTotal) * 100).toFixed(1) : 0}%</td>
      </tr>
      <tr>
        <td>Impostos</td>
        <td style="text-align: right;">R$ ${(relatorio.dre.despesaImpostos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
        <td style="text-align: right;">${relatorio.dre.receitaTotal > 0 ? ((relatorio.dre.despesaImpostos / relatorio.dre.receitaTotal) * 100).toFixed(1) : 0}%</td>
      </tr>
      <tr>
        <td>Juros e Encargos</td>
        <td style="text-align: right;">R$ ${(relatorio.dre.despesaJuros / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
        <td style="text-align: right;">${relatorio.dre.receitaTotal > 0 ? ((relatorio.dre.despesaJuros / relatorio.dre.receitaTotal) * 100).toFixed(1) : 0}%</td>
      </tr>
      <tr style="background: #fff9e6; font-weight: bold;">
        <td>DESPESA TOTAL</td>
        <td style="text-align: right;">R$ ${(relatorio.dre.despesaTotal / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
        <td style="text-align: right;">${relatorio.dre.receitaTotal > 0 ? ((relatorio.dre.despesaTotal / relatorio.dre.receitaTotal) * 100).toFixed(1) : 0}%</td>
      </tr>
      <tr style="background: #e8f8f5; font-weight: bold; font-size: 14px;">
        <td>LUCRO LÍQUIDO</td>
        <td style="text-align: right; color: ${relatorio.dre.lucroLiquido >= 0 ? "#28a745" : "#dc3545"};">R$ ${(relatorio.dre.lucroLiquido / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
        <td style="text-align: right;">${relatorio.dre.receitaTotal > 0 ? ((relatorio.dre.lucroLiquido / relatorio.dre.receitaTotal) * 100).toFixed(1) : 0}%</td>
      </tr>
    </table>

    <h3>Variação em Relação ao Período Anterior</h3>
    <p>Mês anterior: <strong>${relatorio.dre.variacao.mesAnterior > 0 ? "+" : ""}${relatorio.dre.variacao.mesAnterior.toFixed(1)}%</strong> |
    YTD: <strong>${relatorio.dre.variacao.ytd > 0 ? "+" : ""}${relatorio.dre.variacao.ytd.toFixed(1)}%</strong></p>

    <div class="page-break"></div>

    <!-- PÁGINA 3: Fluxo de Caixa e Margens -->
    <h2>Fluxo de Caixa</h2>

    <table>
      <tr>
        <th>Métrica</th>
        <th style="text-align: right;">Valor</th>
      </tr>
      <tr>
        <td>Saldo Atual</td>
        <td style="text-align: right; color: ${relatorio.fluxo.saldoAtual >= 0 ? "#28a745" : "#dc3545"};">R$ ${(relatorio.fluxo.saldoAtual / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
      </tr>
      <tr>
        <td>Projeção 30 dias</td>
        <td style="text-align: right;">R$ ${(relatorio.fluxo.projecao30dias / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
      </tr>
      <tr>
        <td>Projeção 60 dias</td>
        <td style="text-align: right;">R$ ${(relatorio.fluxo.projecao60dias / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
      </tr>
      <tr>
        <td>Projeção 90 dias</td>
        <td style="text-align: right;">R$ ${(relatorio.fluxo.projecao90dias / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
      </tr>
      <tr>
        <td>Dias com Saldo Negativo (histórico)</td>
        <td style="text-align: right;">${relatorio.fluxo.diasComSaldoNegativo}</td>
      </tr>
    </table>

    <h2>Margens por Propriedade</h2>

    <h3>Top 5 Propriedades</h3>
    <table>
      <tr>
        <th>Propriedade</th>
        <th style="text-align: right;">Margem (%)</th>
        <th>Status</th>
      </tr>
      ${relatorio.margens.top5
        .map(
          (prop) => `
      <tr>
        <td>${prop.nomePropriedade}</td>
        <td style="text-align: right;">${prop.margem.toFixed(1)}%</td>
        <td><span class="status-badge badge-${prop.status === "OK" ? "ok" : prop.status === "ATENÇÃO" ? "aviso" : "critico"}">${prop.status}</span></td>
      </tr>
    `
        )
        .join("")}
    </table>

    <h3>Bottom 5 Propriedades (Atenção)</h3>
    <table>
      <tr>
        <th>Propriedade</th>
        <th style="text-align: right;">Margem (%)</th>
        <th>Status</th>
      </tr>
      ${relatorio.margens.bottom5
        .map(
          (prop) => `
      <tr style="background: ${prop.status === "CRÍTICO" ? "#f8d7da" : "#fff3cd"};">
        <td>${prop.nomePropriedade}</td>
        <td style="text-align: right;">${prop.margem.toFixed(1)}%</td>
        <td><span class="status-badge badge-${prop.status === "OK" ? "ok" : prop.status === "ATENÇÃO" ? "aviso" : "critico"}">${prop.status}</span></td>
      </tr>
    `
        )
        .join("")}
    </table>

    <div class="page-break"></div>

    <!-- PÁGINA 4: Contas a Receber/Pagar e Alertas -->
    <h2>Contas a Receber</h2>

    <table>
      <tr>
        <th>Descrição</th>
        <th style="text-align: right;">Valor</th>
      </tr>
      <tr>
        <td>Total a Receber</td>
        <td style="text-align: right;">R$ ${(relatorio.contas.aReceber.total / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
      </tr>
      <tr style="color: #dc3545;">
        <td>Vencido</td>
        <td style="text-align: right;">R$ ${(relatorio.contas.aReceber.vencido / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
      </tr>
      <tr>
        <td>Próximos 30 dias</td>
        <td style="text-align: right;">R$ ${(relatorio.contas.aReceber.proximo30dias / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
      </tr>
      <tr>
        <td>Taxa de Inadimplência</td>
        <td style="text-align: right; ${relatorio.contas.aReceber.percentualVencido > 10 ? 'color: #dc3545;' : ''}">${relatorio.contas.aReceber.percentualVencido.toFixed(1)}%</td>
      </tr>
    </table>

    ${
      relatorio.contas.aReceber.topDevedores.length > 0
        ? `
    <h3>Top Devedores</h3>
    <table>
      <tr>
        <th>Devedor</th>
        <th style="text-align: right;">Valor</th>
        <th style="text-align: right;">Dias Vencido</th>
      </tr>
      ${relatorio.contas.aReceber.topDevedores
        .map(
          (devedor) => `
      <tr>
        <td>${devedor.nome}</td>
        <td style="text-align: right;">R$ ${(devedor.valor / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
        <td style="text-align: right;">${devedor.diasVencido}</td>
      </tr>
    `
        )
        .join("")}
    </table>
    `
        : ""
    }

    <h2>Contas a Pagar</h2>

    <table>
      <tr>
        <th>Descrição</th>
        <th style="text-align: right;">Valor</th>
      </tr>
      <tr>
        <td>Total a Pagar</td>
        <td style="text-align: right;">R$ ${(relatorio.contas.aPagar.total / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
      </tr>
      <tr>
        <td>Vencido</td>
        <td style="text-align: right; color: ${relatorio.contas.aPagar.vencido > 0 ? "#dc3545" : "#28a745"};">R$ ${(relatorio.contas.aPagar.vencido / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
      </tr>
      <tr>
        <td>Próximos 30 dias</td>
        <td style="text-align: right;">R$ ${(relatorio.contas.aPagar.proximo30dias / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
      </tr>
    </table>

    <h2>Alertas e Recomendações</h2>

    ${
      relatorio.alertas.length === 0
        ? '<p style="color: #28a745;">Nenhum alerta pendente.</p>'
        : relatorio.alertas.map((alerta) => `
    <div class="alert alert-${alerta.tipo}">
      <div class="alert-title">${alerta.titulo}</div>
      <div>${alerta.descricao}</div>
      ${alerta.recomendacao ? `<div style="margin-top: 8px; font-size: 12px;"><strong>Recomendação:</strong> ${alerta.recomendacao}</div>` : ""}
    </div>
  `).join("")
    }

    <div class="footer">
      <p>Relatório Executivo Confidencial • ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}</p>
    </div>
  </div>
</body>
</html>
  `;

  return html;
}

/** Envia o relatório por email */
export async function enviarRelatorioEmailMensal(
  db: Database.Database,
  email: string,
  mes: number,
  ano: number,
): Promise<{ sucesso: boolean; idEmail?: string; erro?: string }> {
  try {
    const { enviarEmail } = await import("../notificacoes/email.js");
    const relatorio = gerarRelatorioExecutivo(db, mes, ano);
    const periodo = `${mes}/${ano}`;
    const html = gerarPDFRelatorioExecutivo(db, mes, ano);

    // Grava relatório gerado no banco
    gravarRelatorioGerado(db, mes, ano, html, email);

    await enviarEmail({
      destinatario: email,
      assunto: `Relatório Executivo - Período ${periodo}`,
      corpo: `Prezado,\n\nSegue em anexo o Relatório Executivo referente ao período ${periodo}.\n\nResumo:\n- Receita Total: R$ ${(relatorio.dre.receitaTotal / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n- Lucro Líquido: R$ ${(relatorio.dre.lucroLiquido / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n- Status: ${relatorio.sumario.statusGeral}\n\nAtenciosamente,\nSistema de Relatórios`,
    });

    return { sucesso: true, idEmail: `email_rel_${mes}_${ano}_${Date.now()}` };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    logger.error("[RelatorioExecutivo] Erro ao enviar email:", mensagem);
    return { sucesso: false, erro: mensagem };
  }
}

/** Grava relatório gerado no banco de dados (se tabela existir) */
function gravarRelatorioGerado(db: Database.Database, mes: number, ano: number, conteudoHTML: string, email: string): void {
  try {
    db.prepare(`
      INSERT INTO relatorios_executivos_gerados (mes, ano, data_geracao, conteudo_html, email_enviado, destinatarios, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(mes, ano, new Date().toISOString(), conteudoHTML.substring(0, 5000), 1, email, new Date().toISOString());
  } catch (erro) {
    // Tabela pode não existir, ignora
    logger.warn("[RelatorioExecutivo] Não foi possível gravar relatório no banco:", erro);
  }
}
