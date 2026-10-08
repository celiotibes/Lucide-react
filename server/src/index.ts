import "dotenv/config";
import { z } from "zod";
import express from "express";
import multer from "multer";
import { criarMiddlewareCors, interpretarOrigensCors, cookieCrossSiteAtivo } from "./middleware/cors-middleware.js";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import { specs } from "./swagger.js";
import { pluggy, normalizarTransacao } from "./pluggy.js";
// SEC-011: Structured Logging
import { logger } from "./services/logger-service.js";
// SEC-012: Sentry Error Tracking & Performance Monitoring
import { initializeSentry, attachSentryHandlers } from "./services/sentry-service.js";
import { requestIdMiddleware } from "./middleware/request-id-middleware.js";
// SEC-013: CSRF Protection
import {
  criarMiddlewareSession,
  criarMiddlewareCSRF,
  adicionarTokenCSRFAoResponse,
  erroCSRF,
} from "./middleware/csrf-middleware.js";
import { initializeDatabase, closeDatabase } from "./database-init.js";
import { AuthServiceDB } from "../src/domain/auth/auth-service-db.js";
import { AuditTrailServiceDB } from "../src/domain/auth/audit-trail-db.js";
import { PermissoesServiceDB } from "../src/domain/auth/permissoes-db.js";
import { DuplicatePaymentGuardDB } from "../src/domain/erp/duplicate-payment-guard-db.js";
import { avisarSeSegredoForTemporario } from "../src/domain/auth/token.js";
import { criarRotasAuth } from "../src/routes/auth-routes.js";
import { EventosExternosServiceDB } from "../src/domain/integracoes/eventos-externos-db.js";
import { criarRotasEventosExternos } from "../src/routes/eventos-externos-routes.js";
import { criarRotasAsaas } from "../src/routes/asaas-routes.js";
import { criarRotasAcl } from "../src/routes/acl-routes.js";
import { criarRotasPortal } from "../src/routes/portal-routes.js";
import { criarRotasPrestadorApontamentos, ROTA_POST_APONTAMENTOS } from "../src/routes/prestador-apontamentos-routes.js";
import { criarRotasLgpd } from "../src/routes/lgpd-routes.js";
import { criarRotasCompliance } from "../src/routes/compliance-routes.js";
import { criarRotasCarimbo } from "../src/routes/carimbo-routes.js";
import { criarRotasPluggyMeu } from "../src/routes/pluggy-meu-routes.js";
import { criarRotasTelegram } from "../src/routes/telegram-routes.js";
import { criarRotasNotificacoes } from "../src/routes/notificacoes-routes.js";
import { criarRotasImportacaoUpload } from "../src/routes/importacao-upload-routes.js";
import { criarRotasOCRDocumento } from "../src/routes/ocr-document-routes.js";
import { LembretesAgendadosServiceDB } from "../src/domain/notificacoes/lembretes-agendados-db.js";
import { criarRotasLembretesAgendados } from "../src/routes/lembretes-agendados-routes.js";
import { iniciarDisparoLembretesAgendados } from "./lembretes-dispatcher.js";
import { criarRotasRelatorios } from "../src/routes/dre-routes.js";
import { criarRotasRelatorioExecutivo } from "../src/routes/relatorio-executivo-routes.js";
import { criarRotasTransacoes } from "../src/routes/transacoes-routes.js";
import { criarRotasConciliacaoPixOFX } from "../src/routes/conciliacao-pix-ofx-routes.js";
import { criarRotasAnomalias } from "../src/routes/anomalias-routes.js";
import { criarRotasAsaasPixProativo } from "../src/routes/asaas-pagamentos-pix-routes.js";
import { criarRotasAgentesEconomicos } from "../src/routes/agentes-economicos-routes.js";
import { iniciarScannerAnomaliasDiario } from "./lembretes-dispatcher.js";
import { criarRotasBackup } from "../src/routes/backup-routes.js";
import { criarRotasSetupWizard } from "../src/routes/setup-wizard-routes.js";
// Phase 13: Backup Scheduler — agendamento periódico de backups
import BackupService from "../src/services/backup-service.js";
import BackupScheduler from "../src/services/backup-scheduler.js";
// Phase 10: Assinatura Digital + LGPD
import { criarRotasAssinaturasLGPD } from "../src/routes/assinatura-lgpd-routes.js";
// Phase 22.20: Anthropic AI Integration
import { criarRotasAI } from "../src/routes/ai-routes.js";
import { initializeAnthropicService } from "../src/ai/anthropic-service.js";
// Phase 22.20.3: Property Management
import { criarRotasPropriedades } from "../src/routes/property-routes.js";
// Phase 9: Cache, Alertas, Health Check
import { cache } from "../src/utils/cache-memoria.js";
import { enviarAlertaEmail } from "../src/utils/email-alertas.js";
import { enviarAlertaSlack } from "../src/utils/slack-alertas.js";
import { executarHealthCheck, executarHealthCheckLeve } from "../src/utils/health-check.js";
// OBS-001: Prometheus Metrics
import { getMetricsRegistry } from "./services/metrics-service.js";

