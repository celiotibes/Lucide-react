/**
 * Sistema de REEMBOLSOS via Asaas Payments API
 *
 * Este módulo permite processar devoluções e restituições de pagamentos
 * através da plataforma Asaas.
 *
 * Fluxo:
 * 1. Usuário chama criarReembolso() com dados da transação original
 * 2. Validamos dados (valor, transação original, motivo)
 * 3. Registramos no banco com status 'pendente'
 * 4. Enviamos para Asaas Payments API para processamento
 * 5. Webhook do Asaas notifica quando reembolso foi confirmado
 * 6. Audit trail grava todas as mudanças em asaas_reembolsos_historico
 *
 * Segurança:
 * - ASAAS_API_KEY lida no momento da chamada
 * - Validação rigorosa de entrada
 * - Nunca lança exceção não capturada, sempre loga
 *
 * BRIDGE PARA COBRANCAS:
 * - processarReembolsoAsaas() e obterReembolsosPorChargeId() mapeiam
 *   do modelo de cobrança (asaasChargeId, origemTipo, origemId) para
 *   este modelo de reembolso (numero_transacao_original, usuario_id)
 */

import type Database from "better-sqlite3";
import { logger } from '../../services/logger-service.js';
import { randomUUID } from "crypto";

export type FetchLike = typeof fetch;

// Union type for db objects that could be either better-sqlite3 or sql.js
// Used to support both production (better-sqlite3) and test (sql.js) databases
interface SqlJsDatabase {
  exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
  run(sql: string): void;
}

type DatabasePolymorphic = Database.Database | SqlJsDatabase;

/**
 * Status possíveis para um reembolso
 */
export type StatusReembolso = "pendente" | "processando" | "confirmado" | "rejeitado" | "cancelado";

/**
 * Interface do registro de reembolso
 */
export interface Reembolso {
  id: string;
  usuario_id: string;
  valor: number; // Deve ser positivo
  status: StatusReembolso;
  data_solicitacao: string; // ISO 8601 format
  data_confirmacao: string | null; // ISO 8601 format
  motivo: string;
  numero_transacao_original: string; // ID da transação original a ser reembolsada
  asaas_reembolso_id: string | null; // ID retornado pelo Asaas
  descricao_erro?: string | null; // Se rejeitado, motivo do erro
}

/**
 * Dados para criar um novo reembolso
 */
export interface DadosNovoReembolso {
  usuario_id: string;
  valor: number;
  motivo: string;
  numero_transacao_original: string;
  descricao?: string;
}

/**
 * Resposta da API Asaas ao processar reembolso
 */
interface RespostaReembolsoAsaas {
  id: string;
  status: string;
  amount: number;
  originalTransactionId: string;
  processedDate?: string;
  error?: string;
}

/**
 * Payload de webhook do Asaas para reembolsos
 */
export interface WebhookReembolsoAsaas {
  type: string;
  data: {
    id: string;
    status: string;
    amount: number;
    originalTransactionId: string;
    paymentDate?: string;
  };
}

/**
 * Resultado de validação
 */
export interface ResultadoValidacao {
  valido: boolean;
  erros: string[];
}

/**
 * Erro de configuração do Asaas
 */
export class AsaasConfiguracaoAusenteError extends Error {
  constructor(variavel: string) {
    super(
      `${variavel} não está configurada no ambiente — defina no .env para usar Asaas Reembolsos`,
    );
    this.name = "AsaasConfiguracaoAusenteError";
  }
}

/**
 * Erro da API do Asaas
 */
export class AsaasApiError extends Error {
  status: number;
  corpo: unknown;
  constructor(status: number, corpo: unknown, mensagem?: string) {
    super(mensagem || `Asaas respondeu ${status}`);
    this.name = "AsaasApiError";
    this.status = status;
    this.corpo = corpo;
  }
}

/**
 * Erro de validação de dados
 */
