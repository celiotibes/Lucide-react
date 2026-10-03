/**
 * SEC-013: CSRF Protection Middleware
 *
 * Protege contra Cross-Site Request Forgery (CSRF) usando a estratégia
 * session-based com o middleware csurf. Cada sessão recebe um token único
 * que deve ser incluído em requisições POST/PUT/DELETE.
 *
 * Implementação:
 * 1. Express sessions configurada para armazenar tokens
 * 2. csurf em modo session-based (não usa cookies duplos)
 * 3. Token retornado no header XSRF-TOKEN em respostas GET
 * 4. Validação automática em POST/PUT/DELETE
 *
 * Fluxo típico:
 * 1. Cliente faz GET /api/formulario
 * 2. Servidor retorna { ..., "XSRF-TOKEN": "token123" }
 * 3. Cliente inclui token no header X-XSRF-TOKEN ao fazer POST
 * 4. Middleware valida token antes de executar handler
 */

import express from "express";
import { logger } from '../services/logger-service.js';
import session from "express-session";
import csurf from "csurf";

/**
 * Cria middleware de sessão Express
 * Necessário para que o csurf funcione em modo session-based
 */
export function criarMiddlewareSession(sessionSecret: string) {
  return session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // HTTPS apenas em produção
      sameSite: "strict", // Protege contra requisições cross-site
      maxAge: 24 * 60 * 60 * 1000, // 24 horas
    },
  });
}

/**
 * Cria middleware CSRF usando session-based tokens
 *
 * Opções:
 * - session: true — armazena token na sessão (padrão)
 * - value: função customizada para extrair token do request
 */
export function criarMiddlewareCSRF() {
  return csurf({
    cookie: false, // Não usa cookies, usa sessão
  });
}

/**
 * Middleware para retornar token CSRF no response
 *
 * Executa APÓS o middleware CSRF principal, para que o token já esteja disponível.
 * Adiciona o token em:
 * - Header HTTP: XSRF-TOKEN (para leitura no cliente)
 * - Request local: res.locals.csrfToken (para templates)
 *
 * Deve ser aplicado ANTES das rotas que retornam formulários.
 */
export function adicionarTokenCSRFAoResponse(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  // res.locals.csrfToken é acessível em templates EJS/Pug
  // Para APIs REST, retornamos no header (cliente lê com response.headers.get("XSRF-TOKEN"))
  const token = (req as any).csrfToken?.() || "";

  // Adiciona header XSRF-TOKEN para que o cliente possa ler
  res.setHeader("XSRF-TOKEN", token);

  // Também disponibiliza em res.locals para templates (se usar)
  res.locals.csrfToken = token;

  next();
}

/**
 * Middleware para rotas GET que retornam formulários
 *
 * Envolve o handler e injeta o token CSRF antes de retornar.
 * Exemplo de uso:
 *
 *   app.get("/formulario", comTokenCSRF, (req, res) => {
 *     res.json({ form: "dados", csrfToken: res.locals.csrfToken })
 *   });
 *
 * Alternativa: incluir o token manualmente em cada handler GET
 */
export function comTokenCSRF(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const token = (req as any).csrfToken?.() || "";
  res.locals.csrfToken = token;
  res.setHeader("XSRF-TOKEN", token);
  next();
}

/**
 * Wrapper para handlers GET que retornam formulários
 *
 * Exemplo:
 *   app.get("/api/formulario", retornarComToken(async (req, res) => {
 *     res.json({ csrfToken: res.locals.csrfToken });
 *   }));
 */
export function retornarComToken(
  handler: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<void> | void,
) {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const token = (req as any).csrfToken?.() || "";
    res.locals.csrfToken = token;
    res.setHeader("XSRF-TOKEN", token);
    return handler(req, res, next);
  };
}

/**
 * Middleware de erro para CSRF
 *
 * O csurf lança erros quando o token é inválido. Este middleware
 * captura e retorna uma resposta apropriada.
 *
 * Deve ser adicionado APÓS todas as rotas que usam csurf:
 *   app.use(erroCSRF);
 */
export function erroCSRF(
  erro: any,
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  if (erro.code === "EBADCSRFTOKEN") {
    // Token CSRF inválido, expirado ou ausente
    logger.warn(
      `[CSRF] Token inválido: ${erro.message} (IP: ${req.ip}, User-Agent: ${req.get("user-agent")?.substring(0, 50)})`,
    );
    res.status(403).json({
      erro: "Token CSRF inválido ou expirado",
      codigo: "EBADCSRFTOKEN",
    });
    return;
  }
  // Passa erro para o próximo middleware
  next(erro);
}