/**
 * SEC-010: Environment Variables Schema - Validação no boot do servidor
 * Garante que todas as variáveis obrigatórias estão presentes e com tipos/formatos corretos.
 * Se alguma variável for inválida, o servidor não inicia.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  API_KEY: z
    .string()
    .min(1, "API_KEY é obrigatória")
    .min(32, "API_KEY deve ter pelo menos 32 caracteres para segurança"),
  SESSION_SECRET: z.string().optional(),
  // CORS: allowlist explícita, separada por vírgula (ex.: "https://app.exemplo.com,https://admin.exemplo.com").
  // Sem valor = só mesma origem (topologia padrão, atrás de proxy reverso) e NENHUM cabeçalho CORS.
  CORS_ORIGINS: z.string().optional(),
  // Legado: origem única, tratada como mais uma entrada de CORS_ORIGINS. Sem default (antes era
  // localhost:5173): liberar uma origem tem de ser uma decisão explícita.
  ALLOWED_ORIGIN: z.string().url("ALLOWED_ORIGIN deve ser uma URL válida").optional(),
  // "true" => cookie de sessão SameSite=None; Secure (cliente e API em domínios diferentes).
  COOKIE_CROSS_SITE: z.string().optional(),
  // Nº de proxies reversos confiáveis à frente do servidor (ou "true" = 1). Necessário para o
  // cookie Secure funcionar atrás de um proxy que termina TLS (X-Forwarded-Proto).
  TRUST_PROXY: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatória"),
  // Variáveis opcionais de integração
  CERTISIGN_API_KEY: z.string().optional(),
  SERPROID_API_KEY: z.string().optional(),
  ALERTS_EMAIL_PROVIDER: z.string().optional(),
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  // SEC-012: Sentry Error Tracking
  SENTRY_DSN: z.string().optional(),
  // Phase 22.20: Anthropic AI Integration
  ANTHROPIC_API_KEY: z.string().optional(),
  // Fase 13: Backup Scheduler — variáveis opcionais (backup automático)
  BACKUP_LOCAL_DIR: z.string().optional(),
  BACKUP_ENCRYPTION_KEY: z.string().optional(),
  BACKUP_SCHEDULE: z.string().optional(),
  BACKUP_VERIFY_SCHEDULE: z.string().optional(),
  BACKUP_RETENTION_DAYS: z.string().optional(),
  BACKUP_FISCAL_RETENTION_DAYS: z.string().optional(),
  NAS_PATH: z.string().optional(),
  NAS_COPY_ENABLED: z.string().optional(),
  // Fase 21: Setup Wizard — criptografia de credenciais sensíveis
  ENCRYPTION_MASTER_SECRET: z.string().optional(),
});

// Parse e validação de variáveis de ambiente no boot
let envVars: z.infer<typeof envSchema>;
try {
  envVars = envSchema.parse(process.env);
} catch {
  if (error instanceof z.ZodError) {
    logger.error("[Server] Erro na validação das variáveis de ambiente", {
      errors: error.errors.map((e) => `  - ${e.path.join(".")}: ${e.message}`).join("\n"),
    });
  }
  throw new Error(
    "Falha ao validar variáveis de ambiente no boot. Verifique .env — consulte .env.example.",
  );
}

const API_KEY = envVars.API_KEY;
const PORT = envVars.PORT;
const { origens: ORIGENS_CORS, descartadas: ORIGENS_CORS_DESCARTADAS } = interpretarOrigensCors(
  [envVars.CORS_ORIGINS, envVars.ALLOWED_ORIGIN].filter(Boolean).join(","),
);
const NODE_ENV = envVars.NODE_ENV;

// SEC-012: Initialize Sentry FIRST (before any other operations)
initializeSentry();

logger.info("[Server] Environment", {
  environment: NODE_ENV,
  port: PORT,
  corsOrigins: ORIGENS_CORS,
  cookieCrossSite: cookieCrossSiteAtivo(),
});
if (ORIGENS_CORS_DESCARTADAS.length > 0) {
  logger.warn("[CORS] Entradas inválidas ignoradas em CORS_ORIGINS (curinga '*' nunca é aceito com credenciais)", {
    descartadas: ORIGENS_CORS_DESCARTADAS,
  });
}
if (cookieCrossSiteAtivo() && ORIGENS_CORS.length === 0) {
  logger.warn("[CORS] COOKIE_CROSS_SITE=true sem CORS_ORIGINS: cookies cross-site não terão utilidade");
}

// Phase 2: Initialize database and services on startup
logger.info("[Server] Initializing database...");
const db = initializeDatabase();

// Fase 21: Initialize credential encryption service
import { initializeEncryptionService } from "./services/credential-encryption.js";
const masterSecret = envVars.ENCRYPTION_MASTER_SECRET || envVars.API_KEY || "default-master-secret";
try {
  initializeEncryptionService(masterSecret);
  logger.info("[Server] Credential encryption service initialized");
} catch (error) {
  logger.error("[Server] Failed to initialize credential encryption service:", error);
  throw error;
}

// Phase 22.20: Initialize Anthropic AI Service
let aiService: any = null;
if (envVars.ANTHROPIC_API_KEY) {
  try {
    aiService = initializeAnthropicService(envVars.ANTHROPIC_API_KEY);
    logger.info("[Server] Anthropic AI service initialized");
  } catch (error) {
    logger.warn("[Server] Failed to initialize Anthropic AI service:", error instanceof Error ? error.message : error);
    // Non-fatal: AI features will be disabled but server continues
  }
}

// Create singleton service instances
const authService = new AuthServiceDB(db);
const auditService = new AuditTrailServiceDB(db);
const permissoesService = new PermissoesServiceDB(db);
const paymentGuard = new DuplicatePaymentGuardDB(db);
const eventosExternosService = new EventosExternosServiceDB(db);
const lembretesAgendadosService = new LembretesAgendadosServiceDB(db);

logger.info("[Server] Database and services initialized");

/** Loop de disparo dos lembretes agendados (fase 5 — ver lembretes-dispatcher.ts e
 * migrations-phase5-lembretes-agendados.sql): roda uma vez agora e depois a cada 1h,
 * independente de qualquer requisição HTTP. É esta chamada que faz o disparo acontecer
 * num horário real do servidor mesmo com o app cliente fechado no dia do vencimento. */
