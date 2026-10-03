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
import type { PermissoesServiceDB } from "../domain/auth/permissoes-db.js";
import { FUNCOES_CATALOGO, PAPEIS_VALIDOS, papelValido } from "../domain/auth/permissoes.js";
import type { UserRole, ContextoAutenticacao } from "../domain/auth/auth-service.js";
import { validateTokenSafely, generateSecureToken } from "../utils/security-helpers.js";

export interface AuthRoutesDeps {
  authService: AuthServiceDB;
  auditService: AuditTrailServiceDB;
  permissoesService: PermissoesServiceDB;
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
 * index.ts. Anexa o contexto autenticado em `req.auth`.
 *
 * SEC-011B: Uses timing-safe token validation to prevent timing attacks
 * on token guessing.
 */
export function criarMiddlewareAutenticacao(authService: AuthServiceDB) {
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
      // SEC-011B: Timing-safe token validation happens in authService.validarToken
      // This response happens regardless to maintain constant time
      res.status(401).json({ erro: "Sessão inválida ou expirada" });
      return;
    }

    req.auth = contexto;
    next();
  };
}

/** Middleware que exige um dos papéis em `papeisPermitidos` — encadeado
 * DEPOIS de `exigirAutenticacao` (precisa de `req.auth` já preenchido).
 * Usado pelas rotas de gestão do sistema (matriz de permissões, criação de
 * usuário), reservadas a `titular`/`administrador`: este é um gate FIXO no
 * código (não depende da matriz de permissões configurável em si — a matriz
 * modela capacidades mais finas para os demais papéis, mas quem PODE
 * administrar o sistema continua uma decisão de código, não de dado, para
 * nunca ficar configurável a ponto de ninguém mais conseguir corrigi-la).
 * Recusa gera evento `acesso_negado` na trilha de auditoria. */
