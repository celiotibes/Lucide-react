/**
 * Cliente HTTP único para falar com o servidor (`server/`) — sessão por cookie httpOnly + CSRF.
 *
 * - Base: `VITE_API_URL` (vazio = mesmo domínio: o proxy reverso em produção ou o proxy `/api`
 *   do Vite em dev). Preenchida só na topologia cross-origin (ver docs/TOPOLOGIA-IMPLANTACAO.md).
 * - `credentials: 'include'`: o navegador anexa o cookie de sessão (`session_token`/`connect.sid`);
 *   o JS nunca vê o token de sessão e NUNCA o guardamos em localStorage/sessionStorage.
 * - CSRF (csurf global no servidor): o token vem no cabeçalho `XSRF-TOKEN` de qualquer resposta;
 *   fica só em memória e é reenviado em `X-XSRF-TOKEN` nos métodos mutáveis. Se ainda não há
 *   token, é buscado com um GET leve antes. Se o servidor recusar por token vencido
 *   (EBADCSRFTOKEN), renovamos e repetimos a chamada uma única vez.
 * - 401: dispara o evento de logout (`aoSessaoExpirar`) para a UI voltar à tela de login.
 *   Chamadas que esperam 401 (login, consulta de sessão) passam `semEventoLogout: true`.
 *
 * O app é local-first: nada aqui roda no boot. Só é usado quando uma tela do servidor é aberta.
 */

export interface OpcoesApi extends RequestInit {
  /** Não dispara o evento de logout em 401 (login com senha errada, GET /api/auth/me anônimo). */
  semEventoLogout?: boolean;
}

export interface ConfigCliente {
  /** Lido a cada chamada (permite trocar em testes). Vazio = mesmo domínio. */
  baseUrl: () => string;
  fetchImpl: () => typeof fetch;
}

/** Rota GET usada só para receber o cabeçalho XSRF-TOKEN (responde 401 se anônimo, e tudo bem). */
const ROTA_TOKEN_CSRF = "/api/auth/me";
const METODOS_SEGUROS = new Set(["GET", "HEAD", "OPTIONS"]);

export function montarUrlApi(baseUrl: string, caminho: string): string {
  if (/^https?:\/\//i.test(caminho)) return caminho;
  const base = baseUrl.trim().replace(/\/+$/, "");
  const rota = caminho.startsWith("/") ? caminho : `/${caminho}`;
  return `${base}${rota}`;
}

export interface ClienteApi {
  apiFetch: (caminho: string, init?: OpcoesApi) => Promise<Response>;
  /** Inscreve um ouvinte para 401 (sessão expirada/ausente). Devolve a função de cancelar. */
  aoSessaoExpirar: (ouvinte: () => void) => () => void;
  /** Esquece o token CSRF em memória (use após login/logout, quando a sessão do servidor muda). */
  esquecerTokenCsrf: () => void;
}

export function criarClienteApi(config: ConfigCliente): ClienteApi {
  // Só em memória, de propósito (nunca localStorage): some ao recarregar e é refeito sob demanda.
  let tokenCsrf: string | null = null;
  let buscandoToken: Promise<string> | null = null;
  const ouvintes = new Set<() => void>();

  const guardarTokenDe = (resposta: Response) => {
    const token = resposta.headers.get("XSRF-TOKEN");
    if (token) tokenCsrf = token;
  };

  const buscarToken = (): Promise<string> => {
    if (!buscandoToken) {
      buscandoToken = (async () => {
        const resposta = await config.fetchImpl()(montarUrlApi(config.baseUrl(), ROTA_TOKEN_CSRF), {
          method: "GET",
          credentials: "include",
        });
        guardarTokenDe(resposta);
        if (!tokenCsrf) throw new Error("O servidor não forneceu o token CSRF (cabeçalho XSRF-TOKEN).");
        return tokenCsrf;
      })().finally(() => {
        buscandoToken = null;
      });
    }
    return buscandoToken;
  };

  const falhouPorCsrf = async (resposta: Response): Promise<boolean> => {
    if (resposta.status !== 403) return false;
    try {
      const corpo = await resposta.clone().json();
      return corpo?.codigo === "EBADCSRFTOKEN" || corpo?.codigo === "INVALID_CSRF_TOKEN" || corpo?.codigo === "MISSING_CSRF_TOKEN";
    } catch {
      return false;
    }
  };

  const apiFetch = async (caminho: string, init: OpcoesApi = {}): Promise<Response> => {
    const { semEventoLogout, ...initFetch } = init;
    const metodo = (initFetch.method ?? "GET").toUpperCase();
    const mutavel = !METODOS_SEGUROS.has(metodo);
    const url = montarUrlApi(config.baseUrl(), caminho);

    const executar = async (): Promise<Response> => {
      const cabecalhos = new Headers(initFetch.headers);
      if (mutavel) cabecalhos.set("X-XSRF-TOKEN", tokenCsrf ?? (await buscarToken()));
      const resposta = await config.fetchImpl()(url, { ...initFetch, method: metodo, headers: cabecalhos, credentials: "include" });
      guardarTokenDe(resposta);
      return resposta;
    };

    let resposta = await executar();
    if (mutavel && (await falhouPorCsrf(resposta))) {
      tokenCsrf = null; // token vencido (ex.: sessão do servidor reiniciada): renova e tenta uma vez
      resposta = await executar();
    }
    if (resposta.status === 401 && !semEventoLogout) {
      tokenCsrf = null;
      ouvintes.forEach((ouvinte) => ouvinte());
    }
    return resposta;
  };

  return {
    apiFetch,
    aoSessaoExpirar: (ouvinte) => {
      ouvintes.add(ouvinte);
      return () => {
        ouvintes.delete(ouvinte);
      };
    },
    esquecerTokenCsrf: () => {
      tokenCsrf = null;
    },
  };
}

const padrao = criarClienteApi({
  baseUrl: () => (import.meta.env.VITE_API_URL as string | undefined) ?? "",
  fetchImpl: () => globalThis.fetch.bind(globalThis),
});

export const apiFetch = padrao.apiFetch;
export const aoSessaoExpirar = padrao.aoSessaoExpirar;
export const esquecerTokenCsrf = padrao.esquecerTokenCsrf;
