/**
 * Sistema de Detecção de Anomalias em Fluxo de Caixa
 *
 * Implementa 3 métodos estatísticos independentes com votação/consenso:
 * 1. 2-Sigma (Desvio Padrão) — outliers extremos
 * 2. IQR (Interquartile Range) — anomalias relativas
 * 3. Percentile (P90/P95) — comportamento muito incomum
 *
 * Opções mistas:
 * - Votação: qual(is) método(s) disparou(aram)
 * - Consenso: 2+ métodos = alerta crítico vs aviso
 * - Blend Score: média ponderada (60% 2-sigma, 25% IQR, 15% P95)
 */

import Database from "better-sqlite3";
import { randomUUID } from "crypto";

// ============================================================
// TYPES
// ============================================================

export interface ResultadoDeteccao2Sigma {
  disparado: boolean;
  z_score: number;
  limite: number;
  confianca: number; // 0-100
}

export interface ResultadoDeteccaoIQR {
  disparado: boolean;
  valor: number;
  limite: number;
  confianca: number; // 0-100
}

export interface ResultadoDeteccaoPercentile {
  disparado: boolean;
  percentil: number; // P5 ou P95
  limite: number;
  confianca: number; // 0-100
}

export interface ResultadoAnomaliaAgregada {
  severidade: "baixa" | "media" | "critica";
  confianca: number; // 0-100, consenso dos métodos
  metodos_dispararam: string[]; // ["sigma_2", "iqr", "percentil"]
  scores_individuais: {
    sigma_2: ResultadoDeteccao2Sigma | null;
    iqr: ResultadoDeteccaoIQR | null;
    percentil: ResultadoDeteccaoPercentile | null;
  };
}

export interface AlertaAnomalia {
  id: string;
  transacao_id: string;
  usuario_id: string | null;
  severidade: "baixa" | "media" | "critica";
  confianca: number;
  metodos_dispararam: string;
  z_score: number | null;
  z_score_limite: number | null;
  iqr_valor: number | null;
  iqr_limite: number | null;
  percentil_valor: number | null;
  percentil_95: number | null;
  descricao: string;
  revisado: number;
  criado_em: string;
}

export interface MetricasCache {
  media?: number;
  desvio_padrao?: number;
  q1?: number;
  q2?: number;
  q3?: number;
  iqr_valor?: number;
  p5?: number;
  p90?: number;
  p95?: number;
  total_transacoes?: number;
}

// ============================================================
// HELPERS ESTATÍSTICOS (sem dependências externas)
// ============================================================

/**
 * Calcula média
 */
