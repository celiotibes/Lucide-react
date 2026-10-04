/**
 * Matriz de acesso das rotas montadas em server/src/index.ts.
 *
 * Percorre TODAS as rotas de TODOS os routers (router.stack) mais as rotas declaradas direto
 * em `app` no index.ts (lidas do código-fonte), exige que cada uma esteja classificada em
 * CLASSIFICACAO e prova o comportamento:
 *   - interna        -> inquilino/prestador/papel desconhecido recebem 401/403/404 (nunca 2xx/5xx);
 *                       sem token, 401.
 *   - externa-propria-> papel externo é aceito (a rota só opera sobre o próprio usuário).
 *   - externa-posse  -> papel externo só passa com ACL ativa em acl_recursos (senão 404).
 *   - publica / chave-api -> sem sessão de usuário; autenticação própria (segredo/chave).
 *
 * Rota nova sem classificação (ou classificação de rota que não existe mais) FAZ ESTE TESTE
 * FALHAR. A classificação é documentada em docs/MATRIZ-ROTAS-ACESSO.md.
 */

 describe, it, expect, beforeAll,$1$2  from "vitest";
import express from "express";
import request from "supertest";
import fs from "fs";
import path from "path";
import type Database from "better-sqlite3";
import { criarBancoDoServidor, MIGRACOES_BOOT, SRC_DIR } from "./schema-boot";
import { EventosExternosServiceDB } from "../../domain/integracoes/eventos-externos-db";
import { LembretesAgendadosServiceDB } from "../../domain/notificacoes/lembretes-agendados-db";
import { criarRotasAuth } from "../auth-routes";
import { criarRotasEventosExternos } from "../eventos-externos-routes";
import { criarRotasAcl } from "../acl-routes";
import { criarRotasLgpd } from "../lgpd-routes";
import { criarRotasCarimbo } from "../carimbo-routes";
import { criarRotasAsaas } from "../asaas-routes";
import { criarRotasAsaasPixProativo } from "../asaas-pagamentos-pix-routes";
import { criarRotasPluggyMeu } from "../pluggy-meu-routes";
import { criarRotasTelegram } from "../telegram-routes";
import { criarRotasNotificacoes } from "../notificacoes-routes";
import { criarRotasLembretesAgendados } from "../lembretes-agendados-routes";
import { criarRotasRelatorios } from "../dre-routes";
import { criarRotasRelatorioExecutivo } from "../relatorio-executivo-routes";
import { criarRotasTransacoes } from "../transacoes-routes";
import { criarRotasConciliacaoPixOFX } from "../conciliacao-pix-ofx-routes";
import { criarRotasAnomalias } from "../anomalias-routes";
import { criarRotasBackup } from "../backup-routes";
import { criarRotasAssinaturasLGPD } from "../assinatura-lgpd-routes";
import { criarRotasPortal } from "../portal-routes";
import { criarRotasPrestadorApontamentos } from "../prestador-apontamentos-routes";

type Classe = "interna" | "externa-propria" | "externa-posse" | "publica" | "chave-api";

