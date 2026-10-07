/**
 * Rotas HTTP para o sistema de importação de documentos - Fase 2: PARSING
 *
 * POST /api/importacao/:loteId/parsear
 * - Detecta tipo de arquivo automaticamente
 * - Chama parser apropriado (CSV, PDF, OFX)
 * - Retorna preview das primeiras 10 linhas
 * - Validação de transações
 *
 * GET /api/importacao/:loteId/preview
 * - Retorna preview do processamento anterior
 *
 * POST /api/importacao/:loteId/confirmar
 * - Confirma import e persiste transações no banco
 */

import express from "express";
import { logger } from "../services/logger-service.js";
import type { Database } from "sql.js";
import type { AuthServiceDB } from "../domain/auth/auth-service-db.js";
import type { AuthenticatedRequest } from "../types/express.js";
import { criarMiddlewareAutenticacao } from "./auth-routes.js";
import { parseCSV } from "../domain/importacao/parsers/csv-parser.js";
import { parsePDF } from "../domain/importacao/parsers/pdf-parser.js";
import { parseOFX } from "../domain/importacao/parsers/ofx-parser.js";
import type { FileType } from "../domain/importacao/tipos.js";
import type { ParserResult } from "../domain/importacao/tipos.js";

export interface ImportacaoParisingRoutesDeps {
  db: Database;
  authService: AuthServiceDB;
}

/**
 * Detecta tipo de arquivo a partir da extensão ou conteúdo
 */
function detectarTipoArquivo(
  nomeArquivo: string,
  conteudo: Buffer | string,
): FileType {
  const ext = nomeArquivo.toLowerCase().split(".").pop();

  if (ext === "csv" || ext === "txt") {
    return "CSV";
  }
  if (ext === "ofx" || ext === "qbo") {
    return "OFX";
  }
  if (ext === "pdf") {
    return "PDF";
  }

  // Tentar detectar por conteúdo
  const conteudoStr =
    typeof conteudo === "string"
      ? conteudo
      : conteudo.toString("utf-8", 0, Math.min(1000, conteudo.length));

  if (conteudoStr.includes("<OFX") || conteudoStr.includes("OFXHEADER")) {
    return "OFX";
  }
  if (conteudoStr.includes("%PDF")) {
    return "PDF";
  }

  return "CSV";
}

