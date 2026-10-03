/**
 * Helpers para tratamento de erros centralizado
 *
 * Fornece padrões reutilizáveis para:
 * - Formatação de respostas de erro HTTP
 * - Logging estruturado de erros
 * - Transformação de exceções em respostas seguras
 * - Tratamento de erros assíncronos
 */

import { logger } from "../services/logger-service.js";

/**
 * Resposta de erro padronizada
 */
export interface RespostaErro {
  erro: string;
  mensagem: string;
  detalhes?: unknown;
  timestamp: string;
  requestId?: string;
}

/**
 * Categorias de erro
 */
export type CategoriaErro =
  | "VALIDACAO"
  | "NAO_ENCONTRADO"
  | "CONFLITO"
  | "NAO_AUTORIZADO"
  | "ACESSO_NEGADO"
  | "ERRO_INTERNO"
  | "SERVICO_INDISPONIVEL";

/**
 * Mapa de categoria de erro para código HTTP
 */
const mapaStatusPorCategoria: Record<CategoriaErro, number> = {
  VALIDACAO: 400,
  NAO_ENCONTRADO: 404,
  CONFLITO: 409,
  NAO_AUTORIZADO: 401,
  ACESSO_NEGADO: 403,
  ERRO_INTERNO: 500,
  SERVICO_INDISPONIVEL: 503,
};

/**
 * Cria uma resposta de erro padronizada
 *
 * @param categoria Categoria do erro
 * @param mensagem Mensagem descritiva do erro
 * @param detalhes Detalhes adicionais (opcionais)
 * @param requestId ID da requisição (para rastreamento)
 * @returns Objeto de resposta de erro
 */
export function criarRespostaErro(
  categoria: CategoriaErro,
  mensagem: string,
  detalhes?: unknown,
  requestId?: string,
): { status: number; resposta: RespostaErro } {
  const status = mapaStatusPorCategoria[categoria];

  return {
    status,
    resposta: {
      erro: categoria,
      mensagem,
      detalhes,
      timestamp: new Date().toISOString(),
      requestId,
    },
  };
}

/**
 * Extrai a mensagem de um erro desconhecido
 *
 * @param erro Erro a processar
 * @returns Mensagem de erro
 */
export function extrairMensagemErro(erro: unknown): string {
  if (erro instanceof Error) {
    return erro.message;
  }

  if (typeof erro === "string") {
    return erro;
  }

  if (typeof erro === "object" && erro !== null) {
    const obj = erro as Record<string, unknown>;
    if (typeof obj.message === "string") {
      return obj.message;
    }
    if (typeof obj.error === "string") {
      return obj.error;
    }
  }

  return "Erro desconhecido";
}

/**
 * Loga um erro com contexto
 *
 * @param erro Erro a logar
 * @param contexto Contexto onde o erro ocorreu (ex: "criar_cobranca")
 * @param dados Dados adicionais
 */
export function logarErro(
  erro: unknown,
  contexto: string,
  dados?: Record<string, unknown>,
): void {
  const mensagem = extrairMensagemErro(erro);

  if (erro instanceof Error) {
    logger.error(`[${contexto}] ${mensagem}`, {
      stack: erro.stack,
      ...dados,
    });
  } else {
    logger.error(`[${contexto}] ${mensagem}`, dados);
  }
}

/**
 * Transforma um erro em resposta HTTP segura (sem expor detalhes internos)
 *
 * @param erro Erro a processar
 * @param contexto Contexto onde o erro ocorreu (para logging)
 * @param exposaoProdutos Expor detalhes técnicos em produção? (padrão: false)
 * @returns Resposta de erro segura
 */
export function transformarErroEmResposta(
  erro: unknown,
  contexto: string,
  exposaoProdutos: boolean = process.env.NODE_ENV !== "production",
): { status: number; resposta: RespostaErro } {
  logarErro(erro, contexto);

  // Identifica o tipo de erro
  if (erro instanceof Error && "status" in erro) {
    // Erro com status HTTP
    const status = (erro as any).status || 500;
    const categoria = identficarCategoriaErro(status);

    return criarRespostaErro(
      categoria,
      extrairMensagemErro(erro),
      exposaoProdutos ? (erro as any).detalhes : undefined,
    );
  }

  // Erro genérico (erro interno)
  return criarRespostaErro(
    "ERRO_INTERNO",
    exposaoProdutos ? extrairMensagemErro(erro) : "Erro ao processar requisição",
    exposaoProdutos ? erro : undefined,
  );
}