iniciarDisparoLembretesAgendados(db);

/** Scanner diário de anomalias em fluxo de caixa (fase 4.1 — ver lembretes-dispatcher.ts e
 * migrations-phase4.1-anomalias.sql): analisa transações do último dia e registra alertas
 * críticos. Roda uma vez ao boot e depois a cada 24 horas, independente de requisições HTTP. */
iniciarScannerAnomaliasDiario(db);

/** Fase 13: Backup Scheduler — agendamento periódico de backups com verificação de restauração
 * (ver backup-scheduler.ts). Inicializa o backup automático se BACKUP_LOCAL_DIR e
 * BACKUP_ENCRYPTION_KEY estiverem configuradas. Roda em background com setInterval.unref()
 * para não bloquear saída do processo. */
let backupScheduler: BackupScheduler | null = null;
if (process.env.BACKUP_LOCAL_DIR && process.env.BACKUP_ENCRYPTION_KEY) {
  try {
    const backupService = new BackupService();
    backupScheduler = new BackupScheduler(backupService);
    backupScheduler.start();
    logger.info("[Server] Backup scheduler iniciado com sucesso");
  } catch {
    logger.error("[Server] Erro ao inicializar backup scheduler:", error instanceof Error ? error.message : error);
    // Falha aberta: backup automático desabilitado, mas sistema continua funcionando
  }
}

// Fase 1 (auth real): avisa alto no boot se o segredo de assinatura de
// sessão foi gerado só para este processo (SESSION_SECRET/JWT_SECRET
// ausente) — ver token.ts para o que isso significa na prática.
avisarSeSegredoForTemporario();

const app = express();

if (envVars.TRUST_PROXY) {
  const valor = envVars.TRUST_PROXY.trim();
  app.set("trust proxy", valor === "true" ? 1 : /^\d+$/.test(valor) ? Number(valor) : valor);
}

// Security headers with helmet.js — positioned as first middleware before all other middlewares
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    hsts: {
      maxAge: 31536000, // 1 year in seconds
      includeSubDomains: true,
      preload: true,
    },
    frameguard: {
      action: "deny",
    },
    noSniff: true,
    referrerPolicy: {
      policy: "strict-origin-when-cross-origin",
    },
    xssFilter: true,
  }),
);

// SEC-012: Sentry request handler — must be before all other middleware
attachSentryHandlers(app);

// CORS por allowlist (CORS_ORIGINS) com credenciais; sem lista = só mesma origem, sem cabeçalhos CORS.
// Fica antes de sessão/CSRF para o preflight (OPTIONS) ser respondido sem exigir cookie nem token.
app.use(criarMiddlewareCors(ORIGENS_CORS));
// O POST de apontamentos do prestador carrega anexos em base64 (até ~21 MB) e usa parser próprio com
// limite maior, dentro da própria rota; todas as demais rotas seguem no limite padrão do express.json.
const jsonPadrao = express.json();
app.use((req, res, next) =>
  req.method === "POST" && req.path.replace(/\/+$/, "") === ROTA_POST_APONTAMENTOS ? next() : jsonPadrao(req, res, next),
);

// PERF-001: HTTP Response Compression
// Compresses responses larger than 1KB (typical threshold)
// Reduces ~500KB reports to ~50KB (90% reduction)
// Automatically handles gzip/deflate/brotli based on Accept-Encoding header
app.use(compression({ threshold: 1024 }));

// SEC-013: Session management BEFORE CSRF middleware (required for session-based tokens)
const sessionSecret = envVars.SESSION_SECRET || `default-secret-${process.env.NODE_ENV === "production" ? "CHANGE-ME" : "dev"}`;
if (sessionSecret.includes("CHANGE-ME")) {
  logger.warn("[CSRF] SESSION_SECRET não configurada em produção — CSRF não estará protegido adequadamente");
}
app.use(criarMiddlewareSession(sessionSecret));

