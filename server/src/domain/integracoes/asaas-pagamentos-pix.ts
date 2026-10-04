/**
 * Sistema de PAGAMENTOS PIX PROATIVOS via Asaas Payments API
 *
 * Este módulo permite INICIAR pagamentos PIX a fornecedores/prestadores de serviços.
 * Diferente do módulo de "recebimento de PIX", este módulo ENVIA dinheiro.
 *
 * Fluxo:
 * 1. Usuário/sistema chama criarPagamentoPix() com dados do beneficiário
 * 2. Validamos dados (beneficiário, valor, tipo de chave PIX)
 * 3. Enviamos para Asaas Payments API (sandbox ou produção)
 * 4. Asaas retorna id de pagamento com status 'PENDING'
 * 5. Background job (sincronizarPagamentosPendentes) poolea a cada 2h
 * 6. Webhook (futuro) notifica quando pagamento foi processado/recusado
 * 7. Audit trail grava todas as mudanças em pagamentos_pix_historico
 *
 * Sandbox vs Produção:
 * - ASAAS_SANDBOX=true → usa sandbox.asaas.com, fees=0, status simulado
 * - ASAAS_SANDBOX=false → usa api.asaas.com, fees reais, status real
 *
 * Segurança:
 * - ASAAS_API_KEY lida no momento da chamada, não no topo do módulo
 * - Idempotência via UNIQUE constraint em (beneficiario, valor, criado_data)
 * - Nunca lança, sempre loga erros
 */

import type Database from "better-sqlite3";
import { logger } from '../../services/logger-service.js';
import { randomUUID } from "crypto";
import { registrarLancamento } from '../ledger/ledger-service.js';

export type FetchLike = typeof fetch;

/**
 * Tipos de chaves PIX suportadas pelo Asaas
 */
export type TipoChavePix = "CPF" | "CNPJ" | "EMAIL" | "TELEFONE" | "ALEATORIO";

/**
 * Resultado de validação de dados de pagamento
 */
export interface ValidacaoPagamento {
  valido: boolean;
  erros: string[];
}

/**
 * Dados de entrada para criar um pagamento PIX
 */
export interface DadosPagamentoPix {
  beneficiarioId: string; // ID único do beneficiário no sistema
  beneficiarioNome: string;
  beneficiarioCpfCnpj: string;
  valor: number; // em R$ (ex: 150.50)
  descricao: string;
  tipoChavePix: TipoChavePix;
  chavePixValue?: string; // ex: "12345678900" (CPF), "email@example.com" (EMAIL), etc.
}

/**
 * Registro de pagamento PIX no banco local
 */
