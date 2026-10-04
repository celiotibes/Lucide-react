/**
 * Relatório Executivo Mensal (servidor)
 *
 * IMPORTANTE — origem dos dados: o banco do servidor NÃO contém o razão canônico, os
 * imóveis, as transações nem as cobranças do negócio (isso mora no navegador/IndexedDB).
 * Por isso este relatório só calcula o que existe de fato no servidor e marca cada seção
 * restante como `indisponivel`, com motivo explícito. Nenhum número é estimado, sorteado ou
 * preenchido com zero para "parecer completo". Detalhes por seção em
 * docs/RELATORIO-EXECUTIVO-ORIGEM-DADOS.md.
 *
 * Funções:
 *  - gerarRelatorioExecutivo(db, mes, ano): gera estrutura (seções disponíveis ou indisponíveis)
 *  - gerarPDFRelatorioExecutivo(db, mes, ano): gera HTML/PDF
 *  - enviarRelatorioEmailMensal(db, email, mes, ano): envia via email com anexo
 */

import type Database from "better-sqlite3";
import { logger } from '../../services/logger-service.js';
import { calcularMargensImovel } from "./margensPorPropriedade.js";
import { calcularDREPeriodo, type ResultadoDRE } from "./dre.js";
import { obterPeriodoMes } from "./report-helpers.js";

/** Seção que o servidor não consegue calcular com os dados que possui. */
export interface SecaoIndisponivel {
  indisponivel: true;
  /** Por que o servidor não consegue calcular (texto para o usuário). */
  motivo: string;
  /** Onde o dado canônico vive / de onde precisaria vir. */
  fonteEsperada: string;
  /** Tabelas do servidor que faltam (quando o motivo é ausência de tabela). */
  tabelasAusentes?: string[];
}

export type Secao<T> = T | SecaoIndisponivel;

export function secaoIndisponivel<T>(secao: Secao<T>): secao is SecaoIndisponivel {
  return typeof secao === "object" && secao !== null && (secao as SecaoIndisponivel).indisponivel === true;
}