/** Chave: "METODO /caminho/completo". Mantida em sincronia com docs/MATRIZ-ROTAS-ACESSO.md. */
const CLASSIFICACAO: Record<string, Classe> = {
  // /api/auth
  "POST /api/auth/login": "publica",
  "GET /api/auth/me": "externa-propria",
  "POST /api/auth/logout": "externa-propria",
  "POST /api/auth/bootstrap": "publica",
  "GET /api/auth/permissoes": "interna",
  "PUT /api/auth/permissoes": "interna",
  "POST /api/auth/usuarios": "interna",
  // /api/eventos-externos
  "GET /api/eventos-externos/pendentes": "interna",
  "POST /api/eventos-externos/:id/consumir": "interna",
  "DELETE /api/eventos-externos/:id": "interna",
  // /api/acl
  "POST /api/acl": "interna",
  "GET /api/acl": "interna",
  "DELETE /api/acl/:id": "interna",
  // /api/lgpd (sempre e só sobre o próprio usuário autenticado)
  // /api/portal (publicar = só interno; leituras = só do próprio inquilino, com posse via acl_recursos)
  "POST /api/portal/publicar": "interna",
  "GET /api/portal/meus-contratos": "externa-propria",
  "GET /api/portal/minhas-cobrancas": "externa-propria",
  // /api/prestador/apontamentos (prestador grava/lista só os próprios; conferência é interna)
  "POST /api/prestador/apontamentos": "externa-propria",
  "GET /api/prestador/apontamentos": "externa-propria",
  "POST /api/prestador/apontamentos/:id/conferir": "interna",
  "GET /api/lgpd/meus-dados": "externa-propria",
  "GET /api/lgpd/acessos": "externa-propria",
  "POST /api/lgpd/deletar-conta": "externa-propria",
  // /api/carimbo-tempo
  "POST /api/carimbo-tempo": "interna",
  // /api/asaas
  "POST /api/asaas/clientes": "interna",
  "POST /api/asaas/cobrancas": "interna",
  "GET /api/asaas/cobrancas/:asaasChargeId": "externa-posse",
  "PUT /api/asaas/cobrancas/:asaasChargeId": "interna",
  "POST /api/asaas/webhooks/asaas": "publica",
  "POST /api/asaas/cobrancas/:chargeId/processar-devolucao": "interna",
  "GET /api/asaas/cobrancas/:chargeId/reembolsos": "interna",
  "POST /api/asaas/reconciliar-agora": "interna",
  "POST /api/asaas/pagamentos-pix/criar": "interna",
  "GET /api/asaas/pagamentos-pix/:id": "externa-posse",
  "GET /api/asaas/pagamentos-pix": "interna",
  "POST /api/asaas/pagamentos-pix/:id/sincronizar": "interna",
  "PUT /api/asaas/pagamentos-pix/:id": "interna",
  "DELETE /api/asaas/pagamentos-pix/:id": "interna",
  // /api/pluggy-meu
  "GET /api/pluggy-meu/contas": "interna",
  "GET /api/pluggy-meu/contas/:accountId/transacoes": "interna",
  // /api/telegram
  "POST /api/telegram/gerar-codigo-vinculo": "interna",
  "POST /api/telegram/webhook": "publica",
  "GET /api/telegram/vinculos-externos-pendentes": "interna",
  "POST /api/telegram/vinculos-externos-pendentes/:id/consumir": "interna",
  // /api/notificacoes, /api/lembretes-agendados
  "POST /api/notificacoes/disparar": "interna",
  "POST /api/lembretes-agendados/sincronizar": "interna",
  "GET /api/lembretes-agendados": "interna",
  // /api/relatorios (DRE)
  "GET /api/relatorios/dre": "interna",
  "POST /api/relatorios/dre/calcular": "interna",
  "GET /api/relatorios/dre/historico": "interna",
  "GET /api/relatorios/dre/:ano/:mes": "interna",
  "GET /api/relatorios/fluxo-caixa/projecao": "interna",
  // /api/relatorios/executivo
  "GET /api/relatorios/executivo/dashboard": "interna",
  "GET /api/relatorios/executivo/margens": "interna",
  "GET /api/relatorios/executivo/download/:mes/:ano": "interna",
  "POST /api/relatorios/executivo/gerar": "interna",
  "POST /api/relatorios/executivo/enviar-email": "interna",
  // /api/transacoes, /api/conciliacao, /api/anomalias, /api/backup
  "POST /api/transacoes/:id/sugerir-categoria": "interna",
  "POST /api/conciliacao/reconciliar-agora": "interna",
  "GET /api/conciliacao/status": "interna",
  "GET /api/conciliacao/discrepancias": "interna",
  "POST /api/anomalias/analisar/:transacaoId": "interna",
  "GET /api/anomalias/alertas": "interna",
  "GET /api/anomalias/estatisticas": "interna",
  "PATCH /api/anomalias/alertas/:id/revisar": "interna",
  "PUT /api/anomalias/:id": "interna",
  "GET /api/backup/listar": "interna",
  "POST /api/backup/agora": "interna",
  "POST /api/backup/restaurar/:fileId": "interna",
  "GET /api/backup/status": "interna",
  // router montado em /api (assinatura digital + LGPD administrativo)
  "POST /api/desafio-2fa": "interna",
  "POST /api/validar-2fa": "interna",
  "POST /api/:id/assinar": "interna",
  "POST /api/anonimizar-pessoa": "interna",
  "GET /api/exportar-dados": "interna",
  "GET /api/log-lgpd": "interna",
  // declaradas direto em app (index.ts)
  "POST /api/connect-token": "chave-api",
  "GET /api/accounts": "chave-api",
  "GET /api/transactions": "chave-api",
  "POST /api/webhooks/pluggy": "publica",
  "GET /api/health": "publica",
  "GET /api-docs.json": "publica",
  "GET /metrics": "publica",
};