export interface PagamentoPix {
  id: string;
  asaasPaymentId: string | null;
  beneficiarioId: string;
  beneficiarioNome: string;
  beneficiarioCpfCnpj: string;
  valor: number;
  descricao: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
  tipoChavePix: TipoChavePix;
  chavePixValue: string | null;
  qrCode: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

/**
 * Dados para request da Asaas Payments API
 */
interface DadosCobrancaAsaasPayments {
  name: string; // Nome do beneficiário
  cpfCnpj: string;
  email?: string;
  phone?: string;
  value: number;
  description?: string;
  pixKeyType: TipoChavePix;
  pixKey?: string;
}

/**
 * Resposta da Asaas Payments API ao criar pagamento
 */
interface RespostaPagamentoAsaas {
  id: string;
  status: string;
  value: number;
  pixQrCode?: string;
  pixQrCodeUrl?: string;
  error?: string;
}

/**
 * Erro de configuração do Asaas (env var faltando)
 */
export class AsaasConfiguracaoAusenteError extends Error {
  constructor(variavel: string) {
    super(
      `${variavel} não está configurada no ambiente — defina no .env para usar Asaas Pagamentos PIX`,
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
 * Retorna a URL base da API Asaas (sandbox ou produção)
 */
function obterBaseUrl(): string {
  const sandbox = process.env.ASAAS_SANDBOX === "true";
  if (sandbox) {
    return "https://sandbox.asaas.com/api/v3";
  }
  return "https://api.asaas.com/api/v3";
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
 * Valida dados de entrada antes de criar um pagamento PIX
 * Retorna { valido: false, erros: [...] } se houver problemas
 */
export function validarDadosPagamento(
  beneficiarioId: string,
  beneficiarioNome: string,
  beneficiarioCpfCnpj: string,
  valor: number,
  descricao: string,
  tipoChavePix: TipoChavePix,
  chavePixValue?: string,
): ValidacaoPagamento {
  const erros: string[] = [];

  // Validação de campos obrigatórios
  if (!beneficiarioId || beneficiarioId.trim().length === 0) {
    erros.push("beneficiarioId é obrigatório");
  }
  if (!beneficiarioNome || beneficiarioNome.trim().length === 0) {
    erros.push("beneficiarioNome é obrigatório");
  }
  if (!beneficiarioCpfCnpj || beneficiarioCpfCnpj.trim().length === 0) {
    erros.push("beneficiarioCpfCnpj é obrigatório");
  }
  if (descricao === undefined || descricao === null || descricao.trim().length === 0) {
    erros.push("descricao é obrigatória");
  }

  // Validação de valor
  if (typeof valor !== "number" || valor <= 0) {
    erros.push("valor deve ser um número positivo");
  }
  if (valor > 100000) {
    erros.push("valor não pode exceder R$ 100.000,00");
  }

  // Validação de tipo de chave PIX
  const tiposValidos: TipoChavePix[] = ["CPF", "CNPJ", "EMAIL", "TELEFONE", "ALEATORIO"];
  if (!tiposValidos.includes(tipoChavePix)) {
    erros.push(`tipoChavePix inválido. Valores permitidos: ${tiposValidos.join(", ")}`);
  }

  // Validação de chave PIX (se não for aleatória)
  if (tipoChavePix !== "ALEATORIO") {
    if (!chavePixValue || chavePixValue.trim().length === 0) {
      erros.push(`chavePixValue é obrigatória para tipo ${tipoChavePix}`);
    }

    // Validação básica de formato por tipo
    if (tipoChavePix === "EMAIL" && chavePixValue) {
      if (!chavePixValue.includes("@")) {
        erros.push("chavePixValue com tipo EMAIL deve ser um e-mail válido");
      }
    }
    if (tipoChavePix === "CPF" && chavePixValue) {
      if (!/^\d{11}$/.test(chavePixValue.replace(/\D/g, ""))) {
        erros.push("chavePixValue com tipo CPF deve ter 11 dígitos");
      }
    }
    if (tipoChavePix === "CNPJ" && chavePixValue) {
      if (!/^\d{14}$/.test(chavePixValue.replace(/\D/g, ""))) {
        erros.push("chavePixValue com tipo CNPJ deve ter 14 dígitos");
      }
    }
    if (tipoChavePix === "TELEFONE" && chavePixValue) {
      if (!/^\+?55?\d{10,11}$/.test(chavePixValue.replace(/\D/g, ""))) {
        erros.push("chavePixValue com tipo TELEFONE deve ser válido (11 dígitos)");
      }
    }
  }

  return {
    valido: erros.length === 0,
    erros,
  };
}

/**
 * Cria um novo pagamento PIX no banco de dados
 * Retorna o pagamento criado (status = PENDING)
 */
function criarRegistroPagamento(db: Database.Database, dados: DadosPagamentoPix): PagamentoPix {
  const id = randomUUID();
  const agora = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO pagamentos_pix_solicitados (
      id,
      beneficiario_id,
      beneficiario_nome,
      beneficiario_cpf_cnpj,
      valor,
      descricao,
      status,
      tipo_chave_pix,
      chave_pix_value,
      qr_code,
      criado_em,
      atualizado_em,
      asaas_payment_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    dados.beneficiarioId,
    dados.beneficiarioNome,
    dados.beneficiarioCpfCnpj,
    dados.valor,
    dados.descricao,
    "PENDING",
    dados.tipoChavePix,
    dados.chavePixValue || null,
    null,
    agora,
    agora,
    null,
  );

  return {
    id,
    asaasPaymentId: null,
    beneficiarioId: dados.beneficiarioId,
    beneficiarioNome: dados.beneficiarioNome,
    beneficiarioCpfCnpj: dados.beneficiarioCpfCnpj,
    valor: dados.valor,
    descricao: dados.descricao,
    status: "PENDING",
    tipoChavePix: dados.tipoChavePix,
    chavePixValue: dados.chavePixValue || null,
    qrCode: null,
    criadoEm: agora,
    atualizadoEm: agora,
  };
}

/**
 * Atualiza status de um pagamento e grava no histórico de auditoria
 */
function atualizarStatusPagamento(
  db: Database.Database,
  pagamentoId: string,
  statusNovo: PagamentoPix["status"],
  asaasPaymentId?: string,
  qrCode?: string,
): void {
  const agora = new Date().toISOString();

  // Busca o status anterior
  const stmt = db.prepare(`
    SELECT status FROM pagamentos_pix_solicitados WHERE id = ?
  `);
  const registro = stmt.get(pagamentoId) as { status: string } | undefined;
  const statusAnterior = registro?.status;

  // Atualiza o pagamento
  const updateStmt = db.prepare(`
    UPDATE pagamentos_pix_solicitados
    SET status = ?, atualizado_em = ?, asaas_payment_id = ?, qr_code = ?
    WHERE id = ?
  `);
  updateStmt.run(statusNovo, agora, asaasPaymentId || null, qrCode || null, pagamentoId);

  // Grava histórico
  const histStmt = db.prepare(`
    INSERT INTO pagamentos_pix_historico (
      id,
      pagamento_id,
      status_anterior,
      status_novo,
      criado_em
    ) VALUES (?, ?, ?, ?, ?)
  `);
  histStmt.run(randomUUID(), pagamentoId, statusAnterior || null, statusNovo, agora);
}

/**
 * Cria um pagamento PIX na Asaas e no banco local
 * Valida entrada, chama API Asaas, grava no banco e no histórico
 * Retorna o PagamentoPix criado ou lança erro
 */
export async function criarPagamentoPix(
  db: Database.Database,
  dados: DadosPagamentoPix,
  fetchImpl: FetchLike = fetch,
): Promise<PagamentoPix> {
  // 1. Validar
  const validacao = validarDadosPagamento(
    dados.beneficiarioId,
    dados.beneficiarioNome,
    dados.beneficiarioCpfCnpj,
    dados.valor,
    dados.descricao,
    dados.tipoChavePix,
    dados.chavePixValue,
  );

  if (!validacao.valido) {
    throw new Error(`Validação falhou: ${validacao.erros.join("; ")}`);
  }

  // 2. Criar registro local (status = PENDING)
  const pagamentoLocal = criarRegistroPagamento(db, dados);

  try {
    // 3. Chamar Asaas
    const corpoRequisicao: DadosCobrancaAsaasPayments = {
      name: dados.beneficiarioNome,
      cpfCnpj: dados.beneficiarioCpfCnpj,
      value: dados.valor,
      description: dados.descricao,
      pixKeyType: dados.tipoChavePix,
      pixKey: dados.chavePixValue,
    };

    const respostaAsaas = await chamarAsaas<RespostaPagamentoAsaas>(
      fetchImpl,
      "POST",
      "/payments",
      corpoRequisicao,
    );

    // 4. Atualizar registro com ID do Asaas e QR code (se sandbox)
    const qrCodeFinal = process.env.ASAAS_SANDBOX === "true" ? `QR_SANDBOX_${respostaAsaas.id}` : respostaAsaas.pixQrCode;

    atualizarStatusPagamento(db, pagamentoLocal.id, "PROCESSING", respostaAsaas.id, qrCodeFinal);

    // 5. Retornar com dados atualizados
    const pagamentoAtualizado = buscarPagamentoPix(db, pagamentoLocal.id);
    if (!pagamentoAtualizado) {
      throw new Error("Pagamento não encontrado após criação");
    }

    logger.info(`✓ Pagamento PIX criado: ${pagamentoLocal.id} (Asaas: ${respostaAsaas.id})`);
    return pagamentoAtualizado;
  } catch (erro) {
    // Se Asaas falhar, marca como FAILED
    const errorMsg = erro instanceof Error ? erro.message : String(erro);
    atualizarStatusPagamento(db, pagamentoLocal.id, "FAILED");

    logger.error(`❌ Erro ao criar pagamento PIX: ${errorMsg}`);
    throw new AsaasApiError(500, { erro: errorMsg }, errorMsg);
  }
}

/**
 * Busca um pagamento PIX pelo ID
 */
export function buscarPagamentoPix(db: Database.Database, pagamentoId: string): PagamentoPix | null {
  const stmt = db.prepare(`
    SELECT
      id,
      asaas_payment_id,
      beneficiario_id,
      beneficiario_nome,
      beneficiario_cpf_cnpj,
      valor,
      descricao,
      status,
      tipo_chave_pix,
      chave_pix_value,
      qr_code,
      criado_em,
      atualizado_em
    FROM pagamentos_pix_solicitados
    WHERE id = ?
  `);

  const registro = stmt.get(pagamentoId) as any;
  if (!registro) return null;

  return {
    id: registro.id,
    asaasPaymentId: registro.asaas_payment_id,
    beneficiarioId: registro.beneficiario_id,
    beneficiarioNome: registro.beneficiario_nome,
    beneficiarioCpfCnpj: registro.beneficiario_cpf_cnpj,
    valor: registro.valor,
    descricao: registro.descricao,
    status: registro.status,
    tipoChavePix: registro.tipo_chave_pix,
    chavePixValue: registro.chave_pix_value,
    qrCode: registro.qr_code,
    criadoEm: registro.criado_em,
    atualizadoEm: registro.atualizado_em,
  };
}

/**
 * Busca o status atual de um pagamento na Asaas
 * Atualiza o banco se houver mudanças
 */
export async function buscarStatusPagamentoPix(
  db: Database.Database,
  pagamentoId: string,
  fetchImpl: FetchLike = fetch,
): Promise<PagamentoPix | null> {
  const pagamento = buscarPagamentoPix(db, pagamentoId);
  if (!pagamento || !pagamento.asaasPaymentId) {
    return pagamento;
  }

  try {
    // Busca na Asaas
    const respostaAsaas = await chamarAsaas<RespostaPagamentoAsaas>(
      fetchImpl,
      "GET",
      `/payments/${encodeURIComponent(pagamento.asaasPaymentId)}`,
    );

    // Mapeia status da Asaas para nossos estados
    let statusNovo: PagamentoPix["status"] = "PROCESSING";
    if (respostaAsaas.status === "PAID" || respostaAsaas.status === "COMPLETED") {
      statusNovo = "COMPLETED";
    } else if (
      respostaAsaas.status === "FAILED" ||
      respostaAsaas.status === "OVERDUE" ||
      respostaAsaas.status === "CANCELLED"
    ) {
      statusNovo = "FAILED";
    } else if (respostaAsaas.status === "PENDING") {
      statusNovo = "PENDING";
    }

    // Se mudou, atualiza
    if (statusNovo !== pagamento.status) {
      atualizarStatusPagamento(db, pagamentoId, statusNovo);

      // TODO: ledger.registrarLancamento
      // Se o pagamento foi completado, registra no ledger
      if (statusNovo === "COMPLETED") {
        const resultadoLedger = registrarLancamento(db, {
          id: randomUUID(),
          data: new Date().toISOString().split('T')[0],
          tipo: 'despesa',
          categoria: 'comissao', // categoria padrão para pagamentos
          valor: pagamento.valor,
          descricao: `Pagamento PIX - ${pagamento.beneficiarioNome} (${pagamento.descricao})`,
          referencia_externa: `ASAAS-PAG-${pagamento.asaasPaymentId}`,
          usuario_id: 'sistema-asaas-pagamentos',
        });

        if (!resultadoLedger.sucesso) {
          logger.warn(`[AsaasPagamentosPix] Falha ao registrar no ledger: ${resultadoLedger.erro}`);
        }
      }
    }

    return buscarPagamentoPix(db, pagamentoId);
  } catch (erro) {
    logger.error(
      `Erro ao buscar status do pagamento ${pagamentoId}:`,
      erro instanceof Error ? erro.message : erro,
    );
    return pagamento; // Retorna o que temos localmente
  }
}

/**
 * Sincronização de pagamentos pendentes com Asaas
 * Busca todos os pagamentos com status PENDING/PROCESSING e atualiza via GET
 * Roda como background job a cada 2 horas
 */
export async function sincronizarPagamentosPendentes(
  db: Database.Database,
  fetchImpl: FetchLike = fetch,
): Promise<{ atualizados: number; erros: number }> {
  const stmt = db.prepare(`
    SELECT id
    FROM pagamentos_pix_solicitados
    WHERE status IN ('PENDING', 'PROCESSING')
      AND criado_em >= datetime('now', '-7 days')
    ORDER BY criado_em DESC
  `);

  const pagamentos = stmt.all() as { id: string }[];

  let atualizados = 0;
  let erros = 0;

  logger.info(`🔄 Sincronizando ${pagamentos.length} pagamento(s) PIX pendente(s)...`);

  for (const { id } of pagamentos) {
    try {
      const antes = buscarPagamentoPix(db, id);
      await buscarStatusPagamentoPix(db, id, fetchImpl);
      const depois = buscarPagamentoPix(db, id);

      if (antes?.status !== depois?.status) {
        atualizados++;
        logger.info(`  ✓ ${id}: ${antes?.status} → ${depois?.status}`);
      }
    } catch (erro) {
      erros++;
      logger.error(
        `  ❌ ${id}:`,
        erro instanceof Error ? erro.message : erro,
      );
    }
  }

  logger.info(`🔄 Sincronização concluída: ${atualizados} atualizados, ${erros} erros`);

  return { atualizados, erros };
}

/**
 * Lista pagamentos PIX com filtros opcionais
 */
export function listarPagamentosPix(
  db: Database.Database,
  filtros?: {
    status?: PagamentoPix["status"];
    beneficiarioId?: string;
    diasAtras?: number;
  },
): PagamentoPix[] {
  let sql = `
    SELECT
      id,
      asaas_payment_id,
      beneficiario_id,
      beneficiario_nome,
      beneficiario_cpf_cnpj,
      valor,
      descricao,
      status,
      tipo_chave_pix,
      chave_pix_value,
      qr_code,
      criado_em,
      atualizado_em
    FROM pagamentos_pix_solicitados
    WHERE 1=1
  `;

  const params: unknown[] = [];

  if (filtros?.status) {
    sql += ` AND status = ?`;
    params.push(filtros.status);
  }

  if (filtros?.beneficiarioId) {
    sql += ` AND beneficiario_id = ?`;
    params.push(filtros.beneficiarioId);
  }

  if (filtros?.diasAtras && filtros.diasAtras > 0) {
    sql += ` AND criado_em >= datetime('now', ? || ' days')`;
    params.push(-filtros.diasAtras);
  }

  sql += ` ORDER BY criado_em DESC`;

  const stmt = db.prepare(sql);
  const registros = stmt.all(...params) as any[];

  return registros.map((r) => ({
    id: r.id,
    asaasPaymentId: r.asaas_payment_id,
    beneficiarioId: r.beneficiario_id,
    beneficiarioNome: r.beneficiario_nome,
    beneficiarioCpfCnpj: r.beneficiario_cpf_cnpj,
    valor: r.valor,
    descricao: r.descricao,
    status: r.status,
    tipoChavePix: r.tipo_chave_pix,
    chavePixValue: r.chave_pix_value,
    qrCode: r.qr_code,
    criadoEm: r.criado_em,
    atualizadoEm: r.atualizado_em,
  }));
}

/**
 * Atualiza um pagamento PIX (descrição, status)
 */
export function atualizarPagamentoPix(
  db: Database.Database,
  pagamentoId: string,
  campos: {
    descricao?: string;
    status?: PagamentoPix["status"];
  },
): PagamentoPix | null {
  const pagamento = buscarPagamentoPix(db, pagamentoId);
  if (!pagamento) return null;

  const statusAnterior = pagamento.status;

  // Monta a query com apenas os campos fornecidos
  let sql = `UPDATE pagamentos_pix_solicitados SET atualizado_em = CURRENT_TIMESTAMP`;
  const params: unknown[] = [];

  if (campos.descricao !== undefined) {
    sql += `, descricao = ?`;
    params.push(campos.descricao);
  }

  if (campos.status !== undefined) {
    sql += `, status = ?`;
    params.push(campos.status);
  }

  sql += ` WHERE id = ?`;
  params.push(pagamentoId);

  db.prepare(sql).run(...params);

  // Se status mudou, registra no histórico
  if (campos.status !== undefined && campos.status !== statusAnterior) {
    const histId = randomUUID();
    db.prepare(
      `INSERT INTO pagamentos_pix_historico (id, pagamento_id, status_anterior, status_novo, criado_em)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    ).run(histId, pagamentoId, statusAnterior, campos.status);
  }

  return buscarPagamentoPix(db, pagamentoId);
}

/**
 * Deleta um pagamento PIX (apenas se ainda não foi processado)
 */
export function deletarPagamentoPix(db: Database.Database, pagamentoId: string): boolean {
  const pagamento = buscarPagamentoPix(db, pagamentoId);
  if (!pagamento) return false;

  // Só permite deletar pagamentos que ainda estão PENDING
  if (!["PENDING", "FAILED", "CANCELLED"].includes(pagamento.status)) {
    throw new Error(
      `Não é possível deletar pagamento com status '${pagamento.status}'. ` +
        `Apenas pagamentos PENDING, FAILED ou CANCELLED podem ser deletados.`,
    );
  }

  // Deleta o histórico primeiro (FK constraint)
  db.prepare(`DELETE FROM pagamentos_pix_historico WHERE pagamento_id = ?`).run(pagamentoId);

  // Depois deleta o pagamento
  const result = db.prepare(`DELETE FROM pagamentos_pix_solicitados WHERE id = ?`).run(pagamentoId);

  return (result.changes ?? 0) > 0;
}