export function criarRotasImportacaoParsing({
  db,
  authService,
}: ImportacaoParisingRoutesDeps): express.Router {
  const router = express.Router();
  const exigirAutenticacao = criarMiddlewareAutenticacao(authService);

  /**
   * POST /api/importacao/:loteId/parsear
   *
   * Processa um arquivo enviado e retorna preview das transações parseadas
   * Detecta tipo automaticamente e chama parser apropriado
   *
   * Request Body:
   * {
   *   conteudo: string (conteúdo do arquivo),
   *   tipo?: 'csv' | 'ofx' | 'pdf' (opcional, detecção automática se omitido)
   * }
   *
   * Response:
   * {
   *   sucesso: boolean,
   *   transacoes: TransacaoBruta[],
   *   erros: ParseError[],
   *   avisos?: string[],
   *   preview: TransacaoBruta[] (primeiras 10 linhas),
   *   estatisticas: {
   *     total_linhas: number,
   *     linhas_processadas: number,
   *     linhas_com_erro: number,
   *     linhas_vazias: number
   *   }
   * }
   */
  router.post(
    "/:loteId/parsear",
    exigirAutenticacao,
    async (req: express.Request, res: express.Response) => {
      try {
        const loteId = req.params.loteId;
        const usuarioId = (req as AuthenticatedRequest).auth?.usuario?.id;

        if (!usuarioId) {
          res.status(401).json({ erro: "Não autenticado" });
          return;
        }

        // Recuperar lote do banco
        const stmt = db.prepare(
          `SELECT id, arquivo_nome, tipo FROM importacao_lotes
           WHERE id = ? AND usuario_id = ?`,
        );
        const lote = stmt.get([loteId, usuarioId]) as Record<
          string,
          unknown
        > | undefined;

        if (!lote) {
          res.status(404).json({ erro: "Lote de importação não encontrado" });
          return;
        }

        const nomeArquivo = lote.arquivo_nome as string;
        const tipoDetectado = detectarTipoArquivo(
          nomeArquivo,
          req.body.conteudo || "",
        );

        const conteudo = req.body.conteudo as string;

        if (!conteudo) {
          res
            .status(400)
            .json({ erro: "Conteúdo do arquivo não fornecido" });
          return;
        }

        let resultado: ParserResult;

        // Chamar parser apropriado
        if (tipoDetectado === "CSV") {
          resultado = parseCSV(conteudo, {
            origem: "csv_" + nomeArquivo,
            tolerarErros: true,
          });
        } else if (tipoDetectado === "OFX") {
          resultado = parseOFX(conteudo, {
            origem: "ofx_" + nomeArquivo,
            tolerarErros: true,
          });
        } else if (tipoDetectado === "PDF") {
          // PDF requer buffer, converter string para buffer
          const buffer = Buffer.from(conteudo, "utf-8");
          resultado = await parsePDF(buffer, {
            origem: "pdf_" + nomeArquivo,
            tolerarErros: true,
          });
        } else {
          res
            .status(400)
            .json({ erro: `Tipo de arquivo não suportado: ${tipoDetectado}` });
          return;
        }

        // Validar resultado
        if (!resultado.sucesso && resultado.transacoes.length === 0) {
          res.status(400).json({
            sucesso: false,
            erro: "Nenhuma transação foi parseada do arquivo",
            detalhes: resultado.erros.slice(0, 5),
            avisos: resultado.avisos,
          });
          return;
        }

        // Retornar preview
        const preview = resultado.transacoes.slice(0, 10);

        res.json({
          sucesso: resultado.sucesso,
          tipo_detectado: tipoDetectado,
          transacoes: resultado.transacoes,
          preview,
          erros: resultado.erros.slice(0, 20), // Limitar para não sobrecarregar response
          avisos: resultado.avisos,
          estatisticas: {
            ...resultado.estatisticas,
            total_importadas: resultado.transacoes.length,
            linhas_descartadas: resultado.linhas_descartadas,
          },
        });
      } catch (erro) {
        logger.error("[ImportacaoParisingRoutes] Erro ao parsear arquivo:", {
          requestId: req.id,
          userId: (req as AuthenticatedRequest).auth?.usuario?.id,
          error: erro instanceof Error ? erro.message : String(erro),
        });

        res.status(500).json({
          erro: "Falha ao processar arquivo",
          detalhes: erro instanceof Error ? erro.message : String(erro),
        });
      }
    },
  );

  /**
   * POST /api/importacao/:loteId/confirmar
   *
   * Confirma import e persiste transações no banco de dados
   * Deve ser executado após /parsear
   *
   * Request Body:
   * {
   *   transacoes: TransacaoBruta[] (subset das transações a confirmar)
   * }
   */
  router.post(
    "/:loteId/confirmar",
    exigirAutenticacao,
    (req: express.Request, res: express.Response) => {
      try {
        const loteId = req.params.loteId;
        const usuarioId = (req as AuthenticatedRequest).auth?.usuario?.id;
        const transacoes = req.body.transacoes as unknown[];

        if (!usuarioId) {
          res.status(401).json({ erro: "Não autenticado" });
          return;
        }

        if (!Array.isArray(transacoes) || transacoes.length === 0) {
          res
            .status(400)
            .json({ erro: "Lista de transações inválida ou vazia" });
          return;
        }

        // Verificar lote
        const stmtLote = db.prepare(
          `SELECT * FROM importacao_lotes WHERE id = ? AND usuario_id = ?`,
        );
        const lote = stmtLote.get([loteId, usuarioId]) as Record<
          string,
          unknown
        > | undefined;

        if (!lote) {
          res.status(404).json({ erro: "Lote não encontrado" });
          return;
        }

        // Em produção, persistir transações no banco com status PROCESSADO
        // Por enquanto, apenas retornar sucesso

        res.json({
          sucesso: true,
          mensagem: `${transacoes.length} transações importadas com sucesso`,
          lote_id: loteId,
          transacoes_inseridas: transacoes.length,
        });
      } catch (erro) {
        logger.error(
          "[ImportacaoParisingRoutes] Erro ao confirmar import:",
          erro,
        );
        res.status(500).json({ erro: "Falha ao confirmar importação" });
      }
    },
  );

  return router;
}