// SEC-013: CSRF protection middleware
app.use(criarMiddlewareCSRF());

// SEC-013: Middleware para adicionar token CSRF em responses
app.use(adicionarTokenCSRFAoResponse);

// SEC-011: Request ID and structured logging middleware
app.use(requestIdMiddleware);

// Attach services to app context for use in routes
app.locals.authService = authService;
app.locals.auditService = auditService;
app.locals.permissoesService = permissoesService;
app.locals.paymentGuard = paymentGuard;
app.locals.db = db;
// Phase 9: Cache e Alertas
app.locals.cache = cache;
app.locals.enviarAlertaEmail = enviarAlertaEmail;
app.locals.enviarAlertaSlack = enviarAlertaSlack;
// Phase 13: Backup Scheduler
app.locals.backupScheduler = backupScheduler;

// Limite de requisições por IP — protege contra força bruta de itemId/accountId (agravaria o
// achado abaixo se não houvesse chave) e contra estourar a cota paga da API da Pluggy.
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 100 }));

/** Rotas de autenticação real (Fase 1) — POST /api/auth/login, GET /api/auth/me,
 * POST /api/auth/logout, POST /api/auth/bootstrap — mais a gestão do
 * sistema (Fase 2, reservada a titular/administrador): GET/PUT
 * /api/auth/permissoes (matriz de permissões configurável) e
 * POST /api/auth/usuarios (criar usuário de outro papel). Ver auth-routes.ts:
 * têm rate limit próprio (mais agressivo que o geral acima, só para login e
 * bootstrap) e herdam a mesma política de CORS já configurada acima —
 * nenhuma configuração de CORS adicional é feita para elas. */
app.use("/api/auth", criarRotasAuth({ authService, auditService, permissoesService }));

/** Setup Wizard — Fase 21: Configuração inicial da aplicação
 * POST   /api/setup-wizard/initialize — inicia assistente para nova plataforma
 * POST   /api/setup-wizard/:configId/step/:stepId — submete etapa com validação
 * GET    /api/setup-wizard/step/:stepId — obtém configuração da etapa
 * POST   /api/setup-wizard/:configId/complete — completa o assistente
 * GET    /api/setup-wizard/:configId/config — revisa configuração completa
 * GET    /api/setup-wizard/:configId/audit — histórico de auditoria
 * GET    /api/setup-wizard/status/:platform — verifica status de setup */
app.use("/api/setup-wizard", criarRotasSetupWizard({ db }));

/** Inbox de eventos externos (webhook da Asaas, captura do bot do Telegram) — ver
 * eventos-externos-routes.ts/eventos-externos-db.ts. O cliente consome por polling
 * porque o servidor não tem acesso ao banco local do navegador. */
app.use(
  "/api/eventos-externos",
  criarRotasEventosExternos({ authService, eventosService: eventosExternosService }),
);

/** Controle de acesso por recurso (ACL) — fase 13. Permite que titulares/administradores
 * concedam acesso a recursos específicos para usuários externos (inquilino, prestador).
 * Seguro por padrão: sem ACL, sem acesso (404). */
app.use("/api/acl", criarRotasAcl({ authService, auditService, db }));

/** Portal do inquilino: espelho de leitura publicado pelo dono (fase 14). Ver docs/PORTAL-INQUILINO-SERVIDOR.md. */
app.use("/api/portal", criarRotasPortal({ authService, auditService, db }));

/** Caixa de entrada de apontamentos do prestador (fila offline do PWA, fase 15). Ver docs/PWA-PRESTADOR.md. */
app.use("/api/prestador/apontamentos", criarRotasPrestadorApontamentos({ authService, auditService, db }));

/** Direitos do titular (LGPD): acesso aos próprios dados, trilha de acessos e anonimização da conta.
 * Operam sempre e só sobre o usuário autenticado; permitidas a papéis externos. */
app.use("/api/lgpd", criarRotasLgpd({ authService, auditService, db }));

/** Phase 22.18: Compliance & Regulatory Reporting
 * Multi-jurisdiction compliance for CRMT accounting system:
 * - SPED/ECF (Brazilian tax filing)
 * - LGPD (Brazilian data protection) and GDPR (European compliance)
 * - Audit trail with tamper detection and legal hold
 * - Tax compliance and reporting */
app.use("/api/compliance", criarRotasCompliance({ db }));

/** Carimbo de tempo RFC 3161 do selo de encerramento (o navegador não alcança a TSA por CORS). */
app.use("/api/carimbo-tempo", criarRotasCarimbo({ authService }));

/** Emissão de boleto/PIX via Asaas (aluguel e honorários advocatícios) — inclui o
 * webhook de confirmação de pagamento em /api/asaas/webhooks/asaas (sem
 * autenticação Bearer, validado por header próprio — ver asaas-routes.ts). */
