import type Database from "better-sqlite3";
import { logger } from '../../services/logger-service.js';

export interface ProjecaoFluxo {
  data: string;
  saldoEstimado: number;
  min: number;
  max: number;
  metodo: "media_movel" | "regressao";
}

interface TransacaoDiaria {
  data: string;
  valor: number;
  tipo: "receita" | "despesa";
}

/**
 * Calcula a média móvel de um array de valores
 */
function calcularMedia(valores: number[]): number {
  if (valores.length === 0) return 0;
  const soma = valores.reduce((a, b) => a + b, 0);
  return soma / valores.length;
}

/**
 * Calcula regressão linear simples: y = a + b*x
 */
function calcularRegressaoLinear(
  x: number[],
  y: number[],
): { intercepto: number; inclinacao: number; r2: number } {
  if (x.length < 2) return { intercepto: y[0] ?? 0, inclinacao: 0, r2: 0 };

  const n = x.length;
  const mediaX = x.reduce((a, b) => a + b, 0) / n;
  const mediaY = y.reduce((a, b) => a + b, 0) / n;

  let numerador = 0;
  let denominadorX = 0;
  let denominadorY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - mediaX;
    const dy = y[i] - mediaY;
    numerador += dx * dy;
    denominadorX += dx * dx;
    denominadorY += dy * dy;
  }

  const inclinacao = denominadorX === 0 ? 0 : numerador / denominadorX;
  const intercepto = mediaY - inclinacao * mediaX;
  const r2 = denominadorY === 0 ? 0 : (numerador * numerador) / (denominadorX * denominadorY);

  return { intercepto, inclinacao, r2 };
}

/**
 * Busca transações dos últimos 90 dias, agrupadas por dia
 */
function buscarHistoricoUltimos90Dias(db: Database.Database): TransacaoDiaria[] {
  try {
    const resultado = db.prepare(`
      SELECT
        DATE(t.data) AS data,
        CASE WHEN p.natureza = 'credito' THEN 'receita' ELSE 'despesa' END AS tipo,
        SUM(ABS(t.valor)) AS valor
      FROM transacoes t
      JOIN plano_de_contas p ON p.codigo = t.plano_conta_codigo
      WHERE t.data >= date('now', '-90 days')
        AND p.grupo != 'transferencia'
      GROUP BY DATE(t.data), tipo
      ORDER BY data
    `).all() as Array<{ data: string; tipo: string; valor: number }>;

    // Complementar com lembretes agendados
    let lembretesAgendados: Array<{ data: string; valor: number; tipo: string }> = [];
    try {
      lembretesAgendados = db.prepare(`
        SELECT
          DATE(la.data_vencimento) AS data,
          ABS(la.valor) AS valor,
          CASE WHEN la.tipo = 'receita' THEN 'receita' ELSE 'despesa' END AS tipo
        FROM lembretes_agendados la
        WHERE la.data_vencimento >= date('now', '-90 days')
          AND la.status IN ('pendente', 'agendado')
        ORDER BY data
      `).all() as Array<{ data: string; valor: number; tipo: string }>;
    } catch {
      // Tabela não existe, ignore
    }

    const todos = [...resultado, ...lembretesAgendados];

    // Agrupar por data
    const mapa = new Map<string, { receita: number; despesa: number }>();
    for (const t of todos) {
      const chave = t.data;
      if (!mapa.has(chave)) {
        mapa.set(chave, { receita: 0, despesa: 0 });
      }
      const entry = mapa.get(chave)!;
      if (t.tipo === "receita") {
        entry.receita += t.valor;
      } else {
        entry.despesa += t.valor;
      }
    }

    const resultado_final: TransacaoDiaria[] = [];
    for (const [data, { receita, despesa }] of mapa) {
      if (receita > 0) resultado_final.push({ data, valor: receita, tipo: "receita" });
      if (despesa > 0) resultado_final.push({ data, valor: -despesa, tipo: "despesa" });
    }

    return resultado_final;
  } catch (erro) {
    logger.error("Erro ao buscar histórico de 90 dias:", erro);
    return [];
  }
}

/**
 * Busca o saldo atual (soma de todas as transações, excluindo transferências)
 */
function buscarSaldoAtual(db: Database.Database): number {
  try {
    const resultado = db.prepare(`
      SELECT COALESCE(SUM(t.valor), 0) AS saldo_total
      FROM transacoes t
      JOIN plano_de_contas p ON p.codigo = t.plano_conta_codigo
      WHERE t.data <= date('now')
        AND p.grupo != 'transferencia'
    `).get() as { saldo_total: number };

    return resultado?.saldo_total ?? 0;
  } catch (erro) {
    logger.error("Erro ao buscar saldo atual:", erro);
    return 0;
  }
}

/**
 * Algoritmo A: Média Móvel
 */
