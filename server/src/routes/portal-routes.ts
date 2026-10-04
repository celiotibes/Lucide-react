/**
 * Portal do inquilino — base servidor (espelho de leitura).
 *
 * A verdade contábil fica no banco do dono (sql.js). O app do dono PUBLICA aqui uma vitrine mínima
 * (ver migrations-phase14-portal-inquilino.sql) e o inquilino só LÊ o que é dele.
 *
 *  POST /api/portal/publicar          papéis internos; idempotente por (contratoRef, versao); auditado
 *  GET  /api/portal/meus-contratos    papel inquilino; paginado
 *  GET  /api/portal/minhas-cobrancas  papel inquilino; paginado; ?contratoRef= opcional
 *
 * Posse: o inquilino só enxerga contratos com `usuario_id` dele E concessão ativa em `acl_recursos`
 * (tipo 'contrato'). Sem concessão/posse a resposta é 404 — nunca 403 — para não revelar existência.
 * Linha de PIX/boleto não é copiada: vem de `asaas_cobrancas` na leitura (se a tabela existir), então
 * não há segunda fonte de verdade.
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

export interface PortalRoutesDeps {
  authService: AuthServiceDB;
  auditService: AuditTrailServiceDB;
  db: Database.Database;
}

const PAPEIS_INTERNOS = ["titular", "administrador", "contador", "perito", "advogado", "economista"];

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data deve ser YYYY-MM-DD");
const LIMITE_CENTAVOS = 10_000_000_000;

export const esquemaPublicacao = z
  .object({
    usuarioId: z.string().min(1).max(100),
    contratoRef: z.string().min(1).max(100),
    versao: z.number().int().min(1),
    imovelApelido: z.string().trim().min(1).max(120),
    valorAluguelCentavos: z.number().int().min(0).max(LIMITE_CENTAVOS),
    diaVencimento: z.number().int().min(1).max(31).nullable(),
    dataInicio: dataIso,
    dataFim: dataIso.nullable(),
    cobrancas: z
      .array(
        z
          .object({
            cobrancaRef: z.string().min(1).max(100),
            competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "competencia deve ser YYYY-MM"),
            vencimento: dataIso,
            valorCentavos: z.number().int().min(0).max(LIMITE_CENTAVOS),
            status: z.enum(["pendente", "paga", "vencida", "cancelada"]),
            dataPagamento: dataIso.nullable().optional(),
          })
          .strict(),
      )
      .max(600),
  })
  .strict()
  .refine((p) => new Set(p.cobrancas.map((c) => c.cobrancaRef)).size === p.cobrancas.length, {
    message: "cobrancaRef duplicada no payload",
    path: ["cobrancas"],
  });

export type PublicacaoPortal = z.infer<typeof esquemaPublicacao>;

/** Hash do conteúdo (sem a versão) — distingue reenvio idêntico (idempotente) de conteúdo diferente na mesma versão. */
function hashConteudo(p: PublicacaoPortal): string {
  const { cobrancas, ...resto } = p;
  const ordenadas = [...cobrancas]
    .sort((a, b) => a.cobrancaRef.localeCompare(b.cobrancaRef))
    .map((c) => ({ ...c, dataPagamento: c.dataPagamento ?? null }));
  return createHash("sha256")
    .update(JSON.stringify({ ...resto, cobrancas: ordenadas }))
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

export function criarRotasPortal({ authService, auditService, db }: PortalRoutesDeps): express.Router {
  const router = express.Router();
  const exigirAutenticacao = criarMiddlewareAutenticacao(authService, { permitirPapeisExternos: true });

  function exigirInterno(req: express.Request, res: express.Response, next: express.NextFunction): void {
    const contexto = req.auth as ContextoAutenticacao;
    if (!PAPEIS_INTERNOS.includes(contexto.usuario?.role ?? "")) {
      auditService.registrarAcessoNegado(contexto, "portal_publicacao", `${req.method} ${req.path}`, "papel externo não publica");
      res.status(403).json({ erro: "Sem permissão para esta operação" });
      return;
    }
    next();
  }

  function exigirInquilino(req: express.Request, res: express.Response, next: express.NextFunction): void {
    const contexto = req.auth as ContextoAutenticacao;
    if (contexto.usuario?.role !== "inquilino") {
      res.status(403).json({ erro: "Sem permissão para esta operação" });
      return;
    }
    next();
  }

  const tabelaAsaasExiste = (): boolean =>
    !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='asaas_cobrancas'").get();

  router.post("/publicar", exigirAutenticacao, exigirInterno, (req, res) => {
    const contexto = req.auth as ContextoAutenticacao;
    const parse = esquemaPublicacao.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({
        erro: "Payload inválido",
        detalhes: parse.error.issues.map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`),
      });
    }
    const p = parse.data;
    const hash = hashConteudo(p);

    try {
      const alvo = db.prepare("SELECT role FROM usuarios WHERE id = ?").get(p.usuarioId) as { role: string } | undefined;
      if (!alvo || alvo.role !== "inquilino") {
        return res.status(400).json({ erro: "usuarioId precisa ser um usuário existente com papel inquilino" });
      }

      const resultado = db.transaction((): Resultado => {
        const atual = db
          .prepare("SELECT usuario_id, versao, conteudo_hash FROM portal_inquilino_contratos WHERE contrato_ref = ?")
          .get(p.contratoRef) as { usuario_id: string; versao: number; conteudo_hash: string } | undefined;

        if (atual) {
          if (p.versao < atual.versao) {
            return { codigo: 409, corpo: { erro: `Versão obsoleta (publicada: ${atual.versao})` } };
          }
          if (p.versao === atual.versao) {
            if (atual.usuario_id === p.usuarioId && atual.conteudo_hash === hash) {
              return { codigo: 200, corpo: { ok: true, idempotente: true, contratoRef: p.contratoRef, versao: atual.versao } };
            }
            return { codigo: 409, corpo: { erro: "Versão já publicada com conteúdo diferente; incremente a versão" } };
          }
          db.prepare(
            `UPDATE portal_inquilino_contratos
                SET usuario_id=?, imovel_apelido=?, valor_aluguel_centavos=?, dia_vencimento=?, data_inicio=?, data_fim=?,
                    versao=?, conteudo_hash=?, publicado_por=?, publicado_em=datetime('now')
              WHERE contrato_ref=?`,
          ).run(p.usuarioId, p.imovelApelido, p.valorAluguelCentavos, p.diaVencimento, p.dataInicio, p.dataFim, p.versao, hash, contexto.usuario!.id, p.contratoRef);
          db.prepare("DELETE FROM portal_inquilino_cobrancas WHERE contrato_ref = ?").run(p.contratoRef);
        } else {
          db.prepare(
            `INSERT INTO portal_inquilino_contratos
               (usuario_id, contrato_ref, imovel_apelido, valor_aluguel_centavos, dia_vencimento, data_inicio, data_fim, versao, conteudo_hash, publicado_por)
             VALUES (?,?,?,?,?,?,?,?,?,?)`,
          ).run(p.usuarioId, p.contratoRef, p.imovelApelido, p.valorAluguelCentavos, p.diaVencimento, p.dataInicio, p.dataFim, p.versao, hash, contexto.usuario!.id);
        }

        const ins = db.prepare(
          `INSERT INTO portal_inquilino_cobrancas
             (contrato_ref, cobranca_ref, competencia, vencimento, valor_centavos, status, data_pagamento)
           VALUES (?,?,?,?,?,?,?)`,
        );
        for (const c of p.cobrancas) {
          ins.run(p.contratoRef, c.cobrancaRef, c.competencia, c.vencimento, c.valorCentavos, c.status, c.dataPagamento ?? null);
        }
        return {
          codigo: atual ? 200 : 201,
          corpo: { ok: true, idempotente: false, contratoRef: p.contratoRef, versao: p.versao, cobrancas: p.cobrancas.length },
        };
      })();

      const falhou = resultado.codigo === 409;
      auditService.registrarAcao(contexto, "portal_publicacao", "portal_contrato", p.contratoRef, {
        descricao: falhou
          ? `Publicação do portal recusada (${p.contratoRef} v${p.versao})`
          : `Publicação do portal: contrato ${p.contratoRef} v${p.versao} (${p.cobrancas.length} cobrança(s))${resultado.corpo.idempotente ? " — reenvio idempotente" : ""}`,
        valores_novos: { versao: p.versao, cobrancas: p.cobrancas.length },
        resultado: falhou ? "falha" : "sucesso",
        motivo_falha: falhou ? String(resultado.corpo.erro) : undefined,
        endereco_ip: req.ip,
        user_agent: req.get("user-agent") ?? undefined,
      });
      res.status(resultado.codigo).json(resultado.corpo);
    } catch (erro) {
      logger.error("Erro ao publicar espelho do portal:", {
        requestId: (req as unknown as Record<string, unknown>).id || "unknown",
        userId: contexto.usuario?.id,
        endpoint: req.path,
        contratoRef: (req.body as unknown as Record<string, unknown>)?.contratoRef,
        error: erro instanceof Error ? erro.message : String(erro),
      });
      return res.status(500).json({ erro: "Erro ao publicar espelho do portal" });
    }
  });

  /** Contratos que o usuário possui: dele E com concessão ativa em acl_recursos. */
  const FILTRO_POSSE = `c.usuario_id = ? AND EXISTS (
      SELECT 1 FROM acl_recursos a
       WHERE a.usuario_id = c.usuario_id AND a.tipo_recurso = 'contrato'
         AND a.recurso_id = c.contrato_ref AND a.revogado_em IS NULL)`;

  router.get("/meus-contratos", exigirAutenticacao, exigirInquilino, (req, res) => {
    const pg = paginacao(req.query);
    if (!pg) {
      return res.status(400).json({ erro: "limite (1-100) e offset inválidos" });
    }
    const uid = req.auth!.usuario!.id;
    try {
      const total = (db.prepare(`SELECT COUNT(*) AS n FROM portal_inquilino_contratos c WHERE ${FILTRO_POSSE}`).get(uid) as { n: number }).n;
      if (total === 0) {
        return res.status(404).json({ erro: "Recurso não encontrado" });
      }
      const itens = db
        .prepare(
          `SELECT c.contrato_ref AS contratoRef, c.imovel_apelido AS imovelApelido,
                  c.valor_aluguel_centavos AS valorAluguelCentavos, c.dia_vencimento AS diaVencimento,
                  c.data_inicio AS dataInicio, c.data_fim AS dataFim, c.publicado_em AS publicadoEm, c.versao
             FROM portal_inquilino_contratos c WHERE ${FILTRO_POSSE}
            ORDER BY c.data_inicio DESC, c.id DESC LIMIT ? OFFSET ?`,
        )
        .all(uid, pg.limite, pg.offset);
      res.json({ itens, total, limite: pg.limite, offset: pg.offset });
    } catch (erro) {
      logger.error("Erro ao consultar contratos:", {
        requestId: (req as unknown as Record<string, unknown>).id || "unknown",
        userId: ((req.auth as unknown) as Record<string, unknown>)?.usuario?.id,
        endpoint: req.path,
        error: erro instanceof Error ? erro.message : String(erro),
      });
      return res.status(500).json({ erro: "Erro ao consultar contratos" });
    }
  });

  router.get("/minhas-cobrancas", exigirAutenticacao, exigirInquilino, (req, res) => {
    const pg = paginacao(req.query);
    const contratoRef = req.query.contratoRef;
    if (!pg || (contratoRef !== undefined && (typeof contratoRef !== "string" || !contratoRef))) {
      return res.status(400).json({ erro: "parâmetros de consulta inválidos" });
    }
    const uid = req.auth!.usuario!.id;
    const filtroContrato = typeof contratoRef === "string" ? " AND c.contrato_ref = ?" : "";
    const params: (string | number)[] = typeof contratoRef === "string" ? [uid, contratoRef] : [uid];
    try {
      // 404 quando o inquilino não tem posse de nenhum contrato (ou do contratoRef pedido);
      // contrato próprio sem cobranças devolve lista vazia.
      const possui = (
        db.prepare(`SELECT COUNT(*) AS n FROM portal_inquilino_contratos c WHERE ${FILTRO_POSSE}${filtroContrato}`).get(...params) as { n: number }
      ).n;
      if (possui === 0) {
        return res.status(404).json({ erro: "Recurso não encontrado" });
      }
      const total = (
        db
          .prepare(
            `SELECT COUNT(*) AS n FROM portal_inquilino_cobrancas b
               JOIN portal_inquilino_contratos c ON c.contrato_ref = b.contrato_ref
              WHERE ${FILTRO_POSSE}${filtroContrato}`,
          )
          .get(...params) as { n: number }
      ).n;
      const abertas = `x.aluguel_id = b.cobranca_ref AND x.status IN ('pendente','processando','aberta','vencida')`;
      const pix = tabelaAsaasExiste()
        ? `, (SELECT x.qr_code_pix FROM asaas_cobrancas x WHERE ${abertas} ORDER BY x.data_criacao DESC LIMIT 1) AS qrCodePix,
             (SELECT x.linha_digitavel FROM asaas_cobrancas x WHERE ${abertas} ORDER BY x.data_criacao DESC LIMIT 1) AS linhaDigitavel`
        : "";
      const itens = db
        .prepare(
          `SELECT b.contrato_ref AS contratoRef, b.cobranca_ref AS cobrancaRef, b.competencia, b.vencimento,
                  b.valor_centavos AS valorCentavos, b.status, b.data_pagamento AS dataPagamento${pix}
             FROM portal_inquilino_cobrancas b
             JOIN portal_inquilino_contratos c ON c.contrato_ref = b.contrato_ref
            WHERE ${FILTRO_POSSE}${filtroContrato}
            ORDER BY b.vencimento DESC, b.id DESC LIMIT ? OFFSET ?`,
        )
        .all(...params, pg.limite, pg.offset);
      res.json({ itens, total, limite: pg.limite, offset: pg.offset });
    } catch (erro) {
      logger.error("Erro ao consultar cobranças:", {
        requestId: (req as unknown as Record<string, unknown>).id || "unknown",
        userId: ((req.auth as unknown) as Record<string, unknown>)?.usuario?.id,
        endpoint: req.path,
        contratoRef: req.query.contratoRef,
        error: erro instanceof Error ? erro.message : String(erro),
      });
      return res.status(500).json({ erro: "Erro ao consultar cobranças" });
    }
  });

  return router;
}