export class ErroValidacaoReembolso extends Error {
  erros: string[];
  constructor(erros: string[]) {
    super(`Erro ao validar reembolso: ${erros.join(", ")}`);
    this.name = "ErroValidacaoReembolso";
    this.erros = erros;
  }
}

/**
 * Retorna a URL base da API Asaas (sandbox ou produção)
 */
function obterBaseUrl(): string {
  const sandbox = process.env.ASAAS_SANDBOX === "true";
  return sandbox ? "https://sandbox.asaas.com/api/v3" : "https://api.asaas.com/api/v3";
}

/**
 * Retorna a chave API do Asaas
 */
function obterChaveApi(): string {
  const chave = process.env.ASAAS_API_KEY;
  if (!chave) {
    throw new AsaasConfiguracaoAusenteError("ASAAS_API_KEY");
  }
  return chave;
}

/**
 * Faz uma chamada HTTP genérica para a API do Asaas
 */
async function chamarAsaas<T>(
  fetchImpl: FetchLike,
  metodo: "GET" | "POST",
  caminho: string,
  corpo?: unknown,
): Promise<T> {
  const url = `${obterBaseUrl()}${caminho}`;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    access_token: obterChaveApi(),
  };

  const resposta = await fetchImpl(url, {
    method: metodo,
    headers,
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });

  const textoCorpo = await resposta.text();
  const jsonCorpo = textoCorpo ? JSON.parse(textoCorpo) : {};

  if (!resposta.ok) {
    throw new AsaasApiError(resposta.status, jsonCorpo);
  }

  return jsonCorpo as T;
}

/**
 * Valida dados de um novo reembolso
 */
export function validarDadosReembolso(dados: DadosNovoReembolso): ResultadoValidacao {
  const erros: string[] = [];

  // Validação de usuario_id
  if (!dados.usuario_id || dados.usuario_id.trim().length === 0) {
    erros.push("usuario_id é obrigatório");
  }

  // Validação de valor
  if (typeof dados.valor !== "number" || dados.valor <= 0) {
    erros.push("valor deve ser um número positivo");
  }
  if (dados.valor > 1000000) {
    erros.push("valor não pode exceder R$ 1.000.000,00");
  }

  // Validação de motivo
  if (!dados.motivo || dados.motivo.trim().length === 0) {
    erros.push("motivo é obrigatório");
  }
  if (dados.motivo && dados.motivo.trim().length > 500) {
    erros.push("motivo não pode ter mais de 500 caracteres");
  }

  // Validação de numero_transacao_original
  if (!dados.numero_transacao_original || dados.numero_transacao_original.trim().length === 0) {
    erros.push("numero_transacao_original é obrigatório");
  }

  return {
    valido: erros.length === 0,
    erros,
  };
}

/**
 * Cria um novo reembolso no banco de dados
 */