/**
 * Identifica a categoria de erro baseado no código HTTP
 *
 * @param status Código HTTP
 * @returns Categoria de erro
 */
function identficarCategoriaErro(status: number): CategoriaErro {
  switch (status) {
    case 400:
      return "VALIDACAO";
    case 401:
      return "NAO_AUTORIZADO";
    case 403:
      return "ACESSO_NEGADO";
    case 404:
      return "NAO_ENCONTRADO";
    case 409:
      return "CONFLITO";
    case 503:
      return "SERVICO_INDISPONIVEL";
    default:
      return "ERRO_INTERNO";
  }
}

/**
 * Wrapper para executar função com tratamento de erro automático
 *
 * @param fn Função a executar
 * @param contexto Contexto para logging
 * @param valorPadrao Valor a retornar em caso de erro
 * @returns Resultado da função ou valorPadrao
 */
export async function executarComTratamento<T>(
  fn: () => Promise<T>,
  contexto: string,
  valorPadrao?: T,
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (erro) {
    logarErro(erro, contexto);
    return valorPadrao;
  }
}

/**
 * Wrapper síncrono para executar função com tratamento de erro automático
 *
 * @param fn Função a executar
 * @param contexto Contexto para logging
 * @param valorPadrao Valor a retornar em caso de erro
 * @returns Resultado da função ou valorPadrao
 */
export function executarComTratamentoSync<T>(
  fn: () => T,
  contexto: string,
  valorPadrao?: T,
): T | undefined {
  try {
    return fn();
  } catch (erro) {
    logarErro(erro, contexto);
    return valorPadrao;
  }
}

/**
 * Valida objeto contra um schema simples
 *
 * @param obj Objeto a validar
 * @param camposRequeridos Campos que devem estar presentes
 * @returns Array de erros (vazio se válido)
 */
export function validarSchema(
  obj: unknown,
  camposRequeridos: string[],
): string[] {
  const erros: string[] = [];

  if (!obj || typeof obj !== "object") {
    return ["Objeto inválido"];
  }

  const objDict = obj as Record<string, unknown>;

  for (const campo of camposRequeridos) {
    if (!(campo in objDict)) {
      erros.push(`Campo obrigatório ausente: ${campo}`);
    }
  }

  return erros;
}

/**
 * Cria erro de validação com mensagens múltiplas
 *
 * @param mensagens Array de mensagens de erro
 * @returns Resposta de erro de validação
 */
export function erroValidacao(mensagens: string[]): ReturnType<typeof criarRespostaErro> {
  const mensagem = mensagens.length === 1 ? mensagens[0] : "Validação falhou";
  return criarRespostaErro(
    "VALIDACAO",
    mensagem,
    mensagens.length > 1 ? { erros: mensagens } : undefined,
  );
}

/**
 * Cria erro de não encontrado
 *
 * @param recurso Nome do recurso não encontrado
 * @param identificador Identificador do recurso (opcional)
 * @returns Resposta de erro
 */
export function erroNaoEncontrado(recurso: string, identificador?: string): ReturnType<typeof criarRespostaErro> {
  const msg = identificador
    ? `${recurso} com ID "${identificador}" não encontrado`
    : `${recurso} não encontrado`;

  return criarRespostaErro("NAO_ENCONTRADO", msg);
}

/**
 * Cria erro de acesso negado
 *
 * @param motivo Motivo do acesso negado
 * @returns Resposta de erro
 */
export function erroAcessoNegado(motivo?: string): ReturnType<typeof criarRespostaErro> {
  const msg = motivo || "Acesso negado";
  return criarRespostaErro("ACESSO_NEGADO", msg);
}

/**
 * Cria erro de conflito (ex: recurso já existe)
 *
 * @param mensagem Mensagem descritiva
 * @returns Resposta de erro
 */
export function erroConflito(mensagem: string): ReturnType<typeof criarRespostaErro> {
  return criarRespostaErro("CONFLITO", mensagem);
}