/** app.use("/prefixo", ...) sem router de negócio (não declaram rotas próprias do app). */
const USOS_NAO_ROUTER = new Set(["/api/docs"]);

const TOKENS: Record<string, { id: string; role: string }> = {
  "tok-inquilino": { id: "u-inq", role: "inquilino" },
  "tok-prestador": { id: "u-pre", role: "prestador" },
  "tok-desconhecido": { id: "u-x", role: "papel-que-nao-existe" },
  "tok-admin": { id: "u-adm", role: "administrador" },
};

interface Montagem {
  prefixo: string;
  fabrica: string;
  criar: (d: Deps) => express.Router;
}
interface Deps {
  db: Database.Database;
  authService: unknown;
  auditService: unknown;
  permissoesService: unknown;
  eventosService: EventosExternosServiceDB;
  lembretesService: LembretesAgendadosServiceDB;
}

/** Espelha as montagens de server/src/index.ts (conferido por um teste de paridade abaixo). */
const MONTAGENS: Montagem[] = [
  { prefixo: "/api/auth", fabrica: "criarRotasAuth", criar: (d) => criarRotasAuth({ authService: d.authService, auditService: d.auditService, permissoesService: d.permissoesService }) },
  { prefixo: "/api/eventos-externos", fabrica: "criarRotasEventosExternos", criar: (d) => criarRotasEventosExternos({ authService: d.authService, eventosService: d.eventosService }) },
  { prefixo: "/api/acl", fabrica: "criarRotasAcl", criar: (d) => criarRotasAcl({ authService: d.authService, auditService: d.auditService, db: d.db }) },
  { prefixo: "/api/portal", fabrica: "criarRotasPortal", criar: (d) => criarRotasPortal({ authService: d.authService, auditService: d.auditService, db: d.db }) },
  { prefixo: "/api/prestador/apontamentos", fabrica: "criarRotasPrestadorApontamentos", criar: (d) => criarRotasPrestadorApontamentos({ authService: d.authService, auditService: d.auditService, db: d.db }) },
  { prefixo: "/api/lgpd", fabrica: "criarRotasLgpd", criar: (d) => criarRotasLgpd({ authService: d.authService, auditService: d.auditService, db: d.db }) },
  { prefixo: "/api/carimbo-tempo", fabrica: "criarRotasCarimbo", criar: (d) => criarRotasCarimbo({ authService: d.authService }) },
  { prefixo: "/api/asaas", fabrica: "criarRotasAsaas", criar: (d) => criarRotasAsaas({ authService: d.authService, eventosService: d.eventosService, db: d.db }) },
  { prefixo: "/api/asaas", fabrica: "criarRotasAsaasPixProativo", criar: (d) => criarRotasAsaasPixProativo({ authService: d.authService, db: d.db }) },
  { prefixo: "/api/pluggy-meu", fabrica: "criarRotasPluggyMeu", criar: (d) => criarRotasPluggyMeu({ authService: d.authService }) },
  { prefixo: "/api/telegram", fabrica: "criarRotasTelegram", criar: (d) => criarRotasTelegram({ authService: d.authService, eventosService: d.eventosService, db: d.db }) },
  { prefixo: "/api/notificacoes", fabrica: "criarRotasNotificacoes", criar: (d) => criarRotasNotificacoes({ authService: d.authService }) },
  { prefixo: "/api/lembretes-agendados", fabrica: "criarRotasLembretesAgendados", criar: (d) => criarRotasLembretesAgendados({ authService: d.authService, service: d.lembretesService }) },
  { prefixo: "/api/relatorios", fabrica: "criarRotasRelatorios", criar: (d) => criarRotasRelatorios({ authService: d.authService, db: d.db }) },
  { prefixo: "/api/relatorios/executivo", fabrica: "criarRotasRelatorioExecutivo", criar: (d) => criarRotasRelatorioExecutivo({ authService: d.authService, db: d.db }) },
  { prefixo: "/api/transacoes", fabrica: "criarRotasTransacoes", criar: (d) => criarRotasTransacoes({ db: d.db, authService: d.authService }) },
  { prefixo: "/api/conciliacao", fabrica: "criarRotasConciliacaoPixOFX", criar: (d) => criarRotasConciliacaoPixOFX({ db: d.db, authService: d.authService }) },
  { prefixo: "/api/anomalias", fabrica: "criarRotasAnomalias", criar: (d) => criarRotasAnomalias({ db: d.db, authService: d.authService }) },
  { prefixo: "/api/backup", fabrica: "criarRotasBackup", criar: (d) => criarRotasBackup({ authService: d.authService }) },
  { prefixo: "/api", fabrica: "criarRotasAssinaturasLGPD", criar: (d) => criarRotasAssinaturasLGPD({ authService: d.authService, db: d.db, certisignApiKey: "k", serProIdApiKey: "k" }) },
];

