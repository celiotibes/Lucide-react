/**
 * Apontamentos do prestador — lado servidor da fila offline do PWA (docs/PWA-PRESTADOR.md).
 *
 *  POST /api/prestador/apontamentos              papel prestador; idempotente por (usuário, uuid); auditado
 *  GET  /api/prestador/apontamentos              papel prestador; só os próprios; paginado
 *  POST /api/prestador/apontamentos/:id/conferir papéis internos; só marca o status e audita
 *
 * O prestador NÃO grava no razão: o registro entra com status 'recebido' e o dono confere depois.
 * A integração ao ledger fica fora deste módulo. A identidade vem SEMPRE da sessão, nunca do payload.
 *
 * Idempotência: reenvio do mesmo uuid com conteúdo idêntico -> 200 com o mesmo id; conteúdo diferente
 * para o mesmo uuid -> 409. O uuid é único POR USUÁRIO, então um prestador não colide com (nem descobre)
 * o uuid de outro. Leitura de registro alheio responde 404 (nunca 403).
 *
 * Anexos: JSON com `conteudoBase64`; até 3 por apontamento, 5 MB por arquivo (decodificado) e 15 MB no
 * total. O sha256 é recalculado no servidor (e, se informado, precisa conferir). Minimização (LGPD): sem
 * observações livres nem geolocalização; o conteúdo dos anexos nunca é devolvido nas listagens.
 */
import { createHash } from "node:crypto";
import express from "express";
import { z } from "zod";
import type Database from "better-sqlite3";
import { logger } from '../services/logger-service.js';
import type { AuthServiceDB } from "../domain/auth/auth-service-db.js";
import type { AuditTrailServiceDB } from "../domain/auth/audit-trail-db.js";
import type { ContextoAutenticacao } from "../domain/auth/auth-service.js";
import { criarMiddlewareAutenticacao } from "./auth-routes.js";

export interface PrestadorApontamentosDeps {
  authService: AuthServiceDB;
  auditService: AuditTrailServiceDB;
  db: Database.Database;
}

/** Caminho completo do POST de criação (o index.ts o exclui do parser JSON global de 100 KB). */
export const ROTA_POST_APONTAMENTOS = "/api/prestador/apontamentos";

export const LIMITE_ANEXO_BYTES = 5 * 1024 * 1024;
export const LIMITE_TOTAL_ANEXOS_BYTES = 15 * 1024 * 1024;
export const MAX_ANEXOS = 3;
/** base64 de 5 MB + folga; corpo total: 15 MB -> ~20 MB em base64 + metadados. */
const LIMITE_CORPO = "21mb";
const LIMITE_BASE64_CHARS = Math.ceil(LIMITE_ANEXO_BYTES / 3) * 4;

const PAPEIS_INTERNOS = ["titular", "administrador", "contador", "perito", "advogado", "economista"];
const TIPOS_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"] as const;
const LIMITE_CENTAVOS = 10_000_000_000;

const dataIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "data deve ser YYYY-MM-DD")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), "data inexistente");

const esquemaAnexo = z
  .object({
    nome: z.string().trim().min(1).max(200),
    tipo: z.enum(TIPOS_MIME),
    conteudoBase64: z.string().min(4).max(LIMITE_BASE64_CHARS).regex(/^[A-Za-z0-9+/]+={0,2}$/, "conteudoBase64 inválido"),
    sha256: z.string().regex(/^[0-9a-f]{64}$/i, "sha256 deve ter 64 hex").optional(),
  })
  .strict();

export const esquemaApontamento = z
  .object({
    uuid: z.string().regex(/^[0-9a-zA-Z_-]{8,64}$/, "uuid inválido (8-64 caracteres: letras, números, _ e -)"),
    tipo: z.enum(["servico", "vistoria"]),
    imovelRef: z.string().trim().min(1).max(100),
    servico: z.string().trim().min(3).max(200),
    data: dataIso,
    horasMinutos: z.number().int().min(1).max(1440).optional(),
    valorCentavos: z.number().int().min(0).max(LIMITE_CENTAVOS).optional(),
    anexos: z.array(esquemaAnexo).max(MAX_ANEXOS).default([]),
  })
  .strict();