export interface RelatorioExecutivo {
  periodo: string; // YYYY-MM
  mes: number;
  ano: number;
  dre: Secao<DREResumo>;
  fluxo: Secao<FluxoResumo>;
  margens: Secao<MargensPorPropriedadeResumo>;
  alertas: AlertaExecutivo[];
  contas: Secao<ContasResumo>;
  /** Movimentação registrada no razão DO SERVIDOR (fila de propostas da conciliação PIX/OFX). */
  razaoServidor: Secao<RazaoServidorResumo>;
  sumario: Secao<SumarioExecutivo>;
  /** Nomes das seções marcadas como indisponíveis (atalho para a UI). */
  secoesIndisponiveis: string[];
  /** true somente se NENHUMA seção está indisponível. */
  completo: boolean;
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

export interface RazaoServidorResumo {
  /** Fonte exata dos números. */
  fonte: "razao";
  /** Total de lançamentos criados no mês (por criado_em). */
  totalLancamentos: number;
  /** Soma de `valor` na unidade em que foi gravado (sem conversão). */
  valorTotal: number;
  porTipoStatus: Array<{ tipo: string | null; status: string | null; quantidade: number; valorTotal: number }>;
  aviso: string;
}

/** Verdadeiro se a tabela existe no banco (consulta sqlite_master; nunca lança "no such table"). */
export function tabelaExiste(db: Database.Database, nome: string): boolean {
  const linha = db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?").get(nome);
  return linha !== undefined;
}

/**
 * Converte ResultadoDRE (valores em centavos) para DREResumo (valores em reais).
 * Divide todos os valores por 100 e calcula variações e histórico.
 */
function converterDREParaResumo(db: Database.Database, dre: ResultadoDRE): DREResumo {
  // Converte centavos para reais (÷100)
  return {
    receitaTotal: dre.receitaTotal / 100,
    receitaAluguel: dre.receitaAluguel / 100,
    receitaHonorario: dre.receitaHonorario / 100,
    receitaExtraordinaria: dre.receitaExtraordinaria / 100,
    despesaTotal: (dre.despesaFixaTotal + dre.despesaVariavelTotal) / 100,
    despesaFolhaPagamento: dre.despesaFolhaPagamento / 100,
    despesaCondominio: dre.despesaCondominio / 100,
    despesaManutencao: dre.despesaManutencao / 100,
    despesaImpostos: dre.despesaImpostosReceita / 100,
    despesaJuros: dre.despesaJuros / 100,
    lucroLiquido: dre.lucroLiquido / 100,
    lucroBruto: dre.lucroBruto / 100,
    variacao: {
      mesAnterior: 0, // TODO: implementar cálculo de variação
      ytd: 0, // TODO: implementar cálculo YTD
    },
    historico: [], // TODO: implementar histórico
  };
}

/**
 * Tenta calcular DRE a partir de asaas_cobrancas + ledger_entries.
 * Retorna SecaoIndisponivel se tabelas necessárias não existem.
 */
function calcularDREOuIndisponivel(
  db: Database.Database,
  mes: number,
  ano: number,
): Secao<DREResumo> {
  try {
    // Verifica se pelo menos uma das tabelas de origem existe
    const temAsaas = tabelaExiste(db, "asaas_cobrancas");
    const temLedger = tabelaExiste(db, "ledger_entries");

    if (!temAsaas && !temLedger) {
      return {
        indisponivel: true,
        motivo:
          "O servidor não possui tabelas de receitas ou despesas (asaas_cobrancas e ledger_entries ausentes).",
        fonteEsperada:
          "asaas_cobrancas (cobranças pagas) e/ou ledger_entries (despesas categorizadas)",
        tabelasAusentes: ["asaas_cobrancas", "ledger_entries"],
      };
    }

    // Calcula DRE para o período
    const periodo = obterPeriodoMes(mes, ano);
    const resultado = calcularDREPeriodo(db, periodo.inicio, periodo.fim);

    return converterDREParaResumo(db, resultado);
  } catch (erro) {
    logger.warn("[RelatorioExecutivo] Erro ao calcular DRE:", erro);
    return {
      indisponivel: true,
      motivo: "Erro ao calcular DRE: " + (erro instanceof Error ? erro.message : String(erro)),
      fonteEsperada: "asaas_cobrancas + ledger_entries",
    };
  }
}

function tabelasAusentes(db: Database.Database, nomes: string[]): string[] {
  return nomes.filter((n) => !tabelaExiste(db, n));
}

const FONTE_RAZAO_CANONICO =
  "razão canônico (ledger_entries) e cadastros no armazenamento do navegador (IndexedDB); o servidor não recebe esses dados";

const MOTIVO_SEM_TABELAS = (tabelas: string[]) =>
  `O banco do servidor não possui as tabelas necessárias (${tabelas.join(", ")}).`;

/** Margens por propriedade: só calculáveis se o servidor tiver imoveis + transacoes. */
function margensIndisponivelSeFaltarTabela(db: Database.Database): SecaoIndisponivel | null {
  const ausentes = tabelasAusentes(db, ["imoveis", "transacoes"]);
  if (ausentes.length === 0) return null;
  return {
    indisponivel: true,
    motivo: `${MOTIVO_SEM_TABELAS(ausentes)} Cadastro de imóveis e transações vivem no navegador.`,
    fonteEsperada: FONTE_RAZAO_CANONICO,
    tabelasAusentes: ausentes,
  };
}

/** Calcula o resumo executivo para um mês/ano específico */
export function gerarRelatorioExecutivo(
  db: Database.Database,
  mes: number,
  ano: number,
): RelatorioExecutivo {
  const dre = calcularDREOuIndisponivel(db, mes, ano);

  const fluxo: SecaoIndisponivel = {
    indisponivel: true,
    motivo:
      "O servidor não possui saldo nem histórico de transações (tabelas transacoes e plano_de_contas inexistentes; fluxo_periodos não é alimentada por nenhum processo). Nenhuma projeção é feita sem base real.",
    fonteEsperada: FONTE_RAZAO_CANONICO,
    tabelasAusentes: tabelasAusentes(db, ["transacoes", "plano_de_contas"]),
  };

  const contas: SecaoIndisponivel = {
    indisponivel: true,
    motivo:
      "Contas a receber/pagar dependem das cobranças e do razão do negócio, que não existem no banco do servidor (asaas_cobrancas e cobrancas vivem no cliente; transacoes inexistente).",
    fonteEsperada: FONTE_RAZAO_CANONICO,
    tabelasAusentes: tabelasAusentes(db, ["cobrancas", "asaas_cobrancas", "transacoes"]),
  };

  const margens: Secao<MargensPorPropriedadeResumo> =
    margensIndisponivelSeFaltarTabela(db) ?? gerarMargensResumo(db, mes, ano);

  const razaoServidor = gerarRazaoServidorResumo(db, mes, ano);

  // Alertas: só os que podem ser derivados de seções realmente disponíveis.
  const alertas: AlertaExecutivo[] = secaoIndisponivel(margens) ? [] : gerarAlertasDeMargens(margens);

  const sumario: SecaoIndisponivel = {
    indisponivel: true,
    motivo:
      "O sumário (ocupação, inadimplência, dias de caixa, status geral) combina DRE, fluxo, contas e cadastro de imóveis, todos indisponíveis no servidor. Status geral não é inferido de dados parciais.",
    fonteEsperada: FONTE_RAZAO_CANONICO,
  };

  const secoes: Array<[string, Secao<unknown>]> = [
    ["dre", dre],
    ["fluxo", fluxo],
    ["margens", margens],
    ["contas", contas],
    ["razaoServidor", razaoServidor],
    ["sumario", sumario],
  ];
  const secoesIndisponiveis = secoes.filter(([, s]) => secaoIndisponivel(s)).map(([nome]) => nome);

  return {
    periodo: `${ano}-${String(mes).padStart(2, "0")}`,
    mes,
    ano,
    dre,
    fluxo,
    margens,
    alertas,
    contas,
    razaoServidor,
    sumario,
    secoesIndisponiveis,
    completo: secoesIndisponiveis.length === 0,
    criadoEm: new Date().toISOString(),
  };
}

/** Resume o razão do servidor (propostas de lançamento da conciliação PIX/OFX) no mês. */
function gerarRazaoServidorResumo(db: Database.Database, mes: number, ano: number): Secao<RazaoServidorResumo> {
  if (!tabelaExiste(db, "razao")) {
    return {
      indisponivel: true,
      motivo: MOTIVO_SEM_TABELAS(["razao"]),
      fonteEsperada: "tabela razao do servidor (migrations-phase8-conciliacao-pix-ofx.sql)",
      tabelasAusentes: ["razao"],
    };
  }

  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const proximoMes = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`;

  const linhas = db
    .prepare(
      `SELECT tipo, status, COUNT(*) AS quantidade, COALESCE(SUM(valor), 0) AS valorTotal
       FROM razao
       WHERE criado_em >= ? AND criado_em < ?
       GROUP BY tipo, status
       ORDER BY tipo, status`,
    )
    .all(inicio, proximoMes) as Array<{ tipo: string | null; status: string | null; quantidade: number; valorTotal: number }>;

  return {
    fonte: "razao",
    totalLancamentos: linhas.reduce((s, l) => s + l.quantidade, 0),
    valorTotal: linhas.reduce((s, l) => s + l.valorTotal, 0),
    porTipoStatus: linhas,
    aviso:
      "Fila de propostas geradas pela conciliação PIX/OFX no servidor; não é o razão contábil canônico nem uma DRE. Valores na unidade gravada em razao.valor, sem conversão.",
  };
}

/** Gera resumo de margens por propriedade (requer imoveis + transacoes; checado por quem chama). */
function gerarMargensResumo(db: Database.Database, mes: number, ano: number): MargensPorPropriedadeResumo {
  const margens = listarMargensDasPropriedades(db, mes, ano);
  const total = margens.length;
  const mediaGeral = total > 0 ? margens.reduce((sum, m) => sum + m.margem, 0) / total : 0;

  const ordenadas = [...margens].sort((a, b) => b.margem - a.margem);
  return {
    total,
    mediaGeral,
    top5: ordenadas.slice(0, 5),
    bottom5: ordenadas.slice(-5).reverse(),
  };
}

function listarMargensDasPropriedades(db: Database.Database, mes: number, ano: number): MargemPropriedade[] {
  const propriedades = db.prepare("SELECT id, nome FROM imoveis ORDER BY nome").all() as Array<{ id: number; nome: string }>;

  return propriedades
    .map((prop) => {
      try {
        const margem = calcularMargensImovel(db, prop.id, ano, mes);
        return {
          imovelId: margem.imovelId,
          nomePropriedade: margem.nomeProriedade,
          margem: margem.margem,
          status: margem.status,
        };
      } catch (erro) {
        logger.warn(`[RelatorioExecutivo] Margem do imóvel ${prop.id} não calculada:`, erro);
        return null;
      }
    })
    .filter((m) => m !== null) as Array<MargemPropriedade>;
}

/** Gera margens por propriedade com paginação (ou seção indisponível se faltarem tabelas). */
export function gerarMargensResumodaPaginado(
  db: Database.Database,
  mes: number,
  ano: number,
  limit: number = 50,
  offset: number = 0,
): Secao<MargensPaginadas> {
  const indisponivel = margensIndisponivelSeFaltarTabela(db);
  if (indisponivel) return indisponivel;

  const margens = listarMargensDasPropriedades(db, mes, ano);
  const total = margens.length;
  const mediaGeral = total > 0 ? margens.reduce((sum, m) => sum + m.margem, 0) / total : 0;

  const ordenadas = [...margens].sort((a, b) => b.margem - a.margem);
  return {
    items: ordenadas.slice(offset, offset + limit),
    total,
    mediaGeral,
    limit,
    offset,
    hasMore: offset + limit < total,
  };
}

/** Alertas derivados exclusivamente das margens (única seção de negócio calculável aqui). */
function gerarAlertasDeMargens(margensResumo: MargensPorPropriedadeResumo): AlertaExecutivo[] {
  const criticas = margensResumo.bottom5.filter((p) => p.status === "CRÍTICO");
  if (criticas.length === 0) return [];
  return [
    {
      tipo: "aviso",
      titulo: `${criticas.length} Propriedade(s) com Margem Crítica`,
      descricao: `${criticas.map((p) => `${p.nomePropriedade} (${p.margem.toFixed(1)}%)`).join(", ")}`,
      recomendacao: "Analisar custos ou ajustar preço de aluguel",
    },
  ];
}

/** Gera PDF (HTML formatado) do relatório executivo */
export function gerarPDFRelatorioExecutivo(db: Database.Database, mes: number, ano: number): string {
  const relatorio = gerarRelatorioExecutivo(db, mes, ano);
  const periodo = `${mes}/${ano}`;
  const margens = relatorio.margens;
  const margensVisiveis = secaoIndisponivel(margens)
    ? []
    : [...margens.top5, ...margens.bottom5.filter((b) => !margens.top5.some((t) => t.imovelId === b.imovelId))];

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
  <style>
    .indisponivel { background: #fff8e1; border: 1px dashed #b8860b; border-radius: 6px; padding: 12px 16px; margin: 10px 0; color: #5c4400; font-size: 13px; }
    .indisponivel strong { display: block; margin-bottom: 4px; }
  </style>
  <div class="container">
    <header>
      <h1>Relatório Executivo</h1>
      <div class="header-meta">Período: ${periodo} | Gerado em: ${new Date(relatorio.criadoEm).toLocaleDateString("pt-BR")}</div>
    </header>

    <h2>Resumo Executivo</h2>
    ${
      relatorio.completo
        ? ""
        : `<div class="indisponivel"><strong>Relatório parcial</strong>Seções indisponíveis no servidor: ${relatorio.secoesIndisponiveis.map(escapeHtml).join(", ")}. Nenhum valor foi estimado; os motivos estão em cada seção.</div>`
    }
    ${blocoIndisponivel("Resumo Executivo (KPIs)", relatorio.sumario)}

    <h2>Demonstração de Resultado (DRE)</h2>
    ${blocoIndisponivel("DRE", relatorio.dre)}

    <h2>Fluxo de Caixa</h2>
    ${blocoIndisponivel("Fluxo de Caixa", relatorio.fluxo)}

    <h2>Margens por Propriedade</h2>
    ${
      secaoIndisponivel(relatorio.margens)
        ? blocoIndisponivel("Margens por Propriedade", relatorio.margens)
        : `<table>
      <tr><th>Imóvel</th><th style="text-align: right;">Margem</th><th>Status</th></tr>
      ${margensVisiveis
        .map(
          (p) => `<tr><td>${escapeHtml(p.nomePropriedade)}</td><td style="text-align: right;">${p.margem.toFixed(1)}%</td><td>${escapeHtml(p.status)}</td></tr>`,
        )
        .join("")}
    </table>
    <p>Média geral: <strong>${relatorio.margens.mediaGeral.toFixed(1)}%</strong> em ${relatorio.margens.total} imóvel(is).</p>`
    }

    <h2>Contas a Receber</h2>
    ${blocoIndisponivel("Contas a Receber", relatorio.contas)}

    <h2>Contas a Pagar</h2>
    ${blocoIndisponivel("Contas a Pagar", relatorio.contas)}

    <h2>Razão do Servidor (conciliação PIX/OFX)</h2>
    ${
      secaoIndisponivel(relatorio.razaoServidor)
        ? blocoIndisponivel("Razão do Servidor", relatorio.razaoServidor)
        : `<p>${relatorio.razaoServidor.totalLancamentos} lançamento(s) no mês; soma de valores: ${relatorio.razaoServidor.valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (unidade gravada).</p>
    <table>
      <tr><th>Tipo</th><th>Status</th><th style="text-align: right;">Quantidade</th><th style="text-align: right;">Valor</th></tr>
      ${relatorio.razaoServidor.porTipoStatus
        .map(
          (l) => `<tr><td>${escapeHtml(l.tipo ?? "-")}</td><td>${escapeHtml(l.status ?? "-")}</td><td style="text-align: right;">${l.quantidade}</td><td style="text-align: right;">${l.valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td></tr>`,
        )
        .join("")}
    </table>
    <p style="font-size: 12px; color: #666;">${escapeHtml(relatorio.razaoServidor.aviso)}</p>`
    }

    <h2>Alertas e Recomendações</h2>
    ${
      relatorio.alertas.length === 0
        ? '<p style="color: #666;">Nenhum alerta calculável com os dados disponíveis no servidor.</p>'
        : relatorio.alertas.map((alerta) => `
    <div class="alert alert-${alerta.tipo}">
      <div class="alert-title">${escapeHtml(alerta.titulo)}</div>
      <div>${escapeHtml(alerta.descricao)}</div>
      ${alerta.recomendacao ? `<div style="margin-top: 8px; font-size: 12px;"><strong>Recomendação:</strong> ${escapeHtml(alerta.recomendacao)}</div>` : ""}
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

function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Caixa de aviso para seção indisponível; vazio se a seção estiver disponível. */
function blocoIndisponivel(titulo: string, secao: Secao<unknown>): string {
  if (!secaoIndisponivel(secao)) return "";
  return `<div class="indisponivel"><strong>${escapeHtml(titulo)}: indisponível</strong>${escapeHtml(secao.motivo)}<br><em>Fonte esperada: ${escapeHtml(secao.fonteEsperada)}</em></div>`;
}

/** Envia o relatório por email */
export async function enviarRelatorioEmailMensal(
  db: Database.Database,
  email: string,
  mes: number,
  ano: number,
): Promise<{ sucesso: boolean; idEmail?: string; erro?: string }> {
  try {
    const { enviarEmail } = await import("../../notificacoes/email.js");
    const relatorio = gerarRelatorioExecutivo(db, mes, ano);
    const periodo = `${mes}/${ano}`;
    const html = gerarPDFRelatorioExecutivo(db, mes, ano);

    // Grava relatório gerado no banco
    gravarRelatorioGerado(db, mes, ano, html, email);

    const linhaStatus = relatorio.completo
      ? "Relatório completo."
      : `Relatório PARCIAL — seções indisponíveis no servidor: ${relatorio.secoesIndisponiveis.join(", ")}. Nenhum valor foi estimado.`;

    await enviarEmail({
      destinatario: email,
      assunto: `Relatório Executivo - Período ${periodo}`,
      corpo: `Prezado,\n\nSegue em anexo o Relatório Executivo referente ao período ${periodo}.\n\n${linhaStatus}\n\nAtenciosamente,\nSistema de Relatórios`,
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