export function forecastMediaMovel(db: Database.Database, diasAdiante: number = 30): ProjecaoFluxo[] {
  const saldoAtual = buscarSaldoAtual(db);
  const historico = buscarHistoricoUltimos90Dias(db);

  // Calcular fluxo net diário
  const fluxosDiarios: number[] = [];
  const mapa = new Map<string, number>();

  for (const t of historico) {
    const valor = mapa.get(t.data) ?? 0;
    mapa.set(t.data, valor + t.valor);
  }

  for (const valor of mapa.values()) {
    fluxosDiarios.push(valor);
  }

  // Se não há dados, retornar projeção flat
  if (fluxosDiarios.length === 0) {
    return Array.from({ length: diasAdiante }, (_, i) => ({
      data: new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      saldoEstimado: saldoAtual,
      min: saldoAtual,
      max: saldoAtual,
      metodo: "media_movel",
    }));
  }

  // Calcular média diária
  const mediaFluxoDiario = calcularMedia(fluxosDiarios);

  // Calcular desvio padrão para intervalo de confiança
  const variancia = fluxosDiarios.reduce((acc, v) => acc + Math.pow(v - mediaFluxoDiario, 2), 0) / fluxosDiarios.length;
  const desvio = Math.sqrt(variancia);
  const margem = desvio * 1.96; // 95% de confiança

  // Gerar projeções
  const projecoes: ProjecaoFluxo[] = [];
  let saldoProjetado = saldoAtual;

  for (let i = 1; i <= diasAdiante; i++) {
    saldoProjetado += mediaFluxoDiario;
    const data = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
    const dataStr = data.toISOString().split("T")[0];

    projecoes.push({
      data: dataStr,
      saldoEstimado: saldoProjetado,
      min: saldoProjetado - margem,
      max: saldoProjetado + margem,
      metodo: "media_movel",
    });
  }

  return projecoes;
}

/**
 * Algoritmo B: Regressão Linear com Sazonalidade
 */
export function forecastRegressao(db: Database.Database, diasAdiante: number = 30): ProjecaoFluxo[] {
  const saldoAtual = buscarSaldoAtual(db);
  const historico = buscarHistoricoUltimos90Dias(db);

  // Mapear fluxo por data
  const fluxosPorData = new Map<string, number>();
  for (const t of historico) {
    const valor = fluxosPorData.get(t.data) ?? 0;
    fluxosPorData.set(t.data, valor + t.valor);
  }

  // Se não há dados, retornar projeção flat
  if (fluxosPorData.size === 0) {
    return Array.from({ length: diasAdiante }, (_, i) => ({
      data: new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      saldoEstimado: saldoAtual,
      min: saldoAtual,
      max: saldoAtual,
      metodo: "regressao",
    }));
  }

  // Ordenar e criar arrays
  const datas = Array.from(fluxosPorData.keys()).sort();
  const x: number[] = [];
  const y: number[] = [];
  const diasSemana: number[] = [];

  for (let i = 0; i < datas.length; i++) {
    const data = new Date(datas[i] + "T00:00:00");
    x.push(i);
    y.push(fluxosPorData.get(datas[i])!);
    diasSemana.push(data.getDay());
  }

  // Calcular regressão linear base
  const regressao = calcularRegressaoLinear(x, y);

  // Calcular sazonalidade por dia da semana
  const fluxoPorDiaSemana = new Map<number, number[]>();
  for (let i = 0; i < diasSemana.length; i++) {
    const diaSemana = diasSemana[i];
    if (!fluxoPorDiaSemana.has(diaSemana)) {
      fluxoPorDiaSemana.set(diaSemana, []);
    }
    const yPredito = regressao.intercepto + regressao.inclinacao * x[i];
    const residual = y[i] - yPredito;
    fluxoPorDiaSemana.get(diaSemana)!.push(residual);
  }

  // Média de sazonalidade por dia da semana
  const sazonalidade: Record<number, number> = {};
  for (let i = 0; i < 7; i++) {
    const fluxos = fluxoPorDiaSemana.get(i) ?? [];
    sazonalidade[i] = calcularMedia(fluxos);
  }

  // Calcular desvio padrão dos resíduos
  const residuos = y.map((v, i) => {
    const yPredito = regressao.intercepto + regressao.inclinacao * x[i] + sazonalidade[diasSemana[i]];
    return v - yPredito;
  });
  const variancia = residuos.reduce((acc, r) => acc + Math.pow(r, 2), 0) / residuos.length;
  const desvio = Math.sqrt(variancia);
  const margem = desvio * 1.96; // 95% de confiança

  // Gerar projeções
  const projecoes: ProjecaoFluxo[] = [];
  let saldoProjetado = saldoAtual;

  for (let i = 1; i <= diasAdiante; i++) {
    const data = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
    const dataStr = data.toISOString().split("T")[0];
    const diaSemana = data.getDay();

    const diasDesdeInicio = x.length + i;

    const fluxoProjetado = regressao.intercepto + regressao.inclinacao * diasDesdeInicio + sazonalidade[diaSemana];
    saldoProjetado += fluxoProjetado;

    projecoes.push({
      data: dataStr,
      saldoEstimado: saldoProjetado,
      min: saldoProjetado - margem,
      max: saldoProjetado + margem,
      metodo: "regressao",
    });
  }

  return projecoes;
}
