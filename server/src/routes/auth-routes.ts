/**
 * Rotas HTTP de autenticação — Fase 1 (auth real)
 *
 * Expõe o que já existia, testado, em AuthServiceDB/AuditTrailServiceDB mas
 * nunca tinha rota (ver docs/viabilidade-backend-pagamentos.md).
 *
 * CORS: este router é montado no mesmo `app` Express que já tem
 * `app.use(cors({ origin: ALLOWED_ORIGIN }))` configurado em index.ts, ANTES
 * de qualquer rota. Não há `cors()` nenhum aqui — de propósito: uma política
 * de CORS mais permissiva só para /api/auth abriria justamente a rota mais
 * sensível do servidor para qualquer origem. As rotas de auth herdam a
 * mesma política restritiva de todas as outras.
 */
import express from "express";
import rateLimit from "express-rate-limit";
import type { AuthServiceDB, Usuario } from "../domain/auth/auth-service-db.js";
import type { AuditTrailServiceDB } from "../domain/auth/audit-trail-db.js";

export interface AuthRoutesDeps {
  authService: AuthServiceDB;
  auditService: AuditTrailServiceDB;
}

/** Extrai IP e user-agent da requisição para a trilha de auditoria e para a
 * coluna endereco_ip/user_agent da sessão. `req.ip` já respeita
 * `trust proxy` se configurado; não configuramos aqui — é decisão do
 * `index.ts` (fora do escopo desta rota) caso o servidor rode atrás de um
 * proxy reverso. */
function contextoRequisicao(req: express.Request): { enderecoIp?: string; userAgent?: string } {
  return {
    enderecoIp: req.ip,
    userAgent: req.get("user-agent") ?? undefined,
  };
}

/** Rate limit agressivo, só para a rota de login — protege contra força
 * bruta de senha por IP. Separado do rate limit geral (100 req/15min em
 * index.ts) porque login precisa de um limite bem mais baixo: ninguém
 * legítimo faz mais que uma dúzia de tentativas de login em 15 minutos,
 * enquanto outras rotas (ex: listar transações) são chamadas o tempo todo
 * pelo uso normal do app.
 *
 * Criado dentro de uma função (em vez de uma constante no topo do módulo) de
 * propósito: cada chamada a `criarRotasAuth` — cada instância do servidor —
 * ganha seu próprio contador. Um limiter em escopo de módulo seria
 * compartilhado por qualquer outro router criado no mesmo processo (é
 * exatamente isso que fazia testes de integração vazarem estado de um `it`
 * para o próximo, cada um montando seu próprio app Express de teste). */
function criarLimitadorLogin() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: "Muitas tentativas de login. Tente novamente mais tarde." },
  });
}

/** Rate limit para o bootstrap — não é uma rota de força bruta de senha (só
 * roda uma vez com sucesso), mas ainda assim vale limitar tentativas por IP
 * para não virar um jeito barato de martelar o banco. Mesmo motivo de ser
 * uma função e não uma constante de módulo — ver criarLimitadorLogin. */
function criarLimitadorBootstrap() {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: "Muitas tentativas. Tente novamente mais tarde." },
  });
}

/** Middleware que exige `Authorization: Bearer <token>` válido — equivalente,
 * por usuário, ao que `exigirChaveApi` já faz por chave compartilhada em
 * index.ts. Anexa o contexto autenticado em `req.auth`. */
function criarMiddlewareAutenticacao(authService: AuthServiceDB) {
  return function exigirAutenticacao(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) {
    const cabecalho = req.header("Authorization") ?? "";
    const [esquema, token] = cabecalho.split(" ");
    if (esquema !== "Bearer" || !token) {
      res.status(401).json({ erro: "Token de sessão ausente ou mal formatado" });
      return;
    }

    const contexto = authService.validarToken(token);
    if (!contexto || !contexto.autenticado) {
      res.status(401).json({ erro: "Sessão inválida ou expirada" });
      return;
    }

    req.auth = contexto;
    next();
  };
}

/** O tipo `Usuario` (auth-service.ts) já não tem campo `senha_hash` — os
 * métodos de AuthServiceDB nunca o incluem no objeto que devolvem. Esta
 * função só existe para deixar explícito, no ponto de saída da resposta
 * HTTP, que é isso mesmo que se quer: nunca vazar hash de senha. */
function usuarioParaResposta(usuario: Usuario | null | undefined): Usuario | null {
  return usuario ?? null;
}