const esquemaConferencia = z
  .object({
    status: z.enum(["conferido", "rejeitado"]),
    motivo: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .refine((c) => c.status !== "rejeitado" || !!c.motivo, { message: "motivo é obrigatório ao rejeitar", path: ["motivo"] });

interface AnexoProcessado {
  nome: string;
  tipo: string;
  tamanho: number;
  sha256: string;
  conteudo: Buffer;
}

/** Remove separadores de caminho e caracteres de controle do nome do arquivo. */
function sanitizarNome(nome: string): string {
  // eslint-disable-next-line no-control-regex
  const limpo = nome.replace(/[\\/\u0000-\u001f\u007f]/g, "_").replace(/^\.+/, "_").trim();
  return limpo.slice(0, 120) || "anexo";
}

function hashConteudo(p: z.infer<typeof esquemaApontamento>, anexos: AnexoProcessado[]): string {
  const metas = anexos
    .map((a) => ({ nome: a.nome, tipo: a.tipo, tamanho: a.tamanho, sha256: a.sha256 }))
    .sort((a, b) => a.sha256.localeCompare(b.sha256) || a.nome.localeCompare(b.nome));
  return createHash("sha256")
    .update(
      JSON.stringify({
        tipo: p.tipo,
        imovelRef: p.imovelRef,
        servico: p.servico,
        data: p.data,
        horasMinutos: p.horasMinutos ?? null,
        valorCentavos: p.valorCentavos ?? null,
        anexos: metas,
      }),
    )
    .digest("hex");
}

function paginacao(query: express.Request["query"]): { limite: number; offset: number } | null {
  const ler = (v: unknown, padrao: number): number | null => {
    if (v === undefined) return padrao;
    if (typeof v !== "string" || !/^\d{1,6}$/.test(v)) return null;
    return Number(v);
  };
  const limite = ler(query.limite, 20);
  const offset = ler(query.offset, 0);
  if (limite === null || offset === null || limite < 1 || limite > 100) return null;
  return { limite, offset };
}

type Resultado = { codigo: 200 | 201 | 409; corpo: Record<string, unknown> };

const COLUNAS = `a.id, a.uuid_cliente AS uuid, a.tipo, a.imovel_ref AS imovelRef, a.servico, a.data_servico AS data,
  a.horas_minutos AS horasMinutos, a.valor_centavos AS valorCentavos, a.status, a.recebido_em AS recebidoEm`;

export function criarRotasPrestadorApontamentos({ authService, auditService, db }: PrestadorApontamentosDeps): express.Router {
  const router = express.Router();
  const exigirAutenticacao = criarMiddlewareAutenticacao(authService, { permitirPapeisExternos: true });

  function exigirPrestador(req: express.Request, res: express.Response, next: express.NextFunction): void {
    const contexto = req.auth as ContextoAutenticacao;
    if (contexto.usuario?.role !== "prestador") {
      auditService.registrarAcessoNegado(contexto, "prestador_apontamento", `${req.method} ${req.path}`, "papel não é prestador");
      res.status(403).json({ erro: "Sem permissão para esta operação" });
      return;
    }
    next();
  }

  function exigirInterno(req: express.Request, res: express.Response, next: express.NextFunction): void {
    const contexto = req.auth as ContextoAutenticacao;
    if (!PAPEIS_INTERNOS.includes(contexto.usuario?.role ?? "")) {
      auditService.registrarAcessoNegado(contexto, "prestador_apontamento", `${req.method} ${req.path}`, "papel externo não confere");
      res.status(403).json({ erro: "Sem permissão para esta operação" });
      return;
    }
    next();
  }

  const parserCriacao = express.json({ limit: LIMITE_CORPO });

  router.post("/", exigirAutenticacao, exigirPrestador, parserCriacao, (req, res) => {
    const contexto = req.auth as ContextoAutenticacao;
    const usuarioId = contexto.usuario!.id;

    const parse = esquemaApontamento.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({
        erro: "Payload inválido",
        detalhes: parse.error.issues.map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`),
      });
    }
    const p = parse.data;

    const anexos: AnexoProcessado[] = [];
    let total = 0;
    for (const [i, a] of p.anexos.entries()) {
      const conteudo = Buffer.from(a.conteudoBase64, "base64");
      if (conteudo.length === 0 || conteudo.toString("base64").replace(/=+$/, "") !== a.conteudoBase64.replace(/=+$/, "")) {
        return res.status(400).json({ erro: "Payload inválido", detalhes: [`anexos.${i}.conteudoBase64: base64 malformado`] });
      }
      if (conteudo.length > LIMITE_ANEXO_BYTES) {
        return res.status(413).json({ erro: `Anexo "${sanitizarNome(a.nome)}" excede o limite de 5 MB` });
      }
      total += conteudo.length;
      const sha256 = createHash("sha256").update(conteudo).digest("hex");
      if (a.sha256 && a.sha256.toLowerCase() !== sha256) {
        return res.status(400).json({ erro: "Payload inválido", detalhes: [`anexos.${i}.sha256: não confere com o conteúdo`] });
      }
      anexos.push({ nome: sanitizarNome(a.nome), tipo: a.tipo, tamanho: conteudo.length, sha256, conteudo });
    }
    if (total > LIMITE_TOTAL_ANEXOS_BYTES) {
      return res.status(413).json({ erro: "Os anexos somam mais que o limite de 15 MB" });
    }

    const hash = hashConteudo(p, anexos);

    try {
      const resultado = db.transaction((): Resultado => {
        const atual = db
          .prepare("SELECT id, conteudo_hash, status FROM prestador_apontamentos_recebidos WHERE usuario_id = ? AND uuid_cliente = ?")
          .get(usuarioId, p.uuid) as { id: number; conteudo_hash: string; status: string } | undefined;
        if (atual) {
          if (atual.conteudo_hash === hash) {
            return { codigo: 200, corpo: { ok: true, idempotente: true, id: atual.id, status: atual.status } };
          }
          return { codigo: 409, corpo: { erro: "uuid já recebido com conteúdo diferente; gere um novo uuid" } };
        }
        const r = db
          .prepare(
            `INSERT INTO prestador_apontamentos_recebidos
               (uuid_cliente, usuario_id, tipo, imovel_ref, servico, data_servico, horas_minutos, valor_centavos, conteudo_hash)
             VALUES (?,?,?,?,?,?,?,?,?)`,
          )
          .run(p.uuid, usuarioId, p.tipo, p.imovelRef, p.servico, p.data, p.horasMinutos ?? null, p.valorCentavos ?? null, hash);
        const id = Number(r.lastInsertRowid);

        // Batch insert anexos to avoid N+1 queries
        if (anexos.length > 0) {
          const placeholders = anexos.map(() => "(?,?,?,?,?,?)").join(",");
          const insAnexo = db.prepare(
            `INSERT INTO prestador_apontamento_anexos (apontamento_id, nome, tipo, tamanho, sha256, conteudo) VALUES ${placeholders}`,
          );
          const flatParams: unknown[] = [];
          for (const a of anexos) {
            flatParams.push(id, a.nome, a.tipo, a.tamanho, a.sha256, a.conteudo);
          }
          insAnexo.run(...flatParams);
        }

        return { codigo: 201, corpo: { ok: true, idempotente: false, id, status: "recebido", anexos: anexos.length } };
      })();

      const conflito = resultado.codigo === 409;
      auditService.registrarAcao(contexto, "prestador_apontamento_recebido", "prestador_apontamento", String(resultado.corpo.id ?? p.uuid), {
        descricao: conflito
          ? "Apontamento do prestador recusado: uuid repetido com conteúdo diferente"
          : `Apontamento do prestador recebido (${anexos.length} anexo(s))${resultado.corpo.idempotente ? " — reenvio idempotente" : ""}`,
        valores_novos: { tipo: p.tipo, anexos: anexos.length },
        resultado: conflito ? "falha" : "sucesso",
        motivo_falha: conflito ? String(resultado.corpo.erro) : undefined,
        endereco_ip: req.ip,
        user_agent: req.get("user-agent") ?? undefined,
      });
      res.status(resultado.codigo).json(resultado.corpo);
    } catch (erro) {
      logger.error("Erro ao registrar apontamento:", {
        requestId: (req as unknown).id || "unknown",
        userId: usuarioId,
        endpoint: req.path,
        uuid: p.uuid,
        error: erro instanceof Error ? erro.message : String(erro),
      });
      return res.status(500).json({ erro: "Erro ao registrar apontamento" });
    }
  });

  router.get("/", exigirAutenticacao, exigirPrestador, (req, res) => {
    const pg = paginacao(req.query);
    if (!pg) {
      return res.status(400).json({ erro: "limite (1-100) e offset inválidos" });
    }
    const uid = req.auth!.usuario!.id;
    try {
      const total = (db.prepare("SELECT COUNT(*) AS n FROM prestador_apontamentos_recebidos WHERE usuario_id = ?").get(uid) as { n: number }).n;
      const linhas = db
        .prepare(`SELECT ${COLUNAS} FROM prestador_apontamentos_recebidos a WHERE a.usuario_id = ? ORDER BY a.id DESC LIMIT ? OFFSET ?`)
        .all(uid, pg.limite, pg.offset) as Array<{ id: number }>;

      // Batch load all annexes to avoid N+1 queries
      const apontamentoIds = linhas.map(l => l.id);
      const anexosPorApontamento: Map<number, Array<{ nome: string; tipo: string; tamanho: number; sha256: string }>> = new Map();

      if (apontamentoIds.length > 0) {
        const placeholders = apontamentoIds.map(() => "?").join(",");
        const stmt = db.prepare(
          `SELECT apontamento_id, nome, tipo, tamanho, sha256 FROM prestador_apontamento_anexos WHERE apontamento_id IN (${placeholders}) ORDER BY apontamento_id, id`
        );
        const todosAnexos = stmt.all(...apontamentoIds) as Array<{ apontamento_id: number; nome: string; tipo: string; tamanho: number; sha256: string }>;

        for (const anexo of todosAnexos) {
          if (!anexosPorApontamento.has(anexo.apontamento_id)) {
            anexosPorApontamento.set(anexo.apontamento_id, []);
          }
          anexosPorApontamento.get(anexo.apontamento_id)!.push({
            nome: anexo.nome,
            tipo: anexo.tipo,
            tamanho: anexo.tamanho,
            sha256: anexo.sha256,
          });
        }
      }

      const itens = linhas.map((l) => ({ ...l, anexos: anexosPorApontamento.get(l.id) ?? [] }));
      res.json({ itens, total, limite: pg.limite, offset: pg.offset });
    } catch (erro) {
      logger.error("Erro ao consultar apontamentos:", {
        requestId: (req as unknown).id || "unknown",
        userId: uid,
        endpoint: req.path,
        error: erro instanceof Error ? erro.message : String(erro),
      });
      return res.status(500).json({ erro: "Erro ao consultar apontamentos" });
    }
  });

  router.post("/:id/conferir", exigirAutenticacao, exigirInterno, (req, res) => {
    const contexto = req.auth as ContextoAutenticacao;
    if (!/^\d{1,12}$/.test(req.params.id)) {
      return res.status(404).json({ erro: "Recurso não encontrado" });
    }
    const id = Number(req.params.id);
    const parse = esquemaConferencia.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({
        erro: "Payload inválido",
        detalhes: parse.error.issues.map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`),
      });
    }
    const { status, motivo } = parse.data;

    try {
      const resultado = db.transaction((): Resultado => {
        const atual = db.prepare("SELECT status FROM prestador_apontamentos_recebidos WHERE id = ?").get(id) as { status: string } | undefined;
        if (!atual) return { codigo: 409, corpo: { naoEncontrado: true } };
        if (atual.status === status) return { codigo: 200, corpo: { ok: true, idempotente: true, id, status } };
        if (atual.status !== "recebido") {
          return { codigo: 409, corpo: { erro: `Apontamento já ${atual.status}; a decisão não pode ser alterada` } };
        }
        db.prepare(
          `UPDATE prestador_apontamentos_recebidos
              SET status = ?, conferido_por = ?, conferido_em = datetime('now'), motivo_rejeicao = ?
            WHERE id = ? AND status = 'recebido'`,
        ).run(status, contexto.usuario!.id, status === "rejeitado" ? motivo! : null, id);
        return { codigo: 200, corpo: { ok: true, idempotente: false, id, status } };
      })();

      if (resultado.corpo.naoEncontrado) {
        return res.status(404).json({ erro: "Recurso não encontrado" });
      }
      const conflito = resultado.codigo === 409;
      auditService.registrarAcao(contexto, "prestador_apontamento_conferencia", "prestador_apontamento", String(id), {
        descricao: conflito
          ? `Conferência recusada do apontamento ${id}`
          : `Apontamento ${id} marcado como ${status}${resultado.corpo.idempotente ? " — repetição idempotente" : ""}`,
        valores_novos: { status },
        resultado: conflito ? "falha" : "sucesso",
        motivo_falha: conflito ? String(resultado.corpo.erro) : undefined,
        endereco_ip: req.ip,
        user_agent: req.get("user-agent") ?? undefined,
      });
      res.status(resultado.codigo).json(resultado.corpo);
    } catch (erro) {
      logger.error("Erro ao conferir apontamento:", {
        requestId: (req as unknown).id || "unknown",
        userId: contexto.usuario?.id,
        endpoint: req.path,
        apontamentoId: id,
        error: erro instanceof Error ? erro.message : String(erro),
      });
      return res.status(500).json({ erro: "Erro ao conferir apontamento" });
    }
  });

  // Erros do parser (corpo grande demais / JSON malformado) em formato consistente.
  router.use((err: { type?: string; status?: number }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err?.type === "entity.too.large") {
      res.status(413).json({ erro: "Corpo da requisição excede o limite" });
      return;
    }
    if (err?.type === "entity.parse.failed") {
      res.status(400).json({ erro: "JSON inválido" });
      return;
    }
    next(err);
  });

  return router;
}