function calcularMedia(valores: number[]): number {
  if (valores.length === 0) return 0;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

/**
 * Calcula desvio padrão (sample)
 */
function calcularDesvio(valores: number[]): number {
  if (valores.length < 2) return 0;
  const media = calcularMedia(valores);
  const soma = valores.reduce((acc, v) => acc + Math.pow(v - media, 2), 0);
  return Math.sqrt(soma / (valores.length - 1));
}

/**
 * Calcula percentil usando interpolação linear
 */
function calcularPercentil(valores: number[], percentil: number): number {
  if (valores.length === 0) return 0;
  if (percentil < 0 || percentil > 100) return 0;

  const sorted = [...valores].sort((a, b) => a - b);
  const indice = (percentil / 100) * (sorted.length - 1);
  const piso = Math.floor(indice);
  const fracao = indice - piso;

  if (piso >= sorted.length - 1) return sorted[sorted.length - 1];
  return sorted[piso] * (1 - fracao) + sorted[piso + 1] * fracao;
}

/**
 * Recupera transações dos últimos N dias (ignorando NULL, segue ordem de criação)
 */
function obterTransacoesDosPeriodo(
  db: Database.Database,
  periodo_dias: number,
): number[] {
  const dataLimite = new Date();
  dataLimite.setDate(dataLimite.getDate() - periodo_dias);

  // Nota: este é um exemplo. A tabela real de transações está no cliente (sql.js).
  // Para o servidor, usamos conciliacao_ofx_cache (Phase 8) como proxy de transações.
  // Se houver uma tabela própria de transações no servidor, substitua aqui.
  const stmt = db.prepare(`
    SELECT COALESCE(ABS(valor), 0) as valor
    FROM conciliacao_ofx_cache
    WHERE datetime(criado_em) >= datetime(?)
    ORDER BY criado_em ASC
  `);

  const transacoes = stmt.all(dataLimite.toISOString()) as Array<{ valor: number }>;
  return transacoes.filter((t) => t.valor > 0).map((t) => t.valor);
}

/**
 * Recupera cache de métricas ou NULL se não existe/expirado (>24h)
 */
function obterCacheMetricas(
  db: Database.Database,
  tipo_metrica: string,
  periodo_dias: number,
): MetricasCache | null {
  const agora = new Date();
  const agoraISO = agora.toISOString();
  const limiteRecomputa = new Date(agora.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const stmt = db.prepare(`
    SELECT
      media,
      desvio_padrao,
      q1,
      q2,
      q3,
      iqr_valor,
      p5,
      p90,
      p95,
      total_transacoes,
      atualizado_em
    FROM cache_metricas_anomalias
    WHERE tipo_metrica = ?
      AND periodo_dias = ?
      AND usuario_id IS NULL
      AND datetime(atualizado_em) >= datetime(?)
    LIMIT 1
  `);

  const cache = stmt.get(tipo_metrica, periodo_dias, limiteRecomputa) as MetricasCache | undefined;
  return cache ?? null;
}

/**
 * Grava cache de métricas
 */
function gravarCacheMetricas(
  db: Database.Database,
  tipo_metrica: string,
  periodo_dias: number,
  metricas: MetricasCache,
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO cache_metricas_anomalias
    (id, usuario_id, tipo_metrica, periodo_dias,
     media, desvio_padrao, q1, q2, q3, iqr_valor, p5, p90, p95,
     total_transacoes, atualizado_em)
    VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  stmt.run(
    randomUUID(),
    tipo_metrica,
    periodo_dias,
    metricas.media ?? null,
    metricas.desvio_padrao ?? null,
    metricas.q1 ?? null,
    metricas.q2 ?? null,
    metricas.q3 ?? null,
    metricas.iqr_valor ?? null,
    metricas.p5 ?? null,
    metricas.p90 ?? null,
    metricas.p95 ?? null,
    metricas.total_transacoes ?? null,
  );
}

// ============================================================
// MÉTODO A: 2-SIGMA (Desvio Padrão)
// ============================================================

/**
 * Detecta anomalias usando 2-Sigma (Desvio Padrão)
 *
 * Alerta se: valor > média + 2×σ (95% confiança)
 * Sensibilidade: alta, falsos positivos: baixos
 */
export function detectarAnomalia2Sigma(
  db: Database.Database,
  valor: number,
  periodo_dias: number = 90,
): ResultadoDeteccao2Sigma {
  if (valor <= 0) {
    return { disparado: false, z_score: 0, limite: 0, confianca: 0 };
  }

  // Tenta recuperar cache
  let cache = obterCacheMetricas(db, "desvio_padrao", periodo_dias);

  if (!cache || !cache.media || !cache.desvio_padrao) {
    // Recomputa
    const transacoes = obterTransacoesDosPeriodo(db, periodo_dias);
    if (transacoes.length < 2) {
      return { disparado: false, z_score: 0, limite: 0, confianca: 0 };
    }

    const media = calcularMedia(transacoes);
    const desvio = calcularDesvio(transacoes);

    cache = {
      media,
      desvio_padrao: desvio,
      total_transacoes: transacoes.length,
    };

    gravarCacheMetricas(db, "desvio_padrao", periodo_dias, cache);
  }

  const media = cache.media!;
  const desvio = cache.desvio_padrao!;
  const limite = media + 2 * desvio;
  const z_score = (valor - media) / (desvio || 1);

  const disparado = valor > limite;
  const confianca = disparado ? Math.min(100, Math.round(Math.abs(z_score) * 20)) : 0;

  return { disparado, z_score, limite, confianca };
}

// ============================================================
// MÉTODO B: IQR (Interquartile Range)
// ============================================================

/**
 * Detecta anomalias usando IQR
 *
 * Alerta se: valor > Q3 + 1.5×(Q3-Q1) [whisker superior]
 * Sensibilidade: média, falsos positivos: muito baixos
 */
export function detectarAnomaliaIQR(
  db: Database.Database,
  valor: number,
  periodo_dias: number = 90,
): ResultadoDeteccaoIQR {
  if (valor <= 0) {
    return { disparado: false, valor: 0, limite: 0, confianca: 0 };
  }

  // Tenta recuperar cache
  let cache = obterCacheMetricas(db, "iqr", periodo_dias);

  if (!cache || cache.q1 === undefined || cache.q3 === undefined) {
    // Recomputa
    const transacoes = obterTransacoesDosPeriodo(db, periodo_dias);
    if (transacoes.length < 4) {
      return { disparado: false, valor: 0, limite: 0, confianca: 0 };
    }

    const q1 = calcularPercentil(transacoes, 25);
    const q2 = calcularPercentil(transacoes, 50);
    const q3 = calcularPercentil(transacoes, 75);
    const iqr = q3 - q1;

    cache = {
      q1,
      q2,
      q3,
      iqr_valor: iqr,
      total_transacoes: transacoes.length,
    };

    gravarCacheMetricas(db, "iqr", periodo_dias, cache);
  }

  const q3 = cache.q3!;
  const iqr = cache.iqr_valor!;
  const limite = q3 + 1.5 * iqr;

  const disparado = valor > limite;
  const confianca = disparado ? Math.min(100, Math.round(((valor - limite) / limite) * 50 + 30)) : 0;

  return { disparado, valor, limite, confianca };
}

// ============================================================
// MÉTODO C: PERCENTILE (P90/P95)
// ============================================================

/**
 * Detecta anomalias usando Percentile (P90/P95)
 *
 * Alerta se: valor > P95 ou valor < P5
 * Sensibilidade: média-baixa, falsos positivos: mínimos
 */
export function detectarAnomaliaPercentile(
  db: Database.Database,
  valor: number,
  periodo_dias: number = 90,
): ResultadoDeteccaoPercentile {
  if (valor <= 0) {
    return { disparado: false, percentil: 0, limite: 0, confianca: 0 };
  }

  // Tenta recuperar cache
  let cache = obterCacheMetricas(db, "percentil", periodo_dias);

  if (!cache || cache.p95 === undefined || cache.p5 === undefined) {
    // Recomputa
    const transacoes = obterTransacoesDosPeriodo(db, periodo_dias);
    if (transacoes.length < 10) {
      return { disparado: false, percentil: 0, limite: 0, confianca: 0 };
    }

    const p5 = calcularPercentil(transacoes, 5);
    const p90 = calcularPercentil(transacoes, 90);
    const p95 = calcularPercentil(transacoes, 95);

    cache = {
      p5,
      p90,
      p95,
      total_transacoes: transacoes.length,
    };

    gravarCacheMetricas(db, "percentil", periodo_dias, cache);
  }

  const p95 = cache.p95!;
  const p5 = cache.p5!;

  const acima = valor > p95;
  const abaixo = valor < p5;
  const disparado = acima || abaixo;

  let percentil = 95;
  if (abaixo) percentil = 5;

  const confianca = disparado
    ? Math.min(100, Math.round(Math.abs(valor - (acima ? p95 : p5)) / Math.max(p95, Math.abs(p5)) * 40 + 40))
    : 0;

  return { disparado, percentil, limite: acima ? p95 : p5, confianca };
}

// ============================================================
// AGREGAÇÃO: Votação + Consenso
// ============================================================

/**
 * Avalia anomalia agregada combinando os 3 métodos
 *
 * Severidade:
 * - Crítica: 2+ métodos disparados (consenso)
 * - Média: 1 método disparado com confiança > 60%
 * - Baixa: 1 método disparado com confiança < 60%
 */
export function avaliarAnomaliaAgregada(
  db: Database.Database,
  valor: number,
  periodo_dias: number = 90,
): ResultadoAnomaliaAgregada {
  const sigma2 = detectarAnomalia2Sigma(db, valor, periodo_dias);
  const iqr = detectarAnomaliaIQR(db, valor, periodo_dias);
  const percentil = detectarAnomaliaPercentile(db, valor, periodo_dias);

  const metodos_dispararam: string[] = [];
  const confiancas: number[] = [];

  if (sigma2.disparado) {
    metodos_dispararam.push("sigma_2");
    confiancas.push(sigma2.confianca);
  }
  if (iqr.disparado) {
    metodos_dispararam.push("iqr");
    confiancas.push(iqr.confianca);
  }
  if (percentil.disparado) {
    metodos_dispararam.push("percentil");
    confiancas.push(percentil.confianca);
  }

  // Calcula confiança agregada
  const confiancaAgregada =
    confiancas.length > 0
      ? Math.round(confiancas.reduce((a, b) => a + b, 0) / confiancas.length)
      : 0;

  // Define severidade
  let severidade: "baixa" | "media" | "critica" = "baixa";
  if (metodos_dispararam.length >= 2) {
    severidade = "critica";
  } else if (metodos_dispararam.length === 1) {
    severidade = confiancaAgregada >= 60 ? "media" : "baixa";
  }

  return {
    severidade,
    confianca: confiancaAgregada,
    metodos_dispararam,
    scores_individuais: {
      sigma_2: sigma2.disparado ? sigma2 : null,
      iqr: iqr.disparado ? iqr : null,
      percentil: percentil.disparado ? percentil : null,
    },
  };
}

// ============================================================
// PERSISTÊNCIA: Registra alertas no DB
// ============================================================

/**
 * Registra um alerta de anomalia na tabela alertas_anomalias_registrados
 */
export function registrarAlertaAnomalia(
  db: Database.Database,
  transacao_id: string,
  resultado: ResultadoAnomaliaAgregada,
  usuario_id: string | null = null,
): AlertaAnomalia {
  const { sigma_2, iqr, percentil } = resultado.scores_individuais;

  const descricao = gerarDescricaoAlerta(resultado, transacao_id);

  const stmt = db.prepare(`
    INSERT INTO alertas_anomalias_registrados
    (id, transacao_id, usuario_id, severidade, confianca,
     metodos_dispararam, z_score, z_score_limite,
     iqr_valor, iqr_limite, percentil_valor, percentil_95,
     descricao, revisado, criado_em)
    VALUES (?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?,
            ?, 0, CURRENT_TIMESTAMP)
  `);

  const id = randomUUID();
  stmt.run(
    id,
    transacao_id,
    usuario_id,
    resultado.severidade,
    resultado.confianca,
    resultado.metodos_dispararam.join(","),
    sigma_2?.z_score ?? null,
    sigma_2?.limite ?? null,
    iqr?.valor ?? null,
    iqr?.limite ?? null,
    percentil?.limite ?? null,
    percentil?.percentil === 95 ? percentil.limite : null,
    descricao,
  );

  return {
    id,
    transacao_id,
    usuario_id,
    severidade: resultado.severidade,
    confianca: resultado.confianca,
    metodos_dispararam: resultado.metodos_dispararam.join(","),
    z_score: sigma_2?.z_score ?? null,
    z_score_limite: sigma_2?.limite ?? null,
    iqr_valor: iqr?.valor ?? null,
    iqr_limite: iqr?.limite ?? null,
    percentil_valor: percentil?.limite ?? null,
    percentil_95: percentil?.percentil === 95 ? percentil.limite : null,
    descricao,
    revisado: 0,
    criado_em: new Date().toISOString(),
  };
}

// ============================================================
// HELPERS: Descrição legível do alerta
// ============================================================

function gerarDescricaoAlerta(resultado: ResultadoAnomaliaAgregada, transacao_id: string): string {
  const { sigma_2, iqr, percentil } = resultado.scores_individuais;
  const metodos = resultado.metodos_dispararam.length;

  let desc = `Anomalia detectada em ${transacao_id}: `;

  if (metodos >= 2) {
    desc += `CRÍTICA (${metodos} métodos concordam). `;
  } else if (resultado.confianca >= 60) {
    desc += `MÉDIA (confiança ${resultado.confianca}%). `;
  } else {
    desc += `BAIXA (confiança ${resultado.confianca}%). `;
  }

  const detalhes: string[] = [];
  if (sigma_2) detalhes.push(`2-Sigma: z=${sigma_2.z_score.toFixed(2)}`);
  if (iqr) detalhes.push(`IQR: ${iqr.confianca}% acima limite`);
  if (percentil) detalhes.push(`Percentile P${percentil.percentil}: ${percentil.confianca}% anômalo`);

  desc += `[${detalhes.join(", ")}]`;

  return desc;
}

/**
 * List anomaly alerts with optional filtering
 *
 * @param db Database instance (Better-SQLite3)
 * @param opcoes Optional filter parameters:
 *   - severidade: "info" | "warning" | "critical" severity level
 *   - dias: Filter for alerts created in the last N days
 *   - revisado: Filter by review status (true = reviewed, false = unreviewed)
 *   - limite: Maximum number of results to return
 *
 * @returns Array of anomaly alerts matching the filters, sorted by creation date (newest first)
 */
export function listarAlertas(
  db: Database.Database,
  opcoes: {
    severidade?: string;
    dias?: number;
    revisado?: boolean;
    limite?: number;
  } = {},
): AlertaAnomalia[] {
  let sql = `
    SELECT
      id, transacao_id, usuario_id, severidade, confianca,
      metodos_dispararam, z_score, z_score_limite,
      iqr_valor, iqr_limite, percentil_valor, percentil_95,
      descricao, revisado, criado_em
    FROM alertas_anomalias_registrados
    WHERE 1=1
  `;

  // Type-safe parameter array for SQL query
  const params: (string | number | boolean)[] = [];

  if (opcoes.severidade) {
    sql += ` AND severidade = ?`;
    params.push(opcoes.severidade);
  }

  if (opcoes.dias) {
    sql += ` AND datetime(criado_em) >= datetime('now', ?)`;
    params.push(`-${opcoes.dias} days`);
  }

  if (opcoes.revisado !== undefined) {
    sql += ` AND revisado = ?`;
    params.push(opcoes.revisado ? 1 : 0);
  }

  sql += ` ORDER BY criado_em DESC`;

  if (opcoes.limite) {
    sql += ` LIMIT ?`;
    params.push(opcoes.limite);
  }

  const stmt = db.prepare(sql);
  return stmt.all(...params) as AlertaAnomalia[];
}

/**
 * Marca um alerta como revisado
 */
export function marcarAnomaliaRevisada(
  db: Database.Database,
  alerta_id: string,
  usuario_id: string,
  motivo: string,
): void {
  const stmt = db.prepare(`
    UPDATE alertas_anomalias_registrados
    SET revisado = 1,
        revisado_por = ?,
        revisado_em = CURRENT_TIMESTAMP,
        motivo_revisao = ?
    WHERE id = ?
  `);

  stmt.run(usuario_id, motivo, alerta_id);
}

/**
 * Atualiza um alerta de anomalia (severidade e/ou descrição)
 */
export function atualizarAnomalia(
  db: Database.Database,
  alerta_id: string,
  campos: {
    severidade?: "baixa" | "media" | "critica";
    descricao?: string;
  },
): AlertaAnomalia | null {
  const alerta = obterAlerta(db, alerta_id);
  if (!alerta) return null;

  // Monta a query com apenas os campos fornecidos
  let sql = `UPDATE alertas_anomalias_registrados SET atualizado_em = CURRENT_TIMESTAMP`;
  const params: unknown[] = [];

  if (campos.severidade !== undefined) {
    sql += `, severidade = ?`;
    params.push(campos.severidade);
  }

  if (campos.descricao !== undefined) {
    sql += `, descricao = ?`;
    params.push(campos.descricao);
  }

  sql += ` WHERE id = ?`;
  params.push(alerta_id);

  db.prepare(sql).run(...params);

  return obterAlerta(db, alerta_id);
}

/**
 * Recupera um alerta específico
 */
export function obterAlerta(db: Database.Database, alerta_id: string): AlertaAnomalia | null {
  const stmt = db.prepare(`
    SELECT
      id, transacao_id, usuario_id, severidade, confianca,
      metodos_dispararam, z_score, z_score_limite,
      iqr_valor, iqr_limite, percentil_valor, percentil_95,
      descricao, revisado, criado_em
    FROM alertas_anomalias_registrados
    WHERE id = ?
  `);

  return (stmt.get(alerta_id) as AlertaAnomalia | undefined) ?? null;
}

/**
 * Recupera estatísticas de anomalias para um período
 */
export function obterEstatisticasAnomalias(
  db: Database.Database,
  periodo_dias: number = 30,
): {
  total: number;
  criticas: number;
  medias: number;
  baixas: number;
  revisadas: number;
  taxa_revisao: number;
} {
  const stmt = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN severidade = 'critica' THEN 1 ELSE 0 END) as criticas,
      SUM(CASE WHEN severidade = 'media' THEN 1 ELSE 0 END) as medias,
      SUM(CASE WHEN severidade = 'baixa' THEN 1 ELSE 0 END) as baixas,
      SUM(CASE WHEN revisado = 1 THEN 1 ELSE 0 END) as revisadas
    FROM alertas_anomalias_registrados
    WHERE datetime(criado_em) >= datetime('now', ?)
  `);

  const result = stmt.get(`-${periodo_dias} days`) as any;

  const total = result.total || 0;
  const revisadas = result.revisadas || 0;

  return {
    total,
    criticas: result.criticas || 0,
    medias: result.medias || 0,
    baixas: result.baixas || 0,
    revisadas,
    taxa_revisao: total > 0 ? Math.round((revisadas / total) * 100) : 0,
  };
}