app.use("/api/asaas", criarRotasAsaas({ authService, eventosService: eventosExternosService, db }));

/** Pagamentos PIX Proativos via Asaas Payments (fase 5) — permite iniciar pagamentos
 * PIX a fornecedores/prestadores com rastreamento e conciliação automática.
 * POST   /api/asaas/pagamentos-pix/criar — cria novo pagamento
 * GET    /api/asaas/pagamentos-pix/:id — retorna status + histórico
 * GET    /api/asaas/pagamentos-pix — lista com filtros
 * POST   /api/asaas/pagamentos-pix/:id/sincronizar — força sincronização manual */
app.use("/api/asaas", criarRotasAsaasPixProativo({ authService, db }));

/** Sincronização bancária pessoal via MeuPluggy (uso gratuito, paralelo ao fluxo
 * comercial de /api/accounts e /api/transactions acima) — ver pluggy-meu-routes.ts. */
app.use("/api/pluggy-meu", criarRotasPluggyMeu({ authService }));

/** Bot do Telegram para captura rápida (texto/foto) de documentos — inclui o
 * webhook do Telegram em /api/telegram/webhook (sem autenticação Bearer, validado
 * pelo header X-Telegram-Bot-Api-Secret-Token — ver telegram-routes.ts). */
app.use("/api/telegram", criarRotasTelegram({ authService, eventosService: eventosExternosService, db }));

/** Disparo de notificação (e-mail/WhatsApp/Telegram) para cobrança ou comunicado —
 * stateless: recebe os destinatários já resolvidos pelo cliente e só envia, não
 * grava nada (quem persiste o histórico é o próprio cliente, em notificacoes_enviadas
 * no banco local — ver notificacoes-routes.ts). */
app.use("/api/notificacoes", criarRotasNotificacoes({ authService }));

/** Agenda de lembretes de vencimento sincronizada pelo cliente (fase 5) — guarda a foto
 * completa que o cliente manda e serve a listagem de diagnóstico; o disparo de fato roda
 * no loop em segundo plano (`iniciarDisparoLembretesAgendados`, chamado acima), não aqui. */
app.use("/api/lembretes-agendados", criarRotasLembretesAgendados({ authService, service: lembretesAgendadosService }));

/** Relatórios de negócio (fase 6) — DRE (Demonstração de Resultado do Exercício)
 * com ambas opções: on-the-fly (real-time, cache 1h) e histórico (gravado 1x/dia).
 * GET /api/relatorios/dre — Opção A, on-the-fly
 * POST /api/relatorios/dre/calcular — Opção B, manual trigger ou scheduler
 * GET /api/relatorios/dre/historico — listagem periódica
 * GET /api/relatorios/dre/:ano/:mes — busca específica */
app.use("/api/relatorios", criarRotasRelatorios({ authService, db }));

/** Relatório Executivo Mensal (fase 4.2) — consolidação de KPIs, DRE, Fluxo, Margens,
 * Alertas em um documento para apresentação a gestor/executivo. Inclui:
 * GET  /api/relatorios/executivo/dashboard?mes=10&ano=2026 — JSON para UI
 * GET  /api/relatorios/executivo/download/:mes/:ano — HTML/PDF para download
 * POST /api/relatorios/executivo/gerar?mes=10&ano=2026 — trigger manual
 * POST /api/relatorios/executivo/enviar-email?mes=10&ano=2026&email=user@example.com — enviar por email */
app.use("/api/relatorios/executivo", criarRotasRelatorioExecutivo({ authService, db }));

/** Phase 22.20: Anthropic AI Integration — análise contábil com Claude
 * POST /api/ai/analyze-transaction — categoriza transação
 * POST /api/ai/categorize-receipt — analisa recibo com visão
 * POST /api/ai/detect-anomaly — detecta anomalias estatísticas
 * POST /api/ai/analyze-cash-flow — análise de fluxo de caixa
 * POST /api/ai/chat — chat interativo sobre finanças */
if (aiService) {
  app.use("/api/ai", criarRotasAI({ db, authService, aiService }));
  logger.info("[Server] AI routes mounted at /api/ai");
} else {
  logger.warn("[Server] AI service not available; /api/ai routes disabled");
}

/** Phase 22.20.3: Property Management System
 * CRUD for real estate properties with cost allocation, depreciation tracking, and ROI analysis
 * GET    /api/properties — list properties (with filters: tipoImovel, cidade, estado)
 * POST   /api/properties — create property
 * GET    /api/properties/:id — get property details
 * PUT    /api/properties/:id — update property
 * DELETE /api/properties/:id — delete property (soft)
 * Cost allocation: GET/POST /api/properties/:id/costs, GET /api/properties/:id/cost-summary
 * Depreciation: POST /api/properties/:id/depreciation/calculate, GET history/accumulated
 * ROI Analysis: POST /api/properties/:id/roi/calculate, GET roi */
app.use("/api/properties", criarRotasPropriedades({ db, authService, auditService }));
logger.info("[Server] Property Management routes mounted at /api/properties");

