/**
 * Health Check — diagnostico de saúde do sistema
 *
 * Endpoint: GET /api/health
 * Responde em < 100ms e retorna status de:
 * - Servidor Express
 * - Banco de dados (conectado? respondendo?)
 * - Dependências externas (Asaas API, Pluggy API)
 * - Memory usage (RAM consumida)
 *
 * Usado por:
 * 1. Probes de liveness/readiness (Kubernetes, Docker, Railway)
 * 2. Monitoramento (Sentry, DataDog, New Relic)
 * 3. Dashboard de diagnóstico do sistema
 *
 * Resposta:
 * {
 *   "status": "ok" | "degraded" | "error",
 *   "timestamp": ISO 8601,
 *   "uptime": segundos desde boot,
 *   "checks": {
 *     "database": { status: "ok", latencia_ms: 5 },
 *     "memory": { status: "ok", percentual: 45.2 },
 *     "asaas": { status: "ok", latencia_ms: 120 },
 *     "pluggy": { status: "ok", latencia_ms: 150 }
 *   }
 * }
 */

import type { Database } from "better-sqlite3";

export type StatusSaude = "ok" | "degraded" | "error";

export interface CheckResultado {
  status: StatusSaude;
  latencia_ms?: number;
  mensagem?: string;
}

export interface RespostaSaude {
  status: StatusSaude;
  timestamp: string;
  uptime: number; // segundos desde boot
  checks: Record<string, CheckResultado>;
}

/**
 * Verifica saúde do banco de dados
 * Executa: SELECT 1 (query mais rápida possível)
 *
 * @param db Instância Better-SQLite3
 * @returns Status + latência em ms
 */
export async function verificarSaudeBD(db: Database): Promise<CheckResultado> {
  const inicio = Date.now();
  try {
    const resultado = db.prepare("SELECT 1 as ping").get();
    const latencia = Date.now() - inicio;
    if (!resultado) {
      return { status: "error", latencia_ms: latencia, mensagem: "SELECT 1 retornou nulo" };
    }
    return { status: "ok", latencia_ms: latencia };
  } catch (erro) {
    const latencia = Date.now() - inicio;
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return { status: "error", latencia_ms: latencia, mensagem };
  }
}

/**
 * Verifica saúde da API Asaas (testa conexão com endpoint raiz)
 * Não consome quota de API — apenas verifica que a URL é alcançável
 *
 * @returns Status + latência em ms
 */
export async function verificarSaudeAsaas(): Promise<CheckResultado> {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) {
    return { status: "degraded", mensagem: "ASAAS_API_KEY não configurada" };
  }

  const inicio = Date.now();
  try {
    const baseUrl = process.env.ASAAS_BASE_URL || (process.env.ASAAS_SANDBOX === "true" ? "https://sandbox.asaas.com" : "https://api.asaas.com");
    const resposta = await fetch(`${baseUrl}/v3/customers`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      // timeout de 5 segundos
      signal: AbortSignal.timeout(5000),
    });

    const latencia = Date.now() - inicio;

    // 401 significa chave inválida (erro confível)
    // 200 significa tudo ok
    // 429 significa rate limit (API ok, mas usuário deve esperar)
    // 5xx = servidor Asaas com problema
    if (resposta.status === 401) {
      return { status: "error", latencia_ms: latencia, mensagem: "Chave Asaas inválida ou expirada" };
    }
    if (resposta.status >= 500) {
      return { status: "degraded", latencia_ms: latencia, mensagem: `Asaas retornou ${resposta.status}` };
    }
    if (resposta.ok || resposta.status === 429) {
      return { status: "ok", latencia_ms: latencia };
    }

    return { status: "degraded", latencia_ms: latencia, mensagem: `HTTP ${resposta.status}` };
  } catch (erro) {
    const latencia = Date.now() - inicio;
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    // Timeout (AbortError) = degraded, não error
    const status = mensagem.includes("timeout") || mensagem.includes("Aborted") ? "degraded" : "error";
    return { status, latencia_ms: latencia, mensagem };
  }
}