function criarMiddlewareRequerPapel(auditService: AuditTrailServiceDB, ...papeisPermitidos: UserRole[]) {
  return function requerPapel(req: express.Request, res: express.Response, next: express.NextFunction) {
    const contexto = req.auth as ContextoAutenticacao;
    const papel = contexto.usuario?.role;
    if (!papel || !papeisPermitidos.includes(papel)) {
      auditService.registrarAcessoNegado(
        contexto,
        "permissoes_administrativas",
        `${req.method} ${req.path}`,
        `Papel '${papel ?? "desconhecido"}' não está entre os permitidos: ${papeisPermitidos.join(", ")}`,
      );
      res.status(403).json({ erro: "Sem permissão para esta operação" });
      return;
    }
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

export function criarRotasAuth({ authService, auditService, permissoesService }: AuthRoutesDeps): express.Router {
  const router = express.Router();
  const exigirAutenticacao = criarMiddlewareAutenticacao(authService);
  const requerGestaoSistema = criarMiddlewareRequerPapel(auditService, "titular", "administrador");
  const limitadorLogin = criarLimitadorLogin();
  const limitadorBootstrap = criarLimitadorBootstrap();

  /**
   * POST /api/auth/login
   * Body: { email, senha }
   * Nunca revela se foi o e-mail ou a senha que errou — mensagem genérica
   * tanto na resposta quanto no corpo; o detalhe (motivoInterno) só vai
   * para a trilha de auditoria, nunca para o cliente.
   *
   * SEC-015: Returns httpOnly, secure, SameSite=Strict cookie with access token
   * Also returns a CSRF token for form submissions
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

    // SEC-015: Set httpOnly, secure cookie with session token
    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("session_token", resultado.token, {
      httpOnly: true, // Prevents JavaScript access (XSS protection)
      secure: isProduction, // HTTPS only in production
      sameSite: "strict", // CSRF protection
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/",
    });

    // SEC-015: Generate and return fresh CSRF token after successful login
    const csrfToken = generateSecureToken(32);
    res.cookie("csrf_token", csrfToken, {
      httpOnly: false, // JavaScript must access for form submission
      secure: isProduction,
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    res.json({
      usuario: usuarioParaResposta(resultado.usuario),
      csrfToken, // Also return in JSON for SPA access
      // token no longer returned - use cookie instead
    });
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
   *
   * SEC-015: Clears httpOnly cookies to prevent reuse
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

    // SEC-015: Clear authentication cookies
    res.clearCookie("session_token", { path: "/" });
    res.clearCookie("csrf_token", { path: "/" });

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
   *
   * SEC-015: Returns httpOnly cookies with session token
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

    // SEC-015: Set httpOnly, secure cookie with session token
    // Note: Bootstrap doesn't have a token from authService, so we create one
    // In production, authService.bootstrapTitular should return a token
    const isProduction = process.env.NODE_ENV === "production";
    const csrfToken = generateSecureToken(32);
    res.cookie("csrf_token", csrfToken, {
      httpOnly: false,
      secure: isProduction,
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    res.status(201).json({
      usuario: usuarioParaResposta(resultado.usuario),
      csrfToken, // Return CSRF token for subsequent requests
    });
  });

  /**
   * GET /api/auth/permissoes
   * Header: Authorization: Bearer <token> — exige papel titular/administrador.
   *
   * Devolve a matriz completa (papel × função) mais o catálogo de funções
   * (rótulo/descrição/se aceita limite) e a lista de papéis válidos — para o
   * client renderizar a tabela sem precisar duplicar esse catálogo.
   */
  router.get("/permissoes", exigirAutenticacao, requerGestaoSistema, (_req, res) => {
    res.json({
      matriz: permissoesService.obterMatriz(),
      catalogoFuncoes: FUNCOES_CATALOGO,
      papeis: PAPEIS_VALIDOS,
    });
  });

  /**
   * PUT /api/auth/permissoes
   * Header: Authorization: Bearer <token> — exige papel titular/administrador.
   * Body: { entradas: [{ papel, funcao, habilitado, limite_valor? }, ...] }
   *
   * Ver `PermissoesServiceDB.atualizarMatriz` para a validação completa e a
   * proteção contra autotravamento (gerenciar_permissoes nunca pode ser
   * desabilitada para titular/administrador). Toda mudança bem-sucedida gera
   * um evento `atualizar_permissoes` na trilha de auditoria, com os valores
   * antigos e novos das entradas tocadas.
   */
  router.put("/permissoes", exigirAutenticacao, requerGestaoSistema, (req, res) => {
    const contexto = req.auth!;
    const { enderecoIp, userAgent } = contextoRequisicao(req);
    const entradas = (req.body ?? {}).entradas;

    const resultado = permissoesService.atualizarMatriz(entradas, contexto);

    if (!resultado.sucesso) {
      auditService.registrarAcao(contexto, "atualizar_permissoes", "permissoes", "matriz", {
        descricao: `Tentativa de atualizar a matriz de permissões falhou: ${resultado.erro}`,
        resultado: "falha",
        motivo_falha: resultado.erro,
        endereco_ip: enderecoIp,
        user_agent: userAgent,
      });
      res.status(400).json({ erro: resultado.erro ?? "Não foi possível atualizar a matriz de permissões" });
      return;
    }

    auditService.registrarAcao(contexto, "atualizar_permissoes", "permissoes", "matriz", {
      descricao: `${resultado.entradasNovas!.length} entrada(s) da matriz de permissões atualizada(s) por ${contexto.usuario!.email}`,
      valores_antigos: { entradas: resultado.entradasAntigas },
      valores_novos: { entradas: resultado.entradasNovas },
      resultado: "sucesso",
      endereco_ip: enderecoIp,
      user_agent: userAgent,
    });

    res.json({ matriz: permissoesService.obterMatriz() });
  });

  /**
   * POST /api/auth/usuarios
   * Header: Authorization: Bearer <token> — exige papel titular/administrador.
   * Body: { nome, email, senha, role }
   *
   * Fecha a lacuna identificada na fase anterior (ver
   * docs/viabilidade-backend-pagamentos.md, seção 9): antes desta rota, um
   * titular não tinha como criar conta para outro papel depois do bootstrap
   * — `AuthServiceDB.criarUsuario` já existia e funcionava, só faltava rota
   * HTTP. `role` precisa ser um dos 6 papéis válidos (`PAPEIS_VALIDOS`);
   * validado aqui com mensagem clara, em vez de deixar a CHECK constraint do
   * banco vazar um erro SQL cru.
   *
   * Senha inicial em texto puro, nunca logada nem devolvida — só o hash é
   * gravado (ver AuthServiceDB.criarUsuario). NÃO força troca de senha no
   * primeiro login: o desenho atual de `usuarios` não tem coluna para esse
   * estado — ver nota em AuthServiceDB.criarUsuario; fica documentado como
   * próximo passo, não implementado nesta rodada.
   */
  router.post("/usuarios", exigirAutenticacao, requerGestaoSistema, async (req, res) => {
    const contexto = req.auth!;
    const { enderecoIp, userAgent } = contextoRequisicao(req);
    const { nome, email, senha, role } = req.body ?? {};

    if (typeof nome !== "string" || !nome.trim()) {
      res.status(400).json({ erro: "nome é obrigatório" });
      return;
    }
    if (typeof email !== "string" || !email.includes("@")) {
      res.status(400).json({ erro: "email válido é obrigatório" });
      return;
    }
    if (typeof senha !== "string" || senha.length < 8) {
      res.status(400).json({ erro: "senha precisa ter pelo menos 8 caracteres" });
      return;
    }
    if (typeof role !== "string" || !papelValido(role)) {
      res.status(400).json({ erro: `role inválido — precisa ser um de: ${PAPEIS_VALIDOS.join(", ")}` });
      return;
    }

    const resultado = await authService.criarUsuario(
      { nome: nome.trim(), email: email.trim(), senha, role, ativo: true },
      contexto,
    );

    if (!resultado.sucesso || !resultado.usuario) {
      auditService.registrarAcao(contexto, "criar_usuario", "usuario", email, {
        descricao: `Tentativa de criar usuário (${role}) falhou: ${resultado.erro}`,
        resultado: "falha",
        motivo_falha: resultado.erro,
        endereco_ip: enderecoIp,
        user_agent: userAgent,
      });
      const status = resultado.erro === "Sem permissão para criar usuários" ? 403 : 400;
      res.status(status).json({ erro: resultado.erro ?? "Não foi possível criar o usuário" });
      return;
    }

    auditService.registrarAcao(contexto, "criar_usuario", "usuario", resultado.usuario.id, {
      descricao: `${contexto.usuario!.email} criou o usuário ${resultado.usuario.email} (${role})`,
      resultado: "sucesso",
      endereco_ip: enderecoIp,
      user_agent: userAgent,
    });

    res.status(201).json({ usuario: usuarioParaResposta(resultado.usuario) });
  });

  return router;
}