/** Phase 22.20.2: Advanced PDF Reports — geração de relatórios em PDF e exportação
 * POST /api/reports/balance-sheet — Gera Balanço Patrimonial (PDF)
 * POST /api/reports/income-statement — Gera DRE (PDF)
 * POST /api/reports/cash-flow — Gera Fluxo de Caixa (PDF)
 * POST /api/reports/real-estate — Gera Relatório de Propriedades (PDF)
 * POST /api/reports/export — Exporta em CSV, XLSX, XML
 * GET /api/reports/stats — Estatísticas de exportação */
const criarRotasReportsPDF = (await import('./routes/report-pdf-routes.js')).default;
app.use("/api/reports", criarRotasReportsPDF({ db, authService }));
logger.info("[Server] PDF Reports routes mounted at /api/reports");

/** Sugestão inteligente de categorias para transações (fase 2.3) — baseada em
 * histórico e padrões de keywords. POST /api/transacoes/:id/sugerir-categoria
 * retorna { categoria, confianca (0-100), motivo }. */
app.use("/api/transacoes", criarRotasTransacoes({ db, authService }));

/** Reconciliação automática PIX↔OFX (fase 8) — casa transações Asaas PIX com
 * extratos Pluggy OFX, detecta discrepâncias e gera lançamentos contábeis.
 * POST /api/conciliacao/reconciliar-agora — trigger manual
 * GET /api/conciliacao/status?dias=30 — estatísticas
 * GET /api/conciliacao/discrepancias?limite=50 — lista de discrepâncias */
app.use("/api/conciliacao", criarRotasConciliacaoPixOFX({ db, authService }));

/** Detecção de anomalias em fluxo de caixa (fase 4.1) — identifica transações anormais
 * usando 3 métodos estatísticos (2-Sigma, IQR, Percentile) com votação/consenso.
 * POST /api/anomalias/analisar/:transacaoId — análise manual de uma transação
 * GET /api/anomalias/alertas — lista alertas com filtros (severidade, dias, etc.)
 * GET /api/anomalias/estatisticas — estatísticas agregadas de anomalias
 * PATCH /api/anomalias/alertas/:id/revisar — marca alerta como revisado (auditoria) */
app.use("/api/anomalias", criarRotasAnomalias({ db, authService }));

/** Sistema de Agentes Econômicos - Fase 18 (CRUD de PF/PJ)
 * GET    /api/v1/agentes-economicos — lista agentes (paginado, filtrado)
 * POST   /api/v1/agentes-economicos — criar novo agente
 * GET    /api/v1/agentes-economicos/:id — buscar agente específico
 * PUT    /api/v1/agentes-economicos/:id — atualizar agente
 * DELETE /api/v1/agentes-economicos/:id — desativar agente (soft delete)
 * GET    /api/v1/agentes-economicos/:id/duplicatas — listar suspeitas de duplicata
 *
 * Suporta pessoas físicas (CPF) e jurídicas (CNPJ), com validação de duplicatas
 * usando Levenshtein distance. Incluição de agentes como tenants, fornecedores,
 * prestadores, partes legais, co-proprietários, devedores e credores. */
app.use("/api/v1/agentes-economicos", criarRotasAgentesEconomicos({
  db,
  authService,
  auditService,
}));

/** Importação de Documentos - Fase 1 (UPLOAD)
 * POST /api/importacao/upload — upload e validação de arquivo (PDF, CSV, OFX, JPEG, PNG)
 *
 * Validação:
 * - Extensão permitida (.ofx, .csv, .pdf, .jpg, .jpeg, .png)
 * - Tamanho máximo 50 MB
 * - MIME type válido
 * - Detecção de tipo por magic bytes
 *
 * Armazenamento:
 * - Cálculo de SHA-256 para deduplicação
 * - Metadados no banco (importacao_lotes)
 * - Status RECEBIDO após validação */
const uploadMiddleware = multer({ storage: multer.memoryStorage() });
app.use("/api/importacao", uploadMiddleware.single("arquivo"), criarRotasImportacaoUpload({ authService, db }));

/** OCR Document Extraction (fase 18)
 * GET /api/documentos/:id/extraction — fetch OCR results with confidence scores
 * POST /api/documentos/:id/approve — bulk approve extraction
 * POST /api/documentos/:id/reject — reject extraction with reason
 * POST /api/documentos/:id/fields/:fieldName/correct — correct individual field */
app.use("/api", criarRotasOCRDocumento({ authService, db }));

/** Backup automático para Google Drive (backup horário)
 * GET /api/backup/listar — lista backups no Google Drive
 * POST /api/backup/agora — executa backup manual imediato
 * POST /api/backup/restaurar/:fileId — restaura um backup específico
 * GET /api/backup/status — verifica status da configuração */
app.use("/api/backup", criarRotasBackup({ authService }));