/**
 * Verifica saúde da API Pluggy (testa endpoint de autenticação)
 *
 * @returns Status + latência em ms
 */
export async function verificarSaudePluggy(): Promise<CheckResultado> {
  const clientId = process.env.PLUGGY_CLIENT_ID;
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return { status: "degraded", mensagem: "PLUGGY_CLIENT_ID ou CLIENT_SECRET não configurados" };
  }

  const inicio = Date.now();
  try {
    const resposta = await fetch("https://api.pluggy.ai/v2/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret }),
      signal: AbortSignal.timeout(5000),
    });

    const latencia = Date.now() - inicio;

    if (resposta.status === 401) {
      return { status: "error", latencia_ms: latencia, mensagem: "Credenciais Pluggy inválidas" };
    }
    if (resposta.status >= 500) {
      return { status: "degraded", latencia_ms: latencia, mensagem: `Pluggy retornou ${resposta.status}` };
    }
    if (resposta.ok) {
      return { status: "ok", latencia_ms: latencia };
    }

    return { status: "degraded", latencia_ms: latencia, mensagem: `HTTP ${resposta.status}` };
  } catch (erro) {
    const latencia = Date.now() - inicio;
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    const status = mensagem.includes("timeout") || mensagem.includes("Aborted") ? "degraded" : "error";
    return { status, latencia_ms: latencia, mensagem };
  }
}

/**
 * Verifica saúde de memória (RAM consumida pelo processo)
 * Avisa se > 80% (degraded) ou > 95% (error)
 *
 * @returns Status + percentual de RAM usado
 */
export function verificarSaudeMemoria(): CheckResultado {
  const info = process.memoryUsage();
  const totalMemoriaDisponivelMB = require("os").totalmem() / 1024 / 1024;
  const memoriaUsadaMB = info.heapUsed / 1024 / 1024;
  const percentualUsado = (info.heapUsed / info.heapTotal) * 100;

  if (percentualUsado > 95) {
    return { status: "error", mensagem: `Heap ${percentualUsado.toFixed(1)}% (crítico)` };
  }
  if (percentualUsado > 80) {
    return { status: "degraded", mensagem: `Heap ${percentualUsado.toFixed(1)}%` };
  }

  return { status: "ok", mensagem: `Heap ${percentualUsado.toFixed(1)}% de ${(info.heapTotal / 1024 / 1024).toFixed(0)}MB` };
}

/**
 * Executa todos os health checks
 *
 * @param db Instância do banco
 * @returns Resposta com status agregado + detalhes de cada check
 */
export async function executarHealthCheck(db: Database): Promise<RespostaSaude> {
  const checks = {
    database: await verificarSaudeBD(db),
    memory: verificarSaudeMemoria(),
    asaas: await verificarSaudeAsaas(),
    pluggy: await verificarSaudePluggy(),
  };

  // Status agregado: ok = tudo ok; degraded = pelo menos um degraded; error = pelo menos um error
  let statusAgregado: StatusSaude = "ok";
  for (const check of Object.values(checks)) {
    if (check.status === "error") {
      statusAgregado = "error";
      break;
    }
    if (check.status === "degraded" && statusAgregado !== "error") {
      statusAgregado = "degraded";
    }
  }

  return {
    status: statusAgregado,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks,
  };
}

/**
 * Versão lightweight para probes rápidas (só verifica BD e memória)
 * Útil para Kubernetes readiness probe (precisa responder em < 1s)
 *
 * @param db Instância do banco
 * @returns Resposta simplificada
 */
export async function executarHealthCheckLeve(db: Database): Promise<RespostaSaude> {
  const checks = {
    database: await verificarSaudeBD(db),
    memory: verificarSaudeMemoria(),
  };

  let statusAgregado: StatusSaude = "ok";
  for (const check of Object.values(checks)) {
    if (check.status === "error") {
      statusAgregado = "error";
      break;
    }
    if (check.status === "degraded" && statusAgregado !== "error") {
      statusAgregado = "degraded";
    }
  }

  return {
    status: statusAgregado,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks,
  };
}