export function criarRotasAuth({ authService, auditService }: AuthRoutesDeps): express.Router {
  const router = express.Router();
  const exigirAutenticacao = criarMiddlewareAutenticacao(authService);
  const limitadorLogin = criarLimitadorLogin();
  const limitadorBootstrap = criarLimitadorBootstrap();

  /**
   * POST /api/auth/login
   * Body: { email, senha }
   * Nunca revela se foi o e-mail ou a senha que errou — mensagem genérica
   * tanto na resposta quanto no corpo; o detalhe (motivoInterno) só vai
   * para a trilha de auditoria, nunca para o cliente.
   */
  router.post("/login", limitadorLogin, async (req, res) => {
    const { email, senha } = req.body ?? {};
    if (typeof email !== "string" || typeof senha !== "string" || !email || !senha) {
      res.status(400).json({ erro: "email e senha são obrigatórios" });
      return;
    }

    const { enderecoIp, userAgent } = contextoRequisicao(req);
    const resultado = await authService.autenticar(email, senha, { enderecoIp, userAgent });

    if (!resultado.sucesso || !resultado.token || !resultado.usuario) {
      // usuarioParaAuditoria só vem preenchido quando a conta de fato existe
      // (senha errada / inativa) — nunca em "não encontrado"/"bloqueado".
      // Isso enriquece a auditoria (sabe QUAL conta teve tentativa falha)
      // sem que essa informação chegue na resposta HTTP.
      auditService.registrarAcao(
        { usuario: resultado.usuarioParaAuditoria ?? null, autenticado: false },
        "login",
        "usuario",
        email,
        {
          descricao: `Tentativa de login falhou para ${email}`,
          resultado: "falha",
          motivo_falha: resultado.motivoInterno ?? "desconhecido",
          endereco_ip: enderecoIp,
          user_agent: userAgent,
        },
      );
      res.status(401).json({ erro: resultado.erro ?? "Credenciais inválidas" });
      return;
    }

    const contexto = { usuario: resultado.usuario, autenticado: true, role: resultado.usuario.role };
    auditService.registrarAcao(contexto, "login", "usuario", resultado.usuario.id, {
      descricao: `Login bem-sucedido: ${resultado.usuario.email}`,
      resultado: "sucesso",
      endereco_ip: enderecoIp,
      user_agent: userAgent,
    });

    res.json({ token: resultado.token, usuario: usuarioParaResposta(resultado.usuario) });
  });

  /**
   * GET /api/auth/me
   * Header: Authorization: Bearer <token>
   */
  router.get("/me", exigirAutenticacao, (req, res) => {
    res.json({ usuario: usuarioParaResposta(req.auth!.usuario) });
  });

  /**
   * POST /api/auth/logout
   * Header: Authorization: Bearer <token>
   *
   * A sessão é stateful (tabela `sessoes`, ver auth-service-db.ts) — logout
   * aqui invalida de verdade no servidor (UPDATE sessoes SET ativo=false),
   * não é "só o cliente descarta o token". Depois deste chamado, o mesmo
   * token não passa mais em validarToken().
   */
  router.post("/logout", exigirAutenticacao, (req, res) => {
    const contexto = req.auth!;
    const { enderecoIp, userAgent } = contextoRequisicao(req);
    authService.logout(contexto.token!);
    auditService.registrarAcao(contexto, "logout", "usuario", contexto.usuario!.id, {
      descricao: `Logout: ${contexto.usuario!.email}`,
      resultado: "sucesso",
      endereco_ip: enderecoIp,
      user_agent: userAgent,
    });
    res.json({ ok: true });
  });

  /**
   * POST /api/auth/bootstrap
   * Body: { nome, email, senha }
   *
   * Cria o primeiro usuário titular. Só funciona enquanto não existir NENHUM
   * titular no banco — depois trava (403). Não é uma rota geral de "criar
   * usuário" e não fica disponível indefinidamente; ver
   * AuthServiceDB.bootstrapTitular para a checagem atômica.
   */
  router.post("/bootstrap", limitadorBootstrap, async (req, res) => {
    const { nome, email, senha } = req.body ?? {};
    if (typeof nome !== "string" || typeof email !== "string" || typeof senha !== "string") {
      res.status(400).json({ erro: "nome, email e senha são obrigatórios" });
      return;
    }

    const { enderecoIp, userAgent } = contextoRequisicao(req);
    const resultado = await authService.bootstrapTitular({ nome, email, senha });

    if (!resultado.sucesso || !resultado.usuario) {
      auditService.registrarAcao(
        { usuario: null, autenticado: false },
        "criar_usuario",
        "usuario",
        email,
        {
          descricao: `Tentativa de bootstrap do titular falhou: ${resultado.erro}`,
          resultado: "falha",
          motivo_falha: resultado.erro,
          endereco_ip: enderecoIp,
          user_agent: userAgent,
        },
      );
      res.status(403).json({ erro: resultado.erro ?? "Não foi possível criar o titular" });
      return;
    }

    const contexto = { usuario: resultado.usuario, autenticado: true, role: resultado.usuario.role };
    auditService.registrarAcao(contexto, "criar_usuario", "usuario", resultado.usuario.id, {
      descricao: `Bootstrap: primeiro titular criado (${resultado.usuario.email})`,
      resultado: "sucesso",
      endereco_ip: enderecoIp,
      user_agent: userAgent,
    });

    res.status(201).json({ usuario: usuarioParaResposta(resultado.usuario) });
  });

  return router;
}