/** Assinatura Digital + LGPD Compliance (fase 10)
 * POST /api/relatorios/desafio-2fa — envia desafio SMS (Ser Pro ID)
 * POST /api/relatorios/validar-2fa — valida código SMS
 * POST /api/relatorios/:id/assinar — assina relatório com Certisign A3
 * POST /api/gdpr/anonimizar-pessoa — anonimiza pessoa (direito ao esquecimento)
 * GET /api/gdpr/exportar-dados — exporta dados da pessoa (direito de acesso)
 * GET /api/auditoria/log-lgpd — obtém log de auditoria LGPD */
app.use("/api", criarRotasAssinaturasLGPD({
  authService,
  db,
  certisignApiKey: envVars.CERTISIGN_API_KEY || "test-key",
  serProIdApiKey: envVars.SERPROID_API_KEY || "test-key",
}));

/** Exige a mesma chave (X-API-Key) configurada no .env em toda rota de dados — CORS por si só
 * não protege nada aqui: é imposto pelo navegador, não pelo servidor, então qualquer chamada
 * feita fora de um navegador (curl, script) o ignora completamente. Sem essa checagem, quem
 * descobrisse a URL pública deste backend (ex: hospedado em Render/Railway) conseguiria listar
 * contas e transações de qualquer itemId/accountId que adivinhasse ou visse vazar em algum
 * lugar — sem credencial nenhuma (achado crítico de auditoria de segurança). */
function exigirChaveApi(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.header("X-API-Key") !== API_KEY) {
    res.status(401).json({ erro: "Chave de API ausente ou inválida" });
    return;
  }
  next();
}

/** Cria um Connect Token de curta duração para o widget do navegador abrir o
 * Pluggy Connect. O Client Secret nunca sai daqui — é por isso que este
 * endpoint existe em vez do app web chamar a Pluggy direto. */
app.post("/api/connect-token", exigirChaveApi, async (req, res) => {
  try {
    const { clientUserId } = req.body ?? {};
    const connectToken = await pluggy.createConnectToken(undefined, clientUserId ? { clientUserId } : undefined);
    req.logger.info("Connect token created", { clientUserId });
    res.json({ accessToken: connectToken.accessToken });
  } catch {
    req.logger.error("Erro ao criar connect token", erro instanceof Error ? erro : { error: String(erro) });
    res.status(500).json({ erro: "Falha ao criar connect token" });
  }
});

/** Lista as contas (banco e cartão) de um item já conectado. */
app.get("/api/accounts", exigirChaveApi, async (req, res) => {
  const itemId = req.query.itemId;
  if (typeof itemId !== "string") {
    req.logger.warn("itemId not provided");
    res.status(400).json({ erro: "itemId é obrigatório" });
    return;
  }
  try {
    const { results } = await pluggy.fetchAccounts(itemId);
    req.logger.info("Accounts fetched", { itemId, count: results.length });
    res.json(
      results.map((conta) => ({
        id: conta.id,
        nome: conta.marketingName ?? conta.name,
        numero: conta.number,
        tipo: conta.type,
        subtipo: conta.subtype,
        saldo: conta.balance,
      })),
    );
  } catch {
    req.logger.error("Erro ao buscar contas", erro instanceof Error ? erro : { error: String(erro) });
    res.status(500).json({ erro: "Falha ao buscar contas" });
  }
});

/** Busca todas as transações de uma conta no período, já normalizadas para o
 * formato que o app web importa (mesmo shape usado por OFX/CSV/PDF). */
app.get("/api/transactions", exigirChaveApi, async (req, res) => {
  const { accountId, from, to } = req.query;
  if (typeof accountId !== "string") {
    req.logger.warn("accountId not provided");
    res.status(400).json({ erro: "accountId é obrigatório" });
    return;
  }
  try {
    const transacoes = await pluggy.fetchAllTransactions(accountId, {
      dateFrom: typeof from === "string" ? from : undefined,
      dateTo: typeof to === "string" ? to : undefined,
    });
    req.logger.info("Transactions fetched", { accountId, count: transacoes.length, from, to });
    res.json(transacoes.map(normalizarTransacao));
  } catch {
    req.logger.error("Erro ao buscar transações", erro instanceof Error ? erro : { error: String(erro) });
    res.status(500).json({ erro: "Falha ao buscar transações" });
  }
});

/** Recebe eventos de ciclo de vida do item (item/created, item/updated,
 * item/error). Responde rápido (a Pluggy exige 2XX em até 5s) — o app web
 * hoje busca contas/transações sob demanda depois do onSuccess do widget,
 * então este endpoint é só um log por enquanto; fica pronto para acionar
 * uma sincronização em segundo plano no futuro.
 *
 * Autenticidade: a Pluggy chama esta URL diretamente (não é o navegador do
 * usuário), então não dá pra usar o header X-API-Key das outras rotas — em vez
 * disso, a própria URL registrada no dashboard da Pluggy carrega a chave como
 * query string (?key=...), conferida abaixo. Registre
 * "https://SEU-DOMINIO/api/webhooks/pluggy?key=SUA_API_KEY" no dashboard, não
 * a URL sem o parâmetro — sem isso, qualquer um que descubra a URL pode
 * enviar eventos forjados. */
