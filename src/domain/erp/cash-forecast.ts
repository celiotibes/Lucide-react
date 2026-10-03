/**
 * Cash Forecast
 * Projeção de fluxo de caixa para 12 meses
 * Baseado em padrões históricos e sazonalidade
 */

import type { Database } from "sql.js";
import { consultar } from "../../db/connection";

export interface ProjecaoMensal {
  ano: number;
  mes: number;
  saldo_inicial: number;
  entradas_operacional: number;
  saidas_operacional: number;
  liquido_operacional: number;
  entradas_investimento: number;
  saidas_investimento: number;
  liquido_investimento: number;
  entradas_financiamento: number;
  saidas_financiamento: number;
  liquido_financiamento: number;
  saldo_final: number;
  variacao_mes: number;
  confianca: "alta" | "media" | "baixa";
}

export interface RelatorioProjecaoCaixa {
  mes_projecao: string;
  saldo_atual: number;
  projecoes: ProjecaoMensal[];
  saldo_minimo_projetado: number;
  saldo_maximo_projetado: number;
  mes_critico: string | null;
  tendencia: "positiva" | "negativa" | "estavel";
  recomendacoes: string[];
}

export function gerarProjecaoCaixa(
  db: Database,
  entidade_id: number,
  periodo_id: number,
): RelatorioProjecaoCaixa {
  // Obter período atual
  const [periodAtual] = consultar<{ ano: number; mes: number }>(
    db,
    "SELECT ano, mes FROM periodos_contabeis WHERE id = ?",
    [periodo_id],
  );

  if (!periodAtual) {
    return {
      mes_projecao: "N/A",
      saldo_atual: 0,
      projecoes: [],
      saldo_minimo_projetado: 0,
      saldo_maximo_projetado: 0,
      mes_critico: null,
      tendencia: "estavel",
      recomendacoes: [],
    };
  }

  // Obter saldo inicial (caixa no período atual)
  const [saldoAtual] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(
      CASE WHEN cp.natureza = 'debito' THEN le.valor_debito
           ELSE le.valor_credito END), 0) as total
     FROM ledger_entries le
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.codigo IN ('1.1.01', '1.1.02', '1.1.03')`,
    [entidade_id, periodo_id],
  );

  const saldoInicial = saldoAtual?.total || 0;

  // Calcular média histórica de entradas/saídas — GROUP BY p.mes devolve uma linha por mês
  // (várias linhas), não uma linha só: `const [dadosHistoricos] = consultar(...)` pegava só
  // a primeira e o `Array.isArray(dadosHistoricos)` abaixo dava sempre falso (era um objeto
  // {mes, entradas, saidas}, não array) — a sazonalidade nunca era calculada, em silêncio.
  const dadosHistoricos = consultar<{
    mes: number;
    entradas: number;
    saidas: number;
  }>(
    db,
    `SELECT
      p.mes,
      COALESCE(SUM(le.valor_debito), 0) as entradas,
      COALESCE(SUM(le.valor_credito), 0) as saidas
     FROM periodos_contabeis p
     LEFT JOIN ledger_entries le ON le.periodo_id = p.id AND le.entidade_id = ?
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id AND cp.codigo IN ('1.1.01', '1.1.02', '1.1.03')
     WHERE p.entidade_id = ? AND p.id < ?
     GROUP BY p.mes
     ORDER BY p.mes`,
    [entidade_id, entidade_id, periodo_id],
  );

  // Calcular média por mês (sazonalidade)
  const mediasPorMes = new Map<number, { entradas: number; saidas: number; confianca: number }>();
  const histMeses = new Map<number, { entradas: number[]; saidas: number[] }>();

  if (dadosHistoricos && Array.isArray(dadosHistoricos)) {
    for (const registro of dadosHistoricos) {
      const mes = registro.mes;
      if (!histMeses.has(mes)) {
        histMeses.set(mes, { entradas: [], saidas: [] });
      }
      histMeses.get(mes)!.entradas.push(registro.entradas || 0);
      histMeses.get(mes)!.saidas.push(registro.saidas || 0);
    }

    for (const [mes, dados] of histMeses) {
      const mediaEntradas = dados.entradas.reduce((a, b) => a + b, 0) / dados.entradas.length;
      const mediaSaidas = dados.saidas.reduce((a, b) => a + b, 0) / dados.saidas.length;
      const confianca = dados.entradas.length; // Mais histórico = maior confiança

      mediasPorMes.set(mes, {
        entradas: mediaEntradas,
        saidas: mediaSaidas,
        confianca: Math.min(confianca, 3), // Max 3 para normalizar
      });
    }
  }

  // Gerar projeção para 12 meses
  const projecoes: ProjecaoMensal[] = [];
  let saldoAtualizado = saldoInicial;
  let saldoMinimo = saldoInicial;
  let saldoMaximo = saldoInicial;
  let mesCritico: string | null = null;
  const saldos: number[] = [saldoInicial];

  let anoProj = periodAtual.ano;
  let mesProj = periodAtual.mes + 1;

  for (let i = 0; i < 12; i++) {
    if (mesProj > 12) {
      mesProj = 1;
      anoProj += 1;
    }

    // Obter dados históricos para este mês
    const dadosMes = mediasPorMes.get(mesProj) || {
      entradas: 0,
      saidas: 0,
      confianca: 0,
    };

    // Aplicar sazonalidade (variação de ±20% baseado em padrões)
    const variacaoSazonalidade = (Math.sin((mesProj - 1) * (Math.PI * 2) / 12) * 0.15) + 1;

    const entradasProjetadas = dadosMes.entradas * variacaoSazonalidade;
    const saidasProjetadas = dadosMes.saidas * variacaoSazonalidade;

    // Operacional: entradas - saídas
    const liquidoOperacional = entradasProjetadas - saidasProjetadas;

    // Investimento (assumir 0 para projeção conservadora)
    const liquidoInvestimento = 0;

    // Financiamento (assumir 0 para projeção conservadora)
    const liquidoFinanciamento = 0;

    const saldoFinal = saldoAtualizado + liquidoOperacional + liquidoInvestimento + liquidoFinanciamento;

    const projecao: ProjecaoMensal = {
      ano: anoProj,
      mes: mesProj,
      saldo_inicial: saldoAtualizado,
      entradas_operacional: entradasProjetadas,
      saidas_operacional: saidasProjetadas,
      liquido_operacional: liquidoOperacional,
      entradas_investimento: 0,
      saidas_investimento: 0,
      liquido_investimento: 0,
      entradas_financiamento: 0,
      saidas_financiamento: 0,
      liquido_financiamento: 0,
      saldo_final: saldoFinal,
      variacao_mes: liquidoOperacional,
      confianca:
        dadosMes.confianca >= 3 ? "alta" : dadosMes.confianca >= 2 ? "media" : "baixa",
    };

    projecoes.push(projecao);

    // Rastrear mínimo e máximo
    if (saldoFinal < saldoMinimo) {
      saldoMinimo = saldoFinal;
      if (saldoFinal < 0 && !mesCritico) {
        mesCritico = `${anoProj}/${String(mesProj).padStart(2, "0")}`;
      }
    }
    if (saldoFinal > saldoMaximo) {
      saldoMaximo = saldoFinal;
    }

    saldos.push(saldoFinal);
    saldoAtualizado = saldoFinal;
    mesProj += 1;
  }

  // Calcular tendência
  const primeiroTrimestre = saldos.slice(1, 4).reduce((a, b) => a + b, 0) / 3;
  const ultimoTrimestre = saldos.slice(-3).reduce((a, b) => a + b, 0) / 3;
  const tendencia: "positiva" | "negativa" | "estavel" =
    ultimoTrimestre > primeiroTrimestre * 1.1
      ? "positiva"
      : ultimoTrimestre < primeiroTrimestre * 0.9
        ? "negativa"
        : "estavel";

  // Gerar recomendações
  const recomendacoes: string[] = [];
  if (mesCritico) {
    recomendacoes.push(`⚠️ Possível déficit de caixa em ${mesCritico}`);
  }
  if (saldoMinimo < saldoInicial * 0.5) {
    recomendacoes.push("💡 Considerar aumento de entradas operacionais");
  }
  if (tendencia === "negativa") {
    recomendacoes.push("📉 Tendência de redução de saldo — revisão de despesas recomendada");
  }
  if (saldoMaximo > saldoInicial * 2.5) {
    recomendacoes.push("💰 Saldo elevado — considerar investimentos ou distribuições");
  }

  return {
    mes_projecao: `${periodAtual.ano}/${String(periodAtual.mes).padStart(2, "0")}`,
    saldo_atual: saldoInicial,
    projecoes,
    saldo_minimo_projetado: saldoMinimo,
    saldo_maximo_projetado: saldoMaximo,
    mes_critico: mesCritico,
    tendencia,
    recomendacoes,
  };
}
