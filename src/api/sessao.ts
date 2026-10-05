/**
 * Operações de sessão contra as rotas REAIS do servidor (server/src/routes/auth-routes.ts):
 *   POST /api/auth/login   { email, senha } -> 200 { usuario } + cookie httpOnly | 401 { erro }
 *   GET  /api/auth/me                       -> 200 { usuario }                   | 401
 *   POST /api/auth/logout                   -> 200 { ok: true }
 * O token de sessão nunca aparece no corpo (fica só no cookie httpOnly) e a senha só trafega
 * no corpo do login — nada é guardado no navegador.
 *
 * Separado do React para ser testável sem DOM (a suíte roda em ambiente node).
 */
import { apiFetch as apiFetchPadrao, esquecerTokenCsrf as esquecerPadrao } from "./cliente";

export interface UsuarioSessao {
  id: string;
  nome: string;
  email: string;
  role: string;
}

/** `indisponivel` = não há servidor utilizável (rede, 404, HTML de fallback do SPA, 5xx). */
export type ResultadoSessao =
  | { status: "autenticado"; usuario: UsuarioSessao }
  | { status: "anonimo" }
  | { status: "indisponivel"; motivo: string };

/** Plano de propósito (o projeto compila sem strictNullChecks, o que quebra o estreitamento de
 * uniões discriminadas por booleano): `ok` => `usuario`; senão `tipo` + `mensagem`. */
export interface ResultadoLogin {
  ok: boolean;
  usuario?: UsuarioSessao;
  tipo?: "credenciais" | "limite" | "indisponivel" | "erro";
  mensagem?: string;
}

export interface DepsSessao {
  apiFetch: (url: string, init?: RequestInit & { semEventoLogout?: boolean }) => Promise<Response>;
  esquecerTokenCsrf: () => void;
}

const DEPS_PADRAO: DepsSessao = { apiFetch: apiFetchPadrao, esquecerTokenCsrf: esquecerPadrao };

async function lerJson(resposta: Response): Promise<unknown> {
  try {
    return await resposta.json();
  } catch {
    return null; // corpo vazio ou HTML (ex.: hospedagem estática devolvendo index.html)
  }
}

function usuarioValido(valor: unknown): valor is UsuarioSessao {
  const u = valor as Partial<UsuarioSessao> | null;
  return !!u && typeof u.email === "string" && typeof u.id === "string";
}

export async function consultarSessao(deps: DepsSessao = DEPS_PADRAO): Promise<ResultadoSessao> {
  let resposta: Response;
  try {
    resposta = await deps.apiFetch("/api/auth/me", { semEventoLogout: true });
  } catch {
    return { status: "indisponivel", motivo: "Não foi possível alcançar o servidor." };
  }
  if (resposta.status === 401) return { status: "anonimo" };
  if (resposta.ok) {
    const corpo = await lerJson(resposta);
    const usuarioObj = (corpo && typeof corpo === 'object' && 'usuario' in corpo) ? (corpo as any).usuario : undefined;
    if (usuarioValido(usuarioObj)) return { status: "autenticado", usuario: usuarioObj };
    return { status: "indisponivel", motivo: "A resposta do servidor não é a esperada (API não encontrada neste endereço)." };
  }
  return { status: "indisponivel", motivo: `O servidor respondeu com erro (HTTP ${resposta.status}).` };
}

export async function entrar(email: string, senha: string, deps: DepsSessao = DEPS_PADRAO): Promise<ResultadoLogin> {
  let resposta: Response;
  try {
    resposta = await deps.apiFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), senha }),
      semEventoLogout: true,
    });
  } catch {
    return { ok: false, tipo: "indisponivel", mensagem: "Não foi possível alcançar o servidor. Verifique a conexão e tente novamente." };
  }
  const corpo = await lerJson(resposta);
  const usuarioObj = (corpo && typeof corpo === 'object' && 'usuario' in corpo) ? (corpo as any).usuario : undefined;
  const erroMsg = (corpo && typeof corpo === 'object' && 'erro' in corpo && typeof (corpo as any).erro === 'string') ? (corpo as any).erro : null;

  if (resposta.ok && usuarioValido(usuarioObj)) {
    deps.esquecerTokenCsrf(); // a sessão mudou: o próximo token vem junto das próximas respostas
    return { ok: true, usuario: usuarioObj };
  }
  if (resposta.status === 401) {
    return { ok: false, tipo: "credenciais", mensagem: erroMsg || "E-mail ou senha incorretos." };
  }
  if (resposta.status === 429) {
    return { ok: false, tipo: "limite", mensagem: erroMsg || "Muitas tentativas. Aguarde alguns minutos." };
  }
  if (resposta.status === 400 && erroMsg) {
    return { ok: false, tipo: "erro", mensagem: erroMsg };
  }
  if (resposta.status === 404 || resposta.status >= 500 || corpo === null) {
    return { ok: false, tipo: "indisponivel", mensagem: "O servidor não está disponível neste endereço." };
  }
  return { ok: false, tipo: "erro", mensagem: `Não foi possível entrar (HTTP ${resposta.status}).` };
}

/** Encerra a sessão no servidor (invalida de verdade). Falhas de rede não impedem a UI de sair. */
export async function sair(deps: DepsSessao = DEPS_PADRAO): Promise<void> {
  try {
    await deps.apiFetch("/api/auth/logout", { method: "POST", semEventoLogout: true });
  } catch {
    /* sem servidor: a sessão local já é descartada pelo chamador */
  } finally {
    deps.esquecerTokenCsrf();
  }
}