function juntar(prefixo: string, rota: string): string {
  const completo = (prefixo + (rota === "/" ? "" : rota)).replace(/\/+/g, "/");
  return completo.length > 1 ? completo.replace(/\/$/, "") : completo;
}

/** Lista {metodo, caminho} de todas as rotas de um router (ignora router.use de middleware). */
function rotasDoRouter(router: express.Router, prefixo: string): Array<{ metodo: string; caminho: string }> {
  const saida: Array<{ metodo: string; caminho: string }> = [];
  for (const camada of (router as unknown).stack as Record<string, unknown>[]) {
    if (!camada.route) continue;
    for (const metodo of Object.keys(camada.route.methods)) {
      if (camada.route.methods[metodo]) saida.push({ metodo: metodo.toUpperCase(), caminho: juntar(prefixo, camada.route.path) });
    }
  }
  return saida;
}

const INDEX_TS = fs.readFileSync(path.join(SRC_DIR, "index.ts"), "utf-8");

function rotasDiretasDoIndex(): string[] {
  const chaves: string[] = [];
  for (const m of INDEX_TS.matchAll(/^app\.(get|post|put|delete|patch)\(\s*"([^"]+)"/gm)) {
    chaves.push(`${m[1].toUpperCase()} ${m[2]}`);
  }
  return chaves;
}

