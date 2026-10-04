/**
 * CORS por allowlist explícita + política de cookie de sessão (mesmo domínio x cross-site).
 *
 * Topologia padrão: MESMO DOMÍNIO (cliente e API atrás do mesmo proxy reverso). Nesse caso
 * não há CORS algum: sem `CORS_ORIGINS`, nenhum cabeçalho Access-Control-* é emitido e o
 * navegador só aceita chamadas de mesma origem.
 *
 * Topologia opcional: cliente e API em domínios diferentes. Aí:
 *  - `CORS_ORIGINS` lista, separada por vírgula, as origens permitidas (esquema+host+porta);
 *  - a origem é refletida (nunca `*`) e `Access-Control-Allow-Credentials: true` só vai
 *    para origens da lista — `*` com credenciais é inválido e perigoso, por isso é descartado;
 *  - o cookie de sessão precisa de `SameSite=None; Secure`, o que só é ativado com
 *    `COOKIE_CROSS_SITE=true` (decisão explícita, nunca implícita pela presença do CORS).
 */
import type { CookieOptions, RequestHandler } from "express";
import cors from "cors";

/** Cabeçalhos que o cliente pode enviar cross-origin (inclui o token CSRF nas duas grafias aceitas). */
export const CABECALHOS_PERMITIDOS = [
  "Content-Type",
  "Authorization",
  "X-XSRF-TOKEN",
  "X-CSRF-Token",
  "X-API-Key",
];

/** Cabeçalhos de resposta que o JS do cliente precisa ler cross-origin (o token CSRF vem em XSRF-TOKEN). */
export const CABECALHOS_EXPOSTOS = ["XSRF-TOKEN"];

const METODOS_PERMITIDOS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

/**
 * Converte o valor bruto de `CORS_ORIGINS` em lista de origens normalizadas.
 * Entradas vazias, `*` e valores que não são URLs http(s) são descartados (e reportados em
 * `descartadas`), para que um erro de digitação nunca vire "libera tudo".
 */
export function interpretarOrigensCors(bruto: string | undefined): { origens: string[]; descartadas: string[] } {
  const origens: string[] = [];
  const descartadas: string[] = [];
  for (const parte of (bruto ?? "").split(",")) {
    const item = parte.trim();
    if (!item) continue;
    if (item === "*") {
      descartadas.push(item);
      continue;
    }
    try {
      const url = new URL(item);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        descartadas.push(item);
        continue;
      }
      if (!origens.includes(url.origin)) origens.push(url.origin);
    } catch {
      descartadas.push(item);
    }
  }
  return { origens, descartadas };
}

/**
 * Middleware CORS. Lista vazia => middleware neutro (sem nenhum cabeçalho CORS: só mesma origem).
 * Origem fora da lista => resposta sem cabeçalhos CORS (o navegador bloqueia a leitura);
 * requisição sem `Origin` (mesma origem, curl, servidor-servidor) passa normalmente.
 */
export function criarMiddlewareCors(origensPermitidas: readonly string[]): RequestHandler {
  if (origensPermitidas.length === 0) {
    return (_req, _res, next) => next();
  }
  const permitidas = new Set(origensPermitidas);
  return cors({
    origin: (origem, callback) => {
      // Sem Origin: não é uma requisição CORS de navegador — nada a fazer.
      if (!origem) return callback(null, false);
      callback(null, permitidas.has(origem));
    },
    credentials: true,
    methods: METODOS_PERMITIDOS,
    allowedHeaders: CABECALHOS_PERMITIDOS,
    exposedHeaders: CABECALHOS_EXPOSTOS,
    maxAge: 600,
    optionsSuccessStatus: 204,
  });
}

/** `COOKIE_CROSS_SITE=true` (lido a cada chamada, para ser testável) liga SameSite=None; Secure. */
export function cookieCrossSiteAtivo(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.COOKIE_CROSS_SITE ?? "").trim().toLowerCase() === "true";
}

/**
 * Atributos comuns dos cookies de sessão/CSRF.
 *  - mesmo domínio (padrão): SameSite=Lax; Secure só em produção;
 *  - COOKIE_CROSS_SITE=true: SameSite=None; Secure SEMPRE (navegadores recusam None sem Secure).
 * HttpOnly é responsabilidade de quem chama (o cookie csrf_token legível por JS usa false).
 */
export function atributosCookieSessao(env: NodeJS.ProcessEnv = process.env): Pick<CookieOptions, "sameSite" | "secure"> {
  if (cookieCrossSiteAtivo(env)) return { sameSite: "none", secure: true };
  return { sameSite: "lax", secure: env.NODE_ENV === "production" };
}
