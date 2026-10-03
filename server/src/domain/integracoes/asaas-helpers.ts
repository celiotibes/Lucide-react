/**
 * Helpers compartilhados para integração Asaas Payments API
 *
 * Centraliza código duplicado entre asaasCobranca.ts, asaasReembolsos.ts
 * e asaas-pagamentos-pix.ts para evitar repetição e facilitar manutenção.
 *
 * Inclui:
 * - Configuração de URL base (sandbox/produção)
 * - Recuperação de chaves API
 * - Chamadas HTTP genéricas
 * - Validação de status
 * - Tratamento de erros da API
 */

export type FetchLike = typeof fetch;

/**
 * Erro de configuração do Asaas
 */
export class AsaasConfiguracaoAusenteError extends Error {
  constructor(variavel: string) {
    super(
      `${variavel} não está configurada no ambiente — defina no .env para usar Asaas`,
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
 *
 * @returns URL base da API Asaas
 */
export function obterBaseUrlAsaas(): string {
  const sandbox = process.env.ASAAS_SANDBOX === "true";
  return sandbox ? "https://sandbox.asaas.com/api/v3" : "https://api.asaas.com/api/v3";
}

/**
 * Retorna a chave API do Asaas
 *
 * @returns Chave API
 * @throws AsaasConfiguracaoAusenteError se ASAAS_API_KEY não estiver configurada
 */
export function obterChaveApiAsaas(): string {
  const chave = process.env.ASAAS_API_KEY;
  if (!chave) {
    throw new AsaasConfiguracaoAusenteError("ASAAS_API_KEY");
  }
  return chave;
}

/**
 * Faz uma chamada HTTP genérica para a API do Asaas
 *
 * @param fetchImpl Implementação de fetch (para injetar em testes)
 * @param metodo HTTP method (GET ou POST)
 * @param caminho Caminho relativo da API (ex: "/payments")
 * @param corpo Corpo da requisição (opcional)
 * @returns Resposta parseada da API
 * @throws AsaasApiError em caso de erro HTTP
 */
export async function chamarAsaasApi<T>(
  fetchImpl: FetchLike,
  metodo: "GET" | "POST",
  caminho: string,
  corpo?: unknown,
): Promise<T> {
  const url = `${obterBaseUrlAsaas()}${caminho}`;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    access_token: obterChaveApiAsaas(),
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
 * Valida se um status de cobrança é válido
 *
 * @param status Status a validar
 * @returns true se status é válido
 */
export function validarStatusCobranca(
  status: string,
): status is "pendente" | "processando" | "aberta" | "paga" | "vencida" | "cancelada" {
  const statusValidos = ["pendente", "processando", "aberta", "paga", "vencida", "cancelada"];
  return statusValidos.includes(status);
}

/**
 * Valida se um status de reembolso é válido
 *
 * @param status Status a validar
 * @returns true se status é válido
 */
export function validarStatusReembolso(
  status: string,
): status is "pendente" | "processando" | "concluido" | "reprovado" | "cancelado" {
  const statusValidos = ["pendente", "processando", "concluido", "reprovado", "cancelado"];
  return statusValidos.includes(status);
}

/**
 * Mapeia status da API Asaas para status interno
 *
 * @param statusAsaas Status retornado pela API Asaas
 * @returns Status mapeado
 */
export function mapearStatusAsaas(statusAsaas: string): string {
  const mapeamento: Record<string, string> = {
    PENDING: "pendente",
    PROCESSING: "processando",
    SETTLED: "aberta",
    RECEIVED: "paga",
    OVERDUE: "vencida",
    CANCELLED: "cancelada",
    ACTIVE: "ativa",
    INACTIVE: "inativa",
    REFUNDED: "reembolsada",
    CHARGEBACK: "contestada",
  };

  return mapeamento[statusAsaas] || statusAsaas.toLowerCase();
}

/**
 * Interface padrão para resposta de erro da API Asaas
 */
export interface ErroAsaas {
  status: number;
  body?: unknown;
  message?: string;
}

/**
 * Extrai mensagem de erro da resposta Asaas
 *
 * @param erro Erro recebido da API ou rede
 * @returns Mensagem de erro formatada
 */
export function extrairMensagemErroAsaas(erro: unknown): string {
  if (erro instanceof AsaasApiError) {
    if (typeof erro.corpo === "object" && erro.corpo !== null) {
      const corpo = erro.corpo as Record<string, unknown>;
      return corpo.message || corpo.error || `Erro ${erro.status}`;
    }
    return `Erro ${erro.status}`;
  }

  if (erro instanceof Error) {
    return erro.message;
  }

  return String(erro);
}

/**
 * Cria entrada de auditoria para operação Asaas
 *
 * @param operacao Tipo de operação (ex: "cobranca_criada", "reembolso_processado")
 * @param recursoId ID do recurso afetado
 * @param dadosAntes Dados antes da operação
 * @param dadosDepois Dados depois da operação
 * @param usuarioId ID do usuário que fez a operação
 * @returns Objeto de auditoria
 */
export function criarAuditoriaAsaas(
  operacao: string,
  recursoId: string,
  dadosAntes: unknown,
  dadosDepois: unknown,
  usuarioId?: string,
): Record<string, unknown> {
  return {
    id: `aud_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    operacao,
    recurso_id: recursoId,
    dados_antes: dadosAntes,
    dados_depois: dadosDepois,
    usuario_id: usuarioId || null,
    criado_em: new Date().toISOString(),
  };
}

/**
 * Valida estrutura de resposta da API Asaas
 *
 * @param resposta Resposta a validar
 * @param camposRequeridos Campos que devem estar presentes
 * @returns true se resposta é válida
 */
export function validarRespostaAsaas(
  resposta: unknown,
  camposRequeridos: string[] = [],
): resposta is Record<string, unknown> {
  if (!resposta || typeof resposta !== "object") {
    return false;
  }

  const obj = resposta as Record<string, unknown>;

  for (const campo of camposRequeridos) {
    if (!(campo in obj)) {
      return false;
    }
  }

  return true;
}