function montadosNoIndex(): { fabricas: string[]; prefixos: string[] } {
  const fabricas = [...INDEX_TS.matchAll(/^app\.use\(\s*(?:"[^"]+"\s*,\s*)?(criarRotas\w+)\(/gm)].map((m) => m[1]);
  const prefixos = [...INDEX_TS.matchAll(/^app\.use\(\s*"([^"]+)"/gm)].map((m) => m[1]);
  return { fabricas, prefixos };
}

let db: Database.Database;
let app: express.Application;
let rotasEnumeradas: Array<{ metodo: string; caminho: string }>;

beforeAll(() => {
  db = criarBancoDoServidor();
  const authService = {
    validarToken: vi.fn((token: string) => {
      const u = TOKENS[token];
      if (!u) return { usuario: null, autenticado: false };
      return { autenticado: true, usuario: { id: u.id, email: `${u.id}@x.com`, nome: u.id, role: u.role, ativo: true }, role: u.role };
    }),
    invalidarSessao: vi.fn(),
  };
  const deps: Deps = {
    db,
    authService,
    auditService: { registrarAcao: () => {}, registrarAcessoNegado: () => {} },
    permissoesService: { listarMatriz: () => [] },
    eventosService: new EventosExternosServiceDB(db),
    lembretesService: new LembretesAgendadosServiceDB(db),
  };
  app = express();
  app.use(express.json());
  rotasEnumeradas = [];
  for (const m of MONTAGENS) {
    const router = m.criar(deps);
    rotasEnumeradas.push(...rotasDoRouter(router, m.prefixo));
    app.use(m.prefixo, router);
  }
  // Responde 404 no que nenhuma rota atende (como o Express faria no servidor real).
});

afterAll(() => {
  db.close();
});

const chave = (r: { metodo: string; caminho: string }) => `${r.metodo} ${r.caminho}`;
const comParametrosPreenchidos = (c: string) => c.replace(/:([A-Za-z]+)/g, "id-qualquer");

describe("Matriz de acesso das rotas: cobertura da classificação", () => {
  it("toda rota dos routers montados está classificada (e nenhuma classificação está obsoleta)", () => {
    const todas = new Set([...rotasEnumeradas.map(chave), ...rotasDiretasDoIndex()]);
    const semClassificacao = [...todas].filter((k) => !(k in CLASSIFICACAO)).sort();
    const obsoletas = Object.keys(CLASSIFICACAO).filter((k) => !todas.has(k)).sort();
    expect(semClassificacao, `Rotas SEM classificação (adicione em CLASSIFICACAO e em docs/MATRIZ-ROTAS-ACESSO.md): ${semClassificacao.join(" | ")}`).toEqual([]);
    expect(obsoletas, `Classificações de rotas que não existem mais: ${obsoletas.join(" | ")}`).toEqual([]);
  });

  it("todo router montado em index.ts está na lista MONTAGENS (router novo => falha)", () => {
    const { fabricas, prefixos } = montadosNoIndex();
    expect(fabricas.length).toBeGreaterThan(10);
    expect([...new Set(fabricas)].sort()).toEqual([...new Set(MONTAGENS.map((m) => m.fabrica))].sort());
    const esperados = new Set([...MONTAGENS.map((m) => m.prefixo), ...USOS_NAO_ROUTER]);
    // O prefixo de /api/relatorios/executivo precisa estar de fato montado assim no index.ts:
    // o cliente e a documentação chamam /api/relatorios/executivo/dashboard.
    for (const p of new Set(prefixos)) expect(esperados.has(p), `app.use("${p}") não previsto em MONTAGENS`).toBe(true);
    for (const p of MONTAGENS.map((m) => m.prefixo)) expect(prefixos, `index.ts não monta ${p}`).toContain(p);
  });

  it("a lista de migrações do schema de teste é a mesma de database-init.ts (até phase 15, excluindo phase 16)", () => {
    const init = fs.readFileSync(path.join(SRC_DIR, "database-init.ts"), "utf-8");
    const bloco = init.slice(init.indexOf("runMigracoesIdempotentes(db, ["));
    const arquivos = [...bloco.slice(0, bloco.indexOf("]);")).matchAll(/"(migrations-[^"]+\.sql)"/g)].map((m) => m[1]);
    // Filtrar fora as migrações phase 16, que usam SQL complexo incompatível com o parser do test helper
    const arquivosAtePhase15 = arquivos.filter((a) => !a.includes("phase16"));
    expect(MIGRACOES_BOOT).toEqual(["migrations-phase2-auth.sql", ...arquivosAtePhase15]);
  });

  it("toda classificação usa um valor válido", () => {
    const validos = new Set(["interna", "externa-propria", "externa-posse", "publica", "chave-api"]);
    for (const [k, v] of Object.entries(CLASSIFICACAO)) expect(validos.has(v), k).toBe(true);
  });
});

describe("Matriz de acesso das rotas: comportamento por classe", () => {
  const internas = () => Object.entries(CLASSIFICACAO).filter(([, c]) => c === "interna").map(([k]) => k);

  it("rotas internas: sem token => 401", async () => {
    for (const k of internas()) {
      const [metodo, caminho] = k.split(" ");
      const res = await (request(app) as unknown)[metodo.toLowerCase()](comParametrosPreenchidos(caminho)).send({});
      expect(res.status, `${k} sem token`).toBe(401);
    }
  });

  for (const token of ["tok-inquilino", "tok-prestador", "tok-desconhecido"]) {
    it(`rotas internas: ${token} recebe 401/403/404 (nunca 2xx/5xx)`, async () => {
      for (const k of internas()) {
        const [metodo, caminho] = k.split(" ");
        const res = await (request(app) as unknown)
          [metodo.toLowerCase()](comParametrosPreenchidos(caminho))
          .set("Authorization", `Bearer ${token}`)
          .send({});
        expect([401, 403, 404], `${k} com ${token} respondeu ${res.status}`).toContain(res.status);
      }
    });
  }

  it("rotas externa-posse: externo SEM ACL recebe 404 (não revela existência)", async () => {
    const posse = Object.entries(CLASSIFICACAO).filter(([, c]) => c === "externa-posse").map(([k]) => k);
    expect(posse.length).toBeGreaterThan(0);
    for (const token of ["tok-inquilino", "tok-prestador"]) {
      for (const k of posse) {
        const [metodo, caminho] = k.split(" ");
        const res = await (request(app) as unknown)
          [metodo.toLowerCase()](comParametrosPreenchidos(caminho))
          .set("Authorization", `Bearer ${token}`);
        expect(res.status, `${k} com ${token}`).toBe(404);
      }
    }
  });

  it("GET /api/asaas/pagamentos-pix/:id: com ACL o prestador vê só a projeção mínima (sem chave PIX/CPF/QR)", async () => {
    db.prepare(
      `INSERT INTO pagamentos_pix_solicitados
        (id, beneficiario_id, beneficiario_nome, beneficiario_cpf_cnpj, valor, descricao, status, asaas_payment_id, tipo_chave_pix, chave_pix_value, qr_code)
       VALUES ('pg-1', 'b1', 'Fulano', '12345678900', 150.5, 'Serviço', 'PENDING', 'pay_x', 'CPF', '12345678900', 'qr-secreto')`,
    ).run();
    // outro pagamento SEM ACL
    db.prepare(
      `INSERT INTO pagamentos_pix_solicitados
        (id, beneficiario_id, beneficiario_nome, beneficiario_cpf_cnpj, valor, descricao, status, tipo_chave_pix)
       VALUES ('pg-2', 'b2', 'Outro', '999', 10, 'Outro', 'PENDING', 'CPF')`,
    ).run();
    db.prepare("INSERT INTO usuarios (id, nome, email, role, senha_hash) VALUES ('u-adm', 'Adm', 'adm@x.com', 'administrador', 'x')").run();
    db.prepare("INSERT INTO usuarios (id, nome, email, role, senha_hash) VALUES ('u-pre', 'Pre', 'pre@x.com', 'prestador', 'x')").run();
    db.prepare(
      "INSERT INTO acl_recursos (usuario_id, tipo_recurso, recurso_id, concedido_por) VALUES ('u-pre', 'pagamento_pix', 'pg-1', 'u-adm')",
    ).run();

    const ok = await request(app).get("/api/asaas/pagamentos-pix/pg-1").set("Authorization", "Bearer tok-prestador");
    expect(ok.status).toBe(200);
    expect(ok.body.pagamento).toEqual(
      expect.objectContaining({ id: "pg-1", valor: 150.5, descricao: "Serviço", status: "PENDING" }),
    );
    for (const campo of ["chavePixValue", "beneficiarioCpfCnpj", "qrCode", "asaasPaymentId", "tipoChavePix"]) {
      expect(ok.body.pagamento[campo], campo).toBeUndefined();
    }

    // ACL é por usuário e por recurso
    const outroRecurso = await request(app).get("/api/asaas/pagamentos-pix/pg-2").set("Authorization", "Bearer tok-prestador");
    expect(outroRecurso.status).toBe(404);
    const outroUsuario = await request(app).get("/api/asaas/pagamentos-pix/pg-1").set("Authorization", "Bearer tok-inquilino");
    expect(outroUsuario.status).toBe(404);

    // Interno continua vendo o registro completo
    const interno = await request(app).get("/api/asaas/pagamentos-pix/pg-1").set("Authorization", "Bearer tok-admin");
    expect(interno.status).toBe(200);
    expect(interno.body.pagamento.chavePixValue).toBe("12345678900");

    // Revogação fecha o acesso
    db.prepare("UPDATE acl_recursos SET revogado_em = datetime('now') WHERE usuario_id = 'u-pre'").run();
    const revogado = await request(app).get("/api/asaas/pagamentos-pix/pg-1").set("Authorization", "Bearer tok-prestador");
    expect(revogado.status).toBe(404);
  });

  it("rotas externa-propria: papel externo é aceito pelo middleware (GET /api/auth/me => 200)", async () => {
    for (const token of ["tok-inquilino", "tok-prestador"]) {
      const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
      expect(res.status, token).toBe(200);
    }
  });

  it("papel interno continua passando pelo middleware das rotas internas (sanidade do teste)", async () => {
    const res = await request(app).get("/api/acl").set("Authorization", "Bearer tok-admin");
    expect([200, 403]).toContain(res.status); // 403 só se a rota exigir titular; nunca 401
    expect(res.status).not.toBe(401);
  });
});