app.post("/api/webhooks/pluggy", (req, res) => {
  if (req.query.key !== API_KEY) {
    req.logger.warn("Pluggy webhook unauthorized");
    res.status(401).json({ erro: "Chave de API ausente ou inválida" });
    return;
  }
  const evento = req.body;
  req.logger.info("Webhook Pluggy received", { event: evento?.event, itemId: evento?.itemId ?? evento?.eventId });
  res.status(200).json({ recebido: true });
});

/**
 * Health check endpoint — diagnostico completo de saúde do sistema
 * GET /api/health?leve=true — versão leve (só BD + memória, < 100ms)
 * GET /api/health — versão completa (inclui Asaas + Pluggy, < 500ms)
 *
 * Usado por: Kubernetes probes, monitoramento, dashboards de diagnóstico
 */
app.get("/api/health", async (_req, res) => {
  try {
    const usarLeve = _req.query.leve === "true";
    const saudeCompleta = usarLeve ? await executarHealthCheckLeve(db) : await executarHealthCheck(db);
    const statusHttp = saudeCompleta.status === "error" ? 503 : 200;
    _req.logger.info("[Health] Check executed", { leve: usarLeve, status: saudeCompleta.status });
    res.status(statusHttp).json(saudeCompleta);
  } catch {
    _req.logger.error("[Health] Erro ao executar health check", erro instanceof Error ? erro : { error: String(erro) });
    res.status(503).json({
      status: "error",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        database: { status: "error", mensagem: "Health check falhou" },
      },
    });
  }
});

/** Swagger API documentation (sem autenticação Bearer, apenas informativos). */
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(specs, {
  swaggerOptions: {
    urls: [
      {
        url: "/api-docs.json",
        name: "OpenAPI JSON",
      },
    ],
  },
}));

app.get("/api-docs.json", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(specs);
});

/**
 * OBS-001: Prometheus Metrics Endpoint
 * GET /metrics — exposes Prometheus metrics in text format
 * Used by: Prometheus scraper, monitoring dashboards, alerting
 * Includes:
 * - DB query latency histograms
 * - HTTP request latency and counts by route/method
 * - Error counts by type and severity
 * - Cache hit/miss ratios
 * - Active connections and queue sizes
 * - Transaction processing metrics
 */
app.get("/metrics", async (_req, res) => {
  try {
    const registry = getMetricsRegistry();
    res.set("Content-Type", registry.contentType);
    res.end(await registry.metrics());
  } catch {
    logger.error("[Metrics] Failed to expose metrics endpoint", error instanceof Error ? error : { error: String(error) });
    res.status(500).json({ erro: "Failed to generate metrics" });
  }
});

// SEC-013: CSRF error handler (must be before generic error handler)
app.use(erroCSRF);

/** Middleware de erro — precisa ser o ÚLTIMO app.use() (Express identifica middleware de erro
 * pela assinatura de 4 parâmetros). Sem isso, um erro não tratado (ex: JSON malformado
 * chegando em express.json(), que roda ANTES de exigirChaveApi em toda rota — alcançável sem
 * autenticação nenhuma) cai no handler padrão do Express, que em desenvolvimento (NODE_ENV
 * != "production", o padrão se a variável nunca for definida — confirmado empiricamente
 * nesta auditoria) devolve o stack trace COMPLETO no corpo da resposta, incluindo caminhos
 * absolutos do servidor — reconhecimento útil para quem for atacar, sem precisar da API_KEY
 * pra ver isso. Não depende de configurar NODE_ENV corretamente em cada lugar onde isto for
 * hospedado: sempre responde genérico, não importa o ambiente. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 4º parâmetro obrigatório: é só pela aridade que o Express reconhece isto como middleware de erro
app.use((erro: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error("Erro não tratado", erro instanceof Error ? erro : { error: String(erro) });
  const status = (erro as { status?: number; statusCode?: number })?.status ?? (erro as { statusCode?: number })?.statusCode ?? 500;
  res.status(status).json({ erro: "Requisição inválida ou falha interna." });
});

const server = app.listen(PORT, () => {
  logger.info("Servidor de integração Pluggy iniciado", { port: PORT, url: `http://localhost:${PORT}` });
  // Phase 9: Log dos serviços inicializados
  const cacheStats = cache.stats();
  logger.info("[Cache] Inicializado", { entradas: cacheStats.total });
  logger.info("[Alertas] Configuração", {
    email: envVars.ALERTS_EMAIL_PROVIDER || "none",
    slack: envVars.SLACK_WEBHOOK_URL ? "configurado" : "desabilitado",
  });
});

// Graceful shutdown - close database connection
process.on("SIGTERM", () => {
  logger.warn("[Server] SIGTERM received, closing server...");
  cache.limpar(); // Limpa cache em memória
  server.close(() => {
    closeDatabase();
    logger.info("[Server] Server closed gracefully");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  logger.warn("[Server] SIGINT received, closing server...");
  cache.limpar(); // Limpa cache em memória
  server.close(() => {
    closeDatabase();
    logger.info("[Server] Server closed gracefully");
    process.exit(0);
  });
});