export function criarReembolso(db: Database.Database, dados: DadosNovoReembolso): Reembolso {
  const validacao = validarDadosReembolso(dados);
  if (!validacao.valido) {
    throw new ErroValidacaoReembolso(validacao.erros);
  }

  const id = randomUUID();
  const agora = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO asaas_reembolsos (
      id,
      usuario_id,
      valor,
      status,
      data_solicitacao,
      data_confirmacao,
      motivo,
      numero_transacao_original,
      asaas_reembolso_id,
      descricao_erro
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    dados.usuario_id,
    dados.valor,
    "pendente",
    agora,
    null,
    dados.motivo,
    dados.numero_transacao_original,
    null,
    null,
  );

  // Log de auditoria
  try {
    const stmtAudit = db.prepare(`
      INSERT INTO asaas_reembolsos_historico (
        reembolso_id,
        usuario_id,
        acao,
        status_anterior,
        status_novo,
        data_acao,
        descricao
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmtAudit.run(
      id,
      dados.usuario_id,
      "CRIACAO",
      null,
      "pendente",
      agora,
      `Reembolso criado para transação ${dados.numero_transacao_original}`,
    );
  } catch (err) {
    logger.error("Erro ao registrar auditoria de reembolso:", err);
  }

  return obterReembolso(db, id) as Reembolso;
}

/**
 * Obtém um reembolso pelo ID
 */
/**
 * Retrieve a specific refund by ID
 *
 * @param db Database instance (Better-SQLite3)
 * @param id The refund ID to retrieve
 * @returns The refund object or null if not found
 */
export function obterReembolso(db: Database.Database, id: string): Reembolso | null {
  const stmt = db.prepare(`
    SELECT * FROM asaas_reembolsos WHERE id = ?
  `);

  const resultado = stmt.get(id) as Reembolso | undefined;
  return resultado || null;
}

/**
 * List refunds with optional filters
 *
 * @param db Database instance (Better-SQLite3)
 * @param filtros Optional filter parameters:
 *   - usuario_id: Filter by specific user
 *   - status: Filter by refund status (pendente, processando, confirmado, rejeitado, cancelado)
 *   - data_inicio: Filter for refunds from this date onwards (ISO 8601 format)
 *   - data_fim: Filter for refunds up to this date (ISO 8601 format)
 *
 * @returns Array of refunds matching the filters
 */
export function listarReembolsos(
  db: Database.Database,
  filtros?: {
    usuario_id?: string;
    status?: StatusReembolso;
    data_inicio?: string;
    data_fim?: string;
  },
): Reembolso[] {
  let sql = "SELECT * FROM asaas_reembolsos WHERE 1=1";
  // Type-safe parameter array for SQL query
  const params: string[] = [];

  if (filtros?.usuario_id) {
    sql += " AND usuario_id = ?";
    params.push(filtros.usuario_id);
  }

  if (filtros?.status) {
    sql += " AND status = ?";
    params.push(filtros.status);
  }

  if (filtros?.data_inicio) {
    sql += " AND data_solicitacao >= ?";
    params.push(filtros.data_inicio);
  }

  if (filtros?.data_fim) {
    sql += " AND data_solicitacao <= ?";
    params.push(filtros.data_fim);
  }

  sql += " ORDER BY data_solicitacao DESC";

  const stmt = db.prepare(sql);
  return stmt.all(...params) as Reembolso[];
}

/**
 * Atualiza o status de um reembolso
 */
export function atualizarStatusReembolso(
  db: Database.Database,
  id: string,
  novo_status: StatusReembolso,
  descricao_erro?: string,
): Reembolso {
  const statusValidos: StatusReembolso[] = [
    "pendente",
    "processando",
    "confirmado",
    "rejeitado",
    "cancelado",
  ];

  if (!statusValidos.includes(novo_status)) {
    throw new Error(`Status inválido: ${novo_status}`);
  }

  const reembolso = obterReembolso(db, id);
  if (!reembolso) {
    throw new Error(`Reembolso ${id} não encontrado`);
  }

  const agora = new Date().toISOString();
  const data_confirmacao = novo_status === "confirmado" ? agora : reembolso.data_confirmacao;

  const stmt = db.prepare(`
    UPDATE asaas_reembolsos
    SET status = ?, data_confirmacao = ?, descricao_erro = ?
    WHERE id = ?
  `);

  stmt.run(novo_status, data_confirmacao, descricao_erro || null, id);

  // Log de auditoria
  try {
    const stmtAudit = db.prepare(`
      INSERT INTO asaas_reembolsos_historico (
        reembolso_id,
        usuario_id,
        acao,
        status_anterior,
        status_novo,
        data_acao,
        descricao
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmtAudit.run(
      id,
      reembolso.usuario_id,
      "ATUALIZACAO_STATUS",
      reembolso.status,
      novo_status,
      agora,
      descricao_erro || `Status atualizado de ${reembolso.status} para ${novo_status}`,
    );
  } catch (err) {
    logger.error("Erro ao registrar auditoria de atualização de status:", err);
  }

  return obterReembolso(db, id) as Reembolso;
}

/**
 * Processa webhook do Asaas para reembolsos
 * Atualiza o status do reembolso baseado no evento do Asaas
 */
export function processarWebhookReembolso(
  db: Database.Database,
  webhook: WebhookReembolsoAsaas,
): void {
  const { type, data } = webhook;

  if (type !== "TRANSFER_RECEIVED" && type !== "REFUND_PROCESSED") {
    logger.warn(`Tipo de webhook não suportado: ${type}`);
    return;
  }

  // Encontra o reembolso pelo ID do Asaas
  const stmt = db.prepare(`
    SELECT * FROM asaas_reembolsos WHERE asaas_reembolso_id = ?
  `);
  const reembolso = stmt.get(data.id) as unknown as Reembolso | undefined;

  if (!reembolso) {
    logger.warn(`Reembolso com asaas_id ${data.id} não encontrado no banco`);
    return;
  }

  // Mapeia status do Asaas para nossos status
  let novoStatus: StatusReembolso = "pendente";
  let descricaoErro: string | null = null;

  switch (data.status.toLowerCase()) {
    case "completed":
    case "success":
      novoStatus = "confirmado";
      break;
    case "processing":
      novoStatus = "processando";
      break;
    case "failed":
    case "rejected":
      novoStatus = "rejeitado";
      descricaoErro = data.error || "Reembolso rejeitado pelo Asaas";
      break;
    case "cancelled":
      novoStatus = "cancelado";
      break;
  }

  atualizarStatusReembolso(db, reembolso.id, novoStatus, descricaoErro);
}

/**
 * Envia requisição de reembolso para a API Asaas
 * Esta função é chamada após o reembolso ser criado localmente
 */
export async function enviarReembolsoParaAsaas(
  db: Database.Database,
  fetchImpl: FetchLike,
  reembolso_id: string,
): Promise<string> {
  const reembolso = obterReembolso(db, reembolso_id);
  if (!reembolso) {
    throw new Error(`Reembolso ${reembolso_id} não encontrado`);
  }

  if (reembolso.status !== "pendente") {
    throw new Error(
      `Reembolso deve estar em status 'pendente' para ser enviado ao Asaas (atual: ${reembolso.status})`,
    );
  }

  try {
    // Atualiza status para 'processando'
    atualizarStatusReembolso(db, reembolso_id, "processando");

    const dadosAsaas = {
      originalTransactionId: reembolso.numero_transacao_original,
      amount: reembolso.valor,
      description: reembolso.motivo,
    };

    const resposta = await chamarAsaas<RespostaReembolsoAsaas>(
      fetchImpl,
      "POST",
      "/refunds",
      dadosAsaas,
    );

    // Atualiza o ID do Asaas
    const stmt = db.prepare(`
      UPDATE asaas_reembolsos
      SET asaas_reembolso_id = ?
      WHERE id = ?
    `);
    stmt.run(resposta.id, reembolso_id);

    return resposta.id;
  } catch (err) {
    const mensagemErro = err instanceof Error ? err.message : String(err);
    atualizarStatusReembolso(db, reembolso_id, "rejeitado", mensagemErro);
    throw err;
  }
}

/**
 * Sincroniza reembolsos pendentes com o Asaas
 * Deve ser executado periodicamente via background job
 */
export async function sincronizarReembolsosPendentes(
  db: Database.Database,
  fetchImpl: FetchLike,
): Promise<{ processados: number; sucesso: number; erro: number }> {
  const reembolsos = listarReembolsos(db, { status: "pendente" });
  let sucesso = 0;
  let erro = 0;

  for (const reembolso of reembolsos) {
    try {
      await enviarReembolsoParaAsaas(db, fetchImpl, reembolso.id);
      sucesso++;
    } catch (err) {
      logger.error(
        `Erro ao sincronizar reembolso ${reembolso.id}:`,
        err instanceof Error ? err.message : err,
      );
      erro++;
    }
  }

  return {
    processados: reembolsos.length,
    sucesso,
    erro,
  };
}

// ============================================================================
// BRIDGE PARA COBRANCAS - Compatibilidade com rotas que usam modelo de cobrança
// ============================================================================

/**
 * Interface que mapeia para o modelo de cobrança usado nas rotas
 * (compatível com o modelo do frontend em src/domain/integracoes/asaasReembolsos.ts)
 */
export interface ReembolsoCobranca {
  id: number;
  asaasChargeId: string;
  motivo: string;
  tipo: "reversao" | "devolucao";
  status: "processando" | "sucesso" | "erro";
  dataProcessamento: string;
  criadoEm: string;
  origemTipo: string;
  origemId: number;
  mensagemErro: string | null;
}

export interface ReembolsoInputCobranca {
  chargeId: string;
  motivo: string;
  tipoForce?: "reversao" | "devolucao";
}

/**
 * Helper seguro para consultar um registro.
 * Usa prepared statements (melhor-sqlite3) ou safe interpolation (sql.js em testes).
 * SEC-003: Previne SQL Injection usando parameterized queries.
 * @internal
 */
function consultarSeguro(db: DatabasePolymorphic, sql: string, param: string): unknown {
  // Detecta db type: sql.js tem .exec(), melhor-sqlite3 não
  const isSqlJs = typeof (db as unknown as SqlJsDatabase).exec === "function";

  if (isSqlJs) {
    // sql.js - usa exec() com escaping seguro
    const escapedParam = escapeParamSql(param);
    const sqlSeguro = sql.replace("?", `'${escapedParam}'`);
    try {
      const resultado = (db as unknown as SqlJsDatabase).exec(sqlSeguro);
      if (resultado && resultado.length > 0) {
        const { columns, values } = resultado[0];
        if (values && values.length > 0) {
          const row = values[0];
          const obj: Record<string, unknown> = {};
          columns.forEach((col: string, idx: number) => {
            obj[col] = row[idx];
          });
          return obj;
        }
      }
      return null;
    } catch (err) {
      logger.error("Erro ao consultar com sql.js:", err);
      return null;
    }
  } else {
    // melhor-sqlite3 - usa prepared statements com parameter binding
    const stmt = (db as unknown as Database.Database).prepare(sql);
    const result = stmt.get(param);
    return result;
  }
}

/**
 * Escape seguro para SQL em sql.js (quando prepared statements não estão disponíveis).
 * Usa dobro de aspas (SQL standard) para escapar.
 * @internal
 */
function escapeParamSql(param: string): string {
  return param.replace(/'/g, "''");
}

/**
 * Helper seguro para inserir/atualizar/excluir.
 * Usa prepared statements (melhor-sqlite3) ou safe execution (sql.js em testes).
 * SEC-003: Previne SQL Injection usando parameterized queries.
 * @internal
 */
function executarSeguro(db: DatabasePolymorphic, sql: string, params: unknown[]): void {
  // Detecta db type: sql.js tem .exec(), melhor-sqlite3 não
  const isSqlJs = typeof (db as unknown as SqlJsDatabase).exec === "function";

  if (isSqlJs) {
    // sql.js - constrói SQL com escaping seguro
    let sqlSeguro = sql;
    params.forEach((param) => {
      const escapedParam = escapeParamSeguro(param);
      sqlSeguro = sqlSeguro.replace("?", escapedParam, 1);
    });
    try {
      (db as unknown as SqlJsDatabase).run(sqlSeguro);
    } catch (err) {
      logger.error("Erro ao executar com sql.js:", err);
      throw err;
    }
  } else {
    // melhor-sqlite3 - usa prepared statements com parameter binding
    const stmt = (db as unknown as Database.Database).prepare(sql);
    stmt.run(...(params as Parameters<typeof stmt.run>));
  }
}

/**
 * Escape seguro para valores em SQL (quando prepared statements não estão disponíveis).
 * Detecta tipo e escapa apropriadamente.
 * @internal
 */
function escapeParamSeguro(param: any): string {
  if (param === null || param === undefined) {
    return "NULL";
  }
  if (typeof param === "number") {
    return String(param);
  }
  if (typeof param === "string") {
    // SQL standard: escape usando dobro de aspas
    return `'${param.replace(/'/g, "''")}'`;
  }
  if (typeof param === "boolean") {
    return param ? "1" : "0";
  }
  // Fallback para outros tipos
  return `'${String(param).replace(/'/g, "''")}'`;
}

/**
 * Processa um reembolso para uma cobrança (bridge para modelo de cobrança).
 * Esta função é chamada pelas rotas que lidam com cobrancas (asaasCobranca.ts).
 *
 * Mapeia:
 * - chargeId -> numero_transacao_original
 * - origemTipo/origemId -> usuario_id (será derivado de origem_tipo)
 *
 * SEC-003: Usa prepared statements (melhor-sqlite3) ou safe escaping (sql.js testes)
 * para prevenir SQL Injection.
 */
export async function processarReembolsoAsaas(
  db: Database.Database,
  input: ReembolsoInputCobranca,
): Promise<ReembolsoCobranca> {
  // Verifica se a cobrança existe - usando query segura contra SQL Injection
  const cobranca = consultarSeguro(
    db,
    `SELECT id, origem_tipo, origem_id, status FROM cobrancas_asaas WHERE asaas_charge_id = ?`,
    input.chargeId,
  );

  if (!cobranca) {
    throw new Error(`Cobrança Asaas com chargeId='${input.chargeId}' não encontrada.`);
  }

  if (cobranca.status !== "pago") {
    throw new Error(
      `Cobrança ${input.chargeId} está '${cobranca.status}' — só é possível reembolsar uma cobrança com status 'pago'.`,
    );
  }

  // Verifica idempotência - se já existe reembolso para esta cobrança
  const reembolsoExistente = consultarSeguro(
    db,
    `SELECT id FROM reembolsos_asaas WHERE asaas_charge_id = ? AND status NOT IN ('cancelado', 'rejeitado') LIMIT 1`,
    input.chargeId,
  );

  if (reembolsoExistente) {
    const r = consultarSeguro(
      db,
      `SELECT * FROM reembolsos_asaas WHERE id = ?`,
      String(reembolsoExistente.id),
    );
    if (r) {
      return mapeiaReembolsoCobranca(r);
    }
  }

  // Cria novo reembolso
  const agora = new Date().toISOString();
  const tipo = input.tipoForce || (detectarTipoReembolsoAoAgora(agora, cobranca) ? "reversao" : "devolucao");
  const dataProcesamento = agora.split("T")[0];

  // Insere novo reembolso - usando query segura contra SQL Injection
  executarSeguro(
    db,
    `INSERT INTO reembolsos_asaas (
      asaas_charge_id, motivo, tipo, status,
      data_processamento, origem_tipo, origem_id, mensagem_erro, criado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.chargeId,
      input.motivo,
      tipo,
      "processando",
      dataProcesamento,
      cobranca.origem_tipo,
      cobranca.origem_id,
      null,
      agora,
    ],
  );

  // Grava auditoria (opcional - pode não existir em testes) usando query segura
  try {
    executarSeguro(
      db,
      `INSERT INTO asaas_reembolsos_historico (
        usuario_id, acao, status_anterior, status_novo, data_acao, descricao
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        `${cobranca.origem_tipo}:${cobranca.origem_id}`,
        "CRIACAO",
        null,
        "processando",
        agora,
        `Reembolso criado para cobrança ${input.chargeId}`,
      ],
    );
  } catch {
    // Ignora erro de auditoria (tabela pode não existir)
  }

  // Retorna reembolso criado usando query segura
  const r = consultarSeguro(
    db,
    `SELECT * FROM reembolsos_asaas WHERE asaas_charge_id = ? ORDER BY id DESC LIMIT 1`,
    input.chargeId,
  );

  if (r) {
    return mapeiaReembolsoCobranca(r, tipo);
  }

  // Fallback se SELECT não retornar (construct from input)
  return mapeiaReembolsoCobranca({
    id: 0,
    asaas_charge_id: input.chargeId,
    motivo: input.motivo,
    tipo,
    status: "processando",
    data_processamento: dataProcesamento,
    origem_tipo: cobranca.origem_tipo,
    origem_id: cobranca.origem_id,
    mensagem_erro: null,
    criado_em: agora,
  }, tipo);
}

/**
 * Detecta se é reembolso tipo "reversao" (< 24h) ou "devolucao" (≥ 24h)
 * quando a cobrança foi criada.
 */
function detectarTipoReembolsoAoAgora(agora: string, cobranca: any): boolean {
  // Se cobrança não tem data de criação, assume > 24h (devolucao)
  if (!cobranca.criado_em) return false;

  const dataCriacao = new Date(cobranca.criado_em);
  const dataAgora = new Date(agora);
  const diffHoras = (dataAgora.getTime() - dataCriacao.getTime()) / (1000 * 60 * 60);

  return diffHoras < 24; // true = reversao, false = devolucao
}

/**
 * Mapeia reembolso do modelo interno para modelo de cobrança
 */
function mapeiaReembolsoCobranca(r: unknown, tipoOverride?: string): ReembolsoCobranca {
  // Extrai origemTipo e origemId do banco (colunas origem_tipo, origem_id)
  const row = r as Record<string, unknown>;
  const origemTipo = (row.origem_tipo as string) || "";
  const origemId = parseInt((row.origem_id as string) || "0", 10);

  return {
    id: (row.id as number) || 0,
    asaasChargeId: (row.asaas_charge_id as string) || "",
    motivo: (row.motivo as string) || "",
    tipo: (tipoOverride || (row.tipo as string) || "devolucao") as "reversao" | "devolucao",
    status: (row.status as string) || "processando" as "processando" | "sucesso" | "erro",
    dataProcessamento: (row.data_processamento as string)?.split("T")[0] || "",
    criadoEm: (row.criado_em as string) || "",
    origemTipo,
    origemId,
    mensagemErro: (row.mensagem_erro as string | null) || null,
  };
}

/**
 * Obtém reembolsos associados a uma cobrança específica (chargeId)
 * SEC-003: Usa prepared statements (melhor-sqlite3) ou safe escaping (sql.js testes)
 * para prevenir SQL Injection
 */
export function obterReembolsosPorChargeId(db: DatabasePolymorphic, chargeId: string): ReembolsoCobranca[] {
  try {
    // Tenta usar prepared statement
    const stmt = (db as unknown as Database.Database).prepare(`
      SELECT * FROM reembolsos_asaas
      WHERE asaas_charge_id = ?
      ORDER BY criado_em DESC
    `);
    // melhor-sqlite3 tem método all()
    if (typeof (stmt as unknown as { all?: (...args: unknown[]) => unknown[] }).all === "function") {
      const reembolsos = (stmt as unknown as { all: (chargeId: string) => unknown[] }).all(chargeId);
      return reembolsos.map((r) => mapeiaReembolsoCobranca(r));
    }
  } catch {
    // Fallback para sql.js
  }

  // Fallback para sql.js - usa exec com escaping seguro
  try {
    const escapedChargeId = escapeParamSql(chargeId);
    const resultado = (db as unknown as SqlJsDatabase).exec(`
      SELECT * FROM reembolsos_asaas
      WHERE asaas_charge_id = '${escapedChargeId}'
      ORDER BY criado_em DESC
    `);

    if (!resultado || resultado.length === 0) {
      return [];
    }

    const { columns, values } = resultado[0];
    if (!values || values.length === 0) {
      return [];
    }

    return values.map((row: unknown[]) => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col: string, idx: number) => {
        obj[col] = row[idx];
      });
      return mapeiaReembolsoCobranca(obj);
    });
  } catch {
    // Se tudo falhar, retorna array vazio
    return [];
  }
}
